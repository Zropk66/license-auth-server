import { NextRequest, NextResponse } from 'next/server';
import { signPayload } from '@/lib/crypto-sign';
import prisma from '@/lib/prisma';
import { getClientIP, checkVerifyRateLimit, createRateLimitResponse } from '@/lib/rate-limit';
import { isBlacklisted, recordSuspiciousActivity } from '@/lib/blacklist';
import { validateNonce } from '@/lib/nonce';

export async function POST(req: NextRequest) {
  const ipAddress = getClientIP(req);

  try {
    const ipBlacklistCheck = await isBlacklisted(ipAddress);
    if (ipBlacklistCheck.blacklisted) {
      return NextResponse.json(
        { error: 'Access denied: IP is blacklisted', reason: ipBlacklistCheck.reason },
        { status: 403 }
      );
    }

    const verifyLimit = checkVerifyRateLimit(ipAddress);
    if (!verifyLimit.allowed) {
      await prisma.verificationAttempt.create({
        data: {
          ipAddress,
          success: false,
          reason: 'rate_limited',
        },
      });
      recordSuspiciousActivity(ipAddress, 'rate_limit');
      return createRateLimitResponse(verifyLimit.resetIn);
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
      await prisma.verificationAttempt.create({
        data: {
          ipAddress,
          success: false,
          reason: 'blocked_due_to_rate_limit',
        },
      });
      recordSuspiciousActivity(ipAddress, 'rate_limit');
      return NextResponse.json(
        { error: 'Too many failed verification attempts. Please try again later.' },
        { status: 429 }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      await prisma.verificationAttempt.create({
        data: {
          ipAddress,
          success: false,
          reason: 'invalid_json_body',
        },
      });
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const { licenseKey, hwid, deviceName, nonce, timestamp, softwareName } = body || {};

    if (hwid) {
      const hwBlacklistCheck = await isBlacklisted(ipAddress, hwid);
      if (hwBlacklistCheck.blacklisted) {
        return NextResponse.json(
          { error: 'Access denied: Hardware ID is blacklisted', reason: hwBlacklistCheck.reason },
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

    if (!softwareName) {
      await prisma.verificationAttempt.create({
        data: {
          licenseKey: licenseKey || null,
          ipAddress,
          success: false,
          reason: 'missing_software_name',
        },
      });
      return NextResponse.json(
        {
          error: 'Software name is required',
          message: '请求中未提供软件标识 (softwareName)。',
        },
        { status: 400 }
      );
    }

    if (!licenseKey) {
      await prisma.verificationAttempt.create({
        data: {
          ipAddress,
          success: false,
          reason: 'missing_license_key',
        },
      });
      return NextResponse.json(
        { error: 'License key is required' },
        { status: 400 }
      );
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
      await prisma.verificationAttempt.create({
        data: {
          licenseKey,
          ipAddress,
          success: false,
          reason: 'invalid_license_key',
        },
      });
      recordSuspiciousActivity(ipAddress, 'bruteforce', hwid);
      return NextResponse.json(
        {
          error: 'Invalid license key',
          message: '许可证不存在或无效，请联系管理员确认。',
        },
        { status: 404 }
      );
    }

    // 检查软件标识是否匹配
    if (license.softwareName !== softwareName) {
      await prisma.verificationAttempt.create({
        data: {
          licenseKey,
          ipAddress,
          success: false,
          reason: 'software_mismatch',
        },
      });
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
      await prisma.verificationAttempt.create({
        data: {
          licenseKey,
          ipAddress,
          success: false,
          reason: 'software_disabled',
        },
      });
      return NextResponse.json(
        {
          error: 'Software is disabled',
          message: `所属软件「${license.softwareName}」已被管理员停用，该软件下所有授权暂不可用。`,
        },
        { status: 403 }
      );
    }

    // 检查许可证是否被撤销
    if (license.status === 'revoked') {
      await prisma.verificationAttempt.create({
        data: {
          licenseKey,
          ipAddress,
          success: false,
          reason: 'license_revoked',
        },
      });
      return NextResponse.json(
        {
          error: 'License has been revoked',
          message: '您的许可证已被管理员撤销/吊销，授权已停用。',
        },
        { status: 403 }
      );
    }

    // 检查许可证是否被暂停
    if (license.status === 'suspended') {
      await prisma.verificationAttempt.create({
        data: {
          licenseKey,
          ipAddress,
          success: false,
          reason: 'license_suspended',
        },
      });
      return NextResponse.json(
        {
          error: 'License has been suspended',
          message: '您的许可证已被管理员暂停使用，请联系管理员。',
        },
        { status: 403 }
      );
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
          expirationDate: expirationDate,
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
      await prisma.verificationAttempt.create({
        data: {
          licenseKey,
          ipAddress,
          success: false,
          reason: 'license_expired',
        },
      });
      return NextResponse.json(
        {
          error: 'License has expired',
          message: '您的许可证已过期，请及时续费后重新激活。',
        },
        { status: 403 }
      );
    }

    // 检查HWID 绑定
    if (activeLicense.hardwareBindingEnabled) {
      if (!hwid) {
        await prisma.verificationAttempt.create({
          data: {
            licenseKey,
            ipAddress,
            success: false,
            reason: 'hwid_required',
          },
        });
        return NextResponse.json(
          {
            error: 'Hardware ID is required for this license',
            message: '此许可证已启用设备绑定，请求中未提供设备HWID。',
          },
          { status: 400 }
        );
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
        await prisma.verificationAttempt.create({
          data: {
            licenseKey,
            ipAddress,
            success: false,
            reason: 'hwid_mismatch',
          },
        });
        return NextResponse.json(
          {
            error: 'License is bound to a different hardware ID',
            message: '许可证已在另一台设备上绑定使用，当前设备无权访问。',
          },
          { status: 403 }
        );
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

    // 记录成功的验证尝试
    await prisma.verificationAttempt.create({
      data: {
        licenseKey,
        ipAddress,
        success: true,
      },
    });

    // 成功后清理 1 小时前的记录
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.verificationAttempt.deleteMany({
      where: {
        ipAddress,
        createdAt: { lt: oneHourAgo },
      },
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

    // 组装授权数据并使用 Ed25519 私钥进行数字签名
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

    return NextResponse.json(signedResponse, { status: 200 });

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
      { error: 'An unexpected error occurred', message: '服务器发生内部错误，请稍后再试。' },
      { status: 500 }
    );
  }
}
