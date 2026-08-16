import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }
  try {
    const { id } = params;
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    await prisma.session.update({
      where: { id },
      data: { status: 'terminated' },
    });
    await logAction({
      adminId: authResult.payload.id,
      action: 'kick_session',
      targetType: 'session',
      targetId: id,
      details: {
        licenseKey: session.licenseKey,
        ipAddress: session.ipAddress,
        hardwareId: session.hardwareId,
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error terminating session:', error);
    return NextResponse.json({ error: 'Failed to terminate session' }, { status: 500 });
  }
}
