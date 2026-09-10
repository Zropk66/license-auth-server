'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck,
  LayoutDashboard,
  Users,
  Key,
  Menu,
  LogOut,
  Activity,
  Settings,
  UserCog,
  ClipboardList,
  ShieldAlert,
  Package,
  Megaphone,
  AppWindow,
  Code2,
  KeyRound,
  User,
  ChevronDown,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';
import ProfileDialog from '@/components/admin/profile-dialog';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileDefaultTab, setProfileDefaultTab] = useState<'profile' | 'security' | 'activity'>('profile');
  const [role, setRole] = useState<'owner' | 'admin'>('admin');
  const [currentUsername, setCurrentUsername] = useState<string>('管理员');
  const [adminId, setAdminId] = useState<string>('');
  const [createdAt, setCreatedAt] = useState<string>('');
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

  const fetchAdminInfo = () => {
    fetch('/api/admin/me')
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('获取管理员身份失败');
      })
      .then((data) => {
        if (data && (data.role === 'owner' || data.role === 'admin')) {
          setRole(data.role);
          if (data.username) setCurrentUsername(data.username);
          if (data.id) setAdminId(data.id);
          if (data.createdAt) setCreatedAt(data.createdAt);
        }
      })
      .catch((err) => {
        console.error('获取管理员身份错误:', err);
      });
  };

  useEffect(() => {
    fetchAdminInfo();
  }, []);

  const navigation = [
    { name: '仪表盘', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: '软件管理', href: '/admin/softwares', icon: AppWindow },
    { name: '授权管理', href: '/admin/licenses', icon: Key },
    { name: '用户管理', href: '/admin/users', icon: Users },
    { name: '在线会话', href: '/admin/sessions', icon: Activity },
    { name: '版本管理', href: '/admin/software-versions', icon: Package },
    { name: '黑名单管理', href: '/admin/blacklist', icon: ShieldAlert },
    { name: '系统公告', href: '/admin/announcements', icon: Megaphone },
    { name: '开发接口', href: '/admin/api-docs', icon: Code2 },
    { name: '日志', href: '/admin/audit-logs', icon: ClipboardList },
    { name: '系统设置', href: '/admin/settings', icon: Settings },
    { name: '管理员管理', href: '/admin/managers', icon: UserCog },
  ];

  const NavLinks = () => (
    <>
      {navigation
        .filter((item) => !(item.href === '/admin/managers' && role !== 'owner'))
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

  const initialLetter = (currentUsername || 'A').charAt(0).toUpperCase();

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
              <ShieldCheck className="h-5 w-5" />
              <span className="text-lg font-semibold">管理员后台</span>
            </div>
            <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
              <NavLinks />
            </nav>
            <div className="border-t pt-4 space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => {
                  setOpen(false);
                  setProfileDefaultTab('profile');
                  setIsProfileOpen(true);
                }}
              >
                <User className="h-4 w-4" />
                个人中心
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-destructive hover:text-destructive"
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

        <div className="flex flex-1 items-center justify-end gap-3">
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2 pl-2 pr-3 py-1.5 h-auto rounded-full hover:bg-muted/80 border"
              >
                <Avatar className="h-7 w-7 bg-primary text-primary-foreground text-xs font-semibold">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                    {initialLetter}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:flex flex-col items-start text-left">
                  <span className="text-xs font-medium leading-none text-foreground">
                    {currentUsername}
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    {role === 'owner' ? '系统所有者' : '管理员'}
                  </span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{currentUsername}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {role === 'owner' ? '系统所有者' : '管理员'}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                onClick={() => {
                  setProfileDefaultTab('profile');
                  setIsProfileOpen(true);
                }}
              >
                <User className="h-4 w-4 text-muted-foreground" />
                <span>个人中心</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                onClick={() => {
                  setProfileDefaultTab('security');
                  setIsProfileOpen(true);
                }}
              >
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <span>修改登录密码</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild
                className="cursor-pointer gap-2"
              >
                <Link href="/admin/settings">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <span>系统全局设置</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                <LogOut className="h-4 w-4" />
                <span>退出登录</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

      <ProfileDialog
        open={isProfileOpen}
        onOpenChange={setIsProfileOpen}
        username={currentUsername}
        role={role}
        adminId={adminId}
        createdAt={createdAt}
        defaultTab={profileDefaultTab}
        onProfileUpdated={(newUsername) => setCurrentUsername(newUsername)}
      />
    </div>
  );
}

