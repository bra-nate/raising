import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Card } from '../../components/ui';
import { IconLock } from '../../components/ui/icons';
import { RecentActivityPanel } from '../../components/dashboard/RecentActivityPanel';
import { getPastorDashboard } from '../../lib/api';
import { fullName, relativeDate, silenceMeta, statusMeta } from '../../lib/utils';
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

  return (
    <AppShell title="Dashboard" subtitle="Full oversight across every reporting stream.">
      <p className="mb-6 text-heading font-semibold text-ink-2">Good to see you, {firstName}.</p>

      {error ? (
        <p className="text-body text-concern">{error}</p>
      ) : (
        <>
          {/* Six stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Stat label="Active members" value={data?.stats.totalActiveMembers} loading={loading} to="/pastor/members" />
            <Stat label="Reports this week" value={data?.stats.reportsThisWeek} loading={loading} />
            <Stat
              label="Needs attention"
              value={data?.stats.needsAttention}
              loading={loading}
              tone="attention"
              to="/pastor/members?status=needs_attention"
            />
            <Stat
              label="Concern"
              value={data?.stats.concern}
              loading={loading}
              tone="concern"
              to="/pastor/members?status=concern"
            />
            <Stat label="First-timers this week" value={data?.stats.firstTimersThisWeek} loading={loading} />
            <Stat label="Pending first-timers" value={data?.stats.pendingFirstTimers} loading={loading} />
          </div>

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
                <p className="text-body text-faint">Loading…</p>
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
                <p className="text-body text-faint">Loading…</p>
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
                        <span className="shrink-0 text-caption text-faint">{relativeDate(r.createdAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <RecentActivityPanel viewAllTo="/pastor/logs" />
          </div>
        </>
      )}
    </AppShell>
  );
}

function Stat({
  label,
  value,
  loading,
  tone,
  to,
}: {
  label: string;
  value?: number;
  loading: boolean;
  tone?: 'attention' | 'concern';
  to?: string;
}) {
  const valueColor = tone === 'concern' ? 'text-concern' : tone === 'attention' ? 'text-attention' : 'text-ink-2';
  const body = (
    <>
      <p className="text-caption text-muted">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-12 animate-pulse rounded bg-surface-2" />
      ) : (
        <p className={`mt-1 text-heading font-semibold ${valueColor}`}>{value ?? 0}</p>
      )}
    </>
  );
  const cls = 'rounded-card border border-hairline bg-surface p-5 shadow-card';
  return to ? (
    <Link to={to} className={`${cls} block transition hover:border-accent/40 hover:shadow-elevated`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
