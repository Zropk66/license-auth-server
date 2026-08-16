'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import UserLayout from '@/components/user/user-layout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Key, Copy, Calendar, Server } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface LicenseDetails {
  id: string;
  licenseKey: string;
  softwareName: string;
  expirationDate: string;
  hardwareBindingEnabled: boolean;
  hardwareId: string | null;
  status: string;
  licenseType: string;
  duration?: number | null;
  activatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function UserLicenseDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [license, setLicense] = useState<LicenseDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLicenseDetails = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/user/licenses/${params.id}`);

        if (!response.ok) {
          throw new Error('获取授权详情失败');
        }

        const data = await response.json();
        setLicense(data);
      } catch (err) {
        console.error('Error fetching license details:', err);
        setError('加载授权详情失败。请稍后再试。');
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      fetchLicenseDetails();
    }
  }, [params.id]);

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
    const created = new Date(license.createdAt);
    const expiry = new Date(license.expirationDate);

    let totalMins = 0;
    let usedMins = 0;

    if (license.licenseType === 'duration') {
      totalMins = license.duration || 0;
      if (!license.activatedAt) {
        usedMins = 0;
      } else {
        const remainingMs = expiry.getTime() - now.getTime();
        const remainingMins = Math.max(0, Math.round(remainingMs / (1000 * 60)));
        usedMins = Math.max(0, totalMins - remainingMins);
      }
    } else {
      const totalMs = expiry.getTime() - created.getTime();
      totalMins = Math.max(0, Math.round(totalMs / (1000 * 60)));
      if (now < created) {
        usedMins = 0;
      } else if (now > expiry) {
        usedMins = totalMins;
      } else {
        const usedMs = now.getTime() - created.getTime();
        usedMins = Math.max(0, Math.round(usedMs / (1000 * 60)));
      }
    }

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
                    您购买的授权：{license?.softwareName}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={status.variant}>
                    {status.label}
                  </Badge>
                  <Badge
                    variant={license?.hardwareBindingEnabled ? (license.hardwareId ? "default" : "secondary") : "outline"}
                  >
                    {license?.hardwareBindingEnabled
                      ? (license.hardwareId ? "已绑定硬件" : "待绑定硬件")
                      : "未绑定硬件"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">授权密钥</h3>
                <div className="flex items-center">
                  <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                    {license?.licenseKey || '无'}
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
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">软件名称</h3>
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
                        硬件绑定
                      </div>
                    </h3>
                    <p>
                      {license?.hardwareBindingEnabled
                        ? (license.hardwareId ? "此授权已绑定至您的硬件" : "此授权已启用硬件绑定，将在客户端首次登录时绑定")
                        : "未启用硬件绑定"}
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

              {license?.hardwareBindingEnabled && license.hardwareId && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">硬件 ID</h3>
                  <div className="flex items-center">
                    <code className="bg-muted px-2 py-1 rounded text-xs font-mono break-all max-w-full">
                      {license.hardwareId}
                    </code>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    此授权已绑定至上方硬件。它只能在此设备上使用。
                  </p>
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