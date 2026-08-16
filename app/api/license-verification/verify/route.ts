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

    // 创建或更新会话
    // 由于 hardwareId 可能为 null，且 schema 中无 @@unique([licenseKey, hardwareId])，
    // 使用事务包裹 findFirst + create/update 以避免竞态条件
    const session = await prisma.$transaction(async (tx) => {
      const existingSession = await tx.session.findFirst({
        where: {
          licenseKey,
          hardwareId: hardwareId || null,
        },
      });

      if (existingSession) {
        return tx.session.update({
          where: {
            id: existingSession.id,
          },
          data: {
            ipAddress,
            lastHeartbeat: new Date(),
            status: 'active',
          },
        });
      } else {
        return tx.session.create({
          data: {
            licenseKey,
            hardwareId: hardwareId || null,
            ipAddress,
            status: 'active',
            lastHeartbeat: new Date(),
          },
        });
      }
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
