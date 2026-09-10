'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, RefreshCcw, ClipboardList, ShieldCheck, ShieldAlert, ChevronLeft, ChevronRight, ExternalLink, Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { MaskedText } from '@/components/ui/masked-text';

type AuditLog = {
  id: string;
  adminId: string | null;
  admin?: {
    username: string;
  } | null;
  action: string;
  targetType: string;
  targetId: string;
  details: string | null;
  createdAt: string;
};

type VerificationLog = {
  id: string;
  licenseKey: string | null;
  ipAddress: string;
  success: boolean;
  reason: string | null;
  createdAt: string;
};

const ACTION_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  create_license: { label: "创建授权", variant: "default" },
  edit_license: { label: "编辑授权", variant: "outline" },
  revoke_license: { label: "撤销授权", variant: "destructive" },
  suspend_license: { label: "冻结授权", variant: "secondary" },
  resume_license: { label: "恢复授权", variant: "outline" },
  resume_unactivated_license: { label: "激活授权", variant: "default" },
  delete_license: { label: "删除授权", variant: "destructive" },
  reset_hwid: { label: "重置HWID", variant: "secondary" },
  batch_revoke_license: { label: "批量撤销授权", variant: "destructive" },
  batch_suspend_license: { label: "批量冻结授权", variant: "secondary" },
  batch_resume_license: { label: "批量恢复授权", variant: "outline" },
  batch_active_license: { label: "批量恢复授权", variant: "outline" },
  batch_change_software: { label: "批量修改所属软件", variant: "outline" },
  batch_extend_duration: { label: "批量增加时长", variant: "default" },
  batch_reset_hwid: { label: "批量重置HWID", variant: "secondary" },
  batch_delete_license: { label: "批量删除授权", variant: "destructive" },
  batch_edit_license: { label: "批量编辑授权", variant: "outline" },
  create_user: { label: "创建用户", variant: "default" },
  edit_user: { label: "编辑用户", variant: "outline" },
  delete_user: { label: "删除用户", variant: "destructive" },
  reset_user_hash: { label: "重置用户特征码", variant: "secondary" },
  create_software: { label: "创建软件", variant: "default" },
  edit_software: { label: "编辑软件", variant: "outline" },
  delete_software: { label: "删除软件", variant: "destructive" },
  create_software_version: { label: "发布新版本", variant: "default" },
  edit_software_version: { label: "编辑版本", variant: "outline" },
  delete_software_version: { label: "删除版本", variant: "destructive" },
  create_announcement: { label: "发布公告", variant: "default" },
  edit_announcement: { label: "编辑公告", variant: "outline" },
  delete_announcement: { label: "删除公告", variant: "destructive" },
  create_notification_channel: { label: "添加通知渠道", variant: "default" },
  edit_notification_channel: { label: "编辑通知渠道", variant: "outline" },
  delete_notification_channel: { label: "删除通知渠道", variant: "destructive" },
  add_blacklist: { label: "添加黑名单", variant: "destructive" },
  edit_blacklist: { label: "编辑黑名单", variant: "outline" },
  delete_blacklist: { label: "移除黑名单", variant: "secondary" },
  kick_session: { label: "强制下线会话", variant: "destructive" },
  kick_all_sessions: { label: "清空全部会话", variant: "destructive" },
  update_settings: { label: "修改系统设置", variant: "outline" },
  cleanup_logs: { label: "清理系统日志", variant: "secondary" },
  create_manager: { label: "创建管理员", variant: "default" },
  edit_manager: { label: "编辑管理员", variant: "outline" },
  delete_manager: { label: "删除管理员", variant: "destructive" },
  owner_created: { label: "初始化系统所有者", variant: "default" },
  login_success: { label: "管理员登录成功", variant: "default" },
  login_failed: { label: "管理员登录失败", variant: "destructive" },
  admin_logout: { label: "管理员登出", variant: "outline" },
  user_login_success: { label: "用户登录成功", variant: "default" },
  user_login_failed: { label: "用户登录失败", variant: "destructive" },
  user_logout: { label: "用户登出", variant: "outline" },
};

const TARGET_TYPE_MAP: Record<string, string> = {
  license: "授权卡密",
  user: "用户",
  session: "在线会话",
  software: "所属软件",
  software_version: "软件版本",
  announcement: "系统公告",
  notification_channel: "通知渠道",
  blacklist: "黑名单",
  admin: "管理员",
  setting: "系统设置",
  system: "系统维护",
};

