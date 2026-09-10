'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  User,
  KeyRound,
  ShieldCheck,
  Calendar,
  Clock,
  Copy,
  Check,
  Loader2,
  Activity,
  History,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  role: 'owner' | 'admin';
  adminId?: string;
  createdAt?: string;
  defaultTab?: 'profile' | 'security' | 'activity';
  onProfileUpdated: (newUsername: string) => void;
}

type PersonalLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string | null;
  createdAt: string;
};

const ACTION_NAME_MAP: Record<string, string> = {
  create_license: '创建授权',
  edit_license: '编辑授权',
  revoke_license: '撤销授权',
  suspend_license: '冻结授权',
  resume_license: '恢复授权',
  batch_generate_license: '批量生成授权',
  reset_hwid: '重置HWID',
  change_password: '修改登录密码',
  edit_profile: '修改个人用户名',
  update_settings: '修改系统设置',
  create_software: '创建软件',
  edit_software: '编辑软件',
  delete_software: '删除软件',
  create_user: '创建用户',
  delete_user: '删除用户',
};

export default function ProfileDialog({
  open,
  onOpenChange,
  username,
  role,
  adminId,
  createdAt,
  defaultTab = 'profile',
  onProfileUpdated,
}: ProfileDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  /* 资料修改状态 */
  const [newUsername, setNewUsername] = useState(username);
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);

  /* 密码修改状态 */
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  /* 最近个人操作动态 */
  const [logs, setLogs] = useState<PersonalLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setNewUsername(username);
      setActiveTab(defaultTab);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      fetchMyRecentLogs();
    }
  }, [open, username, defaultTab]);

  const fetchMyRecentLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/admin/audit-logs?pageSize=10');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.data || [];
        setLogs(list.slice(0, 8));
      }
    } catch {
      /* 失败忽略 */
    } finally {
      setLogsLoading(false);
    }
  };

  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newUsername.trim();

    if (!trimmed || trimmed.length < 3) {
      toast({
        title: '提示',
        description: '用户名长度至少需要 3 个字符',
        variant: 'destructive',
      });
      return;
    }

    if (trimmed === username) {
      toast({ title: '提示', description: '用户名未发生变化' });
      return;
    }

    setIsUpdatingUsername(true);
    try {
      const res = await fetch('/api/admin/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '修改用户名失败');
      }

      toast({
        title: '修改成功',
        description: `用户名已更新为「${data.user.username}」`,
      });
      onProfileUpdated(data.user.username);
    } catch (err: any) {
      toast({
        title: '修改失败',
        description: err.message || '网络请求错误',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingUsername(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!oldPassword) {
      toast({ title: '提示', description: '请输入当前旧密码', variant: 'destructive' });
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      toast({ title: '提示', description: '新密码长度至少需要 6 个字符', variant: 'destructive' });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({ title: '提示', description: '两次输入的新密码不一致', variant: 'destructive' });
      return;
    }

    if (oldPassword === newPassword) {
      toast({ title: '提示', description: '新密码不能与当前旧密码相同', variant: 'destructive' });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const res = await fetch('/api/admin/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword, confirmPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '修改密码失败');
      }

      toast({
        title: '修改成功',
        description: '登录密码已更新，请妥善保管新密码',
      });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast({
        title: '修改失败',
        description: err.message || '网络请求错误',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const initialLetter = (username || 'A').charAt(0).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 bg-primary text-primary-foreground font-bold">
              <AvatarFallback className="bg-primary text-primary-foreground font-bold">
                {initialLetter}
              </AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="text-lg">个人中心</DialogTitle>
              <DialogDescription className="text-xs">
                管理您的管理员个人资料、登录凭据与最近操作动态。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="pt-2">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="profile" className="gap-1.5 text-xs">
              <User className="h-3.5 w-3.5" />
              账号资料
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-1.5 text-xs">
              <KeyRound className="h-3.5 w-3.5" />
              安全与密码
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-1.5 text-xs">
              <History className="h-3.5 w-3.5" />
              操作动态
            </TabsTrigger>
          </TabsList>

          {/* ── 资料管理 ── */}
          <TabsContent value="profile" className="space-y-4 pt-3">
            <form onSubmit={handleUpdateUsername} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username-input" className="text-xs font-medium">
                  管理员用户名 *
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="username-input"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="请输入用户名"
                    disabled={isUpdatingUsername}
                    className="text-xs h-9"
                    maxLength={50}
                    required
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isUpdatingUsername || newUsername.trim() === username}
                    className="gap-1.5 shrink-0"
                  >
                    {isUpdatingUsername ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    保存用户名
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  支持 3 到 50 位的中文、英文字符、数字与下划线。
                </p>
              </div>

              <div className="rounded-lg border bg-muted/20 p-3 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    当前角色权限
                  </span>
                  <Badge variant={role === 'owner' ? 'default' : 'secondary'}>
                    {role === 'owner' ? '系统所有者 (owner)' : '管理员 (admin)'}
                  </Badge>
                </div>

                {adminId && (
                  <div className="flex items-center justify-between text-xs pt-2 border-t">
                    <span className="text-muted-foreground">账号唯一标识 (ID)</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{adminId}</span>
                  </div>
                )}

                {createdAt && (
                  <div className="flex items-center justify-between text-xs pt-2 border-t">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      账号注册时间
                    </span>
                    <span className="font-mono text-[11px] text-foreground">
                      {formatDate(createdAt)}
                    </span>
                  </div>
                )}
              </div>
            </form>
          </TabsContent>

          {/* ── 安全与密码 ── */}
          <TabsContent value="security" className="space-y-4 pt-3">
            <form onSubmit={handleUpdatePassword} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">当前旧密码 *</Label>
                <Input
                  type="password"
                  placeholder="请输入当前账号的旧密码"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  disabled={isUpdatingPassword}
                  className="text-xs h-9"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">设定新密码 *</Label>
                  <Input
                    type="password"
                    placeholder="输入新密码"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isUpdatingPassword}
                    className="text-xs h-9"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">确认新密码 *</Label>
                  <Input
                    type="password"
                    placeholder="再次输入以确认"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isUpdatingPassword}
                    className="text-xs h-9"
                    required
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg border bg-muted/20 text-[11px] text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">密码安全策略说明：</p>
                <p>• 基础模式：密码长度需至少为 6 个字符。</p>
                <p>• 强密码策略开启时：长度需至少为 8 位，且包含大小写字母、数字及特殊符号。</p>
              </div>

              <div className="flex justify-end pt-1">
                <Button type="submit" disabled={isUpdatingPassword} className="gap-1.5">
                  {isUpdatingPassword && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  更新登录密码
                </Button>
              </div>
            </form>
          </TabsContent>

          {/* ── 操作动态 ── */}
          <TabsContent value="activity" className="space-y-3 pt-3">
            {logsLoading ? (
              <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在加载操作记录...
              </div>
            ) : logs.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                暂无近期操作日志
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {logs.map((log) => {
                  const actionName = ACTION_NAME_MAP[log.action] || log.action;
                  return (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border bg-card text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-medium text-foreground">{actionName}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          目标: {log.targetId}
                        </div>
                      </div>
                      <div className="text-[10px] text-muted-foreground shrink-0 font-mono">
                        {formatDate(log.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
