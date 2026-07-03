import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { IconChevronLeft } from '../ui/icons';

interface AppShellProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  back?: { to: string; label: string };
  children: ReactNode;
}

export function AppShell({ title, subtitle, actions, back, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-hairline px-6">
          <div className="min-w-0">
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
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-[1200px] animate-rise">{children}</div>
        </main>

        <footer className="shrink-0 px-6 py-3 text-caption text-faint">
          raising records personal data on individuals who do not hold platform accounts. Handle with care.
        </footer>
      </div>
    </div>
  );
}
