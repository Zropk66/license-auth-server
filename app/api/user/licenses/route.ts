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

    // 未提供 page 参数时返回全部数据（数组格式），保持前端兼容
    if (pageParam === null) {
      const licenses = await prisma.license.findMany({
        where,
        orderBy,
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
