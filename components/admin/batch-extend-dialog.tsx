'use client';

import { useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BatchExtendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onSuccess: () => void;
}

export default function BatchExtendDialog({
  open,
  onOpenChange,
  selectedIds,
  onSuccess,
}: BatchExtendDialogProps) {
  const { toast } = useToast();
  const [durationValue, setDurationValue] = useState<string>('30');
  const [durationUnit, setDurationUnit] = useState<'days' | 'hours' | 'minutes'>('days');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const numValue = parseInt(durationValue, 10);
    if (isNaN(numValue) || numValue <= 0) {
      toast({
        title: '提示',
        description: '请输入大于0的有效整数',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/licenses/batch', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ids: selectedIds,
          action: 'extend_duration',
          durationValue: numValue,
          durationUnit,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        toast({
          title: '批量延时成功',
          description: data.message || `已成功为 ${selectedIds.length} 个授权延长时间`,
        });
        onOpenChange(false);
        onSuccess();
      } else {
        throw new Error(data.error || '批量延时失败');
      }
    } catch (error: any) {
      toast({
        title: '错误',
        description: error.message || '批量延时失败',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>批量增加时长</DialogTitle>
          <DialogDescription>
            为选中的 {selectedIds.length} 个授权延长使用时间。对于待激活卡密将增加面额时长，已激活或固定卡密将在原到期时间或当前时间基础上累加。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">延长时间数值</label>
            <Input
              type="number"
              min="1"
              step="1"
              value={durationValue}
              onChange={(e) => setDurationValue(e.target.value)}
              placeholder="请输入延长时间"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">时间单位</label>
            <Select
              value={durationUnit}
              onValueChange={(v: 'days' | 'hours' | 'minutes') => setDurationUnit(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择时间单位" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="days">天 (Days)</SelectItem>
                <SelectItem value="hours">小时 (Hours)</SelectItem>
                <SelectItem value="minutes">分钟 (Minutes)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !durationValue}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            确认延时
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
