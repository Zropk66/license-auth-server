import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }
  try {
    const { id } = await params;
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    // 获取会话超时时间配置
    const timeoutSetting = await prisma.setting.findUnique({
      where: { key: 'session_timeout' },
    });
    const sessionTimeoutSeconds = timeoutSetting ? parseInt(timeoutSetting.value, 10) : 300;
    const isAlreadyDead = (Date.now() - new Date(session.lastHeartbeat).getTime()) > sessionTimeoutSeconds * 1000;
    const terminatedAt = isAlreadyDead ? session.lastHeartbeat : new Date();

    await prisma.session.update({
      where: { id },
      data: {
        status: 'terminated',
        terminatedAt,
      },
    });
    await logAction({
      adminId: authResult.payload.id,
      action: 'kick_session',
      targetType: 'session',
      targetId: id,
      details: {
        licenseKey: session.licenseKey,
        ipAddress: session.ipAddress,
        hwid: session.hwid,
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error terminating session:', error);
    return NextResponse.json({ error: 'Failed to terminate session' }, { status: 500 });
  }
}
