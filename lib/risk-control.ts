import prisma from './prisma.ts';

interface LicenseFailureEntry {
  count: number;
  firstAttemptAt: number;
  lockedUntil: number;
}

const licenseFailures = new Map<string, LicenseFailureEntry>();
const CLEANUP_WINDOW_MS = 60 * 60 * 1000;
/** 撞库会携带随机卡密，需限定内存占用上限 */
const MAX_TRACKED_LICENSES = 10000;

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of licenseFailures.entries()) {
    if (now > entry.lockedUntil && now - entry.firstAttemptAt > CLEANUP_WINDOW_MS) {
      licenseFailures.delete(key);
    }
  }
}, 5 * 60 * 1000);
cleanupTimer.unref?.();

interface RiskConfig {
  failMax: number;
  lockMinutes: number;
  blockBogusHwid: boolean;
}

/** 读取风控参数。缺省值保守取值，避免配置缺失时风控失效 */
async function getRiskConfig(): Promise<RiskConfig> {
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: ['risk_license_fail_max', 'risk_license_lock_min', 'risk_bogus_hwid_block'],
      },
    },
  });

  const getNum = (key: string, fallback: number) => {
    const val = settings.find((s) => s.key === key)?.value;
    const n = val ? parseInt(val, 10) : fallback;
    return isNaN(n) || n <= 0 ? fallback : n;
  };

  const bogusFlag = settings.find((s) => s.key === 'risk_bogus_hwid_block')?.value;
  return {
    failMax: getNum('risk_license_fail_max', 5),
    lockMinutes: getNum('risk_license_lock_min', 30),
    // 未配置时默认开启，与既有拦截行为保持一致
    blockBogusHwid: bogusFlag === undefined ? true : bogusFlag === 'true',
  };
}

export async function isBogusHwidBlockEnabled(): Promise<boolean> {
  const config = await getRiskConfig();
  return config.blockBogusHwid;
}

export function isBogusHwid(hwid?: string | null): { bogus: boolean; reason?: string } {
  if (!hwid) return { bogus: false };
  const trimmed = hwid.trim();

  if (trimmed.length < 8) {
    return { bogus: true, reason: '设备标识长度异常过短' };
  }

  if (/^0+$/i.test(trimmed)) {
    return { bogus: true, reason: '设备标识为全零伪造值' };
  }

  if (/^f+$/i.test(trimmed)) {
    return { bogus: true, reason: '设备标识为全F伪造值' };
  }

  if (/^(.)\1{7,}$/.test(trimmed)) {
    return { bogus: true, reason: '设备标识为单一重复字符' };
  }

  const commonSandboxPatterns = [
    '00000000-0000-0000-0000-000000000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    '12345678-1234-1234-1234-123456789abc',
    'sandbox',
    'emulator',
    'vmware',
  ];

  const lower = trimmed.toLowerCase();
  for (const pattern of commonSandboxPatterns) {
    if (lower === pattern || lower.includes(pattern)) {
      return { bogus: true, reason: '命中沙箱虚拟化默认设备指纹' };
    }
  }

  return { bogus: false };
}

export async function checkLicenseRisk(
  licenseKey: string
): Promise<{ blocked: boolean; reason?: string }> {
  const entry = licenseFailures.get(licenseKey);
  if (!entry) return { blocked: false };

  const now = Date.now();
  if (now < entry.lockedUntil) {
    const remainMinutes = Math.ceil((entry.lockedUntil - now) / 60000);
    return {
      blocked: true,
      reason: `该卡密连续尝试失败次数过多，安全锁定中，剩余 ${remainMinutes} 分钟`,
    };
  }

  return { blocked: false };
}

export async function recordLicenseFailure(
  licenseKey: string,
  ip: string,
  reason: string
): Promise<void> {
  const { failMax, lockMinutes } = await getRiskConfig();

  const now = Date.now();
  let entry = licenseFailures.get(licenseKey);

  // 锁定期已结束或计数窗口过期则从零开始，否则解锁后一次失败会立即再锁
  const lockExpired = entry !== undefined && entry.lockedUntil > 0 && now > entry.lockedUntil;
  const windowExpired = entry !== undefined && now - entry.firstAttemptAt > CLEANUP_WINDOW_MS;
  if (entry && (lockExpired || windowExpired)) {
    entry = undefined;
    licenseFailures.delete(licenseKey);
  }

  if (!entry) {
    // 防止撞库时随机卡密把内存撑爆：超限时丢弃最早插入的条目
    if (licenseFailures.size >= MAX_TRACKED_LICENSES) {
      const oldest = licenseFailures.keys().next().value;
      if (oldest !== undefined) licenseFailures.delete(oldest);
    }
    entry = { count: 0, firstAttemptAt: now, lockedUntil: 0 };
  }

  entry.count += 1;

  if (entry.count >= failMax) {
    entry.lockedUntil = now + lockMinutes * 60 * 1000;
    console.warn(`[RiskControl] License ${licenseKey} locked for ${lockMinutes}m after ${entry.count} failures. Last IP: ${ip}, Reason: ${reason}`);
  }

  licenseFailures.set(licenseKey, entry);
}

export function recordLicenseSuccess(licenseKey: string): void {
  licenseFailures.delete(licenseKey);
}
