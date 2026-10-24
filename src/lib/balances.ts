import type { Expense, Group, ID } from '../data/types';

export type ByCurrency = Record<string, number>;
export type NetBalances = Record<string, Record<ID, number>>;

export interface Debt {
  from: ID;
  to: ID;
  amount: number;
  currency: string;
}

export interface FriendBalance {
  total: ByCurrency;
  byGroup: Record<string, ByCurrency>;
}

export function netBalances(expenses: Expense[]): NetBalances {
  const out: NetBalances = {};
  for (const e of expenses) {
    if (e.deleted) continue;
    const m = (out[e.currency] ??= {});
    for (const [p, v] of Object.entries(e.paidBy)) m[p] = (m[p] ?? 0) + v;
    for (const [p, v] of Object.entries(e.owed)) m[p] = (m[p] ?? 0) - v;
  }
  return out;
}

export function pairwiseDebts(expenses: Expense[]): Debt[] {
  const acc = new Map<string, number>();
  const add = (cur: string, debtor: ID, creditor: ID, amount: number) => {
    if (debtor === creditor || !amount) return;
    const [a, b, sign] = debtor < creditor ? [debtor, creditor, 1] : [creditor, debtor, -1];
    const key = `${cur}\u0000${a}\u0000${b}`;
    acc.set(key, (acc.get(key) ?? 0) + sign * amount);
  };
  for (const e of expenses) {
    if (e.deleted) continue;
    const paidTotal = Object.values(e.paidBy).reduce((s, v) => s + v, 0);
    if (paidTotal <= 0) continue;
    for (const [debtor, share] of Object.entries(e.owed)) {
      for (const [payer, paid] of Object.entries(e.paidBy)) add(e.currency, debtor, payer, (share * paid) / paidTotal);
    }
  }
  const out: Debt[] = [];
  for (const [key, v] of acc) {
    const [currency, a, b] = key.split('\u0000');
    const amount = Math.round(Math.abs(v));
    if (amount < 1) continue;
    out.push(v > 0 ? { from: a, to: b, amount, currency } : { from: b, to: a, amount, currency });
  }
  return out;
}

export function simplifyDebts(net: NetBalances): Debt[] {
  const out: Debt[] = [];
  for (const [currency, m] of Object.entries(net)) {
    const creditors = Object.entries(m).filter(([, v]) => v >= 1).map(([p, v]) => ({ p, v }));
    const debtors = Object.entries(m).filter(([, v]) => v <= -1).map(([p, v]) => ({ p, v: -v }));
    creditors.sort((a, b) => b.v - a.v);
    debtors.sort((a, b) => b.v - a.v);
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amount = Math.min(debtors[i].v, creditors[j].v);
      if (amount >= 1) out.push({ from: debtors[i].p, to: creditors[j].p, amount, currency });
      debtors[i].v -= amount;
      creditors[j].v -= amount;
      if (debtors[i].v < 1) i++;
      if (creditors[j].v < 1) j++;
    }
  }
  return out;
}

export function groupDebts(group: Group, expenses: Expense[]): Debt[] {
  return group.simplifyDebts ? simplifyDebts(netBalances(expenses)) : pairwiseDebts(expenses);
}

export function friendBalances(meId: ID, contexts: { key: string; debts: Debt[] }[]): Record<ID, FriendBalance> {
  const out: Record<ID, FriendBalance> = {};
  for (const { key, debts } of contexts) {
    for (const d of debts) {
      if (d.from !== meId && d.to !== meId) continue;
      const other = d.from === meId ? d.to : d.from;
      const signed = d.to === meId ? d.amount : -d.amount;
      const fb = (out[other] ??= { total: {}, byGroup: {} });
      fb.total[d.currency] = (fb.total[d.currency] ?? 0) + signed;
      const g = (fb.byGroup[key] ??= {});
      g[d.currency] = (g[d.currency] ?? 0) + signed;
    }
  }
  return out;
}

export function addInto(target: ByCurrency, add: ByCurrency) {
  for (const [c, v] of Object.entries(add)) target[c] = (target[c] ?? 0) + v;
  return target;
}

export function isSettled(b: ByCurrency | undefined) {
  return !b || Object.values(b).every((v) => Math.abs(v) < 1);
}
