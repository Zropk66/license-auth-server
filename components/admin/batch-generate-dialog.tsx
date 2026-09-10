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

  useEffect(() => {
    if (!open) {
      setGeneratedKeys([]);
      return;
    }

    /* 加载可选软件列表与用户列表 */
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
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            批量制卡
          </DialogTitle>
          <DialogDescription>
            快速生成多张授权卡密，支持自定义前缀、时长模式与设备绑定策略。
          </DialogDescription>
        </DialogHeader>

        {generatedKeys.length > 0 ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <div className="text-sm font-medium">
                制卡完成！已成功生成 {generatedKeys.length} 张卡密。
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>卡密清单（每行一张）</span>
                <span>共 {generatedKeys.length} 行</span>
              </div>
              <Textarea
                readOnly
                value={generatedKeys.join('\n')}
                rows={10}
                className="font-mono text-xs select-all bg-muted/30"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyAll} className="gap-1.5">
                  <Copy className="h-4 w-4" />
                  一键复制全部
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadTxt} className="gap-1.5">
                  <Download className="h-4 w-4" />
                  下载为 TXT 文件
                </Button>
              </div>
              <Button onClick={() => onOpenChange(false)}>
                完成
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleGenerate} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="software">所属软件 *</Label>
                <Select value={softwareName} onValueChange={setSoftwareName}>
                  <SelectTrigger id="software">
                    <SelectValue placeholder="选择软件" />
                  </SelectTrigger>
                  <SelectContent>
                    {softwares.map((sw) => (
                      <SelectItem key={sw.id} value={sw.name}>
                        {sw.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="count">制卡张数 (1-500) *</Label>
                <Input
                  id="count"
                  type="number"
                  min={1}
                  max={500}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prefix">卡密自定义前缀 (可选)</Label>
                <Input
                  id="prefix"
                  placeholder="例如 VIP- 或 PRO-"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  maxLength={20}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="user">绑定用户 (可选)</Label>
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger id="user">
                    <SelectValue placeholder="选择绑定用户" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">自动分配默认匿名用户</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-3.5 bg-muted/20">
              <Label className="text-sm font-medium">授权类型</Label>
              <RadioGroup
                value={licenseType}
                onValueChange={(v) => setLicenseType(v as 'fixed' | 'duration')}
                className="grid grid-cols-2 gap-3"
              >
                <div className="flex items-center space-x-2 border rounded-md p-2.5 bg-card cursor-pointer">
                  <RadioGroupItem value="duration" id="type-duration" />
                  <Label htmlFor="type-duration" className="cursor-pointer text-xs">
                    时长卡 (首次激活开始计时)
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-md p-2.5 bg-card cursor-pointer">
                  <RadioGroupItem value="fixed" id="type-fixed" />
                  <Label htmlFor="type-fixed" className="cursor-pointer text-xs">
                    固定到期时间卡 (即时生效)
                  </Label>
                </div>
              </RadioGroup>

              {licenseType === 'duration' ? (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs">有效时长</Label>
                    <Input
                      type="number"
                      min={1}
                      value={durationValue}
                      onChange={(e) => setDurationValue(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">时长单位</Label>
                    <Select
                      value={durationUnit}
                      onValueChange={(v) => setDurationUnit(v as 'minutes' | 'hours' | 'days')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minutes">分钟</SelectItem>
                        <SelectItem value="hours">小时</SelectItem>
                        <SelectItem value="days">天</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 pt-1">
                  <Label className="text-xs">固定过期时间</Label>
                  <Input
                    type="text"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    placeholder="YYYY-MM-DD HH:mm:ss"
                  />
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border p-3.5 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">启用硬件设备绑定</Label>
                  <p className="text-xs text-muted-foreground">
                    开启后首次激活设备将锁定 HWID，防止多机共享
                  </p>
                </div>
                <Switch
                  checked={hardwareBindingEnabled}
                  onCheckedChange={setHardwareBindingEnabled}
                />
              </div>

              <div className="flex items-center justify-between border-t pt-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">允许用户自主换绑</Label>
                  <p className="text-xs text-muted-foreground">
                    允许客户端用户自行在授权中心解除设备绑定
                  </p>
                </div>
                <Switch
                  checked={allowSelfUnbind}
                  onCheckedChange={setAllowSelfUnbind}
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={loading} className="gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                立即生成 {count} 张卡密
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
