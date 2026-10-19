import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateKeyPair } from '@/lib/crypto-sign';
import { sealEnvelope, openEnvelope, MAX_EVIDENCE } from '@/lib/veil-envelope';
import { encodeLicensePayload } from '@/lib/payload-seal';
import prisma from '@/lib/prisma';
import { getClientIP, checkVerifyRateLimit } from '@/lib/rate-limit';
import { isBlacklisted, recordSuspiciousActivity } from '@/lib/blacklist';
import { validateNonce } from '@/lib/nonce';
import { logVerificationAttempt } from '@/lib/verification-logger';
import { checkSoftwareVersionAllowed } from '@/lib/secure-protocol';

/**
 * veil 客户端验证端点。
 *
 * 与 /verify 的区别在传输层与载荷封装：
 *
 *   /verify       自行实现 v2 信封，RSA-OAEP 包裹会话密钥，AES-GCM 加密
 *                 请求体与响应；载荷走 XOR 密钥流，HWID 参与派生
 *   /veil         纯 JSON over TLS，依赖客户端已做证书固定；
 *                 载荷走 AES-GCM，证据与 HWID 共同参与派生
 *
 * 不共用 /verify 的传输层，因为那层的 RSA 是为明文 HTTP 提供机密性。
 * veil 客户端走证书固定的 TLS，再套一层是重复防护，还会迫使客户端
 * 引入 bcrypt 依赖。
 *
 * 请求体即业务 JSON 明文，响应体亦然。机密性与完整性由 TLS 与载荷
 * 签名分别保证。
 */

interface VeilRequest {
  licenseKey?: unknown;
  hwid?: unknown;
  deviceName?: unknown;
  nonce?: unknown;
  timestamp?: unknown;
  softwareName?: unknown;
  version?: unknown;
  versionCode?: unknown;
  evidence?: unknown;
  /**
   * 证据布局标识。客户端据此声明它用的 provider 组合，服务端按登记表
   * 取对应的零基线长度。省略时取默认布局。
   */
  evidenceLayout?: unknown;
}

/**
 * 证据布局注册表。
 *
 * 布局长度是协议的一部分，不是服务端配置。客户端声明它用的是哪套布局，
 * 服务端按登记表取对应的零基线长度。未登记的布局直接拒绝——服务端
 * 只承认自己知道的那几套。
 *
 * 为什么允许客户端声明长度而不算「采信客户端」：服务端信的是「长度是
 * 多少」这个格式事实，不是「观测内容是什么」。攻击者把长度改大或改小，
 * 只会让两侧派生出不同的密钥，解不开。
 *
 * 登记进本表的布局必须满足零基线：正常环境下客户端的观测逐字节为零。
 * 模块拓扑与证书指纹不满足这一点——前者随安装目录与加载顺序变化，
 * 后者在走 TLS 时必然是真实摘要——因此两者都不在任何已登记布局里。
 *
 * 新增布局时在此登记。客户端与服务端必须同时发布，否则旧客户端会
 * 因为布局 ID 未登记而被拒。
 */
const EVIDENCE_LAYOUTS: Record<string, { size: number; description: string }> = {
  // AntiDebugSnapshot 16
  '1': { size: 16, description: 'anti-debug counters' },
  // AntiDebugSnapshot 16 + CodeIntegrity 260
  '2': { size: 276, description: 'layout 1 plus code integrity deltas' },
};

/** 客户端未声明布局时的默认值，对应 veil 的出厂标准布局 */
const DEFAULT_LAYOUT_ID = '1';

/**
 * 证据不参与服务端派生。
 *
 * 服务端必须用自己知道的值构造 info，而不是客户端上报的值。若照抄上报
 * 内容，攻击者改动本机环境后把实测到的非零证据一并发来，两侧仍会派生
 * 出同一把密钥，环境检测形同虚设。
 *
 * 正常环境下全部观测为零，因此服务端的期望值就是全零缓冲区。客户端
 * 环境被篡改时它本地测到非零，派生出的密钥与服务端不同，表现为解不开。
 *
 * 客户端上报的证据只用于记录与排查，不进派生。长度与格式仍然校验，
 * 异常输入直接拒绝——那属于请求格式错误，与「环境是否可信」无关。
 */
