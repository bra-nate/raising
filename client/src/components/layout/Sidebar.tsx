import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { navForRole } from '../../lib/nav';
import { roleLabels } from '../../lib/roles';
import { ThemeToggle } from '../ThemeToggle';
import { IconLogout } from '../ui/icons';

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Sidebar() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const groups = navForRole(user.role);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-hairline bg-canvas">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2 px-5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-signal text-[13px] font-semibold text-white">
          r
        </span>
        <span className="text-heading-sm font-semibold lowercase tracking-tight text-ink-2">raising</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {groups.map((group, gi) => (
          <div key={gi} className="mb-4">
            {group.heading && (
              <p className="px-3 pb-1.5 pt-2 text-caption font-medium uppercase tracking-wide text-faint">
                {group.heading}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                if (!item.to) {
                  return (
                    <li key={item.label}>
                      <div
                        className="flex cursor-default items-center gap-2.5 rounded-pill px-3 py-1.5 text-body text-faint"
                        title={item.phase ? `Arrives in Phase ${item.phase}` : undefined}
                      >
                        <Icon className="h-4 w-4 opacity-70" />
                        <span className="flex-1">{item.label}</span>
                        {item.phase && (
                          <span className="rounded-badge bg-slateink/10 px-1.5 py-px text-[10px] font-medium text-faint">
                            soon
                          </span>
                        )}
                      </div>
                    </li>
                  );
                }
                return (
                  <li key={item.label}>
                    <NavLink
                      to={item.to}
                      end
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-pill px-3 py-1.5 text-body transition ${
                          isActive
                            ? 'bg-wash font-medium text-ink-2'
                            : 'text-slateink hover:bg-surface-2 hover:text-ink-2'
                        }`
                      }
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-hairline p-3">
        <div className="flex items-center gap-2.5 rounded-card px-2 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-wash text-caption font-semibold text-accent">
            {initials(user.fullName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium text-ink-2">{user.fullName}</p>
            <p className="truncate text-caption text-faint">{roleLabels[user.role]}</p>
          </div>
          <ThemeToggle />
          <button
            onClick={logout}
            aria-label="Sign out"
            title="Sign out"
            className="flex h-8 w-8 items-center justify-center rounded-pill text-muted transition hover:bg-wash hover:text-concern focus:outline-none focus-visible:shadow-focus"
          >
            <IconLogout className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
