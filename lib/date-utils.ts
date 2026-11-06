import { format } from 'date-fns';

export function formatDateForInput(d?: Date | null): string {
  if (!d || isNaN(d.getTime())) return '';
  return format(d, 'yyyy-MM-dd HH:mm');
}

export function parseDateFromInput(str: string): Date | null {
  if (!str.trim()) return null;
  const cleanStr = str.trim().replace(/\//g, '-');
  const d = new Date(cleanStr);
  if (!isNaN(d.getTime())) return d;
  const match = cleanStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (match) {
    const [, y, m, day, h, min, s] = match;
    const parsed = new Date(
      parseInt(y, 10),
      parseInt(m, 10) - 1,
      parseInt(day, 10),
      h ? parseInt(h, 10) : 0,
      min ? parseInt(min, 10) : 0,
      s ? parseInt(s, 10) : 0
    );
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}
