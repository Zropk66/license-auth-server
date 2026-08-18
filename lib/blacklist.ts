import prisma from '@/lib/prisma';
import { sendAlert } from '@/lib/notification';

interface SuspiciousActivityCounter {
  count: number;
  firstAttemptAt: number;
}

const suspiciousStore = new Map<string, SuspiciousActivityCounter>();
const COUNTER_WINDOW_MS = 60 * 60 * 1000;

export async function isBlacklisted(
  ip: string,
  hwid?: string | null
): Promise<{ blacklisted: boolean; reason?: string }> {
  try {
    const now = new Date();
    const records = await prisma.blacklist.findMany({
      where: {
        OR: [
          { type: 'ip', value: ip },
          ...(hwid ? [{ type: 'hwid', value: hwid }] : []),
        ],
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        ],
      },
    });

    if (records.length > 0) {
      return {
        blacklisted: true,
        reason: records[0].reason || 'Target is in security blacklist',
      };
    }
    return { blacklisted: false };
  } catch (error) {
    console.error('[Blacklist] isBlacklisted check failed:', error);
    return { blacklisted: false };
  }
}

export async function recordSuspiciousActivity(
  ip: string,
  type: 'rate_limit' | 'bruteforce',
  hwid?: string | null
) {
  try {
    const key = `${ip}:${hwid || ''}`;
    const now = Date.now();
    const entry = suspiciousStore.get(key);

    let currentCount = 1;
    if (!entry || now - entry.firstAttemptAt > COUNTER_WINDOW_MS) {
      suspiciousStore.set(key, { count: 1, firstAttemptAt: now });
    } else {
      entry.count += 1;
      currentCount = entry.count;
    }

    const thresholdSetting = await prisma.setting.findUnique({
      where: { key: 'security_auto_blacklist_threshold' },
    });
    const threshold = thresholdSetting ? parseInt(thresholdSetting.value, 10) || 20 : 20;

    if (currentCount >= threshold) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const reason = `系统自适应防御：1小时内累计触发 ${currentCount} 次${type === 'rate_limit' ? '高频超限' : '撞库异常'}`;

      await prisma.blacklist.upsert({
        where: { type_value: { type: 'ip', value: ip } },
        create: {
          type: 'ip',
          value: ip,
          reason,
          isAuto: true,
          expiresAt,
        },
        update: {
          reason,
          isAuto: true,
          expiresAt,
        },
      });

      if (hwid) {
        await prisma.blacklist.upsert({
          where: { type_value: { type: 'hwid', value: hwid } },
          create: {
            type: 'hwid',
            value: hwid,
            reason,
            isAuto: true,
            expiresAt,
          },
          update: {
            reason,
            isAuto: true,
            expiresAt,
          },
        });
      }

      suspiciousStore.delete(key);

      sendAlert({
        title: '🛡️ 触发自适应安全防御封禁',
        message: `IP: ${ip}${hwid ? `\nHWID: ${hwid}` : ''}\n原因: ${reason}\n封禁时长: 24小时 (自动解除)`,
        level: 'danger',
        eventType: 'blacklist_hit',
        metadata: { ip, hwid, reason },
      });
    }
  } catch (error) {
    console.error('[Blacklist] recordSuspiciousActivity failed:', error);
  }
}
