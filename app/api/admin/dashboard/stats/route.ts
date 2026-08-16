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

    // Get licenses created in the last 7 days grouped by date
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Get licenses activated in the last 7 days grouped by date
    const activationsByDay = await prisma.$queryRaw<{ date: Date; count: bigint }[]>`
      SELECT DATE("activatedAt") as date, COUNT(*) as count
      FROM "License"
      WHERE "activatedAt" >= ${sevenDaysAgo}
      GROUP BY DATE("activatedAt")
      ORDER BY date
    `;

    // Generate an array of the last 7 days
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      date.setHours(0, 0, 0, 0);
      return date;
    });

    // Get count of licenses created for each day
    const licensesByDay = await prisma.$queryRaw<{ date: Date; count: bigint }[]>`
      SELECT DATE("createdAt") as date, COUNT(*) as count
      FROM "License"
      WHERE "createdAt" >= ${sevenDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date
    `;

    // Map the results to the format needed for the chart
    const recentActivity = last7Days.map(day => {
      const dateStr = formatOnlyDate(day);
      const foundCreated = licensesByDay.find(
        item => formatOnlyDate(item.date) === dateStr
      );
      const foundActivated = activationsByDay.find(
        item => formatOnlyDate(item.date) === dateStr
      );
      return {
        date: dateStr,
        created: foundCreated ? Number(foundCreated.count) : 0,
        activated: foundActivated ? Number(foundActivated.count) : 0,
      };
    });

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