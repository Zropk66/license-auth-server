import crypto from 'crypto';

// 端到端闭环验证：服务端签发 → 客户端参数派生 → 解封 → 比对明文。
// 逻辑与 lib/veil-envelope.ts 等价，去掉类型标注以便直接运行。

const NONCE_SIZE = 12;
const STAMP_SIZE = 8;

function hkdfSha256(ikm, salt, info, length) {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  const out = Buffer.alloc(length);
  let previous = Buffer.alloc(0);
  let offset = 0;
  let counter = 1;
  while (offset < length) {
    const block = crypto
      .createHmac('sha256', prk)
      .update(Buffer.concat([previous, info, Buffer.from([counter])]))
      .digest();
    const take = Math.min(block.length, length - offset);
    block.copy(out, offset, 0, take);
    offset += take;
    previous = block;
    counter += 1;
  }
  return out;
}

function buildInfo(hwid, evidence, domain) {
  const hwidBytes = hwid ? Buffer.from(hwid, 'utf8') : Buffer.alloc(0);
  return Buffer.concat([
    evidence ?? Buffer.alloc(0),
    Buffer.from([hwidBytes.length]),
    hwidBytes,
    Buffer.from([domain]),
  ]);
}

function deriveSessionKey(cardKey, nonce, hwid, evidence, domain) {
  return hkdfSha256(Buffer.from(cardKey, 'utf8'), nonce,
                    buildInfo(hwid, evidence, domain), 32);
}

function buildSignedMessage(issuedAt, nonce, cipher, tag) {
  const stamp = Buffer.alloc(STAMP_SIZE);
  stamp.writeBigUInt64LE(BigInt(issuedAt), 0);
  return Buffer.concat([stamp, nonce, cipher, tag]);
}

function buildAad(issuedAt, nonce, domain) {
  const stamp = Buffer.alloc(STAMP_SIZE);
  stamp.writeBigUInt64LE(BigInt(issuedAt), 0);
  return Buffer.concat([stamp, nonce, Buffer.from([domain])]);
}

function sealEnvelope(plaintext, opts, privateKeyPem, issuedAt = Date.now()) {
  const domain = opts.domain ?? 1;
  const nonce = crypto.randomBytes(NONCE_SIZE);
  const sessionKey = deriveSessionKey(opts.cardKey, nonce, opts.hwid ?? '',
                                      opts.evidence ?? Buffer.alloc(0), domain);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, nonce);
  cipher.setAAD(buildAad(issuedAt, nonce, domain));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const signature = crypto.sign(null,
    buildSignedMessage(issuedAt, nonce, ciphertext, tag), privateKeyPem);
  return {
    issuedAt,
    nonceHex: nonce.toString('hex'),
    cipherHex: ciphertext.toString('hex'),
    tagHex: tag.toString('hex'),
    signatureHex: signature.toString('hex'),
  };
}

function openEnvelope(sealed, opts, publicKeyPem) {
  try {
    const nonce = Buffer.from(sealed.nonceHex, 'hex');
    const ciphertext = Buffer.from(sealed.cipherHex, 'hex');
    const tag = Buffer.from(sealed.tagHex, 'hex');
    const signature = Buffer.from(sealed.signatureHex, 'hex');
    if (nonce.length !== NONCE_SIZE || tag.length !== 16 || signature.length !== 64)
      return null;
    if (ciphertext.length === 0) return null;

    const message = buildSignedMessage(sealed.issuedAt, nonce, ciphertext, tag);
    if (!crypto.verify(null, message, publicKeyPem, signature)) return null;

    const domain = opts.domain ?? 1;
    const sessionKey = deriveSessionKey(opts.cardKey, nonce, opts.hwid ?? '',
                                        opts.evidence ?? Buffer.alloc(0), domain);
    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, nonce);
    decipher.setAAD(buildAad(sealed.issuedAt, nonce, domain));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    return null;
  }
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

let failures = 0;
function expect(condition, label) {
  if (condition) {
    console.log(`ok: ${label}`);
  } else {
    console.log(`FAIL: ${label}`);
    failures += 1;
  }
}

const cardKey = 'VEIL-CARD-E2E';
const hwid = 'MACHINE-E2E-001';
const evidence = Buffer.alloc(68, 0);
for (let i = 0; i < evidence.length; i += 1) evidence[i] = i & 0xff;

const payload = Buffer.alloc(24);
payload.writeBigUInt64LE(1700000000000n, 0);
payload.writeBigUInt64LE(1800000000000n, 8);
payload.writeUInt32LE(0xffffffff, 16);
payload.writeUInt32LE(0, 20);

const issuedAt = Date.now();
const sealed = sealEnvelope(payload, { cardKey, hwid, evidence, domain: 1 },
                            privateKey, issuedAt);

expect(sealed.nonceHex.length === NONCE_SIZE * 2, 'nonce is 12 bytes');
expect(sealed.tagHex.length === 32, 'tag is 16 bytes');
expect(sealed.signatureHex.length === 128, 'signature is 64 bytes');

const opened = openEnvelope(sealed, { cardKey, hwid, evidence, domain: 1 }, publicKey);
expect(opened !== null, 'server opens its own envelope');
expect(opened && opened.equals(payload), 'recovered payload is byte identical');

const wrongHwid = openEnvelope(sealed, { cardKey, hwid: 'MACHINE-OTHER', evidence, domain: 1 },
                               publicKey);
expect(wrongHwid === null, 'different hwid does not open the envelope');

const tamperedEvidence = Buffer.from(evidence);
tamperedEvidence[0] ^= 0x01;
const wrongEvidence = openEnvelope(sealed, { cardKey, hwid, evidence: tamperedEvidence, domain: 1 },
                                   publicKey);
expect(wrongEvidence === null, 'altered evidence does not open the envelope');

const wrongDomain = openEnvelope(sealed, { cardKey, hwid, evidence, domain: 2 }, publicKey);
expect(wrongDomain === null, 'different domain does not open the envelope');

const badSig = { ...sealed, signatureHex: sealed.signatureHex.replace(/^../, '00') };
expect(openEnvelope(badSig, { cardKey, hwid, evidence, domain: 1 }, publicKey) === null,
       'tampered signature is rejected');

const badCipher = { ...sealed, cipherHex: sealed.cipherHex.replace(/^../, 'ff') };
expect(openEnvelope(badCipher, { cardKey, hwid, evidence, domain: 1 }, publicKey) === null,
       'tampered ciphertext is rejected');

console.log(failures === 0 ? '\nsign and open round trip verified' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
