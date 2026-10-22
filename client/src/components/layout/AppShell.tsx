import { ReactNode, useEffect, useRef, useState } from 'react';
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
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  function closeNavigation() {
    setNavOpen(false);
    requestAnimationFrame(() => menuButtonRef.current?.focus());
  }

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const handleChange = () => {
      setIsMobile(media.matches);
      if (!media.matches) setNavOpen(false);
    };
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNavigation();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navOpen]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    if (isMobile && navOpen) content.setAttribute('inert', '');
    else content.removeAttribute('inert');
    return () => content.removeAttribute('inert');
  }, [isMobile, navOpen]);

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <a href="#main-content" className="skip-link rounded-btn bg-surface px-4 py-3 text-body font-medium text-ink-2 shadow-focus">
        Skip to main content
      </a>
      <Sidebar open={navOpen} isMobile={isMobile} onClose={closeNavigation} onNavigate={closeNavigation} />
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={closeNavigation}
          aria-hidden
        />
      )}
      <div ref={contentRef} className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        {/* Below sm the action group wraps to its own row so the title keeps its width. */}
        <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-4 py-2 sm:min-h-16 sm:flex-nowrap sm:px-6">
          <button
            ref={menuButtonRef}
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            aria-expanded={navOpen}
            aria-controls="primary-navigation"
            className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-muted transition hover:bg-wash hover:text-ink-2 focus:outline-none focus-visible:shadow-focus md:hidden"
          >
            <IconMenu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {back && (
              <Link
                to={back.to}
                aria-label={`Back to ${back.label}`}
                title={`Back to ${back.label}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border border-hairline text-muted transition hover:bg-wash hover:text-ink-2 focus:outline-none focus-visible:shadow-focus"
              >
                <IconChevronLeft className="h-4 w-4" />
              </Link>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-heading-sm font-semibold text-ink-2">{title}</h1>
              {subtitle && <p className="truncate text-caption text-faint">{subtitle}</p>}
            </div>
          </div>
          <div className="flex shrink-0 basis-full items-center justify-end gap-2 sm:basis-auto">
            {actions}
            <NotificationBell />
          </div>
        </header>

        {/* Content */}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto px-4 py-6 outline-none sm:px-6">
          <div className="mx-auto max-w-[1200px] animate-rise">{children}</div>
        </main>

        <footer className="shrink-0 px-4 py-3 sm:px-6 text-caption text-faint">
          raising records personal data on individuals who do not hold platform accounts. Handle with care.
        </footer>
      </div>
    </div>
  );
}
