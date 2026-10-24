import { useStore } from '../data/store';
import type { Group } from '../data/types';
import { formatMoney } from '../lib/money';
import { navigate } from '../lib/router';
import { BalanceSide, Empty, GroupTile, IconButton, Link, Overall, Page } from '../ui/components';

export function GroupsScreen() {
  const s = useStore();
  return (
    <Page
      title="Groups"
      tab="groups"
      fab={s.groups.length ? 'add' : undefined}
      right={
        <>
          <IconButton icon="search" label="Search expenses" to="search" />
          <IconButton icon="chart" label="Totals" to="totals" />
          {s.isAdmin && <IconButton icon="plus" label="Create group" to="group/new" />}
        </>
      }
    >
      <Overall balance={s.overall} />
      {s.groups.length === 0 && (
        <Empty
          icon="👥"
          title="No groups yet"
          text={s.isAdmin ? 'Create a group, add people, and share its join code with them.' : 'Ask the admin to add you to a group.'}
        />
      )}
      <div className="list">
        {s.groups.map((g) => (
          <GroupRow key={g.id} g={g} />
        ))}
      </div>
      {s.isAdmin && (
        <div className="center pad">
          <button className="btn outline" onClick={() => navigate('group/new')}>
            Start a new group
          </button>
        </div>
      )}
    </Page>
  );
}

function GroupRow({ g }: { g: Group }) {
  const s = useStore();
  const gi = s.groupInfo[g.id];
  const mine = gi.debts.filter((d) => d.from === s.meId || d.to === s.meId);
  const member = g.memberIds.includes(s.meId);
  return (
    <Link to={`group/${g.id}`} className="row group-row">
      <GroupTile group={g} size={56} />
      <div className="main">
        <div className="title">{g.name}</div>
        {mine.slice(0, 3).map((d, i) => (
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
        {mine.length > 3 && <div className="tiny muted">Plus {mine.length - 3} more balances</div>}
        {!member && <div className="tiny muted">You manage this group but are not a member</div>}
      </div>
      <BalanceSide balance={gi.myNet} empty={gi.expenses.length ? 'settled up' : 'no expenses'} />
    </Link>
  );
}
