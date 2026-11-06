'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2, Copy } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export interface BlacklistEntry {
  id: string;
  type: string;
  value: string;
  reason: string | null;
  isAuto: boolean;
  expiresAt: string | null;
  createdAt: string;
}

interface AddBlacklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  entryToEdit?: BlacklistEntry | null;
}

/* 由天数选项推导 Select 值；不匹配的剩余秒数归入 custom */
function daysToDuration(expiresAt: string | null): string {
  if (!expiresAt) return '0';
  const remainingDays = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  return ['1', '7', '30', '90'].includes(String(remainingDays)) ? String(remainingDays) : '0';
}

export default function AddBlacklistDialog({
  open,
  onOpenChange,
  onSuccess,
  entryToEdit,
}: AddBlacklistDialogProps) {
  const { toast } = useToast();
  /* entryToEdit 有 id 为编辑既有条目；无 id 为快捷拉黑预填创建，目标仍可修改 */
  const isEdit = Boolean(entryToEdit?.id);

  const [type, setType] = useState<'ip' | 'hwid'>('ip');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('0'); // 0 = 永久, custom = 自定义到期
  const [customExpiry, setCustomExpiry] = useState<Date | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (entryToEdit) {
      setType(entryToEdit.type as 'ip' | 'hwid');
      setValue(entryToEdit.value);
      setReason(entryToEdit.reason || '');
      setDuration(daysToDuration(entryToEdit.expiresAt));
    } else {
      setType('ip');
      setValue('');
      setReason('');
      setDuration('0');
    }
  }, [open, entryToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEdit && !value.trim()) {
      toast({
        title: '错误',
        description: '请输入封禁目标值',
        variant: 'destructive',
      });
      return;
    }

    let customAtIso: string | null = null;
    if (duration === 'custom') {
      if (!customExpiry || customExpiry.getTime() <= Date.now()) {
        toast({
          title: '自定义到期时间无效',
          description: '请选择一个未来的时间点',
          variant: 'destructive',
        });
        return;
      }
      customAtIso = customExpiry.toISOString();
    }

    setIsSubmitting(true);
    try {
      const url = isEdit ? '/api/admin/blacklist/update' : '/api/admin/blacklist';
      const days = duration === 'custom' ? 0 : parseInt(duration, 10);
      const payload = isEdit
        ? {
            id: entryToEdit!.id,
            reason: reason.trim() || '管理员手动封禁',
            days,
            customAt: customAtIso,
          }
        : {
            type,
            value: value.trim(),
            reason: reason.trim() || '管理员手动封禁',
            days,
            customAt: customAtIso,
          };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (isEdit ? '更新黑名单失败' : '添加黑名单失败'));
      }

      toast({
        title: isEdit ? '已更新' : '成功',
        description: isEdit
          ? `已更新 [${entryToEdit!.value.length > 28 ? `${entryToEdit!.value.slice(0, 16)}...${entryToEdit!.value.slice(-8)}` : entryToEdit!.value}] 的封禁配置`
          : `已成功将 ${value.length > 28 ? `${value.slice(0, 16)}...${value.slice(-8)}` : value} 加入黑名单`,
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
      <DialogContent className="sm:max-w-[450px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? '编辑封禁条目' : '添加黑名单封禁'}</DialogTitle>
            <DialogDescription className="break-all">
              {isEdit
                ? `调整 [${entryToEdit && entryToEdit.value.length > 28 ? `${entryToEdit.value.slice(0, 16)}...${entryToEdit.value.slice(-8)}` : entryToEdit?.value}] 的封禁原因与过期时间，封禁目标不可修改。`
                : '封禁指定的 IP 地址或机器码 (HWID)，被封禁目标将无法请求验证与登录。'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>封禁类型</Label>
              <Select value={type} onValueChange={(val: any) => setType(val)} disabled={isEdit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ip">IP 地址 (IPv4 / IPv6)</SelectItem>
                  <SelectItem value="hwid">HWID 机器码</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>{type === 'ip' ? 'IP 地址 / 网段' : 'HWID 特征码'}</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  placeholder={type === 'ip' ? '例如 1.2.3.4 或 1.2.3.0/24 或 1.2.*.*' : '例如 HW-A1B2C3D4'}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  disabled={isSubmitting || isEdit}
                  required
                  className="font-mono text-xs"
                />
                {isEdit && value && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(value);
                      toast({ title: '已复制到剪贴板', description: value.length > 28 ? `${value.slice(0, 16)}...${value.slice(-8)}` : value });
                    }}
                    title="复制完整封禁目标"
                  >
                    <Copy className="h-4 w-4" />
                    <span className="sr-only">复制</span>
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>封禁时长</Label>
              <Select
                value={duration}
                onValueChange={(val) => {
                  setDuration(val);
                  if (val !== 'custom') setCustomExpiry(undefined);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">永久封禁</SelectItem>
                  <SelectItem value="1">1 天 (24小时)</SelectItem>
                  <SelectItem value="7">7 天 (1周)</SelectItem>
                  <SelectItem value="30">30 天 (1个月)</SelectItem>
                  <SelectItem value="90">90 天 (3个月)</SelectItem>
                  <SelectItem value="custom">自定义到期时间</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {duration === 'custom' && (
              <div className="grid gap-2">
                <Label>到期时间</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-start text-left font-mono text-xs h-9"
                    >
                      <CalendarIcon className="h-3.5 w-3.5 opacity-70" />
                      {customExpiry ? formatDate(customExpiry) : '选择到期时间'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customExpiry}
                      onSelect={(date) => {
                        if (!date) return;
                        const d = new Date(date);
                        d.setHours(new Date().getHours() + 1, 0, 0, 0);
                        setCustomExpiry(d);
                      }}
                      disabled={(date) => date.getTime() < Date.now() - 24 * 60 * 60 * 1000}
                      initialFocus
                    />
                    {customExpiry && (
                      <div className="border-t p-2 flex items-center gap-1.5">
                        <select
                          value={String(customExpiry.getHours()).padStart(2, '0')}
                          onChange={(e) => {
                            const d = new Date(customExpiry);
                            d.setHours(parseInt(e.target.value, 10));
                            setCustomExpiry(d);
                          }}
                          className="border rounded p-1 bg-background text-foreground text-xs w-14 text-center"
                        >
                          {Array.from({ length: 24 }, (_, i) => {
                            const val = String(i).padStart(2, '0');
                            return <option key={val} value={val}>{val} 时</option>;
                          })}
                        </select>
                        <select
                          value={String(customExpiry.getMinutes()).padStart(2, '0')}
                          onChange={(e) => {
                            const d = new Date(customExpiry);
                            d.setMinutes(parseInt(e.target.value, 10));
                            setCustomExpiry(d);
                          }}
                          className="border rounded p-1 bg-background text-foreground text-xs w-14 text-center"
                        >
                          {Array.from({ length: 60 }, (_, i) => {
                            const val = String(i).padStart(2, '0');
                            return <option key={val} value={val}>{val} 分</option>;
                          })}
                        </select>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
                {customExpiry && (
                  <p className="text-[11px] text-muted-foreground">
                    将封禁至 {formatDate(customExpiry)}
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-2">
              <Label>封禁原因 (选填)</Label>
              <Input
                placeholder="例如: 撞库扫描 / 违规多设备共享"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting} variant="destructive">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEdit ? '正在保存...' : '正在封禁...'}
                </>
              ) : (
                isEdit ? '保存修改' : '确认封禁'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
