import type { ReactNode } from 'react';
import { useStore } from '../data/store';
import type { Activity } from '../data/types';
import { timeAgo } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { navigate } from '../lib/router';
import { Avatar, CategoryTile, Empty, GroupTile, Page } from '../ui/components';

export function ActivityScreen() {
  const s = useStore();
  return (
    <Page title="Recent activity" tab="activity" fab="add">
      {s.activity.length === 0 && <Empty icon="📰" title="No activity yet" text="Everything you and your friends add shows up here." />}
      <div className="list">
        {s.activity.map((a) => (
          <ActivityRow key={a.id} a={a} />
        ))}
      </div>
    </Page>
  );
}

function ActivityRow({ a }: { a: Activity }) {
  const s = useStore();
  const e = a.expenseId ? s.data.expenses[a.expenseId] : undefined;
  const g = s.data.groups[a.groupId];
  const who = <b>{s.name(a.by)}</b>;
  const inGroup = g && a.kind !== 'group_created' && a.kind !== 'group_updated' ? (
    <>
      {' '}
      in <b>“{g.name}”</b>
    </>
  ) : null;
  const label = <b>“{a.label}”</b>;

  let text: ReactNode;
  switch (a.kind) {
    case 'expense_added':
      text = <>{who} added {label}{inGroup}.</>;
      break;
    case 'expense_updated':
      text = <>{who} updated {label}{inGroup}.</>;
      break;
    case 'expense_deleted':
      text = <>{who} deleted {label}{inGroup}.</>;
      break;
    case 'expense_restored':
      text = <>{who} restored {label}{inGroup}.</>;
      break;
    case 'payment_added': {
      const from = e ? Object.keys(e.paidBy)[0] : undefined;
      const to = e ? Object.keys(e.owed)[0] : undefined;
      text =
        e && from && to ? (
          <>
            {who} recorded a payment: {s.name(from)} paid {s.name(to, true)} {formatMoney(e.amount, e.currency)}{inGroup}.
          </>
        ) : (
          <>{who} recorded a payment{inGroup}.</>
        );
      break;
    }
    case 'group_created':
      text = <>{who} created the group {label}.</>;
      break;
    case 'group_updated':
      text = <>{who} updated the group {label}.</>;
      break;
    case 'comment_added':
      text = (
        <>
          {who} commented on {label}: “{a.text}”
        </>
      );
      break;
  }

  let impact: ReactNode = null;
  if (e && !e.deleted && a.kind !== 'expense_deleted') {
    const net = (e.paidBy[s.meId] ?? 0) - (e.owed[s.meId] ?? 0);
    const m = formatMoney(net, e.currency);
    if (e.isPayment) impact = net > 0 ? <span className="pos">You paid {m}</span> : net < 0 ? <span className="neg">You received {m}</span> : null;
    else impact = net > 0 ? <span className="pos">You get back {m}</span> : net < 0 ? <span className="neg">You owe {m}</span> : null;
  }

  const icon = e ? (
    e.isPayment ? <span className="tile pay-tile">💵</span> : <CategoryTile id={e.category} />
  ) : g ? (
    <GroupTile group={g} size={40} />
  ) : (
    <Avatar id={a.by} />
  );
  const target = e ? `expense/${e.id}` : g && !g.deleted ? `group/${g.id}` : null;

  return (
    <button className="row activity-row" onClick={() => target && navigate(target)}>
      {icon}
      <div className="main">
        <div className="activity-text">{text}</div>
        {impact && <div className="tiny">{impact}</div>}
        <div className="tiny muted">{timeAgo(a.at)}</div>
      </div>
    </button>
  );
}
