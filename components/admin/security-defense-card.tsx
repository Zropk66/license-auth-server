'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function SecurityDefenseCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enforceNonce, setEnforceNonce] = useState(false);
  const [enforceStrongPassword, setEnforceStrongPassword] = useState(false);
  const [toleranceSec, setToleranceSec] = useState('60');
  const [autoBlacklistThreshold, setAutoBlacklistThreshold] = useState('20');
  const [riskFailMax, setRiskFailMax] = useState('5');
  const [riskLockMin, setRiskLockMin] = useState('30');
  const [riskBogusHwidBlock, setRiskBogusHwidBlock] = useState(true);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings');
      if (!res.ok) throw new Error('获取设置失败');
      const data: Array<{ key: string; value: string }> = await res.json();

      const nonce = data.find((s) => s.key === 'security_enforce_nonce')?.value === 'true';
      const strongPass = data.find((s) => s.key === 'enforce_strong_password')?.value === 'true';
      const tolerance = data.find((s) => s.key === 'security_nonce_tolerance_sec')?.value || '60';
      const threshold = data.find((s) => s.key === 'security_auto_blacklist_threshold')?.value || '20';
      const failMax = data.find((s) => s.key === 'risk_license_fail_max')?.value || '5';
      const lockMin = data.find((s) => s.key === 'risk_license_lock_min')?.value || '30';
      const bogusFlag = data.find((s) => s.key === 'risk_bogus_hwid_block')?.value;

      setEnforceNonce(nonce);
      setEnforceStrongPassword(strongPass);
      setToleranceSec(tolerance);
      setAutoBlacklistThreshold(threshold);
      setRiskFailMax(failMax);
      setRiskLockMin(lockMin);
      setRiskBogusHwidBlock(bogusFlag === undefined ? true : bogusFlag === 'true');
    } catch (err: any) {
      toast({
        title: '错误',
        description: err.message || '加载安全配置失败',
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

    const failMaxNum = parseInt(riskFailMax, 10);
    const lockMinNum = parseInt(riskLockMin, 10);
    if (isNaN(failMaxNum) || failMaxNum < 1 || isNaN(lockMinNum) || lockMinNum < 1) {
      toast({ title: '错误', description: '风控阈值与锁定时长必须为正整数', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: [
            { key: 'security_enforce_nonce', value: String(enforceNonce) },
            { key: 'enforce_strong_password', value: String(enforceStrongPassword) },
            { key: 'security_nonce_tolerance_sec', value: toleranceSec },
            { key: 'security_auto_blacklist_threshold', value: autoBlacklistThreshold },
            { key: 'risk_license_fail_max', value: String(failMaxNum) },
            { key: 'risk_license_lock_min', value: String(lockMinNum) },
            { key: 'risk_bogus_hwid_block', value: String(riskBogusHwidBlock) },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存安全配置失败');

      toast({
        title: '已保存',
        description: '安全防护与密码策略配置已更新',
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
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-base">安全防护与防重放 (Anti-Replay & Defense)</CardTitle>
            <CardDescription className="text-xs">
              配置 Nonce 随机数防重放规则、时间戳容差窗口及触发暴力攻击时的自适应自动拉黑阈值。
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            正在加载安全防御配置...
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">强制高强度复杂密码策略</Label>
                <p className="text-xs text-muted-foreground">
                  开启后管理员创建与改密必须满足长度至少 8 位且同时包含大写字母、小写字母、数字及特殊符号；关闭时仅要求长度至少 6 位。
                </p>
              </div>
              <Switch checked={enforceStrongPassword} onCheckedChange={setEnforceStrongPassword} />
            </div>

            <div className="flex items-center justify-between border rounded-lg p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">强制 Nonce 防重放校验</Label>
                <p className="text-xs text-muted-foreground">
                  默认关闭（平滑过渡）。开启后客户端请求必须携带有效 Nonce 和当前时间戳，否则拒绝访问。
                </p>
              </div>
              <Switch checked={enforceNonce} onCheckedChange={setEnforceNonce} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="grid gap-1.5 border rounded-lg p-3">
                <Label className="text-xs font-medium">时间戳最大允许时钟偏差 (秒)</Label>
                <Input
                  type="number"
                  min="5"
                  max="3600"
                  value={toleranceSec}
                  onChange={(e) => setToleranceSec(e.target.value)}
                  className="text-xs h-8"
                  required
                />
                <p className="text-[10px] text-muted-foreground">
                  客户端本地时间与服务端时钟的允许偏差范围（默认 60 秒）。
                </p>
              </div>

              <div className="grid gap-1.5 border rounded-lg p-3">
                <Label className="text-xs font-medium">自适应防御自动拉黑阈值 (次/小时)</Label>
                <Input
                  type="number"
                  min="5"
                  value={autoBlacklistThreshold}
                  onChange={(e) => setAutoBlacklistThreshold(e.target.value)}
                  className="text-xs h-8"
                  required
                />
                <p className="text-[10px] text-muted-foreground">
                  1 小时内触发限流 429 或撞库非法卡密累计达到该值时，自动封禁 24 小时并报警。
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5 border rounded-lg p-3">
                <Label className="text-xs font-medium">单卡密连续失败锁定阈值 (次)</Label>
                <Input
                  type="number"
                  min="1"
                  value={riskFailMax}
                  onChange={(e) => setRiskFailMax(e.target.value)}
                  className="text-xs h-8"
                  required
                />
                <p className="text-[10px] text-muted-foreground">
                  同一卡密累计失败次数达到该值后临时锁定，覆盖设备不匹配与软件不匹配。
                </p>
              </div>

              <div className="grid gap-1.5 border rounded-lg p-3">
                <Label className="text-xs font-medium">卡密锁定持续时长 (分钟)</Label>
                <Input
                  type="number"
                  min="1"
                  value={riskLockMin}
                  onChange={(e) => setRiskLockMin(e.target.value)}
                  className="text-xs h-8"
                  required
                />
                <p className="text-[10px] text-muted-foreground">
                  锁定期内该卡密的验证请求一律拒绝，到期后自动解除。
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between border rounded-lg p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">拦截伪造设备标识</Label>
                <p className="text-xs text-muted-foreground">
                  开启后拒绝全零、全 F、单一重复字符、沙箱默认指纹等明显伪造的 HWID。
                </p>
              </div>
              <Switch checked={riskBogusHwidBlock} onCheckedChange={setRiskBogusHwidBlock} />
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                )}
                保存安全配置
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
