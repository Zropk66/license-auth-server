import crypto from 'crypto';

/**
 * 授权载荷签发与封解。
 *
 * 与客户端 SecCore 的 BoundPayload 严格对称。密钥流与签名分离，
 * 避免「签名覆盖密文而密钥流依赖签名」的循环依赖：
 *
 *   nonce   = 每次签发随机生成
 *   密钥流  = HKDF-SHA256(卡密 ‖ nonce ‖ HWID)        域 0x01
 *   校验值  = HMAC(HKDF-SHA256(卡密 ‖ nonce ‖ HWID))  域 0x02，截断 16 字节
 *   密文    = 明文 ⊕ 密钥流
 *   签名    = Ed25519(nonce ‖ 校验值 ‖ 密文)          服务端私钥
 *
 * 客户端只持有公钥，无法构造合法签名。解密还需卡密参与，
 * 因此签名被截获也无法解开载荷。
 *
 * HWID 参与派生是防止「一个合法用户抓取响应后分发到任意机器」：
 * 签名与密文都是真实的，此前全部校验都会通过。HWID 影响校验值，
 * 而校验值在签名覆盖范围内，异地机器在验签阶段即被拒绝。
 * 校验值由客户端本地算出，不随包传输，也没有可剥离的字段。
 */

export const NONCE_SIZE = 16;
export const SIGNATURE_SIZE = 64;
export const BINDING_SIZE = 16;
export const MAX_PAYLOAD_SIZE = 65536;
export const MAX_MACHINE_ID = 128;

const DOMAIN_KEYSTREAM = 0x01;
const DOMAIN_BINDING = 0x02;

/**
 * 环境证据，与客户端 EnvironmentEvidence 逐字节对应。
 *
 * 客户端采集的对端证书指纹与代码段摘要原样进入 HKDF 的 info 段。服务端用
 * 自己知道的正确值复现同一 info，两侧一致才能派生出同一密钥。这样就没有
 * 「是否可信」这个布尔判定可供 patch：篡改实测值必然导致派生分叉，表现为
 * AEAD 认证失败，而不是某个可以改写成恒真的分支。
 */
export interface EnvironmentEvidence {
  /** 对端 TLS 证书 SubjectPublicKeyInfo 的 SHA-256 */
  peerCertificate: Buffer;
  /** 各已登记代码段的 SHA-256，最多四个，不足部分补零 */
  regionDigests: Buffer[];
  /** 实际登记的代码段数量，未登记时为 0 */
  regionCount: number;
}

export const EVIDENCE_REGION_SLOTS = 4;
export const EVIDENCE_REGION_DIGEST_SIZE = 32;
export const EVIDENCE_SIZE = 32 + EVIDENCE_REGION_SLOTS * EVIDENCE_REGION_DIGEST_SIZE + 8;

/**
 * 按固定布局序列化证据。字段顺序或宽度任何一侧改动都会导致两侧派生出
 * 不同密钥，且不会报错，只会在解密阶段表现为认证失败。
 */
export function encodeEnvironmentEvidence(evidence: EnvironmentEvidence): Buffer {
  if (evidence.peerCertificate.length !== 32) {
    throw new Error(`peer certificate digest must be 32 bytes, got ${evidence.peerCertificate.length}`);
  }
  if (evidence.regionCount > EVIDENCE_REGION_SLOTS) {
    throw new Error(`region count exceeds ${EVIDENCE_REGION_SLOTS}`);
  }

  const buffer = Buffer.alloc(EVIDENCE_SIZE);
  evidence.peerCertificate.copy(buffer, 0);

  for (let i = 0; i < evidence.regionDigests.length && i < EVIDENCE_REGION_SLOTS; i += 1) {
    const digest = evidence.regionDigests[i];
    if (digest.length !== EVIDENCE_REGION_DIGEST_SIZE) {
      throw new Error(`region digest ${i} must be 32 bytes, got ${digest.length}`);
    }
    digest.copy(buffer, 32 + i * EVIDENCE_REGION_DIGEST_SIZE);
  }

  buffer.writeUInt32LE(evidence.regionCount >>> 0, 32 + EVIDENCE_REGION_SLOTS * EVIDENCE_REGION_DIGEST_SIZE);
  buffer.writeUInt32LE(0, 36 + EVIDENCE_REGION_SLOTS * EVIDENCE_REGION_DIGEST_SIZE);
  return buffer;
}

export interface SealedPayload {
  /** 密文的十六进制表示 */
  cipherHex: string;
  /** Ed25519 签名，覆盖 nonce 与密文 */
  signatureHex: string;
  /** 每次签发随机生成，参与密钥派生且被签名覆盖 */
  nonceHex: string;
}

/**
 * RFC 5869 HKDF-SHA256，与客户端实现一致。
 * 客户端使用相同的 ikm/salt/info 三元组，任一处不同都会导致密钥流分叉。
 */
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

