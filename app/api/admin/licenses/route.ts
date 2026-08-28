import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { generateLicenseKey } from '@/lib/utils';
import { logAction } from '@/lib/audit';
import { createLicenseSchema, paginationSchema } from '@/lib/validations';
import { Prisma } from '@prisma/client';

// 许可证查询的 include 配置类型
type LicenseWithRelations = Prisma.LicenseGetPayload<{
  include: { user: { select: { username: true } }; createdBy: { select: { username: true } } };
}>;

// 许可证列表查询的 include 配置
const licenseInclude = {
  user: { select: { username: true } },
  createdBy: { select: { username: true } }
} as const;

// 将许可证实体映射为响应格式
function mapLicense(license: LicenseWithRelations) {
  return {
    id: license.id,
    licenseKey: license.licenseKey,
    userId: license.userId,
    username: license.user.username,
    softwareName: license.softwareName,
    expirationDate: license.expirationDate,
    hardwareBindingEnabled: license.hardwareBindingEnabled,
    hwid: license.hwid,
    allowSelfUnbind: license.allowSelfUnbind,
    monthlyUnbindCount: license.monthlyUnbindCount,
    extraUnbindCount: license.extraUnbindCount,
    status: license.status,
    licenseType: license.licenseType,
    duration: license.duration,
    activatedAt: license.activatedAt,
    createdAt: license.createdAt,
    createdBy: license.createdBy?.username || null,
  };
}

export async function GET(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  // 如果未授权，authResult 是 NextResponse，直接返回
  if (!('payload' in authResult)) {
    return authResult;
  }
  try {
    const url = new URL(req.url);
    const pageParam = url.searchParams.get('page');
    const keyParam = url.searchParams.get('key');

    const orderBy = { createdAt: 'desc' as const };

    // 精确按 licenseKey 查询单条授权（用于审计日志等场景的快速跳转）
    if (keyParam !== null) {
      const license = await prisma.license.findUnique({
        where: { licenseKey: keyParam },
        include: licenseInclude,
      });
      if (!license) {
        return NextResponse.json({ error: 'License not found' }, { status: 404 });
      }
      return NextResponse.json(mapLicense(license));
    }

    // 未提供 page 参数时返回全部数据（数组格式），保持前端兼容
    if (pageParam === null) {
      const licenses = await prisma.license.findMany({
        orderBy,
        include: licenseInclude,
      });
      return NextResponse.json(licenses.map(mapLicense));
    }

    // 分页模式
    const parseResult = paginationSchema.safeParse({
      page: url.searchParams.get('page') || undefined,
      pageSize: url.searchParams.get('pageSize') || undefined,
    });
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid pagination parameters' },
        { status: 400 }
      );
    }
    const { page, pageSize } = parseResult.data;

    const [licenses, total] = await Promise.all([
      prisma.license.findMany({
        orderBy,
        include: licenseInclude,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.license.count(),
    ]);

    return NextResponse.json({
      data: licenses.map(mapLicense),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Error fetching licenses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch licenses' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  // 如果未授权，authResult 是 NextResponse，直接返回
  if (!('payload' in authResult)) {
    return authResult;
  }
  try {
    const body = await req.json();

    // 使用 zod schema 验证请求体
    const parseResult = createLicenseSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const { userId, softwareName, expirationDate, hardwareBindingEnabled, allowSelfUnbind, licenseType, duration } = parseResult.data;

    // 验证用户是否存在
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const isDuration = licenseType === 'duration';
    // 对于 duration 类型，创建时使用当前日期作为占位过期日期，激活后再计算
    const resolvedExpirationDate = isDuration ? new Date() : new Date(expirationDate!);
    const resolvedStatus = isDuration ? 'unactivated' : 'active';

    // 生成 licenseKey，最多重试 3 次以避免唯一约束冲突
    let license: LicenseWithRelations | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const licenseKey = generateLicenseKey();
      try {
        license = await prisma.license.create({
          data: {
            licenseKey,
            userId,
            softwareName,
            expirationDate: resolvedExpirationDate,
            hardwareBindingEnabled: !!hardwareBindingEnabled,
            allowSelfUnbind: allowSelfUnbind !== undefined ? allowSelfUnbind : true,
            status: resolvedStatus,
            licenseType,
            duration: isDuration ? duration! : null,
            activatedAt: isDuration ? null : new Date(),
            createdById: authResult.payload.id,
          },
          include: licenseInclude,
        });
        lastError = null;
        break;
      } catch (err) {
        // Prisma P2002 唯一约束冲突，重新生成 key 重试
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    if (!license || lastError) {
      throw lastError || new Error('Failed to generate unique license key');
    }

    await logAction({
      adminId: authResult.payload.id,
      action: 'create_license',
      targetType: 'license',
      targetId: license.id,
      details: { softwareName, licenseType, userId },
    });
    return NextResponse.json({
      id: license.id,
      licenseKey: license.licenseKey,
      userId: license.userId,
      username: license.user.username,
      softwareName: license.softwareName,
      expirationDate: license.expirationDate,
      hardwareBindingEnabled: license.hardwareBindingEnabled,
      hwid: license.hwid,
      status: license.status,
      licenseType: license.licenseType,
      duration: license.duration,
      activatedAt: license.activatedAt,
      createdAt: license.createdAt,
      createdBy: license.createdBy?.username || null,
    });
  } catch (error) {
    console.error('Error creating license:', error);
    return NextResponse.json(
      { error: 'Failed to create license' },
      { status: 500 }
    );
  }
}
