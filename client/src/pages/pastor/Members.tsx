import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, SkeletonRows } from '../../components/ui';
import {
  MemberFilters,
  applyMemberFilters,
  emptyMemberFilters,
  type MemberFilterState,
} from '../../components/filters/MemberFilters';
import { IconDownload, IconPlus } from '../../components/ui/icons';
import { exportMembersCsv, listMembers } from '../../lib/api';
import { fullName, relativeDate, silenceMeta, statusMeta } from '../../lib/utils';
import type { Member, SilenceStatus, StatusTag } from '../../types';

export default function PastorMembers() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<MemberFilterState>({
    ...emptyMemberFilters,
    leader: params.get('leader') || 'all',
    status: (params.get('status') as StatusTag) || 'all',
    silence: (params.get('silence') as SilenceStatus) || 'all',
  });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await listMembers();
        setMembers(data);
      } catch {
        setError('Could not load members.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Keep status/silence in the URL so dashboard stat cards can deep-link here.
  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.leader !== 'all') next.set('leader', filters.leader);
    if (filters.status !== 'all') next.set('status', filters.status);
    if (filters.silence !== 'all') next.set('silence', filters.silence);
    setParams(next, { replace: true });
  }, [filters.leader, filters.status, filters.silence, setParams]);

  const filtered = useMemo(() => applyMemberFilters(members, filters), [members, filters]);

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await exportMembersCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'members.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Could not export members.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell
      title="Members"
      subtitle={loading ? undefined : `${filtered.length} of ${members.length} shown`}
      back={{ to: '/pastor', label: 'Dashboard' }}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleExport} disabled={exporting || members.length === 0}>
            <IconDownload className="h-4 w-4" />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
          <Button variant="primary" onClick={() => navigate('/pastor/members/new')}>
            <IconPlus className="h-4 w-4" />
            Add member
          </Button>
        </div>
      }
    >
      <MemberFilters members={members} value={filters} onChange={setFilters} />

      <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
        {loading ? (
          <SkeletonRows rows={6} />
        ) : error ? (
          <div className="p-8 text-body text-concern">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-body font-medium text-ink-2">No members match</p>
            <p className="mt-1 text-caption text-faint">Try clearing a filter or search term.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-hairline text-caption uppercase tracking-wide text-faint">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Leader</th>
                  <th className="px-5 py-3 font-medium">Group</th>
                  <th className="px-5 py-3 font-medium">Latest status</th>
                  <th className="px-5 py-3 font-medium">Last report</th>
                  <th className="px-5 py-3 font-medium">Silence</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const s = silenceMeta[m.silence ?? 'ok'];
                  return (
                    <tr key={m.id} className="border-b border-hairline last:border-0 transition hover:bg-surface-2">
                      <td className="px-5 py-3">
                        <Link to={`/pastor/members/${m.id}`} className="flex items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                          <span className="text-body font-medium text-ink-2 hover:text-accent">{fullName(m)}</span>
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-body text-muted">{m.assignedLeader?.fullName ?? '—'}</td>
                      <td className="px-5 py-3 text-body text-muted">{m.group?.name ?? '—'}</td>
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
