export type LicenseStatusVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export interface LicenseStatusInfo {
  label: string;
  variant: LicenseStatusVariant;
  className: string;
}

export function isExpired(date: string | Date | null | undefined): boolean {
  if (!date) return false;
  return new Date(date).getTime() < Date.now();
}

export function formatDuration(minutes?: number | null): string {
  if (minutes === undefined || minutes === null) return '-';
  if (minutes === 0) return '0分钟';
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}天`;
  if (minutes % 60 === 0) return `${minutes / 60}小时`;
  return `${minutes}分钟`;
}

export function getLicenseStatus(license?: {
  status: string;
  expirationDate: string | Date;
} | null): LicenseStatusInfo {
  if (!license) {
    return { label: '未知', variant: 'outline', className: '' };
  }

  if (license.status === 'revoked') {
    return { label: '撤销', variant: 'destructive', className: '' };
  }
  if (license.status === 'suspended') {
    return { label: '冻结', variant: 'secondary', className: '' };
  }
  if (license.status === 'unactivated') {
    return { label: '待激活', variant: 'outline', className: '' };
  }
  if (isExpired(license.expirationDate)) {
    return { label: '到期', variant: 'destructive', className: '' };
  }

  const expYear = new Date(license.expirationDate).getFullYear();
  if (expYear >= 2099) {
    return {
      label: '永久',
      variant: 'default',
      className: 'bg-primary/90 text-primary-foreground hover:bg-primary',
    };
  }

  return { label: '有效', variant: 'default', className: '' };
}
