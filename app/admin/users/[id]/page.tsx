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
import { ArrowLeft, User, Copy, Key, Trash2, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { MaskedText } from '@/components/ui/masked-text';
import { useToast } from '@/hooks/use-toast';

interface License {
  id: string;
  licenseKey: string;
  softwareName: string;
  expirationDate: string;
  hardwareBindingEnabled: boolean;
  hwid: string | null;
  status: string;
  licenseType: string;
  duration?: number | null;
  calculatedDuration?: number;
  activatedAt?: string | null;
  createdAt: string;
}

// Format duration helper
const formatDuration = (minutes?: number | null) => {
  if (minutes === undefined || minutes === null) return '-';
  if (minutes === 0) return '0分钟';
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}天`;
  if (minutes % 60 === 0) return `${minutes / 60}小时`;
  return `${minutes}分钟`;
};

interface UserDetails {
  id: string;
  username: string;
  userHash: string;
  createdAt: string;
  licenses: License[];
  totalDuration?: number;
}

export default function UserDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [user, setUser] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchUserDetails = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/users/${params.id}`);

        if (!response.ok) {
          throw new Error('获取用户详情失败');
        }

        const data = await response.json();
        setUser(data);
      } catch (err) {
        console.error('Error fetching user details:', err);
        setError('加载用户详情失败。请稍后再试。');
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      fetchUserDetails();
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

  const deleteUser = async () => {
    if (!user) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: '用户已删除',
          description: data.message || '用户及其关联的授权已被删除',
        });
        router.push('/admin/users');
      } else {
        throw new Error(data.error || '删除用户失败');
      }
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '删除用户失败',
        variant: 'destructive',
      });
      setIsDeleting(false);
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
          返回用户列表
        </Button>

        <h1 className="text-3xl font-bold">用户详情</h1>
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
            <User className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">加载用户出错</p>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button onClick={() => router.back()}>返回用户列表</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl flex items-center">
                <User className="h-6 w-6 mr-2 text-muted-foreground" />
                {user?.username || '用户详情'}
              </CardTitle>
              <CardDescription>
                用户 ID: {params.id}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">用户哈希</h3>
                <div className="flex items-center">
                  <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                    {user?.userHash || '无'}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-2 h-8 w-8"
                    onClick={() => user?.userHash && copyToClipboard(user.userHash, '用户哈希')}
                  >
                    <Copy className="h-4 w-4" />
                    <span className="sr-only">复制用户哈希</span>
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">创建时间</h3>
                <p>{user?.createdAt ? formatDate(user.createdAt) : '无'}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">总时长</h3>
                <p className="font-semibold text-primary">{user?.totalDuration ? formatDuration(user.totalDuration) : '-'}</p>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => router.back()}>
                返回用户列表
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    删除用户
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>删除用户</AlertDialogTitle>
                    <AlertDialogDescription>
                      您确定要删除用户 <span className="font-semibold">{user?.username}</span> 吗？
                      这将永久删除该用户及其所有关联的软件授权。此操作无法撤销。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={deleteUser}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          正在删除...
                        </>
                      ) : (
                        '删除'
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center">
                <Key className="h-5 w-5 mr-2 text-muted-foreground" />
                用户授权
              </CardTitle>
              <CardDescription>
                与该用户关联的所有软件授权
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user?.licenses && user.licenses.length > 0 ? (
                <div className="space-y-4">
                  {user.licenses.map((license) => (
                    <div key={license.id} className="border rounded-md p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium">{license.softwareName}</h4>
                          <div className="flex items-center mt-1">
                            <code className="bg-muted px-2 py-1 rounded text-xs font-mono">
                              <MaskedText value={license.licenseKey} head={6} tail={4} />
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="ml-1 h-6 w-6"
                              onClick={() => copyToClipboard(license.licenseKey, '授权密钥')}
                            >
                              <Copy className="h-3 w-3" />
                              <span className="sr-only">复制授权密钥</span>
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {license.status === "revoked" ? (
                            <Badge variant="destructive">撤销</Badge>
                          ) : license.status === "suspended" ? (
                            <Badge variant="secondary">冻结</Badge>
                          ) : license.status === "unactivated" ? (
                            <Badge variant="outline" className="text-yellow-600 border-yellow-600">待激活</Badge>
                          ) : (
                            <Badge
                              variant={isExpired(license.expirationDate) ? "destructive" : "default"}
                            >
                              {isExpired(license.expirationDate) ? "到期" : "有效"}
                            </Badge>
                          )}
                          <Badge
                            variant={license.hardwareBindingEnabled ? (license.hwid ? "default" : "secondary") : "outline"}
                          >
                            {license.hardwareBindingEnabled
                              ? (license.hwid ? "已绑定 HWID" : "待绑定 HWID")
                              : "未启用HWID"}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-2 text-sm space-y-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                          <p className="text-muted-foreground">
                            卡密类型: <span className="font-medium text-foreground">
                              {license.licenseType === 'duration' ? '激活卡' : '即时卡'}
                            </span>
                          </p>
                          <p className="text-muted-foreground">
                            使用时长: <span className="font-medium text-foreground">
                              {formatDuration(license.calculatedDuration)}
                            </span>
                          </p>
                        </div>
                        <p className="text-muted-foreground">
                          到期时间:{' '}
                          {(!license.activatedAt && license.licenseType === 'duration') ? (
                            <span className="text-foreground">-</span>
                          ) : license.status === 'revoked' ? (
                            <span className="text-muted-foreground line-through">
                              {formatDate(license.expirationDate)} (撤销)
                            </span>
                          ) : license.status === 'suspended' ? (
                            <span className="text-yellow-600 font-medium">
                              {formatDate(license.expirationDate)} (冻结)
                            </span>
                          ) : isExpired(license.expirationDate) ? (
                            <span className="text-destructive font-medium">
                              {formatDate(license.expirationDate)} (到期)
                            </span>
                          ) : (
                            <span className="text-green-600 font-medium">
                              {formatDate(license.expirationDate)} (有效)
                            </span>
                          )}
                        </p>
                        <p className="text-muted-foreground">创建时间: {formatDate(license.createdAt)}</p>
                      </div>
                      <div className="mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="text-xs"
                        >
                          <a href={`/admin/licenses/${license.id}`}>查看授权</a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8">
                  <Key className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">未找到该用户的授权记录</p>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button asChild>
                <a href={`/admin/licenses`}>查看所有授权</a>
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </AdminLayout>
  );
}