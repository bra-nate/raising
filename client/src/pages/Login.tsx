import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { homePathForRole } from '../lib/roles';
import { Button, Input, Modal, PasswordInput } from '../components/ui';
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

// Add images here and the carousel picks them up — bars and rotation are derived.
const SLIDES = [
  {
    src: '/login-bg.jpg',
    verse: 'Be diligent to know the state of your flocks, and attend to your herds.',
    ref: 'Proverbs 27:23 — NKJV',
  },
  {
    src: '/andrea-de-santis-3bMishRJiJY-unsplash.jpg',
    verse: 'Be diligent to know the state of your flocks, and attend to your herds.',
    ref: 'Proverbs 27:23 — NKJV',
  },
  {
    src: '/julia-weihe-ZjoQ8ONeXS8-unsplash.jpg',
    verse: 'Be diligent to know the state of your flocks, and attend to your herds.',
    ref: 'Proverbs 27:23 — NKJV',
  },
  {
    src: '/pablo-merchan-montes-oHzns3Npl90-unsplash.jpg',
    verse: 'Be diligent to know the state of your flocks, and attend to your herds.',
    ref: 'Proverbs 27:23 — NKJV',
  },
  {
    src: '/yumu-QDHb81lUpbY-unsplash.jpg',
    verse: 'Be diligent to know the state of your flocks, and attend to your herds.',
    ref: 'Proverbs 27:23 — NKJV',
  },
];
const SLIDE_MS = 7000;

export default function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (SLIDES.length < 2) return;
    const id = setInterval(() => setSlide((i) => (i + 1) % SLIDES.length), SLIDE_MS);
    return () => clearInterval(id);
  }, []);

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

  function fillDemoAccount(demoEmail: string) {
    setDemoOpen(false);
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    void signIn(demoEmail, DEMO_PASSWORD);
  }

  if (!loading && user) return <Navigate to={homePathForRole(user.role)} replace />;

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Left — brand, scripture and slide rail over the photo */}
      <div className="relative hidden w-1/2 shrink-0 p-3 lg:block">
        <div className="relative h-full overflow-hidden rounded-cardlg bg-slateink">
          {SLIDES.map((s, i) => (
            <img
              key={s.src}
              src={s.src}
              alt=""
              fetchPriority={i === 0 ? 'high' : 'low'}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
                i === slide ? 'opacity-100' : 'opacity-0'
              }`}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" />

          <img src="/raising logo white.png" alt="raising" className="absolute left-10 top-10 w-32" />

          <figure className="absolute inset-x-0 bottom-0 p-10">
            <blockquote className="text-2xl leading-snug text-white sm:text-3xl">
              “{SLIDES[slide].verse}”
            </blockquote>
            <figcaption className="mt-4 text-body text-white/70">{SLIDES[slide].ref}</figcaption>

            {SLIDES.length > 1 && (
              <div className="mt-8 flex gap-2">
                {SLIDES.map((s, i) => (
                  <button
                    key={s.src}
                    type="button"
                    onClick={() => setSlide(i)}
                    aria-label={`Slide ${i + 1}`}
                    aria-current={i === slide}
                    className="h-1 flex-1 overflow-hidden rounded-full bg-white/25"
                  >
                    {i === slide && (
                      <span key={slide} className="block h-full rounded-full bg-white animate-slidefill" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </figure>
        </div>
      </div>

      {/* Right — sign in */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-[400px] animate-rise">
          <div className="mb-8 lg:hidden">
            <BrandLogo className="mx-auto w-36" />
          </div>

          <h1 className="text-center text-3xl font-semibold text-ink-2 sm:text-4xl">Welcome back!</h1>
          <p className="mt-2 text-center text-body text-muted">Sign in to your pastoral care workspace.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-3">
            <Input
              type="email"
              autoComplete="username"
              aria-label="Email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <PasswordInput
              autoComplete="current-password"
              aria-label="Password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-body text-concern">{error}</p>}
            <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

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
                onClick={() => fillDemoAccount(a.email)}
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
