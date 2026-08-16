'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, RefreshCcw, ClipboardList } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type AuditLog = {
  id: string;
  adminId: string | null;
  admin?: {
    username: string;
  } | null;
  action: string;
  targetType: string;
  targetId: string;
  details: string | null;
  createdAt: string;
};

const ACTION_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  create_license: { label: "创建授权", variant: "default" },
  revoke_license: { label: "撤销授权", variant: "destructive" },
  suspend_license: { label: "冻结授权", variant: "secondary" },
  resume_license: { label: "恢复授权", variant: "outline" },
  edit_license: { label: "编辑授权", variant: "outline" },
  reset_hardware_id: { label: "重置硬件ID", variant: "secondary" },
  delete_user: { label: "删除用户", variant: "destructive" },
  kick_session: { label: "踢出Session", variant: "destructive" },
};

export default function AuditLogsTable() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/audit-logs');
      const data = await response.json();
      if (response.ok) {
        setLogs(data);
      } else {
        throw new Error(data.error || '获取操作日志失败');
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast({
        title: '错误',
        description: '获取操作日志失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = logs.filter(log => {
    const adminName = log.admin?.username || '系统';
    const actionLabel = ACTION_MAP[log.action]?.label || log.action;
    return (
      adminName.toLowerCase().includes(search.toLowerCase()) ||
      actionLabel.toLowerCase().includes(search.toLowerCase()) ||
      log.targetId.toLowerCase().includes(search.toLowerCase()) ||
      (log.details && log.details.toLowerCase().includes(search.toLowerCase()))
    );
  });

  const getActionBadge = (action: string) => {
    const info = ACTION_MAP[action] || { label: action, variant: "outline" as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  const getTargetTypeLabel = (type: string) => {
    switch (type) {
      case 'license': return '授权';
      case 'user': return '用户';
      case 'session': return '会话';
      default: return type;
    }
  };

  const formatDetails = (detailsStr: string | null) => {
    if (!detailsStr) return '-';
    try {
      const obj = JSON.parse(detailsStr);
      return Object.entries(obj)
        .map(([k, v]) => {
          let val = String(v);
          if (Array.isArray(v)) val = v.join(', ');
          return `${k}: ${val}`;
        })
        .join(' | ');
    } catch {
      return detailsStr;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col space-y-2 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <CardTitle className="text-xl">操作日志列表</CardTitle>
          <CardDescription>审计系统管理员执行的操作记录</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchLogs}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="h-4 w-4" />
          )}
          <span className="sr-only">刷新</span>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex items-center pb-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="搜索管理员、动作名称、目标 ID 或详情内容..."
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
                <TableHead>操作时间</TableHead>
                <TableHead>管理员</TableHead>
                <TableHead>操作动作</TableHead>
                <TableHead>目标类型</TableHead>
                <TableHead>目标 ID</TableHead>
                <TableHead>操作详情</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    <p className="text-sm text-muted-foreground mt-2">正在加载操作日志...</p>
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24">
                    <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-muted-foreground mt-2">未找到操作日志</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">{formatDate(log.createdAt)}</TableCell>
                    <TableCell className="font-medium">{log.admin?.username || '系统'}</TableCell>
                    <TableCell>{getActionBadge(log.action)}</TableCell>
                    <TableCell>{getTargetTypeLabel(log.targetType)}</TableCell>
                    <TableCell className="font-mono text-xs truncate max-w-[120px]" title={log.targetId}>
                      {log.targetId}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]" title={log.details || ''}>
                      {formatDetails(log.details)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
