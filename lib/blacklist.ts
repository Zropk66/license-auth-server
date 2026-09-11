import prisma from '@/lib/prisma';
import { sendAlert } from '@/lib/notification';

interface SuspiciousActivityCounter {
  count: number;
  firstAttemptAt: number;
}

const suspiciousStore = new Map<string, SuspiciousActivityCounter>();
const COUNTER_WINDOW_MS = 60 * 60 * 1000;

function ipToLong(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return -1;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function matchIpCidrOrWildcard(clientIp: string, rule: string): boolean {
  if (clientIp === rule) return true;
  if (rule.includes('/')) {
    const [range, prefixStr] = rule.split('/');
    const prefix = parseInt(prefixStr, 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;
    const clientLong = ipToLong(clientIp);
    const rangeLong = ipToLong(range);
    if (clientLong === -1 || rangeLong === -1) return false;
    const mask = prefix === 0 ? 0 : ((0xFFFFFFFF << (32 - prefix)) >>> 0);
    return (clientLong & mask) === (rangeLong & mask);
  }
  if (rule.includes('*')) {
    const regex = new RegExp('^' + rule.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
    return regex.test(clientIp);
  }
  return false;
}

export async function isBlacklisted(
  ip: string,
  hwid?: string | null
): Promise<{ blacklisted: boolean; reason?: string }> {
  try {
    const now = new Date();
    const activeRecords = await prisma.blacklist.findMany({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    for (const record of activeRecords) {
      if (record.type === 'ip' && matchIpCidrOrWildcard(ip, record.value)) {
        return {
          blacklisted: true,
          reason: record.reason || `IP 命中安全黑名单 (${record.value})`,
        };
      }
      if (record.type === 'hwid' && hwid) {
        if (record.value === hwid || (record.value.includes('*') && new RegExp('^' + record.value.replace(/\*/g, '.*') + '$').test(hwid))) {
          return {
            blacklisted: true,
            reason: record.reason || `设备 HWID 命中安全黑名单 (${record.value})`,
          };
        }
      }
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
        title: '触发自适应安全防御封禁',
        message: `IP: ${ip}${hwid ? `\nHWID: ${hwid}` : ''}\n原因: ${reason}\n封禁时长: 24小时`,
        level: 'danger',
        eventType: 'blacklist_hit',
        metadata: { ip, hwid, reason },
      });
    }
  } catch (error) {
    console.error('[Blacklist] recordSuspiciousActivity failed:', error);
  }
}

