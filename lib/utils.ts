import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import crypto from 'crypto';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, 'yyyy-MM-dd HH:mm');
}

export function formatOnlyDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, 'yyyy-MM-dd');
}

export function generateUserHash(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function generateLicenseKey(): string {
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }
  return segments.join('-');
}

export function isValidTurnstileToken(
  token: string | null | undefined,
  secretKey: string,
  remoteip?: string
): Promise<boolean> {
  if (!token) return Promise.resolve(false);

  const body = new URLSearchParams({
    secret: secretKey,
    response: token,
  });
  if (remoteip) {
    body.set('remoteip', remoteip);
  }

  return fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
    .then((response) => response.json())
    .then((data) => {
      return data.success === true;
    })
    .catch(() => {
      return false;
    });
}
