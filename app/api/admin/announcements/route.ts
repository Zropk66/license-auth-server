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
    const softwareName = searchParams.get('softwareName');

    const where: any = {};
    if (softwareName && softwareName !== 'all') {
      where.softwareName = softwareName;
    }

    const announcements = await prisma.announcement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(announcements);
  } catch (error) {
    console.error('[AdminAnnouncements] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch announcements' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const body = await req.json();
    const { softwareName, title, content, type, enabled } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: 'Title and Content are required' },
        { status: 400 }
      );
    }

    const announcement = await prisma.announcement.create({
      data: {
        softwareName: softwareName?.trim() || 'ALL',
        title: title.trim(),
        content: content.trim(),
        type: type || 'info',
        enabled: enabled !== undefined ? Boolean(enabled) : true,
      },
    });

    await logAction({
      adminId: authResult.payload.id,
      action: 'create_announcement',
      targetType: 'announcement',
      targetId: announcement.id,
      details: { title: announcement.title, softwareName: announcement.softwareName },
    });

    return NextResponse.json(announcement, { status: 201 });
  } catch (error: any) {
    console.error('[AdminAnnouncements] POST error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create announcement' }, { status: 500 });
  }
}
