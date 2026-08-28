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

export interface VersionItem {
  id?: string;
  softwareName: string;
  version: string;
  versionCode: number;
  changelog: string;
  downloadUrl: string;
  fileHash?: string | null;
  isForced: boolean;
  enabled: boolean;
}

interface AddVersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versionToEdit?: VersionItem | null;
  onSuccess: () => void;
}

export default function AddVersionDialog({
  open,
  onOpenChange,
  versionToEdit,
  onSuccess,
}: AddVersionDialogProps) {
  const { toast } = useToast();
  const [softwareName, setSoftwareName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [versionCode, setVersionCode] = useState('100');
  const [changelog, setChangelog] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [fileHash, setFileHash] = useState('');
  const [isForced, setIsForced] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [softwareList, setSoftwareList] = useState<{ id: string; name: string }[]>([]);
  const [loadingSoftwares, setLoadingSoftwares] = useState(false);

  useEffect(() => {
    const fetchSoftwares = async () => {
      setLoadingSoftwares(true);
      try {
        const res = await fetch('/api/admin/softwares?enabledOnly=true');
        if (res.ok) {
          const data = await res.json();
          setSoftwareList(data);
        }
      } catch {
      } finally {
        setLoadingSoftwares(false);
      }
    };
    if (open) fetchSoftwares();
  }, [open]);

  useEffect(() => {
    if (open) {
      if (versionToEdit) {
        setSoftwareName(versionToEdit.softwareName);
        setVersion(versionToEdit.version);
        setVersionCode(String(versionToEdit.versionCode));
        setChangelog(versionToEdit.changelog);
        setDownloadUrl(versionToEdit.downloadUrl);
        setFileHash(versionToEdit.fileHash || '');
        setIsForced(versionToEdit.isForced);
        setEnabled(versionToEdit.enabled);
      } else {
        setSoftwareName('');
        setVersion('1.0.0');
        setVersionCode('100');
        setChangelog('');
        setDownloadUrl('');
        setFileHash('');
        setIsForced(false);
        setEnabled(true);
      }
    }
  }, [open, versionToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!softwareName.trim() || !version.trim() || !versionCode.trim()) {
      toast({ title: '错误', description: '请完整填写软件名称、版本号与数字版本代码', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        softwareName: softwareName.trim(),
        version: version.trim(),
        versionCode: parseInt(versionCode, 10),
        changelog: changelog.trim(),
        downloadUrl: downloadUrl.trim(),
        fileHash: fileHash.trim() || null,
        isForced,
        enabled,
      };

      let res: Response;
      if (versionToEdit?.id) {
        res = await fetch(`/api/admin/software-versions/${versionToEdit.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/admin/software-versions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存版本失败');

      toast({
        title: '成功',
        description: versionToEdit ? '已更新软件版本' : '已发布新版本',
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
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{versionToEdit ? '编辑版本' : '发布新软件版本'}</DialogTitle>
            <DialogDescription>
              配置客户端版本号、下载地址与强制更新规则。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label className="text-xs">所属软件</Label>
                <Select
                  value={softwareName}
                  onValueChange={setSoftwareName}
                  disabled={isSubmitting || loadingSoftwares}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={loadingSoftwares ? "加载中..." : "请选择所属软件"} />
                  </SelectTrigger>
                  <SelectContent>
                    {softwareList.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        暂无可用软件，请先前往「软件管理」添加
                      </div>
                    ) : (
                      softwareList.map((sw) => (
                        <SelectItem key={sw.id} value={sw.name}>
                          {sw.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">版本号 (SemVer)</Label>
                <Input
                  placeholder="例如: 1.2.0"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  disabled={isSubmitting}
                  required
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label className="text-xs">数字版本代码 (Version Code)</Label>
                <Input
                  type="number"
                  placeholder="例如: 120"
                  value={versionCode}
                  onChange={(e) => setVersionCode(e.target.value)}
                  disabled={isSubmitting}
                  required
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">文件 Hash 校验 (SHA256/MD5)</Label>
                <Input
                  placeholder="选填，防劫持校验"
                  value={fileHash}
                  onChange={(e) => setFileHash(e.target.value)}
                  disabled={isSubmitting}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">安装包下载地址 (选填)</Label>
              <Input
                placeholder="选填，例如: https://example.com/downloads/setup.exe"
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
                disabled={isSubmitting}
                className="h-8 text-xs"
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">更新日志 (Changelog)</Label>
              <Textarea
                placeholder="1. 修复已知问题&#10;2. 优化运行性能"
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
                disabled={isSubmitting}
                rows={3}
                className="text-xs"
              />
            </div>

            <div className="flex items-center justify-between border rounded-lg p-2.5">
              <div className="space-y-0.5">
                <Label className="text-xs">强制更新 (Force Update)</Label>
                <p className="text-[10px] text-muted-foreground">开启后旧版本必须更新后才能继续使用</p>
              </div>
              <Switch checked={isForced} onCheckedChange={setIsForced} />
            </div>

            <div className="flex items-center justify-between border rounded-lg p-2.5">
              <div className="space-y-0.5">
                <Label className="text-xs">启用状态</Label>
                <p className="text-[10px] text-muted-foreground">下线后该版本将不会在更新检测中下发</p>
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
                  保存中...
                </>
              ) : (
                '保存版本'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
