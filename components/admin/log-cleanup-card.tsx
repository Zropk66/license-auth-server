'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Trash2, Save, HardDrive, Calendar as CalendarIcon, Database } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LogStats {
  verifyCount: number;
  auditCount: number;
  verifySizeBytes: number;
  auditSizeBytes: number;
  totalSizeBytes: number;
  totalSizeMb: number;
  physicalSizeBytes: number;
  physicalSizeMb: number;
}

interface CleanupConfig {
  mode: 'date' | 'size' | 'both';
  verifyDays: number;
  auditDays: number;
  maxSizeMb: number;
  autoEnabled: boolean;
}

export default function LogCleanupCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const [stats, setStats] = useState<LogStats | null>(null);
  const [mode, setMode] = useState<'date' | 'size' | 'both'>('date');
  const [verifyDays, setVerifyDays] = useState('7');
  const [auditDays, setAuditDays] = useState('90');
  const [maxSizeMb, setMaxSizeMb] = useState('50');
  const [autoEnabled, setAutoEnabled] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/maintenance/cleanup-logs');
      if (!res.ok) throw new Error('获取日志数据失败');
      const data = await res.json();
      if (data.stats) setStats(data.stats);
      if (data.config) {
        setMode(data.config.mode || 'date');
        setVerifyDays(String(data.config.verifyDays || 7));
        setAuditDays(String(data.config.auditDays || 90));
        setMaxSizeMb(String(data.config.maxSizeMb || 50));
        setAutoEnabled(data.config.autoEnabled !== false);
      }
    } catch {
      toast({ title: '错误', description: '获取日志状态与配置失败', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    const vd = parseInt(verifyDays, 10);
    const ad = parseInt(auditDays, 10);
    const ms = parseInt(maxSizeMb, 10);

    if (mode === 'date' || mode === 'both') {
      if (isNaN(vd) || vd < 1) {
        toast({ title: '错误', description: '验证记录保留天数必须为正整数', variant: 'destructive' });
        return;
      }
      if (isNaN(ad) || ad < 1) {
        toast({ title: '错误', description: '审计日志保留天数必须为正整数', variant: 'destructive' });
        return;
      }
    }

    if (mode === 'size' || mode === 'both') {
      if (isNaN(ms) || ms < 1) {
        toast({ title: '错误', description: '最大容量必须为大于 0 的整数', variant: 'destructive' });
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
            { key: 'log_cleanup_mode', value: mode },
            { key: 'log_cleanup_verify_days', value: verifyDays },
            { key: 'log_cleanup_audit_days', value: auditDays },
            { key: 'log_cleanup_max_size_mb', value: maxSizeMb },
            { key: 'log_cleanup_auto_enabled', value: String(autoEnabled) },
          ],
        }),
      });
      if (!res.ok) throw new Error('保存失败');
      toast({ title: '已保存', description: '日志清理策略已更新' });
    } catch {
      toast({ title: '错误', description: '保存设置失败', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCleanup = async () => {
    if (!confirm('确定要立即执行日志清理吗？将按当前策略清除旧数据，不可恢复。')) return;
    setCleaning(true);
    try {
      const res = await fetch('/api/admin/maintenance/cleanup-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          verifyDays: parseInt(verifyDays, 10),
          auditDays: parseInt(auditDays, 10),
          maxSizeMb: parseInt(maxSizeMb, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '清理失败');
      if (data.stats) setStats(data.stats);
      toast({ title: '清理完成', description: data.message });
    } catch {
      toast({ title: '错误', description: '清理日志失败', variant: 'destructive' });
    } finally {
      setCleaning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="h-4 w-4 text-purple-500" />
          日志维护与自动清理
        </CardTitle>
        <CardDescription className="text-xs">
          支持按保存天数、容量上限或双重超标触发清理，避免数据库无限膨胀。自动清理每 6 小时巡检一次。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center items-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {stats && (
              <div className="grid grid-cols-3 gap-3 p-3 bg-muted/30 border rounded-lg">
                <div className="space-y-0.5">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    存活数据占用
                  </span>
                  <p className="text-base font-semibold text-foreground">
                    {stats.totalSizeMb} MB
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    表物理占用 {stats.physicalSizeMb} MB
                  </p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[11px] text-muted-foreground">验证尝试日志</span>
                  <p className="text-base font-semibold text-foreground">
                    {stats.verifyCount.toLocaleString()} 条
                  </p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[11px] text-muted-foreground">管理审计日志</span>
                  <p className="text-base font-semibold text-foreground">
                    {stats.auditCount.toLocaleString()} 条
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs font-medium">清理策略模式</Label>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as 'date' | 'size' | 'both')}
                className="grid grid-cols-1 sm:grid-cols-3 gap-2"
              >
                <div className="flex items-center space-x-2 border rounded-md p-2.5 bg-card cursor-pointer">
                  <RadioGroupItem value="date" id="mode-date" />
                  <Label htmlFor="mode-date" className="cursor-pointer text-xs font-normal">
                    按天数清理
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-md p-2.5 bg-card cursor-pointer">
                  <RadioGroupItem value="size" id="mode-size" />
                  <Label htmlFor="mode-size" className="cursor-pointer text-xs font-normal">
                    按容量上限清理
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-md p-2.5 bg-card cursor-pointer">
                  <RadioGroupItem value="both" id="mode-both" />
                  <Label htmlFor="mode-both" className="cursor-pointer text-xs font-normal">
                    双重超标清理
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {(mode === 'size' || mode === 'both') && (
              <div className="grid gap-1.5 p-3 border rounded-lg bg-card">
                <Label className="text-xs flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-blue-500" />
                  日志容量阈值上限 MB
                </Label>
                <Input
                  type="number"
                  min="1"
                  value={maxSizeMb}
                  onChange={(e) => setMaxSizeMb(e.target.value)}
                  disabled={saving}
                  className="h-8 text-xs font-mono"
                  placeholder="50"
                />
                <p className="text-[10px] text-muted-foreground">
                  当日志总大小超过该数值时，将自动淘汰最早期历史记录直至容量恢复安全线
                </p>
              </div>
            )}

            {(mode === 'date' || mode === 'both') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 border rounded-lg bg-card">
                <div className="grid gap-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5 text-amber-500" />
                    验证记录保留天数
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    value={verifyDays}
                    onChange={(e) => setVerifyDays(e.target.value)}
                    disabled={saving}
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    超过此天数的验证尝试记录将被自动删除
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5 text-emerald-500" />
                    审计日志保留天数
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    value={auditDays}
                    onChange={(e) => setAuditDays(e.target.value)}
                    disabled={saving}
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    超过此天数的管理操作日志将被自动删除
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm">定时自动巡检清理</Label>
                <p className="text-[10px] text-muted-foreground">
                  开启后系统每 6 小时根据设定策略自动清理，关闭后仅支持手动点击清理
                </p>
              </div>
              <Switch checked={autoEnabled} onCheckedChange={setAutoEnabled} disabled={saving} />
            </div>

            <div className="flex justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCleanup}
                disabled={cleaning}
              >
                {cleaning ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    清理中...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5 text-destructive" />
                    立即按策略清理
                  </>
                )}
              </Button>
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
