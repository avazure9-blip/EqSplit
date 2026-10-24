import { initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  setDoc,
  deleteDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type Firestore,
  type FirestoreError,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import { firebaseConfig } from '../firebaseConfig';
import { newId } from '../lib/id';
import { toast } from '../lib/toast';
import type { Activity, AuthUser, Backend, ColName, Comment, DataSnapshot, DocOf, Expense, Person } from './types';

const DOMAIN = 'eqsplit.local';
const loginEmail = (personId: string, version: number) => `${personId}-${version}@${DOMAIN}`;

export function parseLogin(email: string | null | undefined): AuthUser | null {
  const m = email?.match(/^([a-z0-9]+)-(\d+)@eqsplit\.local$/);
  return m ? { personId: m[1], loginVersion: Number(m[2]) } : null;
}

export interface PublicPerson {
  id: string;
  name: string;
  loginVersion: number;
  joined: boolean;
}

export interface AdminInfo {
  personId: string;
  name: string;
}

export interface FirebaseApi {
  backend: Backend;
  watchAuth(cb: (u: AuthUser | null) => void): () => void;
  getAdmin(): Promise<AdminInfo | null>;
  setupAdmin(name: string, password: string): Promise<void>;
  lookupCode(code: string): Promise<{ groupName: string; people: PublicPerson[] } | null>;
  getPerson(id: string): Promise<PublicPerson | null>;
  join(p: PublicPerson, password: string): Promise<void>;
  login(p: PublicPerson, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'Wrong password',
  'auth/wrong-password': 'Wrong password',
  'auth/user-not-found': 'This name has not joined yet',
  'auth/email-already-in-use': 'This name has already joined. Log in with your password instead.',
  'auth/weak-password': 'Password must be at least 6 characters',
  'auth/network-request-failed': 'No internet connection. You need internet to log in.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/operation-not-allowed': 'Email/Password sign-in is not enabled in the Firebase console.',
};

function friendly(err: unknown): Error {
  const code = (err as { code?: string }).code ?? '';
  if (code === 'unavailable') return new Error('No internet connection');
  if (code === 'permission-denied') return new Error('Not allowed. Check the Firestore rules are published.');
  return new Error(AUTH_ERRORS[code] ?? (err as Error).message ?? 'Something went wrong');
}

const writeFailed = (err: unknown) => {
  console.error(err);
  toast('A change was rejected by the server. You may no longer have access to that group.');
};

const toPublic = (id: string, d: Record<string, unknown> | undefined): PublicPerson | null =>
  d && !d.deleted
    ? { id, name: String(d.name ?? ''), loginVersion: Number(d.loginVersion ?? 0), joined: Boolean(d.joined) }
    : null;

let instance: FirebaseApi | null = null;

export function createFirebase(): FirebaseApi {
  return (instance ??= build());
}

function build(): FirebaseApi {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  let db: Firestore;
  try {
    db = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    db = getFirestore(app);
  }

  const refFor = <C extends ColName>(col: C, d: DocOf[C]): DocumentReference => {
    if (col === 'people' || col === 'groups') return doc(db, col, d.id);
    return doc(db, 'groups', (d as Expense | Comment | Activity).groupId, col, d.id);
  };

  const backend: Backend = {
    start(me, onData, onSync) {
      interface Sub {
        unsub: Unsubscribe;
        received: boolean;
        confirmed: boolean;
        pending: number;
      }
      type Docs = Record<string, Record<string, unknown>>;
      const subs = new Map<string, Sub>();
      const groupData: Record<string, { expenses: Docs; comments: Docs; activity: Docs }> = {};
      let people: Docs = {};
      let groups: Docs = {};
      let adminId: string | null = null;
      let adminKnown = false;
      let error: string | null = null;
      let queued = false;

      const emit = () => {
        queued = false;
        const merged = { expenses: {} as Docs, comments: {} as Docs, activity: {} as Docs };
        for (const gd of Object.values(groupData)) {
          Object.assign(merged.expenses, gd.expenses);
          Object.assign(merged.comments, gd.comments);
          Object.assign(merged.activity, gd.activity);
        }
        const all = [...subs.values()];
        onData({
          people,
          groups,
          ...merged,
          adminId,
          loaded: adminKnown && all.every((s) => s.received),
          synced: adminKnown && all.every((s) => s.confirmed),
        } as unknown as DataSnapshot);
        onSync({ online: navigator.onLine, pendingCount: all.reduce((n, s) => n + s.pending, 0), error });
      };
      const schedule = () => {
        if (!queued) {
          queued = true;
          queueMicrotask(emit);
        }
      };

      const stop = (key: string) => {
        subs.get(key)?.unsub();
        subs.delete(key);
      };
      const onErr = (s: Sub, critical: boolean) => (err: FirestoreError) => {
        console.warn('listener error', err);
        s.received = true;
        s.confirmed = true;
        if (critical) error = err.code === 'permission-denied' ? 'no-access' : err.message;
        schedule();
      };
      const watchQuery = (key: string, q: Query, critical: boolean, apply: (docs: Docs) => void) => {
        if (subs.has(key)) return;
        const s: Sub = { unsub: () => undefined, received: false, confirmed: false, pending: 0 };
        subs.set(key, s);
        s.unsub = onSnapshot(
          q,
          { includeMetadataChanges: true },
          (snap) => {
            const docs: Docs = {};
            let pending = 0;
            snap.forEach((d) => {
              docs[d.id] = { ...d.data(), id: d.id };
              if (d.metadata.hasPendingWrites) pending++;
            });
            s.pending = pending;
            s.received = true;
            if (!snap.metadata.fromCache) s.confirmed = true;
            apply(docs);
            schedule();
          },
          onErr(s, critical),
        );
      };
      const watchDoc = (key: string, ref: DocumentReference, apply: (d: Record<string, unknown> | null) => void) => {
        if (subs.has(key)) return;
        const s: Sub = { unsub: () => undefined, received: false, confirmed: false, pending: 0 };
        subs.set(key, s);
        s.unsub = onSnapshot(
          ref,
          { includeMetadataChanges: true },
          (snap) => {
            s.pending = snap.metadata.hasPendingWrites ? 1 : 0;
            s.received = true;
            if (!snap.metadata.fromCache) s.confirmed = true;
            apply(snap.exists() ? { ...snap.data(), id: snap.id } : null);
            schedule();
          },
          onErr(s, true),
        );
      };

      const syncGroups = () => {
        const live = new Set(Object.values(groups).filter((g) => !g.deleted).map((g) => String(g.id)));
        for (const key of [...subs.keys()]) {
          const gid = key.match(/^g:([^:]+):/)?.[1];
          if (gid && !live.has(gid)) {
            stop(key);
            delete groupData[gid];
          }
        }
        for (const gid of live) {
          const gd = (groupData[gid] ??= { expenses: {}, comments: {}, activity: {} });
          watchQuery(`g:${gid}:expenses`, query(collection(db, 'groups', gid, 'expenses')), false, (d) => (gd.expenses = d));
          watchQuery(`g:${gid}:comments`, query(collection(db, 'groups', gid, 'comments')), false, (d) => (gd.comments = d));
          watchQuery(
            `g:${gid}:activity`,
            query(collection(db, 'groups', gid, 'activity'), orderBy('at', 'desc'), limit(150)),
            false,
            (d) => (gd.activity = d),
          );
        }
      };

      let rootIsAdmin: boolean | null = null;
      const startRoot = () => {
        const isAdmin = adminId === me.personId;
        if (rootIsAdmin === isAdmin) return;
        rootIsAdmin = isAdmin;
        error = null;
        stop('groups');
        stop('people');
        const groupsQuery = isAdmin
          ? query(collection(db, 'groups'))
          : query(collection(db, 'groups'), where('memberIds', 'array-contains', me.personId));
        watchQuery('groups', groupsQuery, true, (d) => {
          groups = d;
          syncGroups();
        });
        if (isAdmin) watchQuery('people', query(collection(db, 'people')), true, (d) => (people = d));
        else watchDoc('people', doc(db, 'people', me.personId), (d) => (people = d ? { [String(d.id)]: d } : {}));
      };

      watchDoc('admin', doc(db, 'config', 'admin'), (d) => {
        adminId = d ? String(d.personId) : null;
        adminKnown = true;
        startRoot();
      });

      window.addEventListener('online', schedule);
      window.addEventListener('offline', schedule);
      return () => {
        for (const key of [...subs.keys()]) stop(key);
        window.removeEventListener('online', schedule);
        window.removeEventListener('offline', schedule);
      };
    },
    put(col, d) {
      setDoc(refFor(col, d), d).catch(writeFailed);
    },
    putMany(col, docs) {
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        for (const d of docs.slice(i, i + 400)) batch.set(refFor(col, d), d);
        batch.commit().catch(writeFailed);
      }
    },
    setJoinCode(code, data) {
      const ref = doc(db, 'joinCodes', code);
      (data ? setDoc(ref, data) : deleteDoc(ref)).catch(writeFailed);
    },
    saveReceipt(groupId, expenseId, dataUrl) {
      const ref = doc(db, 'groups', groupId, 'receipts', expenseId);
      (dataUrl ? setDoc(ref, { data: dataUrl, at: Date.now() }) : deleteDoc(ref)).catch(writeFailed);
    },
    async getReceipt(groupId, expenseId) {
      try {
        const snap = await getDoc(doc(db, 'groups', groupId, 'receipts', expenseId));
        return snap.exists() ? String(snap.data().data) : null;
      } catch {
        return null;
      }
    },
  };

  const authListeners = new Set<(u: AuthUser | null) => void>();
  let currentUser: AuthUser | null = null;
  let holding = false;
  let ready = false;
  onAuthStateChanged(auth, (u) => {
    ready = true;
    currentUser = u ? parseLogin(u.email) : null;
    if (!holding) authListeners.forEach((cb) => cb(currentUser));
  });
  const withHeldAuth = async (fn: () => Promise<void>) => {
    holding = true;
    try {
      await fn();
    } finally {
      holding = false;
      authListeners.forEach((cb) => cb(currentUser));
    }
  };

  const getPerson = async (id: string) => {
    try {
      const snap = await getDoc(doc(db, 'people', id));
      return toPublic(id, snap.data());
    } catch (err) {
      throw friendly(err);
    }
  };

  return {
    backend,
    watchAuth(cb) {
      authListeners.add(cb);
      if (ready && !holding) cb(currentUser);
      return () => {
        authListeners.delete(cb);
      };
    },
    async getAdmin() {
      try {
        const snap = await getDoc(doc(db, 'config', 'admin'));
        return snap.exists() ? { personId: String(snap.data().personId), name: String(snap.data().name ?? 'Admin') } : null;
      } catch (err) {
        throw friendly(err);
      }
    },
    setupAdmin(name, password) {
      return withHeldAuth(async () => {
        const personId = newId();
        const t = Date.now();
        try {
          await createUserWithEmailAndPassword(auth, loginEmail(personId, 0), password);
          const me: Person = { id: personId, name, loginVersion: 0, joined: true, createdAt: t, updatedAt: t };
          const batch = writeBatch(db);
          batch.set(doc(db, 'config', 'admin'), { personId, name });
          batch.set(doc(db, 'people', personId), me);
          await batch.commit();
        } catch (err) {
          await auth.currentUser?.delete().catch(() => undefined);
          await signOut(auth).catch(() => undefined);
          throw friendly(err);
        }
      });
    },
    async lookupCode(code) {
      try {
        const snap = await getDoc(doc(db, 'joinCodes', code));
        if (!snap.exists()) return null;
        const data = snap.data() as { groupName: string; memberIds: string[] };
        const people = (await Promise.all((data.memberIds ?? []).map(getPerson))).filter((p): p is PublicPerson => !!p);
        return { groupName: data.groupName, people };
      } catch (err) {
        throw friendly(err);
      }
    },
    getPerson,
    join(p, password) {
      return withHeldAuth(async () => {
        try {
          await createUserWithEmailAndPassword(auth, loginEmail(p.id, p.loginVersion), password);
          await updateDoc(doc(db, 'people', p.id), { joined: true, updatedAt: Date.now() });
        } catch (err) {
          throw friendly(err);
        }
      });
    },
    async login(p, password) {
      try {
        await signInWithEmailAndPassword(auth, loginEmail(p.id, p.loginVersion), password);
      } catch (err) {
        throw friendly(err);
      }
    },
    signOut: () => signOut(auth),
  };
}

