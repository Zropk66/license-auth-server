'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/admin-layout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { ArrowLeft, Key, Copy, User, Calendar, Server, Pencil, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
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
  hardwareId: string | null;
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
    hardwareId: string | null;
    lastHeartbeat: string;
    status: string;
    createdAt: string;
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
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [kickingSessionId, setKickingSessionId] = useState<string | null>(null);

  useEffect(() => {
    fetchLicenseDetails();
  }, [params.id]);
  
  const fetchLicenseDetails = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, itemName: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: '已复制到剪贴板',
      description: `${itemName} 已复制到剪贴板`,
    });
  };

  const formatDuration = (minutes?: number | null) => {
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

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  <div className="flex items-center">
                    <Server className="h-4 w-4 mr-1" />
                    硬件绑定
                  </div>
                </h3>

                {license?.hardwareBindingEnabled ? (
                  <div>
                    {license.hardwareId ? (
                      <div>
                        <p className="mb-2">此授权已绑定至特定硬件。</p>
                        <h4 className="text-xs font-medium text-muted-foreground mb-1">硬件 ID</h4>
                        <div className="flex items-center">
                          <code className="bg-muted px-2 py-1 rounded text-sm font-mono break-all">
                            {license.hardwareId}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="ml-2 h-8 w-8"
                            onClick={() => copyToClipboard(license.hardwareId!, '硬件 ID')}
                          >
                            <Copy className="h-4 w-4" />
                            <span className="sr-only">复制硬件 ID</span>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="mb-2 text-yellow-600">此授权已启用硬件绑定，将在客户端首次登录时自动绑定设备。</p>
                        <p className="text-muted-foreground">尚未绑定硬件设备。</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">未启用硬件绑定。</p>
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
                {license?.status !== "revoked" && (
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

          {license?.sessions && license.sessions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">在线会话</CardTitle>
                <CardDescription>当前与该授权关联的活跃 session</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-2 text-left font-medium">IP 地址</th>
                        <th className="px-4 py-2 text-left font-medium">硬件 ID</th>
                        <th className="px-4 py-2 text-left font-medium">最后心跳</th>
                        <th className="px-4 py-2 text-left font-medium">状态</th>
                        <th className="px-4 py-2 text-left font-medium w-[80px]">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {license?.sessions?.map((session) => (
                        <tr key={session.id} className="border-b last:border-0">
                          <td className="px-4 py-2 font-mono text-xs">{session.ipAddress || '-'}</td>
                          <td className="px-4 py-2 font-mono text-xs truncate max-w-[120px]">{session.hardwareId || '-'}</td>
                          <td className="px-4 py-2 text-xs">{formatDate(session.lastHeartbeat)}</td>
                          <td className="px-4 py-2">
                            <Badge variant={session.status === 'active' ? 'default' : 'secondary'}>
                              {session.status === 'active' ? '在线' : '已下线'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2">
                            {session.status === 'active' && (
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
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
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
    </AdminLayout>
  );
}