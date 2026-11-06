'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  customPayload?: string | null;
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
  const [customPayload, setCustomPayload] = useState('');
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
        setCustomPayload(versionToEdit.customPayload || '');
        setIsForced(versionToEdit.isForced);
        setEnabled(versionToEdit.enabled);
      } else {
        setSoftwareName('');
        setVersion('1.0.0');
        setVersionCode('100');
        setChangelog('');
        setDownloadUrl('');
        setFileHash('');
        setCustomPayload('');
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
        customPayload: customPayload.trim() || null,
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
      <DialogContent className="sm:max-w-[740px] p-0 flex flex-col gap-0 overflow-hidden shadow-2xl border-border/60">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b border-border/50 shrink-0 bg-background/95">
            <DialogTitle className="text-lg font-semibold">{versionToEdit ? '编辑软件版本' : '发布新软件版本'}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              配置客户端版本号、下载分发地址与强制更新规则。
            </DialogDescription>
          </DialogHeader>

          <div className="p-6">
            <Tabs defaultValue="basic" className="w-full flex flex-col">
              <TabsList className="grid w-full grid-cols-2 mb-4 bg-muted/60 p-1 shrink-0">
                <TabsTrigger value="basic" className="text-xs font-medium">版本分发与规则</TabsTrigger>
                <TabsTrigger value="content" className="text-xs font-medium">更新日志与载荷</TabsTrigger>
              </TabsList>

              <div className="h-[360px] overflow-y-auto pr-1 [scrollbar-gutter:stable]">
                <TabsContent value="basic" className="space-y-4 mt-0 focus-visible:outline-none">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">所属软件</Label>
                      <Select
                        value={softwareName}
                        onValueChange={setSoftwareName}
                        disabled={isSubmitting || loadingSoftwares}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder={loadingSoftwares ? "加载中..." : "请选择所属软件"} />
                        </SelectTrigger>
                        <SelectContent>
                          {softwareList.length === 0 ? (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">
                              暂无可用软件，请先前往「软件管理」添加
                            </div>
                          ) : (
                            softwareList.map((sw) => (
                              <SelectItem key={sw.id} value={sw.name} className="text-xs">
                                {sw.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">该版本所属的目标软件客户端</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">版本号 (SemVer) <span className="text-destructive">*</span></Label>
                      <Input
                        placeholder="例如: 1.2.0"
                        value={version}
                        onChange={(e) => setVersion(e.target.value)}
                        disabled={isSubmitting}
                        required
                        className="h-9 text-sm font-mono"
                      />
                      <p className="text-[11px] text-muted-foreground">展示给用户的语义化版本文本</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">数字版本代码 (Version Code) <span className="text-destructive">*</span></Label>
                      <Input
                        type="number"
                        placeholder="例如: 120"
                        value={versionCode}
                        onChange={(e) => setVersionCode(e.target.value)}
                        disabled={isSubmitting}
                        required
                        className="h-9 text-sm font-mono"
                      />
                      <p className="text-[11px] text-muted-foreground">用于客户端高低版本比对判断的纯整数</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">文件 Hash 校验 (选填)</Label>
                      <Input
                        placeholder="SHA256 或 MD5，防中间人劫持篡改"
                        value={fileHash}
                        onChange={(e) => setFileHash(e.target.value)}
                        disabled={isSubmitting}
                        className="h-9 text-xs font-mono"
                      />
                      <p className="text-[11px] text-muted-foreground">客户端下载后可校验该文件摘要完整性</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">安装包下载地址 (选填)</Label>
                    <Input
                      placeholder="例如: https://example.com/downloads/setup.exe"
                      value={downloadUrl}
                      onChange={(e) => setDownloadUrl(e.target.value)}
                      disabled={isSubmitting}
                      className="h-9 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center justify-between border rounded-lg p-3 bg-muted/10">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">强制更新</Label>
                        <p className="text-xs text-muted-foreground">开启后低于此版本的旧客户端必须更新才能继续使用</p>
                      </div>
                      <Switch checked={isForced} onCheckedChange={setIsForced} disabled={isSubmitting} />
                    </div>

                    <div className="flex items-center justify-between border rounded-lg p-3 bg-muted/10">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">启用状态</Label>
                        <p className="text-xs text-muted-foreground">下线后该版本将不会在客户端更新检测中下发</p>
                      </div>
                      <Switch checked={enabled} onCheckedChange={setEnabled} disabled={isSubmitting} />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="content" className="space-y-4 mt-0 focus-visible:outline-none">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">更新日志 (Changelog)</Label>
                    <Textarea
                      placeholder="1. 修复已知问题&#10;2. 优化运行性能"
                      value={changelog}
                      onChange={(e) => setChangelog(e.target.value)}
                      disabled={isSubmitting}
                      rows={4}
                      className="text-xs resize-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">版本专属自定义载荷 / JSON (选填)</Label>
                      <span className="text-[11px] text-muted-foreground">仅对该版本客户端下发的数据</span>
                    </div>
                    <Textarea
                      placeholder='{\n  "hook_rva": "0x1A42E0",\n  "version_patch": 102\n}'
                      value={customPayload}
                      onChange={(e) => setCustomPayload(e.target.value)}
                      disabled={isSubmitting}
                      rows={5}
                      className="font-mono text-xs leading-relaxed resize-none bg-muted/10"
                    />
                    <div className="rounded-md bg-muted/30 p-2.5 text-[11px] text-muted-foreground leading-normal border border-border/40">
                      <p className="font-medium text-foreground mb-0.5">覆盖优先级：</p>
                      <p>• 客户端为该版本（<code>versionCode</code>）时优先下发此载荷；留空则回退到所属软件默认载荷。</p>
                      <p>• 可用于随版本变迁的函数 Hook 偏移量与特定版本特征。</p>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>

          <DialogFooter className="p-4 px-6 border-t border-border/50 bg-muted/30 shrink-0 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="h-9"
            >
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting} className="h-9">
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
