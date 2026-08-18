'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface SoftwareItem {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  enabled: boolean;
  licenseCount?: number;
  versionCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface EditSoftwareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  software: SoftwareItem | null;
  onSuccess: () => void;
}

export default function EditSoftwareDialog({
  open,
  onOpenChange,
  software,
  onSuccess,
}: EditSoftwareDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (software && open) {
      setName(software.name || '');
      setCode(software.code || '');
      setDescription(software.description || '');
      setEnabled(software.enabled ?? true);
    }
  }, [software, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!software) return;

    if (!name.trim()) {
      toast({
        title: '错误',
        description: '请输入所属软件名称',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        code: code.trim() || null,
        description: description.trim() || null,
        enabled,
      };

      const res = await fetch(`/api/admin/softwares/${software.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '更新软件失败');
      }

      toast({
        title: '更新成功',
        description: `已成功更新软件「${data.name}」`,
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
            <DialogTitle>编辑所属软件</DialogTitle>
            <DialogDescription>
              修改软件基本信息。若修改软件名称，已关联该软件的历史授权密钥与版本记录将自动同步更新。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-1.5">
              <Label className="text-sm font-medium">所属软件名称 <span className="text-destructive">*</span></Label>
              <Input
                placeholder="例如: Photoshop-Plugin, VideoEditor"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting}
                required
              />
              <p className="text-xs text-muted-foreground">客户端发起授权验证时必须传此名称。</p>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-sm font-medium">软件标识代码 (可选)</Label>
              <Input
                placeholder="例如: PS-PLG, VE-PRO"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-sm font-medium">软件描述 / 备注 (可选)</Label>
              <Textarea
                placeholder="输入该软件的用途、适用客户或备注说明..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSubmitting}
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between border rounded-lg p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">启用状态</Label>
                <p className="text-xs text-muted-foreground">禁用后将无法在新建授权密钥时选择此软件</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} disabled={isSubmitting} />
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在保存...
                </>
              ) : (
                '保存修改'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
