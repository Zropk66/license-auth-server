import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { createManagerSchema } from '@/lib/validations';

export async function GET(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  const { payload } = authResult;

  if (payload.role !== 'owner') {
    return NextResponse.json(
      { error: '只有系统所有者（owner）可以管理管理员账号' },
      { status: 403 }
    );
  }

  try {
    const managers = await prisma.admin.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json(managers);
  } catch (error) {
    console.error('Error fetching managers:', error);
    return NextResponse.json(
      { error: '获取管理员列表失败' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  const { payload } = authResult;

  if (payload.role !== 'owner') {
    return NextResponse.json(
      { error: '只有系统所有者（owner）可以管理管理员账号' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();

    // 使用 zod schema 验证请求体
    const parseResult = createManagerSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const { username, password, role } = parseResult.data;

    // 检查是否已存在相同用户名的管理员
    const existingManager = await prisma.admin.findUnique({
      where: { username: username.trim() },
    });

    if (existingManager) {
      return NextResponse.json(
        { error: '该用户名的管理员已存在' },
        { status: 409 }
      );
    }

    // 使用 12 rounds 进行 bcrypt 哈希
    const hashedPassword = await bcrypt.hash(password, 12);

    const newManager = await prisma.admin.create({
      data: {
        username: username.trim(),
        password: hashedPassword,
        role,
      },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json(newManager, { status: 201 });
  } catch (error) {
    console.error('Error creating manager:', error);
    return NextResponse.json(
      { error: '创建管理员失败' },
      { status: 500 }
    );
  }
}
