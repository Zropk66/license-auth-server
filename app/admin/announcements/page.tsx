'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/admin-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Megaphone, Plus, Edit, Trash2, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AddAnnouncementDialog, { AnnouncementItem } from '@/components/admin/add-announcement-dialog';

export default function AnnouncementsPage() {
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [announcementToEdit, setAnnouncementToEdit] = useState<AnnouncementItem | null>(null);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/announcements');
      if (!res.ok) throw new Error('获取公告失败');
      const data = await res.json();
      setAnnouncements(data);
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
    fetchAnnouncements();
  }, []);

  const handleToggle = async (a: AnnouncementItem) => {
    try {
      const res = await fetch(`/api/admin/announcements/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !a.enabled }),
      });
      if (!res.ok) throw new Error('更新状态失败');
      fetchAnnouncements();
    } catch (err: any) {
      toast({
        title: '错误',
        description: err.message || '操作失败',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (a: AnnouncementItem) => {
    if (!confirm(`确定要删除公告 [${a.title}] 吗？`)) return;

    try {
      const res = await fetch(`/api/admin/announcements/${a.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('删除失败');
      toast({ title: '已删除', description: `公告 [${a.title}] 已移除` });
      fetchAnnouncements();
    } catch (err: any) {
      toast({
        title: '错误',
        description: err.message || '删除失败',
        variant: 'destructive',
      });
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'warning':
        return <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px]">重要提醒</Badge>;
      case 'maintenance':
        return <Badge variant="destructive" className="text-[10px]">停服维护</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px]">常规通知</Badge>;
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">系统公告管理</h1>
            <p className="text-muted-foreground text-sm">
              发布与管理客户端弹窗通知、滚动消息及停服维护预警。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchAnnouncements} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setAnnouncementToEdit(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              发布公告
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">公告列表</CardTitle>
                <CardDescription className="text-xs">
                  客户端请求 <code>/api/software/announcements</code> 时将拉取目标软件处于启用状态的公告。
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>目标软件</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>公告标题</TableHead>
                    <TableHead>公告内容</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">
                        正在加载公告数据...
                      </TableCell>
                    </TableRow>
                  ) : announcements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">
                        暂无已发布的系统公告。
                      </TableCell>
                    </TableRow>
                  ) : (
                    announcements.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-semibold text-xs">{a.softwareName}</TableCell>
                        <TableCell>{getTypeBadge(a.type)}</TableCell>
                        <TableCell className="font-medium text-xs max-w-xs truncate" title={a.title}>
                          {a.title}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-sm truncate" title={a.content}>
                          {a.content}
                        </TableCell>
                        <TableCell>
                          <Switch checked={a.enabled} onCheckedChange={() => handleToggle(a)} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setAnnouncementToEdit(a);
                                setDialogOpen(true);
                              }}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(a)}
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

      <AddAnnouncementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        announcementToEdit={announcementToEdit}
        onSuccess={fetchAnnouncements}
      />
    </AdminLayout>
  );
}
