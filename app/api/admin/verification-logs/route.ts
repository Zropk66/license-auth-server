import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { paginationSchema } from '@/lib/validations';
import { Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const url = new URL(req.url);
    const pageParam = url.searchParams.get('page');
    const pageSizeParam = url.searchParams.get('pageSize');
    const search = url.searchParams.get('search')?.trim();
    const status = url.searchParams.get('status')?.trim();

    const parseResult = paginationSchema.safeParse({
      page: pageParam || undefined,
      pageSize: pageSizeParam || undefined,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid pagination parameters' },
        { status: 400 }
      );
    }

    const { page, pageSize } = parseResult.data;

    const where: Prisma.VerificationAttemptWhereInput = {};

    if (status === 'success') {
      where.success = true;
    } else if (status === 'failed') {
      where.success = false;
    }

    if (search) {
      where.OR = [
        { licenseKey: { contains: search, mode: 'insensitive' } },
        { ipAddress: { contains: search, mode: 'insensitive' } },
        { reason: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.VerificationAttemptOrderByWithRelationInput = {
      createdAt: 'desc',
    };

    const [logs, total] = await Promise.all([
      prisma.verificationAttempt.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.verificationAttempt.count({ where }),
    ]);

    return NextResponse.json({
      data: logs,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Error fetching verification logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch verification logs' },
      { status: 500 }
    );
  }
}
