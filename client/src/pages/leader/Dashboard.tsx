import { AppShell } from '../../components/layout/AppShell';
import { useAuth } from '../../hooks/useAuth';
import { IconPeople } from '../../components/ui/icons';

export default function LeaderDashboard() {
  const { user } = useAuth();
  const firstName = user?.fullName.split(' ')[0] ?? 'there';

  return (
    <AppShell title="Dashboard" subtitle="Your assigned members, at a glance.">
      <p className="mb-8 text-heading font-semibold text-ink-2">Welcome, {firstName}.</p>

      <div className="flex flex-col items-center justify-center rounded-cardlg border border-dashed border-hairline bg-surface/50 px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-input bg-wash text-accent">
          <IconPeople className="h-6 w-6" />
        </span>
        <h2 className="mt-5 text-heading-sm font-semibold text-ink-2">Your members will live here</h2>
        <p className="mt-1.5 max-w-sm text-body text-muted">
          Adding members, submitting reports, and silence tracking arrive in Phase 2.
        </p>
      </div>
    </AppShell>
  );
}
