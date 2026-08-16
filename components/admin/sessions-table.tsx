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

type Session = {
  id: string;
  licenseKey: string;
  username: string;
  softwareName: string;
  hardwareId: string | null;
  ipAddress: string | null;
  lastHeartbeat: string;
  status: string;
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
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    setLoading(true);
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
      setLoading(false);
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
    (session.hardwareId && session.hardwareId.toLowerCase().includes(search.toLowerCase()))
  );

  const formatDateTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'yyyy-MM-dd HH:mm:ss');
    } catch (e) {
      return dateStr;
    }
  };

  const getSessionStatus = (lastHeartbeatStr: string) => {
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
              onClick={fetchSessions}
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
                placeholder="搜索用户名、授权密钥、软件名称、IP或硬件ID..."
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
                  <TableHead>硬件 ID</TableHead>
                  <TableHead>会话状态</TableHead>
                  <TableHead>最后心跳时间</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center h-24">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                      <p className="text-sm text-muted-foreground mt-2">正在加载在线会话...</p>
                    </TableCell>
                  </TableRow>
                ) : filteredSessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center h-24">
                      <Activity className="h-8 w-8 mx-auto text-muted-foreground animate-pulse" />
                      <p className="text-muted-foreground mt-2">当前无在线活动会话</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSessions.map((session) => {
                    const statusInfo = getSessionStatus(session.lastHeartbeat);
                    return (
                      <TableRow key={session.id}>
                        <TableCell className="font-mono text-xs max-w-[100px] truncate" title={session.id}>
                          {session.id}
                        </TableCell>
                        <TableCell className="font-medium">{session.username}</TableCell>
                        <TableCell className="font-mono text-xs max-w-[120px] truncate" title={session.licenseKey}>
                          {session.licenseKey}
                        </TableCell>
                        <TableCell>{session.softwareName}</TableCell>
                        <TableCell className="font-mono text-xs">{session.ipAddress || '-'}</TableCell>
                        <TableCell className="font-mono text-xs max-w-[120px] truncate" title={session.hardwareId || undefined}>
                          {session.hardwareId || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`${statusInfo.badgeClass} gap-1.5 px-2 py-0.5 font-medium text-xs flex items-center w-fit`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dotColor}`} />
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{formatDateTime(session.lastHeartbeat)}</TableCell>
                        <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10"
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
