import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateAdminAuth, signJWT } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';
import { getClientIP } from '@/lib/rate-limit';

const updateProfileSchema = z.object({
  username: z
    .string()
    .min(3, '用户名至少需要 3 个字符')
    .max(50, '用户名不能超过 50 个字符')
    .regex(/^[a-zA-Z0-9_一-龥]+$/, '用户名只能包含中英文、数字与下划线'),
});

export async function GET(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  const { payload } = authResult;

  const admin = await prisma.admin.findUnique({
    where: { id: payload.id },
    select: {
      id: true,
      username: true,
      role: true,
      createdAt: true,
    },
  });

  if (!admin) {
    return NextResponse.json({ error: '管理员不存在' }, { status: 404 });
  }

  return NextResponse.json(admin);
}

export async function PUT(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  const { payload } = authResult;
  const ip = getClientIP(req);

  try {
    const body = await req.json();
    const parseResult = updateProfileSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || '输入格式错误' },
        { status: 400 }
      );
    }

    const newUsername = parseResult.data.username.trim();

    const existing = await prisma.admin.findFirst({
      where: {
        username: newUsername,
        NOT: { id: payload.id },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: '该用户名已被其他管理员占用' },
        { status: 409 }
      );
    }

    const currentAdmin = await prisma.admin.findUnique({
      where: { id: payload.id },
    });

    if (!currentAdmin) {
      return NextResponse.json({ error: '管理员不存在' }, { status: 404 });
    }

    const oldUsername = currentAdmin.username;

    const updatedAdmin = await prisma.admin.update({
      where: { id: payload.id },
      data: { username: newUsername },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    /* 重新签发含新用户名的 JWT 并更新 Cookie */
    const token = await signJWT({
      id: updatedAdmin.id,
      username: updatedAdmin.username,
      role: updatedAdmin.role,
      type: 'admin',
    });

    await logAction({
      adminId: updatedAdmin.id,
      action: 'edit_profile',
      targetType: 'admin',
      targetId: updatedAdmin.id,
      details: { oldUsername, newUsername, ip },
    });

    const response = NextResponse.json({
      success: true,
      user: updatedAdmin,
      message: '个人资料修改成功',
    });

    const isHttps = req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
    const isSecure = process.env.NODE_ENV === 'production' && isHttps;
    const cookieOptions = {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    };

    response.cookies.set({
      name: 'admin_auth_token',
      value: token,
      ...cookieOptions,
    });
    response.cookies.set({
      name: 'auth_token',
      value: token,
      ...cookieOptions,
    });

    return response;
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { error: '修改个人资料失败' },
      { status: 500 }
    );
  }
}

