'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Gauge } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Setting {
  key: string;
  value: string;
}

export default function RateLimitCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loginMax, setLoginMax] = useState('10');
  const [loginWindow, setLoginWindow] = useState('15');
  const [verifyMax, setVerifyMax] = useState('30');
  const [verifyWindow, setVerifyWindow] = useState('1');
  const [heartbeatMax, setHeartbeatMax] = useState('60');
  const [heartbeatWindow, setHeartbeatWindow] = useState('1');

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((res) => res.json())
      .then((data: Setting[]) => {
        const get = (key: string, fallback: string) =>
          data.find((s) => s.key === key)?.value || fallback;
        setLoginMax(get('rate_limit_login_max', '10'));
        setLoginWindow(get('rate_limit_login_window_min', '15'));
        setVerifyMax(get('rate_limit_verify_max', '30'));
        setVerifyWindow(get('rate_limit_verify_window_min', '1'));
        setHeartbeatMax(get('rate_limit_heartbeat_max', '60'));
        setHeartbeatWindow(get('rate_limit_heartbeat_window_min', '1'));
      })
      .catch(() => {
        toast({ title: '错误', description: '获取速率限制设置失败', variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, [toast]);

  const handleSave = async () => {
    const nums = [loginMax, loginWindow, verifyMax, verifyWindow, heartbeatMax, heartbeatWindow];
    for (const n of nums) {
      const val = parseInt(n, 10);
      if (isNaN(val) || val <= 0) {
        toast({ title: '错误', description: '所有参数必须为正整数', variant: 'destructive' });
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: [
            { key: 'rate_limit_login_max', value: loginMax },
            { key: 'rate_limit_login_window_min', value: loginWindow },
            { key: 'rate_limit_verify_max', value: verifyMax },
            { key: 'rate_limit_verify_window_min', value: verifyWindow },
            { key: 'rate_limit_heartbeat_max', value: heartbeatMax },
            { key: 'rate_limit_heartbeat_window_min', value: heartbeatWindow },
          ],
        }),
      });
      if (!res.ok) throw new Error('保存失败');
      toast({ title: '已保存', description: '速率限制策略已更新并即时生效' });
    } catch {
      toast({ title: '错误', description: '保存设置失败', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-base">速率限制策略</CardTitle>
            <CardDescription className="text-xs">
              基于 IP 的内存级限流，防止暴力破解与接口滥用。修改后即时生效（缓存 60 秒）。
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center items-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="grid gap-1.5">
                <Label className="text-xs">登录最大尝试次数</Label>
                <Input type="number" min="1" value={loginMax} onChange={(e) => setLoginMax(e.target.value)} disabled={saving} className="h-8 text-xs" />
                <p className="text-[10px] text-muted-foreground">窗口期内允许的登录失败次数</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">登录限流窗口 (分钟)</Label>
                <Input type="number" min="1" value={loginWindow} onChange={(e) => setLoginWindow(e.target.value)} disabled={saving} className="h-8 text-xs" />
                <p className="text-[10px] text-muted-foreground">计数重置的时间窗口长度</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">默认: 10 次 / 15 分钟</Label>
                <div className="text-[10px] text-muted-foreground border rounded p-2 bg-muted/20">
                  超过限制后返回 429，等待窗口重置后自动恢复
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="grid gap-1.5">
                <Label className="text-xs">验证最大请求次数</Label>
                <Input type="number" min="1" value={verifyMax} onChange={(e) => setVerifyMax(e.target.value)} disabled={saving} className="h-8 text-xs" />
                <p className="text-[10px] text-muted-foreground">窗口期内许可证验证次数上限</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">验证限流窗口 (分钟)</Label>
                <Input type="number" min="1" value={verifyWindow} onChange={(e) => setVerifyWindow(e.target.value)} disabled={saving} className="h-8 text-xs" />
                <p className="text-[10px] text-muted-foreground">计数重置的时间窗口长度</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">默认: 30 次 / 1 分钟</Label>
                <div className="text-[10px] text-muted-foreground border rounded p-2 bg-muted/20">
                  同时覆盖检查更新与公告获取接口
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="grid gap-1.5">
                <Label className="text-xs">心跳最大请求次数</Label>
                <Input type="number" min="1" value={heartbeatMax} onChange={(e) => setHeartbeatMax(e.target.value)} disabled={saving} className="h-8 text-xs" />
                <p className="text-[10px] text-muted-foreground">窗口期内心跳请求次数上限</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">心跳限流窗口 (分钟)</Label>
                <Input type="number" min="1" value={heartbeatWindow} onChange={(e) => setHeartbeatWindow(e.target.value)} disabled={saving} className="h-8 text-xs" />
                <p className="text-[10px] text-muted-foreground">计数重置的时间窗口长度</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">默认: 60 次 / 1 分钟</Label>
                <div className="text-[10px] text-muted-foreground border rounded p-2 bg-muted/20">
                  建议设为心跳间隔的 2~3 倍容错
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    保存策略
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
