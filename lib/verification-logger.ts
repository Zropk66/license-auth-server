import prisma from '@/lib/prisma';

export interface VerificationLogParams {
  ipAddress: string;
  licenseKey?: string | null;
  softwareName?: string | null;
  hwid?: string | null;
  deviceName?: string | null;
  success: boolean;
  reason?: string | null;
}

/**
 * 记录授权验证请求到数据库，并在服务端终端高亮输出实时日志
 */
export async function logVerificationAttempt({
  ipAddress,
  licenseKey,
  softwareName,
  hwid,
  deviceName,
  success,
  reason,
}: VerificationLogParams): Promise<void> {
  const time = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const statusLabel = success ? '\x1b[32mSUCCESS\x1b[0m' : `\x1b[31mFAILED (${reason || 'unknown'})\x1b[0m`;
  const keyDisplay = licenseKey
    ? licenseKey.length > 8
      ? `${licenseKey.slice(0, 4)}...${licenseKey.slice(-4)}`
      : licenseKey
    : '-';
  const appDisplay = softwareName || '-';
  const hwidDisplay = hwid ? (hwid.length > 8 ? `${hwid.slice(0, 8)}...` : hwid) : '-';

  // 服务端终端实时日志输出
  console.log(
    `[AUTH VERIFY] ${time} | ${statusLabel} | IP: ${ipAddress} | Key: ${keyDisplay} | App: ${appDisplay} | HWID: ${hwidDisplay}`
  );

  try {
    await prisma.verificationAttempt.create({
      data: {
        licenseKey: licenseKey || null,
        softwareName: softwareName || null,
        hwid: hwid || null,
        deviceName: deviceName || null,
        ipAddress,
        success,
        reason: reason || (success ? 'success' : null),
      },
    });
  } catch (err) {
    console.error('[VERIFY-LOG-FAILED]', {
      ipAddress,
      licenseKey,
      softwareName,
      hwid,
      deviceName,
      success,
      reason,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

