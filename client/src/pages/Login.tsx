import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { homePathForRole } from '../lib/roles';
import { Button, Field, Input, Modal, PasswordInput } from '../components/ui';
import { ThemeToggle } from '../components/ThemeToggle';
import { BrandLogo } from '../components/BrandLogo';

// Matches server/prisma/seed.ts + seed-demo.ts. Only shown when demo mode is on.
const DEMO_PASSWORD = 'changeme123';
const DEMO_ACCOUNTS = [
  { email: 'pastor@raising.local', label: 'Pastor' },
  { email: 'kwame@raising.local', label: 'Leader — Grace House' },
  { email: 'abena@raising.local', label: 'Leader — Hope Cell' },
  { email: 'daniel@raising.local', label: 'Leader — Zion Circle' },
  { email: 'esther@raising.local', label: 'Leader — Well of Life' },
  { email: 'naa@raising.local', label: 'Follow-up lead' },
  { email: 'kofi@raising.local', label: 'Follow-up member' },
];
const DEMO_MODE = import.meta.env.DEV || import.meta.env.VITE_DEMO === '1';

export default function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  async function signIn(withEmail: string, withPassword: string) {
    setError('');
    setSubmitting(true);
    try {
      const authed = await login(withEmail, withPassword);
      navigate(homePathForRole(authed.role), { replace: true });
    } catch {
      // Generic error — do not reveal which field was wrong.
      setError('Invalid email or password.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void signIn(email, password);
  }

  function useDemoAccount(demoEmail: string) {
    setDemoOpen(false);
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    void signIn(demoEmail, DEMO_PASSWORD);
  }

  if (!loading && user) return <Navigate to={homePathForRole(user.role)} replace />;

  return (
    <div className="hero-wash relative flex min-h-screen flex-col items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-[380px] animate-rise">
        {/* Brand + headline */}
        <div className="mb-8 text-center">
          <BrandLogo className="mx-auto w-44" />
          <p className="mt-2 text-body text-muted">Sign in to your pastoral care workspace.</p>
        </div>

        <div className="rounded-cardlg border border-hairline bg-surface p-7 shadow-feature">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Field label="Email">
              <Input
                type="email"
                autoComplete="username"
                placeholder="you@church.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Password">
              <PasswordInput
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            {error && <p className="text-body text-concern">{error}</p>}
            <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>

        {DEMO_MODE && (
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => setDemoOpen(true)}
              className="text-caption text-accent underline-offset-4 hover:underline"
            >
              Use a demo account
            </button>
          </div>
        )}

        <p className="mt-6 text-center text-caption text-faint">
          Accounts are created by your pastor — there is no self sign-up.
        </p>
      </div>

      <Modal
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        title="Demo accounts"
        description={`Seeded by \`npm run seed:demo\`. All use the password ${DEMO_PASSWORD}.`}
      >
        <ul className="space-y-2">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.email}>
              <button
                type="button"
                onClick={() => useDemoAccount(a.email)}
                disabled={submitting}
                className="w-full rounded-card border border-hairline px-4 py-3 text-left transition hover:border-accent disabled:opacity-50"
              >
                <span className="block text-body text-ink-2">{a.label}</span>
                <span className="block font-mono text-caption text-muted">{a.email}</span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
