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

    const versions = await prisma.softwareVersion.findMany({
      where,
      orderBy: [{ softwareName: 'asc' }, { versionCode: 'desc' }],
    });

    return NextResponse.json(versions);
  } catch (error) {
    console.error('[AdminSoftwareVersions] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch software versions' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const body = await req.json();
    const { softwareName, version, versionCode, changelog, downloadUrl, fileHash, isForced, enabled } = body;

    if (!softwareName || !version || !versionCode) {
      return NextResponse.json(
        { error: 'Software Name, Version and Version Code are required' },
        { status: 400 }
      );
    }

    const newVersion = await prisma.softwareVersion.create({
      data: {
        softwareName: softwareName.trim(),
        version: version.trim(),
        versionCode: parseInt(versionCode, 10),
        changelog: changelog?.trim() || '',
        downloadUrl: downloadUrl ? downloadUrl.trim() : '',
        fileHash: fileHash?.trim() || null,
        isForced: Boolean(isForced),
        enabled: enabled !== undefined ? Boolean(enabled) : true,
      },
    });

    await logAction({
      adminId: authResult.payload.id,
      action: 'create_software_version',
      targetType: 'software_version',
      targetId: newVersion.id,
      details: { softwareName: newVersion.softwareName, version: newVersion.version },
    });

    return NextResponse.json(newVersion, { status: 201 });
  } catch (error: any) {
    console.error('[AdminSoftwareVersions] POST error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create version' }, { status: 500 });
  }
}
