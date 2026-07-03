import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button } from '../../components/ui';
import { IconPlus } from '../../components/ui/icons';
import { listMembers } from '../../lib/api';
import { fullName, relativeDate, silenceMeta, statusMeta } from '../../lib/utils';
import type { Member } from '../../types';

type SortKey = 'name' | 'silence' | 'lastReport';
const SILENCE_RANK: Record<string, number> = { significant: 0, overdue: 1, ok: 2 };

export default function LeaderMembers() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<SortKey>('silence');

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

  const sorted = useMemo(() => {
    const list = [...members];
    if (sort === 'name') list.sort((a, b) => fullName(a).localeCompare(fullName(b)));
    else if (sort === 'silence')
      list.sort((a, b) => SILENCE_RANK[a.silence ?? 'ok'] - SILENCE_RANK[b.silence ?? 'ok']);
    else
      list.sort(
        (a, b) => new Date(a.lastReportDate ?? 0).getTime() - new Date(b.lastReportDate ?? 0).getTime()
      );
    return list;
  }, [members, sort]);

  return (
    <AppShell
      title="My Members"
      subtitle={loading ? undefined : `${members.length} total`}
      back={{ to: '/leader', label: 'Dashboard' }}
      actions={
        <Button variant="primary" onClick={() => navigate('/leader/members/new')}>
          <IconPlus className="h-4 w-4" />
          Add member
        </Button>
      }
    >
      <div className="mb-4 flex items-center gap-2 text-caption text-muted">
        <span>Sort by</span>
        {(['silence', 'name', 'lastReport'] as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setSort(k)}
            className={`rounded-badge px-2 py-1 font-medium transition ${
              sort === k ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-wash'
            }`}
          >
            {k === 'silence' ? 'Silence' : k === 'name' ? 'Name' : 'Last report'}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
        {loading ? (
          <div className="p-8 text-body text-faint">Loading…</div>
        ) : error ? (
          <div className="p-8 text-body text-concern">{error}</div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-body font-medium text-ink-2">No members yet</p>
            <p className="mt-1 text-caption text-faint">Add the people in your care to begin.</p>
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
