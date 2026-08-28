'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface MaskedTextProps {
  value: string;
  /** Number of characters to keep visible at the start */
  head?: number;
  /** Number of characters to keep visible at the end */
  tail?: number;
  className?: string;
  copyable?: boolean;
}

function maskValue(value: string, head: number, tail: number): string {
  if (!value) return value;
  if (value.length <= head + tail) return '*'.repeat(value.length);
  return value.slice(0, head) + '*'.repeat(Math.min(value.length - head - tail, 8)) + value.slice(-tail);
}

export function MaskedText({
  value,
  head = 4,
  tail = 4,
  className,
  copyable = true,
}: MaskedTextProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const { toast } = useToast();

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const copyToClipboard = useCallback(async () => {
    if (!value || value === '无' || value === '-') return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = value;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      try {
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate(40);
        }
      } catch {}

      toast({
        title: '已复制完整内容到剪贴板',
        description: value.length > 36 ? `${value.slice(0, 16)}...${value.slice(-12)}` : value,
      });
    } catch {
      toast({
        title: '复制失败',
        description: '请手动复制完整文本',
        variant: 'destructive',
      });
    }
  }, [value, toast]);

  const handleStart = useCallback(
    (clientX: number, clientY: number) => {
      if (!copyable || !value || value === '无' || value === '-') return;
      isLongPressRef.current = false;
      setIsPressing(true);
      startPosRef.current = { x: clientX, y: clientY };

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        setIsPressing(false);
        copyToClipboard();
      }, 450);
    },
    [copyable, value, copyToClipboard]
  );

  const handleEnd = useCallback(() => {
    setIsPressing(false);
    startPosRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (isLongPressRef.current) {
      setTimeout(() => {
        isLongPressRef.current = false;
      }, 100);
    }
  }, []);

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!startPosRef.current) return;
      const dx = Math.abs(clientX - startPosRef.current.x);
      const dy = Math.abs(clientY - startPosRef.current.y);
      if (dx > 10 || dy > 10) {
        handleEnd();
      }
    },
    [handleEnd]
  );

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isLongPressRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    setRevealed((prev) => !prev);
  }, []);

  if (!value || value === '无' || value === '-') {
    return <span className={className}>{value || '-'}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
          className={`inline-flex items-center cursor-pointer select-none transition-all duration-150 px-1 py-0.5 rounded ${
            copied
              ? 'text-green-600 bg-green-500/10 font-semibold dark:text-green-400 dark:bg-green-500/20'
              : isPressing
              ? 'scale-95 bg-muted/80'
              : 'hover:bg-muted/70 active:scale-95'
          } ${className ?? ''}`}
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setRevealed((prev) => !prev);
            }
          }}
          onMouseDown={(e) => {
            if (e.button === 0) handleStart(e.clientX, e.clientY);
          }}
          onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={(e) => {
            if (e.touches[0]) handleStart(e.touches[0].clientX, e.touches[0].clientY);
          }}
          onTouchMove={(e) => {
            if (e.touches[0]) handleMove(e.touches[0].clientX, e.touches[0].clientY);
          }}
          onTouchEnd={handleEnd}
          onTouchCancel={handleEnd}
        >
          {revealed ? value : maskValue(value, head, tail)}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        className="z-50 max-w-sm shadow-md"
        sideOffset={4}
      >
        <span className="font-mono text-xs select-all break-all">
          {copied ? '已复制' : value}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
