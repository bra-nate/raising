import { Link } from 'react-router-dom';
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

      <Link
        to="/followup/first-timers"
        className="flex items-center justify-between rounded-cardlg border border-hairline bg-surface px-6 py-5 text-left transition hover:border-accent/40 hover:shadow-elevated"
      >
        <span>
          <span className="block text-heading-sm font-semibold text-ink-2">First-Timers</span>
          <span className="mt-1 block text-body text-muted">View your queue, log calls, and track follow-ups.</span>
        </span>
        <IconPhone className="h-6 w-6 text-accent" />
      </Link>
    </AppShell>
  );
}
