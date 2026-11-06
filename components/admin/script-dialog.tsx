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
import { Loader2, Code2, ShieldAlert, Sparkles } from 'lucide-react';
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
                <TabsContent value="editor" className="space-y-3 mt-0 focus-visible:outline-none flex flex-col h-full">
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
                        <Badge variant="outline" className="text-[10px] font-mono py-0 h-4">Node.js vm (50ms)</Badge>
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

                <TabsContent value="bindings" className="space-y-4 mt-0 focus-visible:outline-none">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">应用至以下软件</Label>
                      <span className="text-[10px] text-muted-foreground">已选择 {selectedSoftwareIds.length} 个软件</span>
                    </div>
                    <div className="border rounded-md p-3 max-h-[220px] overflow-y-auto space-y-2 bg-muted/10">
                      {availableSoftwares.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-4 text-center">暂无可用的软件</p>
                      ) : (
                        availableSoftwares.map((sw) => {
                          const checked = selectedSoftwareIds.includes(sw.id);
                          return (
                            <label
                              key={sw.id}
                              className="flex items-center space-x-2.5 p-1.5 rounded hover:bg-muted/40 cursor-pointer text-xs"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleSoftware(sw.id)}
                                disabled={isSubmitting}
                              />
                              <span className="font-medium text-foreground">{sw.name}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-2.5 bg-muted/20">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-medium">启用此脚本</Label>
                      <p className="text-[10px] text-muted-foreground">
                        禁用后，关联该脚本的所有软件在验证时将跳过此钩子
                      </p>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={setEnabled}
                      disabled={isSubmitting}
                    />
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
