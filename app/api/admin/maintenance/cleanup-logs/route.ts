import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import { cleanupLogs, getLogStats, getCleanupConfig, CleanupConfig } from '@/lib/log-cleanup';
import { logAction } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const [stats, config] = await Promise.all([
      getLogStats(),
      getCleanupConfig(),
    ]);

    return NextResponse.json({
      success: true,
      stats,
      config,
    });
  } catch (error: any) {
    console.error('[CleanupLogs] GET error:', error);
    return NextResponse.json(
      { error: error.message || '获取日志统计失败' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    let customConfig: Partial<CleanupConfig> | undefined;
    try {
      const body = await req.json();
      if (body && typeof body === 'object') {
        customConfig = {};
        if (body.mode === 'date' || body.mode === 'size' || body.mode === 'both') {
          customConfig.mode = body.mode;
        }
        if (typeof body.verifyDays === 'number' && body.verifyDays > 0) {
          customConfig.verifyDays = body.verifyDays;
        }
        if (typeof body.auditDays === 'number' && body.auditDays > 0) {
          customConfig.auditDays = body.auditDays;
        }
        if (typeof body.maxSizeMb === 'number' && body.maxSizeMb > 0) {
          customConfig.maxSizeMb = body.maxSizeMb;
        }
      }
    } catch {
      // 忽略空请求体
    }

    const result = await cleanupLogs(customConfig);
    const stats = await getLogStats();

    await logAction({
      adminId: authResult.payload.id,
      action: 'manual_log_cleanup',
      targetType: 'system',
      targetId: 'maintenance',
      details: {
        verificationAttemptsDeleted: result.verificationAttemptsDeleted,
        auditLogsDeleted: result.auditLogsDeleted,
        customConfig: customConfig || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: `清理完成：删除 ${result.verificationAttemptsDeleted} 条验证记录、${result.auditLogsDeleted} 条审计日志`,
      ...result,
      stats,
    });
  } catch (error: any) {
    console.error('[CleanupLogs] POST error:', error);
    return NextResponse.json(
      { error: error.message || '清理日志失败' },
      { status: 500 }
    );
  }
}
