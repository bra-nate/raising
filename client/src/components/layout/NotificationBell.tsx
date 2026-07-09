import { useEffect, useRef, useState } from 'react';
import { IconBell } from '../ui/icons';
import { relativeDate } from '../../lib/utils';
import { useNotifications } from '../../hooks/useNotifications';

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-accent"
      >
        <IconBell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-hairline bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-2">
            <span className="text-caption font-semibold text-ink-2">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead()}
                className="text-caption text-accent transition hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-caption text-faint">You&apos;re all caught up.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => !n.isRead && markRead(n.id)}
                  className={`flex w-full flex-col gap-0.5 border-b border-hairline px-4 py-3 text-left transition hover:bg-surface-2 ${
                    n.isRead ? 'opacity-60' : ''
                  }`}
                >
                  <span className="flex items-center gap-2 text-caption font-semibold text-ink-2">
                    {!n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                    {n.title}
                  </span>
                  <span className="text-caption text-muted">{n.message}</span>
                  <span className="text-[11px] text-faint">{relativeDate(n.createdAt)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
