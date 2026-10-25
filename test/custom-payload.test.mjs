import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  composeLicensePayload,
  decodeLicensePayload,
  sealPayload,
  openPayload,
  mergeCustomPayloads,
  encodeStatusFlags,
  attachStatusFlags,
  LICENSE_FLAG_ACTIVE,
  LICENSE_FLAG_REVOKED,
  LICENSE_FLAG_SUSPENDED,
  LICENSE_FLAG_HWID_BOUND,
  LICENSE_FLAGS_KEY,
} from '../lib/payload-seal.ts';
import {
  sealEnvelope,
  openEnvelope,
} from '../lib/veil-envelope.ts';
import { openV2Payload } from '../test-client/client.mjs';

test('composeLicensePayload appends customPayload after 16 bytes header', () => {
  const jsonStr = JSON.stringify({
    LocalPlayer_tick: 288,
    renderHook: '48 89 5C 24 ??'
  });

  const buffer = composeLicensePayload({
    issuedAt: 1700000000000,
    expiresAt: 1800000000000,
    customPayload: jsonStr,
  });

  assert.equal(buffer.length, 16 + Buffer.byteLength(jsonStr, 'utf8'));
  const decoded = decodeLicensePayload(buffer);
  assert.equal(decoded.issuedAt, 1700000000000);
  assert.equal(decoded.expiresAt, 1800000000000);
  assert.equal(decoded.customPayload, jsonStr);
});

test('v2 sealPayload and openPayload round trip preserves customPayload', () => {
  const { privateKey } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const customJson = JSON.stringify({
    secretToken: 'sec_12345',
    offsets: { tick: 0x120 }
  });

  const plaintext = composeLicensePayload({
    issuedAt: Date.now(),
    expiresAt: Date.now() + 100000,
    customPayload: customJson,
  });

  const sealed = sealPayload(plaintext, 'CARD-1234', 'MACHINE-A', privateKey);
  const opened = openPayload(sealed, 'CARD-1234', 'MACHINE-A', privateKey);

  assert.ok(opened);
  const decoded = decodeLicensePayload(opened);
  assert.equal(decoded.customPayload, customJson);
});

test('veil sealEnvelope and openEnvelope round trip preserves customPayload', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const customJson = JSON.stringify({
    modules: ['aimbot', 'esp'],
    vtable: 0x55aa
  });

  const plaintext = composeLicensePayload({
    issuedAt: Date.now(),
    expiresAt: Date.now() + 100000,
    customPayload: customJson,
  });

  const sealed = sealEnvelope(
    plaintext,
    { cardKey: 'CARD-1234', hwid: 'MACHINE-B', evidence: Buffer.alloc(16), domain: 0x01 },
    privateKey
  );

  const opened = openEnvelope(
    sealed,
    { cardKey: 'CARD-1234', hwid: 'MACHINE-B', evidence: Buffer.alloc(16), domain: 0x01 },
    publicKey
  );

  assert.ok(opened);
  const decoded = decodeLicensePayload(opened);
  assert.equal(decoded.customPayload, customJson);
});

test('mergeCustomPayloads merges software, version, and license payloads', () => {
  const software = JSON.stringify({ a: 'a', base: 100, offsets: { tick: 288, fov: 90 } });
  const version = JSON.stringify({ ver: 101, offsets: { fov: 95 } });
  const license = JSON.stringify({ a: 'b', vip: true, offsets: { fly: 512 } });

  const merged = mergeCustomPayloads(software, version, license);
  assert.ok(merged);
  const parsed = JSON.parse(merged);

  assert.equal(parsed.a, 'b');
  assert.equal(parsed.base, 100);
  assert.equal(parsed.ver, 101);
  assert.equal(parsed.vip, true);
  assert.deepEqual(parsed.offsets, {
    tick: 288,
    fov: 95,
    fly: 512,
  });
});

test('mergeCustomPayloads lets a later non-object payload replace the merged object', () => {
  const software = JSON.stringify({ base: 100, offsets: { tick: 288 } });
  const licenseArray = JSON.stringify(['aimbot', 'esp']);

  assert.equal(mergeCustomPayloads(software, licenseArray), licenseArray);
  assert.equal(mergeCustomPayloads(licenseArray, software), JSON.stringify({ base: 100, offsets: { tick: 288 } }));
});

