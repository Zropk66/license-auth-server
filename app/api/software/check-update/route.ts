import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getClientIP, checkVerifyRateLimit } from '@/lib/rate-limit';
import { decryptEnvelope, encryptResponse, opaqueResponse } from '@/lib/secure-protocol';

/**
 * v2 信封加密传输（原 GET 查询串改为 POST 加密体）：
 * 请求体 { v, envelope, payload }，payload 解密后为 { software, version, versionCode }。
 * 响应用会话密钥加密，统一 HTTP 200；解密失败一律返回乱文。
 */
export async function POST(req: NextRequest) {
  let sessionKey: Buffer | null = null;

  try {
    const ip = getClientIP(req);

    const rateLimit = await checkVerifyRateLimit(ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(opaqueResponse());
    }

    const raw = await req.json().catch(() => null);
    const decrypted = decryptEnvelope(raw);
    if (!decrypted) {
      return NextResponse.json(opaqueResponse());
    }
    sessionKey = decrypted.sessionKey;
    const enc = (obj: unknown) => NextResponse.json(encryptResponse(sessionKey as Buffer, obj));

    const { software, version, versionCode } = decrypted.body || {};

    const softwareName = typeof software === 'string' ? software.trim() : '';
    const currentVersion = typeof version === 'string' ? version.trim() : '';
    const currentVersionCodeStr =
      typeof versionCode === 'string' ? versionCode.trim() : versionCode != null ? String(versionCode) : '';

    if (!softwareName) {
      return enc({ error: 'Missing software parameter' });
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
      return enc({
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

    return enc({
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
      sessionKey
        ? encryptResponse(sessionKey, { error: 'Failed to check update' })
        : opaqueResponse()
    );
  }
}
