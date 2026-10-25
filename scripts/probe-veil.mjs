import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 通过真实代理链路验证 veil 端点的加密与签名。
 * RSA/AUTH 密钥从 .env 读取，目标地址由参数传入，源码不留任何服务器信息。
 */

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) throw new Error('.env not found');
  const result = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    result[key] = val.replace(/\\n/g, '\n');
  }
  return result;
}

const env = loadEnv();
const BASE = (process.argv[2] || '').replace(/\/$/, '');
const LICENSE_KEY = process.argv[3] || '';

if (!BASE) {
  console.error('用法: node scripts/probe-veil.mjs <baseUrl> <licenseKey>');
  process.exit(2);
}

const rsaPub = env.RSA_PUBLIC_KEY
  || crypto.createPublicKey(env.RSA_PRIVATE_KEY).export({ type: 'spki', format: 'pem' }).toString();
const authPub = env.AUTH_PUBLIC_KEY;

function sealRequest(body, pem) {
  const sessionKey = crypto.randomBytes(32);
  const encrypted = crypto.publicEncrypt(
    { key: pem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    sessionKey
  );
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(body), 'utf8')), cipher.final()]);
  return {
    wire: {
      v: 2,
      envelope: encrypted.toString('base64'),
      payload: `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ct.toString('hex')}`,
    },
    sessionKey,
  };
}

function openResponse(wirePayload, sessionKey) {
  const parts = wirePayload.split(':');
  if (parts.length !== 3) throw new Error('响应格式无效');
  const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, Buffer.from(parts[0], 'hex'));
  decipher.setAuthTag(Buffer.from(parts[1], 'hex'));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(parts[2], 'hex')),
    decipher.final(),
  ]).toString('utf8'));
}

function openEnvelope(envelope, cardKey, hwid) {
  const nonce = Buffer.from(envelope.nonceHex, 'hex');
  const ciphertext = Buffer.from(envelope.cipherHex, 'hex');
  const tag = Buffer.from(envelope.tagHex, 'hex');
  const signature = Buffer.from(envelope.signatureHex, 'hex');

  const stamp = Buffer.alloc(8);
  stamp.writeBigUInt64LE(BigInt(envelope.issuedAt), 0);

  const verified = crypto.verify(
    null,
    Buffer.concat([stamp, nonce, ciphertext, tag]),
    crypto.createPublicKey(authPub),
    signature
  );
  if (!verified) return { verified: false };

  const hwidBytes = Buffer.from(hwid, 'utf8');
  const evidence = Buffer.alloc(16);
  const info = Buffer.concat([evidence, Buffer.from([hwidBytes.length]), hwidBytes, Buffer.from([0x01])]);
  const sessionKey = Buffer.from(crypto.hkdfSync('sha256', Buffer.from(cardKey, 'utf8'), nonce, info, 32));

  const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, nonce);
  decipher.setAAD(Buffer.concat([stamp, nonce, Buffer.from([0x01])]));
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return {
    verified: true,
    issuedAt: Number(plain.readBigUInt64LE(0)),
    expiresAt: Number(plain.readBigUInt64LE(8)),
    custom: plain.length > 16 ? plain.subarray(16).toString('utf8') : null,
  };
}

async function main() {
  const hwid = 'HW-PROXY-PROBE-001';
  const plain = {
    licenseKey: LICENSE_KEY,
    softwareName: process.argv[4] || 'Nicko',
    hwid,
    deviceName: 'ProxyProbe',
    nonce: crypto.randomUUID().replace(/-/g, ''),
    timestamp: Date.now(),
    evidence: Buffer.alloc(16).toString('hex'),
    evidenceLayout: '1',
    versionCode: 100,
  };

  // 明文请求必须被拒绝，返回形如 v2 的乱文
  const plainResp = await fetch(`${BASE}/api/license-verification/veil`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(plain),
  });
  const plainJson = await plainResp.json();
  const plainRejected = plainResp.status === 200
    && plainJson.v === 2
    && typeof plainJson.payload === 'string'
    && !plainJson.success;
  console.log('明文请求被拒绝:', plainRejected ? 'PASS' : `FAIL ${JSON.stringify(plainJson).slice(0, 120)}`);

  // 无线索断言：报文里不应出现卡密与 HWID 明文
  const { wire, sessionKey } = sealRequest(plain, rsaPub);
  const wireStr = JSON.stringify(wire);
  console.log('卡密未出现在报文中:', !wireStr.includes(LICENSE_KEY) ? 'PASS' : 'FAIL');
  console.log('HWID 未出现在报文中:', !wireStr.includes(hwid) ? 'PASS' : 'FAIL');

  const resp = await fetch(`${BASE}/api/license-verification/veil`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: wireStr,
  });
  console.log('HTTP:', resp.status);

  const respJson = await resp.json();
  if (typeof respJson.payload !== 'string') {
    console.log('加密响应: FAIL，服务端未返回可解密载荷');
    console.log(JSON.stringify(respJson).slice(0, 200));
    process.exit(1);
  }
  console.log('加密响应: PASS');

  const body = openResponse(respJson.payload, sessionKey);
  const data = body.data || body;

  if (!data.success) {
    console.log('业务结果: 拒绝', data.code, data.message);
    return;
  }

  console.log('业务结果: 通过', data.licenseKey);

  if (body.signature) {
    const ok = crypto.verify(
      null,
      Buffer.from(JSON.stringify(data), 'utf8'),
      crypto.createPublicKey(authPub),
      Buffer.from(body.signature, 'hex')
    );
    console.log('外层签名:', ok ? 'PASS' : 'FAIL');
    if (!ok) process.exit(1);
  } else {
    console.log('外层签名: FAIL 缺失');
    process.exit(1);
  }

  if (data.envelope) {
    const opened = openEnvelope(data.envelope, LICENSE_KEY, hwid);
    console.log('信封签名:', opened.verified ? 'PASS' : 'FAIL');
    if (opened.verified) {
      console.log('载荷状态位:', opened.custom);
    }
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
