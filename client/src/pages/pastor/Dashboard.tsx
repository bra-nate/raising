import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Card, SkeletonRows } from '../../components/ui';
import { IconLock } from '../../components/ui/icons';
import { RecentActivityPanel } from '../../components/dashboard/RecentActivityPanel';
import { CasesPanel } from '../../components/cases/CasesPanel';
import { getPastorDashboard } from '../../lib/api';
import { formatDateTime, fullName, relativeDate, silenceMeta, statusMeta } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';
import type { PastorDashboard as DashboardData } from '../../types';

export default function PastorDashboard() {
  const { user } = useAuth();
  const firstName = user?.fullName.split(' ')[0] ?? 'Pastor';
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getPastorDashboard()
      .then(setData)
      .catch(() => setError('Could not load the dashboard.'))
      .finally(() => setLoading(false));
  }, []);

  const priority = data
    ? data.stats.concern > 0
      ? {
          count: data.stats.concern,
          label: 'member concern',
          description: 'Review the latest concern reports and decide what needs pastoral follow-through.',
          to: '/pastor/members?status=concern',
          action: 'Review concerns',
          tone: 'concern' as const,
        }
      : data.stats.needsAttention > 0
        ? {
            count: data.stats.needsAttention,
            label: 'member needing attention',
            description: 'Start with people whose latest report shows they may need support.',
            to: '/pastor/members?status=needs_attention',
            action: 'Review members',
            tone: 'attention' as const,
          }
        : {
            count: 0,
            label: 'urgent care items',
            description: 'Nothing is currently marked as a concern or needing attention.',
            to: '/pastor/members',
            action: 'View all members',
            tone: 'good' as const,
          }
    : null;

  return (
    <AppShell title="Dashboard" subtitle="Full oversight across every reporting stream.">
      {error ? (
        <p className="text-body text-concern">{error}</p>
      ) : (
        <>
          <section className="overflow-hidden rounded-cardlg bg-ink px-6 py-7 text-canvas shadow-feature sm:px-8 sm:py-9">
            <p className="text-caption font-medium uppercase tracking-[0.16em] text-canvas/65">Good to see you, {firstName}</p>
            {loading || !priority ? (
              <div className="mt-5 h-24 animate-pulse rounded-card bg-canvas/10" />
            ) : (
              <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-2xl">
                  <p className={`text-display font-semibold ${priority.tone === 'concern' ? 'text-concern' : priority.tone === 'attention' ? 'text-attention' : 'text-good'}`}>
                    {priority.count}
                  </p>
                  <h2 className="mt-1 text-heading font-semibold text-canvas">
                    {priority.label}{priority.count === 1 ? '' : 's'}
                  </h2>
                  <p className="mt-2 max-w-xl text-body text-canvas/70">{priority.description}</p>
                </div>
                <Link
                  to={priority.to}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-btn bg-canvas px-5 py-2.5 text-body font-semibold text-ink transition hover:bg-canvas/90 focus:outline-none focus-visible:shadow-focus"
                >
                  {priority.action}
                </Link>
              </div>
            )}
          </section>

          <dl className="mt-6 grid grid-cols-2 divide-x divide-y divide-hairline border-y border-hairline sm:grid-cols-4 sm:divide-y-0">
            <Metric label="Active members" value={data?.stats.totalActiveMembers} loading={loading} />
            <Metric label="Reports this week" value={data?.stats.reportsThisWeek} loading={loading} />
            <Metric label="First-timers this week" value={data?.stats.firstTimersThisWeek} loading={loading} />
            <Metric label="Pending follow-up" value={data?.stats.pendingFirstTimers} loading={loading} />
          </dl>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Silence panel */}
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-body font-semibold text-ink-2">Silence alerts</h2>
                <Link to="/pastor/members?silence=overdue" className="text-caption font-medium text-accent hover:underline">
                  View all
                </Link>
              </div>
              {loading ? (
                <SkeletonRows rows={4} className="p-0" />
              ) : !data || data.silence.length === 0 ? (
                <p className="text-body text-faint">Everyone has a recent report. 🎉</p>
              ) : (
                <ul className="space-y-2">
                  {data.silence.slice(0, 8).map((m) => {
                    const meta = silenceMeta[m.silence];
                    return (
                      <li key={m.id}>
                        <Link
                          to={`/pastor/members/${m.id}`}
                          className="flex items-center justify-between gap-3 rounded-input px-2 py-1.5 transition hover:bg-surface-2"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                            <span className="truncate text-body text-ink-2">{fullName(m)}</span>
                            <span className="shrink-0 text-caption text-faint">· {m.assignedLeader.fullName}</span>
                          </span>
                          <span className="shrink-0 text-caption text-faint">{relativeDate(m.lastReportDate)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {/* Recent reports feed */}
            <Card className="p-5">
              <h2 className="mb-4 text-body font-semibold text-ink-2">Recent reports</h2>
              {loading ? (
                <SkeletonRows rows={4} className="p-0" />
              ) : !data || data.recentReports.length === 0 ? (
                <p className="text-body text-faint">No reports yet.</p>
              ) : (
                <ul className="space-y-2">
                  {data.recentReports.slice(0, 8).map((r) => (
                    <li key={r.id}>
                      <Link
                        to={`/pastor/members/${r.member.id}`}
                        className="flex items-center justify-between gap-3 rounded-input px-2 py-1.5 transition hover:bg-surface-2"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Badge tone={statusMeta[r.statusTag].tone}>{statusMeta[r.statusTag].label}</Badge>
                          <span className="truncate text-body text-ink-2">
                            {r.member.firstName} {r.member.lastName}
                          </span>
                          {r.isConfidential && <IconLock className="h-3.5 w-3.5 shrink-0 text-info" />}
                        </span>
                        <span className="shrink-0 text-caption text-faint">{formatDateTime(r.createdAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <CasesPanel />
            <RecentActivityPanel viewAllTo="/pastor/logs" />
          </div>
        </>
      )}
    </AppShell>
  );
}

function Metric({ label, value, loading }: { label: string; value?: number; loading: boolean }) {
  return (
    <div className="px-4 py-4 first:pl-0 sm:px-6 sm:first:pl-0">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="mt-1 text-heading font-semibold text-ink-2">
        {loading ? <span className="block h-7 w-10 animate-pulse rounded bg-wash" /> : value ?? 0}
      </dd>
    </div>
  );
}
