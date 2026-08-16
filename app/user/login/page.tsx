'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Key, Loader2 } from 'lucide-react';
import Turnstile from '@/components/turnstile';
import { useToast } from '@/hooks/use-toast';

const formSchema = z.object({
  userHash: z.string().min(1, '用户哈希是必填项'),
});

type FormValues = z.infer<typeof formSchema>;

export default function UserLogin() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [enableCaptcha, setEnableCaptcha] = useState(true);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('');

  useEffect(() => {
    fetch('/api/settings/public')
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.enableRecaptcha === 'boolean') {
          setEnableCaptcha(data.enableRecaptcha);
        }
        if (data && typeof data.turnstileSiteKey === 'string') {
          setTurnstileSiteKey(data.turnstileSiteKey);
        }
      })
      .catch((err) => {
        console.error('Error fetching settings:', err);
      });
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      userHash: '',
    },
  });

  const onSubmit = async (data: FormValues) => {
    if (enableCaptcha && !turnstileToken) {
      toast({
        title: '需要验证码验证',
        description: '请完成验证码验证',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/user/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          turnstileToken: enableCaptcha ? turnstileToken : null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '登录失败');
      }

      toast({
        title: '登录成功',
        description: '正在跳转至控制台...',
      });

      router.push('/user/dashboard');
    } catch (error) {
      toast({
        title: '登录失败',
        description: error instanceof Error ? error.message : '发生未知错误',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <Key className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-2xl text-center">用户登录</CardTitle>
          <CardDescription className="text-center">
            输入您的用户哈希以访问您的软件授权
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="userHash"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>用户哈希</FormLabel>
                    <FormControl>
                      <Input placeholder="请输入您的用户哈希" {...field} disabled={isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {enableCaptcha && turnstileSiteKey && (
                <div className="pt-2 pb-4 flex justify-center">
                  <Turnstile
                    siteKey={turnstileSiteKey}
                    onVerify={setTurnstileToken}
                    onErrored={() => {
                      toast({
                        title: '验证码加载失败',
                        description: '无法加载验证码，请检查网络连接或刷新页面重试。',
                        variant: 'destructive',
                      });
                    }}
                  />
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在登录...
                  </>
                ) : (
                  '登录'
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground text-center">
            您的用户哈希由您的管理员提供。
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
