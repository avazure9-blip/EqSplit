import { useMemo, useState } from 'react';
import { useStore, type Store } from '../data/store';
import type { Expense, Group, GroupType, ID, Person } from '../data/types';
import { addInto, type ByCurrency } from '../lib/balances';
import { todayISO } from '../lib/dates';
import { download, expensesCsv } from '../lib/files';
import { formatCode, newId } from '../lib/id';
import { formatMoney } from '../lib/money';
import { goBack, navigate } from '../lib/router';
import { toast } from '../lib/toast';
import { useBalanceText, useMoneyText, useSettings } from '../settings';
import { Avatar, colorFor, CurrencySelect, Empty, GROUP_TYPES, GroupTile, IconButton, Page, Toggle } from '../ui/components';
import { ExpenseList } from '../ui/ExpenseList';

function NotFound() {
  return (
    <Page title="Group" back="groups">
      <Empty title="Group not found" text="It may have been deleted, or you were removed from it." />
    </Page>
  );
}

export function exportCsv(s: Store, name: string, expenses: Expense[], memberIds: ID[]) {
  const csv = expensesCsv(expenses, memberIds, (id) => s.fullName(id), (gid) => s.data.groups[gid]?.name ?? '');
  download(`${name.replace(/[^\w-]+/g, '_')}_${todayISO()}.csv`, csv, 'text/csv');
}

export const joinLink = (code: string) => `${location.origin}${location.pathname}#/join/${code}`;

export async function shareJoin(g: Group) {
  const text = `Join “${g.name}” on EqSplit: ${joinLink(g.code)}\nGroup code: ${formatCode(g.code)}\nPick your name and set a password.`;
  try {
    if (navigator.share) await navigator.share({ text });
    else {
      await navigator.clipboard.writeText(text);
      toast('Invite copied – paste it in your group chat');
    }
  } catch {
  }
}

