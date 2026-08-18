'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bell, Plus, Send, Edit, Trash2, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AddChannelDialog, { ChannelItem } from '@/components/admin/add-channel-dialog';

export default function NotificationChannelsCard() {
  const { toast } = useToast();
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [channelToEdit, setChannelToEdit] = useState<ChannelItem | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/notifications/channels');
      if (!res.ok) throw new Error('获取告警通道失败');
      const data = await res.json();
      setChannels(data);
    } catch (err: any) {
      toast({
        title: '错误',
        description: err.message || '加载通道失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const handleToggle = async (channel: ChannelItem) => {
    try {
      const res = await fetch(`/api/admin/notifications/channels/${channel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !channel.enabled }),
      });
      if (!res.ok) throw new Error('更新状态失败');
      fetchChannels();
    } catch (err: any) {
      toast({
        title: '错误',
        description: err.message || '操作失败',
        variant: 'destructive',
      });
    }
  };

  const handleTest = async (channel: ChannelItem) => {
    if (!channel.id) return;
    setTestingId(channel.id);
    try {
      const res = await fetch(`/api/admin/notifications/channels/${channel.id}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '测试推送失败');

      toast({
        title: '测试推送已下发',
        description: `已成功向通道 [${channel.name}] 发送测试报文，请检查手机/群消息`,
      });
    } catch (err: any) {
      toast({
        title: '测试失败',
        description: err.message || '请求通道失败',
        variant: 'destructive',
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (channel: ChannelItem) => {
    if (!confirm(`确定要删除告警通道 [${channel.name}] 吗？`)) return;

    try {
      const res = await fetch(`/api/admin/notifications/channels/${channel.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('删除失败');
      toast({ title: '已删除', description: `通道 [${channel.name}] 已移除` });
      fetchChannels();
    } catch (err: any) {
      toast({
        title: '错误',
        description: err.message || '删除失败',
        variant: 'destructive',
      });
    }
  };

  const getChannelBadge = (type: string) => {
    switch (type) {
      case 'bark':
        return <Badge className="bg-sky-500 hover:bg-sky-600">Bark (iOS/macOS)</Badge>;
      case 'feishu':
        return <Badge className="bg-blue-600 hover:bg-blue-700">飞书机器人</Badge>;
      case 'dingtalk':
        return <Badge className="bg-blue-500 hover:bg-blue-600">钉钉机器人</Badge>;
      case 'telegram':
        return <Badge className="bg-indigo-500 hover:bg-indigo-600">Telegram Bot</Badge>;
      default:
        return <Badge variant="outline">通用 Webhook</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">多通道告警与实时推送</CardTitle>
              <CardDescription className="text-xs">
                支持添加多个 Bark 设备、飞书、钉钉、Telegram 与 Webhook 通道，系统发生限流、封禁或登录事件时并发广播。
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchChannels} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setChannelToEdit(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              添加通道
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>通道名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>目标信息 (Key / URL)</TableHead>
                <TableHead>订阅事件</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">
                    正在加载通知通道...
                  </TableCell>
                </TableRow>
              ) : channels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">
                    暂未配置任何告警通道，点击上方「添加通道」配置 Bark 或群 Webhook。
                  </TableCell>
                </TableRow>
              ) : (
                channels.map((ch) => {
                  let parsedEvents: string[] = ['all'];
                  try {
                    parsedEvents = JSON.parse(ch.events);
                  } catch {}

                  return (
                    <TableRow key={ch.id}>
                      <TableCell className="font-medium text-xs">{ch.name}</TableCell>
                      <TableCell>{getChannelBadge(ch.type)}</TableCell>
                      <TableCell className="max-w-xs">
                        <code className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded truncate block">
                          {ch.type === 'bark' ? `Key: ${ch.secret || '未配置'}` : ch.url}
                        </code>
                      </TableCell>
                      <TableCell className="text-xs">
                        {parsedEvents.includes('all') ? (
                          <span className="text-muted-foreground">全部事件</span>
                        ) : (
                          <span className="text-muted-foreground">
                            {parsedEvents.length} 个事件
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={ch.enabled}
                          onCheckedChange={() => handleToggle(ch)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => handleTest(ch)}
                            disabled={testingId === ch.id || !ch.enabled}
                          >
                            <Send className={`h-3 w-3 mr-1 ${testingId === ch.id ? 'animate-spin' : ''}`} />
                            测试
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setChannelToEdit(ch);
                              setDialogOpen(true);
                            }}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(ch)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <AddChannelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        channelToEdit={channelToEdit}
        onSuccess={fetchChannels}
      />
    </Card>
  );
}
