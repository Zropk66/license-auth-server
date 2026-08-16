import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const isSecure = req.headers.get('x-forwarded-proto') === 'https';

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