export function GroupDetail({ id }: { id: string }) {
  const s = useStore();
  const g = s.data.groups[id];
  const gi = s.groupInfo[id];
  const text = useBalanceText()(gi?.myNet);
  if (!g || g.deleted || !gi) return <NotFound />;
  const mine = gi.debts.filter((d) => d.from === s.meId || d.to === s.meId);
  const color = colorFor(g.id);
  const member = g.memberIds.includes(s.meId);

  return (
    <Page
      title=""
      back="groups"
      fab={member ? `add?group=${id}` : undefined}
      className="cover-page"
      topbarStyle={{ background: color }}
      right={<IconButton icon="settings" label="Group settings" to={`group/${id}/settings`} />}
    >
      <div className="cover" style={{ background: color }} />
      <div className="group-head">
        <GroupTile group={g} size={76} />
        <h2>{g.name}</h2>
        {text.zero && <div className="muted">{gi.expenses.length ? 'You are all settled up in this group.' : 'No expenses yet.'}</div>}
        {text.pos && (
          <div>
            You are owed <b className="pos">{text.pos}</b> overall
          </div>
        )}
        {text.neg && (
          <div>
            You owe <b className="neg">{text.neg}</b> overall
          </div>
        )}
        {mine.map((d, i) => (
          <div key={i} className="tiny">
            {d.to === s.meId ? (
              <>
                {s.name(d.from)} owes you <span className="pos">{formatMoney(d.amount, d.currency)}</span>
              </>
            ) : (
              <>
                You owe {s.name(d.to)} <span className="neg">{formatMoney(d.amount, d.currency)}</span>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="chips">
        <button className="chip primary" onClick={() => navigate(`settle?group=${id}`)}>
          Settle up
        </button>
        <button className="chip" onClick={() => navigate(`group/${id}/balances`)}>
          Balances
        </button>
        <button className="chip" onClick={() => navigate(`group/${id}/totals`)}>
          Totals
        </button>
        <button className="chip" onClick={() => navigate(`charts?group=${id}`)}>
          Charts
        </button>
        <button className="chip" onClick={() => navigate(`search?group=${id}`)}>
          Search
        </button>
        <button className="chip" onClick={() => exportCsv(s, g.name, gi.expenses, g.memberIds)}>
          Export
        </button>
      </div>
      <ExpenseList expenses={gi.expenses} />
    </Page>
  );
}

export function GroupBalances({ id }: { id: string }) {
  const s = useStore();
  const g = s.data.groups[id];
  const gi = s.groupInfo[id];
  const fmt = useBalanceText();
  if (!g || g.deleted || !gi) return <NotFound />;
  const members = [...new Set([...g.memberIds, ...Object.values(gi.net).flatMap((m) => Object.keys(m))])];

  return (
    <Page title="Group balances" back={`group/${id}`}>
      {g.simplifyDebts && <p className="muted tiny pad">Debts are simplified: fewer, larger payments settle everyone up.</p>}
      <div className="list">
        {members.map((pid) => {
          const b: ByCurrency = {};
          for (const [cur, m] of Object.entries(gi.net)) if (m[pid]) b[cur] = m[pid];
          const t = fmt(b);
          const you = pid === s.meId;
          return (
            <div key={pid} className="row block-row">
              <div className="row-inline">
                <Avatar id={pid} />
                <div className="main">
                  <b>{s.name(pid)}</b>{' '}
                  {t.zero && <span className="muted">{you ? 'are' : 'is'} settled up</span>}
                  {t.pos && (
                    <>
                      get{you ? '' : 's'} back <b className="pos">{t.pos}</b> in total
                    </>
                  )}
                  {t.pos && t.neg && <> and </>}
                  {t.neg && (
                    <>
                      owe{you ? '' : 's'} <b className="neg">{t.neg}</b> in total
                    </>
                  )}
                </div>
              </div>
              {gi.debts
                .filter((d) => d.from === pid)
                .map((d, i) => (
                  <div key={i} className="debt-line">
                    <span>
                      {s.name(d.from)} owe{d.from === s.meId ? '' : 's'} <b className="neg">{formatMoney(d.amount, d.currency)}</b> to {s.name(d.to, true)}
                    </span>
                    <button
                      className="chip small"
                      onClick={() => navigate(`settle?group=${id}&from=${d.from}&to=${d.to}&amount=${d.amount}&currency=${d.currency}`)}
                    >
                      Settle
                    </button>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </Page>
  );
}

export type Period = 'month' | 'last' | 'year' | 'all';
export const PERIODS: [Period, string][] = [
  ['month', 'This month'],
  ['last', 'Last month'],
  ['year', 'This year'],
  ['all', 'All time'],
];

export function inPeriod(date: string, p: Period) {
  const t = todayISO();
  if (p === 'all') return true;
  if (p === 'year') return date.slice(0, 4) === t.slice(0, 4);
  if (p === 'month') return date.slice(0, 7) === t.slice(0, 7);
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return date.slice(0, 7) === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export interface PersonTotals {
  spent: ByCurrency;
  paid: ByCurrency;
}

export function spendTotals(expenses: Expense[], period: Period) {
  const people: Record<ID, PersonTotals> = {};
  const total: ByCurrency = {};
  for (const e of expenses) {
    if (e.isPayment || !inPeriod(e.date, period)) continue;
    addInto(total, { [e.currency]: e.amount });
    for (const [p, v] of Object.entries(e.owed)) addInto((people[p] ??= { spent: {}, paid: {} }).spent, { [e.currency]: v });
    for (const [p, v] of Object.entries(e.paidBy)) addInto((people[p] ??= { spent: {}, paid: {} }).paid, { [e.currency]: v });
  }
  return { people, total };
}

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="segmented">
      {PERIODS.map(([p, label]) => (
        <button key={p} className={value === p ? 'active' : ''} onClick={() => onChange(p)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function SpendTable({ totals, order }: { totals: ReturnType<typeof spendTotals>; order: ID[] }) {
  const s = useStore();
  const money = useMoneyText();
  const ids = [...new Set([...order, ...Object.keys(totals.people)])].filter((id) => totals.people[id]);
  if (!ids.length) return <Empty icon="📊" title="Nothing spent in this period" />;
  return (
    <table className="totals-table">
      <thead>
        <tr>
          <th>Person</th>
          <th>Spent</th>
          <th>Paid</th>
        </tr>
      </thead>
      <tbody>
        {ids.map((id) => (
          <tr key={id} className={id === s.meId ? 'me' : ''}>
            <td>
              <span className="row-inline">
                <Avatar id={id} size={24} /> {s.name(id)}
              </span>
            </td>
            <td>{money(totals.people[id].spent)}</td>
            <td className="muted">{money(totals.people[id].paid)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td>{money(totals.total)}</td>
          <td className="muted">{money(totals.total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export function GroupTotals({ id }: { id: string }) {
  const s = useStore();
  const [period, setPeriod] = useState<Period>('all');
  const g = s.data.groups[id];
  const gi = s.groupInfo[id];
  const totals = useMemo(() => spendTotals(gi?.expenses ?? [], period), [gi, period]);
  if (!g || g.deleted || !gi) return <NotFound />;

  return (
    <Page title="Group spending" back={`group/${id}`}>
      <PeriodPicker value={period} onChange={setPeriod} />
      <SpendTable totals={totals} order={g.memberIds} />
      <p className="tiny muted pad">
        <b>Spent</b> is each person’s share of the expenses. <b>Paid</b> is what they paid for at the time. Settle-up payments are not counted.
      </p>
    </Page>
  );
}

export function GroupSettings({ id }: { id?: string }) {
  const s = useStore();
  const existing = id ? s.data.groups[id] : undefined;
  if (id && (!existing || existing.deleted)) return <NotFound />;
  if (!s.isAdmin) return existing ? <GroupInfoView g={existing} /> : <NotFound />;
  return <GroupEditor existing={existing} />;
}

function GroupEditor({ existing }: { existing?: Group }) {
  const s = useStore();
  const { settings } = useSettings();
  const gi = existing ? s.groupInfo[existing.id] : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<GroupType>(existing?.type ?? 'trip');
  const [members, setMembers] = useState<ID[]>(existing?.memberIds ?? [s.meId]);
  const [simplify, setSimplify] = useState(existing?.simplifyDebts ?? true);
  const [currency, setCurrency] = useState(existing?.defaultCurrency ?? settings.currency);
  const [useDefault, setUseDefault] = useState(!!existing?.defaultSplit);
  const [shares, setShares] = useState<Record<ID, string>>(() =>
    Object.fromEntries(Object.entries(existing?.defaultSplit ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [newName, setNewName] = useState('');

  const hasBalance = (pid: ID) => !!gi && Object.values(gi.net).some((m) => Math.abs(m[pid] ?? 0) >= 1);
  const toggle = (pid: ID) => {
    if (members.includes(pid)) {
      if (hasBalance(pid)) return toast(`${s.fullName(pid)} still has a balance in this group`);
      setMembers(members.filter((m) => m !== pid));
    } else setMembers([...members, pid]);
  };
  const addPerson = () => {
    const n = newName.trim();
    if (!n) return toast('Enter a name');
    if (s.people.some((p) => p.name.toLowerCase() === n.toLowerCase())) return toast(`There is already someone called ${n}`);
    const t = Date.now();
    const p: Person = { id: newId(), name: n, loginVersion: 0, joined: false, createdAt: t, updatedAt: t };
    s.savePerson(p);
    setMembers([...members, p.id]);
    setNewName('');
  };

  const save = () => {
    if (!name.trim()) return toast('Give the group a name');
    if (members.length < 2) return toast('Add at least two members');
    const split: Record<ID, number> = {};
    if (useDefault) for (const m of members) split[m] = Math.max(0, parseFloat(shares[m] ?? '1') || 0);
    if (useDefault && !Object.values(split).some((v) => v > 0)) return toast('Give at least one member a share');
    const t = Date.now();
    const g: Group = {
      ...(existing ?? { id: newId(), createdAt: t, createdBy: s.meId, updatedAt: t, code: '', names: {} }),
      name: name.trim(),
      type,
      memberIds: members,
      simplifyDebts: simplify,
      defaultCurrency: currency,
      defaultSplit: useDefault ? split : undefined,
    };
    s.saveGroup(g, !existing);
    if (existing) goBack(`group/${g.id}`);
    else navigate(`group/${g.id}/settings`, true);
  };

  const remove = () => {
    if (!existing) return;
    const msg = gi && gi.debts.length ? 'This group still has unsettled balances. Delete it anyway?' : `Delete “${existing.name}” and all its expenses?`;
    if (!confirm(msg)) return;
    s.deleteGroup(existing.id);
    navigate('groups', true);
  };

  return (
    <Page
      title={existing ? 'Group settings' : 'Create a group'}
      back={existing ? `group/${existing.id}` : 'groups'}
      right={
        <button className="link strong" onClick={save}>
          Save
        </button>
      }
    >
      <div className="form">
        {existing && <JoinCodeCard g={existing} admin />}
        <label>
          Group name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Goa trip" autoFocus={!existing} />
        </label>
        <div className="field">
          Type
          <div className="segmented">
            {GROUP_TYPES.map(([t, label]) => (
              <button key={t} className={type === t ? 'active' : ''} onClick={() => setType(t)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <h3 className="section-title">Group members</h3>
        <div className="list boxed">
          {s.people.map((p) => (
            <label key={p.id} className="row check-row">
              <Avatar id={p.id} size={32} />
              <span className="main">
                {p.id === s.meId ? `${p.name} (you)` : p.name}
                <small className={`block ${p.joined ? 'pos' : 'muted'}`}>{p.joined ? 'Joined' : 'Not joined yet'}</small>
              </span>
              <input type="checkbox" checked={members.includes(p.id)} onChange={() => toggle(p.id)} />
            </label>
          ))}
        </div>
        <div className="inline-add">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add a new person by name" onKeyDown={(e) => e.key === 'Enter' && addPerson()} />
          <button className="btn small" onClick={addPerson}>
            Add
          </button>
        </div>

        <h3 className="section-title">Settings</h3>
        <Toggle checked={simplify} onChange={setSimplify} label="Simplify group debts" hint="Combines debts so the group needs fewer payments to settle up." />
        <label className="toggle-row">
          <span>Default currency</span>
          <CurrencySelect value={currency} onChange={setCurrency} />
        </label>
        <Toggle checked={useDefault} onChange={setUseDefault} label="Default split" hint="New expenses in this group start with these shares." />
        {useDefault && (
          <div className="list boxed">
            {members.map((m) => (
              <div key={m} className="row split-row">
                <Avatar id={m} size={32} />
                <span className="main">{s.name(m)}</span>
                <input className="num-input" inputMode="decimal" value={shares[m] ?? '1'} onChange={(e) => setShares({ ...shares, [m]: e.target.value })} />
                <span className="muted tiny">shares</span>
              </div>
            ))}
          </div>
        )}
        {existing && (
          <button className="btn danger-outline" onClick={remove}>
            Delete group
          </button>
        )}
      </div>
    </Page>
  );
}

function JoinCodeCard({ g, admin }: { g: Group; admin?: boolean }) {
  const s = useStore();
  return (
    <div className="card join-card">
      <small className="muted">Group code</small>
      <div className="join-code">{formatCode(g.code)}</div>
      <p className="tiny muted">People in this group open the app, enter this code, pick their name and set a password.</p>
      <div className="row-inline">
        <button className="btn small" onClick={() => shareJoin(g)}>
          Share invite
        </button>
        {admin && (
          <button
            className="btn small outline"
            onClick={() => confirm('Make a new code? The old one stops working (people already logged in stay logged in).') && s.renewJoinCode(g.id)}
          >
            New code
          </button>
        )}
      </div>
    </div>
  );
}

function GroupInfoView({ g }: { g: Group }) {
  const s = useStore();
  return (
    <Page title="Group info" back={`group/${g.id}`}>
      <div className="form">
        <JoinCodeCard g={g} />
        <h3 className="section-title">Members</h3>
        <div className="list boxed">
          {g.memberIds.map((m) => (
            <div key={m} className="row">
              <Avatar id={m} size={32} />
              <span className="main">{s.name(m)}</span>
            </div>
          ))}
        </div>
        <p className="tiny muted">
          Debts are {g.simplifyDebts ? '' : 'not '}simplified in this group. Only the admin can change group settings or members.
        </p>
      </div>
    </Page>
  );
}
