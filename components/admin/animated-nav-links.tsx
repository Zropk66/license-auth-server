'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function AnimatedNavLinks({
  navigation,
  pathname,
  onNavigate,
}: {
  navigation: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    const activeEl = listRef.current?.querySelector<HTMLAnchorElement>('[data-active="true"]');
    if (activeEl && listRef.current) {
      const parentTop = listRef.current.getBoundingClientRect().top;
      const rect = activeEl.getBoundingClientRect();
      setIndicator({ top: rect.top - parentTop, height: rect.height });
    }
  }, [pathname]);

  return (
    <div ref={listRef} className="relative grid gap-1">
      {indicator && (
        <div
          className="absolute left-0 right-0 rounded-md bg-primary transition-all duration-300 ease-out"
          style={{ top: indicator.top, height: indicator.height }}
        />
      )}
      {navigation.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.name}
            href={item.href}
            data-active={isActive}
            className={cn(
              'relative z-10 flex items-center gap-x-2 px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200',
              isActive
                ? 'text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
            onClick={onNavigate}
          >
            <item.icon className="h-5 w-5" />
            {item.name}
          </Link>
        );
      })}
    </div>
  );
}
