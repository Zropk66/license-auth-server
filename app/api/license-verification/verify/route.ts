import { NextRequest, NextResponse } from 'next/server';
import { signPayload } from '@/lib/crypto-sign';
import prisma from '@/lib/prisma';
import { getClientIP, checkVerifyRateLimit } from '@/lib/rate-limit';
import { isBlacklisted, recordSuspiciousActivity } from '@/lib/blacklist';
import { validateNonce } from '@/lib/nonce';
import { decryptEnvelope, encryptResponse, opaqueResponse, strField, numField } from '@/lib/secure-protocol';
import { logVerificationAttempt } from '@/lib/verification-logger';

/**
 * v2 信封加密传输：请求体为 { v, envelope, payload }，解密失败一律返回乱文；
 * 解密成功后的所有响应（含全部错误分支）用该请求的会话密钥加密，统一 HTTP 200。
 */
export async function POST(req: NextRequest) {
  const ipAddress = getClientIP(req);
  let sessionKey: Buffer | null = null;

  try {
    // ── 解密前置层：IP 黑名单 / 限流在解密前执行，命中返回乱文 ──
    const ipBlacklistCheck = await isBlacklisted(ipAddress);
    if (ipBlacklistCheck.blacklisted) {
      await logVerificationAttempt({
        ipAddress,
        success: false,
        reason: 'ip_blacklisted',
      });
      return NextResponse.json(opaqueResponse());
    }

    const verifyLimit = await checkVerifyRateLimit(ipAddress);
    if (!verifyLimit.allowed) {
      await logVerificationAttempt({
        ipAddress,
        success: false,
        reason: 'rate_limited',
      });
      recordSuspiciousActivity(ipAddress, 'rate_limit');
      return NextResponse.json(opaqueResponse());
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const failureCount = await prisma.verificationAttempt.count({
      where: {
        ipAddress,
        success: false,
        createdAt: { gte: fiveMinutesAgo },
      },
    });

    if (failureCount >= 10) {
      await logVerificationAttempt({
        ipAddress,
        success: false,
        reason: 'blocked_due_to_rate_limit',
      });
      recordSuspiciousActivity(ipAddress, 'rate_limit');
      return NextResponse.json(opaqueResponse());
    }

    const raw = await req.json().catch(() => null);
    const decrypted = decryptEnvelope(raw);
    if (!decrypted) {
      await logVerificationAttempt({
        ipAddress,
        success: false,
        reason: 'invalid_envelope',
      });
      return NextResponse.json(opaqueResponse());
    }
    sessionKey = decrypted.sessionKey;
    const enc = (obj: unknown) => NextResponse.json(encryptResponse(sessionKey as Buffer, obj));

    const body = decrypted.body || {};
    const licenseKey = strField(body.licenseKey);
    const hwid = strField(body.hwid);
    const deviceName = strField(body.deviceName);
    const nonce = strField(body.nonce);
    const timestamp = numField(body.timestamp);
    const softwareName = strField(body.softwareName);

    if (hwid) {
      const hwBlacklistCheck = await isBlacklisted(ipAddress, hwid);
      if (hwBlacklistCheck.blacklisted) {
        await logVerificationAttempt({
          ipAddress,
          licenseKey,
          softwareName,
          hwid,
          success: false,
          reason: 'hwid_blacklisted',
        });
        return enc({
          error: 'Access denied: Hardware ID is blacklisted',
          reason: hwBlacklistCheck.reason,
        });
      }
    }

    const nonceCheck = await validateNonce(nonce, timestamp);
    if (!nonceCheck.valid) {
      await logVerificationAttempt({
        ipAddress,
        licenseKey,
        softwareName,
        hwid,
        success: false,
        reason: 'anti_replay_failed',
      });
      return enc({
        error: 'Anti-replay validation failed',
        reason: nonceCheck.reason,
      });
    }

    if (!softwareName) {
      await logVerificationAttempt({
        ipAddress,
        licenseKey: licenseKey || null,
        softwareName: null,
        hwid,
        success: false,
        reason: 'missing_software_name',
      });
      return enc({
        error: 'Software name is required',
        message: '请求中未提供软件标识 (softwareName)。',
      });
    }

    if (!licenseKey) {
      await logVerificationAttempt({
        ipAddress,
        licenseKey: null,
        softwareName,
        hwid,
        success: false,
        reason: 'missing_license_key',
      });
      return enc({
        error: 'License key is required',
      });
    }

    const license = await prisma.license.findUnique({
      where: { licenseKey },
      include: {
        user: {
          select: { username: true },
        },
      },
    });

    if (!license) {
      await logVerificationAttempt({
        ipAddress,
        licenseKey,
        softwareName,
        hwid,
        success: false,
        reason: 'invalid_license_key',
      });
      recordSuspiciousActivity(ipAddress, 'bruteforce', hwid);
      return enc({
        error: 'Invalid license key',
        message: '许可证不存在或无效，请联系管理员确认。',
      });
    }

    // 检查软件标识是否匹配
    if (license.softwareName !== softwareName) {
      await logVerificationAttempt({
        ipAddress,
        licenseKey,
        softwareName,
        hwid,
        success: false,
        reason: 'software_mismatch',
      });
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
      await logVerificationAttempt({
        ipAddress,
        licenseKey,
        softwareName,
        hwid,
        success: false,
        reason: 'software_disabled',
      });
      return enc({
        error: 'Software is disabled',
        message: `所属软件「${license.softwareName}」已被管理员停用，该软件下所有授权暂不可用。`,
      });
    }

    // 检查许可证是否被撤销
    if (license.status === 'revoked') {
      await logVerificationAttempt({
        ipAddress,
        licenseKey,
        softwareName,
        hwid,
        success: false,
        reason: 'license_revoked',
      });
      return enc({
        error: 'License has been revoked',
        message: '您的许可证已被管理员撤销/吊销，授权已停用。',
      });
    }

    // 检查许可证是否被暂停
    if (license.status === 'suspended') {
      await logVerificationAttempt({
        ipAddress,
        licenseKey,
        softwareName,
        hwid,
        success: false,
        reason: 'license_suspended',
      });
      return enc({
        error: 'License has been suspended',
        message: '您的许可证已被管理员暂停使用，请联系管理员。',
      });
    }

    // 处理时长卡激活与恢复
    let activeLicense = license;
    const now = new Date();

    if (license.status === 'active' && license.licenseType === 'duration') {
      const lastSession = await prisma.session.findFirst({
        where: { licenseKey: license.licenseKey },
        orderBy: { lastHeartbeat: 'desc' },
      });
      if (lastSession) {
        const offlineMs = now.getTime() - new Date(lastSession.lastHeartbeat).getTime();
        if (offlineMs > 0) {
          const currentExp = new Date(license.expirationDate);
          const newExp = new Date(currentExp.getTime() + offlineMs);
          activeLicense = await prisma.license.update({
            where: { id: license.id },
            data: { expirationDate: newExp },
            include: {
              user: {
                select: { username: true },
              },
            },
          });
        }
      }
    } else if (license.status === 'unactivated' && license.licenseType === 'duration' && license.duration) {
      const expirationDate = new Date(now.getTime() + license.duration * 60 * 1000);

      activeLicense = await prisma.license.update({
        where: { id: license.id },
        data: {
          status: 'active',
          activatedAt: now,
          expirationDate,
        },
        include: {
          user: {
            select: { username: true },
          },
        },
      });
    }

    // 检查许可证是否已过期
    if (new Date(activeLicense.expirationDate) < new Date()) {
      await logVerificationAttempt({
        ipAddress,
        licenseKey,
        softwareName,
        hwid,
        success: false,
        reason: 'license_expired',
      });
      return enc({
        error: 'License has expired',
        message: '您的许可证已过期，请及时续费后重新激活。',
      });
    }

    // 检查HWID 绑定
    if (activeLicense.hardwareBindingEnabled) {
      if (!hwid) {
        await logVerificationAttempt({
          ipAddress,
          licenseKey,
          softwareName,
          hwid: null,
          success: false,
          reason: 'hwid_required',
        });
        return enc({
          error: 'Hardware ID is required for this license',
          message: '此许可证已启用设备绑定，请求中未提供设备HWID。',
        });
      }

      // 如果尚未绑定HWID，则绑定当前HWID
      if (!activeLicense.hwid) {
        activeLicense = await prisma.license.update({
          where: { id: activeLicense.id },
          data: { hwid, deviceName: deviceName || null },
          include: {
            user: {
              select: { username: true },
            },
          },
        });
      } else if (activeLicense.hwid !== hwid) {
        await logVerificationAttempt({
          ipAddress,
          licenseKey,
          softwareName,
          hwid,
          success: false,
          reason: 'hwid_mismatch',
        });
        return enc({
          error: 'License is bound to a different hardware ID',
          message: '许可证已在另一台设备上绑定使用，当前设备无权访问。',
        });
      }
    }

    // 创建新会话：先将处于 active 状态的旧会话终止
    const session = await prisma.$transaction(async (tx) => {
      const activeOldSessions = await tx.session.findMany({
        where: {
          licenseKey,
          hwid: hwid || null,
          status: 'active',
        },
      });

      for (const oldSession of activeOldSessions) {
        await tx.session.update({
          where: { id: oldSession.id },
          data: {
            status: 'terminated',
            terminatedAt: oldSession.lastHeartbeat,
          },
        });
      }

      return tx.session.create({
        data: {
          licenseKey,
          hwid: hwid || null,
          ipAddress,
          status: 'active',
          lastHeartbeat: new Date(),
        },
      });
    });

    // 获取心跳间隔设置
    const heartbeatSetting = await prisma.setting.findUnique({
      where: { key: 'heartbeat_interval' },
    });
    const heartbeatInterval = heartbeatSetting ? parseInt(heartbeatSetting.value, 10) : 30;

    // 记录成功的验证尝试与终端日志
    await logVerificationAttempt({
      ipAddress,
      licenseKey,
      softwareName: activeLicense.softwareName,
      hwid,
      success: true,
      reason: 'success',
    });

    // 记录HWID 绑定历史（无论是否首次绑定均维护活跃记录）
    if (hwid) {
      await prisma.licenseHardwareHistory.upsert({
        where: {
          licenseKey_hwid: {
            licenseKey: activeLicense.licenseKey,
            hwid,
          },
        },
        create: {
          licenseKey: activeLicense.licenseKey,
          hwid,
          deviceName: deviceName || null,
          firstBoundAt: new Date(),
          lastSeenAt: new Date(),
        },
        update: {
          lastSeenAt: new Date(),
          deviceName: deviceName || undefined,
        },
      }).catch((err) => {
        console.error('[HardwareHistory] upsert failed in verify:', err);
      });
    }

    // 组装授权数据并使用 Ed25519 私钥进行数字签名，最后整体加密（sign-then-encrypt）
    const signedResponse = signPayload({
      valid: true,
      licenseKey: activeLicense.licenseKey,
      username: activeLicense.user.username,
      softwareName: activeLicense.softwareName,
      expirationDate: activeLicense.expirationDate,
      hardwareBindingEnabled: activeLicense.hardwareBindingEnabled,
      status: activeLicense.status,
      sessionId: session.id,
      heartbeatInterval,
      timestamp: Date.now(),
    });

    return enc(signedResponse);

  } catch (error) {
    console.error('License verification error:', error);

    try {
      await prisma.verificationAttempt.create({
        data: {
          ipAddress,
          success: false,
          reason: 'unexpected_error',
        },
      });
    } catch (logErr) {
      console.error('Failed to log unexpected error attempt:', logErr);
    }

    return NextResponse.json(
      sessionKey
        ? encryptResponse(sessionKey, { error: 'An unexpected error occurred', message: '服务器发生内部错误，请稍后再试。' })
        : opaqueResponse()
    );
  }
}
