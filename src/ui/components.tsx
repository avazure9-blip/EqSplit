import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { useStore } from '../data/store';
import type { Group } from '../data/types';
import type { ByCurrency } from '../lib/balances';
import { category, categoryColor } from '../lib/categories';
import { CURRENCIES } from '../lib/money';
import { goBack, navigate } from '../lib/router';
import { useBalanceText } from '../settings';
import { Icon, type IconName } from './Icon';

const COLORS = ['#e8735a', '#5b8def', '#e9a72b', '#5fb158', '#b46fd1', '#2fb3ad', '#e05d8a', '#8d6e63', '#6f7fd8'];

export function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Link(props: { to: string; className?: string; children: ReactNode }) {
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    navigate(props.to);
  };
  return (
    <a href={`#/${props.to}`} className={props.className} onClick={onClick}>
      {props.children}
    </a>
  );
}

export function Avatar({ id, size = 40 }: { id: string; size?: number }) {
  const name = useStore().fullName(id);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: colorFor(id) }} title={name}>
      {initials(name)}
    </span>
  );
}

const GROUP_ICONS: Record<Group['type'], string> = { home: '🏠', trip: '✈️', couple: '❤️', other: '📋' };
export const GROUP_TYPES: [Group['type'], string][] = [
  ['trip', 'Trip'],
  ['home', 'Home'],
  ['couple', 'Couple'],
  ['other', 'Other'],
];

export function GroupTile({ group, size = 48 }: { group: Group; size?: number }) {
  return (
    <span className="tile" style={{ width: size, height: size, fontSize: size * 0.5, background: colorFor(group.id) }}>
      {GROUP_ICONS[group.type] ?? '📋'}
    </span>
  );
}

export function CategoryTile({ id, size = 40 }: { id: string; size?: number }) {
  return (
    <span className="tile" style={{ width: size, height: size, fontSize: size * 0.5, background: categoryColor(id) }} title={category(id).name}>
      {category(id).icon}
    </span>
  );
}

export function IconButton(props: { icon: IconName; label: string; to?: string; onClick?: () => void }) {
  return (
    <button className="icon-btn" aria-label={props.label} title={props.label} onClick={props.onClick ?? (() => props.to && navigate(props.to))}>
      <Icon name={props.icon} />
    </button>
  );
}

export function SyncStrip() {
  const { sync } = useStore();
  let text: string | null = null;
  let cls = 'sync-strip';
  if (sync.error && sync.error !== 'no-access') {
    text = `Sync problem: ${sync.error}`;
    cls += ' error';
  } else if (!sync.online) {
    text = sync.pendingCount
      ? `Offline · ${sync.pendingCount} change${sync.pendingCount === 1 ? '' : 's'} saved on this device, will upload when you're back online`
      : "Offline · you can keep adding expenses, they'll sync later";
    cls += ' offline';
  } else if (sync.pendingCount) {
    text = `Syncing ${sync.pendingCount} change${sync.pendingCount === 1 ? '' : 's'}…`;
  }
  if (!text) return null;
  return (
    <div className={cls}>
      <Icon name={sync.online ? 'cloud' : 'cloudOff'} size={16} /> {text}
    </div>
  );
}

const TABS: [string, string, IconName][] = [
  ['groups', 'Groups', 'users'],
  ['friends', 'Friends', 'user'],
  ['activity', 'Activity', 'activity'],
  ['account', 'Account', 'settings'],
];

export function Page(props: {
  title: ReactNode;
  back?: string;
  right?: ReactNode;
  tab?: string;
  fab?: string;
  className?: string;
  topbarStyle?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className={`page ${props.tab ? 'has-tabs' : ''} ${props.className ?? ''}`}>
      <header className="topbar" style={props.topbarStyle}>
        {props.back !== undefined && (
          <button className="icon-btn" aria-label="Back" onClick={() => goBack(props.back!)}>
            <Icon name="back" />
          </button>
        )}
        <h1 className="topbar-title">{props.title}</h1>
        <div className="topbar-right">{props.right}</div>
      </header>
      <SyncStrip />
      <main className="content">{props.children}</main>
      {props.fab && (
        <button className="fab" onClick={() => navigate(props.fab!)}>
          <Icon name="receipt" size={20} /> Add expense
        </button>
      )}
      {props.tab && (
        <nav className="tabbar">
          {TABS.map(([id, label, icon]) => (
            <Link key={id} to={id} className={props.tab === id ? 'active' : ''}>
              <Icon name={icon} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

export function Sheet(props: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; done?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, []);
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <div className="sheet" role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <span />
          <h2>{props.title}</h2>
          <button className="link" onClick={props.onClose}>
            {props.done ?? 'Done'}
          </button>
        </div>
        <div className="sheet-body">{props.children}</div>
        {props.footer && <div className="sheet-foot">{props.footer}</div>}
      </div>
    </div>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="toggle-row">
      <span>
        {props.label}
        {props.hint && <small className="muted block">{props.hint}</small>}
      </span>
      <input type="checkbox" className="switch" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
    </label>
  );
}

export function Empty(props: { icon?: string; title: string; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty">
      {props.icon && <div className="empty-icon">{props.icon}</div>}
      <h3>{props.title}</h3>
      {props.text && <p className="muted">{props.text}</p>}
      {props.children}
    </div>
  );
}

export function BalanceSide(props: { balance: ByCurrency | undefined; empty?: string; owedLabel?: string; oweLabel?: string }) {
  const t = useBalanceText()(props.balance);
  if (t.zero) return <div className="side muted">{props.empty ?? 'settled up'}</div>;
  return (
    <div className="side">
      {t.pos && (
        <>
          <small className="pos">{props.owedLabel ?? 'you are owed'}</small>
          <b className="pos">{t.pos}</b>
        </>
      )}
      {t.neg && (
        <>
          <small className="neg">{props.oweLabel ?? 'you owe'}</small>
          <b className="neg">{t.neg}</b>
        </>
      )}
    </div>
  );
}

export function Overall({ balance }: { balance: ByCurrency }) {
  const t = useBalanceText()(balance);
  return (
    <div className="overall">
      {t.zero && <span className="muted">You are all settled up!</span>}
      {t.pos && (
        <div>
          Overall, you are owed <b className="pos">{t.pos}</b>
        </div>
      )}
      {t.neg && (
        <div>
          Overall, you owe <b className="neg">{t.neg}</b>
        </div>
      )}
    </div>
  );
}

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let timer = 0;
    const onToast = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), 3500);
    };
    window.addEventListener('eqsplit:toast', onToast);
    return () => window.removeEventListener('eqsplit:toast', onToast);
  }, []);
  return msg ? (
    <div className="toast" role="status" onClick={() => setMsg(null)}>
      {msg}
    </div>
  ) : null;
}

export function Splash({ text }: { text?: string }) {
  return (
    <div className="splash">
      <div className="logo-mark" />
      <p className="muted">{text ?? 'Loading…'}</p>
    </div>
  );
}

export function CurrencySelect(props: { value: string; onChange: (c: string) => void; className?: string }) {
  return (
    <select className={props.className ?? 'select'} value={props.value} onChange={(e) => props.onChange(e.target.value)} aria-label="Currency">
      {CURRENCIES.map(([code, , symbol]) => (
        <option key={code} value={code}>
          {symbol} {code}
        </option>
      ))}
    </select>
  );
}
