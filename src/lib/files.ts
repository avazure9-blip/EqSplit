import type { Expense, ID } from '../data/types';
import { category } from './categories';
import { decimals, fromMinor } from './money';

export function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function expensesCsv(
  expenses: Expense[],
  people: ID[],
  nameOf: (id: ID) => string,
  groupName: (id: ID) => string,
): string {
  const rows: (string | number)[][] = [['Date', 'Description', 'Category', 'Group', 'Cost', 'Currency', ...people.map(nameOf)]];
  const totals: Record<string, Record<ID, number>> = {};
  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
  for (const e of sorted) {
    const dec = decimals(e.currency);
    const t = (totals[e.currency] ??= {});
    rows.push([
      e.date,
      e.isPayment ? 'Payment' : e.description,
      e.isPayment ? 'Payment' : category(e.category).name,
      groupName(e.groupId),
      fromMinor(e.amount, e.currency).toFixed(dec),
      e.currency,
      ...people.map((p) => {
        const net = (e.paidBy[p] ?? 0) - (e.owed[p] ?? 0);
        t[p] = (t[p] ?? 0) + net;
        return fromMinor(net, e.currency).toFixed(dec);
      }),
    ]);
  }
  rows.push([]);
  for (const [cur, t] of Object.entries(totals)) {
    rows.push(['', 'Total balance', '', '', '', cur, ...people.map((p) => fromMinor(t[p] ?? 0, cur).toFixed(decimals(cur)))]);
  }
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}

export async function compressImage(file: File, maxDim = 1400): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read image'));
      i.src = url;
    });
    let dim = maxDim;
    for (;;) {
      const scale = Math.min(1, dim / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const q of [0.7, 0.55, 0.4]) {
        const data = canvas.toDataURL('image/jpeg', q);
        if (data.length < 700_000) return data;
      }
      dim = Math.round(dim * 0.7);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
