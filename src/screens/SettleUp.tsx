import { useState } from 'react';
import { useStore, type Store } from '../data/store';
import type { Expense, ID } from '../data/types';
import { todayISO } from '../lib/dates';
import { newId } from '../lib/id';
import { minorToInput, toMinor } from '../lib/money';
import { goBack } from '../lib/router';
import { toast } from '../lib/toast';
import { useSettings } from '../settings';
import { Avatar, CurrencySelect, Empty, Page } from '../ui/components';

interface Params {
  groupId?: string | null;
  friendId?: string | null;
  editId?: string | null;
  from?: string | null;
  to?: string | null;
  amount?: string | null;
  currency?: string | null;
}

interface Suggestion {
  from: ID;
  to: ID;
  amount: number;
  currency: string;
  groupId: ID | null;
}

function suggest(s: Store, p: Params, defCur: string): Suggestion {
  const me = s.meId;
  const existing = p.editId ? s.data.expenses[p.editId] : undefined;
  if (existing) {
    return {
      from: Object.keys(existing.paidBy)[0] ?? me,
      to: Object.keys(existing.owed)[0] ?? me,
      amount: existing.amount,
      currency: existing.currency,
      groupId: existing.groupId,
    };
  }
  if (p.groupId && p.from && p.to) {
    return { from: p.from, to: p.to, amount: Number(p.amount) || 0, currency: p.currency || defCur, groupId: p.groupId };
  }
  if (p.groupId && s.groupInfo[p.groupId]) {
    const debts = s.groupInfo[p.groupId].debts;
    const d = debts.find((x) => x.from === me) ?? debts.find((x) => x.to === me) ?? debts[0];
    if (d) return { ...d, groupId: p.groupId };
    const g = s.data.groups[p.groupId];
    return { from: me, to: g.memberIds.find((m) => m !== me) ?? me, amount: 0, currency: g.defaultCurrency ?? defCur, groupId: p.groupId };
  }
  if (p.friendId) {
    let best: { key: string; cur: string; v: number } | null = null;
    for (const [key, b] of Object.entries(s.friendBal[p.friendId]?.byGroup ?? {})) {
      for (const [cur, v] of Object.entries(b)) if (!best || Math.abs(v) > Math.abs(best.v)) best = { key, cur, v };
    }
    if (best && Math.abs(best.v) >= 1) {
      const owesMe = best.v > 0;
      return { from: owesMe ? p.friendId : me, to: owesMe ? me : p.friendId, amount: Math.abs(best.v), currency: best.cur, groupId: best.key };
    }
    const shared = s.groups.find((g) => g.memberIds.includes(me) && g.memberIds.includes(p.friendId!));
    return { from: me, to: p.friendId, amount: 0, currency: defCur, groupId: shared?.id ?? null };
  }
  return { from: me, to: me, amount: 0, currency: defCur, groupId: null };
}

export function SettleUp(props: Params) {
  const s = useStore();
  const { settings } = useSettings();
  const existing = props.editId ? s.data.expenses[props.editId] : undefined;
  const [init] = useState(() => suggest(s, props, settings.currency));
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [currency, setCurrency] = useState(init.currency);
  const [amountStr, setAmountStr] = useState(init.amount ? minorToInput(init.amount, init.currency) : '');
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [groupId, setGroupId] = useState<ID | null>(init.groupId);
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const group = groupId ? s.data.groups[groupId] : undefined;
  if (!group) {
    return (
      <Page title="Settle up" back="groups">
        <Empty title="No shared group" text="Payments are recorded inside a group." />
      </Page>
    );
  }

  const choices = group.memberIds;
  const myGroups = s.groups.filter((g) => g.memberIds.includes(from) && g.memberIds.includes(to));
  const amount = toMinor(amountStr, currency);
  const fallback = `group/${group.id}`;

  const save = () => {
    if (from === to) return toast('Choose two different people');
    if (amount <= 0) return toast('Enter an amount');
    const t = Date.now();
    const e: Expense = {
      ...(existing ?? { id: newId(), createdAt: t, createdBy: s.meId, updatedAt: t }),
      groupId: group.id,
      description: 'Payment',
      amount,
      currency,
      date: date || todayISO(),
      category: 'payment',
      paidBy: { [from]: amount },
      owed: { [to]: amount },
      splitMethod: 'exact',
      isPayment: true,
      notes: notes.trim() || undefined,
    };
    s.saveExpense(e, !existing);
    goBack(fallback);
  };

  return (
    <Page
      title={existing ? 'Edit payment' : 'Settle up'}
      back={fallback}
      right={
        <button className="link strong" onClick={save}>
          Save
        </button>
      }
    >
      <div className="settle">
        <div className="settle-avatars">
          <Avatar id={from} size={64} />
          <span className="arrow">→</span>
          <Avatar id={to} size={64} />
        </div>
        <div className="settle-who">
          <select className="select" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Payer">
            {choices.map((p) => (
              <option key={p} value={p}>
                {s.name(p)}
              </option>
            ))}
          </select>
          <span>paid</span>
          <select className="select" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Recipient">
            {choices.map((p) => (
              <option key={p} value={p}>
                {s.name(p, true)}
              </option>
            ))}
          </select>
        </div>
        <div className="editor-line settle-amount">
          <CurrencySelect className="cur-select" value={currency} onChange={setCurrency} />
          <input className="big-input amount" inputMode="decimal" placeholder="0.00" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
        </div>
        <div className="form">
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          {!existing && myGroups.length > 1 && (
            <label>
              Group
              <select className="select" value={group.id} onChange={(e) => setGroupId(e.target.value)}>
                {myGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Note <span className="muted">(optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Paid in cash" />
          </label>
        </div>
        <p className="tiny muted center">This records a payment made outside EqSplit (cash, bank transfer…).</p>
      </div>
    </Page>
  );
}
