'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
} from '@/components/ui/alert-dialog';
import {
  Key,
  Copy,
  User,
  Calendar,
  Server,
  Pencil,
  Loader2,
  Smartphone,
  Plus,
  Trash2,
  ShieldAlert,
  Play,
  Pause,
  RotateCcw,
  Activity,
  History,
  Info,
  Clock,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { MaskedText } from '@/components/ui/masked-text';
import { useToast } from '@/hooks/use-toast';
import EditLicenseDialog from '@/components/admin/edit-license-dialog';

export interface LicenseDetails {
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

interface LicenseDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  licenseId: string | null;
  onUpdated?: () => void;
}

export default function LicenseDetailsDialog({
  open,
  onOpenChange,
  licenseId,
  onUpdated,
}: LicenseDetailsDialogProps) {
  const { toast } = useToast();
  const [license, setLicense] = useState<LicenseDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('info');

  const [isRevoking, setIsRevoking] = useState(false);
  const [isSuspending, setIsSuspending] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [kickingSessionId, setKickingSessionId] = useState<string | null>(null);
  const [isAddCountDialogOpen, setIsAddCountDialogOpen] = useState(false);
  const [countToAdd, setCountToAdd] = useState('1');
  const [isUpdatingCount, setIsUpdatingCount] = useState(false);

  const [globalUnbindConfig, setGlobalUnbindConfig] = useState<{
    enabled: boolean;
    maxPerMonth: number;
    cooldownHours: number;
    deductHours: number;
  }>({ enabled: false, maxPerMonth: 1, cooldownHours: 24, deductHours: 0 });

  const isEditingRef = useRef(false);
  isEditingRef.current = isEditDialogOpen || isAddCountDialogOpen;

  const fetchLicenseDetails = async (showLoading = false) => {
    if (!licenseId) return;
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(`/api/admin/licenses/${licenseId}`);
      if (!response.ok) {
        throw new Error('获取授权详情失败');
      }
      const data = await response.json();
      setLicense((prev) => {
        if (!prev) return data;
        if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
        return data;
      });
      setError(null);
    } catch (err) {
      if (showLoading) {
        console.error('Error fetching license details:', err);
        setError('加载授权详情失败，请检查网络后重试。');
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchGlobalSettings = async () => {
    try {
      const res = await fetch('/api/settings/public');
      if (res.ok) {
        const data = await res.json();
        setGlobalUnbindConfig({
          enabled: !!data.unbindEnabled,
          maxPerMonth: data.unbindMaxPerMonth !== undefined ? data.unbindMaxPerMonth : 0,
          cooldownHours: data.unbindCooldownHours || 24,
          deductHours: data.unbindDeductHours || 0,
        });
      }
    } catch {}
  };

  useEffect(() => {
    if (open && licenseId) {
      setActiveTab('info');
      fetchLicenseDetails(true);
      fetchGlobalSettings();
    } else {
      setLicense(null);
      setError(null);
    }
  }, [open, licenseId]);

  useEffect(() => {
    if (!open || !licenseId) return;

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !isEditingRef.current) {
        fetchLicenseDetails(false);
      }
    }, 6000);

    return () => clearInterval(timer);
  }, [open, licenseId]);

  const copyToClipboard = (text: string, itemName: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: '已复制到剪贴板',
      description: `${itemName} 已复制`,
    });
  };

  const toggleSuspend = async () => {
    if (!license) return;
    setIsSuspending(true);
    const newStatus = license.status === 'suspended' ? 'active' : 'suspended';
    try {
      const response = await fetch(`/api/admin/licenses/${license.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '操作失败');

      toast({
        title: newStatus === 'suspended' ? '授权已暂停' : '授权已恢复',
        description: newStatus === 'suspended' ? '该授权已暂停使用' : '该授权已恢复正常使用',
      });
      setLicense(result);
      onUpdated?.();
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '激活授权失败');

      toast({
        title: '授权已激活',
        description: '该卡密已手动激活，开始计算有效时长。',
      });
      setLicense(result);
      onUpdated?.();
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

  const revokeLicense = async () => {
    if (!license) return;
    setIsRevoking(true);
    try {
      const response = await fetch(`/api/admin/licenses/${license.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revoke: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '撤销授权失败');

      toast({
        title: '授权已撤销',
        description: '该授权已被废弃撤销',
      });
      setLicense(result);
      onUpdated?.();
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

  const deleteLicense = async () => {
    if (!license) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/licenses/${license.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '删除失败');

      toast({
        title: '删除成功',
        description: data.message || '授权记录已永久删除',
      });
      onOpenChange(false);
      onUpdated?.();
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '删除授权失败',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetHwid = async () => {
    if (!license) return;
    try {
      const response = await fetch(`/api/admin/licenses/${license.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetHwid: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '重置 HWID 失败');

      toast({
        title: 'HWID 已重置',
        description: '已清空绑定的硬件特征码，下次客户端登录时将自动重新绑定',
      });
      setLicense(result);
      onUpdated?.();
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '重置 HWID 失败',
        variant: 'destructive',
      });
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
      if (!response.ok) throw new Error(result.error || '增加解绑额度失败');

      toast({
        title: '额度已更新',
        description: `已额外增加 ${count} 次解绑额度`,
      });
      setLicense(result);
      setIsAddCountDialogOpen(false);
      onUpdated?.();
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
    setIsUpdatingCount(true);
    try {
      const response = await fetch(`/api/admin/licenses/${license.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetExtraUnbind: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '清空额外额度失败');

      toast({
        title: '已清空',
        description: '额外解绑额度已清零',
      });
      setLicense(result);
      onUpdated?.();
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

  const kickSession = async (sessionId: string) => {
    setKickingSessionId(sessionId);
    try {
      const response = await fetch(`/api/admin/sessions/${sessionId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('踢出失败');
      toast({ title: '已踢出', description: '该客户端会话已强制下线' });
      setLicense((prev) =>
        prev
          ? {
              ...prev,
              sessions: prev.sessions?.map((s) =>
                s.id === sessionId ? { ...s, status: 'terminated' } : s
              ),
            }
          : prev
      );
      onUpdated?.();
    } catch {
      toast({ title: '错误', description: '踢出会话失败', variant: 'destructive' });
    } finally {
      setKickingSessionId(null);
    }
  };

  const getStatusBadge = () => {
    if (!license) return null;
    const isExp = new Date(license.expirationDate) < new Date();
    if (license.status === 'revoked') {
      return <Badge variant="destructive">已撤销</Badge>;
    }
    if (license.status === 'suspended') {
      return <Badge variant="outline" className="text-yellow-600 border-yellow-600 bg-yellow-500/10">已冻结</Badge>;
    }
    if (license.status === 'unactivated') {
      return <Badge variant="outline" className="text-blue-600 border-blue-600 bg-blue-500/10">待激活</Badge>;
    }
    if (isExp) {
      return <Badge variant="outline" className="text-rose-600 border-rose-600 bg-rose-500/10">已过期</Badge>;
    }
    return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">有效</Badge>;
  };

  const getSessionStatus = (lastHeartbeatStr: string, dbStatus: string) => {
    if (dbStatus !== 'active') {
      return { label: '已下线', badgeClass: 'bg-red-500/10 text-red-600 border-red-200' };
    }
    try {
      const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(lastHeartbeatStr).getTime()) / 1000));
      if (diffSeconds <= 45) {
        return { label: '活跃', badgeClass: 'bg-green-500/10 text-green-600 border-green-200' };
      } else if (diffSeconds <= 90) {
        return { label: '延迟', badgeClass: 'bg-yellow-500/10 text-yellow-600 border-yellow-200' };
      } else if (diffSeconds <= 300) {
        return { label: '警告', badgeClass: 'bg-orange-500/10 text-orange-600 border-orange-200' };
      }
      return { label: '离线', badgeClass: 'bg-red-500/10 text-red-600 border-red-200' };
    } catch {
      return { label: '未知', badgeClass: 'bg-muted text-muted-foreground' };
    }
  };

  const formatLicenseDuration = (minutes?: number | null) => {
    if (minutes === undefined || minutes === null) return '-';
    if (minutes === 0) return '0分钟';
    if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}天`;
    if (minutes % 60 === 0) return `${minutes / 60}小时`;
    return `${minutes}分钟`;
  };

  const isPermanent = license && new Date(license.expirationDate).getFullYear() >= 2099;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[760px] max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>授权详情</DialogTitle>
            <DialogDescription>查看与管理软件授权密钥详情</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
              <div className="grid grid-cols-2 gap-4 pt-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
          ) : error || !license ? (
            <div className="p-8 text-center space-y-3">
              <ShieldAlert className="h-10 w-10 text-destructive mx-auto" />
              <p className="text-sm text-destructive">{error || '未找到该授权信息'}</p>
              <Button size="sm" variant="outline" onClick={() => fetchLicenseDetails(true)}>
                重试加载
              </Button>
            </div>
          ) : (
            <>
              {/* 顶部 Header */}
              <div className="p-5 border-b bg-card">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Key className="h-4 w-4 text-primary shrink-0" />
                      <MaskedText
                        value={license.licenseKey}
                        className="text-base font-mono font-bold tracking-tight"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => copyToClipboard(license.licenseKey, '卡密')}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        <span className="sr-only">复制卡密</span>
                      </Button>
                      {getStatusBadge()}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{license.softwareName}</span>
                      <span>•</span>
                      <span>
                        {license.licenseType === 'duration'
                          ? `激活卡 (${formatLicenseDuration(license.duration)})`
                          : '即时固定卡'}
                      </span>
                    </div>
                  </div>

                  {/* 快捷操作栏 */}
                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1"
                      onClick={() => setIsEditDialogOpen(true)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      编辑
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1 text-orange-600 border-orange-200 hover:bg-orange-50 dark:border-orange-900/50 dark:hover:bg-orange-950/20"
                          disabled={!license.hwid}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          重置HWID
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>重置硬件特征码</AlertDialogTitle>
                          <AlertDialogDescription>
                            确定要清空该授权当前绑定的硬件特征码吗？重置后，下一个使用此卡密登录的客户端设备将自动完成新绑定。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction onClick={handleResetHwid}>确认重置</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    {license.status === 'unactivated' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-900/50 dark:hover:bg-emerald-950/20"
                        onClick={handleActivateLicense}
                        disabled={isActivating}
                      >
                        {isActivating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        立即激活
                      </Button>
                    ) : license.status !== 'revoked' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1 text-yellow-600 border-yellow-200 hover:bg-yellow-50 dark:border-yellow-900/50 dark:hover:bg-yellow-950/20"
                        onClick={toggleSuspend}
                        disabled={isSuspending}
                      >
                        {isSuspending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : license.status === 'suspended' ? (
                          <>
                            <Play className="h-3.5 w-3.5" />
                            恢复
                          </>
                        ) : (
                          <>
                            <Pause className="h-3.5 w-3.5" />
                            冻结
                          </>
                        )}
                      </Button>
                    ) : null}

                    {license.status !== 'revoked' ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs gap-1 text-destructive border-destructive/20 hover:bg-destructive/10"
                            disabled={isRevoking}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            撤销
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>撤销授权卡密</AlertDialogTitle>
                            <AlertDialogDescription>
                              撤销后该卡密将立即作废并失效，所有在线客户端将立即被终止会话。确定撤销吗？
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={revokeLicense}
                            >
                              确认撤销
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 text-xs gap-1"
                            disabled={isDeleting}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            永久删除
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>永久删除已撤销授权</AlertDialogTitle>
                            <AlertDialogDescription>
                              此操作不可恢复，将同时删除关联的所有会话与绑定历史。确定永久删除吗？
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={deleteLicense}
                            >
                              确认删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </div>

              {/* 中间多标签内容区域 */}
              <div className="flex-1 overflow-y-auto p-5">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="info" className="gap-1.5 text-xs">
                      <Info className="h-3.5 w-3.5" />
                      基本与时效
                    </TabsTrigger>
                    <TabsTrigger value="hardware" className="gap-1.5 text-xs">
                      <Smartphone className="h-3.5 w-3.5" />
                      硬件与解绑
                    </TabsTrigger>
                    <TabsTrigger value="sessions" className="gap-1.5 text-xs">
                      <Activity className="h-3.5 w-3.5" />
                      会话与历史
                      {license.sessions && license.sessions.filter((s) => s.status === 'active').length > 0 && (
                        <span className="ml-1 inline-flex items-center justify-center px-1.5 py-0.2 text-[10px] font-bold leading-none text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 rounded-full">
                          {license.sessions.filter((s) => s.status === 'active').length}
                        </span>
                      )}
                    </TabsTrigger>
                  </TabsList>

                  {/* ── 标签 1：基本与时效 ── */}
                  <TabsContent value="info" className="space-y-4 pt-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      <div className="p-3.5 rounded-lg border bg-muted/20 space-y-2.5">
                        <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-primary" />
                          所属用户资料
                        </div>
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">用户名</span>
                            <span className="font-medium text-foreground">{license.username}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">用户标识</span>
                            <span className="font-mono text-[11px] text-muted-foreground">{license.userId}</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-lg border bg-muted/20 space-y-2.5">
                        <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Server className="h-3.5 w-3.5 text-primary" />
                          最近登录活动
                        </div>
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">最后登录 IP</span>
                            <span className="font-mono text-[11px] text-foreground">
                              {license.lastLoginIp || '-'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">最后活跃时间</span>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {license.lastLoginAt ? formatDate(license.lastLoginAt) : '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-lg border bg-card space-y-3">
                      <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        授权时效与时间线
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div className="p-2.5 rounded border bg-muted/30">
                          <div className="text-muted-foreground text-[11px]">创建生成时间</div>
                          <div className="font-mono text-xs font-medium mt-1">
                            {formatDate(license.createdAt)}
                          </div>
                        </div>

                        <div className="p-2.5 rounded border bg-muted/30">
                          <div className="text-muted-foreground text-[11px]">首次激活时间</div>
                          <div className="font-mono text-xs font-medium mt-1">
                            {license.activatedAt ? formatDate(license.activatedAt) : '尚未激活'}
                          </div>
                        </div>

                        <div className="p-2.5 rounded border bg-muted/30">
                          <div className="text-muted-foreground text-[11px]">到期时间</div>
                          <div className="font-mono text-xs font-medium mt-1 text-foreground">
                            {isPermanent ? '永久有效 (2099+)' : formatDate(license.expirationDate)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  {/* ── 标签 2：硬件与解绑 ── */}
                  <TabsContent value="hardware" className="space-y-4 pt-1">
                    <div className="p-3.5 rounded-lg border bg-muted/20 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold flex items-center gap-1.5">
                          <Smartphone className="h-3.5 w-3.5 text-primary" />
                          当前绑定硬件设备
                        </span>
                        <Badge variant={license.hardwareBindingEnabled ? 'default' : 'secondary'}>
                          {license.hardwareBindingEnabled ? '设备绑定启用' : '未开启绑定'}
                        </Badge>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between bg-card p-2.5 rounded border">
                          <span className="text-muted-foreground">特征码 (HWID)</span>
                          <div className="flex items-center gap-1.5 font-mono">
                            {license.hwid ? (
                              <>
                                <MaskedText value={license.hwid} className="text-xs" />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={() => copyToClipboard(license.hwid!, 'HWID')}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </>
                            ) : (
                              <span className="text-muted-foreground">暂未绑定任何设备</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between bg-card p-2.5 rounded border">
                          <span className="text-muted-foreground">设备名称</span>
                          <span className="font-medium text-foreground">
                            {license.deviceName || '-'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-lg border bg-card space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold flex items-center gap-1.5">
                          <RotateCcw className="h-3.5 w-3.5 text-primary" />
                          自助解绑策略与额度
                        </span>
                        <Badge variant={license.allowSelfUnbind !== false && globalUnbindConfig.enabled ? 'outline' : 'secondary'}>
                          {license.allowSelfUnbind !== false && globalUnbindConfig.enabled ? '允许用户端换绑' : '禁止用户解绑'}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div className="p-2.5 rounded border bg-muted/20">
                          <div className="text-muted-foreground text-[11px]">本月已用解绑</div>
                          <div className="text-base font-bold mt-0.5">
                            {license.monthlyUnbindCount || 0}{' '}
                            <span className="text-xs font-normal text-muted-foreground">
                              / {globalUnbindConfig.maxPerMonth} 次
                            </span>
                          </div>
                        </div>

                        <div className="p-2.5 rounded border bg-muted/20">
                          <div className="text-muted-foreground text-[11px]">额外赠送额度</div>
                          <div className="text-base font-bold mt-0.5 text-emerald-600">
                            +{license.extraUnbindCount || 0}{' '}
                            <span className="text-xs font-normal text-muted-foreground">次</span>
                          </div>
                        </div>

                        <div className="p-2.5 rounded border bg-muted/20">
                          <div className="text-muted-foreground text-[11px]">换绑冷却 / 扣时</div>
                          <div className="text-xs font-medium mt-1">
                            {globalUnbindConfig.cooldownHours}h 冷却 / 扣 {globalUnbindConfig.deductHours}h
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1 border-t">
                        {(license.extraUnbindCount || 0) > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground hover:text-destructive"
                            onClick={handleResetExtraUnbindCount}
                            disabled={isUpdatingCount}
                          >
                            清空赠送额度
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => {
                            setCountToAdd('1');
                            setIsAddCountDialogOpen(true);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                          赠送解绑次数
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  {/* ── 标签 3：会话与历史 ── */}
                  <TabsContent value="sessions" className="space-y-4 pt-1">
                    {/* 在线会话列表 */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="flex items-center gap-1.5">
                          <Activity className="h-3.5 w-3.5 text-primary" />
                          客户端会话记录 ({license.sessions?.length || 0})
                        </span>
                      </div>

                      {!license.sessions || license.sessions.length === 0 ? (
                        <div className="p-6 text-center text-xs text-muted-foreground border rounded-lg bg-muted/10">
                          暂无客户端在线会话记录
                        </div>
                      ) : (
                        <div className="border rounded-lg overflow-hidden divide-y text-xs">
                          {license.sessions.map((session) => {
                            const statusObj = getSessionStatus(session.lastHeartbeat, session.status);
                            const isKicking = kickingSessionId === session.id;

                            return (
                              <div
                                key={session.id}
                                className="p-2.5 flex items-center justify-between gap-2 bg-card hover:bg-muted/30 transition-colors"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-medium text-foreground">
                                      {session.ipAddress || '未知IP'}
                                    </span>
                                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusObj.badgeClass}`}>
                                      {statusObj.label}
                                    </Badge>
                                  </div>
                                  <div className="text-[10px] text-muted-foreground font-mono">
                                    心跳: {formatDate(session.lastHeartbeat)}
                                  </div>
                                </div>

                                {session.status === 'active' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs text-destructive border-destructive/20 hover:bg-destructive/10"
                                    onClick={() => kickSession(session.id)}
                                    disabled={isKicking}
                                  >
                                    {isKicking && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                                    踢下线
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* 硬件绑定历史变更记录 */}
                    <div className="space-y-2 pt-2 border-t">
                      <div className="text-xs font-semibold flex items-center gap-1.5">
                        <History className="h-3.5 w-3.5 text-primary" />
                        硬件绑定记录 ({license.hardwareHistories?.length || 0})
                      </div>

                      {!license.hardwareHistories || license.hardwareHistories.length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground border rounded-lg bg-muted/10">
                          暂无硬件变更记录
                        </div>
                      ) : (
                        <div className="border rounded-lg overflow-hidden divide-y text-xs">
                          {license.hardwareHistories.map((hist) => (
                            <div key={hist.id} className="p-2.5 flex items-center justify-between gap-2 bg-card">
                              <div className="font-mono text-xs text-foreground truncate max-w-[280px]">
                                {hist.hwid}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-mono shrink-0">
                                首次: {formatDate(hist.firstBoundAt)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 嵌套弹窗：编辑授权 */}
      {license && (
        <EditLicenseDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          license={license}
          onLicenseUpdated={(updated) => {
            setLicense(updated as LicenseDetails);
            onUpdated?.();
          }}
        />
      )}

      {/* 嵌套弹窗：赠送解绑次数 */}
      <Dialog open={isAddCountDialogOpen} onOpenChange={setIsAddCountDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base">赠送额外解绑额度</DialogTitle>
            <DialogDescription className="text-xs">
              为该授权增加临时换绑机会，额度将在当月标准限制用尽后自动抵扣。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">增加次数 *</Label>
              <Input
                type="number"
                min="1"
                max="50"
                value={countToAdd}
                onChange={(e) => setCountToAdd(e.target.value)}
                className="text-xs h-9"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddCountDialogOpen(false)}
              disabled={isUpdatingCount}
            >
              取消
            </Button>
            <Button size="sm" onClick={handleAddUnbindCount} disabled={isUpdatingCount}>
              {isUpdatingCount && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              确认增加
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
