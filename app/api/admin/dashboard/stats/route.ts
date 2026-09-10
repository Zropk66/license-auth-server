import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { formatOnlyDate } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const authResult = await validateAdminAuth(req);

  // If not authorized, authResult is a NextResponse, so return it directly
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    // Get total users
    const totalUsers = await prisma.user.count();
    
    // Get total licenses
    const totalLicenses = await prisma.license.count();
    
    // Get active users (users with non-expired licenses)
    const now = new Date();
    const activeUsersCount = await prisma.user.count({
      where: {
        licenses: {
          some: {
            expirationDate: {
              gt: now,
            },
          },
        },
      },
    });

    // Get total online sessions (active in the last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const onlineSessionsCount = await prisma.session.count({
      where: {
        lastHeartbeat: {
          gte: fiveMinutesAgo,
        },
        status: 'active',
      },
    });

    // Calculate active users percentage
    const activeUsersPercent = totalUsers > 0
      ? Math.round((activeUsersCount / totalUsers) * 100)
      : 0;
    
    // Get expiring soon licenses (next 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const expiringSoonLicenses = await prisma.license.count({
      where: {
        expirationDate: {
          gt: now,
          lte: thirtyDaysFromNow,
        },
        status: 'active',
      },
    });

    // Get license stats by type
    const durationCount = await prisma.license.count({ where: { licenseType: 'duration' } });
    const fixedCount = await prisma.license.count({ where: { licenseType: 'fixed' } });

    // Get license stats by status (incorporate the custom logic of isExpired)
    const revokedCount = await prisma.license.count({ where: { status: 'revoked' } });
    const suspendedCount = await prisma.license.count({ where: { status: 'suspended' } });
    const unactivatedCount = await prisma.license.count({ where: { status: 'unactivated' } });

    // For expired and active(valid)
    const expiredCount = await prisma.license.count({
      where: {
        status: 'active',
        expirationDate: { lt: now }
      }
    });

    const validCount = await prisma.license.count({
      where: {
        status: 'active',
        expirationDate: { gte: now }
      }
    });

    // 获取最近 7 天的生成与激活数据
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const recentLicenses = await prisma.license.findMany({
      where: {
        OR: [
          { createdAt: { gte: sevenDaysAgo } },
          { activatedAt: { gte: sevenDaysAgo } },
        ],
      },
      select: {
        createdAt: true,
        activatedAt: true,
      },
    });

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return formatOnlyDate(d);
    });

    const createdCounts: Record<string, number> = {};
    const activatedCounts: Record<string, number> = {};
    last7Days.forEach((day) => {
      createdCounts[day] = 0;
      activatedCounts[day] = 0;
    });

    recentLicenses.forEach((l) => {
      if (l.createdAt) {
        const cDay = formatOnlyDate(l.createdAt);
        if (createdCounts[cDay] !== undefined) {
          createdCounts[cDay]++;
        }
      }
      if (l.activatedAt) {
        const aDay = formatOnlyDate(l.activatedAt);
        if (activatedCounts[aDay] !== undefined) {
          activatedCounts[aDay]++;
        }
      }
    });

    const recentActivity = last7Days.map((date) => ({
      date,
      created: createdCounts[date] || 0,
      activated: activatedCounts[date] || 0,
    }));

    return NextResponse.json({
      totalUsers,
      totalLicenses,
      activeUsers: activeUsersCount,
      activeUsersPercent,
      expiringSoonLicenses,
      onlineSessions: onlineSessionsCount,
      recentActivity,
      types: {
        duration: durationCount,
        fixed: fixedCount,
      },
      statuses: {
        valid: validCount,
        unactivated: unactivatedCount,
        expired: expiredCount,
        suspended: suspendedCount,
        revoked: revokedCount,
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch dashboard statistics' },
      { status: 500 }
    );
  }
}