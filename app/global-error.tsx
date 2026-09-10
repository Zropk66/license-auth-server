'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /* 捕获根级错误便于排查全局崩溃 */
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center text-center max-w-md">
          <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 shadow-sm">
            <AlertTriangle className="h-10 w-10" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            应用程序发生严重错误
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            全局视图无法正常加载，请尝试恢复或重新加载。
          </p>

          <div className="mt-6 flex gap-3">
            <Button onClick={() => reset()} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              重新尝试
            </Button>
            <Button variant="outline" onClick={() => { window.location.href = '/admin/login'; }}>
              返回登录页
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
