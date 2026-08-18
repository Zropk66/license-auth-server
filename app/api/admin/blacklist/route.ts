import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const search = searchParams.get('search')?.trim();

    const where: any = {};
    if (type && type !== 'all') {
      where.type = type;
    }
    if (search) {
      where.OR = [
        { value: { contains: search } },
        { reason: { contains: search } },
      ];
    }

    const items = await prisma.blacklist.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('[AdminBlacklist] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch blacklist' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const body = await req.json();
    const { type, value, reason, days } = body;

    if (!type || !value) {
      return NextResponse.json({ error: 'Type and Value are required' }, { status: 400 });
    }

    let expiresAt: Date | null = null;
    if (days && Number(days) > 0) {
      expiresAt = new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000);
    }

    const record = await prisma.blacklist.upsert({
      where: { type_value: { type, value: value.trim() } },
      create: {
        type,
        value: value.trim(),
        reason: reason?.trim() || '管理员手动封禁',
        isAuto: false,
        expiresAt,
      },
      update: {
        reason: reason?.trim() || '管理员手动封禁',
        isAuto: false,
        expiresAt,
      },
    });

    await logAction({
      adminId: authResult.payload.id,
      action: 'add_blacklist',
      targetType: 'blacklist',
      targetId: record.id,
      details: { type, value, reason, expiresAt },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error: any) {
    console.error('[AdminBlacklist] POST error:', error);
    return NextResponse.json({ error: error.message || 'Failed to add blacklist' }, { status: 500 });
  }
}
