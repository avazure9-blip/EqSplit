import type { ByCurrency } from './balances';
import { fromMinor, toMinor } from './money';

export interface Rates {
  at: number;
  rates: Record<string, number>;
}

const KEY = 'eqsplit:rates';
const MAX_AGE = 12 * 3600 * 1000;

export function cachedRates(): Rates | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Rates) : null;
  } catch {
    return null;
  }
}

export const ratesStale = (r: Rates | null) => !r || Date.now() - r.at > MAX_AGE;

export async function fetchRates(): Promise<Rates | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const json = await res.json();
    if (json?.result !== 'success' || !json.rates) return null;
    const rates: Rates = { at: Date.now(), rates: json.rates };
    localStorage.setItem(KEY, JSON.stringify(rates));
    return rates;
  } catch {
    return null;
  }
}

export function convert(minor: number, from: string, to: string, r: Rates): number | null {
  if (from === to) return minor;
  const rf = r.rates[from];
  const rt = r.rates[to];
  if (!rf || !rt) return null;
  return toMinor((fromMinor(minor, from) / rf) * rt, to);
}

export function convertAll(b: ByCurrency, to: string, r: Rates): number | null {
  let total = 0;
  for (const [cur, v] of Object.entries(b)) {
    const c = convert(v, cur, to, r);
    if (c === null) return null;
    total += c;
  }
  return total;
}
