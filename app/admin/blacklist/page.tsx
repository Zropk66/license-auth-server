'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/admin-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShieldAlert, Plus, Trash2, Search, RefreshCw, Globe, Laptop } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AddBlacklistDialog from '@/components/admin/add-blacklist-dialog';

interface BlacklistItem {
  id: string;
  type: string;
  value: string;
  reason: string | null;
  isAuto: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export default function BlacklistPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<BlacklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchBlacklist = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (search.trim()) params.append('search', search.trim());

      const res = await fetch(`/api/admin/blacklist?${params.toString()}`);
      if (!res.ok) throw new Error('获取黑名单失败');
      const data = await res.json();
      setItems(data);
    } catch (err: any) {
      toast({
        title: '错误',
        description: err.message || '加载黑名单失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlacklist();
  }, [typeFilter]);

  const handleDelete = async (id: string, value: string) => {
    if (!confirm(`确定要将 [${value}] 从黑名单中移除并解封吗？`)) return;

    try {
      const res = await fetch(`/api/admin/blacklist/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('解除封禁失败');

      toast({
        title: '已解除封禁',
        description: `已成功解封 ${value}`,
      });
      fetchBlacklist();
    } catch (err: any) {
      toast({
        title: '错误',
        description: err.message || '操作失败',
        variant: 'destructive',
      });
    }
  };

  const ipCount = items.filter((i) => i.type === 'ip').length;
  const hwCount = items.filter((i) => i.type === 'hwid').length;
  const autoCount = items.filter((i) => i.isAuto).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">黑名单安全防护</h1>
            <p className="text-muted-foreground text-sm">
              管理被封禁的 IP 地址与HWID (HWID)，支持自动安全防御拦截。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchBlacklist} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              添加封禁
            </Button>
          </div>
        </div>

        {/* 统计指标 */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">IP 封禁总数</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{ipCount}</div>
              <p className="text-xs text-muted-foreground mt-1">拦截来自恶意 IP 的所有请求</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">HWID 机器码封禁</CardTitle>
              <Laptop className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{hwCount}</div>
              <p className="text-xs text-muted-foreground mt-1">拦截已被拉黑的终端设备</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">系统自适应防御封禁</CardTitle>
              <ShieldAlert className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{autoCount}</div>
              <p className="text-xs text-muted-foreground mt-1">系统触发撞库/限流超限自动拉黑</p>
            </CardContent>
          </Card>
        </div>

        {/* 列表表格 */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">封禁列表</CardTitle>
                <CardDescription>当前生效中的所有 IP 与机器码黑名单记录</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部类型</SelectItem>
                    <SelectItem value="ip">IP 地址</SelectItem>
                    <SelectItem value="hwid">HWID</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Input
                    placeholder="搜索 IP 或机器码..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchBlacklist()}
                    className="w-48 sm:w-64"
                  />
                  <Button variant="ghost" size="icon" onClick={fetchBlacklist}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">类型</TableHead>
                    <TableHead>封禁目标 (IP / HWID)</TableHead>
                    <TableHead>封禁原因</TableHead>
                    <TableHead>来源</TableHead>
                    <TableHead>过期时间</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        正在加载黑名单数据...
                      </TableCell>
                    </TableRow>
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        暂无黑名单数据，系统运行正常
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Badge variant={item.type === 'ip' ? 'outline' : 'secondary'}>
                            {item.type === 'ip' ? 'IP 地址' : '机器码'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                            {item.value}
                          </code>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={item.reason || ''}>
                          {item.reason || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.isAuto ? 'destructive' : 'default'} className="text-[10px]">
                            {item.isAuto ? '系统防御' : '管理员手动'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.expiresAt ? new Date(item.expiresAt).toLocaleString() : '永久封禁'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(item.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(item.id, item.value)}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            解除封禁
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <AddBlacklistDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchBlacklist}
      />
    </AdminLayout>
  );
}
