'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RefreshCw, Save, Smartphone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function UnbindPolicyCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unbindEnabled, setUnbindEnabled] = useState(false);
  const [unbindDefaultAllow, setUnbindDefaultAllow] = useState(false);
  const [maxPerMonth, setMaxPerMonth] = useState('0');
  const [cooldownHours, setCooldownHours] = useState('24');
  const [deductHours, setDeductHours] = useState('0');

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings');
      if (!res.ok) throw new Error('获取设置失败');
      const data: Array<{ key: string; value: string }> = await res.json();

      const enabled = data.find((s) => s.key === 'unbind_enabled')?.value === 'true';
      const defaultAllow = data.find((s) => s.key === 'unbind_default_allow')?.value === 'true';
      const max = data.find((s) => s.key === 'unbind_max_per_month')?.value ?? '0';
      const cooldown = data.find((s) => s.key === 'unbind_cooldown_hours')?.value || '24';
      const deduct = data.find((s) => s.key === 'unbind_deduct_hours')?.value || '0';

      setUnbindEnabled(enabled);
      setUnbindDefaultAllow(defaultAllow);
      setMaxPerMonth(max);
      setCooldownHours(cooldown);
      setDeductHours(deduct);
    } catch (err: any) {
      toast({
        title: '错误',
        description: err.message || '加载换绑策略失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: [
            { key: 'unbind_enabled', value: String(unbindEnabled) },
            { key: 'unbind_default_allow', value: String(unbindDefaultAllow) },
            { key: 'unbind_max_per_month', value: maxPerMonth },
            { key: 'unbind_cooldown_hours', value: cooldownHours },
            { key: 'unbind_deduct_hours', value: deductHours },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存换绑策略失败');

      toast({
        title: '已保存',
        description: '用户自助换绑策略已成功更新',
      });
    } catch (err: any) {
      toast({
        title: '错误',
        description: err.message || '保存失败',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-base">用户自助换绑策略</CardTitle>
            <CardDescription className="text-xs">
              配置用户端卡密解绑设备权限（默认一卡一机不允许换绑，开启后可限制频率与扣除时长）。
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            正在加载换绑策略配置...
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">开启用户端自助解绑设备</Label>
                <p className="text-xs text-muted-foreground">
                  全局总开关（默认关闭）。开启后允许系统内符合条件的卡密自助换绑。
                </p>
              </div>
              <Switch checked={unbindEnabled} onCheckedChange={setUnbindEnabled} />
            </div>

            {unbindEnabled && (
              <>
                <div className="flex items-center justify-between border rounded-lg p-3 bg-muted/20">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">新建授权默认允许自助换绑</Label>
                    <p className="text-xs text-muted-foreground">
                      创建新卡密时默认勾选允许换绑（未开启时新建卡密默认一卡一机不可换绑，发卡时也可针对特定卡密单独开启）。
                    </p>
                  </div>
                  <Switch checked={unbindDefaultAllow} onCheckedChange={setUnbindDefaultAllow} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="grid gap-1.5 border rounded-lg p-3">
                  <Label className="text-xs font-medium">每月最大解绑次数</Label>
                  <Input
                    type="number"
                    min="0"
                    value={maxPerMonth}
                    onChange={(e) => setMaxPerMonth(e.target.value)}
                    className="text-xs h-8"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground">
                    每个卡密每月最多允许解绑的次数（次月自动重置，设为 0 表示默认不允许自助解绑）。
                  </p>
                </div>

                <div className="grid gap-1.5 border rounded-lg p-3">
                  <Label className="text-xs font-medium">换绑冷却时间 (小时)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={cooldownHours}
                    onChange={(e) => setCooldownHours(e.target.value)}
                    className="text-xs h-8"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground">
                    上次解绑后需等待的小时数（如 24 小时后才能再次解绑）。
                  </p>
                </div>

                <div className="grid gap-1.5 border rounded-lg p-3">
                  <Label className="text-xs font-medium">解绑扣除时长 (小时)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={deductHours}
                    onChange={(e) => setDeductHours(e.target.value)}
                    className="text-xs h-8"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground">
                    每次解绑作为手续费扣除卡密剩余有效时间（0 为不扣除）。
                  </p>
                </div>
              </div>
              </>
            )}

            <div className="flex justify-end pt-2">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                )}
                保存换绑策略
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
