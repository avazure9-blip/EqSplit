const decimalsCache: Record<string, number> = {};
const formatters: Record<string, Intl.NumberFormat> = {};

export function decimals(currency: string): number {
  if (!(currency in decimalsCache)) {
    try {
      decimalsCache[currency] =
        new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      decimalsCache[currency] = 2;
    }
  }
  return decimalsCache[currency];
}

export function toMinor(input: string | number, currency: string): number {
  const n = typeof input === 'number' ? input : parseFloat(String(input).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 10 ** decimals(currency)) : 0;
}

export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** decimals(currency);
}

export function minorToInput(minor: number, currency: string): string {
  return fromMinor(minor, currency).toFixed(decimals(currency));
}

export function formatMoney(minor: number, currency: string): string {
  const value = fromMinor(Math.abs(Math.round(minor)), currency);
  try {
    formatters[currency] ??= new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    });
    return formatters[currency].format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function allocate(total: number, weights: Record<string, number>): Record<string, number> {
  const ids = Object.keys(weights).filter((k) => weights[k] > 0);
  const sumW = ids.reduce((s, k) => s + weights[k], 0);
  const out: Record<string, number> = {};
  if (!ids.length || sumW <= 0) return out;
  let assigned = 0;
  const remainders: [string, number][] = [];
  for (const k of ids) {
    const exact = (total * weights[k]) / sumW;
    const floor = Math.floor(exact);
    out[k] = floor;
    assigned += floor;
    remainders.push([k, exact - floor]);
  }
  remainders.sort((a, b) => b[1] - a[1]);
  for (let i = 0; i < total - assigned; i++) out[remainders[i % remainders.length][0]]++;
  return out;
}

export const CURRENCIES: [string, string, string][] = [
  ['INR', 'Indian rupee', '₹'],
  ['THB', 'Thai baht', '฿'],
];

export const DEFAULT_CURRENCY = 'INR';
