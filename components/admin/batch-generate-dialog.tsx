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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Copy, Download, CheckCircle2, Layers } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface BatchGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type Software = {
  id: string;
  name: string;
};

type User = {
  id: string;
  username: string;
};

export default function BatchGenerateDialog({
  open,
  onOpenChange,
  onSuccess,
}: BatchGenerateDialogProps) {
  const { toast } = useToast();
  const [softwares, setSoftwares] = useState<Software[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<string[]>([]);

  const [softwareName, setSoftwareName] = useState('');
  const [count, setCount] = useState(10);
  const [prefix, setPrefix] = useState('');
  const [licenseType, setLicenseType] = useState<'fixed' | 'duration'>('duration');
  const [durationValue, setDurationValue] = useState(30);
  const [durationUnit, setDurationUnit] = useState<'minutes' | 'hours' | 'days'>('days');
  const [expirationDate, setExpirationDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return format(d, 'yyyy-MM-dd HH:mm:ss');
  });
  const [hardwareBindingEnabled, setHardwareBindingEnabled] = useState(true);
  const [allowSelfUnbind, setAllowSelfUnbind] = useState(true);
  const [userId, setUserId] = useState<string>('default');
  const [customPayload, setCustomPayload] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) {
      setGeneratedKeys([]);
      return;
    }

    fetch('/api/admin/softwares')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setSoftwares(data);
          if (data.length > 0 && !softwareName) {
            setSoftwareName(data[0].name);
          }
        }
      })
      .catch(() => {});

    fetch('/api/admin/users')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setUsers(data);
        }
      })
      .catch(() => {});
  }, [open]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!softwareName) {
      toast({ title: '提示', description: '请选择所属软件', variant: 'destructive' });
      return;
    }

    if (count < 1 || count > 500) {
      toast({ title: '提示', description: '制卡数量需在 1 到 500 之间', variant: 'destructive' });
      return;
    }

    let calculatedDuration: number | undefined;
    if (licenseType === 'duration') {
      if (durationUnit === 'days') calculatedDuration = durationValue * 24 * 60;
      else if (durationUnit === 'hours') calculatedDuration = durationValue * 60;
      else calculatedDuration = durationValue;
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        softwareName,
        count: Number(count),
        prefix: prefix ? prefix.trim() : undefined,
        licenseType,
        hardwareBindingEnabled,
        allowSelfUnbind,
        customPayload: customPayload.trim() || undefined,
        note: note ? note.trim() : undefined,
      };

      if (userId && userId !== 'default') {
        payload.userId = userId;
      }

      if (licenseType === 'duration') {
        payload.duration = calculatedDuration;
      } else {
        payload.expirationDate = expirationDate;
      }

      const res = await fetch('/api/admin/licenses/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '批量制卡失败');
      }

      setGeneratedKeys(data.licenseKeys || []);
      toast({
        title: '制卡成功',
        description: `已成功生成 ${data.count} 张卡密`,
      });
      onSuccess();
    } catch (err: any) {
      toast({
        title: '制卡失败',
        description: err.message || '网络请求错误',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAll = () => {
    if (generatedKeys.length === 0) return;
    navigator.clipboard.writeText(generatedKeys.join('\n'));
    toast({
      title: '复制成功',
      description: `已复制 ${generatedKeys.length} 个卡密到剪贴板`,
    });
  };

  const handleDownloadTxt = () => {
    if (generatedKeys.length === 0) return;
    const content = generatedKeys.join('\r\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `licenses_${softwareName}_${format(new Date(), 'yyyyMMdd_HHmmss')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[740px] p-0 flex flex-col gap-0 overflow-hidden shadow-2xl border-border/60">
        <DialogHeader className="p-6 pb-4 border-b border-border/50 shrink-0 bg-background/95">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <DialogTitle className="text-lg font-semibold">批量制卡</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            快速批量生成授权卡密，支持自定义前缀、时长模式与设备绑定安全策略。
          </DialogDescription>
        </DialogHeader>

        {generatedKeys.length > 0 ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="p-6 h-[360px] flex flex-col gap-3 justify-between">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20 shrink-0">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <div className="text-xs font-medium">
                  制卡完成！已成功生成 {generatedKeys.length} 张卡密。
                </div>
              </div>

              <div className="flex-1 flex flex-col min-h-0 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground shrink-0">
                  <span>卡密清单（每行一张）</span>
                  <span>共 {generatedKeys.length} 行</span>
                </div>
                <Textarea
                  readOnly
                  value={generatedKeys.join('\n')}
                  className="font-mono text-xs select-all bg-muted/20 resize-none flex-1 leading-relaxed"
                />
              </div>
            </div>

            <DialogFooter className="p-4 px-6 border-t border-border/50 bg-muted/30 shrink-0 flex items-center justify-between">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyAll} className="gap-1.5 h-9 text-xs">
                  <Copy className="h-3.5 w-3.5" />
                  一键复制全部
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadTxt} className="gap-1.5 h-9 text-xs">
                  <Download className="h-3.5 w-3.5" />
                  下载 TXT 文件
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setGeneratedKeys([])} className="h-9 text-xs">
                  继续制卡
                </Button>
                <Button size="sm" onClick={() => onOpenChange(false)} className="h-9 text-xs">
                  完成
                </Button>
              </div>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleGenerate} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-6">
              <Tabs defaultValue="basic" className="w-full flex flex-col">
                <TabsList className="grid w-full grid-cols-2 mb-4 bg-muted/60 p-1 shrink-0">
                  <TabsTrigger value="basic" className="text-xs font-medium">制卡归属与安全策略</TabsTrigger>
                  <TabsTrigger value="policy" className="text-xs font-medium">时长模式与专属载荷</TabsTrigger>
                </TabsList>

                <div className="h-[360px] overflow-y-auto pr-1 [scrollbar-gutter:stable]">
                  <TabsContent value="basic" className="space-y-4 mt-0 focus-visible:outline-none">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">所属软件 <span className="text-destructive">*</span></Label>
                        <Select value={softwareName} onValueChange={setSoftwareName}>
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="选择所属软件" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL" className="font-medium text-primary text-xs">
                              全部软件 (通用授权 / ALL)
                            </SelectItem>
                            {softwares.map((sw) => (
                              <SelectItem key={sw.id} value={sw.name} className="text-xs">
                                {sw.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">该批卡密绑定的目标客户端软件</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">制卡张数 (1-500) <span className="text-destructive">*</span></Label>
                        <Input
                          type="number"
                          min={1}
                          max={500}
                          value={count}
                          onChange={(e) => setCount(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                          required
                          className="h-9 text-sm font-mono"
                        />
                        <p className="text-[11px] text-muted-foreground">单次批量生成的卡密总数量</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">卡密自定义前缀 (选填)</Label>
                        <Input
                          placeholder="例如 VIP- 或 PRO-"
                          value={prefix}
                          onChange={(e) => setPrefix(e.target.value)}
                          maxLength={20}
                          className="h-9 text-sm font-mono"
                        />
                        <p className="text-[11px] text-muted-foreground">生成的卡密将以此文本作为前缀标识</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">绑定用户 (选填)</Label>
                        <Select value={userId} onValueChange={setUserId}>
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="选择绑定用户" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default" className="text-xs">自动分配默认匿名用户</SelectItem>
                            {users.map((u) => (
                              <SelectItem key={u.id} value={u.id} className="text-xs">
                                {u.username}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">归属的用户账户（留空为自动创建）</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center justify-between border rounded-lg p-3 bg-muted/10">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">硬件设备绑定</Label>
                          <p className="text-xs text-muted-foreground">首次激活锁定 HWID 防多开共享</p>
                        </div>
                        <Switch
                          checked={hardwareBindingEnabled}
                          onCheckedChange={setHardwareBindingEnabled}
                        />
                      </div>

                      <div className="flex items-center justify-between border rounded-lg p-3 bg-muted/10">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">允许自主换绑</Label>
                          <p className="text-xs text-muted-foreground">允许用户在用户后台自助解绑设备</p>
                        </div>
                        <Switch
                          checked={allowSelfUnbind}
                          onCheckedChange={setAllowSelfUnbind}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">批次备注 (选填)</Label>
                      <Input
                        placeholder="例如: 2026代理分销第1批"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={500}
                        className="h-9 text-sm"
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="policy" className="space-y-4 mt-0 focus-visible:outline-none">
                    <div className="space-y-2 rounded-lg border p-3.5 bg-muted/15">
                      <Label className="text-xs font-medium">授权时效模式</Label>
                      <RadioGroup
                        value={licenseType}
                        onValueChange={(v) => setLicenseType(v as 'fixed' | 'duration')}
                        className="grid grid-cols-2 gap-3 pt-1"
                      >
                        <div className="flex items-center space-x-2 border rounded-md p-2.5 bg-card cursor-pointer">
                          <RadioGroupItem value="duration" id="batch-type-duration" />
                          <Label htmlFor="batch-type-duration" className="cursor-pointer text-xs">
                            时长卡 (首次激活开始倒计时)
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2 border rounded-md p-2.5 bg-card cursor-pointer">
                          <RadioGroupItem value="fixed" id="batch-type-fixed" />
                          <Label htmlFor="batch-type-fixed" className="cursor-pointer text-xs">
                            固定到期时间卡 (即时生效)
                          </Label>
                        </div>
                      </RadioGroup>

                      {licenseType === 'duration' ? (
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs">有效时长</Label>
                            <Input
                              type="number"
                              min={1}
                              value={durationValue}
                              onChange={(e) => setDurationValue(Math.max(1, parseInt(e.target.value) || 1))}
                              className="h-9 text-sm font-mono"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">时长单位</Label>
                            <Select
                              value={durationUnit}
                              onValueChange={(v) => setDurationUnit(v as 'minutes' | 'hours' | 'days')}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="minutes" className="text-xs">分钟</SelectItem>
                                <SelectItem value="hours" className="text-xs">小时</SelectItem>
                                <SelectItem value="days" className="text-xs">天</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5 pt-2">
                          <Label className="text-xs">固定过期时间</Label>
                          <Input
                            type="text"
                            value={expirationDate}
                            onChange={(e) => setExpirationDate(e.target.value)}
                            placeholder="YYYY-MM-DD HH:mm:ss"
                            className="h-9 text-sm font-mono"
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">批量专属自定义载荷 / JSON (选填)</Label>
                        <span className="text-[11px] text-muted-foreground">继承或覆盖所属软件载荷</span>
                      </div>
                      <Textarea
                        placeholder='{\n  "hook_rva": "0x1A42E0",\n  "batch_tier": "vip"\n}'
                        value={customPayload}
                        onChange={(e) => setCustomPayload(e.target.value)}
                        rows={4}
                        className="font-mono text-xs resize-none bg-muted/10 leading-relaxed"
                      />
                      <div className="rounded-md bg-muted/30 p-2.5 text-[11px] text-muted-foreground leading-normal border border-border/40">
                        <p className="font-medium text-foreground mb-0.5">载荷说明：</p>
                        <p>• 留空时该批卡密自动继承所属软件的默认载荷。</p>
                        <p>• 填入内容后将对这批卡密统一分发，优先于软件全局默认配置生效。</p>
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>

            <DialogFooter className="p-4 px-6 border-t border-border/50 bg-muted/30 shrink-0 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="h-9">
                取消
              </Button>
              <Button type="submit" disabled={loading} className="h-9 gap-1.5">
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    正在生成...
                  </>
                ) : (
                  `立即生成 ${count} 张卡密`
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
