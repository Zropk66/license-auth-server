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
    const { ids, action } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid license IDs' }, { status: 400 });
    }

    if (!['revoke', 'suspend', 'active', 'delete'].includes(action)) {
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
