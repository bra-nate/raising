import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, Input, Select } from '../../components/ui';
import { IconDownload, IconPlus, IconSearch } from '../../components/ui/icons';
import { exportMembersCsv, listMembers } from '../../lib/api';
import { fullName, relativeDate, silenceMeta, statusMeta } from '../../lib/utils';
import type { Member, SilenceStatus, StatusTag } from '../../types';

export default function PastorMembers() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [leader, setLeader] = useState('all');
  const [group, setGroup] = useState('all');
  const [status, setStatus] = useState<'all' | StatusTag>((params.get('status') as StatusTag) || 'all');
  const [silence, setSilence] = useState<'all' | SilenceStatus>((params.get('silence') as SilenceStatus) || 'all');
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
    if (status !== 'all') next.set('status', status);
    if (silence !== 'all') next.set('silence', silence);
    setParams(next, { replace: true });
  }, [status, silence, setParams]);

  const leaders = useMemo(
    () => Array.from(new Set(members.map((m) => m.assignedLeader?.fullName).filter(Boolean))) as string[],
    [members]
  );
  const groups = useMemo(
    () => Array.from(new Set(members.map((m) => m.group?.name).filter(Boolean))) as string[],
    [members]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (leader !== 'all' && m.assignedLeader?.fullName !== leader) return false;
      if (group !== 'all' && m.group?.name !== group) return false;
      if (status !== 'all' && m.latestStatus !== status) return false;
      if (silence !== 'all' && (m.silence ?? 'ok') !== silence) return false;
      if (q && !fullName(m).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [members, search, leader, group, status, silence]);

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
      {/* Filters */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="pl-9"
          />
        </div>
        <Select value={leader} onChange={(e) => setLeader(e.target.value)}>
          <option value="all">All leaders</option>
          {leaders.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
        <Select value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="all">All groups</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as 'all' | StatusTag)}>
          <option value="all">Any status</option>
          <option value="good">Good</option>
          <option value="needs_attention">Needs Attention</option>
          <option value="concern">Concern</option>
        </Select>
        <Select value={silence} onChange={(e) => setSilence(e.target.value as 'all' | SilenceStatus)}>
          <option value="all">Any silence</option>
          <option value="ok">On track</option>
          <option value="overdue">Overdue</option>
          <option value="significant">Significantly overdue</option>
        </Select>
      </div>

      <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
        {loading ? (
          <div className="p-8 text-body text-faint">Loading…</div>
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
