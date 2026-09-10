'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  User,
  Copy,
  Key,
  Trash2,
  Loader2,
  Calendar,
  Clock,
  ShieldAlert,
  Layers,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { MaskedText } from '@/components/ui/masked-text';
import { useToast } from '@/hooks/use-toast';
import LicenseDetailsDialog from './license-details-dialog';

interface LicenseItem {
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

interface UserDetails {
  id: string;
  username: string;
  userHash: string;
  createdAt: string;
  licenses: LicenseItem[];
  totalDuration?: number;
}

interface UserDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  onUpdated?: () => void;
}

export default function UserDetailsDialog({
  open,
  onOpenChange,
  userId,
  onUpdated,
}: UserDetailsDialogProps) {
  const { toast } = useToast();
  const [user, setUser] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedLicenseId, setSelectedLicenseId] = useState<string | null>(null);
  const [isLicenseDetailsOpen, setIsLicenseDetailsOpen] = useState(false);

  const fetchUserDetails = async (showLoading = false) => {
    if (!userId) return;
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}`);
      if (!response.ok) {
        throw new Error('获取用户详情失败');
      }
      const data = await response.json();
      setUser(data);
      setError(null);
    } catch (err) {
      if (showLoading) {
        console.error('Error fetching user details:', err);
        setError('加载用户详情失败，请检查网络后重试。');
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    if (open && userId) {
      fetchUserDetails(true);
    } else {
      setUser(null);
      setError(null);
    }
  }, [open, userId]);

  const copyToClipboard = (text: string, itemName: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: '已复制到剪贴板',
      description: `${itemName} 已复制`,
    });
  };

  const deleteUser = async () => {
    if (!user) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '删除用户失败');
      }

      toast({
        title: '删除成功',
        description: data.message || '用户及其关联的授权已永久删除',
      });
      onOpenChange(false);
      onUpdated?.();
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '删除用户失败',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const formatLicenseDuration = (minutes?: number | null) => {
    if (minutes === undefined || minutes === null) return '-';
    if (minutes === 0) return '0分钟';
    if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}天`;
    if (minutes % 60 === 0) return `${minutes / 60}小时`;
    return `${minutes}分钟`;
  };

  const getLicenseStatus = (license: LicenseItem) => {
    const isExp = new Date(license.expirationDate) < new Date();
    if (license.status === 'revoked') {
      return <Badge variant="destructive" className="text-[10px]">已撤销</Badge>;
    }
    if (license.status === 'suspended') {
      return <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-600 bg-yellow-500/10">已冻结</Badge>;
    }
    if (license.status === 'unactivated') {
      return <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-600 bg-blue-500/10">待激活</Badge>;
    }
    if (isExp) {
      return <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-600 bg-rose-500/10">已过期</Badge>;
    }
    return <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-700">有效</Badge>;
  };

  const initialLetter = (user?.username || 'U').charAt(0).toUpperCase();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-[680px] max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>用户详情</DialogTitle>
            <DialogDescription>查看与管理已注册用户信息及关联授权卡密</DialogDescription>
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
          ) : error || !user ? (
            <div className="p-8 text-center space-y-3">
              <ShieldAlert className="h-10 w-10 text-destructive mx-auto" />
              <p className="text-sm text-destructive">{error || '未找到该用户信息'}</p>
              <Button size="sm" variant="outline" onClick={() => fetchUserDetails(true)}>
                重试加载
              </Button>
            </div>
          ) : (
            <>
              {/* 顶部 Header */}
              <div className="p-5 border-b bg-card pr-12">
                <div className="flex items-center gap-3.5">
                  <Avatar className="h-11 w-11 bg-primary text-primary-foreground font-bold text-sm">
                    <AvatarFallback className="bg-primary text-primary-foreground font-bold">
                      {initialLetter}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold text-foreground truncate">
                        {user.username}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        拥有 {user.licenses?.length || 0} 个授权
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                      <span>ID: {user.id}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 中间信息与关联授权 */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* 用户凭据与信息卡 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-lg border bg-muted/20 space-y-1.5">
                    <div className="text-xs text-muted-foreground">用户专属哈希 (UserHash)</div>
                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-foreground">
                      <MaskedText value={user.userHash} head={8} tail={6} className="text-xs" />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 shrink-0"
                        onClick={() => copyToClipboard(user.userHash, 'UserHash')}
                      >
                        <Copy className="h-3 w-3" />
                        <span className="sr-only">复制哈希</span>
                      </Button>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg border bg-muted/20 space-y-1.5">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      用户注册时间
                    </div>
                    <div className="font-mono text-xs font-medium text-foreground">
                      {formatDate(user.createdAt)}
                    </div>
                  </div>
                </div>

                {/* 关联授权卡密列表 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-primary" />
                      关联软件授权列表 ({user.licenses?.length || 0})
                    </span>
                  </div>

                  {!user.licenses || user.licenses.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground border rounded-lg bg-muted/10">
                      该用户目前名下暂无关联任何授权卡密
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden divide-y text-xs">
                      {user.licenses.map((lic) => (
                        <div
                          key={lic.id}
                          className="p-3 flex items-center justify-between gap-3 bg-card hover:bg-muted/20 transition-colors"
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-foreground">{lic.softwareName}</span>
                              <div className="flex items-center gap-1 font-mono text-xs">
                                <MaskedText value={lic.licenseKey} head={6} tail={4} className="text-xs" />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 shrink-0"
                                  onClick={() => copyToClipboard(lic.licenseKey, '卡密')}
                                >
                                  <Copy className="h-3 w-3" />
                                  <span className="sr-only">复制卡密</span>
                                </Button>
                              </div>
                              {getLicenseStatus(lic)}
                            </div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-3 flex-wrap">
                              <span>
                                类型: {lic.licenseType === 'duration' ? `激活卡 (${formatLicenseDuration(lic.duration)})` : '即时卡'}
                              </span>
                              <span>
                                到期: {new Date(lic.expirationDate).getFullYear() >= 2099 ? '永久有效' : formatDate(lic.expirationDate)}
                              </span>
                            </div>
                          </div>

                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs shrink-0"
                            onClick={() => {
                              setSelectedLicenseId(lic.id);
                              setIsLicenseDetailsOpen(true);
                            }}
                          >
                            查看详情
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 底部操作栏 */}
              <DialogFooter className="p-3 px-5 border-t bg-muted/20 flex items-center justify-end gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 text-xs gap-1"
                      disabled={isDeleting}
                    >
                      {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      删除用户
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>删除用户: {user.username}</AlertDialogTitle>
                      <AlertDialogDescription>
                        确定要删除用户 <span className="font-semibold text-foreground">{user.username}</span> 吗？这将同时永久删除该用户关联的所有软件授权卡密。此操作不可恢复。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={deleteUser}
                      >
                        确认删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 联动打开授权详情 */}
      <LicenseDetailsDialog
        open={isLicenseDetailsOpen}
        onOpenChange={setIsLicenseDetailsOpen}
        licenseId={selectedLicenseId}
        onUpdated={() => fetchUserDetails(false)}
      />
    </>
  );
}
