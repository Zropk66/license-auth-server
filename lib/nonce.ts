import prisma from '@/lib/prisma';

/**
 * 防重放校验（v2 协议强化版）
 *
 * v2 变更：
 *  - nonce 与 timestamp 必填（不再依赖 security_enforce_nonce 开关）
 *  - 内部异常 fail-closed（原为 fail-open，直接放行）
 *  - 时间容差仍读取 security_nonce_tolerance_sec（默认 60 秒）
 *
 * nonce 去重基于进程内存 Map：仅适用于单实例部署；横向扩容时需迁移至 Redis 等共享存储。
 */
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
          in: ['security_nonce_tolerance_sec'],
        },
      },
    });

    const config: Record<string, string> = {};
    settings.forEach((s) => {
      config[s.key] = s.value;
    });

    const toleranceSec = parseInt(config.security_nonce_tolerance_sec || '60', 10);

    if (!nonce || timestamp === undefined || timestamp === null) {
      return { valid: false, reason: 'Missing required nonce or timestamp' };
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
    return { valid: false, reason: 'Nonce validation internal error' };
  }
}
