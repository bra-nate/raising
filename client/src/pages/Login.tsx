import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { homePathForRole } from '../lib/roles';
import { Button, Field, Input } from '../components/ui';
import { ThemeToggle } from '../components/ThemeToggle';

export default function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const authed = await login(email, password);
      navigate(homePathForRole(authed.role), { replace: true });
    } catch {
      // Generic error — do not reveal which field was wrong.
      setError('Invalid email or password.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!loading && user) return <Navigate to={homePathForRole(user.role)} replace />;

  return (
    <div className="hero-wash relative flex min-h-screen flex-col items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-[380px] animate-rise">
        {/* Brand + headline — the tight display tracking is the signature. */}
        <div className="mb-8 text-center">
          <span className="mx-auto mb-5 flex h-10 w-10 items-center justify-center rounded-input bg-signal text-heading-sm font-semibold text-white shadow-glow">
            r
          </span>
          <h1 className="text-heading-lg font-semibold lowercase tracking-tight text-ink">raising</h1>
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
              <Input
                type="password"
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

        <p className="mt-6 text-center text-caption text-faint">
          Accounts are created by your pastor — there is no self sign-up.
        </p>
      </div>
    </div>
  );
}
