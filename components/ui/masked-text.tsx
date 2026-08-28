'use client';

import { useState, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface MaskedTextProps {
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

export function MaskedText({ value, head = 4, tail = 4, className, copyable = true }: MaskedTextProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);

  const copyToClipboard = useCallback(async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({
        title: '已复制完整内容',
        description: value.length > 24 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value,
      });
    } catch {
      toast({
        title: '复制失败',
        description: '请手动复制完整文本',
        variant: 'destructive',
      });
    }
  }, [value, toast]);

  const handleStart = useCallback(() => {
    if (!copyable || !value) return;
    isLongPressRef.current = false;
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      copyToClipboard();
    }, 450); // 450ms判定为长按
  }, [copyable, value, copyToClipboard]);

  const handleEnd = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleClick = useCallback(() => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return; // 长按复制后跳过单击反转状态
    }
    setRevealed((prev) => !prev);
  }, []);

  return (
    <span
      className={`cursor-pointer select-none transition-colors duration-150 ${
        copied ? 'text-green-600 font-semibold dark:text-green-400' : ''
      } ${className ?? ''}`}
      onClick={handleClick}
      onMouseDown={handleStart}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={handleStart}
      onTouchEnd={handleEnd}
      onTouchCancel={handleEnd}
      title={
        copied
          ? '已复制完整内容到剪贴板'
          : revealed
          ? '单击隐藏，长按可复制完整内容'
          : '单击显示，长按可复制完整内容'
      }
    >
      {revealed ? value : maskValue(value, head, tail)}
    </span>
  );
}
