'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/admin/admin-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { AppWindow, Plus, Edit, Trash2, RefreshCw, Search, Key, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';
import CreateSoftwareDialog from '@/components/admin/create-software-dialog';
import EditSoftwareDialog, { SoftwareItem } from '@/components/admin/edit-software-dialog';

export default function SoftwaresPage() {
  const { toast } = useToast();
  const [softwares, setSoftwares] = useState<SoftwareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [softwareToEdit, setSoftwareToEdit] = useState<SoftwareItem | null>(null);

  const fetchSoftwares = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/softwares');
      if (!res.ok) throw new Error('获取软件列表失败');
      const data = await res.json();
      setSoftwares(data);
    } catch (err: any) {
      toast({
        title: '错误',
        description: err.message || '加载失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSoftwares();
  }, [fetchSoftwares]);

  const handleToggle = async (s: SoftwareItem) => {
    try {
      const res = await fetch(`/api/admin/softwares/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !s.enabled }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '更新状态失败');
      }
      fetchSoftwares();
    } catch (err: any) {
      toast({
        title: '错误',
        description: err.message || '操作失败',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (s: SoftwareItem) => {
    const hasRelations = (s.licenseCount || 0) > 0 || (s.versionCount || 0) > 0;
    const msg = hasRelations
      ? `确定要删除所属软件「${s.name}」吗？\n\n该软件下有 ${s.licenseCount || 0} 个授权卡密和 ${s.versionCount || 0} 个版本记录，删除后将一并清除所有关联数据（含会话和硬件绑定历史），此操作不可恢复！`
      : `确定要删除所属软件「${s.name}」吗？`;
    if (!confirm(msg)) return;

    try {
      const res = await fetch(`/api/admin/softwares/${s.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '删除失败');
      }
      toast({ title: '已删除', description: `软件「${s.name}」已删除` });
      fetchSoftwares();
    } catch (err: any) {
      toast({
        title: '删除失败',
        description: err.message || '操作失败',
        variant: 'destructive',
      });
    }
  };

  const filteredSoftwares = softwares.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.code && s.code.toLowerCase().includes(q)) ||
      (s.description && s.description.toLowerCase().includes(q))
    );
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">所属软件管理</h1>
            <p className="text-muted-foreground text-sm">
              管理系统接入的所有独立软件产品与插件项目。创建或编辑授权卡密时，仅可选择此处已启用的所属软件。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchSoftwares} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              添加软件
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <AppWindow className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">软件列表</CardTitle>
                </div>
              </div>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="搜索软件名称、代码或说明..."
                  className="pl-8 h-9 text-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>所属软件名称</TableHead>
                    <TableHead>标识代码 (Code)</TableHead>
                    <TableHead>说明描述</TableHead>
                    <TableHead>关联授权卡密</TableHead>
                    <TableHead>发布版本数</TableHead>
                    <TableHead>启用状态</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-6 text-muted-foreground text-xs">
                        正在加载软件列表...
                      </TableCell>
                    </TableRow>
                  ) : filteredSoftwares.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-xs">
                        <AppWindow className="h-8 w-8 mx-auto text-muted-foreground mb-2 opacity-50" />
                        {search ? '未找到符合条件的所属软件' : '暂无所属软件，点击右上角「添加软件」立即创建。'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSoftwares.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-semibold text-xs text-foreground">
                          {s.name}
                        </TableCell>
                        <TableCell>
                          {s.code ? (
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {s.code}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                          {s.description || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs font-mono inline-flex items-center gap-1">
                            <Key className="h-3 w-3 text-muted-foreground" />
                            {s.licenseCount || 0} 个
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-mono inline-flex items-center gap-1">
                            <Package className="h-3 w-3 text-muted-foreground" />
                            {s.versionCount || 0} 个
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={s.enabled}
                            onCheckedChange={() => handleToggle(s)}
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(s.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setSoftwareToEdit(s);
                                setEditDialogOpen(true);
                              }}
                            >
                              <Edit className="h-3.5 w-3.5" />
                              <span className="sr-only">编辑</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(s)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="sr-only">删除</span>
                            </Button>
                          </div>
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

      <CreateSoftwareDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={fetchSoftwares}
      />

      <EditSoftwareDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        software={softwareToEdit}
        onSuccess={fetchSoftwares}
      />
    </AdminLayout>
  );
}
