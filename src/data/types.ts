export type ID = string;

interface Base {
  id: ID;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface Person extends Base {
  name: string;
  loginVersion: number;
  joined: boolean;
}

export type GroupType = 'home' | 'trip' | 'couple' | 'other';

export interface Group extends Base {
  name: string;
  type: GroupType;
  memberIds: ID[];
  names: Record<ID, string>;
  code: string;
  simplifyDebts: boolean;
  defaultCurrency?: string;
  defaultSplit?: Record<ID, number>;
  createdBy: ID;
}

export type SplitMethod = 'equal' | 'exact' | 'percent' | 'shares' | 'adjust' | 'itemized';
export type Repeat = 'never' | 'weekly' | 'fortnightly' | 'monthly' | 'yearly';

export interface Item {
  id: string;
  name: string;
  amount: number;
  personIds: ID[];
}

export interface Expense extends Base {
  groupId: ID;
  description: string;
  amount: number;
  currency: string;
  date: string;
  category: string;
  paidBy: Record<ID, number>;
  owed: Record<ID, number>;
  splitMethod: SplitMethod;
  splitInput?: Record<ID, number>;
  items?: Item[];
  tax?: number;
  tip?: number;
  notes?: string;
  isPayment?: boolean;
  repeat?: Repeat;
  recurringOf?: ID;
  hasReceipt?: boolean;
  createdBy: ID;
  updatedBy?: ID;
}

export interface Comment extends Base {
  groupId: ID;
  expenseId: ID;
  personId: ID;
  text: string;
}

export type ActivityKind =
  | 'expense_added'
  | 'expense_updated'
  | 'expense_deleted'
  | 'expense_restored'
  | 'payment_added'
  | 'group_created'
  | 'group_updated'
  | 'comment_added';

export interface Activity {
  id: ID;
  groupId: ID;
  at: number;
  by: ID;
  kind: ActivityKind;
  label: string;
  expenseId?: ID;
  text?: string;
}

export interface DocOf {
  people: Person;
  groups: Group;
  expenses: Expense;
  comments: Comment;
  activity: Activity;
}
export type ColName = keyof DocOf;

export type DataSnapshot = { [C in ColName]: Record<ID, DocOf[C]> } & {
  adminId: ID | null;
  loaded: boolean;
  synced: boolean;
};

export interface SyncState {
  online: boolean;
  pendingCount: number;
  error: string | null;
}

export interface AuthUser {
  personId: ID;
  loginVersion: number;
}

export interface Backend {
  start(me: AuthUser, onData: (d: DataSnapshot) => void, onSync: (s: SyncState) => void): () => void;
  put<C extends ColName>(col: C, doc: DocOf[C]): void;
  putMany<C extends ColName>(col: C, docs: DocOf[C][]): void;
  setJoinCode(code: string, data: { groupId: ID; groupName: string; memberIds: ID[] } | null): void;
  saveReceipt(groupId: ID, expenseId: ID, dataUrl: string | null): void;
  getReceipt(groupId: ID, expenseId: ID): Promise<string | null>;
}

export interface Backup {
  app: 'eqsplit';
  version: 2;
  exportedAt: string;
  people: Person[];
  groups: Group[];
  expenses: Expense[];
  comments: Comment[];
  activity: Activity[];
  receipts: Record<ID, string>;
}
