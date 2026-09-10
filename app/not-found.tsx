'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileQuestion, Home, LayoutDashboard, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-muted/60 shadow-sm border">
        <FileQuestion className="h-12 w-12 text-muted-foreground" />
      </div>

      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl text-foreground">
        404
      </h1>
      <p className="mt-2 text-xl font-medium text-foreground">
        页面未找到
      </p>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        您访问的资源可能已被移动、删除或临时不可用，请检查访问链接是否正确。
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button variant="outline" onClick={() => router.back()} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          返回上一页
        </Button>
        <Button asChild variant="secondary" className="gap-2">
          <Link href="/">
            <Home className="h-4 w-4" />
            返回首页
          </Link>
        </Button>
        <Button asChild className="gap-2">
          <Link href="/admin/dashboard">
            <LayoutDashboard className="h-4 w-4" />
            管理控制台
          </Link>
        </Button>
      </div>
    </div>
  );
}
