import type { Repeat } from '../data/types';

const pad = (n: number) => String(n).padStart(2, '0');

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function dateParts(iso: string) {
  const d = parseISO(iso);
  return { mon: d.toLocaleString(undefined, { month: 'short' }).toUpperCase(), day: pad(d.getDate()) };
}

export function monthLabel(ym: string) {
  return parseISO(`${ym}-01`).toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

export function longDate(iso: string) {
  return parseISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function timeAgo(ms: number) {
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
}

export function addRepeat(iso: string, repeat: Repeat, anchorDay: number): string {
  const d = parseISO(iso);
  if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else if (repeat === 'fortnightly') d.setDate(d.getDate() + 14);
  else {
    const months = repeat === 'monthly' ? 1 : 12;
    const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(anchorDay, lastDay));
    return toISO(target);
  }
  return toISO(d);
}

export const REPEAT_LABELS: Record<Repeat, string> = {
  never: 'Does not repeat',
  weekly: 'Every week',
  fortnightly: 'Every 2 weeks',
  monthly: 'Every month',
  yearly: 'Every year',
};
