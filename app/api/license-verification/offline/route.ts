import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const { licenseKey, hwid, sessionId } = body || {};

    if (!licenseKey) {
      return NextResponse.json(
        { error: 'License key is required' },
        { status: 400 }
      );
    }

    const session = await prisma.session.findFirst({
      where: {
        id: sessionId || undefined,
        licenseKey,
        hwid: hwid || null,
        status: 'active',
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found or parameter mismatch' },
        { status: 404 }
      );
    }

    const now = new Date();
    await prisma.session.update({
      where: { id: session.id },
      data: {
        status: 'terminated',
        terminatedAt: now,
        lastHeartbeat: now,
      },
    });

    return NextResponse.json({ success: true, message: 'Offline reported successfully' }, { status: 200 });

  } catch (error) {
    console.error('Offline report error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
