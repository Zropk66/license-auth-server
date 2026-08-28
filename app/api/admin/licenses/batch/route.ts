import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';

export async function PATCH(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const { ids, action, softwareName } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid license IDs' }, { status: 400 });
    }

    const validActions = ['revoke', 'suspend', 'active', 'delete', 'change_software', 'reset_hwid'];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (action === 'delete') {
      // 批量删除：仅允许删除已撤销的许可证
      const revokedLicenses = await prisma.license.findMany({
        where: { id: { in: ids }, status: 'revoked' },
        select: { id: true, licenseKey: true, softwareName: true },
      });

      if (revokedLicenses.length === 0) {
        return NextResponse.json(
          { error: '所选授权中没有被撤销的记录，仅可删除已撤销的授权' },
          { status: 400 }
        );
      }

      const deletableIds = revokedLicenses.map((l) => l.id);
      await prisma.license.deleteMany({
        where: { id: { in: deletableIds } },
      });

      await logAction({
        adminId: authResult.payload.id,
        action: 'batch_delete_license',
        targetType: 'license',
        targetId: 'multiple',
        details: { count: deletableIds.length, deletedIds: deletableIds },
      });

      return NextResponse.json({
        success: true,
        message: `已删除 ${deletableIds.length} 个已撤销的授权记录`,
      });
    }

    if (action === 'change_software') {
      if (!softwareName || typeof softwareName !== 'string' || softwareName.trim() === '') {
        return NextResponse.json({ error: '请提供有效的目标软件名称' }, { status: 400 });
      }

      const targetSoftware = await prisma.software.findUnique({
        where: { name: softwareName },
      });

      if (!targetSoftware || !targetSoftware.enabled) {
        return NextResponse.json({ error: '指定的目标软件不存在或已被禁用' }, { status: 400 });
      }

      const targetLicenses = await prisma.license.findMany({
        where: { id: { in: ids } },
        select: { id: true, licenseKey: true },
      });

      if (targetLicenses.length === 0) {
        return NextResponse.json({ error: '未找到选中的有效授权记录' }, { status: 400 });
      }

      const licenseKeys = targetLicenses.map((l) => l.licenseKey);

      await prisma.$transaction(async (tx) => {
        await tx.license.updateMany({
          where: { id: { in: ids } },
          data: { softwareName },
        });

        await tx.session.updateMany({
          where: {
            licenseKey: { in: licenseKeys },
            status: 'active',
          },
          data: {
            status: 'terminated',
            terminatedAt: new Date(),
          },
        });
      });

      await logAction({
        adminId: authResult.payload.id,
        action: 'batch_change_software',
        targetType: 'license',
        targetId: 'multiple',
        details: { ids, softwareName, count: targetLicenses.length },
      });

      return NextResponse.json({
        success: true,
        message: `已将 ${targetLicenses.length} 个授权所属软件更新为 ${softwareName}`,
      });
    }

    if (action === 'reset_hwid') {
      const targetLicenses = await prisma.license.findMany({
        where: { id: { in: ids } },
        select: { id: true, licenseKey: true },
      });

      if (targetLicenses.length === 0) {
        return NextResponse.json({ error: '未找到选中的有效授权记录' }, { status: 400 });
      }

      const licenseKeys = targetLicenses.map((l) => l.licenseKey);

      await prisma.$transaction(async (tx) => {
        await tx.license.updateMany({
          where: { id: { in: ids } },
          data: {
            hwid: null,
            deviceName: null,
          },
        });

        await tx.session.updateMany({
          where: {
            licenseKey: { in: licenseKeys },
            status: 'active',
          },
          data: {
            status: 'terminated',
            terminatedAt: new Date(),
          },
        });
      });

      await logAction({
        adminId: authResult.payload.id,
        action: 'batch_reset_hwid',
        targetType: 'license',
        targetId: 'multiple',
        details: { ids, count: targetLicenses.length },
      });

      return NextResponse.json({
        success: true,
        message: `已成功重置 ${targetLicenses.length} 个授权的硬件绑定`,
      });
    }

    let statusToSet = 'active';
    let auditAction = 'edit_license';

    if (action === 'revoke') {
      statusToSet = 'revoked';
      auditAction = 'revoke_license';
    } else if (action === 'suspend') {
      statusToSet = 'suspended';
      auditAction = 'suspend_license';
    } else if (action === 'active') {
      statusToSet = 'active';
      auditAction = 'resume_license';
    }

    const updateWhere: any = {
      id: { in: ids },
    };

    if (action === 'active') {
      updateWhere.NOT = {
        status: 'unactivated',
        licenseType: 'duration',
      };
    }

    await prisma.license.updateMany({
      where: updateWhere,
      data: {
        status: statusToSet,
      },
    });

    await logAction({
      adminId: authResult.payload.id,
      action: `batch_${auditAction}`,
      targetType: 'license',
      targetId: 'multiple',
      details: { ids, status: statusToSet },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in batch update:', error);
    return NextResponse.json({ error: 'Batch update failed' }, { status: 500 });
  }
}
