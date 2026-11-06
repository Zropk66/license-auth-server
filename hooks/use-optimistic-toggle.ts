'use client';

import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

export function useOptimisticToggle<T extends { id: string; enabled: boolean }>(
  setItems: React.Dispatch<React.SetStateAction<T[]>>,
  apiBasePath: string
) {
  const { toast } = useToast();

  const handleToggle = useCallback(async (item: T) => {
    const nextState = !item.enabled;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, enabled: nextState } : i))
    );

    try {
      const res = await fetch(`${apiBasePath}/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '更新状态失败');
      }
    } catch (err: any) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, enabled: !nextState } : i))
      );
      toast({
        title: '错误',
        description: err.message || '操作失败',
        variant: 'destructive',
      });
    }
  }, [setItems, apiBasePath, toast]);

  return handleToggle;
}
