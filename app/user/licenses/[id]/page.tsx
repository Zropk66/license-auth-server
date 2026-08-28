'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import UserLayout from '@/components/user/user-layout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Key, Copy, Calendar, Server, Smartphone, Loader2, Monitor, Clock, ShieldAlert } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { MaskedText } from '@/components/ui/masked-text';
import { useToast } from '@/hooks/use-toast';

interface UnbindStatus {
  enabled: boolean;
  allowSelfUnbind: boolean;
  isBound: boolean;
  maxPerMonth: number;
  usedThisMonth: number;
  remaining: number;
  cooldownRemainingHours: number;
  deductHours: number;
  lastUnboundAt: string | null;
}

interface LicenseDetails {
  id: string;
  licenseKey: string;
  softwareName: string;
  expirationDate: string;
  hardwareBindingEnabled: boolean;
  allowSelfUnbind?: boolean;
  hwid: string | null;
  deviceName?: string | null;
  status: string;
  licenseType: string;
  duration?: number | null;
  activatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  unbindStatus?: UnbindStatus | null;
  usageMinutes?: number;
}

export default function UserLicenseDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [license, setLicense] = useState<LicenseDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [unbinding, setUnbinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [globalUnbindEnabled, setGlobalUnbindEnabled] = useState(false);

  const fetchLicenseDetails = async () => {
    setLoading(true);
    try {
      const [licenseRes, settingsRes] = await Promise.all([
        fetch(`/api/user/licenses/${params.id}`),
        fetch('/api/settings/public').catch(() => null),
      ]);

      if (!licenseRes.ok) {
        throw new Error('获取授权详情失败');
      }

      const data = await licenseRes.json();
      setLicense(data);

      if (settingsRes && settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setGlobalUnbindEnabled(!!settingsData.unbindEnabled);
      }
    } catch (err) {
      console.error('Error fetching license details:', err);
      setError('加载授权详情失败。请稍后再试。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params.id) {
      fetchLicenseDetails();
    }
  }, [params.id]);

  const handleSelfUnbind = async () => {
    if (!license) return;
    if (!confirm('确定要自助解绑当前绑定的HWID设备吗？\n解绑后关联的在线会话将被强制下线，您可在新电脑上重新激活绑定。')) {
      return;
    }

    setUnbinding(true);
    try {
      const res = await fetch(`/api/user/licenses/${license.id}/unbind`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '解绑失败');
      }

      toast({
        title: '解绑成功',
        description: data.message || '已成功解除设备绑定，您可在新设备上登录激活',
      });

      setLicense((prev) => (prev ? { ...prev, hwid: null } : null));
    } catch (err: any) {
      toast({
        title: '无法解绑',
        description: err.message || '解绑失败',
        variant: 'destructive',
      });
    } finally {
      setUnbinding(false);
    }
  };

  const copyToClipboard = (text: string, itemName: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: '已复制到剪贴板',
      description: `${itemName} 已复制到剪贴板`,
    });
  };

  const isExpired = (date: string) => {
    return new Date(date) < new Date();
  };

  // Calculate the days remaining until expiration
  const getDaysRemaining = (expirationDate: string) => {
    const now = new Date();
    const expiry = new Date(expirationDate);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const getLicenseStatus = () => {
    if (!license) return { label: "未知", variant: "outline" as const };
    if (license.status === "revoked") {
      return { label: "撤销", variant: "destructive" as const };
    } else if (license.status === "suspended") {
      return { label: "冻结", variant: "secondary" as const };
    } else if (license.status === "unactivated") {
      return { label: "待激活", variant: "outline" as const };
    } else if (isExpired(license.expirationDate)) {
      return { label: "到期", variant: "destructive" as const };
    } else {
      return { label: "有效", variant: "default" as const };
    }
  };

  const formatDuration = (minutes?: number | null) => {
    if (minutes === undefined || minutes === null) return '-';
    if (minutes === 0) return '0分钟';
    if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}天`;
    if (minutes % 60 === 0) return `${minutes / (60)}小时`;
    return `${minutes}分钟`;
  };

  const getLicenseDurationStats = () => {
    if (!license) return null;
    const now = new Date();
    const expiry = new Date(license.expirationDate);

    let totalMins = 0;

    if (license.licenseType === 'duration') {
      if (license.activatedAt) {
        const actualMs = expiry.getTime() - new Date(license.activatedAt).getTime();
        totalMins = Math.max(0, Math.round(actualMs / (1000 * 60)));
      } else {
        totalMins = license.duration || 0;
      }
    } else {
      const totalMs = expiry.getTime() - new Date(license.createdAt).getTime();
      totalMins = Math.max(0, Math.round(totalMs / (1000 * 60)));
    }

    const usedMins = license.usageMinutes ?? 0;

    return {
      usedStr: formatDuration(usedMins),
      totalStr: formatDuration(totalMins),
      percent: totalMins > 0 ? Math.min(100, Math.round((usedMins / totalMins) * 100)) : 0
    };
  };

  const status = getLicenseStatus();

  return (
    <UserLayout>
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
                    所属软件：{license?.softwareName}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={status.variant}>
                    {status.label}
                  </Badge>
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

              {license?.status === "active" && license?.expirationDate && !isExpired(license.expirationDate) && (
                <Card className="bg-primary/5 border-none">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">授权状态</h3>
                        <p className="text-sm text-muted-foreground">
                          您的授权还有 {getDaysRemaining(license.expirationDate)} 天有效期
                        </p>
                      </div>
                      <Badge variant="default" className="text-xs">
                        有效
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 左栏：基础信息 */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">所属软件</h3>
                    <p>{license?.softwareName || '无'}</p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">密钥类型</h3>
                    <p>
                      {license?.licenseType === 'duration' ? (
                        <span className="text-yellow-600 font-medium">
                          激活卡 ({formatDuration(license.duration)})
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

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">
                      <div className="flex items-center">
                        <Server className="h-4 w-4 mr-1" />
                        HWID 绑定
                      </div>
                    </h3>
                    <p>
                      {license?.hardwareBindingEnabled
                        ? (license.hwid
                          ? `已绑定至：${license.deviceName || '未知设备'}`
                          : "此授权已启用 HWID 绑定，将在客户端首次登录时绑定")
                        : "未启用 HWID 绑定"}
                    </p>
                  </div>
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
                </div>
              </div>

              {/* 设备绑定 */}
              {license?.hardwareBindingEnabled && license.hwid && license.unbindStatus && license.unbindStatus.enabled && (
                <div className="p-4 border rounded-lg bg-muted/20 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-medium">设备绑定</h3>
                    </div>
                    {globalUnbindEnabled && license.allowSelfUnbind !== false && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={handleSelfUnbind}
                        disabled={unbinding || (license.unbindStatus?.remaining !== undefined && license.unbindStatus.remaining <= 0)}
                        title={license.unbindStatus?.remaining !== undefined && license.unbindStatus.remaining <= 0 ? '当月无可用换绑次数' : undefined}
                      >
                        {unbinding ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        ) : (
                          <Smartphone className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        自助解绑当前设备
                      </Button>
                    )}
                  </div>
                  {license.deviceName && (
                    <div className="flex items-center gap-2 text-sm">
                      <Monitor className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">当前设备：</span>
                      <span className="font-medium">{license.deviceName}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">剩余换绑</span>
                      <span className={`font-semibold ${license.unbindStatus.remaining > 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {license.unbindStatus.remaining}/{license.unbindStatus.maxPerMonth} 次
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">换绑冷却</span>
                      <span className="font-semibold">
                        {license.unbindStatus.cooldownRemainingHours > 0 ? (
                          <span className="text-yellow-600">{license.unbindStatus.cooldownRemainingHours} 小时</span>
                        ) : (
                          <span className="text-green-600">无</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">上次换绑</span>
                      <span className="font-semibold text-muted-foreground">
                        {license.unbindStatus.lastUnboundAt ? formatDate(license.unbindStatus.lastUnboundAt) : '无'}
                      </span>
                    </div>
                  </div>
                  {license.unbindStatus.cooldownRemainingHours > 0 && (
                    <p className="text-xs text-yellow-600 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      换绑冷却中，请 {license.unbindStatus.cooldownRemainingHours} 小时后再试
                    </p>
                  )}
                  {license.unbindStatus.deductHours > 0 && (
                    <p className="text-xs text-muted-foreground">
                      每次换绑将扣除 {license.unbindStatus.deductHours} 小时有效期
                    </p>
                  )}
                </div>
              )}

              {license?.status !== "revoked" && (
                <div className="bg-muted rounded-md p-4">
                  <h3 className="font-medium mb-2">如何使用此授权</h3>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>从官方网站下载并安装软件</li>
                    <li>启动应用程序并导航到授权激活界面</li>
                    <li>输入与上方完全一致的授权密钥</li>
                    <li>按照软件提供的其他说明进行操作</li>
                  </ol>
                </div>
              )}

              {license?.status === "revoked" && (
                <div className="bg-destructive/10 rounded-md p-4 border border-destructive/20">
                  <h3 className="font-medium mb-2 text-destructive">授权已撤销</h3>
                  <p className="text-sm">
                    此授权已被撤销，不再有效。请联系客服获取更多信息。
                  </p>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button variant="outline" onClick={() => router.back()}>
                返回授权列表
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </UserLayout>
  );
}