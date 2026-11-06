'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Edit, Trash2, Code2, AppWindow } from 'lucide-react';
import { HookScriptItem } from '@/components/admin/script-dialog';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';

interface ScriptsTableProps {
  scripts: HookScriptItem[];
  loading: boolean;
  onEdit: (script: HookScriptItem) => void;
  onRefresh: () => void;
}

export default function ScriptsTable({
  scripts,
  loading,
  onEdit,
  onRefresh,
}: ScriptsTableProps) {
  const { toast } = useToast();
  const [ConfirmDialog, confirm] = useConfirm();
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleToggleEnabled = async (script: HookScriptItem, newEnabled: boolean) => {
    setTogglingId(script.id);
    try {
      const res = await fetch(`/api/admin/scripts/${script.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '状态切换失败');
      }
      toast({
        title: '更新成功',
        description: `脚本「${script.name}」已${newEnabled ? '启用' : '禁用'}`,
      });
      onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '操作失败';
      toast({
        title: '错误',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (script: HookScriptItem) => {
    const ok = await confirm({
      title: '删除脚本确认',
      description: `确定要删除脚本「${script.name}」吗？已绑定该脚本的软件将自动解绑。`,
      confirmText: '确认删除',
      variant: 'destructive',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/admin/scripts/${script.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '删除失败');
      }
      toast({
        title: '删除成功',
        description: `脚本「${script.name}」已成功移除`,
      });
      onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '删除失败';
      toast({
        title: '错误',
        description: message,
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-muted-foreground text-sm space-y-2">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
        <p>正在加载脚本列表...</p>
      </div>
    );
  }

  if (scripts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground text-sm space-y-3">
        <Code2 className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <p className="font-medium text-foreground">暂无动态钩子脚本</p>
          <p className="text-xs text-muted-foreground mt-1">创建脚本后可绑定至各软件，在授权封签前动态注入载荷</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-[200px]">脚本名称</TableHead>
              <TableHead>关联软件</TableHead>
              <TableHead className="w-[100px] text-center">状态</TableHead>
              <TableHead className="w-[160px]">更新时间</TableHead>
              <TableHead className="w-[120px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scripts.map((script) => (
              <TableRow key={script.id} className="hover:bg-muted/20">
                <TableCell>
                  <div className="space-y-0.5">
                    <p className="font-medium text-xs text-foreground flex items-center gap-1.5">
                      <Code2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>{script.name}</span>
                    </p>
                    {script.description && (
                      <p className="text-[11px] text-muted-foreground truncate max-w-[240px]">
                        {script.description}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {script.softwares && script.softwares.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {script.softwares.map((sw) => (
                        <Badge
                          key={sw.id}
                          variant="secondary"
                          className="text-[10px] font-normal py-0 h-4 flex items-center gap-1"
                        >
                          <AppWindow className="h-2.5 w-2.5 opacity-70" />
                          <span>{sw.name}</span>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">未关联软件</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={script.enabled}
                    disabled={togglingId === script.id}
                    onCheckedChange={(checked) => handleToggleEnabled(script, checked)}
                    className="scale-90"
                  />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono">
                  {formatDate(script.updatedAt)}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => onEdit(script)}
                    title="编辑脚本"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    <span className="sr-only">编辑</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(script)}
                    title="删除脚本"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only">删除</span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ConfirmDialog />
    </>
  );
}
