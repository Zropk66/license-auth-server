import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import {
  runClient,
  LicenseClient,
  createV2VerifyPayload,
  decodeLicensePayload,
} from '../test-client/client.mjs';

test('runClient executes verify protocol against mock server with universal ALL license', async () => {
  const { privateKey: rsaPrivate, publicKey: rsaPublic } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const { privateKey: edPrivate, publicKey: edPublic } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const server = http.createServer(async (req, res) => {
    if (req.url === '/api/license-verification/verify' && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));

      const encKey = crypto.privateDecrypt({
        key: rsaPrivate,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      }, Buffer.from(body.envelope, 'base64'));

      const [ivHex, tagHex, ctHex] = body.payload.split(':');
      const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      const reqObj = JSON.parse(Buffer.concat([
        decipher.update(Buffer.from(ctHex, 'hex')),
        decipher.final(),
      ]).toString('utf8'));

      assert.equal(reqObj.softwareName, 'GameClientApp');

      const rawPayload = Buffer.alloc(24);
      rawPayload.writeBigUInt64LE(BigInt(Date.now()), 0);
      rawPayload.writeBigUInt64LE(BigInt(Date.now() + 500000), 8);
      rawPayload.writeUInt32LE(0xffffffff, 16);
      rawPayload.writeUInt32LE(0, 20);

      const nonce = crypto.randomBytes(16);
      const infoKey = Buffer.concat([Buffer.from(reqObj.hwid, 'utf8'), Buffer.from([0x01])]);
      const prk1 = crypto.createHmac('sha256', nonce).update(Buffer.from(reqObj.licenseKey, 'utf8')).digest();
      const streamKey = crypto.createHmac('sha256', prk1).update(Buffer.concat([infoKey, Buffer.from([1])])).digest();
      const prk2 = crypto.createHmac('sha256', nonce).update(streamKey).digest();
      const keyStream = crypto.createHmac('sha256', prk2).update(Buffer.from([1])).digest().subarray(0, 24);

      const cipherBuf = Buffer.alloc(24);
      for (let i = 0; i < 24; i += 1) {
        cipherBuf[i] = rawPayload[i] ^ keyStream[i];
      }

      const infoBind = Buffer.concat([Buffer.from(reqObj.hwid, 'utf8'), Buffer.from([0x02])]);
      const bindKey = crypto.createHmac('sha256', prk1).update(Buffer.concat([infoBind, Buffer.from([1])])).digest();
      const binding = crypto.createHmac('sha256', bindKey).update(Buffer.concat([nonce, cipherBuf])).digest().subarray(0, 16);
      const sig = crypto.sign(null, Buffer.concat([nonce, binding, cipherBuf]), edPrivate);

      const signedData = {
        valid: true,
        licenseKey: reqObj.licenseKey,
        username: 'testuser',
        softwareName: 'ALL',
        sessionId: 'sess-test-123',
        status: 'active',
        payload: {
          cipherHex: cipherBuf.toString('hex'),
          signatureHex: sig.toString('hex'),
          nonceHex: nonce.toString('hex'),
        },
      };

      const signedPayload = {
        data: signedData,
        signature: crypto.sign(null, Buffer.from(JSON.stringify(signedData), 'utf8'), edPrivate).toString('hex'),
      };

      const respIv = crypto.randomBytes(12);
      const respCipher = crypto.createCipheriv('aes-256-gcm', encKey, respIv);
      const respCt = Buffer.concat([
        respCipher.update(Buffer.from(JSON.stringify(signedPayload), 'utf8')),
        respCipher.final(),
      ]);
      const respTag = respCipher.getAuthTag();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        v: 2,
        payload: `${respIv.toString('hex')}:${respTag.toString('hex')}:${respCt.toString('hex')}`,
      }));
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const result = await runClient({
    protocol: 'verify',
    url: `http://127.0.0.1:${port}`,
    licenseKey: 'TEST-UNIVERSAL-KEY',
    softwareName: 'GameClientApp',
    hwid: 'TEST-HWID-001',
    rsaPublicKey: rsaPublic,
    authPublicKey: edPublic,
    silent: true,
  });

  assert.ok(result.signatureVerified);
  assert.equal(result.data.status, 'active');
  assert.equal(result.data.softwareName, 'ALL');
  assert.ok(result.unsealedPayload);
  assert.equal(result.unsealedPayload.featureMask, 0xffffffff);

  server.close();
});

