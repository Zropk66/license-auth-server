import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const channels = await prisma.notificationChannel.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(channels);
  } catch (error) {
    console.error('[AdminNotifications] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const body = await req.json();
    const { name, type, url, secret, enabled, events } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'Name and Type are required' }, { status: 400 });
    }

    const channel = await prisma.notificationChannel.create({
      data: {
        name: name.trim(),
        type,
        url: url?.trim() || '',
        secret: secret?.trim() || null,
        enabled: enabled !== undefined ? Boolean(enabled) : true,
        events: typeof events === 'string' ? events : JSON.stringify(events || ['all']),
      },
    });

    await logAction({
      adminId: authResult.payload.id,
      action: 'create_notification_channel',
      targetType: 'notification_channel',
      targetId: channel.id,
      details: { name: channel.name, type: channel.type },
    });

    return NextResponse.json(channel, { status: 201 });
  } catch (error: any) {
    console.error('[AdminNotifications] POST error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create channel' }, { status: 500 });
  }
}
