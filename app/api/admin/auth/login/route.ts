import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { isValidRecaptcha } from '@/lib/utils';
import { signJWT } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { adminLoginSchema } from '@/lib/validations';
import { checkLoginRateLimit, getClientIP } from '@/lib/rate-limit';

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
    const parseResult = adminLoginSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const { username, password, recaptchaToken, setupToken } = parseResult.data;

    // 如果启用了 reCAPTCHA 则进行校验
    const recaptchaSetting = await prisma.setting.findUnique({
      where: { key: 'enable_recaptcha' },
    });
    const hasRecaptchaKeys = !!(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && process.env.RECAPTCHA_SECRET_KEY);
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

        // 密码强度校验：至少 4 字符
        if (password.length < 4) {
          return NextResponse.json(
            { error: 'Password must be at least 4 characters' },
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
          maxAge: 8 * 60 * 60, // 8 小时
        });

        return response;
      }

      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, admin.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // 创建 JWT
    const token = await signJWT({
      id: admin.id,
      username: admin.username,
      role: admin.role,
      type: 'admin',
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
      maxAge: 8 * 60 * 60, // 8 小时
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
