'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Loader2, Search, RefreshCcw, Activity, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { MaskedText } from '@/components/ui/masked-text';

type Session = {
  id: string;
  licenseKey: string;
  username: string;
  softwareName: string;
  hwid: string | null;
  ipAddress: string | null;
  lastHeartbeat: string;
  status: string;
  terminatedAt: string | null;
  createdAt: string;
};

export default function SessionsTable() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sessionToKick, setSessionToKick] = useState<Session | null>(null);
  const [isKicking, setIsKicking] = useState(false);

  useEffect(() => {
    // 首次加载展示 loading 状态
    fetchSessions(true);

    // 每 5 秒自动静默更新数据，表格不闪烁
    const timer = setInterval(() => {
      fetchSessions(false);
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  const fetchSessions = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch('/api/admin/sessions');
      const data = await response.json();

      if (response.ok) {
        setSessions(data);
      } else {
        throw new Error(data.error || '获取在线会话失败');
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
      toast({
        title: '错误',
        description: '获取在线会话列表失败',
        variant: 'destructive',
      });
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const kickSession = async () => {
    if (!sessionToKick) return;

    setIsKicking(true);
    try {
      const response = await fetch(`/api/admin/sessions?id=${sessionToKick.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        setSessions(prev => prev.filter(session => session.id !== sessionToKick.id));
        toast({
          title: '会话已终止',
          description: '该会话已被成功强制下线',
        });
        setSessionToKick(null);
      } else {
        throw new Error(data.error || '强制下线失败');
      }
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '强制下线失败',
        variant: 'destructive',
      });
    } finally {
      setIsKicking(false);
    }
  };

  const filteredSessions = sessions.filter(session =>
    session.username.toLowerCase().includes(search.toLowerCase()) ||
    session.licenseKey.toLowerCase().includes(search.toLowerCase()) ||
    session.softwareName.toLowerCase().includes(search.toLowerCase()) ||
    (session.ipAddress && session.ipAddress.toLowerCase().includes(search.toLowerCase())) ||
    (session.hwid && session.hwid.toLowerCase().includes(search.toLowerCase()))
  );

  const formatDateTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'yyyy-MM-dd HH:mm:ss');
    } catch (e) {
      return dateStr;
    }
  };

  const formatOnlineDuration = (startStr: string, endStr: string | null, lastHbStr: string, isActive: boolean) => {
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

  const getSessionStatus = (lastHeartbeatStr: string, dbStatus: string) => {
    if (dbStatus !== 'active') {
      return {
        label: '已下线',
        dotColor: 'bg-red-500',
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
          dotColor: 'bg-green-500 animate-pulse',
          badgeClass: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-200'
        };
      } else if (diffSeconds <= 90) {
        return {
          label: '延迟',
          dotColor: 'bg-yellow-500',
          badgeClass: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200'
        };
      } else if (diffSeconds <= 300) {
        return {
          label: '警告',
          dotColor: 'bg-orange-500 animate-bounce',
          badgeClass: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200'
        };
      } else {
        return {
          label: '离线',
          dotColor: 'bg-red-500',
          badgeClass: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200'
        };
      }
    } catch (e) {
      return {
        label: '未知',
        dotColor: 'bg-gray-500',
        badgeClass: 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-200'
      };
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col space-y-2 md:flex-row md:items-center md:justify-between md:space-y-0">
          <div>
            <CardTitle className="text-xl">在线用户与活跃会话</CardTitle>
            <CardDescription>监控当前正在使用软件的在线客户端会话（最近 5 分钟内有心跳）</CardDescription>
          </div>
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchSessions(true)}
              disabled={loading}
            >
              {loading ? (
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
                placeholder="搜索用户名、授权密钥、软件名称、IP或HWID..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>会话 ID</TableHead>
                  <TableHead>用户名</TableHead>
                  <TableHead>授权密钥</TableHead>
                  <TableHead>软件名称</TableHead>
                  <TableHead>IP 地址</TableHead>
                  <TableHead>HWID</TableHead>
                  <TableHead>会话状态</TableHead>
                  <TableHead>登录时间</TableHead>
                  <TableHead>下线时间</TableHead>
                  <TableHead>最后心跳</TableHead>
                  <TableHead>总在线时长</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center h-24">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                      <p className="text-sm text-muted-foreground mt-2">正在加载会话...</p>
                    </TableCell>
                  </TableRow>
                ) : filteredSessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center h-24">
                      <Activity className="h-8 w-8 mx-auto text-muted-foreground animate-pulse" />
                      <p className="text-muted-foreground mt-2">当前无会话记录</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSessions.map((session) => {
                    const statusInfo = getSessionStatus(session.lastHeartbeat, session.status);
                    const isSessionActive = statusInfo.label === '活跃' || statusInfo.label === '延迟' || statusInfo.label === '警告';
                    const durationStr = formatOnlineDuration(session.createdAt, session.terminatedAt, session.lastHeartbeat, isSessionActive);

                    return (
                      <TableRow key={session.id}>
                        <TableCell className="font-mono text-xs max-w-[100px] truncate">
                          <MaskedText value={session.id} head={6} tail={4} />
                        </TableCell>
                        <TableCell className="font-medium">{session.username}</TableCell>
                        <TableCell className="font-mono text-xs max-w-[120px] truncate">
                          <MaskedText value={session.licenseKey} head={6} tail={4} />
                        </TableCell>
                        <TableCell>{session.softwareName}</TableCell>
                        <TableCell className="font-mono text-xs">{session.ipAddress || '-'}</TableCell>
                        <TableCell className="font-mono text-xs max-w-[120px] truncate">
                          {session.hwid ? <MaskedText value={session.hwid} head={6} tail={4} /> : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`${statusInfo.badgeClass} gap-1.5 px-2 py-0.5 font-medium text-xs flex items-center w-fit`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dotColor}`} />
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{formatDateTime(session.createdAt)}</TableCell>
                        <TableCell className="text-xs">{session.terminatedAt ? formatDateTime(session.terminatedAt) : (isSessionActive ? '-' : formatDateTime(session.lastHeartbeat))}</TableCell>
                        <TableCell className="text-xs">{formatDateTime(session.lastHeartbeat)}</TableCell>
                        <TableCell className="text-xs font-medium">{durationStr}</TableCell>
                        <TableCell>
                        {isSessionActive && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:bg-destructive/10 h-8"
                                onClick={() => setSessionToKick(session)}
                              >
                                <ShieldAlert className="h-4 w-4 mr-1" />
                                下线
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>强制会话下线</AlertDialogTitle>
                                <AlertDialogDescription>
                                  您确定要强制下线用户 <span className="font-semibold">{session.username}</span> 在软件 <span className="font-semibold">{session.softwareName}</span> 上的会话吗？
                                  强制下线后，客户端的下一次心跳或验证请求将会失败，需要重新进行授权验证。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={kickSession}
                                  disabled={isKicking}
                                >
                                  {isKicking ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      正在下线...
                                    </>
                                  ) : (
                                    '强制下线'
                                  )}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
