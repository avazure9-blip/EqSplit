import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useMoneyText } from '../settings';
import { GroupTile, Link, Page } from '../ui/components';
import { PeriodPicker, spendTotals, SpendTable, type Period } from './Group';

export function TotalsScreen() {
  const s = useStore();
  const money = useMoneyText();
  const [period, setPeriod] = useState<Period>('month');
  const overall = useMemo(() => spendTotals(s.expenses, period), [s.expenses, period]);
  const perGroup = useMemo(
    () => s.groups.map((g) => ({ g, t: spendTotals(s.groupInfo[g.id].expenses, period) })).filter(({ t }) => Object.keys(t.total).length),
    [s.groups, s.groupInfo, period],
  );

  return (
    <Page title="Totals" back="groups">
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="stat-list">
        <div className="stat">
          <small>Total spending</small>
          <b>{money(overall.total)}</b>
        </div>
        <div className="stat">
          <small>Your share</small>
          <b>{money(overall.people[s.meId]?.spent)}</b>
        </div>
      </div>

      <h3 className="section-title pad-x">By person</h3>
      <SpendTable totals={overall} order={[s.meId]} />

      <h3 className="section-title pad-x">By group</h3>
      <div className="list">
        {perGroup.map(({ g, t }) => (
          <Link key={g.id} to={`group/${g.id}/totals`} className="row">
            <GroupTile group={g} size={40} />
            <div className="main">
              <div className="title">{g.name}</div>
              <div className="tiny muted">Your share {money(t.people[s.meId]?.spent)}</div>
            </div>
            <div className="side">
              <b>{money(t.total)}</b>
            </div>
          </Link>
        ))}
        {!perGroup.length && <p className="muted pad">No spending in this period.</p>}
      </div>
      <p className="tiny muted pad">Spent = each person’s share of expenses. Paid = what they paid at the time. Settle-up payments are not counted.</p>
    </Page>
  );
}
