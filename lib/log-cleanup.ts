import prisma from './prisma';

interface CleanupResult {
  verificationAttemptsDeleted: number;
  auditLogsDeleted: number;
}

async function getCleanupConfig() {
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: ['log_cleanup_verify_days', 'log_cleanup_audit_days', 'log_cleanup_auto_enabled'],
      },
    },
  });

  const get = (key: string, fallback: number) => {
    const val = settings.find((s) => s.key === key)?.value;
    const num = val ? parseInt(val, 10) : fallback;
    return isNaN(num) || num <= 0 ? fallback : num;
  };

  const getBool = (key: string, fallback: boolean) => {
    const val = settings.find((s) => s.key === key)?.value;
    if (val === undefined) return fallback;
    return val !== 'false';
  };

  return {
    verifyDays: get('log_cleanup_verify_days', 7),
    auditDays: get('log_cleanup_audit_days', 90),
    autoEnabled: getBool('log_cleanup_auto_enabled', true),
  };
}

export async function cleanupLogs(): Promise<CleanupResult> {
  const config = await getCleanupConfig();
  const now = new Date();

  const verifyCutoff = new Date(now.getTime() - config.verifyDays * 24 * 60 * 60 * 1000);
  const auditCutoff = new Date(now.getTime() - config.auditDays * 24 * 60 * 60 * 1000);

  const [verifyResult, auditResult] = await Promise.all([
    prisma.verificationAttempt.deleteMany({
      where: { createdAt: { lt: verifyCutoff } },
    }),
    prisma.auditLog.deleteMany({
      where: { createdAt: { lt: auditCutoff } },
    }),
  ]);

  console.info(
    `[LogCleanup] Deleted ${verifyResult.count} verification attempts (>${config.verifyDays}d), ${auditResult.count} audit logs (>${config.auditDays}d)`
  );

  return {
    verificationAttemptsDeleted: verifyResult.count,
    auditLogsDeleted: auditResult.count,
  };
}

let autoCleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoCleanup() {
  if (autoCleanupTimer) return;

  const run = async () => {
    try {
      const config = await getCleanupConfig();
      if (config.autoEnabled) {
        await cleanupLogs();
      }
    } catch (err) {
      console.error('[LogCleanup] Auto cleanup failed:', err);
    }
  };

  const SIX_HOURS = 6 * 60 * 60 * 1000;
  autoCleanupTimer = setInterval(run, SIX_HOURS);
  autoCleanupTimer.unref?.();

  setTimeout(run, 60_000).unref?.();
}

export function stopAutoCleanup() {
  if (autoCleanupTimer) {
    clearInterval(autoCleanupTimer);
    autoCleanupTimer = null;
  }
}
