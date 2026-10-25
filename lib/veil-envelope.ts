import crypto from 'crypto';

/**
 * veil 签名信封的服务端实现。
 *
 * 与客户端 license/signed_envelope.hpp 逐字节对称。独立于现有的
 * payload-seal.ts：那套走 HWID 派生的 XOR 密钥流，这套走证据与 HWID
 * 共同派生的 AES-GCM，两者并存以便灰度。
 *
 * 传输层不用 RSA。secure-protocol.ts 用 RSA-OAEP 包裹会话密钥，是为
 * 明文 HTTP 提供机密性；veil 客户端走证书固定的 TLS，传输层已加密，
 * 再套一层是重复防护，且迫使客户端引入 bcrypt 依赖。
 *
 * 密钥派生：
 *
 *   info = 证据 ‖ HWID长度 ‖ HWID ‖ 域
 *   会话密钥 = HKDF-SHA256(ikm=卡密, salt=nonce, info)
 *
 * 长度前缀不可省。没有它，证据末字节与 HWID 首字节相同的两组输入会
 * 拼出同一段 info，派生出同一把密钥。
 *
 * HWID 与证据都是派生输入，不做独立比对。不符时派生出另一把密钥，
 * 表现为 GCM 标签校验失败，而不是某个可被改写的布尔判定。
 *
 * 签名覆盖 stamp ‖ nonce ‖ cipher ‖ tag，即信封的全部字节。
 */

export const NONCE_SIZE = 12;
export const TAG_SIZE = 16;
export const SIGNATURE_SIZE = 64;
export const STAMP_SIZE = 8;
export const MAX_HWID = 127;
export const MAX_PLAINTEXT = 65536;
export const MAX_EVIDENCE = 1024;
export const DEFAULT_DOMAIN = 0x01;

export interface SealInputs {
  cardKey: string;
  hwid?: string;
  evidence?: Buffer;
  domain?: number;
}

export interface SealedEnvelope {
  /** 签发时刻，毫秒 */
  issuedAt: number;
  nonceHex: string;
  cipherHex: string;
  tagHex: string;
  signatureHex: string;
}

/** RFC 5869 HKDF-SHA256，与客户端实现一致 */
function hkdfSha256(ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer {
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

/** 校验输入并返回与客户端逐字节一致的 info 段 */
export function buildInfo(inputs: SealInputs): Buffer {
  const hwidBytes = inputs.hwid ? Buffer.from(inputs.hwid, 'utf8') : Buffer.alloc(0);
  const evidence = inputs.evidence ?? Buffer.alloc(0);

  if (hwidBytes.length > MAX_HWID) {
    throw new Error(`hwid length out of range: ${hwidBytes.length}`);
  }
  if (evidence.length > MAX_EVIDENCE) {
    throw new Error(`evidence length out of range: ${evidence.length}`);
  }

  return Buffer.concat([
    evidence,
    Buffer.from([hwidBytes.length]),
    hwidBytes,
    Buffer.from([inputs.domain ?? DEFAULT_DOMAIN]),
  ]);
}

/**
 * 派生会话密钥。公开导出，供跨实现夹具与运维排查复用同一份 info
 * 构造逻辑，避免两侧各写一遍导致字节错位。
 */
export function deriveSessionKey(
  cardKey: string,
  nonce: Buffer,
  inputs: SealInputs
): Buffer {
  if (nonce.length !== NONCE_SIZE) {
    throw new Error(`nonce must be ${NONCE_SIZE} bytes, got ${nonce.length}`);
  }
  if (!cardKey) {
    throw new Error('card key is required');
  }

  return hkdfSha256(Buffer.from(cardKey, 'utf8'), nonce, buildInfo(inputs), 32);
}

/** 构造签名覆盖的消息：stamp ‖ nonce ‖ cipher ‖ tag */
function buildSignedMessage(
  issuedAt: number,
  nonce: Buffer,
  cipher: Buffer,
  tag: Buffer
): Buffer {
  const stamp = Buffer.alloc(STAMP_SIZE);
  stamp.writeBigUInt64LE(BigInt(issuedAt), 0);
  return Buffer.concat([stamp, nonce, cipher, tag]);
}

/** 构造附加认证数据：stamp ‖ nonce ‖ 域 */
function buildAad(issuedAt: number, nonce: Buffer, domain: number): Buffer {
  const stamp = Buffer.alloc(STAMP_SIZE);
  stamp.writeBigUInt64LE(BigInt(issuedAt), 0);
  return Buffer.concat([stamp, nonce, Buffer.from([domain])]);
}

/**
 * 签发信封。
 *
 * nonce 每次随机生成。同一会话密钥下 nonce 必须唯一，重复会让 GCM
 * 的密钥流重用——这是该模式的固有要求，调用方无法回避。
 */
export function sealEnvelope(
  plaintext: Buffer,
  inputs: SealInputs,
  privateKeyPem: string,
  issuedAt: number = Date.now()
): SealedEnvelope {
  if (plaintext.length === 0 || plaintext.length > MAX_PLAINTEXT) {
    throw new Error(`plaintext size out of range: ${plaintext.length}`);
  }

  const domain = inputs.domain ?? DEFAULT_DOMAIN;
  const nonce = crypto.randomBytes(NONCE_SIZE);
  const sessionKey = deriveSessionKey(inputs.cardKey, nonce, inputs);

  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, nonce);
  cipher.setAAD(buildAad(issuedAt, nonce, domain));

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const signature = crypto.sign(
    null,
    buildSignedMessage(issuedAt, nonce, ciphertext, tag),
    privateKeyPem
  );

  return {
    issuedAt,
    nonceHex: nonce.toString('hex'),
    cipherHex: ciphertext.toString('hex'),
    tagHex: tag.toString('hex'),
    signatureHex: signature.toString('hex'),
  };
}

/**
 * 服务端侧解封，仅用于自测与运维排查。
 *
 * 顺序与客户端一致：先验签，再解密。验签只需公钥，是纯公开计算，
 * 放在最前可以让垃圾输入在接触解密器之前被挡住。
 */
export function openEnvelope(
  sealed: SealedEnvelope,
  inputs: SealInputs,
  publicKeyPem: string
): Buffer | null {
  try {
    const nonce = Buffer.from(sealed.nonceHex, 'hex');
    const ciphertext = Buffer.from(sealed.cipherHex, 'hex');
    const tag = Buffer.from(sealed.tagHex, 'hex');
    const signature = Buffer.from(sealed.signatureHex, 'hex');

    if (nonce.length !== NONCE_SIZE) return null;
    if (tag.length !== TAG_SIZE) return null;
    if (signature.length !== SIGNATURE_SIZE) return null;
    if (ciphertext.length === 0 || ciphertext.length > MAX_PLAINTEXT) return null;

    const message = buildSignedMessage(sealed.issuedAt, nonce, ciphertext, tag);
    const authentic = crypto.verify(null, message, publicKeyPem, signature);
    if (!authentic) return null;

    const domain = inputs.domain ?? DEFAULT_DOMAIN;
    const sessionKey = deriveSessionKey(inputs.cardKey, nonce, inputs);

    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, nonce);
    decipher.setAAD(buildAad(sealed.issuedAt, nonce, domain));
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    return null;
  }
}
