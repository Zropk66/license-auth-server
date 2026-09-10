'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw, LogIn, RefreshCw } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /* 记录未捕获异常以便定位 */
    console.error('[AppRouterErrorBoundary]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 shadow-sm">
        <AlertTriangle className="h-12 w-12" />
      </div>

      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
        系统发生意外错误
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        页面加载或组件执行时出现异常，您可以尝试重新加载此页面或返回登录中心。
      </p>

      {error?.message && (
        <div className="mt-4 max-w-lg rounded-lg border bg-muted/40 p-3 text-xs font-mono text-muted-foreground break-all text-left">
          {error.message}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => reset()} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          重试加载
        </Button>
        <Button variant="outline" onClick={() => window.location.reload()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          刷新整页
        </Button>
        <Button asChild variant="secondary" className="gap-2">
          <Link href="/admin/login">
            <LogIn className="h-4 w-4" />
            返回登录页
          </Link>
        </Button>
      </div>
    </div>
  );
}
