import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { convertAll, cachedRates, fetchRates, ratesStale, type Rates } from './lib/currency';
import type { ByCurrency } from './lib/balances';
import { CURRENCIES, DEFAULT_CURRENCY, formatMoney } from './lib/money';

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  currency: string;
  convert: boolean;
}

const KEY = 'eqsplit:settings';

function load(): Settings {
  const defaults: Settings = { theme: 'system', currency: DEFAULT_CURRENCY, convert: true };
  try {
    const saved = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    if (!CURRENCIES.some(([c]) => c === saved.currency)) saved.currency = DEFAULT_CURRENCY;
    return saved;
  } catch {
    return defaults;
  }
}

interface SettingsCtx {
  settings: Settings;
  update(patch: Partial<Settings>): void;
  rates: Rates | null;
  refreshRates(): Promise<boolean>;
}

const Ctx = createContext<SettingsCtx | null>(null);

export function useSettings(): SettingsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('SettingsProvider missing');
  return c;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(load);
  const [rates, setRates] = useState<Rates | null>(cachedRates);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  const refreshRates = async () => {
    const r = await fetchRates();
    if (r) setRates(r);
    return !!r;
  };

  useEffect(() => {
    if (settings.convert && ratesStale(rates) && navigator.onLine) void refreshRates();
  }, [settings.convert]);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    localStorage.setItem(KEY, JSON.stringify(next));
    setSettings(next);
  };

  return <Ctx.Provider value={{ settings, update, rates, refreshRates }}>{children}</Ctx.Provider>;
}

export interface BalanceText {
  pos: string | null;
  neg: string | null;
  zero: boolean;
}

export function useBalanceText() {
  const { settings, rates } = useSettings();
  return (b: ByCurrency | undefined): BalanceText => {
    const entries = Object.entries(b ?? {}).filter(([, v]) => Math.abs(v) >= 1);
    if (!entries.length) return { pos: null, neg: null, zero: true };
    if (settings.convert && rates && (entries.length > 1 || entries[0][0] !== settings.currency)) {
      const total = convertAll(Object.fromEntries(entries), settings.currency, rates);
      if (total !== null) {
        if (Math.abs(total) < 1) return { pos: null, neg: null, zero: true };
        const text = `≈ ${formatMoney(total, settings.currency)}`;
        return total > 0 ? { pos: text, neg: null, zero: false } : { pos: null, neg: text, zero: false };
      }
    }
    const join = (xs: [string, number][]) => (xs.length ? xs.map(([c, v]) => formatMoney(v, c)).join(' + ') : null);
    return { pos: join(entries.filter(([, v]) => v > 0)), neg: join(entries.filter(([, v]) => v < 0)), zero: false };
  };
}

export function useMoneyText() {
  const { settings, rates } = useSettings();
  return (b: ByCurrency | undefined): string => {
    const entries = Object.entries(b ?? {}).filter(([, v]) => Math.abs(v) >= 1);
    if (!entries.length) return formatMoney(0, settings.currency);
    if (settings.convert && rates && (entries.length > 1 || entries[0][0] !== settings.currency)) {
      const total = convertAll(Object.fromEntries(entries), settings.currency, rates);
      if (total !== null) return `≈ ${formatMoney(total, settings.currency)}`;
    }
    return entries.map(([c, v]) => formatMoney(v, c)).join(' + ');
  };
}
