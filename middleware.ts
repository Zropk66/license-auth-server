import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyJWT } from '@/lib/auth';

async function generatePortalSignature(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode("portal-access-allowed-secure-salt");
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, data);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function redirectUrl(req: NextRequest, path: string): URL {
  const xfp = req.headers.get('x-forwarded-proto');
  const proto = xfp === 'http' ? 'http' : 'https';
  const host =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    'localhost';
  return new URL(path, `${proto}://${host}`);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const securityPath = process.env.PORTAL_SECURITY_PATH || 'secure-zropk';

  if (pathname === `/${securityPath}` || pathname === `/${securityPath}/`) {
    const response = NextResponse.redirect(redirectUrl(request, '/admin/login'));
    const secret = process.env.JWT_SECRET || 'fallback-portal-secret-salt-min-16';
    const signature = await generatePortalSignature(secret);

    response.cookies.set('portal_authorized', signature, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
    });
    return response;
  }

  // 3. 动态读取需要门禁保护的路径（由 PORTAL_PROTECTED_PATHS 配置，逗号分隔）
  // 可选值：home（首页 /）、admin（管理门户）、user（用户门户）
  const protectedPaths = (process.env.PORTAL_PROTECTED_PATHS || 'home,admin,user')
    .split(',')
    .map(s => s.trim().toLowerCase());

  const isProtected =
    (protectedPaths.includes('home') && pathname === '/') ||
    (protectedPaths.includes('admin') && (pathname.startsWith('/admin') || pathname === '/admin/login')) ||
    (protectedPaths.includes('user') && (pathname.startsWith('/user') || pathname === '/user/login'));

  if (isProtected) {
    const portalAuth = request.cookies.get('portal_authorized')?.value;
    const secret = process.env.JWT_SECRET || 'fallback-portal-secret-salt-min-16';
    const expectedSignature = await generatePortalSignature(secret);

    if (portalAuth !== expectedSignature) {
      return new NextResponse('Forbidden: Access via secure portal path only.', { status: 403 });
    }
  }

  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.redirect(redirectUrl(request, '/admin/login'));
    }

    const payload = await verifyJWT(token);
    if (!payload || payload.type !== 'admin') {
      return NextResponse.redirect(redirectUrl(request, '/admin/login'));
    }
  }

  // User page routes protection
  if (pathname.startsWith('/user') && pathname !== '/user/login') {
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.redirect(redirectUrl(request, '/user/login'));
    }

    const payload = await verifyJWT(token);
    if (!payload || payload.type !== 'user') {
      return NextResponse.redirect(redirectUrl(request, '/user/login'));
    }
  }

  // API routes protection (defense in depth)
  // Admin API routes (except auth endpoints)
  if (pathname.startsWith('/api/admin/') && !pathname.startsWith('/api/admin/auth/')) {
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await verifyJWT(token);
    if (!payload || payload.type !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // User API routes (except auth endpoints)
  if (pathname.startsWith('/api/user/') && !pathname.startsWith('/api/user/auth/')) {
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await verifyJWT(token);
    if (!payload || payload.type !== 'user') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
