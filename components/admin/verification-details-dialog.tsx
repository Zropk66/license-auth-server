'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Key,
  Copy,
  Check,
  Server,
  Smartphone,
  ShieldAlert,
  ShieldCheck,
  Clock,
  ExternalLink,
  Ban,
  Package,
  FileJson,
  Loader2,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export interface VerificationLogItem {
  id: string;
  licenseKey: string | null;
  softwareName?: string | null;
  hwid?: string | null;
  deviceName?: string | null;
  ipAddress: string;
  success: boolean;
  reason: string | null;
  createdAt: string;
}

interface VerificationDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: VerificationLogItem | null;
  onBlacklistAdded?: () => void;
}

const REASON_MAP: Record<string, { label: string; desc: string }> = {
  success: {
    label: '验证成功',
    desc: '客户端身份、卡密状态、HWID 与防重放签名均通过校验，已颁发签名授权凭证。',
  },
  ip_blacklisted: {
    label: 'IP 在黑名单中',
    desc: '请求客户端 IP 地址已命中系统黑名单，请求在解密前置层被直接阻断。',
  },
  rate_limited: {
    label: '请求过于频繁 (限流)',
    desc: '客户端发起验证频率超过系统限流阈值，已临时阻断。',
  },
  blocked_due_to_rate_limit: {
    label: '短时间内多次失败被阻断',
    desc: '该 IP 5 分钟内连续失败次数过多，触发防撞库防御机制阻断。',
  },
  invalid_envelope: {
    label: '加密信封解密失败',
    desc: '无法使用 RSA 私钥解密客户端 AES 会话密钥或数据格式损坏。',
  },
  hwid_blacklisted: {
    label: '设备 HWID 在黑名单中',
    desc: '该设备的硬件特征码 (HWID) 已被管理员拉入黑名单封禁。',
  },
  anti_replay_failed: {
    label: '防重放/时间戳校验失败',
    desc: '请求 Nonce 已被使用或时间戳偏差超过允许窗口 (300 秒)，疑似重放攻击或客户端系统时间偏差。',
  },
  missing_software_name: {
    label: '缺少软件标识',
    desc: '客户端上报的请求体中缺少 softwareName 字段。',
  },
  missing_license_key: {
    label: '缺少卡密',
    desc: '客户端上报的请求体中未携带 licenseKey。',
  },
  invalid_license_key: {
    label: '卡密无效或不存在',
    desc: '数据库中未检索到该卡密记录，可能卡密已被删除或输入错误。',
  },
  software_mismatch: {
    label: '卡密所属软件不匹配',
    desc: '该卡密属于其他软件，不能用于当前请求的软件产品。',
  },
  software_disabled: {
    label: '软件已被管理员停用',
    desc: '该软件已被管理员设为停用状态，该软件下的全部授权暂停服务。',
  },
  license_revoked: {
    label: '卡密已被撤销/吊销',
    desc: '该授权卡密已被管理员废弃撤销，已永久失效。',
  },
  license_suspended: {
    label: '卡密已被冻结/暂停',
    desc: '该授权卡密目前处于冻结状态，暂不可验证使用。',
  },
  license_expired: {
    label: '卡密已过期',
    desc: '该授权卡密的有效期限已过，需要续费或延期。',
  },
  hwid_required: {
    label: '未提供设备 HWID',
    desc: '该卡密已开启硬件绑定，但客户端请求中未提供设备特征码。',
  },
  hwid_mismatch: {
    label: '设备 HWID 与已绑定设备不匹配',
    desc: '该卡密已绑定至其他硬件设备，当前设备特征码与绑定值不一致。',
  },
};

