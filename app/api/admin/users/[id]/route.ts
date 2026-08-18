import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await validateAdminAuth(req);
  // If not authorized, authResult is a NextResponse, so return it directly
  if (!('payload' in authResult)) {
    return authResult;
  }
  try {
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, userHash: true, createdAt: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    // Get all licenses for this user
    const licenses = await prisma.license.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
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

    const now = new Date();
    const processedLicenses = licenses.map(license => {
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
      return {
        ...license,
        calculatedDuration: usageMinutes,
      };
    });

    const totalDuration = processedLicenses.reduce((acc, curr) => acc + curr.calculatedDuration, 0);

    return NextResponse.json({
      ...user,
      licenses: processedLicenses,
      totalDuration,
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user details' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await validateAdminAuth(req);
  // If not authorized, authResult is a NextResponse, so return it directly
  if (!('payload' in authResult)) {
    return authResult;
  }
  try {
    const { id } = await params;
    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    // Delete user (will cascade delete all licenses due to the onDelete: Cascade relationship)
    await prisma.user.delete({ where: { id } });
    await logAction({
      adminId: authResult.payload.id,
      action: 'delete_user',
      targetType: 'user',
      targetId: id,
      details: { username: user.username },
    });
    return NextResponse.json(
      { success: true, message: 'User and associated licenses deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}