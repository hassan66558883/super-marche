import i18n from '@/i18n';

const localeTag = () => (i18n.language === 'ar' ? 'ar-TD-u-nu-latn' : i18n.language === 'en' ? 'en-GB' : 'fr-FR');

export function formatDate(v: string | Date | null | undefined, withTime = false): string {
  if (!v) return '—';
  const d = typeof v === 'string' ? new Date(v) : v;
  return new Intl.DateTimeFormat(localeTag(), {
    day: '2-digit', month: '2-digit', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(d);
}

export const formatDateTime = (v: string | Date | null | undefined) => formatDate(v, true);

export function formatTime(v: string | Date): string {
  return new Intl.DateTimeFormat(localeTag(), { hour: '2-digit', minute: '2-digit' }).format(typeof v === 'string' ? new Date(v) : v);
}

export function formatLongDate(v: Date): string {
  return new Intl.DateTimeFormat(localeTag(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(v);
}

/** yyyy-mm-dd in local time (for date inputs and API filters) */
export function isoDay(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
