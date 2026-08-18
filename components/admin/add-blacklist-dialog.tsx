'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AddBlacklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function AddBlacklistDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddBlacklistDialogProps) {
  const { toast } = useToast();
  const [type, setType] = useState<'ip' | 'hwid'>('ip');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('0'); // 0 = 永久
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) {
      toast({
        title: '错误',
        description: '请输入封禁目标值',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          value: value.trim(),
          reason: reason.trim() || '管理员手动封禁',
          days: parseInt(duration, 10),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '添加黑名单失败');
      }

      toast({
        title: '成功',
        description: `已成功将 ${value} 加入黑名单`,
      });

      setValue('');
      setReason('');
      setDuration('0');
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({
        title: '错误',
        description: err.message || '添加失败',
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
            <DialogTitle>添加黑名单封禁</DialogTitle>
            <DialogDescription>
              封禁指定的 IP 地址或机器码 (HWID)，被封禁目标将无法请求验证与登录。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>封禁类型</Label>
              <Select value={type} onValueChange={(val: any) => setType(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ip">IP 地址 (IPv4 / IPv6)</SelectItem>
                  <SelectItem value="hwid">HWID (HWID)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>{type === 'ip' ? 'IP 地址' : 'HWID'}</Label>
              <Input
                placeholder={type === 'ip' ? '例如 1.2.3.4' : '例如 HWID-A1B2C3D4'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={isSubmitting}
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
                  正在封禁...
                </>
              ) : (
                '确认封禁'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
