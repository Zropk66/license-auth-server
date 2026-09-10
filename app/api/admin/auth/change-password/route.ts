import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';
import { getClientIP } from '@/lib/rate-limit';
import { checkPasswordPolicy } from '@/lib/password-policy';

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '请输入当前旧密码'),
  newPassword: z.string().min(1, '请输入新密码').max(100, '密码长度不能超过 100 位'),
  confirmPassword: z.string().min(1, '请确认新密码'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: '两次输入的新密码不一致',
  path: ['confirmPassword'],
}).refine((data) => data.oldPassword !== data.newPassword, {
  message: '新密码不能与当前旧密码相同',
  path: ['newPassword'],
});

export async function POST(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  const { payload } = authResult;
  const ip = getClientIP(req);

  try {
    const body = await req.json();
    const parseResult = changePasswordSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || '参数校验失败' },
        { status: 400 }
      );
    }

    const { oldPassword, newPassword } = parseResult.data;

    const policyCheck = await checkPasswordPolicy(newPassword);
    if (!policyCheck.valid) {
      return NextResponse.json(
        { error: policyCheck.message || '密码不符合当前安全策略要求' },
        { status: 400 }
      );
    }

    const admin = await prisma.admin.findUnique({
      where: { id: payload.id },
    });

    if (!admin) {
      return NextResponse.json(
        { error: '当前管理员账号不存在或已被移除' },
        { status: 404 }
      );
    }

    const isOldPasswordCorrect = await bcrypt.compare(oldPassword, admin.password);
    if (!isOldPasswordCorrect) {
      await logAction({
        adminId: admin.id,
        action: 'change_password_failed',
        targetType: 'admin',
        targetId: admin.id,
        details: { username: admin.username, ip, reason: 'invalid_old_password' },
      });

      return NextResponse.json(
        { error: '当前旧密码输入错误' },
        { status: 400 }
      );
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    await prisma.admin.update({
      where: { id: admin.id },
      data: {
        password: hashedNewPassword,
      },
    });

    await logAction({
      adminId: admin.id,
      action: 'change_password',
      targetType: 'admin',
      targetId: admin.id,
      details: { username: admin.username, ip },
    });

    return NextResponse.json({
      success: true,
      message: '密码修改成功',
    });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json(
      { error: '修改密码失败，请稍后重试' },
      { status: 500 }
    );
  }
}
