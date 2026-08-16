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
    sessions: {
      orderBy: { lastHeartbeat: 'desc' };
      select: {
        id: true;
        ipAddress: true;
        hardwareId: true;
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
    hardwareId: license.hardwareId,
    status: license.status,
    licenseType: license.licenseType,
    duration: license.duration,
    activatedAt: license.activatedAt,
    createdAt: license.createdAt,
    updatedAt: license.updatedAt,
    lastLoginIp: lastSession?.ipAddress ?? null,
    lastLoginAt: lastSession?.lastHeartbeat ?? null,
    sessions: license.sessions,
  };
}

// include 配置常量
const detailInclude = {
  user: { select: { id: true, username: true } },
  sessions: {
    orderBy: { lastHeartbeat: 'desc' as const },
    select: {
      id: true,
      ipAddress: true,
      hardwareId: true,
      lastHeartbeat: true,
      status: true,
      createdAt: true,
    },
  },
} as const;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await validateAdminAuth(req);
  // 如果未授权，authResult 是 NextResponse，直接返回
  if (!('payload' in authResult)) {
    return authResult;
  }
  try {
    const { id } = params;
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
  { params }: { params: { id: string } }
) {
  const authResult = await validateAdminAuth(req);
  // 如果未授权，authResult 是 NextResponse，直接返回
  if (!('payload' in authResult)) {
    return authResult;
  }
  try {
    const { id } = params;
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
      duration?: number | null;
      hardwareId?: string | null;
    } = {};

    // 处理状态更新
    if (updateData.status !== undefined) {
      if (updateData.status === 'active' && license.activatedAt === null && license.licenseType === 'duration') {
        dataToUpdate.status = 'unactivated';
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
    if (updateData.duration !== undefined) {
      dataToUpdate.duration = updateData.duration;
    }
    // 处理硬件 ID 重置
    if (updateData.resetHardwareId === true) {
      dataToUpdate.hardwareId = null;
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
    } else if (updateData.resetHardwareId === true) {
      action = 'reset_hardware_id';
    }

    // 更新许可证
    const updatedLicense = await prisma.license.update({
      where: { id },
      data: dataToUpdate,
      include: detailInclude,
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
