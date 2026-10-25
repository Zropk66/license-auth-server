import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';
import { updateSoftwareVersionSchema } from '@/lib/validations';

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

    const parseResult = updateSoftwareVersionSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || '参数有误' },
        { status: 400 }
      );
    }

    const parsed = parseResult.data;
    const dataToUpdate: Record<string, unknown> = {};
    if (parsed.softwareName !== undefined) dataToUpdate.softwareName = parsed.softwareName.trim();
    if (parsed.version !== undefined) dataToUpdate.version = parsed.version.trim();
    if (parsed.versionCode !== undefined) dataToUpdate.versionCode = parsed.versionCode;
    if (parsed.changelog !== undefined) dataToUpdate.changelog = parsed.changelog?.trim() || '';
    if (parsed.downloadUrl !== undefined) dataToUpdate.downloadUrl = parsed.downloadUrl ? parsed.downloadUrl.trim() : '';
    if (parsed.fileHash !== undefined) dataToUpdate.fileHash = parsed.fileHash ? parsed.fileHash.trim() : null;
    if (parsed.isForced !== undefined) dataToUpdate.isForced = Boolean(parsed.isForced);
    if (parsed.enabled !== undefined) dataToUpdate.enabled = Boolean(parsed.enabled);
    if (parsed.customPayload !== undefined) {
      dataToUpdate.customPayload = parsed.customPayload ? parsed.customPayload.trim() : null;
    }

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
