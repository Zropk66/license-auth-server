import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { updateManagerSchema } from '@/lib/validations';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  const { payload } = authResult;

  if (payload.role !== 'owner') {
    return NextResponse.json(
      { error: '只有系统所有者（owner）可以修改管理员信息' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();

    // 使用 zod schema 验证请求体
    const parseResult = updateManagerSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const { password, role } = parseResult.data;
    const { id } = await params;

    const targetManager = await prisma.admin.findUnique({
      where: { id },
    });

    if (!targetManager) {
      return NextResponse.json(
        { error: '管理员不存在' },
        { status: 404 }
      );
    }

    // 不允许修改自己的角色，防止系统锁定
    if (payload.id === id && role && role !== targetManager.role) {
      return NextResponse.json(
        { error: '为了防止系统锁定，您不能修改自己的角色' },
        { status: 400 }
      );
    }

    const updateData: { password?: string; role?: string } = {};

    if (password) {
      // 使用 12 rounds 进行 bcrypt 哈希
      updateData.password = await bcrypt.hash(password, 12);
    }

    if (role) {
      updateData.role = role;
    }

    const updatedManager = await prisma.admin.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json(updatedManager);
  } catch (error) {
    console.error('Error updating manager:', error);
    return NextResponse.json(
      { error: '更新管理员信息失败' },
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

  const { payload } = authResult;

  if (payload.role !== 'owner') {
    return NextResponse.json(
      { error: '只有系统所有者（owner）可以删除管理员账号' },
      { status: 403 }
    );
  }

  const { id } = await params;

  // 不允许删除自己
  if (payload.id === id) {
    return NextResponse.json(
      { error: '您不能删除您自己的管理员账号' },
      { status: 400 }
    );
  }

  try {
    const targetManager = await prisma.admin.findUnique({
      where: { id },
    });

    if (!targetManager) {
      return NextResponse.json(
        { error: '管理员不存在' },
        { status: 404 }
      );
    }

    await prisma.admin.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting manager:', error);
    return NextResponse.json(
      { error: '删除管理员失败' },
      { status: 500 }
    );
  }
}