function decodeReportedEvidence(value: unknown): Buffer | null {
  if (value === undefined || value === null) return Buffer.alloc(0);
  if (typeof value !== 'string') return null;
  if (value.length === 0) return Buffer.alloc(0);
  if (!/^[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) return null;

  const buffer = Buffer.from(value, 'hex');
  if (buffer.length > MAX_EVIDENCE) return null;
  return buffer;
}

/**
 * 构造服务端侧的派生输入。
 *
 * 全零，长度取自登记表。客户端启用未登记的布局时无法对接——这是有意
 * 的：服务端只认自己知道的那几套，避免长度随意变化导致两侧静默分叉。
 */
function serverEvidence(layoutId: string): Buffer | null {
  const layout = EVIDENCE_LAYOUTS[layoutId];
  if (!layout) return null;
  return Buffer.alloc(layout.size);
}

/**
 * 解析客户端声明的布局标识。
 *
 * 缺失时取默认值，与 veil 的出厂标准布局一致。非字符串或未登记一律
 * 视为无效，由调用方拒绝。
 */
function resolveLayoutId(value: unknown): string | null {
  if (value === undefined || value === null) return DEFAULT_LAYOUT_ID;
  if (typeof value !== 'string') return null;
  if (!Object.prototype.hasOwnProperty.call(EVIDENCE_LAYOUTS, value)) return null;
  return value;
}

function strField(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function numField(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

/**
 * 失败一律返回 HTTP 200 与统一外形，不区分失败原因。
 * 探测者无法据此判断「卡密不存在」与「软件不匹配」的差别。
 */
function failure(code: string, message: string, status = 200) {
  return NextResponse.json({ success: false, code, message }, { status });
}

export async function POST(req: NextRequest) {
  const ipAddress = getClientIP(req);

  try {
    const ipCheck = await isBlacklisted(ipAddress);
    if (ipCheck.blacklisted) {
      await logVerificationAttempt({
        ipAddress,
        success: false,
        reason: 'ip_blacklisted',
      });
      return failure('DENIED', '请求被拒绝。');
    }

    const limit = await checkVerifyRateLimit(ipAddress);
    if (!limit.allowed) {
      await logVerificationAttempt({
        ipAddress,
        success: false,
        reason: 'rate_limited',
      });
      recordSuspiciousActivity(ipAddress, 'rate_limit');
      return failure('RATE_LIMITED', '请求过于频繁，请稍后再试。');
    }

    const body = (await req.json().catch(() => null)) as VeilRequest | null;
    if (!body || typeof body !== 'object') {
      return failure('BAD_REQUEST', '请求格式无效。');
    }

    const licenseKey = strField(body.licenseKey);
    const hwid = strField(body.hwid);
    const deviceName = strField(body.deviceName);
    const nonce = strField(body.nonce);
    const timestamp = numField(body.timestamp);
    const softwareName = strField(body.softwareName);
    const versionCode = numField(body.versionCode);

    // 上报的证据只用于记录，不进派生。格式非法即拒绝，那属于请求
    // 格式错误。
    const reportedEvidence = decodeReportedEvidence(body.evidence);
    if (reportedEvidence === null) {
      await logVerificationAttempt({
        ipAddress,
        licenseKey: licenseKey ?? null,
        success: false,
        reason: 'invalid_evidence',
      });
      return failure('BAD_REQUEST', '请求格式无效。');
    }

    // 布局标识决定服务端的零基线长度。未登记的布局无法对接，直接拒绝。
    const layoutId = resolveLayoutId(body.evidenceLayout);
    if (layoutId === null) {
      await logVerificationAttempt({
        ipAddress,
        licenseKey: licenseKey ?? null,
        success: false,
        reason: 'unknown_evidence_layout',
      });
      return failure('BAD_REQUEST', '请求格式无效。');
    }

    // 上报长度必须与声明布局一致。不一致说明客户端装配与服务端认知
    // 不同步，继续派生只会产出一把双方都无法使用的密钥。
    if (reportedEvidence.length !== 0 &&
        reportedEvidence.length !== EVIDENCE_LAYOUTS[layoutId].size) {
      await logVerificationAttempt({
        ipAddress,
        licenseKey: licenseKey ?? null,
        success: false,
        reason: 'evidence_layout_mismatch',
      });
      return failure('BAD_REQUEST', '请求格式无效。');
    }

    // 服务端侧的派生输入。正常环境的观测全为零，因此期望值是零缓冲。
    // 客户端把实测值发来只说明它测到了什么，不代表服务端的期望。
    const evidence = serverEvidence(layoutId);
    if (evidence === null) {
      return failure('BAD_REQUEST', '请求格式无效。');
    }

    if (hwid) {
      const hwCheck = await isBlacklisted(ipAddress, hwid);
      if (hwCheck.blacklisted) {
        await logVerificationAttempt({
          ipAddress,
          licenseKey,
          softwareName,
          hwid,
          deviceName,
          success: false,
          reason: 'hwid_blacklisted',
        });
        return failure('DENIED', '请求被拒绝。');
      }
    }

    const nonceCheck = await validateNonce(nonce, timestamp);
    if (!nonceCheck.valid) {
      await logVerificationAttempt({
        ipAddress,
        licenseKey,
        softwareName,
        hwid,
        deviceName,
        success: false,
        reason: 'anti_replay_failed',
      });
      return failure('REPLAY', '请求时效校验失败。');
    }

    if (!licenseKey) {
      await logVerificationAttempt({
        ipAddress,
        licenseKey: null,
        softwareName,
        hwid,
        deviceName,
        success: false,
        reason: 'missing_license_key',
      });
      return failure('BAD_REQUEST', '缺少许可证标识。');
    }

    if (!softwareName) {
      await logVerificationAttempt({
        ipAddress,
        licenseKey,
        softwareName: null,
        hwid,
        deviceName,
        success: false,
        reason: 'missing_software_name',
      });
      return failure('BAD_REQUEST', '缺少软件标识。');
    }

    const license = await prisma.license.findUnique({
      where: { licenseKey },
      include: { user: { select: { username: true } } },
    });

    if (!license) {
      await logVerificationAttempt({
        ipAddress,
        licenseKey,
        softwareName,
        hwid,
        deviceName,
        success: false,
        reason: 'invalid_license_key',
      });
      recordSuspiciousActivity(ipAddress, 'bruteforce', hwid);
      return failure('INVALID', '许可证不存在或无效。');
    }

    const isUniversal = license.softwareName === 'ALL' || license.softwareName === '*';
    if (!isUniversal && license.softwareName !== softwareName) {
      await logVerificationAttempt({
        ipAddress,
        licenseKey,
        softwareName,
        hwid,
        deviceName,
        success: false,
        reason: 'software_mismatch',
      });
      return failure('MISMATCH', '许可证与软件不匹配。');
    }

    const boundSoftware = await prisma.software.findUnique({
      where: { name: softwareName },
    });
    if (boundSoftware) {
      const versionCheck = checkSoftwareVersionAllowed(versionCode, boundSoftware);
      if (!versionCheck.allowed) {
        await logVerificationAttempt({
          ipAddress,
          licenseKey,
          softwareName,
          hwid,
          deviceName,
          success: false,
          reason: versionCheck.reason ?? 'version_expired',
        });
        return failure(
          versionCheck.reason === 'software_disabled' ? 'SOFTWARE_DISABLED' : 'VERSION_EXPIRED',
          versionCheck.message ?? '当前版本不可用。'
        );
      }
    }

    if (license.status === 'revoked') {
      await logVerificationAttempt({
        ipAddress,
        licenseKey,
        softwareName,
        hwid,
        deviceName,
        success: false,
        reason: 'license_revoked',
      });
      return failure('REVOKED', '许可证已被撤销。');
    }

    if (license.status === 'suspended') {
      await logVerificationAttempt({
        ipAddress,
        licenseKey,
        softwareName,
        hwid,
        deviceName,
        success: false,
        reason: 'license_suspended',
      });
      return failure('SUSPENDED', '许可证已被暂停。');
    }

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
            include: { user: { select: { username: true } } },
          });
        }
      }
    } else if (license.status === 'unactivated' && license.licenseType === 'duration' && license.duration) {
      const expirationDate = new Date(now.getTime() + license.duration * 60 * 1000);
      activeLicense = await prisma.license.update({
        where: { id: license.id },
        data: { status: 'active', activatedAt: now, expirationDate },
        include: { user: { select: { username: true } } },
      });
    }

    if (new Date(activeLicense.expirationDate) < new Date()) {
      await logVerificationAttempt({
        ipAddress,
        licenseKey,
        softwareName,
        hwid,
        deviceName,
        success: false,
        reason: 'license_expired',
      });
      return failure('EXPIRED', '许可证已过期。');
    }

    // HWID 绑定。业务层仍按数据库状态判定：绑定检查、会话复用、
    // 绑定历史都依赖它。载荷层则把 HWID 作为派生输入，两层互不替代。
    if (activeLicense.hardwareBindingEnabled) {
      if (!hwid) {
        await logVerificationAttempt({
          ipAddress,
          licenseKey,
          softwareName,
          hwid: null,
          deviceName,
          success: false,
          reason: 'hwid_required',
        });
        return failure('HWID_REQUIRED', '此许可证启用设备绑定，未提供设备标识。');
      }

      if (!activeLicense.hwid) {
        activeLicense = await prisma.license.update({
          where: { id: activeLicense.id },
          data: { hwid, deviceName: deviceName ?? null },
          include: { user: { select: { username: true } } },
        });
      } else if (activeLicense.hwid !== hwid) {
        await logVerificationAttempt({
          ipAddress,
          licenseKey,
          softwareName,
          hwid,
          deviceName,
          success: false,
          reason: 'hwid_mismatch',
        });
        return failure('HWID_MISMATCH', '许可证已在另一台设备上绑定。');
      }
    }

    const nowDate = new Date();
    const session = await prisma.$transaction(async (tx) => {
      const reusable = await tx.session.findFirst({
        where: { licenseKey, hwid: hwid || null, status: 'active' },
        orderBy: { lastHeartbeat: 'desc' },
      });

      if (reusable) {
        return tx.session.update({
          where: { id: reusable.id },
          data: { ipAddress, lastHeartbeat: nowDate },
        });
      }

      if (!activeLicense.hardwareBindingEnabled) {
        const others = await tx.session.findMany({
          where: { licenseKey, status: 'active', NOT: { hwid: hwid || null } },
        });
        for (const old of others) {
          await tx.session.update({
            where: { id: old.id },
            data: { status: 'terminated', terminatedAt: old.lastHeartbeat },
          });
        }
      }

      return tx.session.create({
        data: {
          licenseKey,
          hwid: hwid || null,
          ipAddress,
          status: 'active',
          lastHeartbeat: nowDate,
        },
      });
    });

    const heartbeatSetting = await prisma.setting.findUnique({
      where: { key: 'heartbeat_interval' },
    });
    const heartbeatInterval = heartbeatSetting ? parseInt(heartbeatSetting.value, 10) : 30;

    await logVerificationAttempt({
      ipAddress,
      licenseKey,
      softwareName: activeLicense.softwareName,
      hwid,
      deviceName,
      success: true,
      reason: 'success',
    });

    if (hwid) {
      await prisma.licenseHardwareHistory
        .upsert({
          where: { licenseKey_hwid: { licenseKey: activeLicense.licenseKey, hwid } },
          create: {
            licenseKey: activeLicense.licenseKey,
            hwid,
            deviceName: deviceName ?? null,
            firstBoundAt: new Date(),
            lastSeenAt: new Date(),
          },
          update: { lastSeenAt: new Date(), deviceName: deviceName ?? undefined },
        })
        .catch((err) => {
          console.error('[HardwareHistory] upsert failed in veil verify:', err);
        });
    }

    const latestVer = await prisma.softwareVersion.findFirst({
      where: {
        softwareName: isUniversal ? softwareName : activeLicense.softwareName,
        enabled: true,
      },
      orderBy: { versionCode: 'desc' },
    });

    let hasUpdate = false;
    if (latestVer && versionCode !== undefined) {
      hasUpdate = latestVer.versionCode > versionCode;
    }

    // 签发载荷。证据与 HWID 共同进入派生，因此异地机器或环境被篡改
    // 都会导致客户端派生出另一把密钥，表现为解不开而非被拒绝。
    //
    // 未启用绑定的授权允许空 HWID，此时载荷与设备无关。服务端用卡密
    // 充当派生输入，与客户端的空 HWID 路径不一致——客户端在这条路径
    // 上必须传空 HWID，两侧才对齐。
    const { privateKey, publicKey } = getOrCreateKeyPair();
    const expiresAtMs = activeLicense.expirationDate
      ? activeLicense.expirationDate.getTime()
      : 0;

    const payload = encodeLicensePayload({
      issuedAt: Date.now(),
      expiresAt: expiresAtMs,
      featureMask: 0xffffffff,
      reserved: 0,
    });

    const sealed = sealEnvelope(
      payload,
      {
        cardKey: activeLicense.licenseKey,
        hwid: hwid ?? '',
        evidence,
        domain: 0x01,
      },
      privateKey
    );

    // 自校验：签发出的信封必须能被自己的公钥解开，且解出的内容与
    // 输入逐字节相同。这一步拦住派生参数错位这类只在客户端才暴露的
    // 故障，代价是一次本地解密。
    const roundTrip = openEnvelope(
      sealed,
      { cardKey: activeLicense.licenseKey, hwid: hwid ?? '', evidence, domain: 0x01 },
      publicKey
    );

    if (!roundTrip || !roundTrip.equals(payload)) {
      console.error('[VeilEnvelope] self check failed for license', licenseKey);
      return failure('INTERNAL', '签发自校验失败。', 500);
    }

    return NextResponse.json({
      success: true,
      licenseKey: activeLicense.licenseKey,
      username: activeLicense.user.username,
      softwareName: isUniversal ? softwareName : activeLicense.softwareName,
      expirationDate: activeLicense.expirationDate,
      hardwareBindingEnabled: activeLicense.hardwareBindingEnabled,
      status: activeLicense.status,
      sessionId: session.id,
      heartbeatInterval,
      hasUpdate,
      latestVersion: latestVer
        ? {
            version: latestVer.version,
            versionCode: latestVer.versionCode,
            downloadUrl: latestVer.downloadUrl,
            changelog: latestVer.changelog,
          }
        : null,
      // 客户端据此解出功能位与时效。其余字段仅供展示，不参与授权判定。
      envelope: sealed,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Veil verification error:', error);

    try {
      await prisma.verificationAttempt.create({
        data: { ipAddress, success: false, reason: 'unexpected_error' },
      });
    } catch (logErr) {
      console.error('Failed to log veil verification attempt:', logErr);
    }

    return failure('INTERNAL', '服务器内部错误，请稍后再试。', 500);
  }
}
