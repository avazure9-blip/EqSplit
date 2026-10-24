import { useMemo, useState } from 'react';
import { useStore, type Friend } from '../data/store';
import { isSettled, type ByCurrency } from '../lib/balances';
import { formatMoney } from '../lib/money';
import { navigate } from '../lib/router';
import { toast } from '../lib/toast';
import { useBalanceText } from '../settings';
import { Avatar, BalanceSide, Empty, IconButton, Link, Overall, Page } from '../ui/components';
import { ExpenseList } from '../ui/ExpenseList';

export function FriendsScreen() {
  const s = useStore();
  const [showSettled, setShowSettled] = useState(false);
  const withBalance = s.friends.filter((p) => !isSettled(s.friendBal[p.id]?.total));
  const settled = s.friends.filter((p) => isSettled(s.friendBal[p.id]?.total));
  return (
    <Page title="Friends" tab="friends" fab={s.groups.length ? 'add' : undefined} right={<IconButton icon="search" label="Search expenses" to="search" />}>
      <Overall balance={s.overall} />
      {s.friends.length === 0 && <Empty icon="🙋" title="No friends yet" text="People in your groups show up here." />}
      <div className="list">
        {withBalance.map((p) => (
          <FriendRow key={p.id} p={p} />
        ))}
        {settled.length > 0 && withBalance.length > 0 && !showSettled && (
          <button className="row link-row" onClick={() => setShowSettled(true)}>
            Show {settled.length} settled-up friend{settled.length === 1 ? '' : 's'}
          </button>
        )}
        {(showSettled || withBalance.length === 0) && settled.map((p) => <FriendRow key={p.id} p={p} />)}
      </div>
    </Page>
  );
}

function FriendRow({ p }: { p: Friend }) {
  const s = useStore();
  const fb = s.friendBal[p.id];
  return (
    <Link to={`friend/${p.id}`} className="row">
      <Avatar id={p.id} size={48} />
      <div className="main">
        <div className="title">{p.name}</div>
        {fb && <BreakdownLines name={p.name} byGroup={fb.byGroup} max={3} />}
      </div>
      <BalanceSide balance={fb?.total} owedLabel="owes you" oweLabel="you owe" />
    </Link>
  );
}

function BreakdownLines({ name, byGroup, max }: { name: string; byGroup: Record<string, ByCurrency>; max?: number }) {
  const s = useStore();
  const lines: { key: string; cur: string; v: number }[] = [];
  for (const [key, b] of Object.entries(byGroup)) for (const [cur, v] of Object.entries(b)) if (Math.abs(v) >= 1) lines.push({ key, cur, v });
  const shown = max ? lines.slice(0, max) : lines;
  return (
    <>
      {shown.map(({ key, cur, v }) => {
        const where = `in “${s.data.groups[key]?.name ?? 'a group'}”`;
        return (
          <div key={key + cur} className="tiny">
            {v > 0 ? (
              <>
                {name} owes you <span className="pos">{formatMoney(v, cur)}</span> {where}
              </>
            ) : (
              <>
                You owe {name} <span className="neg">{formatMoney(v, cur)}</span> {where}
              </>
            )}
          </div>
        );
      })}
      {max && lines.length > max && <div className="tiny muted">Plus {lines.length - max} more</div>}
    </>
  );
}

export function FriendDetail({ id }: { id: string }) {
  const s = useStore();
  const fb = s.friendBal[id];
  const text = useBalanceText()(fb?.total);
  const shared = useMemo(
    () => s.expenses.filter((e) => (id in e.paidBy || id in e.owed) && (s.meId in e.paidBy || s.meId in e.owed)),
    [s.expenses, id, s.meId],
  );
  const friend = s.friends.find((f) => f.id === id);
  if (!friend) {
    return (
      <Page title="Friend" back="friends">
        <Empty title="Not found" text="You don’t share a group with this person." />
      </Page>
    );
  }
  const name = friend.name;

  const remind = async () => {
    const msg = `Hi ${name}! Just a reminder: you owe me ${text.pos ?? 'some money'} on EqSplit. Thanks!`;
    try {
      if (navigator.share) await navigator.share({ text: msg });
      else {
        await navigator.clipboard.writeText(msg);
        toast('Reminder copied – paste it in a chat');
      }
    } catch {
    }
  };

  return (
    <Page title="" back="friends" fab={`add?friend=${id}`}>
      <div className="hero">
        <Avatar id={id} size={72} />
        <h2>{name}</h2>
        <div className="hero-balance">
          {text.zero && <span className="muted">You are all settled up</span>}
          {text.pos && (
            <div>
              {name} owes you <b className="pos">{text.pos}</b>
            </div>
          )}
          {text.neg && (
            <div>
              You owe {name} <b className="neg">{text.neg}</b>
            </div>
          )}
          {fb && <BreakdownLines name={name} byGroup={fb.byGroup} />}
        </div>
      </div>
      <div className="chips">
        <button className="chip primary" onClick={() => navigate(`settle?friend=${id}`)}>
          Settle up
        </button>
        {text.pos && (
          <button className="chip" onClick={remind}>
            Remind
          </button>
        )}
        <button className="chip" onClick={() => navigate(`charts?friend=${id}`)}>
          Charts
        </button>
      </div>
      <ExpenseList expenses={shared} showGroup />
    </Page>
  );
}
