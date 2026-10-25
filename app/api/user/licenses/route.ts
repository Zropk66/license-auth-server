import { NextRequest, NextResponse } from 'next/server';
import { validateUserAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { paginationSchema } from '@/lib/validations';

export async function GET(req: NextRequest) {
  const authResult = await validateUserAuth(req);
  // 如果未授权，authResult 是 NextResponse，直接返回
  if (!('payload' in authResult)) {
    return authResult;
  }
  const { payload } = authResult;
  try {
    const url = new URL(req.url);
    const pageParam = url.searchParams.get('page');

    const where = { userId: payload.id };
    const orderBy = { createdAt: 'desc' as const };

    // 自定义载荷含偏移量与特征码等密钥材料，只应经封签信封下发，不能明文出现在用户接口
    const select = {
      id: true,
      licenseKey: true,
      userId: true,
      softwareName: true,
      expirationDate: true,
      hwid: true,
      deviceName: true,
      hardwareBindingEnabled: true,
      allowSelfUnbind: true,
      status: true,
      licenseType: true,
      duration: true,
      activatedAt: true,
      createdAt: true,
      updatedAt: true,
      lastUnboundAt: true,
      monthlyUnbindCount: true,
      unbindCountMonth: true,
      extraUnbindCount: true,
    } as const;

    // 未提供 page 参数时返回全部数据，保持前端兼容
    if (pageParam === null) {
      const licenses = await prisma.license.findMany({
        where,
        orderBy,
        select,
      });
      return NextResponse.json(licenses);
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
        where,
        orderBy,
        select,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.license.count({ where }),
    ]);

    return NextResponse.json({
      data: licenses,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Error fetching user licenses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch licenses' },
      { status: 500 }
    );
  }
}
