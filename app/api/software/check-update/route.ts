import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getClientIP, checkVerifyRateLimit } from '@/lib/rate-limit';
import {
  decryptEnvelope,
  encryptResponse,
  opaqueResponse,
  isWellFormedEnvelope,
  expiredPlaintextResponse,
  checkSoftwareVersionAllowed,
} from '@/lib/secure-protocol';

export async function POST(req: NextRequest) {
  let sessionKey: Buffer | null = null;
  let isEncrypted = false;

  try {
    const ip = getClientIP(req);

    const rateLimit = await checkVerifyRateLimit(ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(opaqueResponse());
    }

    const raw = await req.json().catch(() => null);

    let softwareParam: unknown;
    let versionParam: unknown;
    let versionCodeParam: unknown;

    if (raw && typeof raw === 'object' && 'envelope' in raw && 'payload' in raw) {
      const decrypted = decryptEnvelope(raw);
      if (!decrypted) {
        if (isWellFormedEnvelope(raw)) {
          return NextResponse.json(expiredPlaintextResponse());
        }
        return NextResponse.json(opaqueResponse());
      }
      sessionKey = decrypted.sessionKey;
      isEncrypted = true;
      softwareParam = decrypted.body?.software || decrypted.body?.softwareName;
      versionParam = decrypted.body?.version;
      versionCodeParam = decrypted.body?.versionCode;
    } else if (raw && typeof raw === 'object') {
      softwareParam = raw.software || raw.softwareName;
      versionParam = raw.version;
      versionCodeParam = raw.versionCode;
    }

    const respond = (obj: unknown) => {
      if (isEncrypted && sessionKey) {
        return NextResponse.json(encryptResponse(sessionKey, obj));
      }
      return NextResponse.json(obj);
    };

    const softwareName = typeof softwareParam === 'string' ? softwareParam.trim() : '';
    const currentVersion = typeof versionParam === 'string' ? versionParam.trim() : '';
    const currentVersionCodeNum =
      typeof versionCodeParam === 'number'
        ? versionCodeParam
        : typeof versionCodeParam === 'string' && !isNaN(parseInt(versionCodeParam, 10))
        ? parseInt(versionCodeParam, 10)
        : undefined;

    if (!softwareName) {
      return respond({ error: 'Missing software parameter' });
    }

    const boundSoftware = await prisma.software.findUnique({
      where: { name: softwareName },
    });

    const latestVersion = await prisma.softwareVersion.findFirst({
      where: {
        softwareName,
        enabled: true,
      },
      orderBy: {
        versionCode: 'desc',
      },
    });

    if (boundSoftware) {
      const versionCheck = checkSoftwareVersionAllowed(currentCodeOrFallback(currentVersionCodeNum, latestVersion, currentVersion), boundSoftware);
      if (!versionCheck.allowed) {
        return respond({
          hasUpdate: true,
          isExpired: true,
          message: versionCheck.message,
          latestVersion: latestVersion
            ? {
                version: latestVersion.version,
                versionCode: latestVersion.versionCode,
                changelog: latestVersion.changelog,
                downloadUrl: latestVersion.downloadUrl,
                fileHash: latestVersion.fileHash,
                isForced: true,
                releasedAt: latestVersion.createdAt,
              }
            : null,
        });
      }
    }

    if (!latestVersion) {
      return respond({
        hasUpdate: false,
        isExpired: false,
        message: 'No active version found for this software',
      });
    }

    let hasUpdate = false;
    if (currentVersionCodeNum !== undefined) {
      hasUpdate = latestVersion.versionCode > currentVersionCodeNum;
    } else if (currentVersion) {
      hasUpdate = latestVersion.version !== currentVersion;
    } else {
      hasUpdate = true;
    }

    return respond({
      hasUpdate,
      isExpired: false,
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
      sessionKey
        ? encryptResponse(sessionKey, { error: 'Failed to check update' })
        : opaqueResponse()
    );
  }
}

function currentCodeOrFallback(
  code: number | undefined,
  latestVersion: { version: string; versionCode: number } | null,
  versionStr: string
): number | undefined {
  if (code !== undefined) return code;
  if (latestVersion && versionStr && latestVersion.version === versionStr) {
    return latestVersion.versionCode;
  }
  return undefined;
}
