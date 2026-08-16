import { NextRequest, NextResponse } from 'next/server';
import { decryptData, encryptData } from '@/lib/encryption';
import prisma from '@/lib/prisma';
import { getClientIP } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  // 使用统一的 getClientIP 获取客户端 IP
  const ipAddress = getClientIP(req);

  try {
    // 检查是否因失败次数过多被封锁（最近 5 分钟内）
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
      return encryptedResponse(
        { error: 'Too many failed verification attempts. Please try again later.' },
        429
      );
    }

    // 从请求中获取加密的 payload
    const encryptedData = await req.text();

    if (!encryptedData) {
      return NextResponse.json(
        { error: 'Missing encrypted data' },
        { status: 400 }
      );
    }

    // 解密数据
    let decryptedData: any;
    try {
      decryptedData = decryptData(encryptedData);
    } catch (error) {
      await prisma.verificationAttempt.create({
        data: {
          ipAddress,
          success: false,
          reason: 'decryption_failed',
        },
      });
      return NextResponse.json(
        { error: 'Invalid encrypted data' },
        { status: 400 }
      );
    }

    // 验证解密后的数据
    const { licenseKey, hardwareId } = decryptedData;

    if (!licenseKey) {
      await prisma.verificationAttempt.create({
        data: {
          ipAddress,
          success: false,
          reason: 'missing_license_key',
        },
      });
      return encryptedResponse(
        { error: 'License key is required' },
        400
      );
    }

    // 查找许可证
    const license = await prisma.license.findUnique({
      where: {
        licenseKey,
      },
      include: {
        user: {
          select: {
            username: true,
          },
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
      return encryptedResponse(
        { error: 'Invalid license key' },
        404
      );
    }

    // 检查许可证是否被撤销
    if (license.status === "revoked") {
      await prisma.verificationAttempt.create({
        data: {
          licenseKey,
          ipAddress,
          success: false,
          reason: 'license_revoked',
        },
      });
      return encryptedResponse(
        {
          error: 'License has been revoked',
          message: '您的许可证已被管理员撤销/吊销，授权已停用。'
        },
        403
      );
    }

    // 检查许可证是否被暂停
    if (license.status === "suspended") {
      await prisma.verificationAttempt.create({
        data: {
          licenseKey,
          ipAddress,
          success: false,
          reason: 'license_suspended',
        },
      });
      return encryptedResponse(
        {
          error: 'License has been suspended',
          message: '您的许可证已被管理员暂停使用，请联系管理员。'
        },
        403
      );
    }

    // 如果是 duration 类型且尚未激活，则进行激活
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
                select: {
                  username: true,
                },
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
            select: {
              username: true,
            },
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
      return encryptedResponse(
        { error: 'License has expired' },
        403
      );
    }

    // 检查硬件绑定
    if (activeLicense.hardwareBindingEnabled) {
      if (!hardwareId) {
        await prisma.verificationAttempt.create({
          data: {
            licenseKey,
            ipAddress,
            success: false,
            reason: 'hardware_id_required',
          },
        });
        return encryptedResponse(
          { error: 'Hardware ID is required for this license' },
          400
        );
      }

      // 如果尚未绑定硬件 ID，则绑定当前硬件 ID
      if (!activeLicense.hardwareId) {
        activeLicense = await prisma.license.update({
          where: {
            id: activeLicense.id,
          },
          data: {
            hardwareId,
          },
          include: {
            user: {
              select: {
                username: true,
              },
            },
          },
        });
      }
      // 否则检查硬件 ID 是否匹配
      else if (activeLicense.hardwareId !== hardwareId) {
        await prisma.verificationAttempt.create({
          data: {
            licenseKey,
            ipAddress,
            success: false,
            reason: 'hardware_id_mismatch',
          },
        });
        return encryptedResponse(
          { error: 'License is bound to a different hardware ID' },
          403
        );
      }
    }

    // 创建新会话（保留所有历史会话）
    // 在创建新会话前，先将该密钥及设备下的所有处于 active 状态 of 旧会话标记为 terminated，并以其最后活跃心跳时间作为下线时间
    const session = await prisma.$transaction(async (tx) => {
      // 找出当前所有处于活跃状态的旧会话
      const activeOldSessions = await tx.session.findMany({
        where: {
          licenseKey,
          hardwareId: hardwareId || null,
          status: 'active',
        },
      });

      // 逐个更新它们的终止时间和状态
      for (const oldSession of activeOldSessions) {
        await tx.session.update({
          where: { id: oldSession.id },
          data: {
            status: 'terminated',
            terminatedAt: oldSession.lastHeartbeat, // 最后一次心跳视为其下线时间
          },
        });
      }

      // 创建全新的会话记录
      return tx.session.create({
        data: {
          licenseKey,
          hardwareId: hardwareId || null,
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

    // 验证成功后，清理该 IP 的旧 VerificationAttempt 记录（删除 1 小时前的记录）
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.verificationAttempt.deleteMany({
      where: {
        ipAddress,
        createdAt: { lt: oneHourAgo },
      },
    });

    // 返回成功响应
    return encryptedResponse({
      valid: true,
      licenseKey: activeLicense.licenseKey,
      username: activeLicense.user.username,
      softwareName: activeLicense.softwareName,
      expirationDate: activeLicense.expirationDate,
      hardwareBindingEnabled: activeLicense.hardwareBindingEnabled,
      status: activeLicense.status,
      sessionId: session.id,
      heartbeatInterval,
    });

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

    return encryptedResponse(
      { error: 'An unexpected error occurred' },
      500
    );
  }
}

// 辅助函数：加密并发送响应
function encryptedResponse(data: any, status = 200) {
  const encryptedResponse = encryptData(data);

  return new NextResponse(encryptedResponse, {
    status,
    headers: {
      'Content-Type': 'text/plain',
    },
  });
}
