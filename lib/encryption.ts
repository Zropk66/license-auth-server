import crypto from 'crypto';

// Get a deterministic 32-byte key from the configured secret key
function getEncryptionKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

// Encryption helpers for License Verification API using AES-256-GCM (authenticated encryption)
// Backward compatible: decryptData can handle both old CBC format (iv:ciphertext) and new GCM format (iv:authTag:ciphertext)

export function encryptData(data: unknown): string {
  if (!process.env.AES_SECRET_KEY) {
    throw new Error('AES_SECRET_KEY is not defined');
  }

  const key = getEncryptionKey(process.env.AES_SECRET_KEY);
  const iv = crypto.randomBytes(12); // GCM uses 12-byte IV
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const plaintext = JSON.stringify(data);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptData(encryptedData: string): unknown {
  if (!process.env.AES_SECRET_KEY) {
    throw new Error('AES_SECRET_KEY is not defined');
  }

  try {
    const parts = encryptedData.split(':');
    const key = getEncryptionKey(process.env.AES_SECRET_KEY);

    let decrypted: string;

    if (parts.length === 3) {
      // New GCM format: iv:authTag:ciphertext
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encryptedText = parts[2];

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
    } else if (parts.length === 2) {
      // Legacy CBC format: iv:ciphertext (backward compatibility)
      const iv = Buffer.from(parts[0], 'hex');
      const encryptedText = parts[1];

      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
    } else {
      throw new Error('Invalid encrypted format');
    }

    return JSON.parse(decrypted);
  } catch {
    throw new Error('Invalid encrypted data');
  }
}
