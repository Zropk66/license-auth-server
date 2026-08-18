import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';
import { updateLicenseSchema } from '@/lib/validations';
import { Prisma } from '@prisma/client';

// 许可证详情查询的 include 配置类型
type LicenseDetail = Prisma.LicenseGetPayload<{
  include: {
    user: { select: { id: true; username: true } };
    hardwareHistories: {
      orderBy: { lastSeenAt: 'desc' };
    };
    sessions: {
      orderBy: { lastHeartbeat: 'desc' };
      select: {
        id: true;
        ipAddress: true;
        hwid: true;
        lastHeartbeat: true;
        status: true;
        createdAt: true;
      };
    };
  };
}>;

// 将许可证详情映射为响应格式
function mapLicenseDetail(license: LicenseDetail) {
  const lastSession = license.sessions[0] ?? null;
  return {
    id: license.id,
    licenseKey: license.licenseKey,
    userId: license.userId,
    username: license.user.username,
    softwareName: license.softwareName,
    expirationDate: license.expirationDate,
    hardwareBindingEnabled: license.hardwareBindingEnabled,
    hwid: license.hwid,
    deviceName: license.deviceName,
    allowSelfUnbind: license.allowSelfUnbind,
    lastUnboundAt: license.lastUnboundAt,
    monthlyUnbindCount: license.monthlyUnbindCount,
    unbindCountMonth: license.unbindCountMonth,
    extraUnbindCount: license.extraUnbindCount,
    status: license.status,
    licenseType: license.licenseType,
    duration: license.duration,
    activatedAt: license.activatedAt,
    createdAt: license.createdAt,
    updatedAt: license.updatedAt,
    lastLoginIp: lastSession?.ipAddress ?? null,
    lastLoginAt: lastSession?.lastHeartbeat ?? null,
    sessions: license.sessions,
    hardwareHistories: license.hardwareHistories,
  };
}

