import { useRef, useState, type ChangeEvent } from 'react';
import { useStore } from '../data/store';
import type { Expense, Group, ID, Repeat, SplitMethod } from '../data/types';
import { CATEGORIES, guessCategory } from '../lib/categories';
import { REPEAT_LABELS, todayISO } from '../lib/dates';
import { compressImage } from '../lib/files';
import { newId } from '../lib/id';
import { formatMoney, minorToInput } from '../lib/money';
import { goBack } from '../lib/router';
import { computeSplit, SPLIT_LABELS, type ItemDraft } from '../lib/split';
import { toast } from '../lib/toast';
import { useSettings } from '../settings';
import { Avatar, CategoryTile, CurrencySelect, Empty, GroupTile, Page, Sheet } from '../ui/components';
import { Icon } from '../ui/Icon';

type SheetName = 'with' | 'category' | 'paid' | 'split' | 'more' | null;

const METHODS: [SplitMethod, string, string][] = [
  ['equal', '=', 'Equally'],
  ['exact', '1.23', 'Exact'],
  ['percent', '%', 'Percent'],
  ['shares', '▥', 'Shares'],
  ['adjust', '+/−', 'Adjust'],
  ['itemized', '🧾', 'Items'],
];

const METHOD_HINT: Record<SplitMethod, string> = {
  equal: 'Select which people owe an equal share.',
  exact: 'Specify exactly how much each person owes.',
  percent: 'Enter the percentage split that is fair for your situation.',
  shares: 'Great for time-based splitting (2 nights → 2 shares) and splitting across families (family of 3 → 3 shares).',
  adjust: 'Enter adjustments to reflect who owes extra. The rest is split equally.',
  itemized: 'Add each item on the bill and who shared it. Tax and tip are shared in proportion.',
};

const mapValues = <T,>(o: Record<string, number>, f: (v: number) => T): Record<string, T> =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));

interface Init {
  groupId: ID | null;
  involved: ID[];
  desc: string;
  amountStr: string;
  currency: string;
  date: string;
  category: string;
  notes: string;
  repeat: Repeat;
  payMode: 'single' | 'multi';
  payer: ID;
  paidInputs: Record<ID, string>;
  method: SplitMethod;
  excluded: ID[];
  splitInputs: Record<ID, string>;
  items: ItemDraft[];
  taxStr: string;
  tipStr: string;
}

function initial(
  me: ID,
  groups: Record<ID, Group>,
  myGroups: Group[],
  defCur: string,
  src: Expense | undefined,
  isCopy: boolean,
  qGroup?: string | null,
  qFriend?: string | null,
): Init {
  if (src) {
    const cur = src.currency;
    const involved = [...new Set([...Object.keys(src.paidBy), ...Object.keys(src.owed)])];
    const payers = Object.keys(src.paidBy);
    const method = src.splitMethod ?? 'exact';
    const asText = (v: number) => (method === 'percent' || method === 'shares' ? String(v) : minorToInput(v, cur));
    const g = groups[src.groupId];
    const all = g ? [...new Set([...g.memberIds, ...involved])] : involved;
    return {
      groupId: g ? g.id : null,
      involved,
      desc: src.description,
      amountStr: minorToInput(src.amount, cur),
      currency: cur,
      date: isCopy ? todayISO() : src.date,
      category: src.category,
      notes: src.notes ?? '',
      repeat: isCopy ? 'never' : (src.repeat ?? 'never'),
      payMode: payers.length > 1 ? 'multi' : 'single',
      payer: payers[0] ?? me,
      paidInputs: mapValues(src.paidBy, (v) => minorToInput(v, cur)),
      method,
      excluded: method === 'equal' ? all.filter((p) => !(p in src.owed)) : [],
      splitInputs: src.splitInput
        ? mapValues(src.splitInput, asText)
        : method === 'exact'
          ? mapValues(src.owed, (v) => minorToInput(v, cur))
          : {},
      items: (src.items ?? []).map((it) => ({ id: it.id, name: it.name, amount: minorToInput(it.amount, cur), personIds: it.personIds })),
      taxStr: src.tax ? minorToInput(src.tax, cur) : '',
      tipStr: src.tip ? minorToInput(src.tip, cur) : '',
    };
  }
  const g = qGroup
    ? groups[qGroup]
    : qFriend
      ? myGroups.find((x) => x.memberIds.includes(qFriend))
      : myGroups.length === 1
        ? myGroups[0]
        : undefined;
  return {
    groupId: g?.id ?? null,
    involved: [],
    desc: '',
    amountStr: '',
    currency: g?.defaultCurrency ?? defCur,
    date: todayISO(),
    category: 'general',
    notes: '',
    repeat: 'never',
    payMode: 'single',
    payer: me,
    paidInputs: {},
    method: g?.defaultSplit ? 'shares' : 'equal',
    excluded: [],
    splitInputs: g?.defaultSplit ? mapValues(g.defaultSplit, String) : {},
    items: [],
    taxStr: '',
    tipStr: '',
  };
}

