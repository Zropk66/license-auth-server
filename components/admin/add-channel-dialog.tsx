'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface ChannelItem {
  id?: string;
  name: string;
  type: string;
  url: string;
  secret?: string | null;
  enabled: boolean;
  events: string;
}

interface AddChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelToEdit?: ChannelItem | null;
  onSuccess: () => void;
}

const AVAILABLE_EVENTS = [
  { id: 'rate_limit', label: '接口限流拦截 (429 告警)' },
  { id: 'blacklist_hit', label: '黑名单拦截 / 自适应封禁' },
  { id: 'admin_login', label: '管理员登录成功通知' },
  { id: 'bruteforce', label: '撞库与非法验证异常' },
  { id: 'system', label: '系统与运维事件' },
];

export default function AddChannelDialog({
  open,
  onOpenChange,
  channelToEdit,
  onSuccess,
}: AddChannelDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState('bark');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['all']);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (channelToEdit) {
        setName(channelToEdit.name);
        setType(channelToEdit.type);
        setUrl(channelToEdit.url || '');
        setSecret(channelToEdit.secret || '');
        setEnabled(channelToEdit.enabled);
        try {
          setSelectedEvents(JSON.parse(channelToEdit.events));
        } catch {
          setSelectedEvents(['all']);
        }
      } else {
        setName('');
        setType('bark');
        setUrl('');
        setSecret('');
        setEnabled(true);
        setSelectedEvents(['all']);
      }
    }
  }, [open, channelToEdit]);

  const handleTypeChange = (newType: string) => {
    setType(newType);
    if (!channelToEdit) {
      setUrl('');
      setSecret('');
    }
  };

  const toggleEvent = (eventId: string) => {
    if (eventId === 'all') {
      if (selectedEvents.includes('all')) {
        setSelectedEvents(AVAILABLE_EVENTS.map((e) => e.id));
      } else {
        setSelectedEvents(['all']);
      }
      return;
    }

    let next = selectedEvents.filter((e) => e !== 'all');
    if (next.includes(eventId)) {
      next = next.filter((e) => e !== eventId);
    } else {
      next.push(eventId);
    }

    setSelectedEvents(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: '错误', description: '请输入通道名称', variant: 'destructive' });
      return;
    }

    if (!selectedEvents.includes('all') && selectedEvents.length === 0) {
      toast({ title: '错误', description: '请至少选择一个订阅告警事件', variant: 'destructive' });
      return;
    }

    if (type === 'bark' && !secret.trim()) {
      toast({ title: '错误', description: '请输入 Bark Device Key', variant: 'destructive' });
      return;
    }

    if (type !== 'bark' && type !== 'telegram' && !url.trim()) {
      toast({ title: '错误', description: '请输入 Webhook URL', variant: 'destructive' });
      return;
    }

    if (type === 'telegram' && (!secret.trim() || !url.trim())) {
      toast({ title: '错误', description: 'Telegram 需要填写 Bot Token 与 Chat ID', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        type,
        url: url.trim(),
        secret: secret.trim() || null,
        enabled,
        events: selectedEvents,
      };

      let res: Response;
      if (channelToEdit?.id) {
        res = await fetch(`/api/admin/notifications/channels/${channelToEdit.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/admin/notifications/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存通知通道失败');

      toast({
        title: '成功',
        description: channelToEdit ? '已更新通知通道' : '已成功添加通知通道',
      });

      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({
        title: '错误',
        description: err.message || '保存失败',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{channelToEdit ? '编辑告警通道' : '添加告警通道'}</DialogTitle>
            <DialogDescription>
              配置消息推送通道。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* 通用：通道名称与类型 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>通道名称</Label>
                <Input
                  placeholder="例如: 管理员 iPhone Bark"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>通道类型</Label>
                <Select value={type} onValueChange={handleTypeChange} disabled={isSubmitting}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bark">Bark (iOS/macOS 原生推送)</SelectItem>
                    <SelectItem value="feishu">飞书自定义机器人 (Feishu)</SelectItem>
                    <SelectItem value="dingtalk">钉钉自定义机器人 (DingTalk)</SelectItem>
                    <SelectItem value="telegram">Telegram Bot</SelectItem>
                    <SelectItem value="generic">通用 Webhook (JSON POST)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 动态条件渲染：仅选中 Bark 时显示 */}
            {type === 'bark' && (
              <div className="p-3 border rounded-lg bg-muted/20 space-y-3">
                <div className="text-xs font-semibold text-primary uppercase tracking-wider">
                  Bark 专属配置
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs">
                    Bark Device Key (支持多台设备/多个人)
                  </Label>
                  <Textarea
                    placeholder="输入从 Bark App 复制的 Device Key&#10;若推送给多台设备/多个人，可使用换行或逗号分隔多个 Key"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    rows={2}
                    className="font-mono text-xs"
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    每个 Key 将独立接收推送，支持向团队多位管理员的 iOS 设备并发下发。
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs">Bark 服务器地址 (选填)</Label>
                  <Input
                    placeholder="https://api.day.app/push"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            )}

            {/* 动态条件渲染：仅选中 飞书 时显示 */}
            {type === 'feishu' && (
              <div className="p-3 border rounded-lg bg-muted/20 space-y-3">
                <div className="text-xs font-semibold text-primary uppercase tracking-wider">
                  飞书机器人配置
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs">飞书 Webhook 地址</Label>
                  <Input
                    placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/xxxx"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="text-xs"
                    required
                  />
                </div>
              </div>
            )}

            {/* 动态条件渲染：仅选中 钉钉 时显示 */}
            {type === 'dingtalk' && (
              <div className="p-3 border rounded-lg bg-muted/20 space-y-3">
                <div className="text-xs font-semibold text-primary uppercase tracking-wider">
                  钉钉机器人配置
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs">钉钉 Webhook 地址</Label>
                  <Input
                    placeholder="https://oapi.dingtalk.com/robot/send?access_token=xxxx"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="text-xs"
                    required
                  />
                </div>
              </div>
            )}

            {/* 动态条件渲染：仅选中 Telegram 时显示 */}
            {type === 'telegram' && (
              <div className="p-3 border rounded-lg bg-muted/20 space-y-3">
                <div className="text-xs font-semibold text-primary uppercase tracking-wider">
                  Telegram Bot 配置
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs">Bot Token</Label>
                  <Input
                    placeholder="例如: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    className="font-mono text-xs"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs">Chat ID (支持多个，逗号分隔)</Label>
                  <Input
                    placeholder="例如: -100123456789 或 12345678"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="font-mono text-xs"
                    required
                  />
                </div>
              </div>
            )}

            {/* 动态条件渲染：仅选中 通用 Webhook 时显示 */}
            {type === 'generic' && (
              <div className="p-3 border rounded-lg bg-muted/20 space-y-3">
                <div className="text-xs font-semibold text-primary uppercase tracking-wider">
                  通用 Webhook 配置
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs">Webhook URL (POST JSON)</Label>
                  <Input
                    placeholder="https://your-server.com/api/webhook"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="text-xs"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs">Bearer Token / 认证密钥 (选填)</Label>
                  <Input
                    placeholder="选填，将作为 Authorization: Bearer {token} 头部发送"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            )}

            {/* 事件订阅选择 */}
            <div className="space-y-2 border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">订阅告警事件</Label>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="event-all"
                    checked={selectedEvents.includes('all')}
                    onCheckedChange={() => toggleEvent('all')}
                  />
                  <label htmlFor="event-all" className="text-xs cursor-pointer font-medium">
                    接收全部事件
                  </label>
                </div>
              </div>
              {!selectedEvents.includes('all') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t">
                  {AVAILABLE_EVENTS.map((ev) => (
                    <div key={ev.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`ev-${ev.id}`}
                        checked={selectedEvents.includes(ev.id)}
                        onCheckedChange={() => toggleEvent(ev.id)}
                      />
                      <label htmlFor={`ev-${ev.id}`} className="text-xs cursor-pointer">
                        {ev.label}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 启用状态 */}
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div className="space-y-0.5">
                <Label className="text-sm">启用通道</Label>
                <p className="text-xs text-muted-foreground">关闭后将暂停向此通道推送任何通知</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
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
                  保存中...
                </>
              ) : (
                '保存通道'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
