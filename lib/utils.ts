import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import crypto from 'crypto';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, 'yyyy-MM-dd HH:mm:ss');
}

export function formatOnlyDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, 'yyyy-MM-dd');
}

export interface ExpirationRemainingInfo {
  text: string;
  detailText: string;
  isExpired: boolean;
  isPermanent: boolean;
  isUnactivated: boolean;
  colorClass: string;
}

export function formatLicenseRemaining(
  expirationDate: string | Date,
  status?: string,
  licenseType?: string,
  duration?: number | null
): ExpirationRemainingInfo {
  if (status === 'unactivated' && licenseType === 'duration') {
    let durStr = '待激活';
    if (duration) {
      if (duration % (24 * 60) === 0) durStr = `待激活 (${duration / 1440}天)`;
      else if (duration % 60 === 0) durStr = `待激活 (${duration / 60}小时)`;
      else durStr = `待激活 (${duration}分钟)`;
    }
    return {
      text: durStr,
      detailText: '尚未在客户端首次登录激活',
      isExpired: false,
      isPermanent: false,
      isUnactivated: true,
      colorClass: 'text-blue-600 dark:text-blue-400 font-medium',
    };
  }

  const expDate = typeof expirationDate === 'string' ? new Date(expirationDate) : expirationDate;
  if (expDate.getFullYear() >= 2099) {
    return {
      text: '永久有效',
      detailText: formatDate(expDate),
      isExpired: false,
      isPermanent: true,
      isUnactivated: false,
      colorClass: 'text-purple-600 dark:text-purple-400 font-medium',
    };
  }

  const now = Date.now();
  const diffMs = expDate.getTime() - now;

  if (diffMs > 0) {
    const totalMinutes = Math.floor(diffMs / 60000);
    const totalHours = Math.floor(diffMs / 3600000);
    const totalDays = Math.floor(diffMs / 86400000);

    let text = '';
    let colorClass = 'text-emerald-600 dark:text-emerald-400 font-medium';

    if (totalDays >= 1) {
      text = `剩余 ${totalDays} 天`;
      if (totalDays <= 3) {
        colorClass = 'text-amber-600 dark:text-amber-400 font-medium';
      }
    } else if (totalHours >= 1) {
      text = `剩余 ${totalHours} 小时`;
      colorClass = 'text-amber-600 dark:text-amber-400 font-medium';
    } else {
      text = `剩余 ${Math.max(1, totalMinutes)} 分钟`;
      colorClass = 'text-rose-600 dark:text-rose-400 font-semibold';
    }

    return {
      text,
      detailText: formatDate(expDate),
      isExpired: false,
      isPermanent: false,
      isUnactivated: false,
      colorClass,
    };
  } else {
    const absMs = Math.abs(diffMs);
    const totalMinutes = Math.floor(absMs / 60000);
    const totalHours = Math.floor(absMs / 3600000);
    const totalDays = Math.floor(absMs / 86400000);

    let text = '';
    if (totalDays >= 1) {
      text = `已过期 ${totalDays} 天`;
    } else if (totalHours >= 1) {
      text = `已过期 ${totalHours} 小时`;
    } else {
      text = `已过期 ${Math.max(1, totalMinutes)} 分钟`;
    }

    return {
      text,
      detailText: formatDate(expDate),
      isExpired: true,
      isPermanent: false,
      isUnactivated: false,
      colorClass: 'text-rose-600 dark:text-rose-400 line-through opacity-80',
    };
  }
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
    signal: AbortSignal.timeout(5000),
  })
    .then((response) => response.json())
    .then((data) => {
      return data.success === true;
    })
    .catch(() => {
      return false;
    });
}
