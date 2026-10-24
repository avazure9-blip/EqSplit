import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { category } from '../lib/categories';
import { Empty, Page } from '../ui/components';
import { ExpenseList } from '../ui/ExpenseList';

export function SearchScreen({ groupId }: { groupId?: string | null }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const group = groupId ? s.data.groups[groupId] : undefined;
  const pool = group ? (s.groupInfo[group.id]?.expenses ?? []) : s.expenses;

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return pool.filter((e) => {
      const people = [...Object.keys(e.paidBy), ...Object.keys(e.owed)].map((p) => s.fullName(p));
      const hay = [
        e.isPayment ? 'payment' : e.description,
        e.notes ?? '',
        category(e.category).name,
        s.data.groups[e.groupId]?.name ?? '',
        ...people,
        ...(e.items ?? []).map((it) => it.name),
        String(e.amount / 100),
        e.date,
      ]
        .join(' ')
        .toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [q, pool, s]);

  return (
    <Page title={group ? `Search ${group.name}` : 'Search'} back={group ? `group/${group.id}` : 'groups'}>
      <div className="search-box">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Description, person, category, amount…" autoFocus />
      </div>
      {q.trim() && !results.length && <Empty icon="🔍" title="No matching expenses" />}
      {results.length > 0 && <ExpenseList expenses={results} showGroup={!group} />}
    </Page>
  );
}
