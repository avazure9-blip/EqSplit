import type { ID, Item, SplitMethod } from '../data/types';
import { allocate, formatMoney, toMinor } from './money';

export interface ItemDraft {
  id: string;
  name: string;
  amount: string;
  personIds: ID[];
}

export interface SplitDraft {
  participants: ID[];
  currency: string;
  amountStr: string;
  payMode: 'single' | 'multi';
  payer: ID;
  paidInputs: Record<ID, string>;
  method: SplitMethod;
  excluded: ID[];
  splitInputs: Record<ID, string>;
  items: ItemDraft[];
  taxStr: string;
  tipStr: string;
}

export interface SplitResult {
  amount: number;
  paidBy: Record<ID, number>;
  owed: Record<ID, number>;
  splitInput?: Record<ID, number>;
  items?: Item[];
  tax?: number;
  tip?: number;
  payError: string | null;
  splitError: string | null;
}

const num = (s: string | undefined) => {
  const v = parseFloat((s ?? '').replace(/[, ]/g, ''));
  return Number.isFinite(v) ? v : 0;
};
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const ones = (ids: ID[]) => Object.fromEntries(ids.map((p) => [p, 1]));
const positive = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v > 0));

export const SPLIT_LABELS: Record<SplitMethod, string> = {
  equal: 'equally',
  exact: 'unequally',
  percent: 'by percentages',
  shares: 'by shares',
  adjust: 'by adjustment',
  itemized: 'by items',
};

export function computeSplit(d: SplitDraft): SplitResult {
  const P = d.participants;
  const minor = (s: string | undefined) => toMinor(s ?? '', d.currency);
  const money = (v: number) => formatMoney(v, d.currency);
  const leftOver = (diff: number) => (diff > 0 ? `${money(diff)} left to assign` : `${money(-diff)} over the total`);

  let amount: number;
  let items: Item[] | undefined;
  let tax: number | undefined;
  let tip: number | undefined;
  if (d.method === 'itemized') {
    items = d.items
      .filter((it) => it.name.trim() || minor(it.amount) > 0)
      .map((it) => ({
        id: it.id,
        name: it.name.trim() || 'Item',
        amount: minor(it.amount),
        personIds: it.personIds.filter((p) => P.includes(p)),
      }));
    tax = minor(d.taxStr);
    tip = minor(d.tipStr);
    amount = items.reduce((s, it) => s + it.amount, 0) + tax + tip;
  } else {
    amount = minor(d.amountStr);
  }

  let paidBy: Record<ID, number> = {};
  let payError: string | null = null;
  if (d.payMode === 'single') {
    if (amount > 0) paidBy = { [d.payer]: amount };
  } else {
    for (const p of P) {
      const v = minor(d.paidInputs[p]);
      if (v > 0) paidBy[p] = v;
    }
    const diff = amount - sum(paidBy);
    if (diff !== 0) payError = leftOver(diff);
  }

  let owed: Record<ID, number> = {};
  let splitError: string | null = null;
  let splitInput: Record<ID, number> | undefined;
  switch (d.method) {
    case 'equal': {
      const ids = P.filter((p) => !d.excluded.includes(p));
      if (!ids.length) splitError = 'Pick at least one person';
      else owed = allocate(amount, ones(ids));
      break;
    }
    case 'exact': {
      splitInput = {};
      for (const p of P) {
        const v = minor(d.splitInputs[p]);
        if (v > 0) splitInput[p] = v;
      }
      owed = { ...splitInput };
      const diff = amount - sum(owed);
      if (diff !== 0) splitError = leftOver(diff);
      break;
    }
    case 'percent': {
      splitInput = {};
      for (const p of P) {
        const v = num(d.splitInputs[p]);
        if (v > 0) splitInput[p] = v;
      }
      const left = Math.round((100 - sum(splitInput)) * 100) / 100;
      if (left !== 0) splitError = left > 0 ? `${left}% left to assign` : `${-left}% over 100%`;
      else owed = allocate(amount, splitInput);
      break;
    }
    case 'shares': {
      splitInput = {};
      for (const p of P) {
        const v = num(d.splitInputs[p]);
        if (v > 0) splitInput[p] = v;
      }
      if (!sum(splitInput)) splitError = 'Give at least one person a share';
      else owed = allocate(amount, splitInput);
      break;
    }
    case 'adjust': {
      splitInput = {};
      for (const p of P) {
        const v = minor(d.splitInputs[p]);
        if (v !== 0) splitInput[p] = v;
      }
      const rest = amount - sum(splitInput);
      if (rest < 0) {
        splitError = 'Adjustments are more than the total';
        break;
      }
      const base = allocate(rest, ones(P));
      for (const p of P) owed[p] = (base[p] ?? 0) + (splitInput[p] ?? 0);
      if (Object.values(owed).some((v) => v < 0)) splitError = 'Someone would owe less than nothing';
      break;
    }
    case 'itemized': {
      const subtotals: Record<ID, number> = {};
      for (const it of items ?? []) {
        if (!it.personIds.length) {
          splitError = `Pick who shares "${it.name}"`;
          continue;
        }
        for (const [p, v] of Object.entries(allocate(it.amount, ones(it.personIds)))) subtotals[p] = (subtotals[p] ?? 0) + v;
      }
      if (!items?.length) splitError = 'Add at least one item';
      const extra = allocate((tax ?? 0) + (tip ?? 0), subtotals);
      for (const p of Object.keys(subtotals)) owed[p] = subtotals[p] + (extra[p] ?? 0);
      break;
    }
  }

  return { amount, paidBy, owed: positive(owed), splitInput, items, tax: tax || undefined, tip: tip || undefined, payError, splitError };
}
