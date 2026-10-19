import crypto from 'crypto';
import { writeFileSync } from 'node:fs';

// 生成服务端签发的信封夹具，供 C++ 客户端解开。
// 这是对接的最终验证：服务端产出 → 客户端解封 → 明文逐字节比对。

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

// 固定私钥，使夹具可复现。测试专用，与生产密钥无关。
const seed = Buffer.alloc(32);
for (let i = 0; i < seed.length; i += 1) seed[i] = i * 5 + 7;

// Ed25519 私钥从种子构造：与 Monocypher 的 crypto_ed25519_key_pair 一致
// 的做法是 seed 经 SHA-512 派生，这里用 Node 的 PKCS8 封装。
const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
const privateKeyDer = Buffer.concat([pkcs8Prefix, seed]);
const privateKey = crypto.createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' });
const publicKey = crypto.createPublicKey(privateKey);

const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
const publicKeyHex = spkiDer.subarray(spkiDer.length - 32).toString('hex');

const cardKey = 'VEIL-CARD-FIXTURE';
const hwid = 'MACHINE-FIXTURE-1';
const evidence = Buffer.alloc(68);
for (let i = 0; i < evidence.length; i += 1) evidence[i] = (i * 11) & 0xff;
const domain = 1;

const payload = Buffer.alloc(24);
payload.writeBigUInt64LE(1730000000000n, 0);
payload.writeBigUInt64LE(1760000000000n, 8);
payload.writeUInt32LE(0x0000000f, 16);
payload.writeUInt32LE(0, 20);

// 固定 nonce 与签发时刻，使夹具可复现
const nonce = Buffer.from('a0a1a2a3a4a5a6a7a8a9aaab', 'hex');
const issuedAt = 1730000000000;

const sessionKey = hkdfSha256(Buffer.from(cardKey, 'utf8'), nonce,
                              buildInfo(hwid, evidence, domain), 32);

const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, nonce);
const stampAad = Buffer.alloc(STAMP_SIZE);
stampAad.writeBigUInt64LE(BigInt(issuedAt), 0);
cipher.setAAD(Buffer.concat([stampAad, nonce, Buffer.from([domain])]));

const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
const tag = cipher.getAuthTag();

const stamp = Buffer.alloc(STAMP_SIZE);
stamp.writeBigUInt64LE(BigInt(issuedAt), 0);
const signature = crypto.sign(null, Buffer.concat([stamp, nonce, ciphertext, tag]),
                              privateKey);

writeFileSync('D:/Zropk/Documents/CProjects/veil/tests/fixtures/veil_envelope.json',
  JSON.stringify({
    cardKey,
    hwid,
    evidenceHex: evidence.toString('hex'),
    domain,
    publicKeyHex,
    issuedAt,
    nonceHex: nonce.toString('hex'),
    cipherHex: ciphertext.toString('hex'),
    tagHex: tag.toString('hex'),
    signatureHex: signature.toString('hex'),
    plaintextHex: payload.toString('hex'),
  }, null, 2));

console.log('wrote veil_envelope.json');
console.log('public key:', publicKeyHex);
