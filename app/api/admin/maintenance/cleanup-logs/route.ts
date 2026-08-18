import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import { cleanupLogs } from '@/lib/log-cleanup';
import { logAction } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const result = await cleanupLogs();

    await logAction({
      adminId: authResult.payload.id,
      action: 'manual_log_cleanup',
      targetType: 'system',
      targetId: 'maintenance',
      details: {
        verificationAttemptsDeleted: result.verificationAttemptsDeleted,
        auditLogsDeleted: result.auditLogsDeleted,
      },
    });

    return NextResponse.json({
      success: true,
      message: `清理完成：删除 ${result.verificationAttemptsDeleted} 条验证记录、${result.auditLogsDeleted} 条审计日志`,
      ...result,
    });
  } catch (error: any) {
    console.error('[CleanupLogs] error:', error);
    return NextResponse.json(
      { error: error.message || '清理日志失败' },
      { status: 500 }
    );
  }
}
