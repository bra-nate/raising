import { AppShell } from '../../components/layout/AppShell';
import { useAuth } from '../../hooks/useAuth';
import { roleLabels } from '../../lib/roles';
import { IconPhone } from '../../components/ui/icons';

export default function FollowUpDashboard() {
  const { user } = useAuth();
  const firstName = user?.fullName.split(' ')[0] ?? 'there';
  const subtitle =
    user?.role === 'followup_team_lead'
      ? 'Oversee the follow-up team and every first-timer.'
      : 'The first-timers assigned to you.';

  return (
    <AppShell title="Dashboard" subtitle={subtitle}>
      <div className="mb-8 flex items-center gap-2">
        <p className="text-heading font-semibold text-ink-2">Welcome, {firstName}.</p>
        {user && <span className="text-caption text-faint">· {roleLabels[user.role]}</span>}
      </div>

      <div className="flex flex-col items-center justify-center rounded-cardlg border border-dashed border-hairline bg-surface/50 px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-input bg-wash text-accent">
          <IconPhone className="h-6 w-6" />
        </span>
        <h2 className="mt-5 text-heading-sm font-semibold text-ink-2">First-timer records will live here</h2>
        <p className="mt-1.5 max-w-sm text-body text-muted">
          Logging calls and converting first-timers into the congregation arrives in Phase 4.
        </p>
      </div>
    </AppShell>
  );
}
