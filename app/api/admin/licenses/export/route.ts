import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { formatDate } from '@/lib/utils';
import { format } from 'date-fns';

/* 将特殊字符和双引号安全转义为标准 CSV 单元格 */
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
    const softwareName = url.searchParams.get('softwareName') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const search = url.searchParams.get('search') || undefined;

    const where: any = {};
    if (softwareName) {
      where.softwareName = softwareName;
    }
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { licenseKey: { contains: search, mode: 'insensitive' } },
        { softwareName: { contains: search, mode: 'insensitive' } },
        { user: { username: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const licenses = await prisma.license.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { username: true } },
        createdBy: { select: { username: true } },
      },
    });

    const headers = [
      '卡密',
      '所属软件',
      '绑定用户',
      '状态',
      '授权类型',
      '激活时间',
      '到期时间',
      '已绑设备HWID',
      '设备名称',
      '允许自主换绑',
      '最后换绑时间',
      '卡密备注',
      '创建时间',
      '创建者',
    ];

    const rows = licenses.map((item) => {
      let statusLabel = '正常';
      if (item.status === 'revoked') statusLabel = '已撤销';
      else if (item.status === 'suspended') statusLabel = '已冻结';
      else if (item.status === 'unactivated') statusLabel = '待激活';
      else if (new Date(item.expirationDate) < new Date()) statusLabel = '已到期';
      else if (new Date(item.expirationDate).getFullYear() >= 2099) statusLabel = '永久有效';

      const typeLabel =
        item.licenseType === 'duration'
          ? `时长卡 (${item.duration ? Math.round(item.duration / 60) : 0}小时)`
          : '即时固定卡';

      const activatedAtStr = item.activatedAt ? formatDate(item.activatedAt) : '-';
      const expirationDateStr =
        item.status === 'unactivated' && item.licenseType === 'duration'
          ? '-'
          : formatDate(item.expirationDate);
      const lastUnboundAtStr = item.lastUnboundAt ? formatDate(item.lastUnboundAt) : '-';

      return [
        item.licenseKey,
        item.softwareName,
        item.user?.username || '-',
        statusLabel,
        typeLabel,
        activatedAtStr,
        expirationDateStr,
        item.hwid || '-',
        item.deviceName || '-',
        item.allowSelfUnbind ? '是' : '否',
        lastUnboundAtStr,
        item.note || '-',
        formatDate(item.createdAt),
        item.createdBy?.username || '系统',
      ];
    });

    /* 在首部注入 UTF-8 BOM 避免 Excel 打开中文出现乱码 */
    const csvContent =
      '﻿' +
      [
        headers.map(escapeCsv).join(','),
        ...rows.map((r) => r.map(escapeCsv).join(',')),
      ].join('\r\n');

    const fileName = `licenses_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting licenses:', error);
    return NextResponse.json(
      { error: '导出授权数据失败' },
      { status: 500 }
    );
  }
}
