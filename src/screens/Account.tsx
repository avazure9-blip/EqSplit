import { useState } from 'react';
import { useStore } from '../data/store';
import type { Backup, Person } from '../data/types';
import { timeAgo, todayISO } from '../lib/dates';
import { download, expensesCsv, pickFile } from '../lib/files';
import { newId } from '../lib/id';
import { CURRENCIES } from '../lib/money';
import { navigate } from '../lib/router';
import { toast } from '../lib/toast';
import { useSettings, type Settings } from '../settings';
import { Avatar, Empty, Link, Page, Toggle } from '../ui/components';

export function AccountScreen() {
  const s = useStore();
  const { settings, update, rates, refreshRates } = useSettings();
  const [busy, setBusy] = useState(false);

  const exportCsv = () => {
    const ids = [...new Set(s.groups.flatMap((g) => g.memberIds))];
    const csv = expensesCsv(s.expenses, ids, (id) => s.fullName(id), (gid) => s.data.groups[gid]?.name ?? '');
    download(`eqsplit_${todayISO()}.csv`, csv, 'text/csv');
  };
  const exportJson = async () => {
    setBusy(true);
    try {
      download(`eqsplit_backup_${todayISO()}.json`, JSON.stringify(await s.exportAll()), 'application/json');
    } finally {
      setBusy(false);
    }
  };
  const importJson = async () => {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    try {
      const b = JSON.parse(await file.text()) as Backup;
      if (b?.app !== 'eqsplit' || !Array.isArray(b.expenses)) return toast('That is not an EqSplit backup');
      if (!confirm('Restore this backup? Newer changes already in EqSplit are kept.')) return;
      toast(`Restored ${s.importAll(b)} items`);
    } catch {
      toast('Could not read that file');
    }
  };

  return (
    <Page title="Account" tab="account">
      <div className="hero">
        <Avatar id={s.meId} size={72} />
        <h2>{s.fullName(s.meId)}</h2>
        {s.isAdmin && <span className="badge">Admin</span>}
      </div>

      <h3 className="section-title pad-x">Preferences</h3>
      <div className="list boxed">
        <label className="toggle-row">
          <span>Default currency</span>
          <select className="select" value={settings.currency} onChange={(e) => update({ currency: e.target.value })}>
            {CURRENCIES.map(([code, label, symbol]) => (
              <option key={code} value={code}>
                {symbol} {label}
              </option>
            ))}
          </select>
        </label>
        <Toggle
          checked={settings.convert}
          onChange={(v) => update({ convert: v })}
          label={`Show totals in ${settings.currency}`}
          hint={
            rates
              ? `Converts ₹ and ฿ balances into one figure. Rates from ${timeAgo(rates.at)}.`
              : 'Converts ₹ and ฿ balances into one figure. Needs internet once to fetch rates.'
          }
        />
        {settings.convert && (
          <button className="row link-row" onClick={async () => toast((await refreshRates()) ? 'Exchange rates updated' : 'Could not update rates (offline?)')}>
            Update exchange rates now
          </button>
        )}
        <label className="toggle-row">
          <span>Theme</span>
          <select className="select" value={settings.theme} onChange={(e) => update({ theme: e.target.value as Settings['theme'] })}>
            <option value="system">Automatic</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>

      {s.isAdmin && (
        <>
          <h3 className="section-title pad-x">Admin</h3>
          <div className="list boxed">
            <Link to="people" className="row link-row">
              Manage people ({s.people.length})
            </Link>
            <Link to="group/new" className="row link-row">
              Create a group
            </Link>
          </div>
        </>
      )}

      <h3 className="section-title pad-x">Sync</h3>
      <div className="card">
        <p>
          {s.sync.online ? '🟢 Online' : '🟠 Offline'}
          {s.sync.pendingCount > 0
            ? ` · ${s.sync.pendingCount} change${s.sync.pendingCount === 1 ? '' : 's'} waiting to upload`
            : s.data.synced
              ? ' · everything is synced'
              : ''}
        </p>
        <p className="tiny muted">
          Expenses you add without internet are saved in this browser and upload automatically the next time EqSplit is open with
          internet. On iPhone, open EqSplit at least once a week: Safari clears saved data for sites that aren’t visited for about 7
          days. Adding it to your Home Screen (Share → Add to Home Screen) avoids that.
        </p>
      </div>

      <h3 className="section-title pad-x">Your data</h3>
      <div className="list boxed">
        <button className="row link-row" onClick={exportCsv}>
          Export all expenses (CSV)
        </button>
        {s.isAdmin && (
          <>
            <button className="row link-row" onClick={exportJson} disabled={busy}>
              {busy ? 'Preparing backup…' : 'Download full backup (JSON)'}
            </button>
            <button className="row link-row" onClick={importJson}>
              Restore from backup
            </button>
          </>
        )}
      </div>

      <div className="center pad">
        <button className="btn danger-outline" onClick={() => confirm('Log out of EqSplit on this device?') && s.signOut()}>
          Log out
        </button>
      </div>
      <p className="tiny muted center pad">EqSplit · all features free · no ads · no limits</p>
    </Page>
  );
}

