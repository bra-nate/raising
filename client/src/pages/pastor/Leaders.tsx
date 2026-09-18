import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, SkeletonRows } from '../../components/ui';
import { listMembers, listUsers } from '../../lib/api';
import { relativeDate } from '../../lib/utils';
import type { Member, User } from '../../types';

interface Rollup {
  leader: User;
  members: number;
  ok: number;
  overdue: number;
  significant: number;
  needsAttention: number;
  concern: number;
  unreported: number;
  lastReportDate: string | null;
}

// Silence and status are computed server-side; this page only counts them.
function rollUp(leader: User, members: Member[]): Rollup {
  const mine = members.filter((m) => m.assignedLeaderId === leader.id);
  const dates = mine.map((m) => m.lastReportDate).filter(Boolean) as string[];
  return {
    leader,
    members: mine.length,
    ok: mine.filter((m) => (m.silence ?? 'ok') === 'ok').length,
    overdue: mine.filter((m) => m.silence === 'overdue').length,
    significant: mine.filter((m) => m.silence === 'significant').length,
    needsAttention: mine.filter((m) => m.latestStatus === 'needs_attention').length,
    concern: mine.filter((m) => m.latestStatus === 'concern').length,
    unreported: mine.filter((m) => !m.lastReportDate).length,
    lastReportDate: dates.sort()[dates.length - 1] ?? null,
  };
}

export default function PastorLeaders() {
  const [members, setMembers] = useState<Member[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [m, u] = await Promise.all([listMembers(), listUsers()]);
        setMembers(m.data);
        setUsers(u.data);
      } catch {
        setError('Could not load leaders.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Leaders carrying the most silence surface first — that is the whole point
  // of the page.
  const rows = useMemo(
    () =>
      users
        .filter((u) => u.role === 'leader' && u.isActive)
        .map((u) => rollUp(u, members))
        .sort(
          (a, b) =>
            b.significant - a.significant ||
            b.overdue - a.overdue ||
            b.concern - a.concern ||
            a.leader.fullName.localeCompare(b.leader.fullName)
        ),
    [users, members]
  );

  const totals = useMemo(
    () => ({
      members: rows.reduce((n, r) => n + r.members, 0),
      behind: rows.reduce((n, r) => n + r.overdue + r.significant, 0),
    }),
    [rows]
  );

  return (
    <AppShell
      title="Leaders"
      subtitle={
        loading ? undefined : `${rows.length} leaders · ${totals.members} members · ${totals.behind} behind on reports`
      }
      back={{ to: '/pastor', label: 'Dashboard' }}
    >
      <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
        {loading ? (
          <SkeletonRows rows={6} />
        ) : error ? (
          <div className="p-8 text-body text-concern">{error}</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-body font-medium text-ink-2">No active leaders</p>
            <p className="mt-1 text-caption text-faint">
              Add one from{' '}
              <Link to="/pastor/users" className="text-accent hover:underline">
                Users
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-b border-hairline text-caption uppercase tracking-wide text-faint">
                  <th className="px-5 py-3 font-medium">Leader</th>
                  <th className="px-5 py-3 font-medium">Members</th>
                  <th className="px-5 py-3 font-medium">On track</th>
                  <th className="px-5 py-3 font-medium">Overdue</th>
                  <th className="px-5 py-3 font-medium">Significantly overdue</th>
                  <th className="px-5 py-3 font-medium">Needs attention</th>
                  <th className="px-5 py-3 font-medium">Concern</th>
                  <th className="px-5 py-3 font-medium">Last report</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.leader.id}
                    className="border-b border-hairline last:border-0 transition hover:bg-surface-2"
                  >
                    <td className="px-5 py-3">
                      <Link
                        to={`/pastor/leaders/${r.leader.id}`}
                        className="text-body font-medium text-ink-2 hover:text-accent"
                      >
                        {r.leader.fullName}
                      </Link>
                      <p className="text-caption text-faint">{r.leader.email}</p>
                    </td>
                    <td className="px-5 py-3 text-body text-muted">
                      {r.members}
                      {r.unreported > 0 && (
                        <span className="ml-1 text-caption text-faint">({r.unreported} never reported)</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-body text-muted">{r.ok || '—'}</td>
                    <td className="px-5 py-3">
                      {r.overdue > 0 ? <Badge tone="attention">{r.overdue}</Badge> : <span className="text-body text-faint">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      {r.significant > 0 ? <Badge tone="concern">{r.significant}</Badge> : <span className="text-body text-faint">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      {r.needsAttention > 0 ? (
                        <Badge tone="attention">{r.needsAttention}</Badge>
                      ) : (
                        <span className="text-body text-faint">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {r.concern > 0 ? <Badge tone="concern">{r.concern}</Badge> : <span className="text-body text-faint">—</span>}
                    </td>
                    <td className="px-5 py-3 text-body text-muted">{relativeDate(r.lastReportDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
