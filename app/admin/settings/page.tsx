'use client';

import { useEffect, useState } from 'react';
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasTurnstileKeys, setHasTurnstileKeys] = useState(true);

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">系统设置</h1>
      </div>

      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>全局客户端与会话参数</CardTitle>
            <CardDescription>
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
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="heartbeat_interval"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>客户端心跳间隔 (秒)</FormLabel>
                        <FormControl>
                          <Input type="number" min="5" {...field} disabled={isSubmitting} />
                        </FormControl>
                        <FormDescription>
                          客户端向服务器发送心跳包的默认间隔时间，更短的时间可以更快检测客户端状态，但会增加服务器请求负荷。
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
                        <FormLabel>会话离线超时阈值 (秒)</FormLabel>
                        <FormControl>
                          <Input type="number" min="10" {...field} disabled={isSubmitting} />
                        </FormControl>
                        <FormDescription>
                          如果客户端在此时长内未发送心跳，系统将判定其已离线并清除其会话。该值必须大于心跳间隔时间（建议至少为心跳间隔的 2-3 倍）。
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="enable_recaptcha"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5 flex-1">
                          <FormLabel className="text-base">登录验证码 (Turnstile)</FormLabel>
                          <FormDescription>
                            启用后，管理员和用户登录界面将进行 Cloudflare Turnstile 验证。
                          </FormDescription>
                          {!hasTurnstileKeys && (
                            <p className="text-sm text-destructive mt-2">
                              ⚠ Turnstile 密钥未配置，请在 .env 中设置 NEXT_PUBLIC_TURNSTILE_SITE_KEY 和 TURNSTILE_SECRET_KEY 后重启容器。
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

                  <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          正在保存...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          保存设置
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