// include 配置常量
const detailInclude = {
  user: { select: { id: true, username: true } },
  hardwareHistories: {
    orderBy: { lastSeenAt: 'desc' as const },
  },
  sessions: {
    orderBy: { lastHeartbeat: 'desc' as const },
    select: {
      id: true,
      ipAddress: true,
      hwid: true,
      lastHeartbeat: true,
      terminatedAt: true,
      status: true,
      createdAt: true,
    },
  },
} as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await validateAdminAuth(req);
  // 如果未授权，authResult 是 NextResponse，直接返回
  if (!('payload' in authResult)) {
    return authResult;
  }
  try {
    const { id } = await params;
    const license = await prisma.license.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!license) {
      return NextResponse.json(
        { error: 'License not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(mapLicenseDetail(license));
  } catch (error) {
    console.error('Error fetching license details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch license details' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await validateAdminAuth(req);
  // 如果未授权，authResult 是 NextResponse，直接返回
  if (!('payload' in authResult)) {
    return authResult;
  }
  try {
    const { id } = await params;
    const body = await req.json();

    // 使用 zod schema 验证请求体
    const parseResult = updateLicenseSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const updateData = parseResult.data;

    // 检查许可证是否存在
    const license = await prisma.license.findUnique({ where: { id } });
    if (!license) {
      return NextResponse.json(
        { error: 'License not found' },
        { status: 404 }
      );
    }

    // 准备更新数据
    const dataToUpdate: {
      status?: string;
      softwareName?: string;
      expirationDate?: Date;
      hardwareBindingEnabled?: boolean;
      allowSelfUnbind?: boolean;
      extraUnbindCount?: number;
      unbindCountMonth?: string;
      monthlyUnbindCount?: number;
      duration?: number | null;
      hwid?: string | null;
      activatedAt?: Date;
    } = {};

    // 处理状态更新
    if (updateData.status !== undefined) {
      if (updateData.status === 'active' && license.activatedAt === null && license.licenseType === 'duration') {
        // 如果是时长激活卡且从未激活过，在后台手动激活时直接计算当前过期时间
        dataToUpdate.status = 'active';
        dataToUpdate.activatedAt = new Date();
        if (license.duration) {
          dataToUpdate.expirationDate = new Date(Date.now() + license.duration * 60 * 1000);
        }
      } else {
        dataToUpdate.status = updateData.status;
      }
    }
    if (updateData.revoke === true) {
      dataToUpdate.status = 'revoked';
    }
    // 处理其他可编辑字段
    if (updateData.softwareName !== undefined) {
      dataToUpdate.softwareName = updateData.softwareName;
    }
    if (updateData.expirationDate !== undefined) {
      dataToUpdate.expirationDate = new Date(updateData.expirationDate);
    }
    if (updateData.hardwareBindingEnabled !== undefined) {
      // 确保转为 boolean
      dataToUpdate.hardwareBindingEnabled = Boolean(updateData.hardwareBindingEnabled);
    }
    if (updateData.allowSelfUnbind !== undefined) {
      dataToUpdate.allowSelfUnbind = Boolean(updateData.allowSelfUnbind);
    }
    if (updateData.resetExtraUnbind === true) {
      dataToUpdate.extraUnbindCount = 0;
    } else if (updateData.extraUnbindCount !== undefined) {
      dataToUpdate.extraUnbindCount = updateData.extraUnbindCount;
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      if (license.unbindCountMonth !== currentMonthKey) {
        dataToUpdate.unbindCountMonth = currentMonthKey;
        dataToUpdate.monthlyUnbindCount = 0;
      }
    } else if (updateData.addUnbindCount !== undefined) {
      dataToUpdate.extraUnbindCount = Math.max(0, (license.extraUnbindCount || 0) + updateData.addUnbindCount);
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      if (license.unbindCountMonth !== currentMonthKey) {
        dataToUpdate.unbindCountMonth = currentMonthKey;
        dataToUpdate.monthlyUnbindCount = 0;
      }
    }
    if (updateData.duration !== undefined) {
      dataToUpdate.duration = updateData.duration;
    }
    // 处理HWID 重置
    if (updateData.resethwid === true) {
      dataToUpdate.hwid = null;
    }

    // 确定审计日志的 action 类型
    let action = 'edit_license';
    if (updateData.revoke === true) {
      action = 'revoke_license';
    } else if (updateData.status !== undefined) {
      if (updateData.status === 'suspended') {
        action = 'suspend_license';
      } else if (updateData.status === 'active' && license.status === 'suspended') {
        action = license.activatedAt === null ? 'resume_unactivated_license' : 'resume_license';
      }
    } else if (updateData.resethwid === true) {
      action = 'reset_hwid';
    }

    // 更新许可证
    const updatedLicense = await prisma.$transaction(async (tx) => {
      if (
        updateData.resethwid === true ||
        updateData.revoke === true ||
        updateData.status === 'suspended'
      ) {
        await tx.session.updateMany({
          where: {
            licenseKey: license.licenseKey,
            status: 'active',
          },
          data: {
            status: 'terminated',
            terminatedAt: new Date(),
          },
        });
      }

      return tx.license.update({
        where: { id },
        data: dataToUpdate,
        include: detailInclude,
      });
    });

    await logAction({
      adminId: authResult.payload.id,
      action,
      targetType: 'license',
      targetId: updatedLicense.id,
      details: {
        softwareName: updatedLicense.softwareName,
        changes: Object.keys(dataToUpdate),
      },
    });

    return NextResponse.json(mapLicenseDetail(updatedLicense));
  } catch (error) {
    console.error('Error updating license:', error);
    return NextResponse.json(
      { error: 'Failed to update license' },
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
    const license = await prisma.license.findUnique({ where: { id } });

    if (!license) {
      return NextResponse.json(
        { error: 'License not found' },
        { status: 404 }
      );
    }

    // 仅允许删除已撤销的许可证记录
    if (license.status !== 'revoked') {
      return NextResponse.json(
        {
          error: '仅允许删除已撤销的授权记录，请先撤销该授权后再删除',
        },
        { status: 400 }
      );
    }

    // 删除许可证（Session 和 LicenseHardwareHistory 会自动级联删除）
    await prisma.license.delete({
      where: { id },
    });

    await logAction({
      adminId: authResult.payload.id,
      action: 'delete_license',
      targetType: 'license',
      targetId: id,
      details: {
        licenseKey: license.licenseKey,
        softwareName: license.softwareName,
      },
    });

    return NextResponse.json({ success: true, message: '授权记录已删除' });
  } catch (error) {
    console.error('Error deleting license:', error);
    return NextResponse.json(
      { error: 'Failed to delete license' },
      { status: 500 }
    );
  }
}
