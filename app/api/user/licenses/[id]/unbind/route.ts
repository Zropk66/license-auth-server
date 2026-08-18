import { NextRequest, NextResponse } from 'next/server';
import { validateUserAuth } from '@/lib/auth';
import { processSelfServiceUnbind } from '@/lib/unbind-policy';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await validateUserAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const { id } = await params;
    const result = await processSelfServiceUnbind(id, authResult.payload.id);
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '解绑失败' },
      { status: 400 }
    );
  }
}
