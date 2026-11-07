'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Code2, ShieldAlert, Sparkles, Layers } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface HookScriptItem {
  id: string;
  name: string;
  description?: string | null;
  script: string;
  enabled: boolean;
  softwares?: Array<{ id: string; name: string }>;
  createdAt: string;
  updatedAt: string;
}

interface ScriptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scriptToEdit?: HookScriptItem | null;
  onSuccess: () => void;
}

const DEFAULT_SCRIPT_TEMPLATE = `// 动态钩子脚本沙箱执行环境
// 可用参数: req (只读请求上下文), payload (读写下发载荷), reject(reason) (拒绝授权)
// 示例: 依据卡密或协议下发自定义动态数据
if (req.protocol === 'veil') {
  payload.securityLevel = 'high';
}

// 依据版本号动态开启特定功能开关
if (req.versionCode && req.versionCode >= 100) {
  payload.features = ['advanced_toolkit', 'cloud_sync'];
}
`;

export default function ScriptDialog({
  open,
  onOpenChange,
  scriptToEdit,
  onSuccess,
}: ScriptDialogProps) {
  const { toast } = useToast();
  const isEdit = Boolean(scriptToEdit?.id);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [script, setScript] = useState(DEFAULT_SCRIPT_TEMPLATE);
  const [enabled, setEnabled] = useState(true);
  const [selectedSoftwareIds, setSelectedSoftwareIds] = useState<string[]>([]);
  const [availableSoftwares, setAvailableSoftwares] = useState<Array<{ id: string; name: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    fetch('/api/admin/softwares')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setAvailableSoftwares(data.map((s: any) => ({ id: s.id, name: s.name })));
        }
      })
      .catch(() => {});

    if (scriptToEdit) {
      setName(scriptToEdit.name || '');
      setDescription(scriptToEdit.description || '');
      setScript(scriptToEdit.script || DEFAULT_SCRIPT_TEMPLATE);
      setEnabled(scriptToEdit.enabled ?? true);
      setSelectedSoftwareIds(scriptToEdit.softwares ? scriptToEdit.softwares.map((s) => s.id) : []);
    } else {
      setName('');
      setDescription('');
      setScript(DEFAULT_SCRIPT_TEMPLATE);
      setEnabled(true);
      setSelectedSoftwareIds([]);
    }
  }, [open, scriptToEdit]);

  const toggleSoftware = (id: string) => {
    setSelectedSoftwareIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllSoftwares = () => {
    setSelectedSoftwareIds(availableSoftwares.map((sw) => sw.id));
  };

  const handleClearSoftwares = () => {
    setSelectedSoftwareIds([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({
        title: '错误',
        description: '请输入脚本名称',
        variant: 'destructive',
      });
      return;
    }

    if (!script.trim()) {
      toast({
        title: '错误',
        description: '请输入脚本代码',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        script: script.trim(),
        enabled,
        softwareIds: selectedSoftwareIds,
      };

      const url = isEdit && scriptToEdit ? `/api/admin/scripts/${scriptToEdit.id}` : '/api/admin/scripts';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (isEdit ? '更新脚本失败' : '创建脚本失败'));
      }

      toast({
        title: isEdit ? '更新成功' : '创建成功',
        description: `已成功保存脚本「${data.name}」`,
      });

      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '操作失败';
      toast({
        title: '错误',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] p-0 flex flex-col gap-0 overflow-hidden shadow-2xl border-border/60">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <DialogHeader className="p-5 pb-3 border-b border-border/50 shrink-0 bg-background/95">
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Code2 className="h-4 w-4 text-primary" />
              {isEdit ? '编辑动态脚本' : '创建动态脚本'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              脚本在验证流程签名封签前执行，可安全修改返回载荷或实行业务拦截。
            </DialogDescription>
          </DialogHeader>

          <div className="p-5 py-3">
            <Tabs defaultValue="editor" className="w-full flex flex-col">
              <TabsList className="grid w-full grid-cols-2 mb-3 bg-muted/60 p-1 shrink-0">
                <TabsTrigger value="editor" className="text-xs font-medium">代码编辑</TabsTrigger>
                <TabsTrigger value="bindings" className="text-xs font-medium">关联软件与属性</TabsTrigger>
              </TabsList>

              <div className="h-[360px] overflow-y-auto px-1.5 [scrollbar-gutter:stable]">
                <TabsContent value="editor" className="space-y-3 mt-0 focus-visible:outline-none data-[state=active]:flex data-[state=inactive]:hidden flex-col h-full">
                  <div className="grid grid-cols-2 gap-3 shrink-0">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">脚本名称 <span className="text-destructive">*</span></Label>
                      <Input
                        placeholder="例如: 基础功能注入脚本"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={isSubmitting}
                        required
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">简要描述（可选）</Label>
                      <Input
                        placeholder="例如: 注入全局配置与测试特征"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={isSubmitting}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 flex-1 flex flex-col min-h-0">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <span>JavaScript 代码</span>
                        <Badge variant="outline" className="text-[10px] font-mono py-0 h-4">WASM QuickJS (50ms, 8MB)</Badge>
                      </Label>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        req | payload | reject(reason)
                      </span>
                    </div>
                    <Textarea
                      value={script}
                      onChange={(e) => setScript(e.target.value)}
                      disabled={isSubmitting}
                      className="font-mono text-xs resize-none flex-1 leading-relaxed bg-muted/30 focus-visible:bg-background border-border/80"
                      rows={12}
                      spellCheck={false}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="bindings" className="mt-0 focus-visible:outline-none data-[state=active]:block data-[state=inactive]:hidden h-full">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 h-full">
                    {/* 左侧：关联软件 */}
                    <div className="flex flex-col h-full min-h-0 space-y-2">
                      <div className="flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-primary" />
                          <Label className="text-xs font-medium">应用至以下软件</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          {availableSoftwares.length > 0 && (
                            <div className="flex items-center gap-1 text-[11px]">
                              <button
                                type="button"
                                onClick={handleSelectAllSoftwares}
                                disabled={isSubmitting || selectedSoftwareIds.length === availableSoftwares.length}
                                className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline cursor-pointer disabled:cursor-not-allowed"
                              >
                                全选
                              </button>
                              <span className="text-muted-foreground/40">|</span>
                              <button
                                type="button"
                                onClick={handleClearSoftwares}
                                disabled={isSubmitting || selectedSoftwareIds.length === 0}
                                className="text-muted-foreground hover:text-foreground hover:underline disabled:text-muted-foreground/40 disabled:no-underline cursor-pointer disabled:cursor-not-allowed"
                              >
                                清空
                              </button>
                            </div>
                          )}
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 tabular-nums">
                            已选 {selectedSoftwareIds.length}/{availableSoftwares.length}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex-1 min-h-0 border rounded-md p-2 overflow-y-auto space-y-1.5 bg-muted/10 [scrollbar-gutter:stable]">
                        {availableSoftwares.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-center py-6 px-4">
                            <Layers className="h-6 w-6 text-muted-foreground/40 mb-1.5" />
                            <p className="text-xs text-muted-foreground">暂无可用的软件</p>
                            <p className="text-[10px] text-muted-foreground/70 mt-0.5">请先在软件管理中创建软件</p>
                          </div>
                        ) : (
                          availableSoftwares.map((sw) => {
                            const checked = selectedSoftwareIds.includes(sw.id);
                            return (
                              <label
                                key={sw.id}
                                className={`flex items-center space-x-2.5 p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                                  checked
                                    ? 'border-primary/30 bg-primary/5 text-foreground'
                                    : 'border-border/40 hover:bg-muted/40 hover:border-border/80 text-muted-foreground'
                                }`}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => toggleSoftware(sw.id)}
                                  disabled={isSubmitting}
                                />
                                <span className="font-medium flex-1 truncate text-foreground">{sw.name}</span>
                                {checked && (
                                  <span className="text-[10px] font-mono text-primary/80 shrink-0">已绑定</span>
                                )}
                              </label>
                            );
                          })
                        )}
                      </div>

                      <p className="text-[10px] text-muted-foreground shrink-0 leading-tight">
                        仅勾选的软件在进行授权验证时会触发此动态脚本。
                      </p>
                    </div>

                    {/* 右侧：脚本属性与沙箱约束 */}
                    <div className="flex flex-col h-full min-h-0 space-y-2.5 justify-between">
                      {/* 运行状态卡片 */}
                      <div className="rounded-lg border p-2.5 bg-muted/20 flex items-center justify-between shrink-0">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs font-medium">启用此脚本</Label>
                            <Badge
                              variant={enabled ? 'default' : 'outline'}
                              className="text-[10px] py-0 px-1.5 h-4"
                            >
                              {enabled ? '运行中' : '已暂停'}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            禁用后关联软件在验证时将跳过此钩子
                          </p>
                        </div>
                        <Switch
                          checked={enabled}
                          onCheckedChange={setEnabled}
                          disabled={isSubmitting}
                        />
                      </div>

                      {/* WASM 沙箱运行属性 */}
                      <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-2 flex-1 flex flex-col justify-between">
                        <div className="flex items-center justify-between shrink-0">
                          <div className="flex items-center gap-1.5">
                            <ShieldAlert className="h-3.5 w-3.5 text-primary" />
                            <span className="text-xs font-medium">沙箱执行属性</span>
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 font-normal text-muted-foreground border-border/80">
                              内核只读
                            </Badge>
                          </div>
                          <Badge variant="outline" className="text-[10px] font-mono py-0 h-4 bg-background">
                            QuickJS WASM
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="rounded border border-border/40 p-1.5 bg-background/50">
                            <span className="text-muted-foreground block text-[10px]">超时硬限制</span>
                            <span className="font-mono font-medium text-foreground">50 ms 熔断</span>
                          </div>
                          <div className="rounded border border-border/40 p-1.5 bg-background/50">
                            <span className="text-muted-foreground block text-[10px]">内存配额</span>
                            <span className="font-mono font-medium text-foreground">8 MB 限制</span>
                          </div>
                          <div className="rounded border border-border/40 p-1.5 bg-background/50">
                            <span className="text-muted-foreground block text-[10px]">隔离机制</span>
                            <span className="font-mono font-medium text-foreground">独立 WASM 实例</span>
                          </div>
                          <div className="rounded border border-border/40 p-1.5 bg-background/50">
                            <span className="text-muted-foreground block text-[10px]">执行时机</span>
                            <span className="font-medium text-foreground">前置签名修饰</span>
                          </div>
                        </div>

                        {/* 参数与安全说明 */}
                        <div className="rounded border border-border/40 p-2 bg-background/60 space-y-1 shrink-0 text-[10px]">
                          <div className="flex items-center gap-1 text-muted-foreground font-medium">
                            <Sparkles className="h-3 w-3 text-primary/80" />
                            <span>可用上下文参数</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1 font-mono text-[10px]">
                            <div className="truncate"><span className="text-primary font-semibold">req</span>: 只读请求</div>
                            <div className="truncate"><span className="text-primary font-semibold">payload</span>: 读写载荷</div>
                            <div className="truncate"><span className="text-primary font-semibold">reject()</span>: 拒绝</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>

          <DialogFooter className="p-3 px-5 border-t border-border/50 bg-muted/30 shrink-0 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? '保存修改' : '确认创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
