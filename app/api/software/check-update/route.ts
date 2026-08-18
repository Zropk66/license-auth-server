import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getClientIP, checkVerifyRateLimit, createRateLimitResponse } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rateLimit = await checkVerifyRateLimit(ip);
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.resetIn);
    }

    const { searchParams } = new URL(req.url);
    const softwareName = searchParams.get('software')?.trim();
    const currentVersion = searchParams.get('version')?.trim();
    const currentVersionCodeStr = searchParams.get('versionCode')?.trim();

    if (!softwareName) {
      return NextResponse.json(
        { error: 'Missing software parameter' },
        { status: 400 }
      );
    }

    const latestVersion = await prisma.softwareVersion.findFirst({
      where: {
        softwareName,
        enabled: true,
      },
      orderBy: {
        versionCode: 'desc',
      },
    });

    if (!latestVersion) {
      return NextResponse.json({
        hasUpdate: false,
        message: 'No active version found for this software',
      });
    }

    let hasUpdate = false;
    if (currentVersionCodeStr) {
      const currentCode = parseInt(currentVersionCodeStr, 10);
      if (!isNaN(currentCode)) {
        hasUpdate = latestVersion.versionCode > currentCode;
      }
    } else if (currentVersion) {
      hasUpdate = latestVersion.version !== currentVersion;
    } else {
      hasUpdate = true;
    }

    return NextResponse.json({
      hasUpdate,
      latestVersion: {
        version: latestVersion.version,
        versionCode: latestVersion.versionCode,
        changelog: latestVersion.changelog,
        downloadUrl: latestVersion.downloadUrl,
        fileHash: latestVersion.fileHash,
        isForced: latestVersion.isForced,
        releasedAt: latestVersion.createdAt,
      },
    });
  } catch (error) {
    console.error('[SoftwareUpdate] check-update failed:', error);
    return NextResponse.json(
      { error: 'Failed to check update' },
      { status: 500 }
    );
  }
}