const DETAIL_KEY_MAP: Record<string, string> = {
  softwareName: "所属软件",
  licenseKey: "卡密",
  username: "用户名",
  role: "角色",
  changes: "变更项目",
  ip: "IP 地址",
  reason: "原因",
  version: "版本号",
  title: "标题",
  channelType: "渠道类型",
  count: "数量",
  duration: "时长",
  durationValue: "增加时长",
  durationUnit: "时长单位",
  days: "天数",
  ids: "目标ID列表",
  resethwid: "重置HWID",
  hardwareBindingEnabled: "HWID绑定",
  allowSelfUnbind: "自助换绑",
  expirationDate: "到期时间",
  action: "操作动作",
  userHash: "用户特征码",
  targetType: "目标类型",
  type: "封禁类型",
  value: "封禁目标",
  targetSoftware: "目标软件",
  deletedCount: "清理条数",
  retentionDays: "保留天数",
  addUnbindCount: "添加换绑额度",
  resetExtraUnbind: "清空额外额度",
};

const DETAIL_VAL_MAP: Record<string, string> = {
  wrong_password: "密码错误",
  user_not_found: "用户不存在",
  ip_blacklisted: "IP 在黑名单中",
  hwid_blacklisted: "HWID 在黑名单中",
  anti_replay_failed: "防重放校验失败",
  days: "天",
  hours: "小时",
  minutes: "分钟",
  weeks: "周",
  true: "是",
  false: "否",
  owner: "系统所有者",
  admin: "管理员",
  ip: "IP 地址",
  hwid: "HWID",
};

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

