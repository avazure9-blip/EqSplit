import { useEffect, useMemo, useState } from 'react';
import { createFirebase, type FirebaseApi } from './data/firebaseBackend';
import { StoreProvider, useStore } from './data/store';
import type { AuthUser } from './data/types';
import { isConfigured } from './firebaseConfig';
import { useRoute } from './lib/router';
import { AccountScreen, PeopleScreen, PersonScreen } from './screens/Account';
import { ActivityScreen } from './screens/Activity';
import { ChartsScreen } from './screens/Charts';
import { ExpenseDetail } from './screens/Expense';
import { ExpenseEditor } from './screens/ExpenseEditor';
import { FriendDetail, FriendsScreen } from './screens/Friends';
import { GroupBalances, GroupDetail, GroupSettings, GroupTotals } from './screens/Group';
import { GroupsScreen } from './screens/Groups';
import { SearchScreen } from './screens/Search';
import { SettleUp } from './screens/SettleUp';
import { SignIn } from './screens/SignIn';
import { TotalsScreen } from './screens/Totals';
import { SettingsProvider } from './settings';
import { Splash, Toaster } from './ui/components';

export default function App() {
  return (
    <SettingsProvider>
      <Toaster />
      {isConfigured ? <CloudApp /> : <NotConfigured />}
    </SettingsProvider>
  );
}

function NotConfigured() {
  return (
    <div className="signin">
      <div className="signin-brand">
        <div className="logo-mark" />
        <h1>EqSplit</h1>
      </div>
      <div className="signin-card">
        <h2>Almost there</h2>
        <p className="muted">Firebase isn’t connected yet. Add your Firebase web config to src/firebaseConfig.ts (see README).</p>
      </div>
    </div>
  );
}

function CloudApp() {
  const fb = useMemo<FirebaseApi>(() => createFirebase(), []);
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  useEffect(() => fb.watchAuth(setUser), [fb]);
  const me = useMemo(
    () => (user ? { personId: user.personId, loginVersion: user.loginVersion } : null),
    [user?.personId, user?.loginVersion],
  );

  if (user === undefined) return <Splash />;
  if (!me) return <SignIn fb={fb} />;
  return (
    <StoreProvider key={`${me.personId}-${me.loginVersion}`} backend={fb.backend} me={me} signOut={() => void fb.signOut()}>
      <Gate />
    </StoreProvider>
  );
}

function Gate() {
  const s = useStore();
  if (s.sync.error === 'no-access') {
    return (
      <div className="signin">
        <div className="signin-card">
          <h2>Please log in again</h2>
          <p className="muted">Your login was reset or removed by the admin, or you’re not allowed to see this data.</p>
          <button className="btn block" onClick={() => s.signOut()}>
            Log in again
          </button>
          <button className="link block center" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!s.data.loaded) return <Splash text={s.sync.online ? 'Loading your groups…' : 'Offline – loading saved data…'} />;
  return <Routes />;
}

function Routes() {
  const route = useRoute();
  const [a, b, c] = route.parts;
  const q = (k: string) => route.query.get(k);
  let screen;
  switch (a) {
    case 'friends':
      screen = <FriendsScreen />;
      break;
    case 'friend':
      screen = <FriendDetail id={b} />;
      break;
    case 'activity':
      screen = <ActivityScreen />;
      break;
    case 'account':
      screen = <AccountScreen />;
      break;
    case 'people':
      screen = <PeopleScreen />;
      break;
    case 'person':
      screen = <PersonScreen id={b} />;
      break;
    case 'totals':
      screen = <TotalsScreen />;
      break;
    case 'group':
      if (b === 'new') screen = <GroupSettings />;
      else if (c === 'settings') screen = <GroupSettings id={b} />;
      else if (c === 'balances') screen = <GroupBalances id={b} />;
      else if (c === 'totals') screen = <GroupTotals id={b} />;
      else screen = <GroupDetail id={b} />;
      break;
    case 'expense':
      screen = <ExpenseDetail id={b} />;
      break;
    case 'add':
      screen = <ExpenseEditor groupId={q('group')} friendId={q('friend')} copyId={q('copy')} />;
      break;
    case 'edit':
      screen = <ExpenseEditor id={b} />;
      break;
    case 'settle':
      screen = (
        <SettleUp
          groupId={q('group')}
          friendId={q('friend')}
          editId={q('edit')}
          from={q('from')}
          to={q('to')}
          amount={q('amount')}
          currency={q('currency')}
        />
      );
      break;
    case 'charts':
      screen = <ChartsScreen groupId={q('group')} friendId={q('friend')} />;
      break;
    case 'search':
      screen = <SearchScreen groupId={q('group')} />;
      break;
    default:
      screen = <GroupsScreen />;
  }
  return <div key={route.raw}>{screen}</div>;
}
