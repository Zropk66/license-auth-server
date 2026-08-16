import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getSession();

  if (!session || session.type !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    id: session.id,
    username: session.username,
    role: session.role,
  });
}
