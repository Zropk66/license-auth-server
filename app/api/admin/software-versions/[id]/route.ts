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
    if (body.version !== undefined) dataToUpdate.version = body.version.trim();
    if (body.versionCode !== undefined) dataToUpdate.versionCode = parseInt(body.versionCode, 10);
    if (body.changelog !== undefined) dataToUpdate.changelog = body.changelog.trim();
    if (body.downloadUrl !== undefined) dataToUpdate.downloadUrl = body.downloadUrl.trim();
    if (body.fileHash !== undefined) dataToUpdate.fileHash = body.fileHash ? body.fileHash.trim() : null;
    if (body.isForced !== undefined) dataToUpdate.isForced = Boolean(body.isForced);
    if (body.enabled !== undefined) dataToUpdate.enabled = Boolean(body.enabled);

    const updated = await prisma.softwareVersion.update({
      where: { id },
      data: dataToUpdate,
    });

    await logAction({
      adminId: authResult.payload.id,
      action: 'edit_software_version',
      targetType: 'software_version',
      targetId: id,
      details: { softwareName: updated.softwareName, version: updated.version },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('[AdminSoftwareVersions] PATCH error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update software version' }, { status: 500 });
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
    const version = await prisma.softwareVersion.findUnique({
      where: { id },
    });

    if (!version) {
      return NextResponse.json({ error: 'Software version not found' }, { status: 404 });
    }

    await prisma.softwareVersion.delete({
      where: { id },
    });

    await logAction({
      adminId: authResult.payload.id,
      action: 'delete_software_version',
      targetType: 'software_version',
      targetId: id,
      details: { softwareName: version.softwareName, version: version.version },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AdminSoftwareVersions] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete software version' }, { status: 500 });
  }
}