export function PeopleScreen() {
  const s = useStore();
  const [name, setName] = useState('');
  if (!s.isAdmin) return <Page title="People" back="account"><Empty title="Only the admin can manage people" /></Page>;

  const add = () => {
    const n = name.trim();
    if (!n) return toast('Enter a name');
    if (s.people.some((p) => p.name.toLowerCase() === n.toLowerCase())) return toast(`There is already someone called ${n}`);
    const t = Date.now();
    s.savePerson({ id: newId(), name: n, loginVersion: 0, joined: false, createdAt: t, updatedAt: t });
    setName('');
    toast(`${n} added. Now add them to a group.`);
  };

  return (
    <Page title="People" back="account">
      <div className="inline-add pad-x">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New person's name" onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn small" onClick={add}>
          Add
        </button>
      </div>
      <div className="list">
        {s.people.map((p) => {
          const groups = s.groups.filter((g) => g.memberIds.includes(p.id));
          return (
            <Link key={p.id} to={`person/${p.id}`} className="row">
              <Avatar id={p.id} />
              <div className="main">
                <div className="title">
                  {p.name}
                  {p.id === s.meId && ' (you, admin)'}
                </div>
                <div className="tiny muted">{groups.length ? groups.map((g) => g.name).join(', ') : 'Not in any group'}</div>
              </div>
              <small className={p.joined ? 'pos' : 'muted'}>{p.joined ? 'joined' : 'not joined'}</small>
            </Link>
          );
        })}
      </div>
    </Page>
  );
}

export function PersonScreen({ id }: { id: string }) {
  const s = useStore();
  const p = s.data.people[id];
  if (!s.isAdmin || !p || p.deleted) {
    return (
      <Page title="Person" back="people">
        <Empty title="Not found" />
      </Page>
    );
  }
  return <PersonEditor key={p.id} p={p} />;
}

function PersonEditor({ p }: { p: Person }) {
  const s = useStore();
  const [name, setName] = useState(p.name);
  const groups = s.groups.filter((g) => g.memberIds.includes(p.id));
  const isMe = p.id === s.meId;

  const save = () => {
    const n = name.trim();
    if (!n) return toast('Enter a name');
    if (s.people.some((x) => x.id !== p.id && x.name.toLowerCase() === n.toLowerCase())) return toast(`There is already someone called ${n}`);
    s.savePerson({ ...p, name: n });
    toast('Saved');
  };
  const reset = () => {
    if (!confirm(`Reset ${p.name}'s login? Their current password stops working and they set a new one with the group code.`)) return;
    s.resetLogin(p.id);
    toast(`${p.name} can now set a new password using the group code`);
  };
  const remove = () => {
    if (groups.length) return toast('Remove them from their groups first');
    if (!confirm(`Remove ${p.name}?`)) return;
    s.savePerson({ ...p, deleted: true });
    navigate('people', true);
  };

  return (
    <Page
      title={p.name}
      back="people"
      right={
        <button className="link strong" onClick={save}>
          Save
        </button>
      }
    >
      <div className="form">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="card">
          <p>
            Login: <b className={p.joined ? 'pos' : ''}>{p.joined ? 'joined (has a password)' : 'not joined yet'}</b>
          </p>
          <p className="tiny muted">Groups: {groups.length ? groups.map((g) => g.name).join(', ') : 'none'}</p>
        </div>
        {!isMe && (
          <button className="btn outline" onClick={reset}>
            Reset login / forgotten password
          </button>
        )}
        {!isMe && (
          <button className="btn danger-outline" onClick={remove}>
            Remove person
          </button>
        )}
      </div>
    </Page>
  );
}
