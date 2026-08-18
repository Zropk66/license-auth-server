'use client';

import { useState } from 'react';

interface MaskedTextProps {
  value: string;
  /** Number of characters to keep visible at the start */
  head?: number;
  /** Number of characters to keep visible at the end */
  tail?: number;
  className?: string;
}

function maskValue(value: string, head: number, tail: number): string {
  if (!value) return value;
  if (value.length <= head + tail) return '*'.repeat(value.length);
  return value.slice(0, head) + '*'.repeat(Math.min(value.length - head - tail, 8)) + value.slice(-tail);
}

export function MaskedText({ value, head = 4, tail = 4, className }: MaskedTextProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <span
      className={`cursor-pointer select-none ${className ?? ''}`}
      onClick={() => setRevealed(!revealed)}
      title={revealed ? '点击隐藏' : '点击显示完整内容'}
    >
      {revealed ? value : maskValue(value, head, tail)}
    </span>
  );
}
