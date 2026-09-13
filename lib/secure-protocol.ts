import crypto from 'crypto';

/**
 * v2 信封加密传输协议
 *
 * 结构：
 *   请求  { v: 2, envelope: base64(RSA-OAEP-SHA256(pub, 会话密钥)), payload: "iv:tag:ct" }
 *   响应  { v: 2, payload: "iv:tag:ct" }   ← AES-256-GCM(会话密钥, 响应JSON)，统一 HTTP 200
 *
 * 会话密钥由客户端每请求随机生成（32 字节），仅存双方内存，不落盘、不跨请求。
 * 解密失败的请求一律返回 opaqueResponse()：外形与真实响应一致、内容为随机字节，
 * 不向探测者暴露失败原因。
 */

export interface DecryptedRequest {
  body: Record<string, unknown>;
  sessionKey: Buffer;
}

/** 安全提取解密载荷中的字符串字段（非法类型视为缺失） */
export function strField(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** 安全提取解密载荷中的数字字段（非法类型视为缺失） */
export function numField(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

export type SecureWireResponse = { v: 2; payload: string };

const RSA_OAEP_OPTIONS = {
  padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: 'sha256',
} as const;

/**
 * 开发回退：RSA_PRIVATE_KEY 未配置时生成临时密钥对（进程内缓存）。
 * 重启后密钥变更，客户端须同步新公钥。生产环境必须显式配置。
 */
let cachedFallbackKeyPair: { privateKey: string; publicKey: string } | null = null;

function getRsaPrivateKey(): string | null {
  const fromEnv = process.env.RSA_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (fromEnv) return fromEnv;

  if (!cachedFallbackKeyPair) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    cachedFallbackKeyPair = { privateKey, publicKey };
    console.warn(
      '[SecureProtocol] RSA_PRIVATE_KEY 未配置，已生成临时 RSA-2048 密钥对（重启后变更，客户端须同步公钥）:\n' +
        publicKey
    );
  }
  return cachedFallbackKeyPair.privateKey;
}

function isHex(s: string, expectedBytes?: number): boolean {
  if (!/^[0-9a-fA-F]+$/.test(s)) return false;
  if (expectedBytes !== undefined && s.length !== expectedBytes * 2) return false;
  return s.length % 2 === 0;
}

/**
 * 解开请求信封
 */
export function decryptEnvelope(raw: unknown): DecryptedRequest | null {
  try {
    const obj = (raw ?? {}) as Record<string, unknown>;
    if (obj.v !== 2 || typeof obj.envelope !== 'string' || typeof obj.payload !== 'string') {
      return null;
    }

    const privateKey = getRsaPrivateKey();
    if (!privateKey) return null;

    const sessionKey = crypto.privateDecrypt(
      { key: privateKey, ...RSA_OAEP_OPTIONS },
      Buffer.from(obj.envelope, 'base64')
    );
    if (sessionKey.length !== 32) return null;

    const parts = obj.payload.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, ctHex] = parts;
    if (!isHex(ivHex, 12) || !isHex(tagHex, 16) || !isHex(ctHex)) return null;

    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ctHex, 'hex')),
      decipher.final(),
    ]);

    const body = JSON.parse(plaintext.toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

    return { body, sessionKey };
  } catch {
    return null;
  }
}

/**
 * 用会话密钥加密响应。格式与客户端约定一致：iv:authTag:ciphertext（hex）。
 */
export function encryptResponse(sessionKey: Buffer, data: unknown): SecureWireResponse {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'),
    cipher.final(),
  ]);
  return {
    v: 2,
    payload: `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`,
  };
}

export function opaqueResponse(): SecureWireResponse {
  const len = 128 + Math.floor(Math.random() * 385);
  return {
    v: 2,
    payload: `${crypto.randomBytes(12).toString('hex')}:${crypto.randomBytes(16).toString('hex')}:${crypto.randomBytes(len).toString('hex')}`,
  };
}

export function isWellFormedEnvelope(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const obj = raw as Record<string, unknown>;
  if (obj.v !== 2) return false;
  if (typeof obj.envelope !== 'string' || obj.envelope.length < 128) return false;
  if (typeof obj.payload !== 'string') return false;
  const parts = obj.payload.split(':');
  if (parts.length !== 3) return false;
  const [ivHex, tagHex, ctHex] = parts;
  return isHex(ivHex, 12) && isHex(tagHex, 16) && isHex(ctHex);
}

export function expiredPlaintextResponse(customMessage?: string) {
  return {
    success: false,
    code: 'VERSION_EXPIRED',
    message: customMessage || '当前版本已过期，请获取最新版本后使用。',
  };
}

export interface VersionCheckResult {
  allowed: boolean;
  reason?: 'software_disabled' | 'version_expired';
  message?: string;
}

export function checkSoftwareVersionAllowed(
  clientVersionCode: number | undefined,
  software: {
    enabled: boolean;
    minVersionCode?: number | null;
    maxVersionCode?: number | null;
  }
): VersionCheckResult {
  if (!software.enabled) {
    return {
      allowed: false,
      reason: 'software_disabled',
      message: '所属软件已被管理员停用，该软件下所有授权暂不可用。',
    };
  }

  const currentCode = clientVersionCode ?? 0;

  if (software.minVersionCode != null && currentCode < software.minVersionCode) {
    return {
      allowed: false,
      reason: 'version_expired',
      message: '当前版本已过期，请获取最新版本后使用。',
    };
  }

  if (software.maxVersionCode != null && currentCode > software.maxVersionCode) {
    return {
      allowed: false,
      reason: 'version_expired',
      message: '当前版本已过期，请获取最新版本后使用。',
    };
  }

  return { allowed: true };
}
