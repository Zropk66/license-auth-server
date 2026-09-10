import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { formatDate } from '@/lib/utils';
import { format } from 'date-fns';

const ACTION_MAP: Record<string, string> = {
  create_license: '创建授权',
  edit_license: '编辑授权',
  revoke_license: '撤销授权',
  suspend_license: '冻结授权',
  resume_license: '恢复授权',
  resume_unactivated_license: '激活授权',
  delete_license: '删除授权',
  reset_hwid: '重置HWID',
  batch_generate_license: '批量生成授权',
  batch_revoke_license: '批量撤销授权',
  batch_suspend_license: '批量冻结授权',
  batch_resume_license: '批量恢复授权',
  batch_active_license: '批量恢复授权',
  batch_change_software: '批量修改所属软件',
  batch_extend_duration: '批量增加时长',
  batch_reset_hwid: '批量重置HWID',
  batch_delete_license: '批量删除授权',
  batch_edit_license: '批量编辑授权',
  create_user: '创建用户',
  edit_user: '编辑用户',
  delete_user: '删除用户',
  reset_user_hash: '重置用户特征码',
  create_software: '创建软件',
  edit_software: '编辑软件',
  delete_software: '删除软件',
  create_software_version: '发布新版本',
  edit_software_version: '编辑版本',
  delete_software_version: '删除版本',
  create_announcement: '发布公告',
  edit_announcement: '编辑公告',
  delete_announcement: '删除公告',
  create_notification_channel: '添加通知渠道',
  edit_notification_channel: '编辑通知渠道',
  delete_notification_channel: '删除通知渠道',
  add_blacklist: '添加黑名单',
  edit_blacklist: '编辑黑名单',
  delete_blacklist: '移除黑名单',
  kick_session: '强制下线会话',
  kick_all_sessions: '清空全部会话',
  update_settings: '修改系统设置',
  cleanup_logs: '清理系统日志',
  create_manager: '创建管理员',
  edit_manager: '编辑管理员',
  delete_manager: '删除管理员',
  owner_created: '初始化系统所有者',
  login_success: '管理员登录成功',
  login_failed: '管理员登录失败',
  admin_logout: '管理员登出',
  user_login_success: '用户登录成功',
  user_login_failed: '用户登录失败',
  user_logout: '用户登出',
};

const TARGET_TYPE_MAP: Record<string, string> = {
  license: '授权卡密',
  user: '用户',
  software: '软件配置',
  version: '软件版本',
  announcement: '系统公告',
  notification_channel: '通知渠道',
  blacklist: '黑名单',
  session: '在线会话',
  setting: '系统设置',
  system: '系统维护',
  admin: '管理员',
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
    const { id: adminId, role } = authResult.payload;
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || undefined;
    const targetType = url.searchParams.get('targetType') || undefined;
    const startDate = url.searchParams.get('startDate') || undefined;
    const endDate = url.searchParams.get('endDate') || undefined;

    const where: any = role === 'owner' ? {} : { adminId };
    if (action && action !== 'all') {
      where.action = action;
    }
    if (targetType && targetType !== 'all') {
      where.targetType = targetType;
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        admin: {
          select: { username: true },
        },
      },
    });

    const headers = [
      '操作时间',
      '操作人',
      '操作类型',
      '目标类型',
      '目标ID',
      '详细信息',
    ];

    const rows = logs.map((log) => {
      const actionLabel = ACTION_MAP[log.action] || log.action;
      const targetLabel = TARGET_TYPE_MAP[log.targetType] || log.targetType;

      return [
        formatDate(log.createdAt),
        log.admin?.username || '系统',
        actionLabel,
        targetLabel,
        log.targetId,
        log.details || '-',
      ];
    });

    const csvContent =
      '﻿' +
      [
        headers.map(escapeCsv).join(','),
        ...rows.map((r) => r.map(escapeCsv).join(',')),
      ].join('\r\n');

    const fileName = `audit_logs_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting audit logs:', error);
    return NextResponse.json(
      { error: '导出审计日志失败' },
      { status: 500 }
    );
  }
}
