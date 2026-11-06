'use client';

import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Code2, ShieldCheck, Zap, Lock } from 'lucide-react';

export default function ApiDocsPage() {
  useEffect(() => {
    document.title = '开发接口 | 管理员后台';
  }, []);

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">开发接口</h1>
          <p className="text-sm text-muted-foreground mt-1">
            系统核心授权验证协议规范与端点请求响应格式文档
          </p>
        </div>

        {/* 协议与安全机制概览 */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                v2 信封加密通道
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              <p>客户端每请求随机生成 32 字节会话密钥，经 RSA-OAEP-SHA256 加密置入信封。</p>
              <p>载荷通过 AES-256-GCM 高性能加密，非受信探测统一返回混淆乱文。</p>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Ed25519 签名防篡改
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              <p>服务端下发的授权有效载荷均附加 Ed25519 纯数字签名。</p>
              <p>客户端可内嵌公钥本地验签，杜绝中间人攻击与伪造返回包。</p>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                防重放与频控保护
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              <p>每次通信必须携带唯一 Nonce 随机串与毫秒级 Timestamp 时间戳。</p>
              <p>服务端配备内存滑动窗口与自动黑名单封禁策略。</p>
            </CardContent>
          </Card>
        </div>

        {/* 核心端点说明 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">核心通信端点</CardTitle>
            <CardDescription>
              客户端运行时与授权鉴权中心交互的核心接口
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="font-mono">POST</Badge>
                  <span className="font-mono text-sm font-semibold">/api/license-verification/verify</span>
                </div>
                <Badge variant="outline">授权验证与首次激活</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                用于软件启动时进行卡密鉴权。对于时长卡，首次调用将正式开启倒计时计算到期时间；对于已启用 HWID 绑定的授权，将锁定当前设备。
              </p>
              <div className="space-y-1.5">
                <div className="text-xs font-mono bg-muted/40 p-2.5 rounded border">
                  <span className="text-muted-foreground block mb-1 font-sans text-[11px]">请求体明文参数:</span>
                  &#123; licenseKey: string, softwareName: string, hwid: string, deviceName?: string, nonce: string, timestamp: number &#125;
                </div>
                <div className="text-xs font-mono bg-muted/40 p-2.5 rounded border">
                  <span className="text-muted-foreground block mb-1 font-sans text-[11px]">解密后响应数据:</span>
                  &#123; valid: boolean, licenseKey: string, sessionId: string, heartbeatInterval: number, payload: &#123; nonceHex: string, cipherHex: string, signatureHex: string &#125; &#125;
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="font-mono">POST</Badge>
                  <span className="font-mono text-sm font-semibold">/api/license-verification/heartbeat</span>
                </div>
                <Badge variant="outline">会话心跳与在线保活</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                客户端在运行期间按照指定的心跳间隔周期性上报，以保持会话活跃并更新最后在线状态。
              </p>
              <div className="space-y-1.5">
                <div className="text-xs font-mono bg-muted/40 p-2.5 rounded border">
                  <span className="text-muted-foreground block mb-1 font-sans text-[11px]">请求体明文参数:</span>
                  &#123; licenseKey: string, softwareName?: string, sessionId: string, hwid?: string, deviceName?: string, nonce: string, timestamp: number &#125;
                </div>
                <div className="text-xs font-mono bg-muted/40 p-2.5 rounded border">
                  <span className="text-muted-foreground block mb-1 font-sans text-[11px]">解密后响应数据:</span>
                  &#123; status: &quot;active&quot;, sessionId: string, heartbeatInterval: number, timestamp: number &#125;
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="font-mono">POST</Badge>
                  <span className="font-mono text-sm font-semibold">/api/license-verification/veil</span>
                </div>
                <Badge variant="outline">Veil 零基线证书固定双向通道</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                纯 JSON over TLS 协议通道，内置证书固定与客户端反调试代码完整性证据校验。载荷经 HKDF 派生密钥与 AES-256-GCM 封装下发。
              </p>
              <div className="space-y-1.5">
                <div className="text-xs font-mono bg-muted/40 p-2.5 rounded border">
                  <span className="text-muted-foreground block mb-1 font-sans text-[11px]">请求参数:</span>
                  &#123; licenseKey: string, softwareName: string, hwid: string, deviceName?: string, nonce: string, timestamp: number, evidence: string, evidenceLayout?: string, versionCode?: number &#125;
                </div>
                <div className="text-xs font-mono bg-muted/40 p-2.5 rounded border">
                  <span className="text-muted-foreground block mb-1 font-sans text-[11px]">响应数据:</span>
                  &#123; success: boolean, licenseKey: string, sessionId: string, heartbeatInterval: number, envelope: &#123; issuedAt: number, nonceHex: string, cipherHex: string, tagHex: string, signatureHex: string &#125; &#125;
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="font-mono">POST</Badge>
                  <span className="font-mono text-sm font-semibold">/api/license-verification/offline</span>
                </div>
                <Badge variant="outline">客户端正常下线通知</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                客户端进程正常退出时主动发起通知，立即释放当前设备占用会话，便于下次快速拉起或换端。
              </p>
              <div className="text-xs font-mono bg-muted/40 p-2.5 rounded border">
                请求参数: &#123; licenseKey: string, hwid: string, sessionId: string &#125;
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="font-mono">POST</Badge>
                  <span className="font-mono text-sm font-semibold">/api/user/licenses/:id/unbind</span>
                </div>
                <Badge variant="outline">用户自主解除设备绑定</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                用户账号登录授权中心后，可在其权限范围内自主解绑当前卡密绑定的设备 HWID。
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 动态载荷与心跳协议规范 */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Code2 className="h-4 w-4 text-purple-500" />
              解封授权载荷与随机心跳格式规范
            </CardTitle>
            <CardDescription className="text-xs">
              客户端解密授权响应后获得的二进制数据布局与动态心跳处理标准
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="p-3 bg-muted/30 border rounded-lg space-y-2">
              <span className="font-semibold text-foreground">解密后明文载荷二进制布局：</span>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground font-mono">
                <li>00 ~ 07 字节: issuedAt 8字节 uint64 LE 毫秒时间戳</li>
                <li>08 ~ 15 字节: expiresAt 8字节 uint64 LE 毫秒时间戳，0 代表永久授权</li>
                <li>16 字节之后: 自定义载荷 UTF-8 JSON 字符串，含服务端合并下发的 sig 与 offset 字典</li>
              </ul>
            </div>
            <div className="p-3 bg-muted/30 border rounded-lg space-y-2 text-muted-foreground">
              <span className="font-semibold text-foreground">授权状态位与响应签名：</span>
              <p>载荷 JSON 内保留键 <code className="font-mono">_flags</code> 承载授权状态，处于签名与加密覆盖范围内，权威性高于明文 status：</p>
              <ul className="list-disc list-inside space-y-1 font-mono">
                <li>0x01: active 正常授权</li>
                <li>0x02: revoked 已撤销</li>
                <li>0x04: suspended 已冻结</li>
                <li>0x08: unactivated 待激活</li>
                <li>0x10: HWID 设备绑定已启用</li>
              </ul>
              <p className="pt-1">veil 端点响应体整体经 Ed25519 签名，返回 <code className="font-mono">{`{ data, signature }`}</code>。客户端必须验证签名后再采信 success、status、expirationDate 等明文字段。</p>
            </div>
            <div className="p-3 bg-muted/30 border rounded-lg space-y-1 text-muted-foreground">
              <span className="font-semibold text-foreground block">动态随机心跳机制：</span>
              <p>每次验证与心跳响应均下发 heartbeatInterval 数值。开启随机心跳后该数值为动态抽取。客户端严禁使用固定间隔，须根据每次响应下发的数值动态规划下次请求。</p>
            </div>
          </CardContent>
        </Card>

      </div>
    </>
  );
}