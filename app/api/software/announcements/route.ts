import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getClientIP, checkVerifyRateLimit, createRateLimitResponse } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rateLimit = checkVerifyRateLimit(ip);
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.resetIn);
    }

    const { searchParams } = new URL(req.url);
    const softwareName = searchParams.get('software')?.trim();

    const whereCondition = {
      enabled: true,
      ...(softwareName
        ? {
            OR: [
              { softwareName: 'ALL' },
              { softwareName },
            ],
          }
        : { softwareName: 'ALL' }),
    };

    const announcements = await prisma.announcement.findMany({
      where: whereCondition,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      announcements: announcements.map((a) => ({
        id: a.id,
        softwareName: a.softwareName,
        title: a.title,
        content: a.content,
        type: a.type,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    console.error('[Announcements] get announcements failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch announcements' },
      { status: 500 }
    );
  }
}
