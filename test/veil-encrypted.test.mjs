import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import {
  createVeilRequest,
  sealVeilRequest,
  openSealedVeilResponse,
  openVeilResponse,
  LicenseClient,
} from '../test-client/client.mjs';
import {
  composeLicensePayload,
  attachStatusFlags,
  encodeStatusFlags,
  LICENSE_FLAG_ACTIVE,
  LICENSE_FLAG_REVOKED,
  LICENSE_FLAG_HWID_BOUND,
  LICENSE_FLAGS_KEY,
} from '../lib/payload-seal.ts';
import { sealEnvelope, openEnvelope } from '../lib/veil-envelope.ts';

const RSA_OAEP = {
  padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: 'sha256',
};

/** 复刻服务端的信封解包，用于断言客户端封包与服务端双向对称 */
function openVeilRequestEnvelope(wire, rsaPrivateKey) {
  const sessionKey = crypto.privateDecrypt(
    { key: rsaPrivateKey, ...RSA_OAEP },
    Buffer.from(wire.envelope, 'base64')
  );
  const [ivHex, tagHex, ctHex] = wire.payload.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ctHex, 'hex')),
    decipher.final(),
  ]);
  return { sessionKey, body: JSON.parse(plain.toString('utf8')) };
}

function sealVeilResponse(body, sessionKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(body), 'utf8')), cipher.final()]);
  return {
    v: 2,
    payload: `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ct.toString('hex')}`,
  };
}

function makeKeys() {
  const rsa = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const ed = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { rsa, ed };
}

test('sealed veil request decrypts to the same body as plaintext', () => {
  const { rsa } = makeKeys();
  const plain = createVeilRequest({
    licenseKey: 'CARD-SEAL-1',
    softwareName: 'Nicko',
    hwid: 'HW-SEAL-1',
    layoutId: '1',
  });

  const { wire, sessionKey } = sealVeilRequest(plain, rsa.publicKey);
  const opened = openVeilRequestEnvelope(wire, rsa.privateKey);

  assert.equal(opened.sessionKey.length, 32);
  assert.deepEqual(opened.sessionKey, sessionKey);
  // JSON 序列化会丢弃 undefined 字段，比较时按同样规则归一
  assert.deepEqual(opened.body, JSON.parse(JSON.stringify(plain)));
});

test('sealed veil response round trips and exposes signed fields', () => {
  const { rsa } = makeKeys();
  const { sessionKey } = sealVeilRequest(
    createVeilRequest({ licenseKey: 'C', softwareName: 'S', hwid: 'H' }),
    rsa.publicKey
  );

  const signedBody = {
    data: { success: true, status: 'active', licenseKey: 'CARD-SEAL-1' },
    signature: 'ab'.repeat(64),
  };

  const wire = sealVeilResponse(signedBody, sessionKey);
  const opened = openSealedVeilResponse(wire.payload, sessionKey);

  assert.deepEqual(opened, signedBody);
});

test('full veil round trip over HTTP with encryption and signature', async () => {
  const { rsa, ed } = makeKeys();
  const { privateKey: rsaPrivate } = rsa;

  const server = http.createServer(async (req, res) => {
    if (req.url !== '/api/license-verification/veil' || req.method !== 'POST') {
      res.writeHead(404).end();
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const wire = JSON.parse(Buffer.concat(chunks).toString('utf8'));

    // 断言请求确实是密文，明文卡密不得出现在线上报文里
    const rawWire = JSON.stringify(wire);
    assert.ok(!rawWire.includes('HW-SEAL-ROUND'), 'hwid must not appear in wire');
    assert.equal(wire.v, 2);

    const { sessionKey, body } = openVeilRequestEnvelope(wire, rsaPrivate);

    const flags = encodeStatusFlags('active', true);
    const payload = composeLicensePayload({
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600_000,
      customPayload: attachStatusFlags(JSON.stringify({ tier: 'pro' }), flags),
    });

    const sealed = sealEnvelope(
      payload,
      { cardKey: body.licenseKey, hwid: body.hwid, evidence: Buffer.alloc(16), domain: 0x01 },
      ed.privateKey
    );

    const data = {
      success: true,
      licenseKey: body.licenseKey,
      username: 'roundtrip',
      softwareName: body.softwareName,
      status: 'active',
      sessionId: 'sess-roundtrip',
      heartbeatInterval: 30,
      envelope: sealed,
      timestamp: Date.now(),
    };

    const signature = crypto
      .sign(null, Buffer.from(JSON.stringify(data), 'utf8'), ed.privateKey)
      .toString('hex');

    const wireResp = sealVeilResponse({ data, signature }, sessionKey);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(wireResp));
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const client = new LicenseClient({
      protocol: 'veil',
      url: `http://127.0.0.1:${port}`,
      licenseKey: 'CARD-SEAL-ROUND',
      softwareName: 'Nicko',
      hwid: 'HW-SEAL-ROUND',
      rsaPublicKey: rsa.publicKey,
      authPublicKey: ed.publicKey,
      silent: true,
    });

    const result = await client.verify();
    assert.ok(result.signatureVerified, 'outer signature must verify');
    assert.equal(result.data.sessionId, 'sess-roundtrip');
    assert.equal(client.statusFlags, LICENSE_FLAG_ACTIVE | LICENSE_FLAG_HWID_BOUND);

    // 载荷内的状态位与自定义字段都应解出
    assert.equal(client.customJson[LICENSE_FLAGS_KEY], LICENSE_FLAG_ACTIVE | LICENSE_FLAG_HWID_BOUND);
    assert.equal(client.customJson.tier, 'pro');
  } finally {
    server.close();
  }
});

test('revoked flag reaches the client inside the signed payload', async () => {
  const { rsa, ed } = makeKeys();

  const payload = composeLicensePayload({
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    customPayload: attachStatusFlags(null, encodeStatusFlags('revoked', false)),
  });

  const sealed = sealEnvelope(
    payload,
    { cardKey: 'CARD-REVOKED', hwid: 'HW-REVOKED', evidence: Buffer.alloc(16), domain: 0x01 },
    ed.privateKey
  );

  const opened = openEnvelope(
    sealed,
    { cardKey: 'CARD-REVOKED', hwid: 'HW-REVOKED', evidence: Buffer.alloc(16), domain: 0x01 },
    ed.publicKey
  );

  assert.ok(opened);
  const customJson = JSON.parse(opened.subarray(16).toString('utf8'));
  assert.equal(customJson[LICENSE_FLAGS_KEY], LICENSE_FLAG_REVOKED);

  // 篡改密文后状态位不可恢复，说明状态确实在签名保护范围内
  const tampered = { ...sealed, cipherHex: 'ff' + sealed.cipherHex.slice(2) };
  const tamperedOpen = openEnvelope(
    tampered,
    { cardKey: 'CARD-REVOKED', hwid: 'HW-REVOKED', evidence: Buffer.alloc(16), domain: 0x01 },
    ed.publicKey
  );
  assert.equal(tamperedOpen, null);
});
