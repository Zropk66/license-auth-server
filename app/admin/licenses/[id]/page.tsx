'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/admin-layout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Key, Copy, User, Calendar, Server, Pencil, Loader2, Smartphone, Plus, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { MaskedText } from '@/components/ui/masked-text';
import { useToast } from '@/hooks/use-toast';
import EditLicenseDialog from '@/components/admin/edit-license-dialog';

interface LicenseDetails {
  id: string;
  licenseKey: string;
  userId: string;
  username: string;
  softwareName: string;
  expirationDate: string;
  hardwareBindingEnabled: boolean;
  allowSelfUnbind?: boolean;
  lastUnboundAt?: string | null;
  monthlyUnbindCount?: number;
  unbindCountMonth?: string | null;
  extraUnbindCount?: number;
  hwid: string | null;
  deviceName?: string | null;
  status: string;
  licenseType: string;
  duration?: number | null;
  activatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginIp?: string | null;
  lastLoginAt?: string | null;
  sessions?: {
    id: string;
    ipAddress: string | null;
    hwid: string | null;
    lastHeartbeat: string;
    status: string;
    terminatedAt?: string | null;
    createdAt: string;
  }[];
  hardwareHistories?: {
    id: string;
    hwid: string;
    firstBoundAt: string;
    lastSeenAt: string;
  }[];
}

