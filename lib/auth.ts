import { jwtVerify, SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { jwtPayloadSchema } from '@/lib/validations';

// Types
export type JWTPayload = {
  id: string;
  role?: string;
  username: string;
  type: 'admin' | 'user';
};

const JWT_ISSUER = 'license-auth-server';
const JWT_AUDIENCE = 'license-auth-server-users';

// Validate JWT_SECRET at module load time (fail-fast)
function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'JWT_SECRET is not set or too short (minimum 16 characters required). ' +
      'Set a strong JWT_SECRET environment variable.'
    );
  }
  return new TextEncoder().encode(secret);
}

// JWT Helpers
export async function signJWT(payload: JWTPayload): Promise<string> {
  const secret = getJwtSecret();

  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .sign(secret);
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    // Validate payload structure with zod
    const result = jwtPayloadSchema.safeParse(payload);
    if (!result.success) {
      return null;
    }

    return {
      id: result.data.id,
      username: result.data.username,
      type: result.data.type,
      role: result.data.role,
    };
  } catch {
    return null;
  }
}

// Auth Helpers
export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (!token) return null;

  return verifyJWT(token);
}

export async function validateAdminAuth(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;

  if (!token) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const payload = await verifyJWT(token);

  if (!payload || payload.type !== 'admin') {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return { payload };
}

export async function validateUserAuth(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;

  if (!token) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const payload = await verifyJWT(token);

  if (!payload || payload.type !== 'user') {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return { payload };
}

export async function requireAdminAuth() {
  const session = await getSession();

  if (!session || session.type !== 'admin') {
    redirect('/admin/login');
  }

  return session;
}

export async function requireUserAuth() {
  const session = await getSession();

  if (!session || session.type !== 'user') {
    redirect('/user/login');
  }

  return session;
}
