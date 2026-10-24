import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { addInto, friendBalances, groupDebts, netBalances, type ByCurrency, type Debt, type FriendBalance, type NetBalances } from '../lib/balances';
import { todayISO } from '../lib/dates';
import { newId, newJoinCode } from '../lib/id';
import { dueOccurrences } from '../lib/recurring';
import type { Activity, AuthUser, Backend, Backup, ColName, Comment, DataSnapshot, DocOf, Expense, Group, ID, Person, SyncState } from './types';

export interface GroupInfo {
  expenses: Expense[];
  debts: Debt[];
  net: NetBalances;
  myNet: ByCurrency;
  last: number;
}

export interface Friend {
  id: ID;
  name: string;
}

export interface Store {
  backend: Backend;
  signOut(): void;
  data: DataSnapshot;
  sync: SyncState;
  meId: ID;
  isAdmin: boolean;
  people: Person[];
  friends: Friend[];
  groups: Group[];
  expenses: Expense[];
  activity: Activity[];
  groupInfo: Record<ID, GroupInfo>;
  friendBal: Record<ID, FriendBalance>;
  overall: ByCurrency;
  name(id: ID, lower?: boolean): string;
  fullName(id: ID): string;
  savePerson(p: Person): void;
  resetLogin(id: ID): void;
  saveGroup(g: Group, isNew: boolean): void;
  deleteGroup(id: ID): void;
  renewJoinCode(id: ID): void;
  saveExpense(e: Expense, isNew: boolean, receipt?: string | null): void;
  deleteExpense(id: ID): void;
  restoreExpense(id: ID): void;
  addComment(expenseId: ID, text: string): void;
  deleteComment(id: ID): void;
  exportAll(): Promise<Backup>;
  importAll(b: Backup): number;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

const EMPTY: DataSnapshot = {
  people: {},
  groups: {},
  expenses: {},
  comments: {},
  activity: {},
  adminId: null,
  loaded: false,
  synced: false,
};

export function StoreProvider(props: { backend: Backend; me: AuthUser; signOut: () => void; children: ReactNode }) {
  const { backend, me } = props;
  const meId = me.personId;
  const [data, setData] = useState<DataSnapshot>(EMPTY);
  const [sync, setSync] = useState<SyncState>({ online: navigator.onLine, pendingCount: 0, error: null });

  useEffect(() => backend.start(me, setData, setSync), [backend, me]);

  const recurringDone = useRef(false);
  useEffect(() => {
    if (recurringDone.current || !data.synced) return;
    recurringDone.current = true;
    const today = todayISO();
    const created: Expense[] = [];
    for (const e of Object.values(data.expenses)) {
      if (e.deleted || e.recurringOf || !e.repeat || e.repeat === 'never') continue;
      if (!data.groups[e.groupId] || data.groups[e.groupId].deleted) continue;
      for (const date of dueOccurrences(e.date, e.repeat, today)) {
        const id = `${e.id}_${date}`;
        if (data.expenses[id]) continue;
        const t = Date.now();
        created.push({ ...e, id, date, repeat: 'never', recurringOf: e.id, hasReceipt: false, createdAt: t, updatedAt: t });
      }
    }
    if (created.length) backend.putMany('expenses', created);
  }, [backend, data]);

  const derived = useMemo(() => {
    const groups = Object.values(data.groups).filter((g) => !g.deleted);
    const liveIds = new Set(groups.map((g) => g.id));
    const names: Record<ID, string> = {};
    for (const g of groups) Object.assign(names, g.names);
    for (const p of Object.values(data.people)) names[p.id] = p.name;

    const expenses = Object.values(data.expenses)
      .filter((e) => !e.deleted && liveIds.has(e.groupId))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    const groupInfo: Record<ID, GroupInfo> = {};
    for (const g of groups) groupInfo[g.id] = { expenses: [], debts: [], net: {}, myNet: {}, last: g.updatedAt };
    for (const e of expenses) {
      const gi = groupInfo[e.groupId];
      gi.expenses.push(e);
      gi.last = Math.max(gi.last, e.updatedAt);
    }
    for (const g of groups) {
      const gi = groupInfo[g.id];
      gi.net = netBalances(gi.expenses);
      gi.debts = groupDebts(g, gi.expenses);
      for (const [cur, m] of Object.entries(gi.net)) if (m[meId]) gi.myNet[cur] = m[meId];
    }
    groups.sort((a, b) => groupInfo[b.id].last - groupInfo[a.id].last);

    const friendIds = new Set<ID>();
    for (const g of groups) if (g.memberIds.includes(meId)) g.memberIds.forEach((m) => friendIds.add(m));
    friendIds.delete(meId);
    const friends = [...friendIds].map((id) => ({ id, name: names[id] ?? 'Someone' })).sort((a, b) => a.name.localeCompare(b.name));

    const friendBal = friendBalances(
      meId,
      groups.map((g) => ({ key: g.id, debts: groupInfo[g.id].debts })),
    );
    const overall: ByCurrency = {};
    for (const fb of Object.values(friendBal)) addInto(overall, fb.total);

    return {
      names,
      people: Object.values(data.people)
        .filter((p) => !p.deleted)
        .sort((a, b) => a.name.localeCompare(b.name)),
      friends,
      groups,
      expenses,
      groupInfo,
      friendBal,
      overall,
      activity: Object.values(data.activity)
        .filter((a) => liveIds.has(a.groupId))
        .sort((a, b) => b.at - a.at),
    };
  }, [data, meId]);

  const { names, ...rest } = derived;
  const log = (a: Omit<Activity, 'id' | 'at' | 'by'>) => backend.put('activity', { ...a, id: newId(), at: Date.now(), by: meId });
  const touch = <T extends { updatedAt: number }>(doc: T): T => ({ ...doc, updatedAt: Date.now() });
  const publishCode = (g: Group) => backend.setJoinCode(g.code, { groupId: g.id, groupName: g.name, memberIds: g.memberIds });

  const store: Store = {
    backend,
    signOut: props.signOut,
    data,
    sync,
    meId,
    isAdmin: data.adminId === meId,
    ...rest,
    name(id, lower) {
      if (id === meId) return lower ? 'you' : 'You';
      return names[id] ?? 'Someone';
    },
    fullName(id) {
      return names[id] ?? 'Someone';
    },
    savePerson(p) {
      const old = data.people[p.id];
      backend.put('people', touch(p));
      if (old && old.name !== p.name) {
        for (const g of Object.values(data.groups)) {
          if (g.names?.[p.id] !== undefined) backend.put('groups', touch({ ...g, names: { ...g.names, [p.id]: p.name } }));
        }
      }
    },
    resetLogin(id) {
      const p = data.people[id];
      if (p) backend.put('people', touch({ ...p, loginVersion: (p.loginVersion ?? 0) + 1, joined: false }));
    },
    saveGroup(g, isNew) {
      const names: Record<ID, string> = { ...g.names };
      for (const m of g.memberIds) names[m] = data.people[m]?.name ?? names[m] ?? 'Someone';
      const doc = touch({ ...g, names, code: g.code || newJoinCode() });
      backend.put('groups', doc);
      publishCode(doc);
      log({ kind: isNew ? 'group_created' : 'group_updated', label: doc.name, groupId: doc.id });
    },
    deleteGroup(id) {
      const g = data.groups[id];
      if (!g) return;
      backend.put('groups', touch({ ...g, deleted: true }));
      backend.setJoinCode(g.code, null);
    },
    renewJoinCode(id) {
      const g = data.groups[id];
      if (!g) return;
      backend.setJoinCode(g.code, null);
      const doc = touch({ ...g, code: newJoinCode() });
      backend.put('groups', doc);
      publishCode(doc);
    },
    saveExpense(e, isNew, receipt) {
      const doc: Expense = touch({ ...e, updatedBy: meId });
      if (isNew) {
        doc.createdAt = doc.updatedAt;
        doc.createdBy = meId;
      }
      if (receipt !== undefined) {
        doc.hasReceipt = receipt !== null;
        backend.saveReceipt(doc.groupId, doc.id, receipt);
      }
      backend.put('expenses', doc);
      log({
        kind: !isNew ? 'expense_updated' : doc.isPayment ? 'payment_added' : 'expense_added',
        label: doc.description,
        expenseId: doc.id,
        groupId: doc.groupId,
      });
    },
    deleteExpense(id) {
      const e = data.expenses[id];
      if (!e) return;
      backend.put('expenses', touch({ ...e, deleted: true, updatedBy: meId }));
      log({ kind: 'expense_deleted', label: e.description, expenseId: id, groupId: e.groupId });
    },
    restoreExpense(id) {
      const e = data.expenses[id];
      if (!e) return;
      backend.put('expenses', touch({ ...e, deleted: false, updatedBy: meId }));
      log({ kind: 'expense_restored', label: e.description, expenseId: id, groupId: e.groupId });
    },
    addComment(expenseId, text) {
      const e = data.expenses[expenseId];
      if (!e) return;
      const t = Date.now();
      const c: Comment = { id: newId(), groupId: e.groupId, expenseId, personId: meId, text, createdAt: t, updatedAt: t };
      backend.put('comments', c);
      log({ kind: 'comment_added', label: e.description, expenseId, groupId: e.groupId, text });
    },
    deleteComment(id) {
      const c = data.comments[id];
      if (c) backend.put('comments', touch({ ...c, deleted: true }));
    },
    async exportAll() {
      const receipts: Record<ID, string> = {};
      for (const e of Object.values(data.expenses)) {
        if (!e.hasReceipt) continue;
        const r = await backend.getReceipt(e.groupId, e.id);
        if (r) receipts[e.id] = r;
      }
      return {
        app: 'eqsplit',
        version: 2,
        exportedAt: new Date().toISOString(),
        people: Object.values(data.people),
        groups: Object.values(data.groups),
        expenses: Object.values(data.expenses),
        comments: Object.values(data.comments),
        activity: Object.values(data.activity),
        receipts,
      };
    },
    importAll(b) {
      let count = 0;
      const merge = <C extends ColName>(col: C, docs: DocOf[C][] | undefined) => {
        const existing = data[col] as Record<ID, DocOf[C]>;
        const fresh = (docs ?? []).filter((d) => {
          if (!d?.id) return false;
          const old = existing[d.id] as { updatedAt?: number } | undefined;
          return !old || (old.updatedAt ?? 0) < ((d as { updatedAt?: number }).updatedAt ?? 0);
        });
        backend.putMany(col, fresh);
        count += fresh.length;
        return fresh;
      };
      merge('people', b.people);
      merge('groups', b.groups).forEach((g) => !g.deleted && g.code && publishCode(g));
      merge('expenses', b.expenses);
      merge('comments', b.comments);
      merge('activity', b.activity);
      const expenses = new Map((b.expenses ?? []).map((e) => [e.id, e]));
      for (const [id, img] of Object.entries(b.receipts ?? {})) {
        const e = expenses.get(id);
        if (e) backend.saveReceipt(e.groupId, id, img);
      }
      return count;
    },
  };

  return <Ctx.Provider value={store}>{props.children}</Ctx.Provider>;
}