export function ExpenseEditor(props: { id?: string; groupId?: string | null; friendId?: string | null; copyId?: string | null }) {
  const s = useStore();
  const existing = props.id ? s.data.expenses[props.id] : undefined;
  if (props.id && (!existing || existing.isPayment)) {
    return (
      <Page title="Edit expense" back="groups">
        <Empty title="Expense not found" />
      </Page>
    );
  }
  const copy = props.copyId ? s.data.expenses[props.copyId] : undefined;
  return <Editor existing={existing} copy={copy} qGroup={props.groupId} qFriend={props.friendId} />;
}

function Editor({ existing, copy, qGroup, qFriend }: { existing?: Expense; copy?: Expense; qGroup?: string | null; qFriend?: string | null }) {
  const s = useStore();
  const { settings } = useSettings();
  const me = s.meId;
  const myGroups = s.groups.filter((g) => g.memberIds.includes(me));
  const [init] = useState(() => initial(me, s.data.groups, myGroups, settings.currency, existing ?? copy, !existing && !!copy, qGroup, qFriend));

  const [groupId, setGroupId] = useState(init.groupId);
  const [desc, setDesc] = useState(init.desc);
  const [amountStr, setAmountStr] = useState(init.amountStr);
  const [currency, setCurrency] = useState(init.currency);
  const [date, setDate] = useState(init.date);
  const [cat, setCat] = useState(init.category);
  const [catTouched, setCatTouched] = useState(!!(existing ?? copy));
  const [notes, setNotes] = useState(init.notes);
  const [repeat, setRepeat] = useState<Repeat>(init.repeat);
  const [payMode, setPayMode] = useState(init.payMode);
  const [payer, setPayer] = useState(init.payer);
  const [paidInputs, setPaidInputs] = useState(init.paidInputs);
  const [method, setMethod] = useState<SplitMethod>(init.method);
  const [excluded, setExcluded] = useState(init.excluded);
  const [splitInputs, setSplitInputs] = useState(init.splitInputs);
  const [items, setItems] = useState(init.items);
  const [taxStr, setTaxStr] = useState(init.taxStr);
  const [tipStr, setTipStr] = useState(init.tipStr);
  const [receipt, setReceipt] = useState<string | null | undefined>(undefined);
  const [sheet, setSheet] = useState<SheetName>(init.groupId ? null : 'with');
  const fileRef = useRef<HTMLInputElement>(null);

  const group = groupId ? s.data.groups[groupId] : undefined;
  const participants = group ? [...new Set([...group.memberIds, ...(groupId === init.groupId ? init.involved : [])])] : [];
  const payerEff = participants.includes(payer) ? payer : participants.includes(me) ? me : (participants[0] ?? me);

  const calc = computeSplit({
    participants,
    currency,
    amountStr,
    payMode,
    payer: payerEff,
    paidInputs,
    method,
    excluded,
    splitInputs,
    items,
    taxStr,
    tipStr,
  });
  const money = (v: number) => formatMoney(v, currency);
  const fallback = groupId ? `group/${groupId}` : 'groups';
  const hasReceipt = receipt !== undefined ? receipt !== null : !!existing?.hasReceipt;

  const onDesc = (v: string) => {
    setDesc(v);
    if (!catTouched) setCat(guessCategory(v) ?? 'general');
  };

  const chooseGroup = (g: Group) => {
    setGroupId(g.id);
    if (!existing) {
      if (g.defaultCurrency) setCurrency(g.defaultCurrency);
      if (g.defaultSplit) {
        setMethod('shares');
        setSplitInputs(mapValues(g.defaultSplit, String));
      }
    }
    setSheet(null);
  };
  const changeMethod = (m: SplitMethod) => {
    if (m === method) return;
    setMethod(m);
    if (m === 'shares') setSplitInputs(Object.fromEntries(participants.map((p) => [p, '1'])));
    else setSplitInputs({});
    if (m === 'itemized' && !items.length) setItems([{ id: newId(), name: '', amount: '', personIds: participants }]);
  };
  const setItem = (i: number, patch: Partial<ItemDraft>) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const onFile = async (ev: ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    try {
      setReceipt(await compressImage(f));
    } catch {
      toast('Could not read that image');
    }
  };

  const save = () => {
    if (!groupId) {
      setSheet('with');
      return toast('Choose a group');
    }
    if (!desc.trim()) return toast('Enter a description');
    if (calc.amount <= 0) return toast(method === 'itemized' ? 'Add the item prices' : 'Enter an amount');
    if (calc.payError) {
      setSheet('paid');
      return toast(calc.payError);
    }
    if (calc.splitError) {
      setSheet('split');
      return toast(calc.splitError);
    }
    const t = Date.now();
    const e: Expense = {
      ...(existing ?? { id: newId(), createdAt: t, createdBy: me, updatedAt: t }),
      groupId,
      description: desc.trim(),
      amount: calc.amount,
      currency,
      date: date || todayISO(),
      category: cat,
      paidBy: calc.paidBy,
      owed: calc.owed,
      splitMethod: method,
      splitInput: calc.splitInput,
      items: calc.items,
      tax: calc.tax,
      tip: calc.tip,
      notes: notes.trim() || undefined,
      repeat: repeat === 'never' ? undefined : repeat,
    };
    s.saveExpense(e, !existing, receipt);
    goBack(fallback);
  };

  const payLabel = payMode === 'multi' ? 'multiple people' : payerEff === me ? 'you' : s.name(payerEff).split(' ')[0];
  const problem = calc.amount > 0 ? (calc.payError ?? calc.splitError) : null;

  return (
    <Page
      title={existing ? 'Edit expense' : 'Add an expense'}
      back={fallback}
      right={
        <button className="link strong" onClick={save}>
          Save
        </button>
      }
    >
      <button className="with-bar" onClick={() => (existing ? toast('An expense can’t be moved to another group') : setSheet('with'))}>
        <span className="muted">
          With <b>you</b> and:
        </span>
        {group ? (
          <span className="pill">
            <GroupTile group={group} size={20} /> All of {group.name}
          </span>
        ) : (
          <span className="muted">choose a group</span>
        )}
      </button>

      <div className="editor-main">
        <div className="editor-line">
          <button className="plain" onClick={() => setSheet('category')} aria-label="Choose category">
            <CategoryTile id={cat} size={48} />
          </button>
          <input className="big-input" placeholder="Enter a description" value={desc} onChange={(e) => onDesc(e.target.value)} />
        </div>
        <div className="editor-line">
          <CurrencySelect className="cur-select" value={currency} onChange={setCurrency} />
          <input
            className="big-input amount"
            inputMode="decimal"
            placeholder="0.00"
            value={method === 'itemized' ? minorToInput(calc.amount, currency) : amountStr}
            readOnly={method === 'itemized'}
            onClick={method === 'itemized' ? () => setSheet('split') : undefined}
            onChange={(e) => setAmountStr(e.target.value)}
          />
        </div>
        <div className="paid-split">
          Paid by{' '}
          <button className="pill-btn" onClick={() => setSheet('paid')}>
            {payLabel}
          </button>{' '}
          and split{' '}
          <button className="pill-btn" onClick={() => setSheet('split')}>
            {SPLIT_LABELS[method]}
          </button>
          .
        </div>
        {problem && <div className="warn tiny center">{problem}</div>}
        {calc.amount > 0 && !problem && method === 'equal' && participants.length - excluded.length > 0 && (
          <div className="muted tiny center">
            ({money(Math.round(calc.amount / Math.max(1, Object.keys(calc.owed).length)))}/person)
          </div>
        )}
      </div>

      <div className="editor-tools">
        <label className="tool">
          <Icon name="calendar" size={18} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="tool" onClick={() => fileRef.current?.click()}>
          <Icon name="camera" size={18} /> {hasReceipt ? 'Receipt ✓' : 'Receipt'}
        </button>
        <button className="tool" onClick={() => setSheet('more')}>
          <Icon name="note" size={18} /> {notes ? 'Notes ✓' : 'Notes'}
        </button>
        {!existing?.recurringOf && (
          <button className="tool" onClick={() => setSheet('more')}>
            <Icon name="repeat" size={18} /> {repeat !== 'never' ? REPEAT_LABELS[repeat] : 'Repeat'}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      </div>
      {hasReceipt && (
        <div className="receipt-preview">
          {receipt ? <img src={receipt} alt="Receipt" /> : <span className="muted tiny">📎 Receipt attached</span>}
          <button className="link" onClick={() => setReceipt(null)}>
            Remove receipt
          </button>
        </div>
      )}

      {sheet === 'with' && (
        <Sheet title="Choose a group" onClose={() => setSheet(null)}>
          {myGroups.length === 0 && <p className="muted">You are not in any group yet.</p>}
          {myGroups.map((g) => (
            <button key={g.id} className={`row choice ${groupId === g.id ? 'selected' : ''}`} onClick={() => chooseGroup(g)}>
              <GroupTile group={g} size={32} />
              <span className="main">{g.name}</span>
              {groupId === g.id && <Icon name="check" />}
            </button>
          ))}
        </Sheet>
      )}

      {sheet === 'category' && (
        <Sheet title="Category" onClose={() => setSheet(null)} done="Close">
          {[...new Set(CATEGORIES.filter((c) => c.id !== 'payment').map((c) => c.section))].map((section) => (
            <div key={section}>
              <h3 className="section-title">{section}</h3>
              <div className="cat-grid">
                {CATEGORIES.filter((c) => c.section === section).map((c) => (
                  <button
                    key={c.id}
                    className={`cat-choice ${cat === c.id ? 'selected' : ''}`}
                    onClick={() => {
                      setCat(c.id);
                      setCatTouched(true);
                      setSheet(null);
                    }}
                  >
                    <CategoryTile id={c.id} size={40} />
                    <small>{c.name}</small>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Sheet>
      )}

      {sheet === 'paid' && (
        <Sheet
          title="Who paid?"
          onClose={() => setSheet(null)}
          footer={
            payMode === 'multi' && (
              <div className={calc.payError ? 'warn' : 'ok'}>{calc.payError ?? `${money(calc.amount)} – all paid up ✓`}</div>
            )
          }
        >
          {payMode === 'single' &&
            participants.map((p) => (
              <button
                key={p}
                className={`row choice ${p === payerEff ? 'selected' : ''}`}
                onClick={() => {
                  setPayer(p);
                  setSheet(null);
                }}
              >
                <Avatar id={p} size={32} />
                <span className="main">{s.name(p)}</span>
                {p === payerEff && <Icon name="check" />}
              </button>
            ))}
          <button
            className="row choice"
            onClick={() => {
              if (payMode === 'multi') setPayMode('single');
              else {
                setPayMode('multi');
                if (!Object.keys(paidInputs).length && amountStr) setPaidInputs({ [payerEff]: amountStr });
              }
            }}
          >
            <span className="main strong">{payMode === 'multi' ? '← Back to a single payer' : 'Multiple people'}</span>
          </button>
          {payMode === 'multi' &&
            participants.map((p) => (
              <div key={p} className="row split-row">
                <Avatar id={p} size={32} />
                <span className="main">{s.name(p)}</span>
                <span className="muted tiny">{currency}</span>
                <input
                  className="num-input"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={paidInputs[p] ?? ''}
                  onChange={(e) => setPaidInputs({ ...paidInputs, [p]: e.target.value })}
                />
              </div>
            ))}
        </Sheet>
      )}

      {sheet === 'split' && (
        <Sheet
          title="Split options"
          onClose={() => setSheet(null)}
          footer={
            <div className={calc.splitError ? 'warn' : 'ok'}>
              {calc.splitError ??
                (method === 'shares'
                  ? `${Object.values(calc.splitInput ?? {}).reduce((a, b) => a + b, 0)} total shares · ${money(calc.amount)}`
                  : `${money(calc.amount)} split between ${Object.keys(calc.owed).length} ✓`)}
            </div>
          }
        >
          <div className="method-tabs">
            {METHODS.map(([m, sym, label]) => (
              <button key={m} className={method === m ? 'active' : ''} onClick={() => changeMethod(m)} title={label}>
                <b>{sym}</b>
                <small>{label}</small>
              </button>
            ))}
          </div>
          <p className="muted tiny">{METHOD_HINT[method]}</p>

          {method === 'equal' &&
            participants.map((p) => (
              <label key={p} className="row check-row">
                <Avatar id={p} size={32} />
                <span className="main">{s.name(p)}</span>
                <span className="muted tiny">{calc.owed[p] ? money(calc.owed[p]) : ''}</span>
                <input
                  type="checkbox"
                  checked={!excluded.includes(p)}
                  onChange={() => setExcluded((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))}
                />
              </label>
            ))}

          {(method === 'exact' || method === 'percent' || method === 'shares' || method === 'adjust') &&
            participants.map((p) => (
              <div key={p} className="row split-row">
                <Avatar id={p} size={32} />
                <span className="main">
                  {s.name(p)}
                  {method !== 'exact' && <small className="muted block">{calc.owed[p] ? money(calc.owed[p]) : money(0)}</small>}
                </span>
                {method === 'adjust' && <span className="muted tiny">+</span>}
                {(method === 'exact' || method === 'adjust') && <span className="muted tiny">{currency}</span>}
                <input
                  className="num-input"
                  inputMode="decimal"
                  placeholder={method === 'shares' ? '0' : method === 'percent' ? '0' : '0.00'}
                  value={splitInputs[p] ?? ''}
                  onChange={(e) => setSplitInputs({ ...splitInputs, [p]: e.target.value })}
                />
                {method === 'percent' && <span className="muted tiny">%</span>}
                {method === 'shares' && <span className="muted tiny">share(s)</span>}
              </div>
            ))}

          {method === 'itemized' && (
            <div className="items">
              {items.map((it, i) => (
                <div key={it.id} className="item-edit">
                  <div className="item-top">
                    <input placeholder="Item name" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
                    <input className="num-input" inputMode="decimal" placeholder="0.00" value={it.amount} onChange={(e) => setItem(i, { amount: e.target.value })} />
                    <button className="icon-btn" aria-label="Remove item" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                      <Icon name="x" size={18} />
                    </button>
                  </div>
                  <div className="item-people">
                    {participants.map((p) => (
                      <button
                        key={p}
                        className={`mini-chip ${it.personIds.includes(p) ? 'on' : ''}`}
                        onClick={() =>
                          setItem(i, { personIds: it.personIds.includes(p) ? it.personIds.filter((x) => x !== p) : [...it.personIds, p] })
                        }
                      >
                        {s.name(p)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button className="btn outline small" onClick={() => setItems([...items, { id: newId(), name: '', amount: '', personIds: participants }])}>
                + Add item
              </button>
              <div className="row split-row">
                <span className="main">Tax</span>
                <input className="num-input" inputMode="decimal" placeholder="0.00" value={taxStr} onChange={(e) => setTaxStr(e.target.value)} />
              </div>
              <div className="row split-row">
                <span className="main">Tip / service charge</span>
                <input className="num-input" inputMode="decimal" placeholder="0.00" value={tipStr} onChange={(e) => setTipStr(e.target.value)} />
              </div>
              {Object.keys(calc.owed).length > 0 && (
                <div className="card">
                  {Object.entries(calc.owed).map(([p, v]) => (
                    <div key={p} className="item-line">
                      <span>{s.name(p)}</span>
                      <b>{money(v)}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Sheet>
      )}

      {sheet === 'more' && (
        <Sheet title="Notes & repeat" onClose={() => setSheet(null)}>
          <label className="form-label">
            Notes
            <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes" />
          </label>
          {!existing?.recurringOf && (
            <>
              <h3 className="section-title">Repeat</h3>
              {(Object.keys(REPEAT_LABELS) as Repeat[]).map((r) => (
                <button key={r} className={`row choice ${repeat === r ? 'selected' : ''}`} onClick={() => setRepeat(r)}>
                  <span className="main">{REPEAT_LABELS[r]}</span>
                  {repeat === r && <Icon name="check" />}
                </button>
              ))}
              <p className="tiny muted">Repeats are added automatically on their date, the next time anyone opens EqSplit.</p>
            </>
          )}
        </Sheet>
      )}
    </Page>
  );
}
