import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { RecentActivityPanel } from '../../components/dashboard/RecentActivityPanel';
import { useAuth } from '../../hooks/useAuth';
import { IconUsers, IconPeople, IconPhone } from '../../components/ui/icons';

export default function PastorDashboard() {
  const { user } = useAuth();
  const firstName = user?.fullName.split(' ')[0] ?? 'Pastor';

  return (
    <AppShell title="Dashboard" subtitle="Full oversight across every reporting stream.">
      <p className="mb-6 text-heading font-semibold text-ink-2">Good to see you, {firstName}.</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Live */}
        <Link
          to="/pastor/users"
          className="group rounded-card border border-hairline bg-surface p-5 shadow-card transition hover:border-accent/40 hover:shadow-elevated"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-input bg-wash text-accent">
            <IconUsers className="h-[18px] w-[18px]" />
          </span>
          <h2 className="mt-4 text-body font-medium text-ink-2">User Management</h2>
          <p className="mt-1 text-caption leading-relaxed text-muted">
            Create and manage leader and follow-up team accounts.
          </p>
          <span className="mt-3 inline-block text-caption font-medium text-accent group-hover:underline">
            Manage users →
          </span>
        </Link>

        {/* Upcoming */}
        <RoadmapCard icon={IconPeople} title="Members & Reports" phase={3}>
          Full visibility across every member and their report history.
        </RoadmapCard>
        <RoadmapCard icon={IconPhone} title="First-Timers" phase={4}>
          Track follow-up calls and conversions to the congregation.
        </RoadmapCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <RecentActivityPanel viewAllTo="/pastor/logs" />
      </div>
    </AppShell>
  );
}

function RoadmapCard({
  icon: Icon,
  title,
  phase,
  children,
}: {
  icon: typeof IconPeople;
  title: string;
  phase: number;
  children: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-hairline bg-surface/50 p-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-input bg-surface-2 text-faint">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="mt-4 flex items-center gap-2">
        <h2 className="text-body font-medium text-muted">{title}</h2>
        <span className="rounded-badge bg-slateink/10 px-1.5 py-px text-[10px] font-medium text-faint">
          Phase {phase}
        </span>
      </div>
      <p className="mt-1 text-caption leading-relaxed text-faint">{children}</p>
    </div>
  );
}
