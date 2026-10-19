import crypto from 'crypto';

// 验证修正后的语义：
//   正常环境  客户端实测全零 → 与服务端零基线一致 → 解开
//   环境被篡改 客户端实测非零 → 与服务端零基线不同 → 解不开
//
// 服务端不再采信客户端上报的证据。

const NONCE_SIZE = 12;
const STAMP_SIZE = 8;
const EVIDENCE_SIZE = 68;

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
    evidence,
    Buffer.from([hwidBytes.length]),
    hwidBytes,
    Buffer.from([domain]),
  ]);
}

function deriveKey(cardKey, nonce, hwid, evidence, domain) {
  return hkdfSha256(Buffer.from(cardKey, 'utf8'), nonce,
                    buildInfo(hwid, evidence, domain), 32);
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const cardKey = 'VEIL-CARD-FIXED';
const hwid = 'MACHINE-FIXED-1';
const domain = 1;
const issuedAt = 1700000000000;

const payload = Buffer.alloc(24);
payload.writeBigUInt64LE(1700000000000n, 0);
payload.writeBigUInt64LE(0n, 8);
payload.writeUInt32LE(0xffffffff, 16);
payload.writeUInt32LE(0, 20);

/** 服务端侧：用零基线签发 */
function serverSeal(nonce) {
  const evidence = Buffer.alloc(EVIDENCE_SIZE);
  const key = deriveKey(cardKey, nonce, hwid, evidence, domain);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const stamp = Buffer.alloc(STAMP_SIZE);
  stamp.writeBigUInt64LE(BigInt(issuedAt), 0);
  cipher.setAAD(Buffer.concat([stamp, nonce, Buffer.from([domain])]));
  const ct = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  const sig = crypto.sign(null, Buffer.concat([stamp, nonce, ct, tag]), privateKey);
  return { issuedAt, nonce, ct, tag, sig };
}

/** 客户端侧：用自己实测的证据解开 */
function clientOpen(sealed, clientEvidence) {
  try {
    const key = deriveKey(cardKey, sealed.nonce, hwid, clientEvidence, domain);
    const dec = crypto.createDecipheriv('aes-256-gcm', key, sealed.nonce);
    const stamp = Buffer.alloc(STAMP_SIZE);
    stamp.writeBigUInt64LE(BigInt(sealed.issuedAt), 0);
    dec.setAAD(Buffer.concat([stamp, sealed.nonce, Buffer.from([domain])]));
    dec.setAuthTag(sealed.tag);
    return Buffer.concat([dec.update(sealed.ct), dec.final()]);
  } catch {
    return null;
  }
}

let failures = 0;
function expect(condition, label) {
  console.log(`${condition ? 'ok' : 'FAIL'}: ${label}`);
  if (!condition) failures += 1;
}

const nonce = crypto.randomBytes(NONCE_SIZE);
const sealed = serverSeal(nonce);

// 场景一：环境干净，客户端实测全零
{
  const clean = Buffer.alloc(EVIDENCE_SIZE);
  const opened = clientOpen(sealed, clean);
  expect(opened !== null && opened.equals(payload),
         'clean environment opens the envelope');
}

// 场景二：环境被篡改，客户端实测非零
{
  const tampered = Buffer.alloc(EVIDENCE_SIZE);
  tampered[0] = 0x05;
  tampered[1] = 0x01;

  const opened = clientOpen(sealed, tampered);
  expect(opened === null,
         'tampered environment cannot open the envelope');

  // 关键：攻击者即便把这份非零证据上报，服务端也不采信
  const serverKey = deriveKey(cardKey, nonce, hwid, Buffer.alloc(EVIDENCE_SIZE), domain);
  const attackerKey = deriveKey(cardKey, nonce, hwid, tampered, domain);
  expect(!serverKey.equals(attackerKey),
         'server key differs from the attacker derived key');
}

// 场景三：攻击者尝试用零证据伪造客户端
// 他能解开签名验证，但拿不到正确的 HWID 与卡密组合
{
  const wrongHwid = deriveKey(cardKey, nonce, 'MACHINE-WRONG', Buffer.alloc(EVIDENCE_SIZE), domain);
  const rightHwid = deriveKey(cardKey, nonce, hwid, Buffer.alloc(EVIDENCE_SIZE), domain);
  expect(!wrongHwid.equals(rightHwid), 'wrong hwid yields a different key');
}

console.log('');
console.log(failures === 0
  ? 'fixed semantics verified: tampering breaks the key'
  : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
