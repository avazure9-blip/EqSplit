import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import type { Expense } from '../data/types';
import { category } from '../lib/categories';
import { toISO } from '../lib/dates';
import { convert } from '../lib/currency';
import { CURRENCIES, formatMoney } from '../lib/money';
import { useSettings } from '../settings';
import { CategoryTile, Empty, Page } from '../ui/components';

type Mode = 'mine' | 'total';

export function ChartsScreen({ groupId, friendId }: { groupId?: string | null; friendId?: string | null }) {
  const s = useStore();
  const { settings, rates } = useSettings();
  const [mode, setMode] = useState<Mode>('mine');
  const [cur, setCur] = useState(settings.currency);
  const [picked, setPicked] = useState<string | null>(null);

  const group = groupId ? s.data.groups[groupId] : undefined;
  const friend = friendId ? s.friends.find((f) => f.id === friendId) : undefined;
  const scope: Expense[] = useMemo(() => {
    if (group) return s.groupInfo[group.id]?.expenses ?? [];
    if (friendId) return s.expenses.filter((e) => (friendId in e.paidBy || friendId in e.owed) && (s.meId in e.paidBy || s.meId in e.owed));
    return s.expenses;
  }, [group, friendId, s.expenses, s.groupInfo, s.meId]);

  const canConvert = settings.convert && !!rates;
  const { byCategory, byMonth, skipped } = useMemo(() => {
    const cats = new Map<string, number>();
    const months = new Map<string, number>();
    const now = new Date();
    const monthKeys: string[] = [];
    for (let i = 11; i >= 0; i--) monthKeys.push(toISO(new Date(now.getFullYear(), now.getMonth() - i, 1)).slice(0, 7));
    monthKeys.forEach((m) => months.set(m, 0));
    let skipped = 0;
    for (const e of scope) {
      if (e.isPayment) continue;
      const raw = mode === 'mine' ? (e.owed[s.meId] ?? 0) : e.amount;
      if (!raw) continue;
      const v = e.currency === cur ? raw : canConvert && rates ? convert(raw, e.currency, cur, rates) : null;
      if (v === null) {
        skipped++;
        continue;
      }
      cats.set(e.category, (cats.get(e.category) ?? 0) + v);
      const m = e.date.slice(0, 7);
      if (months.has(m)) months.set(m, months.get(m)! + v);
    }
    return {
      byCategory: [...cats.entries()].sort((a, b) => b[1] - a[1]),
      byMonth: monthKeys.map((m) => [m, months.get(m) ?? 0] as [string, number]),
      skipped,
    };
  }, [scope, mode, cur, canConvert, rates, s.meId]);

  const total = byCategory.reduce((a, [, v]) => a + v, 0);
  const maxCat = Math.max(1, ...byCategory.map(([, v]) => v));
  const maxMonth = Math.max(1, ...byMonth.map(([, v]) => v));
  const money = (v: number) => formatMoney(v, cur);
  const monthName = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleString(undefined, { month: 'short' });
  const shown = picked ? byMonth.find(([m]) => m === picked) : byMonth[byMonth.length - 1];
  const title = group ? group.name : friend ? `With ${friend.name}` : 'All groups';

  return (
    <Page title={`Charts · ${title}`} back={group ? `group/${group.id}` : friend ? `friend/${friend.id}` : 'groups'}>
      <div className="segmented">
        <button className={mode === 'mine' ? 'active' : ''} onClick={() => setMode('mine')}>
          My share
        </button>
        <button className={mode === 'total' ? 'active' : ''} onClick={() => setMode('total')}>
          Total spending
        </button>
      </div>
      <div className="segmented">
        {CURRENCIES.map(([code, , symbol]) => (
          <button key={code} className={cur === code ? 'active' : ''} onClick={() => setCur(code)}>
            {symbol} {code}
          </button>
        ))}
      </div>
      {skipped > 0 && (
        <p className="tiny muted pad-x">
          {skipped} expense{skipped === 1 ? '' : 's'} in another currency not shown. Turn on “Show totals in one currency” in Account to include them.
        </p>
      )}

      {total === 0 ? (
        <Empty icon="📊" title="Nothing to chart yet" />
      ) : (
        <>
          <section className="card">
            <h3>Last 12 months</h3>
            <div className="chart-caption">
              <b>{shown ? money(shown[1]) : ''}</b> <span className="muted">{shown ? `in ${monthName(shown[0])} ${shown[0].slice(0, 4)}` : ''}</span>
            </div>
            <div className="month-chart" role="img" aria-label="Spending per month for the last 12 months">
              {byMonth.map(([m, v]) => (
                <button
                  key={m}
                  className={`month-col ${shown?.[0] === m ? 'active' : ''}`}
                  title={`${monthName(m)} ${m.slice(0, 4)}: ${money(v)}`}
                  onClick={() => setPicked(m)}
                  onMouseEnter={() => setPicked(m)}
                >
                  <span className="month-bar" style={{ height: `${v ? Math.max(2, (v / maxMonth) * 100) : 0}%` }} />
                  <small>{monthName(m).slice(0, 3)}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="card">
            <h3>By category</h3>
            <p className="tiny muted">Total {money(total)}</p>
            <div className="cat-chart">
              {byCategory.map(([id, v]) => (
                <div key={id} className="cat-bar-row" title={`${category(id).name}: ${money(v)}`}>
                  <CategoryTile id={id} size={32} />
                  <div className="main">
                    <div className="cat-bar-label">
                      <span>{category(id).name}</span>
                      <span>
                        {money(v)} <small className="muted">{Math.round((v / total) * 100)}%</small>
                      </span>
                    </div>
                    <div className="cat-bar-track">
                      <span className="cat-bar" style={{ width: `${Math.max(1, (v / maxCat) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </Page>
  );
}
