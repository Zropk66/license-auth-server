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
    if (body.softwareName !== undefined) dataToUpdate.softwareName = body.softwareName.trim();
    if (body.title !== undefined) dataToUpdate.title = body.title.trim();
    if (body.content !== undefined) dataToUpdate.content = body.content.trim();
    if (body.type !== undefined) dataToUpdate.type = body.type;
    if (body.enabled !== undefined) dataToUpdate.enabled = Boolean(body.enabled);

    const updated = await prisma.announcement.update({
      where: { id },
      data: dataToUpdate,
    });

    await logAction({
      adminId: authResult.payload.id,
      action: 'edit_announcement',
      targetType: 'announcement',
      targetId: id,
      details: { title: updated.title, softwareName: updated.softwareName },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('[AdminAnnouncements] PATCH error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update announcement' }, { status: 500 });
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
    const announcement = await prisma.announcement.findUnique({
      where: { id },
    });

    if (!announcement) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    }

    await prisma.announcement.delete({
      where: { id },
    });

    await logAction({
      adminId: authResult.payload.id,
      action: 'delete_announcement',
      targetType: 'announcement',
      targetId: id,
      details: { title: announcement.title, softwareName: announcement.softwareName },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AdminAnnouncements] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete announcement' }, { status: 500 });
  }
}
