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

export function isValidRecaptcha(
  recaptchaToken: string | null | undefined,
  secretKey: string
): Promise<boolean> {
  if (!recaptchaToken) return Promise.resolve(false);

  const verificationUrl = 'https://www.recaptcha.net/recaptcha/api/siteverify';

  // Send secret in POST body (not URL query params) to avoid leaking in logs
  const body = new URLSearchParams({
    secret: secretKey,
    response: recaptchaToken,
  });

  return fetch(verificationUrl, {
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
