import { NextRequest, NextResponse } from 'next/server';
import { validateUserAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getUnbindStatus } from '@/lib/unbind-policy';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await validateUserAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }
  const { payload } = authResult;
  try {
    const { id } = await params;
    const license = await prisma.license.findUnique({
      where: { id, userId: payload.id },
      include: {
        sessions: {
          select: {
            createdAt: true,
            lastHeartbeat: true,
            terminatedAt: true,
            status: true,
          },
        },
      },
    });

    if (!license) {
      return NextResponse.json(
        { error: 'License not found' },
        { status: 404 }
      );
    }

    const unbindStatus = await getUnbindStatus(id, payload.id);

    const now = new Date();
    const sessions = license.sessions ?? [];
    let totalUsedMs = 0;
    sessions.forEach(session => {
      const sessionStart = new Date(session.createdAt).getTime();
      const lastHb = new Date(session.lastHeartbeat).getTime();
      const diffSeconds = Math.max(0, Math.floor((now.getTime() - lastHb) / 1000));
      const isSessionActive = session.status === 'active' && diffSeconds <= 300;
      const sessionEnd = session.terminatedAt
        ? new Date(session.terminatedAt).getTime()
        : (isSessionActive ? now.getTime() : lastHb);
      totalUsedMs += Math.max(0, sessionEnd - sessionStart);
    });
    const usageMinutes = Math.round(totalUsedMs / (1000 * 60));

    return NextResponse.json({
      ...license,
      unbindStatus,
      usageMinutes,
    });
  } catch (error) {
    console.error('Error fetching license details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch license details' },
      { status: 500 }
    );
  }
}