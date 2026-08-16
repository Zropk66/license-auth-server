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
import ReCAPTCHA from 'react-google-recaptcha';
import { useToast } from '@/hooks/use-toast';

// 使用 recaptcha.net 替代 google.com，改善部分地区可访问性
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).recaptchaOptions = {
    useRecaptchaNet: true,
  };
}

const formSchema = z.object({
  userHash: z.string().min(1, '用户哈希是必填项'),
});

type FormValues = z.infer<typeof formSchema>;

export default function UserLogin() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [enableRecaptcha, setEnableRecaptcha] = useState(true);
  const [recaptchaSiteKey, setRecaptchaSiteKey] = useState('');

  useEffect(() => {
    fetch('/api/settings/public')
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.enableRecaptcha === 'boolean') {
          setEnableRecaptcha(data.enableRecaptcha);
        }
        if (data && typeof data.recaptchaSiteKey === 'string') {
          setRecaptchaSiteKey(data.recaptchaSiteKey);
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
    if (enableRecaptcha && !recaptchaToken) {
      toast({
        title: '需要 reCAPTCHA 验证',
        description: '请完成 reCAPTCHA 验证',
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
          recaptchaToken: enableRecaptcha ? recaptchaToken : null,
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

              {enableRecaptcha && recaptchaSiteKey && (
                <div className="pt-2 pb-4 flex justify-center">
                  <ReCAPTCHA
                    sitekey={recaptchaSiteKey}
                    onChange={setRecaptchaToken}
                    onErrored={() => {
                      toast({
                        title: '验证码加载失败',
                        description: '无法加载 reCAPTCHA，请检查网络连接或刷新页面重试。',
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