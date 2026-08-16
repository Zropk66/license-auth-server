import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyJWT } from '@/lib/auth';

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

  // Admin page routes protection
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
    '/admin/:path*',
    '/user/:path*',
    '/api/admin/:path*',
    '/api/user/:path*',
  ],
};