/**
 * 机器绑定密钥派生，与客户端 derive_machine_key 逐字节对应。
 *
 * info 上限与客户端保持一致，超出即拒绝签发而非静默截断。截断会让两台
 * 机器因 HWID 前缀相同而派生出同一密钥，绑定形同虚设。
 */
export function deriveMachineKey(
  cardKey: string,
  nonce: Buffer,
  machineId: string,
  domain: number,
  length: number
): Buffer {
  const idBytes = Buffer.from(machineId, 'utf8');
  if (idBytes.length === 0 || idBytes.length >= MAX_MACHINE_ID) {
    throw new Error(`machine id length out of range: ${idBytes.length}`);
  }

  const info = Buffer.concat([idBytes, Buffer.from([domain])]);
  return hkdfSha256(Buffer.from(cardKey, 'utf8'), nonce, info, length);
}

/**
 * 以环境证据派生密钥，与客户端 EvidenceBinder 逐字节对应。
 *
 * 证据进入 info 段而非参与某个比对。客户端只知道自己测到了什么，不知道
 * 服务端期望什么，因此无法通过修改本地状态来凑出正确密钥。
 */
export function deriveEvidenceKey(
  cardKey: string,
  nonce: Buffer,
  evidence: Buffer,
  domain: number,
  length: number
): Buffer {
  if (evidence.length !== EVIDENCE_SIZE) {
    throw new Error(`evidence size out of range: ${evidence.length}`);
  }

  const info = Buffer.concat([evidence, Buffer.from([domain])]);
  return hkdfSha256(Buffer.from(cardKey, 'utf8'), nonce, info, length);
}

/**
 * 密钥流派生，与客户端 KeyStream 逐字节对应。
 *
 * 分两步：先派生出 32 字节密钥流密钥，再以该密钥为 IKM 做一次标准 HKDF
 * 展开。客户端复用 KeyStream 完成第二步，故此处必须复刻同一顺序。
 */
export function deriveKeyStream(
  cardKey: string,
  nonce: Buffer,
  machineId: string,
  length: number
): Buffer {
  const keyStreamKey = deriveMachineKey(cardKey, nonce, machineId, DOMAIN_KEYSTREAM, 32);
  return hkdfSha256(keyStreamKey, nonce, Buffer.alloc(0), length);
}

/**
 * 绑定校验值，与客户端 compute_binding 逐字节对应。
 * 签名覆盖该值，故异地机器算出的结果不同即导致验签失败。
 */
export function computeBinding(
  cipher: Buffer,
  nonce: Buffer,
  cardKey: string,
  machineId: string
): Buffer {
  const bindingKey = deriveMachineKey(cardKey, nonce, machineId, DOMAIN_BINDING, 32);
  const digest = crypto
    .createHmac('sha256', bindingKey)
    .update(Buffer.concat([nonce, cipher]))
    .digest();
  return digest.subarray(0, BINDING_SIZE);
}

/**
 * 用服务端私钥封装载荷。
 *
 * 签名覆盖 nonce、绑定校验与密文的拼接，因此 nonce 或 HWID 被篡改
 * 与密文被篡改等价，客户端两侧校验合并为一次验签。
 */
export function sealPayload(
  plaintext: Buffer,
  cardKey: string,
  machineId: string,
  privateKeyPem: string
): SealedPayload {
  if (plaintext.length === 0 || plaintext.length > MAX_PAYLOAD_SIZE) {
    throw new Error(`payload size out of range: ${plaintext.length}`);
  }
  if (machineId.length === 0) {
    throw new Error('machine id is required for payload binding');
  }

  const nonce = crypto.randomBytes(NONCE_SIZE);
  const keyStream = deriveKeyStream(cardKey, nonce, machineId, plaintext.length);

  const cipher = Buffer.alloc(plaintext.length);
  for (let i = 0; i < plaintext.length; i += 1) {
    cipher[i] = plaintext[i] ^ keyStream[i];
  }

  const binding = computeBinding(cipher, nonce, cardKey, machineId);
  const signature = crypto.sign(
    null,
    Buffer.concat([nonce, binding, cipher]),
    privateKeyPem
  );

  return {
    cipherHex: cipher.toString('hex'),
    signatureHex: signature.toString('hex'),
    nonceHex: nonce.toString('hex'),
  };
}

/**
 * 服务端侧解封，仅用于自测与运维排查。
 * 客户端不应具备此能力，它只持有公钥。
 */
