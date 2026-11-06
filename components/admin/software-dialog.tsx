'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface SoftwareItem {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  enabled: boolean;
  minVersionCode?: number | null;
  maxVersionCode?: number | null;
  customPayload?: string | null;
  hookScriptId?: string | null;
  hookScript?: string | null;
  licenseCount?: number;
  versionCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface SoftwareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  software?: SoftwareItem | null;
  onSuccess: () => void;
}

export default function SoftwareDialog({
  open,
  onOpenChange,
  software,
  onSuccess,
}: SoftwareDialogProps) {
  const { toast } = useToast();
  const isEdit = Boolean(software);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [minVersionCode, setMinVersionCode] = useState<string>('0');
  const [maxVersionCode, setMaxVersionCode] = useState<string>('');
  const [customPayload, setCustomPayload] = useState('');
  const [hookScriptId, setHookScriptId] = useState<string>('none');
  const [hookScript, setHookScript] = useState('');
  const [availableScripts, setAvailableScripts] = useState<Array<{ id: string; name: string }>>([]);
  const [enabled, setEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    fetch('/api/admin/scripts')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setAvailableScripts(data.map((s: any) => ({ id: s.id, name: s.name })));
        }
      })
      .catch(() => {});

    if (software) {
      setName(software.name || '');
      setCode(software.code || '');
      setDescription(software.description || '');
      setMinVersionCode(software.minVersionCode != null ? String(software.minVersionCode) : '0');
      setMaxVersionCode(software.maxVersionCode != null ? String(software.maxVersionCode) : '');
      setCustomPayload(software.customPayload || '');
      setHookScriptId(software.hookScriptId || 'none');
      setHookScript(software.hookScript || '');
      setEnabled(software.enabled ?? true);
    } else {
      setName('');
      setCode('');
      setDescription('');
      setMinVersionCode('0');
      setMaxVersionCode('');
      setCustomPayload('');
      setHookScriptId('none');
      setHookScript('');
      setEnabled(true);
    }
  }, [open, software]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({
        title: '错误',
        description: '请输入软件名称',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const parsedMin = minVersionCode.trim() !== '' ? parseInt(minVersionCode, 10) : 0;
      const parsedMax = maxVersionCode.trim() !== '' ? parseInt(maxVersionCode, 10) : null;

      const payload = {
        name: name.trim(),
        code: code.trim() || null,
        description: description.trim() || null,
        minVersionCode: isNaN(parsedMin) ? 0 : parsedMin,
        maxVersionCode: parsedMax !== null && !isNaN(parsedMax) ? parsedMax : null,
        customPayload: customPayload.trim() || null,
        hookScriptId: hookScriptId === 'none' ? null : (hookScriptId || null),
        hookScript: hookScript.trim() || null,
        enabled,
      };

      const url = isEdit && software ? `/api/admin/softwares/${software.id}` : '/api/admin/softwares';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (isEdit ? '更新软件失败' : '创建软件失败'));
      }

      toast({
        title: isEdit ? '更新成功' : '创建成功',
        description: isEdit
          ? `已成功更新软件「${data.name}」`
          : `已成功创建软件「${data.name}」`,
      });

      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({
        title: '错误',
        description: err.message || '操作失败',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 flex flex-col gap-0 overflow-hidden shadow-2xl border-border/60">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <DialogHeader className="p-5 pb-3 border-b border-border/50 shrink-0 bg-background/95">
            <DialogTitle className="text-base font-semibold">{isEdit ? '编辑软件' : '添加软件'}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              {isEdit
                ? '修改软件基础元数据、版本限制策略与扩展载荷。'
                : '配置软件基础信息、版本控制策略与封签动态载荷。'}
            </DialogDescription>
          </DialogHeader>

          <div className="p-5 py-3">
            <Tabs defaultValue="basic" className="w-full flex flex-col">
              <TabsList className="grid w-full grid-cols-2 mb-3 bg-muted/60 p-1 shrink-0">
                <TabsTrigger value="basic" className="text-xs font-medium">基本配置</TabsTrigger>
                <TabsTrigger value="advanced" className="text-xs font-medium">扩展载荷</TabsTrigger>
              </TabsList>

              <div className="overflow-y-auto pr-1 max-h-[65vh] [scrollbar-gutter:stable]">
                <TabsContent value="basic" className="space-y-3 mt-0 focus-visible:outline-none">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">软件名称 <span className="text-destructive">*</span></Label>
                      <Input
                        placeholder="例如: Photoshop-Plugin"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={isSubmitting}
                        required
                        className="h-8 text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground">客户端验证匹配的 <code>softwareName</code></p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">软件标识代码（可选）</Label>
                      <Input
                        placeholder="例如: PS-PLG"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        disabled={isSubmitting}
                        className="h-8 text-xs font-mono"
                      />
                      <p className="text-[10px] text-muted-foreground">简写代号，便于后台分类检索</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">最低允许版本</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={minVersionCode}
                        onChange={(e) => setMinVersionCode(e.target.value)}
                        disabled={isSubmitting}
                        className="h-8 text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground">低于此版本直接拦截提示过期</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">最高允许版本（可选）</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="留空不限制"
                        value={maxVersionCode}
                        onChange={(e) => setMaxVersionCode(e.target.value)}
                        disabled={isSubmitting}
                        className="h-8 text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground">高于此版本提示已过期</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">绑定动态脚本（可选）</Label>
                    <Select
                      value={hookScriptId}
                      onValueChange={setHookScriptId}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="选择关联的动态钩子脚本" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs">
                          不绑定脚本（无）
                        </SelectItem>
                        {availableScripts.map((s) => (
                          <SelectItem key={s.id} value={s.id} className="text-xs">
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      授权验证封签前执行该脚本，可动态改写载荷或前置拦截
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">详细描述（可选）</Label>
                    <Textarea
                      placeholder="输入该软件的用途、适用客户或备注说明..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={isSubmitting}
                      rows={2}
                      className="text-xs resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-2.5 bg-muted/20">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-medium">启用此软件</Label>
                      <p className="text-[10px] text-muted-foreground">
                        禁用后，该软件下的所有授权验证将被直接拒绝
                      </p>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={setEnabled}
                      disabled={isSubmitting}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="advanced" className="space-y-3 mt-0 focus-visible:outline-none">
                  <div className="space-y-1.5 flex flex-col">
                    <Label className="text-xs font-medium">软件级自定义数据载荷</Label>
                    <Textarea
                      placeholder={`{\n  "feature_flags": ["pro", "ai_toolkit"],\n  "max_concurrency": 5\n}`}
                      value={customPayload}
                      onChange={(e) => setCustomPayload(e.target.value)}
                      disabled={isSubmitting}
                      className="font-mono text-xs resize-none h-[230px] leading-relaxed"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      合法 JSON。客户端验证成功后将封装进防篡改签名封签返回。
                    </p>
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
              {isEdit ? '保存修改' : '确认添加'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
