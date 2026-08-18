import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';
import { updateSoftwareSchema } from '@/lib/validations';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const { id } = await params;
    const software = await prisma.software.findUnique({
      where: { id },
    });

    if (!software) {
      return NextResponse.json({ error: '软件未找到' }, { status: 404 });
    }

    const [licenseCount, versionCount] = await Promise.all([
      prisma.license.count({ where: { softwareName: software.name } }),
      prisma.softwareVersion.count({ where: { softwareName: software.name } }),
    ]);

    return NextResponse.json({
      ...software,
      licenseCount,
      versionCount,
    });
  } catch (error: any) {
    console.error('[AdminSoftwares] GET [id] error:', error);
    return NextResponse.json({ error: '获取软件信息失败' }, { status: 500 });
  }
}

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
    const parseResult = updateSoftwareSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || '参数有误' },
        { status: 400 }
      );
    }

    const existing = await prisma.software.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: '目标软件不存在' }, { status: 404 });
    }

    const updateData: any = {};
    if (parseResult.data.name !== undefined) {
      const newName = parseResult.data.name.trim();
      if (newName !== existing.name) {
        const nameConflict = await prisma.software.findUnique({
          where: { name: newName },
        });
        if (nameConflict && nameConflict.id !== id) {
          return NextResponse.json(
            { error: `软件名称「${newName}」已被使用，请更换其他名称` },
            { status: 409 }
          );
        }
        updateData.name = newName;

        // 如果修改了软件名称，级联同步更新 License 和 SoftwareVersion 中的关联 softwareName
        await prisma.$transaction([
          prisma.license.updateMany({
            where: { softwareName: existing.name },
            data: { softwareName: newName },
          }),
          prisma.softwareVersion.updateMany({
            where: { softwareName: existing.name },
            data: { softwareName: newName },
          }),
        ]);
      }
    }

    if (parseResult.data.code !== undefined) {
      updateData.code = parseResult.data.code?.trim() || null;
    }
    if (parseResult.data.description !== undefined) {
      updateData.description = parseResult.data.description?.trim() || null;
    }
    if (parseResult.data.enabled !== undefined) {
      updateData.enabled = parseResult.data.enabled;
    }

    const updated = await prisma.software.update({
      where: { id },
      data: updateData,
    });

    await logAction({
      adminId: authResult.payload.id,
      action: 'edit_software',
      targetType: 'software',
      targetId: updated.id,
      details: { changes: updateData, previousName: existing.name },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('[AdminSoftwares] PATCH error:', error);
    return NextResponse.json(
      { error: error.message || '更新软件失败' },
      { status: 500 }
    );
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
    const existing = await prisma.software.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: '软件未找到' }, { status: 404 });
    }

    // 统计关联数据
    const [licenseCount, versionCount] = await Promise.all([
      prisma.license.count({ where: { softwareName: existing.name } }),
      prisma.softwareVersion.count({ where: { softwareName: existing.name } }),
    ]);

    // 级联删除：先删除所有关联的许可证（Session 和 LicenseHardwareHistory 会自动级联删除）
    // 再删除关联的版本记录，最后删除软件本身
    await prisma.$transaction(async (tx) => {
      if (licenseCount > 0) {
        await tx.license.deleteMany({
          where: { softwareName: existing.name },
        });
      }
      if (versionCount > 0) {
        await tx.softwareVersion.deleteMany({
          where: { softwareName: existing.name },
        });
      }
      await tx.software.delete({
        where: { id },
      });
    });

    await logAction({
      adminId: authResult.payload.id,
      action: 'delete_software',
      targetType: 'software',
      targetId: id,
      details: { name: existing.name, deletedLicenses: licenseCount, deletedVersions: versionCount },
    });

    return NextResponse.json({
      success: true,
      message: `软件「${existing.name}」已删除${licenseCount > 0 ? `，同时删除了 ${licenseCount} 个关联授权` : ''}`,
    });
  } catch (error: any) {
    console.error('[AdminSoftwares] DELETE error:', error);
    return NextResponse.json(
      { error: error.message || '删除软件失败' },
      { status: 500 }
    );
  }
}
