import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Card, SkeletonRows } from '../../components/ui';
import { listMembers, listUsers } from '../../lib/api';
import { formatDate, fullName, relativeDate, silenceMeta, statusMeta } from '../../lib/utils';
import { roleLabels } from '../../lib/roles';
import type { Member, User } from '../../types';

const PAGE_SIZE = 20;

type Tab = 'overview' | 'members';

export default function LeaderProfile() {
  const { id = '' } = useParams();
  const [leader, setLeader] = useState<User | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const [u, m] = await Promise.all([listUsers(), listMembers()]);
        const found = u.data.find((x) => x.id === id) ?? null;
        if (!found) {
          setError('That leader no longer exists.');
        } else {
          setLeader(found);
          setMembers(m.data.filter((x) => x.assignedLeaderId === id));
        }
      } catch {
        setError('Could not load this leader.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Silence and status are computed server-side; this page only counts them.
  const stats = useMemo(
    () => ({
      total: members.length,
      ok: members.filter((m) => (m.silence ?? 'ok') === 'ok').length,
      overdue: members.filter((m) => m.silence === 'overdue').length,
      significant: members.filter((m) => m.silence === 'significant').length,
      needsAttention: members.filter((m) => m.latestStatus === 'needs_attention').length,
      concern: members.filter((m) => m.latestStatus === 'concern').length,
      neverReported: members.filter((m) => !m.lastReportDate).length,
    }),
    [members]
  );

  // Members needing attention first — the reason for opening a leader at all.
  const ordered = useMemo(() => {
    const rank = { significant: 0, overdue: 1, ok: 2 } as const;
    return [...members].sort(
      (a, b) =>
        rank[a.silence ?? 'ok'] - rank[b.silence ?? 'ok'] ||
        fullName(a).localeCompare(fullName(b))
    );
  }, [members]);

  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const visible = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) {
    return (
      <AppShell title="Leader" back={{ to: '/pastor/leaders', label: 'Leaders' }}>
        <SkeletonRows rows={4} className="p-0" />
      </AppShell>
    );
  }

  if (error || !leader) {
    return (
      <AppShell title="Leader" back={{ to: '/pastor/leaders', label: 'Leaders' }}>
        <p className="text-body text-concern">{error || 'Leader not found.'}</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={leader.fullName}
      subtitle={`${roleLabels[leader.role]} · ${stats.total} member${stats.total === 1 ? '' : 's'}`}
      back={{ to: '/pastor/leaders', label: 'Leaders' }}
    >
      <div className="mb-6 flex gap-1 border-b border-hairline">
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
          Details
        </TabButton>
        <TabButton active={tab === 'members'} onClick={() => setTab('members')}>
          Members
          {stats.total > 0 && <span className="ml-1.5 text-caption text-faint">{stats.total}</span>}
        </TabButton>
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="p-6">
            <h2 className="text-caption uppercase tracking-wide text-faint">Details</h2>
            <dl className="mt-4 space-y-3 text-body">
              <Detail label="Name" value={leader.fullName} />
              <Detail label="Email" value={leader.email} />
              <Detail label="Role" value={roleLabels[leader.role]} />
              <div>
                <dt className="text-caption text-faint">Status</dt>
                <dd className="mt-1">
                  {leader.isActive ? <Badge tone="good">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}
                </dd>
              </div>
              <Detail label="Added" value={formatDate(leader.createdAt)} />
            </dl>
          </Card>

          <Card className="p-6 lg:col-span-2">
            <h2 className="text-caption uppercase tracking-wide text-faint">Care load</h2>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Members" value={stats.total} />
              <Stat label="On track" value={stats.ok} tone={stats.ok > 0 ? 'good' : undefined} />
              <Stat label="Overdue" value={stats.overdue} tone={stats.overdue > 0 ? 'attention' : undefined} />
              <Stat
                label="Significantly overdue"
                value={stats.significant}
                tone={stats.significant > 0 ? 'concern' : undefined}
              />
              <Stat
                label="Needs attention"
                value={stats.needsAttention}
                tone={stats.needsAttention > 0 ? 'attention' : undefined}
              />
              <Stat label="Concern" value={stats.concern} tone={stats.concern > 0 ? 'concern' : undefined} />
            </div>
            {stats.neverReported > 0 && (
              <p className="mt-4 text-caption text-faint">
                {stats.neverReported} member{stats.neverReported === 1 ? ' has' : 's have'} never been reported on.
              </p>
            )}
          </Card>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
          {ordered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-body font-medium text-ink-2">No members yet</p>
              <p className="mt-1 text-caption text-faint">
                Nobody is assigned to {leader.fullName.split(' ')[0]}.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left">
                  <thead>
                    <tr className="border-b border-hairline text-caption uppercase tracking-wide text-faint">
                      <th className="px-5 py-3 font-medium">Member</th>
                      <th className="px-5 py-3 font-medium">Group</th>
                      <th className="px-5 py-3 font-medium">Latest status</th>
                      <th className="px-5 py-3 font-medium">Silence</th>
                      <th className="px-5 py-3 font-medium">Last report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((m) => {
                      const s = silenceMeta[m.silence ?? 'ok'];
                      return (
                        <tr key={m.id} className="border-b border-hairline last:border-0 transition hover:bg-surface-2">
                          <td className="px-5 py-3">
                            <Link
                              to={`/pastor/members/${m.id}`}
                              className="text-body font-medium text-ink-2 hover:text-accent hover:underline"
                            >
                              {fullName(m)}
                            </Link>
                          </td>
                          <td className="px-5 py-3 text-body text-muted">{m.group?.name ?? '—'}</td>
                          <td className="px-5 py-3">
                            {m.latestStatus ? (
                              <Badge tone={statusMeta[m.latestStatus].tone}>
                                {statusMeta[m.latestStatus].label}
                              </Badge>
                            ) : (
                              <span className="text-body text-faint">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <span className="flex items-center gap-2 text-body text-muted">
                              <span className={`h-1.5 w-1.5 rounded-pill ${s.dot}`} />
                              {s.label}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-body text-muted">{relativeDate(m.lastReportDate)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {pageCount > 1 && (
                <div className="flex items-center justify-between border-t border-hairline px-5 py-3">
                  <span className="text-caption text-faint">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, ordered.length)} of {ordered.length}
                  </span>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="text-caption font-medium text-accent transition hover:underline disabled:opacity-40 disabled:hover:no-underline"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                      disabled={page === pageCount}
                      className="text-caption font-medium text-accent transition hover:underline disabled:opacity-40 disabled:hover:no-underline"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-body transition ${
        active
          ? 'border-accent font-medium text-ink-2'
          : 'border-transparent text-muted hover:text-ink-2'
      }`}
    >
      {children}
    </button>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-caption text-faint">{label}</dt>
      <dd className="mt-1 text-ink-2">{value || '—'}</dd>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'attention' | 'concern' }) {
  const colour =
    tone === 'concern' ? 'text-concern' : tone === 'attention' ? 'text-attention' : tone === 'good' ? 'text-good' : 'text-ink-2';
  return (
    <div className="rounded-card border border-hairline px-4 py-3">
      <p className="text-caption uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-1 text-heading-sm font-semibold ${colour}`}>{value}</p>
    </div>
  );
}
