import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '@/lib/auth';
import { logAction } from '@/lib/audit';
import { getClientIP } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const isSecure = req.headers.get('x-forwarded-proto') === 'https';
  const ip = getClientIP(req);

  // 尝试从 cookie 中提取管理员信息以记录审计日志
  const token = req.cookies.get('auth_token')?.value;
  if (token) {
    const payload = await verifyJWT(token);
    if (payload && payload.type === 'admin') {
      await logAction({
        adminId: payload.id,
        action: 'logout',
        targetType: 'admin',
        targetId: payload.id,
        details: { username: payload.username, ip },
      });
    }
  }

  const response = NextResponse.json({ success: true });

  // Clear the auth cookie (attributes aligned with login)
  response.cookies.set({
    name: 'auth_token',
    value: '',
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
