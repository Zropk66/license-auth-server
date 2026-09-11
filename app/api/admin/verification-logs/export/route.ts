import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { formatDate } from '@/lib/utils';
import { format } from 'date-fns';
import { Prisma } from '@prisma/client';

const REASON_MAP: Record<string, string> = {
  success: '验证成功',
  ip_blacklisted: 'IP 在黑名单中',
  rate_limited: '请求过于频繁 (限流)',
  blocked_due_to_rate_limit: '短时间内多次失败被阻断',
  invalid_envelope: '加密信封解密失败',
  hwid_blacklisted: '设备 HWID 在黑名单中',
  anti_replay_failed: '防重放/时间戳校验失败',
  missing_software_name: '缺少软件标识',
  missing_license_key: '缺少卡密',
  invalid_license_key: '卡密无效或不存在',
  software_mismatch: '卡密所属软件不匹配',
  software_disabled: '软件已被管理员停用',
  license_revoked: '卡密已被撤销/吊销',
  license_suspended: '卡密已被冻结/暂停',
  license_expired: '卡密已过期',
  hwid_required: '未提供设备 HWID',
  hwid_mismatch: '设备 HWID 与已绑定设备不匹配',
};

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const url = new URL(req.url);
    const search = url.searchParams.get('search')?.trim();
    const status = url.searchParams.get('status')?.trim();
    const software = url.searchParams.get('software')?.trim();

    const where: Prisma.VerificationAttemptWhereInput = {};

    if (status === 'success') {
      where.success = true;
    } else if (status === 'failed') {
      where.success = false;
    }

    if (software && software !== 'all') {
      where.softwareName = software;
    }

    if (search) {
      where.OR = [
        { licenseKey: { contains: search, mode: 'insensitive' } },
        { ipAddress: { contains: search, mode: 'insensitive' } },
        { hwid: { contains: search, mode: 'insensitive' } },
        { softwareName: { contains: search, mode: 'insensitive' } },
        { deviceName: { contains: search, mode: 'insensitive' } },
        { reason: { contains: search, mode: 'insensitive' } },
      ];
    }

    const logs = await prisma.verificationAttempt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const headers = [
      '请求时间',
      '所属软件',
      '授权卡密',
      '客户端 IP',
      '硬件特征码 (HWID)',
      '设备名称',
      '验证状态',
      '拦截原因 / 详情',
    ];

    const rows = logs.map((log) => {
      const reasonLabel = log.reason ? REASON_MAP[log.reason] || log.reason : log.success ? '验证成功' : '-';
      return [
        formatDate(log.createdAt),
        log.softwareName || '-',
        log.licenseKey || '-',
        log.ipAddress,
        log.hwid || '-',
        log.deviceName || '-',
        log.success ? '验证成功' : '拦截拒绝',
        reasonLabel,
      ];
    });

    const csvContent =
      '﻿' +
      [
        headers.map(escapeCsv).join(','),
        ...rows.map((r) => r.map(escapeCsv).join(',')),
      ].join('\r\n');

    const fileName = `verification_logs_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting verification logs:', error);
    return NextResponse.json(
      { error: '导出授权验证日志失败' },
      { status: 500 }
    );
  }
}
