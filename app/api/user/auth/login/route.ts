import { NextRequest, NextResponse } from 'next/server';
import { isValidRecaptcha } from '@/lib/utils';
import { signJWT } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { userLoginSchema } from '@/lib/validations';
import { checkLoginRateLimit, getClientIP } from '@/lib/rate-limit';
import { logAction } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    // 速率限制：防止暴力破解
    const ip = getClientIP(req);
    const rateLimit = checkLoginRateLimit(ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000)) } }
      );
    }

    const body = await req.json();

    // 使用 zod schema 验证请求体
    const parseResult = userLoginSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const { userHash, recaptchaToken } = parseResult.data;

    // 如果启用了 reCAPTCHA 则进行校验
    const recaptchaSetting = await prisma.setting.findUnique({
      where: { key: 'enable_recaptcha' },
    });
    const hasRecaptchaKeys = !!((process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || process.env.RECAPTCHA_SITE_KEY) && process.env.RECAPTCHA_SECRET_KEY);
    const enableRecaptcha = hasRecaptchaKeys && (recaptchaSetting ? recaptchaSetting.value !== 'false' : true);

    if (enableRecaptcha) {
      const recaptchaValid = await isValidRecaptcha(
        recaptchaToken,
        process.env.RECAPTCHA_SECRET_KEY || ''
      );

      if (!recaptchaValid) {
        return NextResponse.json(
          { error: 'reCAPTCHA verification failed' },
          { status: 400 }
        );
      }
    }

    // 检查用户是否存在
    const user = await prisma.user.findUnique({
      where: { userHash },
    });

    if (!user) {
      // 审计日志：用户不存在
      await logAction({
        adminId: null,
        action: 'user_login_failed',
        targetType: 'user',
        targetId: userHash,
        details: { ip, reason: 'user_not_found' },
      });

      return NextResponse.json(
        { error: 'Invalid user hash' },
        { status: 401 }
      );
    }

    // 创建 JWT
    const token = await signJWT({
      id: user.id,
      username: user.username,
      type: 'user',
    });

    // 审计日志：用户登录成功
    await logAction({
      adminId: null,
      action: 'user_login_success',
      targetType: 'user',
      targetId: user.id,
      details: { username: user.username, ip },
    });

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
