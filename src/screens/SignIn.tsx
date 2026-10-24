import { useEffect, useState, type FormEvent } from 'react';
import type { FirebaseApi, PublicPerson } from '../data/firebaseBackend';
import { formatCode, normalizeCode } from '../lib/id';
import { initials, colorFor } from '../ui/components';

const LAST_KEY = 'eqsplit:lastUser';

interface LastUser {
  id: string;
  name: string;
}

function lastUser(): LastUser | null {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null');
  } catch {
    return null;
  }
}

type Step =
  | { kind: 'loading' }
  | { kind: 'start' }
  | { kind: 'setup' }
  | { kind: 'pick'; groupName: string; people: PublicPerson[] }
  | { kind: 'password'; person: PublicPerson; back: Step };

export function SignIn({ fb }: { fb: FirebaseApi }) {
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [code, setCode] = useState(() => normalizeCode(location.hash.match(/#\/join\/([^/?]+)/)?.[1] ?? ''));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const last = lastUser();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const lookup = (c: string) =>
    run(async () => {
      const found = await fb.lookupCode(c);
      if (!found) throw new Error('No group with that code. Check it with the admin.');
      setStep({ kind: 'pick', groupName: found.groupName, people: found.people });
    });

  useEffect(() => {
    run(async () => {
      const admin = await fb.getAdmin().catch(() => undefined);
      if (admin === null) setStep({ kind: 'setup' });
      else {
        setStep({ kind: 'start' });
        if (code.length === 8) await lookup(code);
      }
    });
  }, []);

  const openPerson = (id: string, back: Step) =>
    run(async () => {
      const person = await fb.getPerson(id);
      if (!person) throw new Error('That profile no longer exists');
      setStep({ kind: 'password', person, back });
    });

  const adminSignIn = () =>
    run(async () => {
      const admin = await fb.getAdmin();
      if (!admin) return setStep({ kind: 'setup' });
      const person = await fb.getPerson(admin.personId);
      if (!person) throw new Error('Admin profile not found');
      setStep({ kind: 'password', person, back: { kind: 'start' } });
    });

  const remember = (p: { id: string; name: string }) => localStorage.setItem(LAST_KEY, JSON.stringify({ id: p.id, name: p.name }));

  return (
    <div className="signin">
      <div className="signin-brand">
        <div className="logo-mark" />
        <h1>EqSplit</h1>
        <p>Split expenses with your group. Works offline.</p>
      </div>
      <div className="signin-card">
        {step.kind === 'loading' && <p className="muted center">{busy ? 'Connecting…' : ''}</p>}

        {step.kind === 'start' && (
          <>
            {last && (
              <button className="btn block" disabled={busy} onClick={() => openPerson(last.id, { kind: 'start' })}>
                Continue as {last.name}
              </button>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (code.length !== 8) return setError('The group code has 8 characters');
                void lookup(code);
              }}
            >
              <label>
                {last ? 'Or join another group' : 'Enter your group code'}
                <input
                  className="code-input"
                  value={code.length > 4 ? formatCode(code) : code}
                  onChange={(e) => setCode(normalizeCode(e.target.value).slice(0, 8))}
                  placeholder="ABCD-2345"
                  autoCapitalize="characters"
                  autoComplete="off"
                />
              </label>
              <button className={`btn block ${last ? 'outline' : ''}`} disabled={busy}>
                Continue
              </button>
            </form>
            <button className="link center block" onClick={adminSignIn} disabled={busy}>
              Admin sign in
            </button>
          </>
        )}

        {step.kind === 'pick' && (
          <>
            <h2>{step.groupName}</h2>
            <p className="muted">Who are you?</p>
            <div className="list boxed">
              {step.people.map((p) => (
                <button key={p.id} className="row choice" onClick={() => setStep({ kind: 'password', person: p, back: step })}>
                  <span className="avatar" style={{ width: 36, height: 36, fontSize: 14, background: colorFor(p.id) }}>
                    {initials(p.name)}
                  </span>
                  <span className="main">{p.name}</span>
                  <small className={p.joined ? 'pos' : 'muted'}>{p.joined ? 'joined' : 'new'}</small>
                </button>
              ))}
            </div>
            <p className="tiny muted">Your name isn’t listed? Ask the admin to add you to this group.</p>
            <button className="link" onClick={() => setStep({ kind: 'start' })}>
              ← Back
            </button>
          </>
        )}

        {step.kind === 'password' && (
          <PasswordForm
            person={step.person}
            busy={busy}
            onBack={() => {
              setError(null);
              setStep(step.back);
            }}
            onSubmit={(password) =>
              run(async () => {
                if (step.person.joined) await fb.login(step.person, password);
                else await fb.join(step.person, password);
                remember(step.person);
              })
            }
          />
        )}

        {step.kind === 'setup' && (
          <SetupForm
            busy={busy}
            onSubmit={(name, password) =>
              run(async () => {
                await fb.setupAdmin(name, password);
              })
            }
          />
        )}

        {error && <p className="warn">{error}</p>}
      </div>
    </div>
  );
}

function PasswordForm(props: { person: PublicPerson; busy: boolean; onBack: () => void; onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const joining = !props.person.joined;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return setError('Use at least 6 characters');
    if (joining && password !== confirm) return setError('The passwords don’t match');
    setError(null);
    props.onSubmit(password);
  };
  return (
    <form onSubmit={submit}>
      <h2>{joining ? `Hi ${props.person.name}!` : `Welcome back, ${props.person.name}`}</h2>
      <p className="muted">{joining ? 'Set a password. You’ll use your name and this password to log in.' : 'Enter your password.'}</p>
      <input type="text" autoComplete="username" value={props.person.name} readOnly hidden />
      <label>
        Password
        <input
          type="password"
          autoComplete={joining ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
      </label>
      {joining && (
        <label>
          Repeat password
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
      )}
      {error && <p className="warn">{error}</p>}
      <button className="btn block" disabled={props.busy}>
        {props.busy ? 'Please wait…' : joining ? 'Join' : 'Log in'}
      </button>
      {!joining && <p className="tiny muted">Forgot your password? Ask the admin to reset your login.</p>}
      <button type="button" className="link" onClick={props.onBack}>
        ← Back
      </button>
    </form>
  );
}

function SetupForm(props: { busy: boolean; onSubmit: (name: string, password: string) => void }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name');
    if (password.length < 6) return setError('Use at least 6 characters');
    if (password !== confirm) return setError('The passwords don’t match');
    setError(null);
    props.onSubmit(name.trim(), password);
  };
  return (
    <form onSubmit={submit}>
      <h2>Set up EqSplit</h2>
      <p className="muted">You’ll be the admin: you create groups and add people. Do this right after publishing the app.</p>
      <label>
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" autoFocus />
      </label>
      <label>
        Password
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label>
        Repeat password
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      {error && <p className="warn">{error}</p>}
      <button className="btn block" disabled={props.busy}>
        {props.busy ? 'Setting up…' : 'Create admin account'}
      </button>
    </form>
  );
}
