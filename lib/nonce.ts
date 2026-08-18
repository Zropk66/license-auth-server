import prisma from '@/lib/prisma';

const seenNonces = new Map<string, number>();
const CLEANUP_INTERVAL_MS = 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [nonce, timestamp] of seenNonces.entries()) {
    if (now - timestamp > 5 * 60 * 1000) {
      seenNonces.delete(nonce);
    }
  }
}, CLEANUP_INTERVAL_MS);

export async function validateNonce(
  nonce?: string | null,
  timestamp?: number | string | null
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: ['security_enforce_nonce', 'security_nonce_tolerance_sec'],
        },
      },
    });

    const config: Record<string, string> = {};
    settings.forEach((s) => {
      config[s.key] = s.value;
    });

    const isEnforced = config.security_enforce_nonce === 'true';
    const toleranceSec = parseInt(config.security_nonce_tolerance_sec || '60', 10);

    if (!nonce || timestamp === undefined || timestamp === null) {
      if (isEnforced) {
        return { valid: false, reason: 'Missing required nonce or timestamp' };
      }
      return { valid: true };
    }

    const now = Date.now();
    const clientTime = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
    if (isNaN(clientTime)) {
      return { valid: false, reason: 'Invalid timestamp format' };
    }

    const diffSec = Math.abs(now - clientTime) / 1000;

    if (diffSec > toleranceSec) {
      return {
        valid: false,
        reason: `Timestamp deviation too large (${Math.round(diffSec)}s > ${toleranceSec}s)`,
      };
    }

    if (seenNonces.has(nonce)) {
      return { valid: false, reason: 'Replay attack detected: nonce already used' };
    }

    seenNonces.set(nonce, now);
    return { valid: true };
  } catch (error: any) {
    console.error('[Nonce] validateNonce error:', error);
    return { valid: true };
  }
}
