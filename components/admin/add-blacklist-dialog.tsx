'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
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
  const isEdit = Boolean(entryToEdit);

  const [type, setType] = useState<'ip' | 'hwid'>('ip');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('0'); // 0 = 永久
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

    setIsSubmitting(true);
    try {
      const url = isEdit ? '/api/admin/blacklist/update' : '/api/admin/blacklist';
      const payload = isEdit
        ? {
            id: entryToEdit!.id,
            reason: reason.trim() || '管理员手动封禁',
            days: parseInt(duration, 10),
          }
        : {
            type,
            value: value.trim(),
            reason: reason.trim() || '管理员手动封禁',
            days: parseInt(duration, 10),
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
          ? `已更新 [${entryToEdit!.value}] 的封禁配置`
          : `已成功将 ${value} 加入黑名单`,
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
            <DialogDescription>
              {isEdit
                ? `调整 [${entryToEdit?.value}] 的封禁原因与过期时间，封禁目标不可修改。`
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
              <Input
                placeholder={type === 'ip' ? '例如 1.2.3.4 或 1.2.3.0/24 或 1.2.*.*' : '例如 HW-A1B2C3D4'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={isSubmitting || isEdit}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label>封禁时长</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">永久封禁</SelectItem>
                  <SelectItem value="1">1 天 (24小时)</SelectItem>
                  <SelectItem value="7">7 天 (1周)</SelectItem>
                  <SelectItem value="30">30 天 (1个月)</SelectItem>
                  <SelectItem value="90">90 天 (3个月)</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
