// C++ 客户端协议测试服务器：以与生产 lib/secure-protocol.ts 完全一致的
// 信封加密 + Ed25519 签名逻辑，在本地验证 C++ 客户端（CNG + TweetNaCl）互通性。
//
//   node test-server.js            （默认 127.0.0.1:3080）
//   license-client.exe http://127.0.0.1:3080 <licenseKey> test
//
// 需要项目根目录 .env 中已配置 RSA_PRIVATE_KEY / AUTH_PRIVATE_KEY。

const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
function envKey(name) {
  const m = env.match(new RegExp(`^${name}="([\\s\\S]*?)"$`, 'm'));
  return m ? m[1].replace(/\\n/g, '\n') : null;
}

const RSA_PRIVATE_KEY = envKey('RSA_PRIVATE_KEY');
const ED_PRIVATE_KEY = envKey('AUTH_PRIVATE_KEY');
if (!RSA_PRIVATE_KEY || !ED_PRIVATE_KEY) {
  console.error('缺少 RSA_PRIVATE_KEY / AUTH_PRIVATE_KEY');
  process.exit(1);
}

const EXPECTED_KEY = process.argv[2] || '23A01203-7D49D1C6-248B70CA-62E99DC0';
const EXPECTED_SOFTWARE = process.argv[3] || 'test';

// ── 与 lib/secure-protocol.ts 相同的实现 ──

function decryptEnvelope(raw) {
  try {
    const obj = raw ?? {};
    if (obj.v !== 2 || typeof obj.envelope !== 'string' || typeof obj.payload !== 'string') return null;

    const sessionKey = crypto.privateDecrypt(
      { key: RSA_PRIVATE_KEY, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(obj.envelope, 'base64')
    );
    if (sessionKey.length !== 32) return null;

    const parts = obj.payload.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, ctHex] = parts;
    if (ivHex.length !== 24 || tagHex.length !== 32 || !/^[0-9a-f]+$/.test(ctHex)) return null;

    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]);
    return { body: JSON.parse(plaintext.toString('utf8')), sessionKey };
  } catch {
    return null;
  }
}

function encryptResponse(sessionKey, data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return {
    v: 2,
    payload: `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`,
  };
}

// sign-then-encrypt：签名必须覆盖 data 的原始字节（C++ 端按子串提取后验签）
function signedEncrypted(sessionKey, dataObj) {
  const dataStr = JSON.stringify(dataObj);
  const sig = crypto.sign(null, Buffer.from(dataStr, 'utf8'), ED_PRIVATE_KEY);
  const plaintext = `{"data":${dataStr},"signature":"${sig.toString('hex')}"}`;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    v: 2,
    payload: `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`,
  };
}

function opaqueResponse() {
  return {
    v: 2,
    payload: `${crypto.randomBytes(12).toString('hex')}:${crypto.randomBytes(16).toString('hex')}:${crypto.randomBytes(128).toString('hex')}`,
  };
}

// ── 路由 ──

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let raw = null;
    try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}

    const decrypted = decryptEnvelope(raw);
    if (!decrypted) {
      console.log(`[mock] ${req.url} → opaque（信封无效）`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(opaqueResponse()));
      return;
    }
    const { body, sessionKey } = decrypted;
    const enc = (obj) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(encryptResponse(sessionKey, obj)));
    };

    console.log(`[mock] ${req.url} 解密成功: ${JSON.stringify(body)}`);

    if (req.url === '/api/license-verification/verify') {
      if (!body.nonce || !body.timestamp) {
        return enc({ error: 'Anti-replay validation failed', reason: 'Missing required nonce or timestamp' });
      }
      if (body.licenseKey !== EXPECTED_KEY) {
        return enc({ error: 'Invalid license key', message: '许可证不存在或无效。' });
      }
      if (body.softwareName !== EXPECTED_SOFTWARE) {
        return enc({ error: 'Software name mismatch', message: '许可证软件不匹配。' });
      }
      return enc2(signedEncrypted(sessionKey, {
        valid: true,
        licenseKey: body.licenseKey,
        username: 'mock-user',
        softwareName: EXPECTED_SOFTWARE,
        expirationDate: '2027-12-31T23:59:59.000Z',
        hardwareBindingEnabled: true,
        status: 'active',
        sessionId: 'sess_mock_' + crypto.randomBytes(8).toString('hex'),
        heartbeatInterval: 5,
        timestamp: Date.now(),
      }));
    }

    if (req.url === '/api/license-verification/heartbeat') {
      if (!body.nonce || !body.timestamp) {
        return enc({ error: 'Anti-replay validation failed', reason: 'Missing required nonce or timestamp' });
      }
      if (!body.sessionId) {
        return enc({ error: 'Session ID is required' });
      }
      return enc2(signedEncrypted(sessionKey, {
        status: 'active',
        sessionId: body.sessionId,
        heartbeatInterval: 5,
        timestamp: Date.now(),
      }));
    }

    if (req.url === '/api/software/check-update') {
      return enc({
        hasUpdate: true,
        latestVersion: {
          version: '2.0.0',
          versionCode: 200,
          changelog: 'mock changelog',
          downloadUrl: 'https://example.com/mock.exe',
          fileHash: 'deadbeef',
          isForced: false,
          releasedAt: '2026-08-27T00:00:00.000Z',
        },
      });
    }

    res.writeHead(404);
    res.end('{}');

    function enc2(wire) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(wire));
    }
  });
});

server.listen(3080, '127.0.0.1', () => {
  console.log(`[mock] 协议测试服务器就绪: http://127.0.0.1:3080`);
  console.log(`[mock] 期望卡密: ${EXPECTED_KEY} / 软件: ${EXPECTED_SOFTWARE} / 心跳间隔: 5s`);
});
