import prisma from './prisma';

export interface CleanupResult {
  verificationAttemptsDeleted: number;
  auditLogsDeleted: number;
}

export interface LogStats {
  verifyCount: number;
  auditCount: number;
  verifySizeBytes: number;
  auditSizeBytes: number;
  totalSizeBytes: number;
  totalSizeMb: number;
  /** 表物理占用含删除后残留的空洞页，仅供展示，不作为阈值判定依据 */
  physicalSizeBytes: number;
  physicalSizeMb: number;
}

export interface CleanupConfig {
  mode: 'date' | 'size' | 'both';
  verifyDays: number;
  auditDays: number;
  maxSizeMb: number;
  autoEnabled: boolean;
}

/**
 * 容量统计必须基于存活行数的估算。
 *
 * PostgreSQL 的 DELETE 不归还物理页，pg_total_relation_size 在删除后不会回落。
 * 若用它判定容量，清理一轮后仍显示超阈，之后每次巡检都继续删，直到日志被清空。
 */
export async function getLogStats(): Promise<LogStats> {
  const [verifyCount, auditCount] = await Promise.all([
    prisma.verificationAttempt.count(),
    prisma.auditLog.count(),
  ]);

  const verifySizeBytes = verifyCount * 256;
  const auditSizeBytes = auditCount * 384;

  let physicalSizeBytes = verifySizeBytes + auditSizeBytes;

  try {
    const rawSizes = await prisma.$queryRaw<Array<{ verify_size: bigint; audit_size: bigint }>>`
      SELECT
        pg_total_relation_size('"VerificationAttempt"') as verify_size,
        pg_total_relation_size('"AuditLog"') as audit_size
    `;
    if (rawSizes && rawSizes[0]) {
      const v = Number(rawSizes[0].verify_size);
      const a = Number(rawSizes[0].audit_size);
      if (!isNaN(v) && !isNaN(a) && v + a > 0) physicalSizeBytes = v + a;
    }
  } catch {
    // 降级使用均值估算
  }

  const totalSizeBytes = verifySizeBytes + auditSizeBytes;

  return {
    verifyCount,
    auditCount,
    verifySizeBytes,
    auditSizeBytes,
    totalSizeBytes,
    totalSizeMb: Number((totalSizeBytes / (1024 * 1024)).toFixed(2)),
    physicalSizeBytes,
    physicalSizeMb: Number((physicalSizeBytes / (1024 * 1024)).toFixed(2)),
  };
}

export async function getCleanupConfig(): Promise<CleanupConfig> {
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: [
          'log_cleanup_mode',
          'log_cleanup_verify_days',
          'log_cleanup_audit_days',
          'log_cleanup_max_size_mb',
          'log_cleanup_auto_enabled',
        ],
      },
    },
  });

  const getStr = (key: string, fallback: string) => {
    return settings.find((s) => s.key === key)?.value || fallback;
  };

  const getNum = (key: string, fallback: number) => {
    const val = settings.find((s) => s.key === key)?.value;
    const num = val ? parseInt(val, 10) : fallback;
    return isNaN(num) || num <= 0 ? fallback : num;
  };

  const getBool = (key: string, fallback: boolean) => {
    const val = settings.find((s) => s.key === key)?.value;
    if (val === undefined) return fallback;
    return val !== 'false';
  };

  const modeVal = getStr('log_cleanup_mode', 'date');
  const mode = modeVal === 'size' || modeVal === 'both' ? modeVal : 'date';

  return {
    mode,
    verifyDays: getNum('log_cleanup_verify_days', 7),
    auditDays: getNum('log_cleanup_audit_days', 90),
    maxSizeMb: getNum('log_cleanup_max_size_mb', 50),
    autoEnabled: getBool('log_cleanup_auto_enabled', true),
  };
}

export async function cleanupLogs(customConfig?: Partial<CleanupConfig>): Promise<CleanupResult> {
  const defaultConfig = await getCleanupConfig();
  const config: CleanupConfig = { ...defaultConfig, ...customConfig };

  let verifyDeleted = 0;
  let auditDeleted = 0;

  if (config.mode === 'date' || config.mode === 'both') {
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

    verifyDeleted += verifyResult.count;
    auditDeleted += auditResult.count;
  }

  if (config.mode === 'size' || config.mode === 'both') {
    const stats = await getLogStats();
    if (stats.totalSizeMb > config.maxSizeMb) {
      const targetBytes = config.maxSizeMb * 0.8 * 1024 * 1024;
      const excessBytes = stats.totalSizeBytes - targetBytes;

      if (excessBytes > 0 && stats.totalSizeBytes > 0) {
        const pruneRatio = Math.min(0.9, excessBytes / stats.totalSizeBytes);
        const verifyPruneCount = Math.ceil(stats.verifyCount * pruneRatio);
        const auditPruneCount = Math.ceil(stats.auditCount * pruneRatio);

        if (verifyPruneCount > 0 && stats.verifyCount > 0) {
          const oldest = await prisma.verificationAttempt.findMany({
            select: { createdAt: true },
            orderBy: { createdAt: 'asc' },
            skip: Math.min(stats.verifyCount - 1, verifyPruneCount - 1),
            take: 1,
          });
          if (oldest[0]) {
            const res = await prisma.verificationAttempt.deleteMany({
              where: { createdAt: { lte: oldest[0].createdAt } },
            });
            verifyDeleted += res.count;
          }
        }

        if (auditPruneCount > 0 && stats.auditCount > 0) {
          const oldest = await prisma.auditLog.findMany({
            select: { createdAt: true },
            orderBy: { createdAt: 'asc' },
            skip: Math.min(stats.auditCount - 1, auditPruneCount - 1),
            take: 1,
          });
          if (oldest[0]) {
            const res = await prisma.auditLog.deleteMany({
              where: { createdAt: { lte: oldest[0].createdAt } },
            });
            auditDeleted += res.count;
          }
        }
      }
    }
  }

  return {
    verificationAttemptsDeleted: verifyDeleted,
    auditLogsDeleted: auditDeleted,
  };
}

// 挂到 global 防止 Next.js 热重载或重复引用时启动多个定时器
const globalForCleanup = global as unknown as { logCleanupTimer: ReturnType<typeof setInterval> | null };

export function startAutoCleanup() {
  if (globalForCleanup.logCleanupTimer) return;

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
  globalForCleanup.logCleanupTimer = setInterval(run, SIX_HOURS);
  globalForCleanup.logCleanupTimer.unref?.();

  setTimeout(run, 60_000).unref?.();
}

export function stopAutoCleanup() {
  if (globalForCleanup.logCleanupTimer) {
    clearInterval(globalForCleanup.logCleanupTimer);
    globalForCleanup.logCleanupTimer = null;
  }
}