test('client key stream matches server for payloads longer than 32 bytes', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const customJson = JSON.stringify({
    offsets: { tick: 288, fov: 90, fly: 512, speed: 1.2 },
    sigs: { hook_main: '48 89 5C 24 ?? 0F 28', hook_alt: 'E8 ?? ?? ?? ??' },
  });

  const plaintext = composeLicensePayload({
    issuedAt: Date.now(),
    expiresAt: Date.now() + 100000,
    customPayload: customJson,
  });

  assert.ok(plaintext.length > 32);

  const sealed = sealPayload(plaintext, 'CARD-LONG', 'MACHINE-LONG', privateKey);
  const opened = openV2Payload(sealed, 'CARD-LONG', 'MACHINE-LONG', publicKey);

  assert.ok(opened);
  assert.equal(opened.customPayload, customJson);
  assert.deepEqual(opened.customJson, JSON.parse(customJson));
});

test('encodeStatusFlags maps license status to bit flags', () => {
  assert.equal(encodeStatusFlags('active', false), LICENSE_FLAG_ACTIVE);
  assert.equal(encodeStatusFlags('revoked', false), LICENSE_FLAG_REVOKED);
  assert.equal(encodeStatusFlags('suspended', false), LICENSE_FLAG_SUSPENDED);
  assert.equal(
    encodeStatusFlags('active', true),
    LICENSE_FLAG_ACTIVE | LICENSE_FLAG_HWID_BOUND
  );
  assert.equal(encodeStatusFlags('unknown_state', false), 0);
});

test('attachStatusFlags keeps payload object intact', () => {
  const original = JSON.stringify({ vip: true, offsets: { tick: 288 } });
  const withFlags = attachStatusFlags(original, LICENSE_FLAG_ACTIVE);
  const parsed = JSON.parse(withFlags);

  assert.equal(parsed.vip, true);
  assert.equal(parsed[LICENSE_FLAGS_KEY], LICENSE_FLAG_ACTIVE);
  assert.deepEqual(parsed.offsets, { tick: 288 });
});

test('attachStatusFlags preserves non-object payloads under value key', () => {
  const arrayPayload = JSON.stringify(['aimbot', 'esp']);
  const parsedArray = JSON.parse(attachStatusFlags(arrayPayload, LICENSE_FLAG_REVOKED));
  assert.deepEqual(parsedArray.value, ['aimbot', 'esp']);
  assert.equal(parsedArray[LICENSE_FLAGS_KEY], LICENSE_FLAG_REVOKED);

  const plainText = 'not json at all';
  const parsedText = JSON.parse(attachStatusFlags(plainText, LICENSE_FLAG_SUSPENDED));
  assert.equal(parsedText.value, plainText);
  assert.equal(parsedText[LICENSE_FLAGS_KEY], LICENSE_FLAG_SUSPENDED);
});

test('attachStatusFlags emits flags even without custom payload', () => {
  const parsed = JSON.parse(attachStatusFlags(null, LICENSE_FLAG_ACTIVE));
  assert.equal(parsed[LICENSE_FLAGS_KEY], LICENSE_FLAG_ACTIVE);
  assert.equal(Object.keys(parsed).length, 1);
});

test('status flags survive envelope round trip', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const flags = LICENSE_FLAG_ACTIVE | LICENSE_FLAG_HWID_BOUND;
  const payload = composeLicensePayload({
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60000,
    customPayload: attachStatusFlags(JSON.stringify({ tier: 'pro' }), flags),
  });

  const sealed = sealPayload(payload, 'CARD-FLAGS', 'MACHINE-FLAGS', privateKey);
  const opened = openPayload(sealed, 'CARD-FLAGS', 'MACHINE-FLAGS', privateKey);

  assert.ok(opened);
  const decoded = decodeLicensePayload(opened);
  assert.ok(decoded);
  const parsed = JSON.parse(decoded.customPayload);
  assert.equal(parsed[LICENSE_FLAGS_KEY], flags);
  assert.equal(parsed.tier, 'pro');
});
