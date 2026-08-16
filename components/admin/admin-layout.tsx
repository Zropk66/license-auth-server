'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ShieldCheck, LayoutDashboard, Users, Key, Menu, LogOut, Moon, Sun, Activity, Settings, UserCog, ClipboardList } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<'owner' | 'admin'>('admin');
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    } catch {
      /* 网络错误也继续跳转登录页 */
    } finally {
      router.push('/admin/login');
    }
  };

  useEffect(() => {
    fetch('/api/admin/me')
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('获取管理员身份失败');
      })
      .then((data) => {
        if (data && (data.role === 'owner' || data.role === 'admin')) {
          setRole(data.role);
        }
      })
      .catch((err) => {
        console.error('获取管理员身份错误:', err);
      });
  }, []);

  const navigation = [
    { name: '仪表盘', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: '用户管理', href: '/admin/users', icon: Users },
    { name: '授权管理', href: '/admin/licenses', icon: Key },
    { name: '在线会话', href: '/admin/sessions', icon: Activity },
    { name: '操作日志', href: '/admin/audit-logs', icon: ClipboardList },
    { name: '管理员管理', href: '/admin/managers', icon: UserCog },
    { name: '系统设置', href: '/admin/settings', icon: Settings },
  ];

  const NavLinks = () => (
    <>
      {navigation
        .filter((item) => !((item.href === '/admin/managers' || item.href === '/admin/settings') && role !== 'owner'))
        .map((item) => {
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
    <div className="flex min-h-screen flex-col">
      {/* Mobile nav */}
      <header className="sticky top-0 z-50 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static md:px-6">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">切换菜单</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex flex-col">
            <div className="flex items-center gap-2 border-b pb-4">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-lg font-semibold">管理员后台</span>
            </div>
            <nav className="flex-1 py-4 space-y-1">
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
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-semibold">授权管理系统</span>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">切换主题</span>
          </Button>
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

      <div className="flex-1 flex flex-col md:grid md:grid-cols-[220px_1fr]">
        {/* Desktop nav */}
        <aside className="hidden border-r bg-muted/40 md:block">
          <div className="flex h-full max-h-screen flex-col gap-2">
            <div className="flex-1 overflow-auto py-4 px-3">
              <nav className="grid gap-1">
                <NavLinks />
              </nav>
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
