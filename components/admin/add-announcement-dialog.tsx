'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface AnnouncementItem {
  id?: string;
  softwareName: string;
  title: string;
  content: string;
  type: string;
  enabled: boolean;
}

interface AddAnnouncementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  announcementToEdit?: AnnouncementItem | null;
  onSuccess: () => void;
}

export default function AddAnnouncementDialog({
  open,
  onOpenChange,
  announcementToEdit,
  onSuccess,
}: AddAnnouncementDialogProps) {
  const { toast } = useToast();
  const [softwareName, setSoftwareName] = useState('ALL');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState('info');
  const [enabled, setEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (announcementToEdit) {
        setSoftwareName(announcementToEdit.softwareName);
        setTitle(announcementToEdit.title);
        setContent(announcementToEdit.content);
        setType(announcementToEdit.type);
        setEnabled(announcementToEdit.enabled);
      } else {
        setSoftwareName('ALL');
        setTitle('');
        setContent('');
        setType('info');
        setEnabled(true);
      }
    }
  }, [open, announcementToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast({ title: '错误', description: '请完整填写公告标题与内容', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        softwareName: softwareName.trim() || 'ALL',
        title: title.trim(),
        content: content.trim(),
        type,
        enabled,
      };

      let res: Response;
      if (announcementToEdit?.id) {
        res = await fetch(`/api/admin/announcements/${announcementToEdit.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/admin/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存公告失败');

      toast({
        title: '成功',
        description: announcementToEdit ? '已更新公告' : '已发布新公告',
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
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{announcementToEdit ? '编辑系统公告' : '发布系统公告'}</DialogTitle>
            <DialogDescription>
              向客户端下发弹窗通知、滚动公告或停服维护预警。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label className="text-xs">目标所属软件</Label>
                <Input
                  placeholder="填写 ALL 或指定所属软件"
                  value={softwareName}
                  onChange={(e) => setSoftwareName(e.target.value)}
                  disabled={isSubmitting}
                  className="h-8 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">ALL 为全部软件通用下发</p>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs">公告类型</Label>
                <Select value={type} onValueChange={setType} disabled={isSubmitting}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">常规通知 (Info)</SelectItem>
                    <SelectItem value="warning">重要提醒 (Warning)</SelectItem>
                    <SelectItem value="maintenance">停服维护 (Maintenance)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">公告标题</Label>
              <Input
                placeholder="例如: 8月20日系统例行维护升级公告"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isSubmitting}
                required
                className="h-8 text-xs"
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">公告正文内容</Label>
              <Textarea
                placeholder="支持多行文本详情描述..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={isSubmitting}
                rows={4}
                required
                className="text-xs"
              />
            </div>

            <div className="flex items-center justify-between border rounded-lg p-2.5">
              <div className="space-y-0.5">
                <Label className="text-xs">启用展示</Label>
                <p className="text-[10px] text-muted-foreground">开启后客户端将能拉取到此条公告</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>

          <DialogFooter>
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
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  发布中...
                </>
              ) : (
                '确认发布'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
