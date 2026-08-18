'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/admin-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Package, Plus, Edit, Trash2, RefreshCw, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AddVersionDialog, { VersionItem } from '@/components/admin/add-version-dialog';

export default function SoftwareVersionsPage() {
  const { toast } = useToast();
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [versionToEdit, setVersionToEdit] = useState<VersionItem | null>(null);

  const fetchVersions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/software-versions');
      if (!res.ok) throw new Error('获取版本列表失败');
      const data = await res.json();
      setVersions(data);
    } catch (err: any) {
      toast({
        title: '错误',
        description: err.message || '加载失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVersions();
  }, []);

  const handleToggle = async (v: VersionItem) => {
    try {
      const res = await fetch(`/api/admin/software-versions/${v.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !v.enabled }),
      });
      if (!res.ok) throw new Error('更新状态失败');
      fetchVersions();
    } catch (err: any) {
      toast({
        title: '错误',
        description: err.message || '操作失败',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (v: VersionItem) => {
    if (!confirm(`确定要删除软件 [${v.softwareName}] 的版本 [v${v.version}] 吗？`)) return;

    try {
      const res = await fetch(`/api/admin/software-versions/${v.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('删除失败');
      toast({ title: '已删除', description: `版本 v${v.version} 已删除` });
      fetchVersions();
    } catch (err: any) {
      toast({
        title: '错误',
        description: err.message || '删除失败',
        variant: 'destructive',
      });
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">软件版本管理</h1>
            <p className="text-muted-foreground text-sm">
              管理各软件的最新发布版本、更新日志、下载链接及强制更新策略。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchVersions} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setVersionToEdit(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              发布新版本
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">版本发布列表</CardTitle>
                <CardDescription className="text-xs">
                  客户端调用 <code>/api/software/check-update</code> 将自动比对以下最高活跃版本。
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>软件名称</TableHead>
                    <TableHead>版本号 (SemVer)</TableHead>
                    <TableHead>代码 (Code)</TableHead>
                    <TableHead>强制更新</TableHead>
                    <TableHead>下载地址</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-xs">
                        正在加载版本数据...
                      </TableCell>
                    </TableRow>
                  ) : versions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-xs">
                        暂无已发布的软件版本，点击右上角「发布新版本」创建。
                      </TableCell>
                    </TableRow>
                  ) : (
                    versions.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-semibold text-xs">{v.softwareName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            v{v.version}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{v.versionCode}</TableCell>
                        <TableCell>
                          {v.isForced ? (
                            <Badge variant="destructive" className="text-[10px]">强制更新</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">可选更新</Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          <a
                            href={v.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          >
                            <span className="truncate max-w-[200px]">{v.downloadUrl}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </TableCell>
                        <TableCell>
                          <Switch checked={v.enabled} onCheckedChange={() => handleToggle(v)} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setVersionToEdit(v);
                                setDialogOpen(true);
                              }}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(v)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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

      <AddVersionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        versionToEdit={versionToEdit}
        onSuccess={fetchVersions}
      />
    </AdminLayout>
  );
}
