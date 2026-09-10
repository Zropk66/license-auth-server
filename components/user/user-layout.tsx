'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Key, LayoutDashboard, Menu, LogOut } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';

interface UserLayoutProps {
  children: React.ReactNode;
}

export default function UserLayout({ children }: UserLayoutProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/user/auth/logout', { method: 'POST' });
    } catch {
      /* 网络错误也继续跳转登录页 */
    } finally {
      router.push('/user/login');
    }
  };

  const navigation = [
    { name: '控制台', href: '/user/dashboard', icon: LayoutDashboard },
  ];

  const NavLinks = () => (
    <>
      {navigation.map((item) => {
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              'flex items-center gap-x-2 px-3 py-2 text-sm font-medium rounded-md transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            )}
            onClick={() => setOpen(false)}
          >
            <item.icon className="h-5 w-5" />
            {item.name}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Mobile nav */}
      <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4 md:px-6">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">切换菜单</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex flex-col">
            <div className="flex items-center gap-2 border-b pb-4">
              <Key className="h-5 w-5" />
              <span className="text-lg font-semibold">用户中心</span>
            </div>
            <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
              <NavLinks />
            </nav>
            <div className="border-t pt-4">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                <LogOut className="mr-2 h-4 w-4" />
                退出登录
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-primary" />
          <span className="font-semibold">授权中心</span>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            className="hidden md:flex"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            退出登录
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Desktop nav */}
        <aside className="hidden w-[220px] shrink-0 border-r bg-muted/40 md:block h-full overflow-y-auto">
          <div className="py-4 px-3">
            <nav className="grid gap-1">
              <NavLinks />
            </nav>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
