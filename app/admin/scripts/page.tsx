'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, RefreshCw, Search, Code2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ScriptsTable from '@/components/admin/scripts-table';
import ScriptDialog, { HookScriptItem } from '@/components/admin/script-dialog';

export default function ScriptsPage() {
  const { toast } = useToast();
  const [scripts, setScripts] = useState<HookScriptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scriptToEdit, setScriptToEdit] = useState<HookScriptItem | null>(null);

  useEffect(() => {
    document.title = '脚本管理 | 管理员后台';
  }, []);

  const fetchScripts = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch('/api/admin/scripts');
      if (!res.ok) throw new Error('获取脚本列表失败');
      const data = await res.json();
      setScripts(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '加载失败';
      if (showLoading) {
        toast({
          title: '错误',
          description: message,
          variant: 'destructive',
        });
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchScripts(true);
  }, [fetchScripts]);

  const handleCreate = () => {
    setScriptToEdit(null);
    setDialogOpen(true);
  };

  const handleEdit = (script: HookScriptItem) => {
    setScriptToEdit(script);
    setDialogOpen(true);
  };

  const filteredScripts = scripts.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const matchName = s.name.toLowerCase().includes(q);
    const matchDesc = (s.description || '').toLowerCase().includes(q);
    const matchSoftware = (s.softwares || []).some((sw) => sw.name.toLowerCase().includes(q));
    return matchName || matchDesc || matchSoftware;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Code2 className="h-6 w-6 text-primary" />
            脚本管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            配置授权验证封签前执行的动态 JavaScript 钩子脚本，支持改写返回载荷与前置阻断
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchScripts(true)}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button size="sm" onClick={handleCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            新建脚本
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <CardTitle className="text-base">动态脚本列表</CardTitle>
              <CardDescription className="text-xs">
                共 {scripts.length} 个钩子脚本，已过滤出 {filteredScripts.length} 项
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="搜索脚本名称、描述或软件..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ScriptsTable
            scripts={filteredScripts}
            loading={loading}
            onEdit={handleEdit}
            onRefresh={() => fetchScripts(false)}
          />
        </CardContent>
      </Card>

      <ScriptDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        scriptToEdit={scriptToEdit}
        onSuccess={() => fetchScripts(false)}
      />
    </div>
  );
}
