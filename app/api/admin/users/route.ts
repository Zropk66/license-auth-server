import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { generateUserHash } from '@/lib/utils';
import { createUserSchema, paginationSchema } from '@/lib/validations';

export async function GET(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  // 如果未授权，authResult 是 NextResponse，直接返回
  if (!('payload' in authResult)) {
    return authResult;
  }
  try {
    const url = new URL(req.url);
    const pageParam = url.searchParams.get('page');

    const orderBy = { createdAt: 'desc' as const };
    // 从 select 中移除 userHash，不再暴露给前端
    const select = {
      id: true,
      username: true,
      createdAt: true,
      _count: { select: { licenses: true } },
      createdBy: { select: { username: true } },
    } as const;

    const mapUser = (user: {
      id: string;
      username: string;
      createdAt: Date;
      _count: { licenses: number };
      createdBy: { username: string } | null;
    }) => ({
      id: user.id,
      username: user.username,
      createdAt: user.createdAt,
      licenseCount: user._count.licenses,
      createdBy: user.createdBy?.username || null,
    });

    // 未提供 page 参数时返回全部数据（数组格式），保持前端兼容
    if (pageParam === null) {
      const users = await prisma.user.findMany({
        orderBy,
        select,
      });
      return NextResponse.json(users.map(mapUser));
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

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        orderBy,
        select,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count(),
    ]);

    return NextResponse.json({
      data: users.map(mapUser),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
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
    const parseResult = createUserSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const { username } = parseResult.data;

    // 检查是否已存在相同用户名的用户
    const existingUser = await prisma.user.findFirst({
      where: { username: username.trim() }
    });
    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this username already exists' },
        { status: 409 }
      );
    }
    // 生成唯一的用户哈希
    const userHash = generateUserHash();
    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        userHash,
        createdById: authResult.payload.id,
      },
      select: {
        id: true,
        username: true,
        createdAt: true,
        createdBy: { select: { username: true } },
      },
    });
    return NextResponse.json({
      id: user.id,
      username: user.username,
      createdAt: user.createdAt,
      createdBy: user.createdBy?.username || null,
      licenseCount: 0,
    });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
