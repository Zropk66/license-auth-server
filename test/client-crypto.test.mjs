import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  createV2VerifyPayload,
  decryptV2Response,
  createVeilRequest,
  openVeilResponse,
  decodeLicensePayload,
} from '../test-client/client.mjs';

test('decodeLicensePayload decodes 24 byte binary payload', () => {
  const buf = Buffer.alloc(24);
  const now = Date.now();
  const expire = now + 86400000;
  buf.writeBigUInt64LE(BigInt(now), 0);
  buf.writeBigUInt64LE(BigInt(expire), 8);
  buf.writeUInt32LE(0xffffffff, 16);
  buf.writeUInt32LE(0, 20);

  const decoded = decodeLicensePayload(buf);
  assert.equal(decoded.issuedAt, now);
  assert.equal(decoded.expiresAt, expire);
  assert.equal(decoded.featureMask, 0xffffffff);
  assert.equal(decoded.reserved, 0);
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

  const rawPayload = Buffer.alloc(24);
  rawPayload.writeBigUInt64LE(BigInt(Date.now()), 0);
  rawPayload.writeBigUInt64LE(BigInt(Date.now() + 100000), 8);
  rawPayload.writeUInt32LE(0xffffffff, 16);
  rawPayload.writeUInt32LE(0, 20);

  const nonce = crypto.randomBytes(16);
  const infoKey = Buffer.concat([Buffer.from(hwid, 'utf8'), Buffer.from([0x01])]);
  const prk1 = crypto.createHmac('sha256', nonce).update(Buffer.from(cardKey, 'utf8')).digest();
  const streamKey = crypto.createHmac('sha256', prk1).update(Buffer.concat([infoKey, Buffer.from([1])])).digest();
  const prk2 = crypto.createHmac('sha256', nonce).update(streamKey).digest();
  const keyStream = crypto.createHmac('sha256', prk2).update(Buffer.from([1])).digest().subarray(0, 24);

  const cipherBuf = Buffer.alloc(24);
  for (let i = 0; i < 24; i += 1) {
    cipherBuf[i] = rawPayload[i] ^ keyStream[i];
  }

  const infoBind = Buffer.concat([Buffer.from(hwid, 'utf8'), Buffer.from([0x02])]);
  const bindKey = crypto.createHmac('sha256', prk1).update(Buffer.concat([infoBind, Buffer.from([1])])).digest();
  const binding = crypto.createHmac('sha256', bindKey).update(Buffer.concat([nonce, cipherBuf])).digest().subarray(0, 16);
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
  assert.equal(clientResult.unsealedPayload.featureMask, 0xffffffff);
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
  const payloadBuf = Buffer.alloc(24);
  payloadBuf.writeBigUInt64LE(BigInt(now), 0);
  payloadBuf.writeBigUInt64LE(BigInt(now + 200000), 8);
  payloadBuf.writeUInt32LE(0x12345678, 16);
  payloadBuf.writeUInt32LE(0, 20);

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
  assert.equal(unsealed.featureMask, 0x12345678);
});
