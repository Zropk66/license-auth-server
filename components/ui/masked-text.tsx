'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Check } from 'lucide-react';

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
  /* 长按扩散动画：从按下坐标向外扩散，覆盖全组件后复制完成 */
  const rippleAnimRef = useRef<Animation | null>(null);
  /* 扩散参数快照：中心点与目标半径，供原路收回计算当前半径 */
  const expandParamsRef = useRef<{ x: number; y: number; radius: number } | null>(null);
  const { toast } = useToast();

  const rootRef = useRef<HTMLSpanElement | null>(null);
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
    /* execCommand 兜底：headless 或未授权环境下 clipboard API 会 NotAllowedError */
    const execCopy = () => {
      const textArea = document.createElement('textarea');
      textArea.value = value;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    };
    try {
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        execCopy();
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(40);
        } catch {
          /* 震动反馈失败可忽略 */
        }
      }

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

      /* 参考 ThemeToggle 的 View Transition 圆形揭示：clipPath circle 从按下点平滑扩散覆盖全组件 */
      if (rootRef.current && 'animate' in rootRef.current) {
        const rect = rootRef.current.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        const farX = Math.max(localX, rect.width - localX);
        const farY = Math.max(localY, rect.height - localY);
        const endRadius = Math.sqrt(farX * farX + farY * farY);

        rippleAnimRef.current?.cancel();
        expandParamsRef.current = { x: localX, y: localY, radius: endRadius };
        rippleAnimRef.current = rootRef.current.animate(
          {
            clipPath: [
              `circle(0px at ${localX}px ${localY}px)`,
              `circle(${endRadius}px at ${localX}px ${localY}px)`,
            ],
            backgroundColor: ['color-mix(in srgb, hsl(var(--primary)) 22%, transparent)', 'hsl(var(--primary))'],
          },
          {
            duration: 500,
            easing: 'ease-in-out',
            fill: 'forwards',
          }
        );
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        setIsPressing(false);
        /* 扩散完成：保持覆盖态直至松开，不需要收回动画 */
        expandParamsRef.current = null;
        copyToClipboard();
      }, 500);
    },
    [copyable, value, copyToClipboard]
  );

  /* 松开未扩散完成：clipPath 圆原路收回 */
  const handleEnd = useCallback(() => {
    setIsPressing(false);
    startPosRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rippleAnimRef.current) {
      const anim = rippleAnimRef.current;
      /* 记录了扩散参数时，从当前半径圆原路收回至按下点 */
      const expand = expandParamsRef.current;
      if (expand) {
        const progress = anim.effect
          ? (anim.effect.getComputedTiming().progress ?? 0)
          : 0;
        const currentRadius = expand.radius * progress;
        anim.cancel();
        const shrink = rootRef.current?.animate(
          {
            clipPath: [
              `circle(${currentRadius}px at ${expand.x}px ${expand.y}px)`,
              `circle(0px at ${expand.x}px ${expand.y}px)`,
            ],
            backgroundColor: [
              `color-mix(in srgb, hsl(var(--primary)) ${22 - Math.round(progress * 22)}%, transparent)`,
              'hsl(var(--primary) / 0)',
            ],
          },
          {
            duration: Math.max(80, (currentRadius / expand.radius) * 250),
            easing: 'ease-in',
            fill: 'forwards',
          }
        );
        if (shrink) {
          shrink.onfinish = () => {
            shrink.cancel();
          };
          rippleAnimRef.current = shrink;
        }
      } else {
        rippleAnimRef.current?.cancel();
        rippleAnimRef.current = null;
      }
    }
    if (isLongPressRef.current) {
      setTimeout(() => {
        isLongPressRef.current = false;
      }, 100);
    }
  }, []);

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      /* 长按中允许 14px 内的手部抖动，超限视为滑动取消 */
      if (!startPosRef.current) return;
      const dx = Math.abs(clientX - startPosRef.current.x);
      const dy = Math.abs(clientY - startPosRef.current.y);
      if (dx > 14 || dy > 14) {
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
    <Tooltip delayDuration={800}>
      <TooltipTrigger asChild>
        <span
          ref={rootRef}
          role="button"
          tabIndex={0}
          style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
          className={`relative flex items-center cursor-pointer select-none transition-all duration-150 px-1 py-0.5 rounded max-w-full overflow-hidden ${
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
          onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={handleEnd}
          onTouchCancel={handleEnd}
        >
          {/* 脱敏态与展开态叠放于同一网格单元：宽度恒取脱敏态，展开不改变组件尺寸 */}
          <span className="grid">
            <span
              className={`truncate transition-opacity duration-150 ${
                revealed ? 'opacity-0' : 'opacity-100'
              } col-start-1 row-start-1`}
            >
              {maskValue(value, head, tail)}
            </span>
            <span
              className={`truncate transition-opacity duration-150 ${
                revealed ? 'opacity-100' : 'opacity-0'
              } col-start-1 row-start-1`}
            >
              {value}
            </span>
          </span>
          <Check
            className={`h-3 w-3 shrink-0 ml-1 transition-all duration-150 ${
              copied
                ? 'text-green-600 dark:text-green-400 opacity-100 scale-100 w-3'
                : 'opacity-0 scale-50 w-0'
            }`}
          />
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