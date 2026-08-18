import { NextRequest, NextResponse } from 'next/server';
import { signPayload } from '@/lib/crypto-sign';
import prisma from '@/lib/prisma';
import { checkHeartbeatRateLimit, getClientIP, createRateLimitResponse } from '@/lib/rate-limit';
import { isBlacklisted } from '@/lib/blacklist';
import { validateNonce } from '@/lib/nonce';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);

    const ipCheck = await isBlacklisted(ip);
    if (ipCheck.blacklisted) {
      return NextResponse.json(
        { error: 'Access denied: IP is blacklisted', reason: ipCheck.reason },
        { status: 403 }
      );
    }

    const rateLimit = checkHeartbeatRateLimit(ip);
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.resetIn);
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const { licenseKey, hwid, sessionId, deviceName, nonce, timestamp, softwareName } = body || {};

    if (hwid) {
      const hwCheck = await isBlacklisted(ip, hwid);
      if (hwCheck.blacklisted) {
        return NextResponse.json(
          { error: 'Access denied: Hardware ID is blacklisted', reason: hwCheck.reason },
          { status: 403 }
        );
      }
    }

    const nonceCheck = await validateNonce(nonce, timestamp);
    if (!nonceCheck.valid) {
      return NextResponse.json(
        { error: 'Anti-replay validation failed', reason: nonceCheck.reason },
        { status: 400 }
      );
    }

    if (!licenseKey) {
      return NextResponse.json(
        { error: 'License key is required' },
        { status: 400 }
      );
    }

    const license = await prisma.license.findUnique({
      where: {
        licenseKey,
      },
    });

    if (!license) {
      return NextResponse.json(
        {
          error: 'Invalid license key',
          message: '许可证不存在或无效，请联系管理员确认。',
        },
        { status: 404 }
      );
    }

    // 检查软件标识是否匹配（若客户端提供了 softwareName）
    if (softwareName && license.softwareName !== softwareName) {
      return NextResponse.json(
        {
          error: 'Software name mismatch',
          message: `许可证软件不匹配：该授权仅适用于「${license.softwareName}」。`,
        },
        { status: 403 }
      );
    }

    // 检查所属软件是否处于启用状态
    const boundSoftware = await prisma.software.findUnique({
      where: { name: license.softwareName },
    });
    if (boundSoftware && !boundSoftware.enabled) {
      return NextResponse.json(
        {
          error: 'Software is disabled',
          message: `所属软件「${license.softwareName}」已被管理员停用，该软件下所有授权暂不可用。`,
        },
        { status: 403 }
      );
    }

    if (license.status === 'revoked') {
      return NextResponse.json(
        {
          error: 'License has been revoked',
          message: '您的许可证已被管理员吊销，当前授权已被停用。',
        },
        { status: 403 }
      );
    }

    if (license.status === 'suspended') {
      return NextResponse.json(
        {
          error: 'License has been suspended',
          message: '您的许可证已被管理员暂停使用，请联系管理员。',
        },
        { status: 403 }
      );
    }

    if (new Date(license.expirationDate) < new Date()) {
      return NextResponse.json(
        {
          error: 'License has expired',
          message: '您的许可证已过期，请及时续费后重新激活。',
        },
        { status: 403 }
      );
    }

    if (license.hardwareBindingEnabled && license.hwid && license.hwid !== hwid) {
      return NextResponse.json(
        {
          error: 'License is bound to a different hardware ID',
          message: '许可证已在另一台设备上绑定使用，当前设备无权访问。',
        },
        { status: 403 }
      );
    }

    const session = await prisma.session.findFirst({
      where: {
        id: sessionId || undefined,
        licenseKey,
        hwid: hwid || null,
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          error: 'Session not found. Please re-verify.',
          message: '您的客户端连接会话失效或参数不匹配。',
        },
        { status: 401 }
      );
    }

    if (session.status !== 'active') {
      return NextResponse.json(
        {
          error: 'Session is inactive. Please re-verify.',
          message: '您的设备会话已失效或被管理员重置/停用，请重新激活。',
        },
        { status: 401 }
      );
    }

    const heartbeatSetting = await prisma.setting.findUnique({
      where: { key: 'heartbeat_interval' },
    });
    const heartbeatInterval = heartbeatSetting ? parseInt(heartbeatSetting.value, 10) : 30;

    if (license.licenseType === 'duration') {
      const now = new Date();
      const lastHeartbeatTime = new Date(session.lastHeartbeat).getTime();
      const elapsedMs = now.getTime() - lastHeartbeatTime;
      const expectedIntervalMs = heartbeatInterval * 1000;

      if (elapsedMs > expectedIntervalMs * 1.5) {
        const idleMs = elapsedMs - expectedIntervalMs;

        await prisma.$transaction(async (tx) => {
          const currentLicense = await tx.license.findUnique({
            where: { id: license.id },
            select: { expirationDate: true },
          });
          if (!currentLicense) return;

          const currentExp = new Date(currentLicense.expirationDate);
          const newExp = new Date(currentExp.getTime() + idleMs);

          await tx.license.update({
            where: { id: license.id },
            data: { expirationDate: newExp },
          });
        });
      }
    }

    const updatedSession = await prisma.session.update({
      where: {
        id: session.id,
      },
      data: {
        lastHeartbeat: new Date(),
      },
    });

    if (session.hwid) {
      await prisma.licenseHardwareHistory.updateMany({
        where: {
          licenseKey: session.licenseKey,
          hwid: session.hwid,
        },
        data: {
          lastSeenAt: new Date(),
          ...(deviceName ? { deviceName } : {}),
        },
      }).catch((err) => {
        console.error('[HardwareHistory] heartbeat update failed:', err);
      });

      if (deviceName && license.hwid === hwid) {
        await prisma.license.update({
          where: { id: license.id },
          data: { deviceName },
        }).catch((err) => {
          console.error('[License] deviceName update failed:', err);
        });
      }
    }

    const signedResponse = signPayload({
      status: updatedSession.status,
      sessionId: updatedSession.id,
      heartbeatInterval,
      timestamp: Date.now(),
    });

    return NextResponse.json(signedResponse, { status: 200 });

  } catch (error) {
    console.error('License heartbeat error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred', message: '服务器发生内部错误，请稍后再试。' },
      { status: 500 }
    );
  }
}