export default function AuditLogsTable() {
  const { toast } = useToast();
  const router = useRouter();

  // 跳转授权详情：按 licenseKey 查询 license id 后跳转
  const [navigatingKeyId, setNavigatingKeyId] = useState<string | null>(null);
  const handleNavigateToLicense = useCallback(async (logId: string, licenseKey: string) => {
    setNavigatingKeyId(logId);
    try {
      const res = await fetch(`/api/admin/licenses?key=${encodeURIComponent(licenseKey)}`);
      if (!res.ok) {
        if (res.status === 404) {
          toast({
            title: '未找到授权',
            description: '该卡密可能已被删除',
            variant: 'destructive',
          });
          return;
        }
        throw new Error('查询授权失败');
      }
      const license = (await res.json()) as { id: string };
      router.push(`/admin/licenses/${license.id}`);
    } catch (err: any) {
      toast({
        title: '跳转失败',
        description: err.message || '查询授权时出错',
        variant: 'destructive',
      });
    } finally {
      setNavigatingKeyId(null);
    }
  }, [router, toast]);

  // ── 选项卡状态 ──
  const [activeTab, setActiveTab] = useState<'verification' | 'audit'>('verification');

  // ── 授权验证记录状态 ──
  const [vLogs, setVLogs] = useState<VerificationLog[]>([]);
  const [vLoading, setVLoading] = useState(true);
  const [vSearch, setVSearch] = useState('');
  const [vStatus, setVStatus] = useState<'all' | 'success' | 'failed'>('all');
  const [vPage, setVPage] = useState(1);
  const [vTotal, setVTotal] = useState(0);
  const pageSize = 20;

  // ── 管理员操作日志状态 ──
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditSearch, setAuditSearch] = useState('');

  // 获取授权验证记录
  const fetchVerificationLogs = useCallback(async () => {
    setVLoading(true);
    try {
      const params = new URLSearchParams({
        page: vPage.toString(),
        pageSize: pageSize.toString(),
      });
      if (vSearch.trim()) params.set('search', vSearch.trim());
      if (vStatus !== 'all') params.set('status', vStatus);

      const res = await fetch(`/api/admin/verification-logs?${params.toString()}`);
      const result = await res.json();
      if (res.ok) {
        setVLogs(result.data || []);
        setVTotal(result.total || 0);
      } else {
        throw new Error(result.error || '获取授权日志失败');
      }
    } catch (error) {
      console.error('Error fetching verification logs:', error);
      toast({
        title: '错误',
        description: '获取授权日志失败',
        variant: 'destructive',
      });
    } finally {
      setVLoading(false);
    }
  }, [vPage, vSearch, vStatus, toast]);

  // 获取操作审计日志
  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const response = await fetch('/api/admin/audit-logs');
      const data = await response.json();
      if (response.ok) {
        setAuditLogs(Array.isArray(data) ? data : data.data || []);
      } else {
        throw new Error(data.error || '获取操作日志失败');
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast({
        title: '错误',
        description: '获取操作日志失败',
        variant: 'destructive',
      });
    } finally {
      setAuditLoading(false);
    }
  }, [toast]);

  const exportAuditLogsToCSV = () => {
    window.open('/api/admin/audit-logs/export', '_blank');
  };

  useEffect(() => {
    if (activeTab === 'verification') {
      fetchVerificationLogs();
    } else {
      fetchAuditLogs();
    }
  }, [activeTab, fetchVerificationLogs, fetchAuditLogs]);

  // 格式化验证原因
  const formatReason = (reason: string | null) => {
    if (!reason) return '-';
    const bracketIndex = reason.indexOf(' [');
    if (bracketIndex !== -1) {
      const code = reason.slice(0, bracketIndex);
      const extra = reason.slice(bracketIndex + 1);
      const label = REASON_MAP[code] || code;
      return `${label} ${extra}`;
    }
    return REASON_MAP[reason] || reason;
  };

  // 过滤操作审计日志
  const filteredAuditLogs = auditLogs.filter((log) => {
    const adminName = log.admin?.username || '系统';
    const actionLabel = ACTION_MAP[log.action]?.label || log.action;
    const targetTypeLabel = TARGET_TYPE_MAP[log.targetType] || log.targetType;
    return (
      adminName.toLowerCase().includes(auditSearch.toLowerCase()) ||
      actionLabel.toLowerCase().includes(auditSearch.toLowerCase()) ||
      targetTypeLabel.toLowerCase().includes(auditSearch.toLowerCase()) ||
      log.targetId.toLowerCase().includes(auditSearch.toLowerCase()) ||
      (log.details && log.details.toLowerCase().includes(auditSearch.toLowerCase()))
    );
  });

  const getActionBadge = (action: string) => {
    const info = ACTION_MAP[action] || { label: action, variant: 'outline' as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  const getTargetTypeLabel = (type: string) => {
    return TARGET_TYPE_MAP[type] || type;
  };

  const formatDetails = (detailsStr: string | null) => {
    if (!detailsStr) return '-';
    try {
      const obj = JSON.parse(detailsStr);
      return Object.entries(obj)
        .map(([k, v]) => {
          const keyLabel = DETAIL_KEY_MAP[k] || k;
          let valStr: string;
          if (Array.isArray(v)) {
            valStr = v.map((item) => DETAIL_KEY_MAP[String(item)] || DETAIL_VAL_MAP[String(item)] || String(item)).join(', ');
          } else {
            valStr = DETAIL_VAL_MAP[String(v)] || String(v);
          }
          return `${keyLabel}: ${valStr}`;
        })
        .join(' | ');
    } catch {
      return detailsStr;
    }
  };

  const totalPages = Math.max(1, Math.ceil(vTotal / pageSize));

  return (
    <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'verification' | 'audit')}>
      <TabsList className="grid w-full max-w-[400px] grid-cols-2 mb-6">
        <TabsTrigger value="verification" className="gap-2">
          <ShieldCheck className="h-4 w-4" />
          授权验证记录
        </TabsTrigger>
        <TabsTrigger value="audit" className="gap-2">
          <ClipboardList className="h-4 w-4" />
          操作审计日志
        </TabsTrigger>
      </TabsList>

      {/* ── 授权验证记录 ── */}
      <TabsContent value="verification">
        <Card>
          <CardHeader className="flex flex-col space-y-2 md:flex-row md:items-center md:justify-between md:space-y-0">
            <div>
              <CardTitle className="text-xl">客户端授权验证记录</CardTitle>
              <CardDescription>
                记录客户端每次发起软件授权验证的请求状态与拦截原因（心跳请求已自动忽略）
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchVerificationLogs()}
              disabled={vLoading}
            >
              {vLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              <span className="sr-only">刷新</span>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-3 pb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="搜索卡密、客户端 IP 或失败原因..."
                  className="pl-8"
                  value={vSearch}
                  onChange={(e) => {
                    setVSearch(e.target.value);
                    setVPage(1);
                  }}
                />
              </div>

              <div className="w-full md:w-[180px]">
                <Select
                  value={vStatus}
                  onValueChange={(val: 'all' | 'success' | 'failed') => {
                    setVStatus(val);
                    setVPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="筛选状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="success">仅成功</SelectItem>
                    <SelectItem value="failed">仅拦截 / 失败</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[170px]">请求时间</TableHead>
                    <TableHead>授权卡密</TableHead>
                    <TableHead className="w-[140px]">客户端 IP</TableHead>
                    <TableHead className="w-[110px]">验证状态</TableHead>
                    <TableHead>结果 / 详情</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center h-28">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                        <p className="text-sm text-muted-foreground mt-2">正在加载授权验证记录...</p>
                      </TableCell>
                    </TableRow>
                  ) : vLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center h-28">
                        <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground" />
                        <p className="text-muted-foreground mt-2">暂无授权验证记录</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    vLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs">{formatDate(log.createdAt)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.licenseKey ? (
                            <div className="flex items-center gap-1">
                              <span className="bg-muted/70 px-1.5 py-0.5 rounded inline-block">
                                <MaskedText value={log.licenseKey} head={6} tail={4} />
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0"
                                onClick={() => handleNavigateToLicense(log.id, log.licenseKey!)}
                                disabled={navigatingKeyId === log.id}
                                title="跳转至该授权详情页"
                              >
                                {navigatingKeyId === log.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <ExternalLink className="h-3 w-3" />
                                )}
                                <span className="sr-only">跳转授权详情</span>
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{log.ipAddress}</TableCell>
                        <TableCell>
                          {log.success ? (
                            <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                              验证成功
                            </Badge>
                          ) : (
                            <Badge variant="destructive">拦截拒绝</Badge>
                          )}
                        </TableCell>
                        <TableCell
                          className="text-xs text-muted-foreground max-w-[280px]"
                          title={log.reason ? `${formatReason(log.reason)}\n完整详细信息: ${log.reason}` : '验证通过'}
                        >
                          <span className="cursor-help hover:text-foreground transition-colors line-clamp-1">
                            {formatReason(log.reason)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* 分页控制栏 */}
            <div className="flex items-center justify-between pt-4">
              <p className="text-xs text-muted-foreground">
                共 {vTotal} 条记录，第 {vPage} / {totalPages} 页
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVPage((p) => Math.max(1, p - 1))}
                  disabled={vPage <= 1 || vLoading}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVPage((p) => Math.min(totalPages, p + 1))}
                  disabled={vPage >= totalPages || vLoading}
                >
                  下一页
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── 管理员操作日志 ── */}
      <TabsContent value="audit">
        <Card>
          <CardHeader className="flex flex-col space-y-2 md:flex-row md:items-center md:justify-between md:space-y-0">
            <div>
              <CardTitle className="text-xl">管理员操作审计记录</CardTitle>
              <CardDescription>审计系统管理员执行的操作变更</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportAuditLogsToCSV}
                disabled={auditLoading}
              >
                <Download className="h-4 w-4 mr-2" />
                导出 CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAuditLogs}
                disabled={auditLoading}
              >
                {auditLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                <span className="sr-only">刷新</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center pb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="搜索管理员、动作名称、目标 ID 或详情内容..."
                  className="pl-8"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[170px]">操作时间</TableHead>
                    <TableHead className="w-[120px]">管理员</TableHead>
                    <TableHead className="w-[120px]">操作动作</TableHead>
                    <TableHead className="w-[100px]">目标类型</TableHead>
                    <TableHead className="w-[160px]">目标 ID</TableHead>
                    <TableHead>操作详情</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center h-24">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                        <p className="text-sm text-muted-foreground mt-2">正在加载操作日志...</p>
                      </TableCell>
                    </TableRow>
                  ) : filteredAuditLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center h-24">
                        <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground" />
                        <p className="text-muted-foreground mt-2">未找到操作日志</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAuditLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs">{formatDate(log.createdAt)}</TableCell>
                        <TableCell className="font-medium text-xs">{log.admin?.username || '系统'}</TableCell>
                        <TableCell>{getActionBadge(log.action)}</TableCell>
                        <TableCell className="text-xs">{getTargetTypeLabel(log.targetType)}</TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[160px]" title={log.targetId}>
                          {log.targetId}
                        </TableCell>
                        <TableCell
                          className="text-xs text-muted-foreground truncate max-w-[240px]"
                          title={log.details || ''}
                        >
                          {formatDetails(log.details)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
