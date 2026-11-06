'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SettingCardProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

export function SettingCard({
  title,
  description,
  icon: Icon,
  headerAction,
  footer,
  className,
  contentClassName,
  children,
}: SettingCardProps) {
  return (
    <Card className={cn('border-border/40 bg-card shadow-sm', className)}>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 pb-4 border-b border-border/20">
        <div className="flex items-center gap-2.5">
          {Icon && <Icon className="h-5 w-5 text-primary shrink-0" />}
          <div>
            <CardTitle className="text-base font-semibold tracking-tight">{title}</CardTitle>
            {description && <CardDescription className="text-xs text-muted-foreground mt-0.5">{description}</CardDescription>}
          </div>
        </div>
        {headerAction && <div className="flex items-center gap-2">{headerAction}</div>}
      </CardHeader>
      <CardContent className={cn('pt-4', contentClassName)}>{children}</CardContent>
      {footer && <CardFooter className="border-t border-border/20 py-3 bg-muted/10">{footer}</CardFooter>}
    </Card>
  );
}
