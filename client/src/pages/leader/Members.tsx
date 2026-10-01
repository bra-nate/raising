import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, SkeletonRows } from '../../components/ui';
import {
  MemberFilters,
  applyMemberFilters,
  emptyMemberFilters,
  type MemberFilterState,
} from '../../components/filters/MemberFilters';
import { IconPlus } from '../../components/ui/icons';
import { listMembers } from '../../lib/api';
import { fullName, relativeDate, silenceMeta, statusMeta } from '../../lib/utils';
import type { Member } from '../../types';

export default function LeaderMembers() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<MemberFilterState>(emptyMemberFilters);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await listMembers();
        setMembers(data);
      } catch {
        setError('Could not load your members.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sorted = useMemo(() => applyMemberFilters(members, filters), [members, filters]);

  return (
    <AppShell
      title="My Members"
      subtitle={loading ? undefined : `${sorted.length} of ${members.length} shown`}
      back={{ to: '/leader', label: 'Dashboard' }}
      actions={
        <Button variant="primary" onClick={() => navigate('/leader/members/new')}>
          <IconPlus className="h-4 w-4" />
          Add member
        </Button>
      }
    >
      <MemberFilters members={members} value={filters} onChange={setFilters} />

      <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
        {loading ? (
          <SkeletonRows rows={6} />
        ) : error ? (
          <div className="p-8 text-body text-concern">{error}</div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-body font-medium text-ink-2">No members yet</p>
            <p className="mt-1 text-caption text-faint">Add the people in your care to begin.</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-body font-medium text-ink-2">No members match</p>
            <p className="mt-1 text-caption text-faint">Try clearing a filter or search term.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-hairline text-caption uppercase tracking-wide text-faint">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Latest status</th>
                  <th className="px-5 py-3 font-medium">Last report</th>
                  <th className="px-5 py-3 font-medium">Silence</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => {
                  const s = silenceMeta[m.silence ?? 'ok'];
                  return (
                    <tr key={m.id} className="border-b border-hairline last:border-0 transition hover:bg-surface-2">
                      <td className="px-5 py-3">
                        <Link to={`/leader/members/${m.id}`} className="flex items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                          <span className="text-body font-medium text-ink-2 hover:text-accent">{fullName(m)}</span>
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        {m.latestStatus ? (
                          <Badge tone={statusMeta[m.latestStatus].tone}>{statusMeta[m.latestStatus].label}</Badge>
                        ) : (
                          <span className="text-caption text-faint">No reports</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-body text-muted">{relativeDate(m.lastReportDate)}</td>
                      <td className="px-5 py-3">
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
