import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '@/lib/auth';
import { logAction } from '@/lib/audit';
import { getClientIP } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const isHttps = req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
  const isSecure = process.env.NODE_ENV === 'production' && isHttps;
  const ip = getClientIP(req);

  const token =
    req.cookies.get('admin_auth_token')?.value ||
    req.cookies.get('auth_token')?.value;

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

  const clearOptions = {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  };

  response.cookies.set({
    name: 'admin_auth_token',
    value: '',
    ...clearOptions,
  });

  response.cookies.set({
    name: 'auth_token',
    value: '',
    ...clearOptions,
  });

  return response;
}
