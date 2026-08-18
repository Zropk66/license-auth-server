'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import AdminLayout from '@/components/admin/admin-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import NotificationChannelsCard from '@/components/admin/notification-channels-card';
import UnbindPolicyCard from '@/components/admin/unbind-policy-card';
import SecurityDefenseCard from '@/components/admin/security-defense-card';
import RateLimitCard from '@/components/admin/rate-limit-card';
import LogCleanupCard from '@/components/admin/log-cleanup-card';

const formSchema = z.object({
  heartbeat_interval: z.string().refine((val) => {
    const num = parseInt(val, 10);
    return !isNaN(num) && num >= 5;
  }, {
    message: '心跳包间隔必须是大于等于 5 的正整数',
  }),
  session_timeout: z.string().refine((val) => {
    const num = parseInt(val, 10);
    return !isNaN(num) && num >= 10;
  }, {
    message: '会话超时阈值必须是大于等于 10 的正整数',
  }),
  enable_recaptcha: z.boolean(),
}).refine((data) => {
  const hb = parseInt(data.heartbeat_interval, 10);
  const to = parseInt(data.session_timeout, 10);
  return to > hb;
}, {
  message: '会话超时阈值必须大于心跳包间隔',
  path: ['session_timeout'],
});

type FormValues = z.infer<typeof formSchema>;

interface Setting {
  id: string;
  key: string;
  value: string;
  description: string | null;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasTurnstileKeys, setHasTurnstileKeys] = useState(true);

  useEffect(() => {
    fetch('/api/admin/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.role !== 'owner') {
          router.replace('/admin/dashboard');
        }
      })
      .catch(() => {});
  }, [router]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      heartbeat_interval: '30',
      session_timeout: '300',
      enable_recaptcha: true,
    },
  });

  useEffect(() => {
    async function fetchSettings() {
      try {
        const [settingsRes, publicRes] = await Promise.all([
          fetch('/api/admin/settings'),
          fetch('/api/settings/public'),
        ]);

        if (!settingsRes.ok) {
          throw new Error('获取设置失败');
        }

        const data: Setting[] = await settingsRes.json();
        const publicData = await publicRes.json();

        if (publicData && typeof publicData.turnstileSiteKey === 'string') {
          setHasTurnstileKeys(!!publicData.turnstileSiteKey);
        }

        const heartbeat = data.find(s => s.key === 'heartbeat_interval')?.value || '30';
        const timeout = data.find(s => s.key === 'session_timeout')?.value || '300';
        const recaptcha = data.find(s => s.key === 'enable_recaptcha')?.value || 'true';

        form.reset({
          heartbeat_interval: heartbeat,
          session_timeout: timeout,
          enable_recaptcha: recaptcha === 'true',
        });
      } catch (error) {
        toast({
          title: '错误',
          description: error instanceof Error ? error.message : '无法获取系统设置',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchSettings();
  }, [form, toast]);

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          settings: [
            { key: 'heartbeat_interval', value: data.heartbeat_interval },
            { key: 'session_timeout', value: data.session_timeout },
            { key: 'enable_recaptcha', value: String(data.enable_recaptcha) },
          ],
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '保存设置失败');
      }

      toast({
        title: '设置已更新',
        description: '系统设置保存成功。',
      });
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '保存设置失败',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">系统设置</h1>
          <p className="text-muted-foreground text-sm">
            管理全局客户端参数、多通道告警推送、用户换绑策略及安全防重放规则。
          </p>
        </div>

        {/* 1. 多通道实时告警与推送 */}
        <NotificationChannelsCard />

        {/* 2. 用户自助换绑策略 */}
        <UnbindPolicyCard />

        {/* 3. 安全防护与防重放 */}
        <SecurityDefenseCard />

        {/* 4. 速率限制策略 */}
        <RateLimitCard />

        {/* 5. 日志自动清理 */}
        <LogCleanupCard />

        {/* 4. 全局客户端与会话参数 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">全局客户端与会话参数</CardTitle>
            <CardDescription className="text-xs">
              配置客户端激活和心跳检测相关的超时和频率参数。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">正在加载设置...</span>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="heartbeat_interval"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">客户端心跳间隔 (秒)</FormLabel>
                          <FormControl>
                            <Input type="number" min="5" {...field} disabled={isSubmitting} className="h-8 text-xs" />
                          </FormControl>
                          <FormDescription className="text-[10px]">
                            客户端发送心跳包的默认间隔时间。
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="session_timeout"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">会话离线超时阈值 (秒)</FormLabel>
                          <FormControl>
                            <Input type="number" min="10" {...field} disabled={isSubmitting} className="h-8 text-xs" />
                          </FormControl>
                          <FormDescription className="text-[10px]">
                            判定客户端离线并清除会话的超时时间（须大于心跳间隔）。
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="enable_recaptcha"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5 flex-1">
                          <FormLabel className="text-sm">登录验证码 (Turnstile)</FormLabel>
                          <FormDescription className="text-xs">
                            启用后，管理员和用户登录界面将进行 Cloudflare Turnstile 验证。
                          </FormDescription>
                          {!hasTurnstileKeys && (
                            <p className="text-xs text-destructive mt-1">
                              ⚠ Turnstile 密钥未配置，请在 .env 中设置 NEXT_PUBLIC_TURNSTILE_SITE_KEY 和 TURNSTILE_SECRET_KEY。
                            </p>
                          )}
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end pt-2">
                    <Button type="submit" size="sm" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          正在保存...
                        </>
                      ) : (
                        <>
                          <Save className="mr-1.5 h-3.5 w-3.5" />
                          保存全局参数
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
