import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';

export async function getUnbindStatus(licenseId: string, userId: string) {
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: ['unbind_enabled', 'unbind_max_per_month', 'unbind_cooldown_hours', 'unbind_deduct_hours'],
      },
    },
  });

  const config: Record<string, string> = {};
  settings.forEach((s) => {
    config[s.key] = s.value;
  });

  const enabled = config.unbind_enabled === 'true';
  const baseMaxPerMonth = config.unbind_max_per_month !== undefined ? parseInt(config.unbind_max_per_month, 10) : 0;
  const cooldownHours = parseInt(config.unbind_cooldown_hours || '24', 10);
  const deductHours = parseInt(config.unbind_deduct_hours || '0', 10);

  const license = await prisma.license.findUnique({
    where: { id: licenseId },
  });

  if (!license || license.userId !== userId) {
    return null;
  }

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const isSameMonth = license.unbindCountMonth === currentMonthKey;
  const currentMonthlyCount = isSameMonth ? license.monthlyUnbindCount : 0;
  const effectiveExtraCount = isSameMonth ? (license.extraUnbindCount || 0) : 0;

  const maxPerMonth = baseMaxPerMonth + effectiveExtraCount;
  const remaining = Math.max(0, maxPerMonth - currentMonthlyCount);

  let cooldownRemainingHours = 0;
  if (license.lastUnboundAt && cooldownHours > 0) {
    const elapsedHours = (now.getTime() - new Date(license.lastUnboundAt).getTime()) / (1000 * 60 * 60);
    if (elapsedHours < cooldownHours) {
      cooldownRemainingHours = Math.ceil(cooldownHours - elapsedHours);
    }
  }

  return {
    enabled,
    allowSelfUnbind: license.allowSelfUnbind !== false,
    isBound: !!license.hwid,
    maxPerMonth,
    usedThisMonth: currentMonthlyCount,
    remaining,
    cooldownRemainingHours,
    deductHours,
    lastUnboundAt: license.lastUnboundAt,
  };
}

export async function processSelfServiceUnbind(licenseId: string, userId: string) {
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: ['unbind_enabled', 'unbind_max_per_month', 'unbind_cooldown_hours', 'unbind_deduct_hours'],
      },
    },
  });

  const config: Record<string, string> = {};
  settings.forEach((s) => {
    config[s.key] = s.value;
  });

  if (config.unbind_enabled !== 'true') {
    throw new Error('系统当前未开启用户自助换绑功能');
  }

  const baseMaxPerMonth = config.unbind_max_per_month !== undefined ? parseInt(config.unbind_max_per_month, 10) : 0;
  const cooldownHours = parseInt(config.unbind_cooldown_hours || '24', 10);
  const deductHours = parseInt(config.unbind_deduct_hours || '0', 10);

  const license = await prisma.license.findUnique({
    where: { id: licenseId },
  });

  if (!license || license.userId !== userId) {
    throw new Error('授权不存在或无权操作');
  }

  if (license.allowSelfUnbind === false) {
    throw new Error('该卡密已被管理员单独禁用自助换绑功能');
  }

  if (!license.hwid) {
    throw new Error('当前授权尚未绑定任何设备');
  }

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const isSameMonth = license.unbindCountMonth === currentMonthKey;
  const currentMonthlyCount = isSameMonth ? license.monthlyUnbindCount : 0;
  const effectiveExtraCount = isSameMonth ? (license.extraUnbindCount || 0) : 0;

  const maxPerMonth = baseMaxPerMonth + effectiveExtraCount;

  if (currentMonthlyCount >= maxPerMonth) {
    throw new Error(`已达到本月最大自助解绑次数限制 (${maxPerMonth}次)`);
  }

  if (license.lastUnboundAt && cooldownHours > 0) {
    const elapsedHours = (now.getTime() - new Date(license.lastUnboundAt).getTime()) / (1000 * 60 * 60);
    if (elapsedHours < cooldownHours) {
      const waitHours = Math.ceil(cooldownHours - elapsedHours);
      throw new Error(`换绑处于冷却期中，请在 ${waitHours} 小时后再试`);
    }
  }

  let newExpirationDate = license.expirationDate;
  if (deductHours > 0) {
    newExpirationDate = new Date(new Date(license.expirationDate).getTime() - deductHours * 60 * 60 * 1000);
  }

  const oldhwid = license.hwid;

  await prisma.$transaction(async (tx) => {
    const timeoutSetting = await tx.setting.findUnique({
      where: { key: 'session_timeout' },
    });
    const timeoutSeconds = timeoutSetting ? parseInt(timeoutSetting.value, 10) : 300;
    const effectiveTimeout = isNaN(timeoutSeconds) || timeoutSeconds <= 0 ? 300 : timeoutSeconds;
    const cutoff = new Date(Date.now() - effectiveTimeout * 1000);

    await tx.$executeRaw`
      UPDATE "Session"
      SET "status" = 'terminated',
          "terminatedAt" = CASE
            WHEN "lastHeartbeat" < ${cutoff} THEN "lastHeartbeat"
            ELSE ${now}
          END
      WHERE "licenseKey" = ${license.licenseKey} AND "status" = 'active'
    `;

    await tx.license.update({
      where: { id: license.id },
      data: {
        hwid: null,
        deviceName: null,
        expirationDate: newExpirationDate,
        lastUnboundAt: now,
        monthlyUnbindCount: currentMonthlyCount + 1,
        unbindCountMonth: currentMonthKey,
        ...(isSameMonth ? {} : { extraUnbindCount: 0 }),
      },
    });
  });

  await logAction({
    adminId: null,
    action: 'user_self_unbind_hardware',
    targetType: 'license',
    targetId: license.id,
    details: {
      userId,
      oldhwid,
      monthlyCount: currentMonthlyCount + 1,
      deductHours,
    },
  });

  return {
    success: true,
    message: '解绑成功',
    remainingMonthlyCount: maxPerMonth - (currentMonthlyCount + 1),
  };
}
