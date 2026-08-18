'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Trash2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Setting {
  key: string;
  value: string;
}

export default function LogCleanupCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [verifyDays, setVerifyDays] = useState('7');
  const [auditDays, setAuditDays] = useState('90');
  const [autoEnabled, setAutoEnabled] = useState(true);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((res) => res.json())
      .then((data: Setting[]) => {
        const vd = data.find((s) => s.key === 'log_cleanup_verify_days')?.value;
        const ad = data.find((s) => s.key === 'log_cleanup_audit_days')?.value;
        const ae = data.find((s) => s.key === 'log_cleanup_auto_enabled')?.value;
        if (vd) setVerifyDays(vd);
        if (ad) setAuditDays(ad);
        if (ae !== undefined) setAutoEnabled(ae !== 'false');
      })
      .catch(() => {
        toast({ title: '错误', description: '获取日志清理设置失败', variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, [toast]);

  const handleSave = async () => {
    const vd = parseInt(verifyDays, 10);
    const ad = parseInt(auditDays, 10);
    if (isNaN(vd) || vd < 1) {
      toast({ title: '错误', description: '验证记录保留天数必须为正整数', variant: 'destructive' });
      return;
    }
    if (isNaN(ad) || ad < 1) {
      toast({ title: '错误', description: '审计日志保留天数必须为正整数', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: [
            { key: 'log_cleanup_verify_days', value: verifyDays },
            { key: 'log_cleanup_audit_days', value: auditDays },
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
    if (!confirm('确定要立即执行日志清理吗？此操作将删除超过保留期限的记录，不可恢复。')) return;
    setCleaning(true);
    try {
      const res = await fetch('/api/admin/maintenance/cleanup-logs', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '清理失败');
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
        <CardTitle className="text-base">日志自动清理</CardTitle>
        <CardDescription className="text-xs">
          定期清理验证尝试记录与审计日志，避免数据库无限膨胀。自动清理每 6 小时执行一次。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center items-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label className="text-xs">验证记录保留天数</Label>
                <Input
                  type="number"
                  min="1"
                  value={verifyDays}
                  onChange={(e) => setVerifyDays(e.target.value)}
                  disabled={saving}
                  className="h-8 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  超过此天数的验证尝试记录将被自动删除
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">审计日志保留天数</Label>
                <Input
                  type="number"
                  min="1"
                  value={auditDays}
                  onChange={(e) => setAuditDays(e.target.value)}
                  disabled={saving}
                  className="h-8 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  超过此天数的审计操作日志将被自动删除
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm">自动清理</Label>
                <p className="text-[10px] text-muted-foreground">
                  开启后每 6 小时自动执行一次清理，关闭则仅支持手动触发
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
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    立即清理
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
