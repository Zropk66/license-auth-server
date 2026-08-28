import prisma from './prisma';

/**
 * 扫描并原子收割超时失活的会话
 * 将 status='active' 且 lastHeartbeat 超时的会话置为 status='terminated', terminatedAt=lastHeartbeat
 */
export async function reapExpiredSessions(): Promise<number> {
  try {
    const timeoutSetting = await prisma.setting.findUnique({
      where: { key: 'session_timeout' },
    });
    const timeoutSeconds = timeoutSetting ? parseInt(timeoutSetting.value, 10) : 300;
    const effectiveTimeout = isNaN(timeoutSeconds) || timeoutSeconds <= 0 ? 300 : timeoutSeconds;
    const cutoff = new Date(Date.now() - effectiveTimeout * 1000);

    const updatedCount = await prisma.$executeRaw`
      UPDATE "Session"
      SET "status" = 'terminated', "terminatedAt" = "lastHeartbeat"
      WHERE "status" = 'active' AND "lastHeartbeat" < ${cutoff}
    `;

    const count = Number(updatedCount);
    if (count > 0) {
      console.info(`[SessionReaper] 自动标记 ${count} 个超时会话为已下线 (阈值: ${effectiveTimeout}s)`);
    }

    return count;
  } catch (err) {
    console.error('[SessionReaper] 收割超时会话失败:', err);
    return 0;
  }
}

/**
 * 清洗历史脏数据：
 * 若历史已下线会话 (status='terminated') 的下线时间异常晚于最后心跳超过 5 分钟，
 * 将其 terminatedAt 物理回正为该会话真实的 lastHeartbeat
 */
export async function sanitizeHistoricalSessions(): Promise<number> {
  try {
    const cleanedCount = await prisma.$executeRaw`
      UPDATE "Session"
      SET "terminatedAt" = "lastHeartbeat"
      WHERE "status" = 'terminated'
        AND "terminatedAt" IS NOT NULL
        AND "terminatedAt" > "lastHeartbeat" + INTERVAL '5 minutes'
    `;
    const count = Number(cleanedCount);
    if (count > 0) {
      console.info(`[SessionReaper] 成功清洗 ${count} 条下线时间异常的历史脏会话记录`);
    }
    return count;
  } catch (err) {
    console.error('[SessionReaper] 清洗历史脏会话记录失败:', err);
    return 0;
  }
}

// 全局单例定时器，防止 Next.js 热重载/多模块引用时启动重复定时任务
const globalForReaper = global as unknown as { sessionReaperTimer: NodeJS.Timeout | null };

export function startSessionReaper() {
  if (globalForReaper.sessionReaperTimer) return;

  const ONE_MINUTE = 60 * 1000;
  globalForReaper.sessionReaperTimer = setInterval(() => {
    reapExpiredSessions();
  }, ONE_MINUTE);

  globalForReaper.sessionReaperTimer.unref?.();

  // 启动即先执行一次收割与历史脏数据清洗
  reapExpiredSessions();
  sanitizeHistoricalSessions();
}

export function stopSessionReaper() {
  if (globalForReaper.sessionReaperTimer) {
    clearInterval(globalForReaper.sessionReaperTimer);
    globalForReaper.sessionReaperTimer = null;
  }
}
