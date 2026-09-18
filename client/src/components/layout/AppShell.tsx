import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { NotificationBell } from './NotificationBell';
import { IconChevronLeft, IconMenu } from '../ui/icons';

interface AppShellProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  back?: { to: string; label: string };
  children: ReactNode;
}

export function AppShell({ title, subtitle, actions, back, children }: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        {/* Below sm the action group wraps to its own row so the title keeps its width. */}
        <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-4 py-2 sm:h-14 sm:flex-nowrap sm:py-0 sm:px-6">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-muted transition hover:bg-wash hover:text-ink-2 focus:outline-none focus-visible:shadow-focus md:hidden"
          >
            <IconMenu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            {back && (
              <Link
                to={back.to}
                className="mb-0.5 inline-flex items-center gap-1 text-caption text-muted transition hover:text-accent"
              >
                <IconChevronLeft className="h-3 w-3" />
                {back.label}
              </Link>
            )}
            <h1 className="truncate text-heading-sm font-semibold text-ink-2">{title}</h1>
            {subtitle && <p className="truncate text-caption text-faint">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 basis-full items-center justify-end gap-2 sm:basis-auto">
            {actions}
            <NotificationBell />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-[1200px] animate-rise">{children}</div>
        </main>

        <footer className="shrink-0 px-4 py-3 sm:px-6 text-caption text-faint">
          raising records personal data on individuals who do not hold platform accounts. Handle with care.
        </footer>
      </div>
    </div>
  );
}