export default function LicenseDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [license, setLicense] = useState<LicenseDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isSuspending, setIsSuspending] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [kickingSessionId, setKickingSessionId] = useState<string | null>(null);
  const [globalUnbindConfig, setGlobalUnbindConfig] = useState<{
    enabled: boolean;
    maxPerMonth: number;
    cooldownHours: number;
    deductHours: number;
  }>({ enabled: false, maxPerMonth: 1, cooldownHours: 24, deductHours: 0 });
  const [isHardwareHistoryOpen, setIsHardwareHistoryOpen] = useState(false);
  const [isSessionsOpen, setIsSessionsOpen] = useState(false);
  const [isAddCountDialogOpen, setIsAddCountDialogOpen] = useState(false);
  const [countToAdd, setCountToAdd] = useState('1');
  const [isUpdatingCount, setIsUpdatingCount] = useState(false);

  useEffect(() => {
    fetchLicenseDetails(true);
    fetchGlobalSettings();
    const timer = setInterval(() => {
      fetchLicenseDetails(false);
    }, 5000);

    return () => clearInterval(timer);
  }, [params.id]);

  const fetchGlobalSettings = async () => {
    try {
      const res = await fetch('/api/settings/public');
      if (res.ok) {
        const data = await res.json();
        setGlobalUnbindConfig({
          enabled: !!data.unbindEnabled,
          maxPerMonth: data.unbindMaxPerMonth || 2,
          cooldownHours: data.unbindCooldownHours || 24,
          deductHours: data.unbindDeductHours || 0,
        });
      }
    } catch {}
  };

  const fetchLicenseDetails = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(`/api/admin/licenses/${params.id}`);

      if (!response.ok) {
        throw new Error('获取授权详情失败');
      }

      const data = await response.json();
      setLicense(data);
    } catch (err) {
      console.error('Error fetching license details:', err);
      setError('加载授权详情失败。请稍后再试。');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const copyToClipboard = (text: string, itemName: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: '已复制到剪贴板',
      description: `${itemName} 已复制到剪贴板`,
    });
  };

  const getSessionStatus = (lastHeartbeatStr: string, dbStatus: string) => {
    if (dbStatus !== 'active') {
      return {
        label: '已下线',
        badgeClass: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200'
      };
    }
    try {
      const now = new Date().getTime();
      const last = new Date(lastHeartbeatStr).getTime();
      const diffSeconds = Math.max(0, Math.floor((now - last) / 1000));

      if (diffSeconds <= 45) {
        return {
          label: '活跃',
          badgeClass: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-200'
        };
      } else if (diffSeconds <= 90) {
        return {
          label: '延迟',
          badgeClass: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200'
        };
      } else if (diffSeconds <= 300) {
        return {
          label: '警告',
          badgeClass: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200'
        };
      } else {
        return {
          label: '离线',
          badgeClass: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200'
        };
      }
    } catch (e) {
      return {
        label: '未知',
        badgeClass: 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-200'
      };
    }
  };

  const formatOnlineDuration = (startStr: string, endStr: string | null | undefined, lastHbStr: string, isActive: boolean) => {
    try {
      const start = new Date(startStr).getTime();
      const end = endStr ? new Date(endStr).getTime() : (isActive ? new Date().getTime() : new Date(lastHbStr).getTime());
      const diffMs = Math.max(0, end - start);

      const totalMinutes = Math.round(diffMs / (1000 * 60));
      return `${totalMinutes}分钟`;
    } catch (e) {
      return '-';
    }
  };

  const formatDuration = (minutes?: number | null) => {
    if (minutes === undefined || minutes === null) return '-';
    return `${minutes}分钟`;
  };

  const formatLicenseDuration = (minutes?: number | null) => {
    if (minutes === undefined || minutes === null) return '-';
    if (minutes === 0) return '0分钟';
    if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}天`;
    if (minutes % 60 === 0) return `${minutes / 60}小时`;
    return `${minutes}分钟`;
  };

  const isExpired = (date: string) => {
    return new Date(date) < new Date();
  };

  const getLicenseDurationStats = () => {
    if (!license) return null;
    const now = new Date();
    const created = new Date(license.createdAt);
    const expiry = new Date(license.expirationDate);

    let totalMins = 0;
    let usedMins = 0;

    // 计算总时长
    if (license.licenseType === 'duration') {
      if (license.activatedAt) {
        const actualMs = expiry.getTime() - new Date(license.activatedAt).getTime();
        totalMins = Math.max(0, Math.round(actualMs / (1000 * 60)));
      } else {
        totalMins = license.duration || 0;
      }
    } else {
      const totalMs = expiry.getTime() - created.getTime();
      totalMins = Math.max(0, Math.round(totalMs / (1000 * 60)));
    }

    // 通过累加所有在线会话的历史时长来计算真实的已使用时长
    if (license.sessions && license.sessions.length > 0) {
      let totalUsedMs = 0;
      license.sessions.forEach(session => {
        const sessionStart = new Date(session.createdAt).getTime();

        // 判定会话是否活跃（和列表中一致的动态判断）
        const lastHb = new Date(session.lastHeartbeat).getTime();
        const diffSeconds = Math.max(0, Math.floor((now.getTime() - lastHb) / 1000));
        const isSessionActive = session.status === 'active' && diffSeconds <= 300;

        const sessionEnd = session.terminatedAt
          ? new Date(session.terminatedAt).getTime()
          : (isSessionActive ? now.getTime() : lastHb);

        totalUsedMs += Math.max(0, sessionEnd - sessionStart);
      });
      usedMins = Math.round(totalUsedMs / (1000 * 60));
    }

    // 若计算出的已用时间超出总时间（由于取整误差），进行约束
    if (license.licenseType === 'duration') {
      usedMins = Math.min(totalMins, usedMins);
    }

    return {
      usedStr: formatDuration(usedMins),
      totalStr: formatDuration(totalMins),
      percent: totalMins > 0 ? Math.min(100, Math.round((usedMins / totalMins) * 100)) : 0
    };
  };

  const revokeLicense = async () => {
    if (!license) return;

    setIsRevoking(true);
    try {
      const response = await fetch(`/api/admin/licenses/${license.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          revoke: true,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '撤销授权失败');
      }

      toast({
        title: '授权已撤销',
        description: '该授权已成功撤销',
      });

      // Update the license in state
      setLicense(result);
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '撤销授权失败',
        variant: 'destructive',
      });
    } finally {
      setIsRevoking(false);
    }
  };

  const toggleSuspend = async () => {
    if (!license) return;

    setIsSuspending(true);
    const newStatus = license.status === 'suspended' ? 'active' : 'suspended';
    try {
      const response = await fetch(`/api/admin/licenses/${license.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: newStatus,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '操作失败');
      }

      toast({
        title: newStatus === 'suspended' ? '授权已暂停' : '授权已恢复',
        description: newStatus === 'suspended' ? '该授权已成功暂停使用' : '该授权已恢复正常使用',
      });

      setLicense(result);
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '操作失败',
        variant: 'destructive',
      });
    } finally {
      setIsSuspending(false);
    }
  };

  const handleActivateLicense = async () => {
    if (!license) return;

    setIsActivating(true);
    try {
      const response = await fetch(`/api/admin/licenses/${license.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'active',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '激活授权失败');
      }

      toast({
        title: '授权已激活',
        description: '该卡密已成功手动激活，开始计算有效时长。',
      });

      setLicense(result);
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '激活授权失败',
        variant: 'destructive',
      });
    } finally {
      setIsActivating(false);
    }
  };

  const handleAddUnbindCount = async () => {
    if (!license) return;
    const count = parseInt(countToAdd, 10);
    if (isNaN(count) || count <= 0) {
      toast({ title: '错误', description: '请输入有效的增加次数', variant: 'destructive' });
      return;
    }

    setIsUpdatingCount(true);
    try {
      const response = await fetch(`/api/admin/licenses/${license.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addUnbindCount: count }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || '添加换绑额度失败');
      }

      toast({
        title: '额度已更新',
        description: `已为该卡密额外增加 ${count} 次解绑额度`,
      });

      setLicense(result);
      setIsAddCountDialogOpen(false);
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '操作失败',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingCount(false);
    }
  };

  const handleResetExtraUnbindCount = async () => {
    if (!license) return;
    if (!confirm(`确定要清空该卡密当前持有的 +${license.extraUnbindCount || 0} 次额外赠送额度吗？`)) {
      return;
    }

    setIsUpdatingCount(true);
    try {
      const response = await fetch(`/api/admin/licenses/${license.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetExtraUnbind: true }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || '清空额外额度失败');
      }

      toast({
        title: '已清空',
        description: '该卡密的额外换绑额度已成功清空',
      });

      setLicense(result);
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '操作失败',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingCount(false);
    }
  };

  const handleLicenseUpdated = (updatedLicense: LicenseDetails) => {
    setLicense(updatedLicense);
  };

  const kickSession = async (sessionId: string) => {
    setKickingSessionId(sessionId);
    try {
      const response = await fetch(`/api/admin/sessions/${sessionId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('踢出失败');
      toast({ title: '已踢出', description: '该 session 已强制下线' });
      setLicense(prev => prev ? {
        ...prev,
        sessions: prev.sessions?.map(s =>
          s.id === sessionId ? { ...s, status: 'terminated' } : s
        ),
      } : prev);
    } catch {
      toast({ title: '错误', description: '踢出 session 失败', variant: 'destructive' });
    } finally {
      setKickingSessionId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.back()}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回授权列表
        </Button>

        <h1 className="text-3xl font-bold">授权详情</h1>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-4 w-1/4" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-2/3" />
            </CardContent>
          </Card>
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <Key className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">加载授权出错</p>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button onClick={() => router.back()}>返回授权列表</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl flex items-center">
                    <Key className="h-6 w-6 mr-2 text-muted-foreground" />
                    {license?.softwareName || '授权详情'}
                  </CardTitle>
                  <CardDescription>
                    授权 ID: {params.id}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {license?.status === "revoked" ? (
                    <Badge variant="destructive">撤销</Badge>
                  ) : license?.status === "suspended" ? (
                    <Badge variant="secondary">冻结</Badge>
                  ) : license?.status === "unactivated" ? (
                    <Badge variant="outline" className="text-yellow-600 border-yellow-600">待激活</Badge>
                  ) : license?.expirationDate && isExpired(license.expirationDate) ? (
                    <Badge variant="destructive">到期</Badge>
                  ) : (
                    <Badge variant="default">有效</Badge>
                  )}
                  <Badge
                    variant={license?.hardwareBindingEnabled ? (license.hwid ? "default" : "secondary") : "outline"}
                  >
                    {license?.hardwareBindingEnabled
                      ? (license.hwid ? "已绑定 HWID" : "待绑定 HWID")
                      : "未绑定 HWID"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">授权密钥</h3>
                <div className="flex items-center">
                  <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                    <MaskedText value={license?.licenseKey || '无'} head={6} tail={4} />
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-2 h-8 w-8"
                    onClick={() => license?.licenseKey && copyToClipboard(license.licenseKey, '授权密钥')}
                  >
                    <Copy className="h-4 w-4" />
                    <span className="sr-only">复制授权密钥</span>
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 左栏：基础信息 */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">软件名称</h3>
                    <p>{license?.softwareName || '无'}</p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">用户</h3>
                    <div className="flex items-center">
                      <User className="h-4 w-4 mr-1 text-muted-foreground" />
                      <a
                        href={`/admin/users/${license?.userId}`}
                        className="text-primary hover:underline"
                      >
                        {license?.username || '无'}
                      </a>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">密钥类型</h3>
                    <p>
                      {license?.licenseType === 'duration' ? (
                        <span className="text-yellow-600 font-medium">
                          激活卡 ({formatLicenseDuration(license.duration)})
                        </span>
                      ) : (
                        '即时卡'
                      )}
                    </p>
                  </div>

                  {license && (() => {
                    const stats = getLicenseDurationStats();
                    if (!stats) return null;
                    return (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">使用时长</h3>
                        <p>{stats.usedStr}</p>
                      </div>
                    );
                  })()}
                </div>

                {/* 右栏：时间信息 */}
                <div className="space-y-4 md:border-l md:pl-6 border-border">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1" />
                        创建时间
                      </div>
                    </h3>
                    <p>{license?.createdAt ? formatDate(license.createdAt) : '无'}</p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1" />
                        激活时间
                      </div>
                    </h3>
                    <p>
                      {license?.licenseType === 'duration' ? (
                        license.activatedAt ? (
                          formatDate(license.activatedAt)
                        ) : (
                          '-'
                        )
                      ) : (
                        license?.createdAt ? formatDate(license.createdAt) : '-'
                      )}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1" />
                        到期时间
                      </div>
                    </h3>
                    <p>
                      {(!license?.activatedAt && license?.licenseType === 'duration') ? (
                        '-'
                      ) : license?.status === 'revoked' ? (
                        <span className="text-muted-foreground line-through">
                          {formatDate(license.expirationDate)} (撤销)
                        </span>
                      ) : license?.status === 'suspended' ? (
                        <span className="text-yellow-600 font-medium">
                          {formatDate(license.expirationDate)} (冻结)
                        </span>
                      ) : license?.expirationDate && isExpired(license.expirationDate) ? (
                        <span className="text-destructive font-medium">
                          {formatDate(license.expirationDate)} (到期)
                        </span>
                      ) : license?.expirationDate ? (
                        <span className="text-green-600 font-medium">
                          {formatDate(license.expirationDate)} (有效)
                        </span>
                      ) : (
                        '-'
                      )}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">
                      <div className="flex items-center">
                        <Server className="h-4 w-4 mr-1" />
                        最后授权 IP
                      </div>
                    </h3>
                    <p>
                      {license?.lastLoginIp ? (
                        <span className="font-mono text-sm">{license.lastLoginIp}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                      {license?.lastLoginAt && (
                        <span className="text-xs text-muted-foreground ml-2">
                          ({formatDate(license.lastLoginAt)})
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    <div className="flex items-center">
                      <Server className="h-4 w-4 mr-1" />
                      HWID 绑定
                    </div>
                  </h3>

                  {license?.hardwareBindingEnabled ? (
                    <div>
                      {license.hwid ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center">
                            <code className="bg-muted px-2 py-1 rounded text-sm font-mono break-all">
                              <MaskedText value={license.hwid} head={6} tail={4} />
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="ml-2 h-8 w-8"
                              onClick={() => copyToClipboard(license.hwid!, 'HWID')}
                            >
                              <Copy className="h-4 w-4" />
                              <span className="sr-only">复制HWID</span>
                            </Button>
                          </div>
                          {license.deviceName && (
                            <p className="text-xs text-muted-foreground">设备名：{license.deviceName}</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-yellow-600">已启用HWID 绑定，客户端首次登录时自动绑定设备。</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">未启用HWID 绑定。</p>
                  )}
                </div>

                {/* 用户自助换绑策略与次数管理 */}
                {license?.hardwareBindingEnabled && (
                  <div className="p-3 border rounded-lg bg-muted/20 space-y-2.5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-primary" />
                        <span className="text-xs font-semibold">用户自助换绑策略与额度</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {globalUnbindConfig.enabled ? (
                          <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 border-green-200">
                            全局换绑已开启
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
                            全局换绑已关闭
                          </Badge>
                        )}
                        {license.allowSelfUnbind !== false ? (
                          <Badge variant="default" className="text-xs">此卡允许换绑</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs text-destructive">此卡禁止换绑</Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      <div className="p-2 border rounded bg-background">
                        <div className="text-[11px] text-muted-foreground">当月已换绑</div>
                        <div className="text-sm font-semibold mt-0.5">{license.monthlyUnbindCount || 0} 次</div>
                      </div>
                      <div className="p-2 border rounded bg-background">
                        <div className="text-[11px] text-muted-foreground">额外赠送额度</div>
                        <div className="text-sm font-semibold mt-0.5 text-primary">+{license.extraUnbindCount || 0} 次</div>
                      </div>
                      <div className="p-2 border rounded bg-background">
                        <div className="text-[11px] text-muted-foreground">当月最大上限</div>
                        <div className="text-sm font-semibold mt-0.5">
                          {(globalUnbindConfig.maxPerMonth || 2) + (license.extraUnbindCount || 0)} 次/月
                        </div>
                      </div>
                      <div className="p-2 border rounded bg-background">
                        <div className="text-[11px] text-muted-foreground">当月剩余可用</div>
                        <div className="text-sm font-semibold mt-0.5 text-green-600">
                          {Math.max(0, (globalUnbindConfig.maxPerMonth || 2) + (license.extraUnbindCount || 0) - (license.monthlyUnbindCount || 0))} 次
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 flex-wrap gap-2">
                      <div>
                        上次解绑时间: {license.lastUnboundAt ? formatDate(license.lastUnboundAt) : '从未解绑'}
                        {globalUnbindConfig.cooldownHours > 0 && ` (冷却: ${globalUnbindConfig.cooldownHours}h)`}
                        {globalUnbindConfig.deductHours > 0 && ` (扣费: ${globalUnbindConfig.deductHours}h)`}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {license.extraUnbindCount && license.extraUnbindCount > 0 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:bg-destructive/10"
                            onClick={handleResetExtraUnbindCount}
                            disabled={isUpdatingCount}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            清空额外额度
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setCountToAdd('1');
                            setIsAddCountDialogOpen(true);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          添加换绑次数
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-between flex-wrap gap-2">
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => router.back()}>
                  返回授权列表
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(true)}
                  disabled={license?.status === "revoked"}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  编辑授权
                </Button>
              </div>

              <div className="flex gap-2">
                {license?.status === "unactivated" && (
                  <Button
                    onClick={handleActivateLicense}
                    disabled={isActivating}
                    className="bg-green-600 hover:bg-green-700 text-white border-none"
                  >
                    {isActivating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        正在激活...
                      </>
                    ) : (
                      '激活授权'
                    )}
                  </Button>
                )}

                {license?.status !== "revoked" && license?.status !== "unactivated" && (
                  <Button
                    onClick={toggleSuspend}
                    disabled={isSuspending}
                    className={license?.status === "suspended"
                      ? "bg-green-600 hover:bg-green-700 text-white border-none"
                      : "bg-yellow-600 hover:bg-yellow-700 text-white border-none"
                    }
                  >
                    {isSuspending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        正在处理...
                      </>
                    ) : license?.status === "suspended" ? (
                      '恢复授权'
                    ) : (
                      '暂停授权'
                    )}
                  </Button>
                )}

                {license?.status !== "revoked" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">
                        撤销授权
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>撤销授权</AlertDialogTitle>
                        <AlertDialogDescription>
                          您确定要撤销此授权吗？这会使用户无法继续使用该授权。此操作无法撤销。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={revokeLicense}
                          disabled={isRevoking}
                        >
                          {isRevoking ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              正在撤销...
                            </>
                          ) : (
                            '撤销授权'
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </CardFooter>
          </Card>

          {/* HWID 绑定记录 */}
          <Card>
            <CardHeader
              className="flex flex-row items-center justify-between pb-2 cursor-pointer select-none"
              onClick={() => setIsHardwareHistoryOpen(!isHardwareHistoryOpen)}
            >
              <div>
                <CardTitle className="text-xl">HWID 绑定记录</CardTitle>
                <CardDescription>记录此卡密全生命周期绑定过的所有物理HWID指纹与活跃时间</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  共 {license?.hardwareHistories?.length || 0} 台设备
                </Badge>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  {isHardwareHistoryOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </CardHeader>
            {isHardwareHistoryOpen && (
              <CardContent>
                {(!license?.hardwareHistories || license.hardwareHistories.length === 0) ? (
                  <div className="py-6 text-center text-muted-foreground text-sm">
                    暂无任何HWID 绑定历史记录
                  </div>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                          <th className="px-4 py-2 font-medium">HWID</th>
                          <th className="px-4 py-2 font-medium">状态</th>
                          <th className="px-4 py-2 font-medium">首次绑定时间</th>
                          <th className="px-4 py-2 font-medium">最近活跃时间</th>
                          <th className="px-4 py-2 font-medium text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {license.hardwareHistories.map((hist) => {
                          const isCurrent = hist.hwid === license.hwid;
                          return (
                            <tr key={hist.id} className="hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-2 font-mono text-xs max-w-[240px] truncate">
                                <MaskedText value={hist.hwid} head={6} tail={4} />
                              </td>
                              <td className="px-4 py-2">
                                <Badge
                                  variant={isCurrent ? "default" : "secondary"}
                                  className={isCurrent ? "bg-green-600 text-white hover:bg-green-700" : ""}
                                >
                                  {isCurrent ? "当前绑定" : "历史设备"}
                                </Badge>
                              </td>
                              <td className="px-4 py-2 text-xs text-muted-foreground">
                                {formatDate(hist.firstBoundAt)}
                              </td>
                              <td className="px-4 py-2 text-xs text-muted-foreground">
                                {formatDate(hist.lastSeenAt)}
                              </td>
                              <td className="px-4 py-2 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(hist.hwid, 'HWID');
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5 mr-1" />
                                  复制 ID
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {license?.sessions && license.sessions.length > 0 && (
            <Card>
              <CardHeader
                className="flex flex-row items-center justify-between pb-2 cursor-pointer select-none"
                onClick={() => setIsSessionsOpen(!isSessionsOpen)}
              >
                <div>
                  <CardTitle className="text-xl">会话历史</CardTitle>
                  <CardDescription>当前与该授权关联的全部会话历史记录</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    共 {license.sessions.length} 条记录
                  </Badge>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    {isSessionsOpen ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              {isSessionsOpen && (
                <CardContent>
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-2 text-left font-medium">IP 地址</th>
                        <th className="px-4 py-2 text-left font-medium">HWID</th>
                        <th className="px-4 py-2 text-left font-medium">登录时间</th>
                        <th className="px-4 py-2 text-left font-medium">下线时间</th>
                        <th className="px-4 py-2 text-left font-medium">总在线时长</th>
                        <th className="px-4 py-2 text-left font-medium">最后心跳</th>
                        <th className="px-4 py-2 text-left font-medium">状态</th>
                        <th className="px-4 py-2 text-left font-medium w-[80px]">操作</th>
                      </tr>
                    </thead>
	                    <tbody>
	                      {license?.sessions?.map((session) => {
	                        const statusInfo = getSessionStatus(session.lastHeartbeat, session.status);
	                        const isSessionActive = statusInfo.label === '活跃' || statusInfo.label === '延迟' || statusInfo.label === '警告';
	                        return (
	                          <tr key={session.id} className="border-b last:border-0">
	                            <td className="px-4 py-2 font-mono text-xs">{session.ipAddress || '-'}</td>
	                            <td className="px-4 py-2 font-mono text-xs truncate max-w-[120px]">{session.hwid || '-'}</td>
	                            <td className="px-4 py-2 text-xs">{formatDate(session.createdAt)}</td>
	                            <td className="px-4 py-2 text-xs">{session.terminatedAt ? formatDate(session.terminatedAt) : (isSessionActive ? '-' : formatDate(session.lastHeartbeat))}</td>
	                            <td className="px-4 py-2 text-xs">{formatOnlineDuration(session.createdAt, session.terminatedAt, session.lastHeartbeat, isSessionActive)}</td>
		                            <td className="px-4 py-2 text-xs">{formatDate(session.lastHeartbeat)}</td>
	                            <td className="px-4 py-2">
	                              <Badge variant="outline" className={`${statusInfo.badgeClass} px-2 py-0.5 font-medium text-xs`}>
	                                {statusInfo.label}
	                              </Badge>
	                            </td>
	                            <td className="px-4 py-2">
	                              {isSessionActive && (
	                                <Button
	                                  variant="destructive"
	                                  size="sm"
	                                  className="h-7 text-xs"
	                                  disabled={kickingSessionId === session.id}
	                                  onClick={() => kickSession(session.id)}
	                                >
	                                  {kickingSessionId === session.id ? (
	                                    <Loader2 className="h-3 w-3 animate-spin" />
	                                  ) : (
	                                    '踢出'
	                                  )}
	                                </Button>
	                              )}
	                            </td>
	                          </tr>
	                        );
	                      })}
	                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}
            </Card>
          )}
        </div>
      )}

      {license && (
        <EditLicenseDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          license={license}
          onLicenseUpdated={handleLicenseUpdated}
        />
      )}

      {/* 手动添加换绑次数弹窗 */}
      <Dialog open={isAddCountDialogOpen} onOpenChange={setIsAddCountDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>手动添加换绑次数</DialogTitle>
            <DialogDescription>
              为该卡密增加额外的自助解绑额度（可用于客服补偿或特殊放宽）。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-3">
            <div className="grid gap-2">
              <Label>增加次数</Label>
              <Input
                type="number"
                min="1"
                max="100"
                value={countToAdd}
                onChange={(e) => setCountToAdd(e.target.value)}
                disabled={isUpdatingCount}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                当前已有额外额度: +{license?.extraUnbindCount || 0} 次，添加后将变为 +{(license?.extraUnbindCount || 0) + (parseInt(countToAdd, 10) || 0)} 次。
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddCountDialogOpen(false)}
              disabled={isUpdatingCount}
            >
              取消
            </Button>
            <Button onClick={handleAddUnbindCount} disabled={isUpdatingCount}>
              {isUpdatingCount ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在保存...
                </>
              ) : (
                '确认添加'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}