export function openPayload(
  sealed: SealedPayload,
  cardKey: string,
  machineId: string,
  privateKeyPem: string
): Buffer | null {
  const cipher = Buffer.from(sealed.cipherHex, 'hex');
  const signature = Buffer.from(sealed.signatureHex, 'hex');
  const nonce = Buffer.from(sealed.nonceHex, 'hex');

  if (nonce.length !== NONCE_SIZE || signature.length !== SIGNATURE_SIZE) {
    return null;
  }

  const binding = computeBinding(cipher, nonce, cardKey, machineId);
  const authentic = crypto.verify(
    null,
    Buffer.concat([nonce, binding, cipher]),
    crypto.createPublicKey(privateKeyPem),
    signature
  );

  if (!authentic) return null;

  const keyStream = deriveKeyStream(cardKey, nonce, machineId, cipher.length);
  const plain = Buffer.alloc(cipher.length);
  for (let i = 0; i < cipher.length; i += 1) {
    plain[i] = cipher[i] ^ keyStream[i];
  }

  return plain;
}

/**
 * 载荷结构。客户端按同一布局解析，字段顺序与宽度必须一致，
 * 任何一侧改动都会导致解出的内容错位。
 *
 * 时间字段用 number 而非 bigint：ES2017 目标下 BigInt 字面量不可用，
 * 且毫秒时间戳远未触及 double 的安全整数上限，精度无虞。
 */
export interface LicensePayload {
  /** 服务端签发时间，客户端据此判断时效 */
  issuedAt: number;
  /** 授权到期时间，0 表示永久 */
  expiresAt: number;
  /** 附加自定义载荷字符串 */
  customPayload?: string | null;
}

export const LICENSE_PAYLOAD_SIZE = 8 + 8;

export function encodeLicensePayload(payload: LicensePayload): Buffer {
  const buffer = Buffer.alloc(LICENSE_PAYLOAD_SIZE);
  buffer.writeBigUInt64LE(BigInt(payload.issuedAt), 0);
  buffer.writeBigUInt64LE(BigInt(payload.expiresAt), 8);
  return buffer;
}

export function composeLicensePayload(payload: LicensePayload): Buffer {
  const headerBuf = encodeLicensePayload(payload);
  if (!payload.customPayload || !payload.customPayload.trim()) {
    return headerBuf;
  }
  const buffer = Buffer.concat([headerBuf, Buffer.from(payload.customPayload.trim(), 'utf8')]);
  if (buffer.length > MAX_PAYLOAD_SIZE) {
    throw new Error(`composed payload exceeds ${MAX_PAYLOAD_SIZE} bytes: ${buffer.length}`);
  }
  return buffer;
}

export function decodeLicensePayload(buffer: Buffer): LicensePayload | null {
  if (buffer.length < LICENSE_PAYLOAD_SIZE) return null;
  const customPayload = buffer.length > LICENSE_PAYLOAD_SIZE
    ? buffer.subarray(LICENSE_PAYLOAD_SIZE).toString('utf8')
    : null;
  return {
    issuedAt: Number(buffer.readBigUInt64LE(0)),
    expiresAt: Number(buffer.readBigUInt64LE(8)),
    customPayload,
  };
}

/**
 * 按优先级合并多级自定义载荷：软件默认 → 版本专属 → 卡密专属。
 *
 * 数组与标量载荷无法做字段级合并。若这类载荷出现在更靠后的层级，
 * 说明是更高优先级的显式覆盖，应整体替换而非丢弃，否则管理员为
 * 单个卡密配置的数组会被静默忽略。
 */
export function mergeCustomPayloads(
  ...payloads: Array<string | null | undefined>
): string | null {
  const validStrings = payloads.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
  if (validStrings.length === 0) return null;
  if (validStrings.length === 1) return validStrings[0].trim();

  let mergedObj: Record<string, unknown> = {};
  let hasMergedObject = false;
  let lastMergedIndex = -1;
  let lastRawIndex = -1;
  let lastRawString = '';

  function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    for (const key of Object.keys(source)) {
      const srcVal = source[key];
      const tgtVal = target[key];
      if (
        srcVal &&
        typeof srcVal === 'object' &&
        !Array.isArray(srcVal) &&
        tgtVal &&
        typeof tgtVal === 'object' &&
        !Array.isArray(tgtVal)
      ) {
        target[key] = deepMerge({ ...(tgtVal as Record<string, unknown>) }, srcVal as Record<string, unknown>);
      } else {
        target[key] = srcVal;
      }
    }
    return target;
  }

  for (let i = 0; i < validStrings.length; i += 1) {
    const str = validStrings[i].trim();
    try {
      const parsed = JSON.parse(str);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        mergedObj = deepMerge(mergedObj, parsed as Record<string, unknown>);
        hasMergedObject = true;
        lastMergedIndex = i;
      } else {
        lastRawString = str;
        lastRawIndex = i;
      }
    } catch {
      lastRawString = str;
      lastRawIndex = i;
    }
  }

  if (!hasMergedObject) return lastRawString;
  return lastRawIndex > lastMergedIndex ? lastRawString : JSON.stringify(mergedObj);
}
