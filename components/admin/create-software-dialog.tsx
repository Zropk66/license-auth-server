'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CreateSoftwareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function CreateSoftwareDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateSoftwareDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      const res = await fetch('/api/admin/softwares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '创建软件失败');
      }

      toast({
        title: '创建成功',
        description: `已添加软件「${data.name}」`,
      });

      setName('');
      setCode('');
      setDescription('');
      setEnabled(true);
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
            <DialogTitle>添加新软件</DialogTitle>
            <DialogDescription>
              添加新的所属软件。添加后，在创建和修改授权密钥时可直接在下拉列表中选择。
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
                autoFocus
              />
              <p className="text-xs text-muted-foreground">客户端验证时提交的 <code>softwareName</code> 将与此名称完全匹配。</p>
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
                <p className="text-xs text-muted-foreground">启用后可在创建授权时选择此软件</p>
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
                '添加软件'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
