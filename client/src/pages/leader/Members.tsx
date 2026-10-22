import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, SkeletonRows } from '../../components/ui';
import {
  MemberFilters,
  emptyMemberFilters,
  type MemberFilterState,
} from '../../components/filters/MemberFilters';
import { IconPlus } from '../../components/ui/icons';
import { Pagination } from '../../components/Pagination';
import { listMembers } from '../../lib/api';
import { fullName, relativeDate, silenceMeta, statusMeta } from '../../lib/utils';
import type { Member } from '../../types';

export default function LeaderMembers() {
  const pageSize = 25;
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [members, setMembers] = useState<Member[]>([]);
  const [facets, setFacets] = useState<{ leaders?: string[]; groups?: string[] }>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const filters: MemberFilterState = {
    ...emptyMemberFilters,
    search: params.get('search') || '',
    group: params.get('group') || 'all',
    status: (params.get('status') as MemberFilterState['status']) || 'all',
    silence: (params.get('silence') as MemberFilterState['silence']) || 'all',
    sort: (params.get('sort') as MemberFilterState['sort']) || 'silence',
  };
  const page = Math.max(1, Number(params.get('page')) || 1);
  const query = params.toString();

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const { data, total: nextTotal, facets: nextFacets } = await listMembers({ page, pageSize, ...filters });
        setMembers(data);
        setFacets(nextFacets ?? {});
        setTotal(nextTotal);
        setError('');
      } catch {
        setError('Could not load your members.');
      } finally {
        setLoading(false);
      }
    })();
  }, [query]);

  function updateFilters(next: MemberFilterState) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== 'all' && value !== emptyMemberFilters[key as keyof MemberFilterState]) search.set(key, value);
    }
    setParams(search, { replace: true });
  }

  function changePage(nextPage: number) {
    const next = new URLSearchParams(params);
    if (nextPage === 1) next.delete('page');
    else next.set('page', String(nextPage));
    setParams(next);
  }

  return (
    <AppShell
      title="My Members"
      subtitle={loading ? undefined : `${total} member${total === 1 ? '' : 's'}`}
      back={{ to: '/leader', label: 'Dashboard' }}
      actions={
        <Button variant="primary" onClick={() => navigate('/leader/members/new')}>
          <IconPlus className="h-4 w-4" />
          Add member
        </Button>
      }
    >
      <MemberFilters members={members} groupOptions={facets.groups} value={filters} onChange={updateFilters} />

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
        ) : members.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-body font-medium text-ink-2">No members match</p>
            <p className="mt-1 text-caption text-faint">Try clearing a filter or search term.</p>
          </div>
        ) : (
          <>
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
                {members.map((m) => {
                  const s = silenceMeta[m.silence ?? 'ok'];
                  return (
                    <tr key={m.id} className="border-b border-hairline last:border-0 transition hover:bg-surface-2">
                      <td className="px-5 py-3">
                        <Link to={`/leader/members/${m.id}`} state={{ returnTo: `${location.pathname}${location.search}` }} className="flex items-center gap-2">
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
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={changePage} />
          </>
        )}
      </div>
    </AppShell>
  );
}
