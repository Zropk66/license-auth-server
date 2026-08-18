import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const { id } = await params;
    const body = await req.json();

    const dataToUpdate: any = {};
    if (body.name !== undefined) dataToUpdate.name = body.name.trim();
    if (body.type !== undefined) dataToUpdate.type = body.type;
    if (body.url !== undefined) dataToUpdate.url = body.url.trim();
    if (body.secret !== undefined) dataToUpdate.secret = body.secret ? body.secret.trim() : null;
    if (body.enabled !== undefined) dataToUpdate.enabled = Boolean(body.enabled);
    if (body.events !== undefined) {
      dataToUpdate.events = typeof body.events === 'string' ? body.events : JSON.stringify(body.events);
    }

    const updated = await prisma.notificationChannel.update({
      where: { id },
      data: dataToUpdate,
    });

    await logAction({
      adminId: authResult.payload.id,
      action: 'edit_notification_channel',
      targetType: 'notification_channel',
      targetId: id,
      details: { updatedFields: Object.keys(dataToUpdate) },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('[AdminNotifications] PATCH error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update channel' }, { status: 500 });
  }
}

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
    const channel = await prisma.notificationChannel.findUnique({
      where: { id },
    });

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    await prisma.notificationChannel.delete({
      where: { id },
    });

    await logAction({
      adminId: authResult.payload.id,
      action: 'delete_notification_channel',
      targetType: 'notification_channel',
      targetId: id,
      details: { name: channel.name, type: channel.type },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AdminNotifications] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete channel' }, { status: 500 });
  }
}
