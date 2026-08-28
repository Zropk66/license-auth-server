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

// 全局单例定时器，防止 Next.js 热重载/多模块引用时启动重复定时任务
const globalForReaper = global as unknown as { sessionReaperTimer: NodeJS.Timeout | null };

export function startSessionReaper() {
  if (globalForReaper.sessionReaperTimer) return;

  const ONE_MINUTE = 60 * 1000;
  globalForReaper.sessionReaperTimer = setInterval(() => {
    reapExpiredSessions();
  }, ONE_MINUTE);

  globalForReaper.sessionReaperTimer.unref?.();

  // 启动即先执行一次
  reapExpiredSessions();
}

export function stopSessionReaper() {
  if (globalForReaper.sessionReaperTimer) {
    clearInterval(globalForReaper.sessionReaperTimer);
    globalForReaper.sessionReaperTimer = null;
  }
}
