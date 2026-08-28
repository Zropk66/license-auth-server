import { NextRequest, NextResponse } from 'next/server';
import { signPayload } from '@/lib/crypto-sign';
import prisma from '@/lib/prisma';
import { getClientIP, checkHeartbeatRateLimit } from '@/lib/rate-limit';
import { isBlacklisted } from '@/lib/blacklist';
import { validateNonce } from '@/lib/nonce';
import { decryptEnvelope, encryptResponse, opaqueResponse, strField, numField } from '@/lib/secure-protocol';

/**
 * v2 信封加密传输：请求体为 { v, envelope, payload }，解密失败一律返回乱文；
 * 解密成功后的所有响应（含全部错误分支）用该请求的会话密钥加密，统一 HTTP 200。
 */
export async function POST(req: NextRequest) {
  let sessionKey: Buffer | null = null;

  try {
    const ip = getClientIP(req);

    // ── 解密前置层：IP 黑名单 / 限流在解密前执行，命中返回乱文 ──
    const ipCheck = await isBlacklisted(ip);
    if (ipCheck.blacklisted) {
      return NextResponse.json(opaqueResponse());
    }

    const rateLimit = await checkHeartbeatRateLimit(ip);
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

    const body = decrypted.body || {};
    const licenseKey = strField(body.licenseKey);
    const hwid = strField(body.hwid);
    const sessionId = strField(body.sessionId);
    const deviceName = strField(body.deviceName);
    const nonce = strField(body.nonce);
    const timestamp = numField(body.timestamp);
    const softwareName = strField(body.softwareName);

    if (hwid) {
      const hwCheck = await isBlacklisted(ip, hwid);
      if (hwCheck.blacklisted) {
        return enc({
          error: 'Access denied: Hardware ID is blacklisted',
          reason: hwCheck.reason,
        });
      }
    }

    const nonceCheck = await validateNonce(nonce, timestamp);
    if (!nonceCheck.valid) {
      return enc({
        error: 'Anti-replay validation failed',
        reason: nonceCheck.reason,
      });
    }

    if (!licenseKey) {
      return enc({
        error: 'License key is required',
      });
    }

    const license = await prisma.license.findUnique({
      where: {
        licenseKey,
      },
    });

    if (!license) {
      return enc({
        error: 'Invalid license key',
        message: '许可证不存在或无效，请联系管理员确认。',
      });
    }

    // 检查软件标识是否匹配（若客户端提供了 softwareName）
    if (softwareName && license.softwareName !== softwareName) {
      return enc({
        error: 'Software name mismatch',
        message: `许可证软件不匹配：该授权仅适用于「${license.softwareName}」。`,
      });
    }

    // 检查所属软件是否处于启用状态
    const boundSoftware = await prisma.software.findUnique({
      where: { name: license.softwareName },
    });
    if (boundSoftware && !boundSoftware.enabled) {
      return enc({
        error: 'Software is disabled',
        message: `所属软件「${license.softwareName}」已被管理员停用，该软件下所有授权暂不可用。`,
      });
    }

    if (license.status === 'revoked') {
      return enc({
        error: 'License has been revoked',
        message: '您的许可证已被管理员吊销，当前授权已被停用。',
      });
    }

    if (license.status === 'suspended') {
      return enc({
        error: 'License has been suspended',
        message: '您的许可证已被管理员暂停使用，请联系管理员。',
      });
    }

    if (new Date(license.expirationDate) < new Date()) {
      return enc({
        error: 'License has expired',
        message: '您的许可证已过期，请及时续费后重新激活。',
      });
    }

    if (license.hardwareBindingEnabled && license.hwid && license.hwid !== hwid) {
      return enc({
        error: 'License is bound to a different hardware ID',
        message: '许可证已在另一台设备上绑定使用，当前设备无权访问。',
      });
    }

    const session = await prisma.session.findFirst({
      where: {
        id: sessionId || undefined,
        licenseKey,
        hwid: hwid || null,
      },
    });

    if (!session) {
      return enc({
        error: 'Session not found. Please re-verify.',
        message: '您的客户端连接会话失效或参数不匹配。',
      });
    }

    if (session.status !== 'active') {
      return enc({
        error: 'Session is inactive. Please re-verify.',
        message: '您的设备会话已失效或被管理员重置/停用，请重新激活。',
      });
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

    // Ed25519 签名后整体加密（sign-then-encrypt）
    const signedResponse = signPayload({
      status: updatedSession.status,
      sessionId: updatedSession.id,
      heartbeatInterval,
      timestamp: Date.now(),
    });

    return enc(signedResponse);

  } catch (error) {
    console.error('License heartbeat error:', error);
    return NextResponse.json(
      sessionKey
        ? encryptResponse(sessionKey, { error: 'An unexpected error occurred', message: '服务器发生内部错误，请稍后再试。' })
        : opaqueResponse()
    );
  }
}
