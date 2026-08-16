import { NextRequest, NextResponse } from 'next/server';
import { decryptData, encryptData } from '@/lib/encryption';
import prisma from '@/lib/prisma';
import { checkHeartbeatRateLimit, getClientIP } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rateLimit = checkHeartbeatRateLimit(ip);
    if (!rateLimit.allowed) {
      return encryptedResponse(
        { error: 'Too many heartbeat requests. Please try again later.' },
        429
      );
    }

    const encryptedData = await req.text();

    if (!encryptedData) {
      return NextResponse.json(
        { error: 'Missing encrypted data' },
        { status: 400 }
      );
    }

    let decryptedData: any;
    try {
      decryptedData = decryptData(encryptedData);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid encrypted data' },
        { status: 400 }
      );
    }

    const { licenseKey, hardwareId, sessionId } = decryptedData;

    if (!licenseKey) {
      return encryptedResponse(
        { error: 'License key is required' },
        400
      );
    }

    const license = await prisma.license.findUnique({
      where: {
        licenseKey,
      },
    });

    if (!license) {
      return encryptedResponse(
        {
          error: 'Invalid license key',
          message: '许可证不存在或无效，请联系管理员确认。'
        },
        404
      );
    }

    if (license.status === "revoked") {
      return encryptedResponse(
        {
          error: 'License has been revoked',
          message: '您的许可证已被管理员吊销，当前授权已被停用。'
        },
        403
      );
    }

    if (license.status === "suspended") {
      return encryptedResponse(
        {
          error: 'License has been suspended',
          message: '您的许可证已被管理员暂停使用，请联系管理员。'
        },
        403
      );
    }

    if (new Date(license.expirationDate) < new Date()) {
      return encryptedResponse(
        {
          error: 'License has expired',
          message: '您的许可证已过期，请及时续费后重新激活。'
        },
        403
      );
    }

    if (license.hardwareBindingEnabled && license.hardwareId && license.hardwareId !== hardwareId) {
      return encryptedResponse(
        {
          error: 'License is bound to a different hardware ID',
          message: '许可证已在另一台设备上绑定使用，当前设备无权访问。'
        },
        403
      );
    }

    const session = await prisma.session.findFirst({
      where: {
        id: sessionId || undefined,
        licenseKey,
        hardwareId: hardwareId || null,
      },
    });

    if (!session) {
      return encryptedResponse(
        {
          error: 'Session not found. Please re-verify.',
          message: '您的客户端连接会话失效或参数不匹配。'
        },
        401
      );
    }

    if (session.status !== 'active') {
      return encryptedResponse(
        {
          error: 'Session is inactive. Please re-verify.',
          message: '您的设备会话已失效或被管理员暂时停用。'
        },
        401
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

    return encryptedResponse({
      status: updatedSession.status,
      sessionId: updatedSession.id,
      heartbeatInterval,
    });

  } catch (error) {
    console.error('License heartbeat error:', error);
    return encryptedResponse(
      { error: 'An unexpected error occurred' },
      500
    );
  }
}

function encryptedResponse(data: any, status = 200) {
  const encrypted = encryptData(data);
  return new NextResponse(encrypted, {
    status,
    headers: {
      'Content-Type': 'text/plain',
    },
  });
}
