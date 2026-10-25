import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  createV2VerifyPayload,
  decryptV2Response,
  createVeilRequest,
  openVeilResponse,
  decodeLicensePayload,
  deriveV2KeyStream,
  computeV2Binding,
} from '../test-client/client.mjs';

test('decodeLicensePayload decodes 16 byte binary payload', () => {
  const buf = Buffer.alloc(16);
  const now = Date.now();
  const expire = now + 86400000;
  buf.writeBigUInt64LE(BigInt(now), 0);
  buf.writeBigUInt64LE(BigInt(expire), 8);

  const decoded = decodeLicensePayload(buf);
  assert.equal(decoded.issuedAt, now);
  assert.equal(decoded.expiresAt, expire);
  assert.equal(decoded.dynamicData, undefined);
});

test('decodeLicensePayload decodes combined payload with dynamicData json', () => {
  const buf16 = Buffer.alloc(16);
  const now = Date.now();
  const expire = now + 86400000;
  buf16.writeBigUInt64LE(BigInt(now), 0);
  buf16.writeBigUInt64LE(BigInt(expire), 8);

  const jsonBuf = Buffer.from(JSON.stringify({
    offsets: { 'Player::tick': 288 },
    sigs: { 'hook_main': '48 89 5C' }
  }), 'utf8');

  const combined = Buffer.concat([buf16, jsonBuf]);
  const decoded = decodeLicensePayload(combined);
  assert.equal(decoded.issuedAt, now);
  assert.equal(decoded.expiresAt, expire);
  assert.deepEqual(decoded.dynamicData, {
    offsets: { 'Player::tick': 288 },
    sigs: { 'hook_main': '48 89 5C' }
  });
});

test('v2 verify request packaging and response decryption round trip', () => {
  const { privateKey: rsaPrivate, publicKey: rsaPublic } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const { privateKey: edPrivate, publicKey: edPublic } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const cardKey = 'CARD-TEST-1234';
  const hwid = 'MACHINE-TEST-001';
  const softwareName = 'TestApp';

  const req = createV2VerifyPayload({
    licenseKey: cardKey,
    softwareName,
    hwid,
    deviceName: 'PC-TEST',
  }, rsaPublic);

  assert.equal(req.v, 2);
  assert.ok(req.envelope);
  assert.ok(req.payload);

  const encKey = crypto.privateDecrypt({
    key: rsaPrivate,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256',
  }, Buffer.from(req.envelope, 'base64'));

  assert.equal(encKey.length, 32);

  const [ivHex, tagHex, ctHex] = req.payload.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decryptedReq = JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(ctHex, 'hex')),
    decipher.final(),
  ]).toString('utf8'));

  assert.equal(decryptedReq.licenseKey, cardKey);
  assert.equal(decryptedReq.hwid, hwid);
  assert.equal(decryptedReq.softwareName, softwareName);

  const rawPayload = Buffer.alloc(16);
  rawPayload.writeBigUInt64LE(BigInt(Date.now()), 0);
  rawPayload.writeBigUInt64LE(BigInt(Date.now() + 100000), 8);

  const nonce = crypto.randomBytes(16);
  const keyStream = deriveV2KeyStream(cardKey, nonce, hwid, rawPayload.length);

  const cipherBuf = Buffer.alloc(16);
  for (let i = 0; i < 16; i += 1) {
    cipherBuf[i] = rawPayload[i] ^ keyStream[i];
  }

  const binding = computeV2Binding(cipherBuf, nonce, cardKey, hwid);
  const sig = crypto.sign(null, Buffer.concat([nonce, binding, cipherBuf]), edPrivate);

  const sealed = {
    cipherHex: cipherBuf.toString('hex'),
    signatureHex: sig.toString('hex'),
    nonceHex: nonce.toString('hex'),
  };

  const serverResponseBody = {
    valid: true,
    licenseKey: cardKey,
    softwareName,
    payload: sealed,
  };

  const signedPayload = {
    data: serverResponseBody,
    signature: crypto.sign(null, Buffer.from(JSON.stringify(serverResponseBody), 'utf8'), edPrivate).toString('hex'),
  };

  const respIv = crypto.randomBytes(12);
  const respCipher = crypto.createCipheriv('aes-256-gcm', encKey, respIv);
  const respCt = Buffer.concat([respCipher.update(Buffer.from(JSON.stringify(signedPayload), 'utf8')), respCipher.final()]);
  const respTag = respCipher.getAuthTag();
  const wireRespPayload = `${respIv.toString('hex')}:${respTag.toString('hex')}:${respCt.toString('hex')}`;

  const clientResult = decryptV2Response(wireRespPayload, req.sessionKey, edPublic, cardKey, hwid);
  assert.ok(clientResult.signatureVerified);
  assert.ok(clientResult.unsealedPayload);
});

test('veil request creation and response unsealing round trip', () => {
  const { privateKey: edPrivate, publicKey: edPublic } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const cardKey = 'VEIL-CARD-999';
  const hwid = 'MACHINE-VEIL-001';
  const softwareName = 'VeilApp';

  const req = createVeilRequest({
    licenseKey: cardKey,
    softwareName,
    hwid,
    deviceName: 'PC-VEIL',
    layoutId: '1',
  });

  assert.equal(req.licenseKey, cardKey);
  assert.equal(req.hwid, hwid);
  assert.equal(req.evidenceLayout, '1');
  assert.equal(req.evidence, Buffer.alloc(16).toString('hex'));

  const now = Date.now();
  const payloadBuf = Buffer.alloc(16);
  payloadBuf.writeBigUInt64LE(BigInt(now), 0);
  payloadBuf.writeBigUInt64LE(BigInt(now + 200000), 8);

  const nonce = crypto.randomBytes(12);
  const hwidBytes = Buffer.from(hwid, 'utf8');
  const evidenceBuf = Buffer.alloc(16);
  const info = Buffer.concat([
    evidenceBuf,
    Buffer.from([hwidBytes.length]),
    hwidBytes,
    Buffer.from([0x01]),
  ]);

  const prk = crypto.createHmac('sha256', nonce).update(Buffer.from(cardKey, 'utf8')).digest();
  const sessionKey = crypto.createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest();

  const stamp = Buffer.alloc(8);
  stamp.writeBigUInt64LE(BigInt(now), 0);
  const aad = Buffer.concat([stamp, nonce, Buffer.from([0x01])]);

  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(payloadBuf), cipher.final()]);
  const tag = cipher.getAuthTag();

  const sig = crypto.sign(null, Buffer.concat([stamp, nonce, ciphertext, tag]), edPrivate);

  const envelope = {
    issuedAt: now,
    nonceHex: nonce.toString('hex'),
    cipherHex: ciphertext.toString('hex'),
    tagHex: tag.toString('hex'),
    signatureHex: sig.toString('hex'),
  };

  const unsealed = openVeilResponse(envelope, edPublic, cardKey, hwid, evidenceBuf);
  assert.ok(unsealed);
});
