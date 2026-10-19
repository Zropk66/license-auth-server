import crypto from 'crypto';

// 攻击验证：模拟客户端环境被篡改时，服务端当前实现能否察觉。

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

function deriveKey(cardKey, nonce, hwid, evidence, domain) {
  return hkdfSha256(Buffer.from(cardKey, 'utf8'), nonce,
                    buildInfo(hwid, evidence, domain), 32);
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const cardKey = 'VEIL-CARD-ATTACK';
const hwid = 'MACHINE-ATTACK-1';
const domain = 1;
const nonce = crypto.randomBytes(NONCE_SIZE);

const payload = Buffer.alloc(24);
payload.writeBigUInt64LE(1700000000000n, 0);
payload.writeBigUInt64LE(0n, 8);
payload.writeUInt32LE(0xffffffff, 16);
payload.writeUInt32LE(0, 20);

// 场景：环境已被篡改，正常环境应为全零证据，但攻击者的环境测到了非零值。
const tamperedEvidence = Buffer.alloc(68);
tamperedEvidence[0] = 0x05;
tamperedEvidence[1] = 0x01;

console.log('=== 攻击场景 ===');
console.log('正常环境证据应为全零，攻击者环境实测：',
            tamperedEvidence.subarray(0, 4).toString('hex'), '...');

function sealWith(evidence) {
  const key = deriveKey(cardKey, nonce, hwid, evidence, domain);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const stamp = Buffer.alloc(STAMP_SIZE);
  const issuedAt = 1700000000000;
  stamp.writeBigUInt64LE(BigInt(issuedAt), 0);
  cipher.setAAD(Buffer.concat([stamp, nonce, Buffer.from([domain])]));
  const ct = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  const sig = crypto.sign(null, Buffer.concat([stamp, nonce, ct, tag]), privateKey);
  return { issuedAt, nonce, ct, tag, sig };
}

// 攻击者的客户端：用实测到的非零证据派生，并把该证据上报给服务端
const attackerWire = sealWith(tamperedEvidence);

// 服务端当前实现：拿客户端上报的证据派生
const serverDerivedFromReport = deriveKey(cardKey, nonce, hwid,
                                           tamperedEvidence, domain);

// 攻击者用自己那份密钥解密服务端响应
function openWith(sealed, key) {
  try {
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

// 改用签名验证：服务端签发的信封，攻击者能否解开
function serverSeal() {
  const serverKey = deriveKey(cardKey, nonce, hwid, tamperedEvidence, domain);
  const cipher = crypto.createCipheriv('aes-256-gcm', serverKey, nonce);
  const stamp = Buffer.alloc(STAMP_SIZE);
  const issuedAt = 1700000000000;
  stamp.writeBigUInt64LE(BigInt(issuedAt), 0);
  cipher.setAAD(Buffer.concat([stamp, nonce, Buffer.from([domain])]));
  const ct = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  const sig = crypto.sign(null, Buffer.concat([stamp, nonce, ct, tag]), privateKey);
  return { issuedAt, nonce, ct, tag, sig };
}

const fromServer = serverSeal();
const attackerKey = deriveKey(cardKey, nonce, hwid, tamperedEvidence, domain);
const opened = openWith(fromServer, attackerKey);

console.log('');
console.log('服务端用客户端上报的证据派生 =>',
            opened ? '攻击者成功解开响应' : '攻击者解不开');

// 对照：服务端若改用零基线
const zeroBaseline = Buffer.alloc(68);
const serverZeroKey = deriveKey(cardKey, nonce, hwid, zeroBaseline, domain);
const attackerOpened = openWith(fromServer, attackerKey);
const crossCheck = opened !== null && !attackerKey.equals(serverZeroKey);

console.log('服务端若改用零基线 =>',
            attackerKey.equals(serverZeroKey)
              ? '密钥相同，攻击仍成功'
              : '密钥不同，攻击者解不开');

console.log('');
if (opened) {
  console.log('结论：当前实现在环境被篡改时无法察觉。');
  process.exit(1);
}
console.log('结论：当前实现能察觉篡改。');
process.exit(0);
