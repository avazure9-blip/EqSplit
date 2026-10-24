import type { ReactNode } from 'react';
import { useStore } from '../data/store';
import type { Expense } from '../data/types';
import { dateParts, monthLabel } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { CategoryTile, Empty, Link } from './components';

export function ExpenseList({ expenses, showGroup }: { expenses: Expense[]; showGroup?: boolean }) {
  if (!expenses.length) {
    return <Empty icon="🧾" title="No expenses yet" text="Tap “Add expense” to record your first one." />;
  }
  const rows: ReactNode[] = [];
  let month = '';
  for (const e of expenses) {
    const m = e.date.slice(0, 7);
    if (m !== month) {
      month = m;
      rows.push(
        <div className="month" key={`m${m}`}>
          {monthLabel(m)}
        </div>,
      );
    }
    rows.push(<ExpenseRow key={e.id} e={e} showGroup={showGroup} />);
  }
  return <div className="list">{rows}</div>;
}

export function ExpenseRow({ e, showGroup }: { e: Expense; showGroup?: boolean }) {
  const s = useStore();
  const me = s.meId;
  const net = (e.paidBy[me] ?? 0) - (e.owed[me] ?? 0);
  const involved = me in e.paidBy || me in e.owed;
  const payers = Object.keys(e.paidBy);
  const { mon, day } = dateParts(e.date);
  const group = showGroup ? s.data.groups[e.groupId] : undefined;
  const money = (v: number) => formatMoney(v, e.currency);

  let main: ReactNode;
  let side: ReactNode;
  if (e.isPayment) {
    const to = Object.keys(e.owed)[0];
    main = (
      <div className="sub payment-text">
        {s.name(payers[0])} paid {s.name(to, true)} {money(e.amount)}
      </div>
    );
    side =
      net > 0 ? (
        <>
          <small className="pos">you paid</small>
          <b className="pos">{money(net)}</b>
        </>
      ) : net < 0 ? (
        <>
          <small className="neg">you received</small>
          <b className="neg">{money(net)}</b>
        </>
      ) : null;
  } else {
    main = (
      <>
        <div className="title">
          {e.description}
          {(e.repeat && e.repeat !== 'never') || e.recurringOf ? <span title="Repeats"> 🔁</span> : null}
          {e.hasReceipt && <span title="Has receipt"> 📎</span>}
        </div>
        <div className="sub">
          {payers.length === 1
            ? `${s.name(payers[0])} paid ${money(e.paidBy[payers[0]])}`
            : `${payers.length} people paid ${money(e.amount)}`}
        </div>
      </>
    );
    side = !involved ? (
      <small className="muted">not involved</small>
    ) : net > 0 ? (
      <>
        <small className="pos">you lent</small>
        <b className="pos">{money(net)}</b>
      </>
    ) : net < 0 ? (
      <>
        <small className="neg">you borrowed</small>
        <b className="neg">{money(net)}</b>
      </>
    ) : (
      <small className="muted">no balance</small>
    );
  }

  return (
    <Link to={`expense/${e.id}`} className={`row expense-row ${e.isPayment ? 'is-payment' : ''}`}>
      <div className="date">
        <span>{mon}</span>
        <b>{day}</b>
      </div>
      {e.isPayment ? <span className="tile pay-tile">💵</span> : <CategoryTile id={e.category} />}
      <div className="main">
        {main}
        {group && <div className="tiny muted">{group.name}</div>}
      </div>
      <div className="side">{side}</div>
    </Link>
  );
}
