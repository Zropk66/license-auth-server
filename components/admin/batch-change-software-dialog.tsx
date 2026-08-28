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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SoftwareOption {
  id: string;
  name: string;
  code?: string | null;
  enabled: boolean;
}

interface BatchChangeSoftwareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onSuccess: () => void;
}

export default function BatchChangeSoftwareDialog({
  open,
  onOpenChange,
  selectedIds,
  onSuccess,
}: BatchChangeSoftwareDialogProps) {
  const { toast } = useToast();
  const [softwares, setSoftwares] = useState<SoftwareOption[]>([]);
  const [loadingSoftwares, setLoadingSoftwares] = useState(false);
  const [selectedSoftware, setSelectedSoftware] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      fetchSoftwares();
    } else {
      setSelectedSoftware('');
    }
  }, [open]);

  const fetchSoftwares = async () => {
    setLoadingSoftwares(true);
    try {
      const response = await fetch('/api/admin/softwares?enabledOnly=true');
      const data = await response.json();
      if (response.ok && Array.isArray(data)) {
        setSoftwares(data);
        if (data.length > 0) {
          setSelectedSoftware(data[0].name);
        }
      } else {
        throw new Error(data.error || '获取软件列表失败');
      }
    } catch (error: any) {
      toast({
        title: '错误',
        description: error.message || '获取软件列表失败',
        variant: 'destructive',
      });
    } finally {
      setLoadingSoftwares(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedSoftware) {
      toast({
        title: '提示',
        description: '请选择目标软件',
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
          action: 'change_software',
          softwareName: selectedSoftware,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        toast({
          title: '批量修改成功',
          description: data.message || `已成功更新 ${selectedIds.length} 个授权的所属软件`,
        });
        onOpenChange(false);
        onSuccess();
      } else {
        throw new Error(data.error || '批量修改所属软件失败');
      }
    } catch (error: any) {
      toast({
        title: '错误',
        description: error.message || '批量修改所属软件失败',
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
          <DialogTitle>批量修改所属软件</DialogTitle>
          <DialogDescription>
            将选中的 {selectedIds.length} 个授权转移至指定软件。修改后正在运行的旧设备会话将立即终止。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {loadingSoftwares ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : softwares.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              暂无已启用的软件，请先在软件管理中添加并启用软件
            </p>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">目标软件</label>
              <Select value={selectedSoftware} onValueChange={setSelectedSoftware}>
                <SelectTrigger>
                  <SelectValue placeholder="选择所属软件" />
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
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || loadingSoftwares || softwares.length === 0 || !selectedSoftware}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            确认修改
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