export default function VerificationDetailsDialog({
  open,
  onOpenChange,
  log,
  onBlacklistAdded,
}: VerificationDetailsDialogProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isBlacklisting, setIsBlacklisting] = useState(false);

  if (!log) return null;

  let displaySoftware = log.softwareName;
  let displayHwid = log.hwid;
  if ((!displaySoftware || !displayHwid) && log.reason) {
    const matchApp = log.reason.match(/app:([^, \]]+)/);
    const matchHwid = log.reason.match(/hwid:([^, \]]+)/);
    if (!displaySoftware && matchApp) displaySoftware = matchApp[1];
    if (!displayHwid && matchHwid) displayHwid = matchHwid[1];
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
    toast({
      title: '已复制到剪贴板',
      description: `${label} 已成功复制`,
    });
  };

  const parseReason = (reasonStr: string | null) => {
    if (!reasonStr) {
      return log.success ? REASON_MAP.success : { label: '未知状态', desc: '未记录具体错误代码' };
    }
    const bracketIndex = reasonStr.indexOf(' [');
    const code = bracketIndex !== -1 ? reasonStr.slice(0, bracketIndex) : reasonStr;

    const base = REASON_MAP[code] || { label: code, desc: '自定义或未知系统代码' };
    return {
      label: base.label,
      desc: base.desc,
      code,
    };
  };

  const reasonInfo = parseReason(log.reason);

  const handleNavigateToLicense = async () => {
    if (!log.licenseKey) return;
    setIsNavigating(true);
    try {
      const res = await fetch(`/api/admin/licenses?key=${encodeURIComponent(log.licenseKey)}`);
      if (!res.ok) {
        if (res.status === 404) {
          toast({
            title: '未找到授权',
            description: '该卡密可能已被删除',
            variant: 'destructive',
          });
          return;
        }
        throw new Error('查询授权失败');
      }
      const license = (await res.json()) as { id: string };
      onOpenChange(false);
      router.push(`/admin/licenses/${license.id}`);
    } catch (err: any) {
      toast({
        title: '跳转失败',
        description: err.message || '查询授权时出错',
        variant: 'destructive',
      });
    } finally {
      setIsNavigating(false);
    }
  };

  const handleQuickBlacklist = async (type: 'ip' | 'hwid', value: string) => {
    setIsBlacklisting(true);
    try {
      const res = await fetch('/api/admin/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          value,
          reason: `从验证日志快速拉黑 (${log.reason || '拦截记录'})`,
          days: 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '添加黑名单失败');
      }
      toast({
        title: '拉黑成功',
        description: `已将 ${type === 'ip' ? 'IP' : 'HWID'}「${value}」永久拉入黑名单`,
      });
      onBlacklistAdded?.();
    } catch (err: any) {
      toast({
        title: '拉黑失败',
        description: err.message || '操作失败',
        variant: 'destructive',
      });
    } finally {
      setIsBlacklisting(false);
    }
  };

  const copyDiagnosticJson = () => {
    const payload = {
      id: log.id,
      requestTime: log.createdAt,
      success: log.success,
      reasonCode: log.reason,
      reasonText: reasonInfo.label,
      softwareName: displaySoftware || null,
      licenseKey: log.licenseKey || null,
      ipAddress: log.ipAddress,
      hwid: displayHwid || null,
      deviceName: log.deviceName || null,
    };
    copyToClipboard(JSON.stringify(payload, null, 2), '完整 JSON 诊断报文');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-5 border-b bg-card">
          <div className="flex items-center justify-between gap-3 pr-6">
            <div className="flex items-center gap-2.5">
              {log.success ? (
                <div className="h-9 w-9 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-5 w-5" />
                </div>
              ) : (
                <div className="h-9 w-9 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                  <ShieldAlert className="h-5 w-5" />
                </div>
              )}
              <div>
                <DialogTitle className="text-base font-semibold flex items-center gap-2">
                  <span>授权验证记录详情</span>
                  {log.success ? (
                    <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-xs">
                      验证成功
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">
                      拦截拒绝
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5 flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{formatDate(log.createdAt)}</span>
                  <span>•</span>
                  <span className="font-mono">{log.id}</span>
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 诊断结论卡片 */}
          <div
            className={`p-3.5 rounded-lg border ${
              log.success
                ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40'
                : 'bg-destructive/5 dark:bg-destructive/10 border-destructive/20'
            }`}
          >
            <div className="text-xs font-semibold text-foreground flex items-center justify-between mb-1">
              <span>验证诊断结论</span>
              <span className="font-mono text-[11px] text-muted-foreground">{log.reason || 'success'}</span>
            </div>
            <div className="text-sm font-medium text-foreground">{reasonInfo.label}</div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{reasonInfo.desc}</p>
          </div>

          {/* 详细环境与身份字段 */}
          <div className="space-y-2.5">
            <div className="text-xs font-semibold text-foreground">请求环境与参数</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* 所属软件 */}
              <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-primary" />
                  所属软件
                </div>
                <div className="font-medium text-xs text-foreground flex items-center justify-between pt-0.5">
                  <span>{log.softwareName || '-'}</span>
                  {log.softwareName && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(log.softwareName!, '软件名')}
                    >
                      {copiedKey === '软件名' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  )}
                </div>
              </div>

              {/* 设备名称 */}
              <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 text-primary" />
                  上报设备名称
                </div>
                <div className="font-medium text-xs text-foreground flex items-center justify-between pt-0.5">
                  <span>{log.deviceName || '-'}</span>
                  {log.deviceName && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(log.deviceName!, '设备名称')}
                    >
                      {copiedKey === '设备名称' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* 授权卡密 */}
            <div className="p-3 rounded-lg border bg-card space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-primary" />
                  请求授权卡密 (License Key)
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap bg-muted/30 p-2 rounded border">
                <span className="font-mono text-xs font-semibold text-foreground select-all break-all">
                  {log.licenseKey || '未提供卡密'}
                </span>
                {log.licenseKey && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2 gap-1"
                      onClick={() => copyToClipboard(log.licenseKey!, '授权卡密')}
                    >
                      {copiedKey === '授权卡密' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      复制
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2 gap-1 text-primary"
                      onClick={handleNavigateToLicense}
                      disabled={isNavigating}
                    >
                      {isNavigating ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                      管理授权
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* 客户端 IP */}
            <div className="p-3 rounded-lg border bg-card space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Server className="h-3.5 w-3.5 text-primary" />
                  客户端 IP 地址
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap bg-muted/30 p-2 rounded border">
                <span className="font-mono text-xs font-semibold text-foreground select-all">
                  {log.ipAddress}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2 gap-1"
                    onClick={() => copyToClipboard(log.ipAddress, '客户端 IP')}
                  >
                    {copiedKey === '客户端 IP' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    复制 IP
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2 gap-1 text-destructive hover:bg-destructive/10 border-destructive/20"
                    onClick={() => handleQuickBlacklist('ip', log.ipAddress)}
                    disabled={isBlacklisting}
                  >
                    <Ban className="h-3 w-3" />
                    拉黑 IP
                  </Button>
                </div>
              </div>
            </div>

            {/* 硬件特征码 HWID */}
            <div className="p-3 rounded-lg border bg-card space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 text-primary" />
                  设备硬件特征码 (HWID)
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap bg-muted/30 p-2 rounded border">
                <span className="font-mono text-xs font-semibold text-foreground select-all break-all">
                  {log.hwid || '未上报特征码'}
                </span>
                {log.hwid && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2 gap-1"
                      onClick={() => copyToClipboard(log.hwid!, '硬件特征码')}
                    >
                      {copiedKey === '硬件特征码' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      复制 HWID
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2 gap-1 text-destructive hover:bg-destructive/10 border-destructive/20"
                      onClick={() => handleQuickBlacklist('hwid', log.hwid!)}
                      disabled={isBlacklisting}
                    >
                      <Ban className="h-3 w-3" />
                      拉黑 HWID
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-3 px-5 border-t bg-muted/20 flex items-center justify-between gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={copyDiagnosticJson}
          >
            <FileJson className="h-3.5 w-3.5" />
            复制 JSON 报文
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-8 text-xs px-4"
            onClick={() => onOpenChange(false)}
          >
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
