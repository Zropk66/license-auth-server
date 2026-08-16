import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { paginationSchema } from '@/lib/validations';

export async function GET(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }
  try {
    const url = new URL(req.url);
    const pageParam = url.searchParams.get('page');

    const orderBy = { createdAt: 'desc' as const };
    const include = {
      admin: {
        select: { username: true },
      },
    } as const;

    // 未提供 page 参数时返回全部数据（数组格式），保持前端兼容
    if (pageParam === null) {
      const logs = await prisma.auditLog.findMany({
        orderBy,
        include,
      });
      return NextResponse.json(logs);
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

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy,
        include,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count(),
    ]);

    return NextResponse.json({
      data: logs,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}