test('LicenseClient full lifecycle: verify, checkUpdate, sendHeartbeat, reportOffline', async () => {
  const { privateKey: rsaPrivate, publicKey: rsaPublic } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const { privateKey: edPrivate, publicKey: edPublic } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  let heartbeatReceived = false;
  let offlineReceived = false;
  let updateChecked = false;

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyStr = Buffer.concat(chunks).toString('utf8');
    const body = bodyStr ? JSON.parse(bodyStr) : {};

    if (req.url === '/api/license-verification/verify') {
      const encKey = crypto.privateDecrypt({
        key: rsaPrivate,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      }, Buffer.from(body.envelope, 'base64'));

      const signedData = {
        valid: true,
        licenseKey: 'KEY-LIFECYCLE',
        username: 'lifecycleUser',
        softwareName: 'LifecycleApp',
        sessionId: 'sess-lifecycle-999',
        status: 'active',
        heartbeatInterval: 10,
      };

      const signedPayload = {
        data: signedData,
        signature: crypto.sign(null, Buffer.from(JSON.stringify(signedData), 'utf8'), edPrivate).toString('hex'),
      };

      const respIv = crypto.randomBytes(12);
      const respCipher = crypto.createCipheriv('aes-256-gcm', encKey, respIv);
      const respCt = Buffer.concat([
        respCipher.update(Buffer.from(JSON.stringify(signedPayload), 'utf8')),
        respCipher.final(),
      ]);
      const respTag = respCipher.getAuthTag();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        v: 2,
        payload: `${respIv.toString('hex')}:${respTag.toString('hex')}:${respCt.toString('hex')}`,
      }));
      return;
    }

    if (req.url === '/api/software/check-update') {
      updateChecked = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ hasUpdate: false }));
      return;
    }

    if (req.url === '/api/license-verification/heartbeat') {
      heartbeatReceived = true;
      const encKey = crypto.privateDecrypt({
        key: rsaPrivate,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      }, Buffer.from(body.envelope, 'base64'));

      const hbData = {
        status: 'active',
        sessionId: 'sess-lifecycle-999',
        heartbeatInterval: 10,
        timestamp: Date.now(),
      };

      const signedPayload = {
        data: hbData,
        signature: crypto.sign(null, Buffer.from(JSON.stringify(hbData), 'utf8'), edPrivate).toString('hex'),
      };

      const respIv = crypto.randomBytes(12);
      const respCipher = crypto.createCipheriv('aes-256-gcm', encKey, respIv);
      const respCt = Buffer.concat([
        respCipher.update(Buffer.from(JSON.stringify(signedPayload), 'utf8')),
        respCipher.final(),
      ]);
      const respTag = respCipher.getAuthTag();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        v: 2,
        payload: `${respIv.toString('hex')}:${respTag.toString('hex')}:${respCt.toString('hex')}`,
      }));
      return;
    }

    if (req.url === '/api/license-verification/offline') {
      offlineReceived = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    res.writeHead(404).end();
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const client = new LicenseClient({
    protocol: 'verify',
    url: `http://127.0.0.1:${port}`,
    licenseKey: 'KEY-LIFECYCLE',
    softwareName: 'LifecycleApp',
    hwid: 'HW-LIFECYCLE-001',
    rsaPublicKey: rsaPublic,
    authPublicKey: edPublic,
    silent: true,
  });

  const verified = await client.verify();
  assert.equal(verified.data.sessionId, 'sess-lifecycle-999');
  assert.equal(client.sessionId, 'sess-lifecycle-999');

  const updateRes = await client.checkUpdate();
  assert.equal(updateRes.hasUpdate, false);
  assert.ok(updateChecked);

  const hbRes = await client.sendHeartbeat();
  assert.equal(hbRes.status, 'active');
  assert.ok(heartbeatReceived);

  await client.close();
  assert.ok(offlineReceived);

  server.close();
});
