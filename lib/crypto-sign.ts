import crypto from 'crypto';

/**
 * 缓存运行时密钥对（开发未配置环境变量时做回退支持）
 */
let cachedKeyPair: { privateKey: string; publicKey: string } | null = null;

export function getOrCreateKeyPair(): { privateKey: string; publicKey: string } {
  if (process.env.AUTH_PRIVATE_KEY && process.env.AUTH_PUBLIC_KEY) {
    return {
      privateKey: process.env.AUTH_PRIVATE_KEY.replace(/\\n/g, '\n'),
      publicKey: process.env.AUTH_PUBLIC_KEY.replace(/\\n/g, '\n'),
    };
  }

  if (!cachedKeyPair) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    cachedKeyPair = { privateKey, publicKey };
  }

  return cachedKeyPair;
}

/**
 * 使用服务端私钥对数据对象进行 Ed25519 数字签名
 */
export function signPayload<T extends object>(data: T): { data: T; signature: string } {
  const { privateKey } = getOrCreateKeyPair();
  const dataString = JSON.stringify(data);
  const signature = crypto.sign(null, Buffer.from(dataString, 'utf8'), privateKey);
  return {
    data,
    signature: signature.toString('hex'),
  };
}

/**
 * 使用公钥验证数据与 Ed25519 签名
 */
export function verifyPayload(data: unknown, signatureHex: string, publicKeyPem?: string): boolean {
  try {
    const key = publicKeyPem ? publicKeyPem.replace(/\\n/g, '\n') : getOrCreateKeyPair().publicKey;
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto.verify(
      null,
      Buffer.from(dataString, 'utf8'),
      key,
      Buffer.from(signatureHex, 'hex')
    );
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}
