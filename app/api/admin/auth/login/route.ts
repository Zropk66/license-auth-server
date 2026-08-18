import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { isValidTurnstileToken } from '@/lib/utils';
import { signJWT } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { adminLoginSchema } from '@/lib/validations';
import { checkLoginRateLimit, getClientIP, createRateLimitResponse } from '@/lib/rate-limit';
import { logAction } from '@/lib/audit';
import { isBlacklisted } from '@/lib/blacklist';
import { sendAlert } from '@/lib/notification';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);

    const blacklistCheck = await isBlacklisted(ip);
    if (blacklistCheck.blacklisted) {
      return NextResponse.json(
        { error: 'Access denied: IP is blacklisted', reason: blacklistCheck.reason },
        { status: 403 }
      );
    }

    const rateLimit = checkLoginRateLimit(ip);
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.resetIn);
    }

    const body = await req.json();

    const parseResult = adminLoginSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const { username, password, turnstileToken, setupToken } = parseResult.data;

    const captchaSetting = await prisma.setting.findUnique({
      where: { key: 'enable_recaptcha' },
    });
    const hasCaptchaKeys = !!(process.env.TURNSTILE_SECRET_KEY && (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || process.env.TURNSTILE_SITE_KEY));
    const enableCaptcha = hasCaptchaKeys && (captchaSetting ? captchaSetting.value !== 'false' : true);

    if (enableCaptcha) {
      const captchaValid = await isValidTurnstileToken(
        turnstileToken,
        process.env.TURNSTILE_SECRET_KEY || '',
        ip
      );

      if (!captchaValid) {
        return NextResponse.json(
          { error: '验证码验证失败' },
          { status: 400 }
        );
      }
    }

    // 检查管理员是否存在
    const admin = await prisma.admin.findUnique({
      where: { username },
    });

    if (!admin) {
      // 检查系统中是否已有管理员
      const adminCount = await prisma.admin.count();

      if (adminCount === 0) {
        // 首次部署：创建 owner 管理员
        // 如果设置了 SETUP_TOKEN 环境变量，则要求请求体中的 setupToken 与之匹配
        if (process.env.SETUP_TOKEN) {
          if (!setupToken || setupToken !== process.env.SETUP_TOKEN) {
            return NextResponse.json(
              { error: 'Invalid setup token' },
              { status: 403 }
            );
          }
        }

        // 密码强度校验：至少 6 字符
        if (password.length < 6) {
          return NextResponse.json(
            { error: 'Password must be at least 6 characters' },
            { status: 400 }
          );
        }

        // 使用 12 rounds 进行 bcrypt 哈希
        const hashedPassword = await bcrypt.hash(password, 12);

        const newAdmin = await prisma.admin.create({
          data: {
            username,
            password: hashedPassword,
            role: 'owner',
          },
        });

        // 审计日志：首次 owner 创建
        await logAction({
          adminId: newAdmin.id,
          action: 'owner_created',
          targetType: 'admin',
          targetId: newAdmin.id,
          details: { username, ip },
        });

        // 创建 JWT
        const token = await signJWT({
          id: newAdmin.id,
          username: newAdmin.username,
          role: newAdmin.role,
          type: 'admin',
        });

        // 设置 cookie
        const response = NextResponse.json(
          { success: true, message: 'Success' },
          { status: 201 }
        );

        const isSecure = req.headers.get('x-forwarded-proto') === 'https';
        response.cookies.set({
          name: 'auth_token',
          value: token,
          httpOnly: true,
          secure: isSecure,
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60, // 1 小时
        });

        return response;
      }

      // 审计日志：用户不存在且非首次部署
      await logAction({
        adminId: null,
        action: 'login_failed',
        targetType: 'admin',
        targetId: username,
        details: { username, ip, reason: 'user_not_found' },
      });

      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);

    if (!isPasswordValid) {
      await logAction({
        adminId: admin.id,
        action: 'login_failed',
        targetType: 'admin',
        targetId: admin.id,
        details: { username, ip, reason: 'wrong_password' },
      });

      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const token = await signJWT({
      id: admin.id,
      username: admin.username,
      role: admin.role,
      type: 'admin',
    });

    await logAction({
      adminId: admin.id,
      action: 'login_success',
      targetType: 'admin',
      targetId: admin.id,
      details: { username, ip },
    });

    sendAlert({
      title: '🔑 管理员登录成功',
      message: `管理员: ${admin.username}\n登录 IP: ${ip}\n时间: ${new Date().toLocaleString()}`,
      level: 'info',
      eventType: 'admin_login',
      metadata: { adminId: admin.id, username: admin.username, ip },
    }).catch(() => {});

    // 设置 cookie
    const response = NextResponse.json(
      { success: true },
      { status: 200 }
    );

    const isSecure = req.headers.get('x-forwarded-proto') === 'https';
    response.cookies.set({
      name: 'auth_token',
      value: token,
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60, // 1 小时
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);

    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
