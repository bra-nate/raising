import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, SkeletonRows } from '../../components/ui';
import {
  FirstTimerFilters,
  emptyFirstTimerFilters,
  type FirstTimerFilterState,
} from '../../components/filters/FirstTimerFilters';
import { IconPlus, IconUpload } from '../../components/ui/icons';
import { Pagination } from '../../components/Pagination';
import { listFirstTimers } from '../../lib/api';
import { ftStatusMeta } from '../../lib/firstTimers';
import { relativeDate } from '../../lib/utils';
import type { FirstTimer } from '../../types';
import { AddFirstTimerModal, UploadModal } from '../followup/FirstTimers';

export default function PastorFirstTimers() {
  const pageSize = 25;
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<FirstTimer[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const filters: FirstTimerFilterState = {
    ...emptyFirstTimerFilters,
    search: params.get('search') || '',
    status: (params.get('status') as FirstTimerFilterState['status']) || 'all',
    assignee: params.get('assignee') || 'all',
    sort: (params.get('sort') as FirstTimerFilterState['sort']) || 'visitDate',
  };
  const page = Math.max(1, Number(params.get('page')) || 1);
  const query = params.toString();
  const [showAdd, setShowAdd] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  async function reload() {
    const { data, total: nextTotal, facets } = await listFirstTimers({ page, pageSize, ...filters });
    setItems(data);
    setAssignees(facets?.assignees ?? []);
    setTotal(nextTotal);
    setError('');
  }
  useEffect(() => {
    setLoading(true);
    reload()
      .catch(() => setError('Could not load first-timers.'))
      .finally(() => setLoading(false));
  }, [query]);

  function updateFilters(next: FirstTimerFilterState) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== 'all' && value !== emptyFirstTimerFilters[key as keyof FirstTimerFilterState]) search.set(key, value);
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
      title="First-Timers"
      subtitle={loading ? undefined : `${total} first-timer${total === 1 ? '' : 's'}`}
      back={{ to: '/pastor', label: 'Dashboard' }}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowUpload(true)}>
            <IconUpload className="h-4 w-4" />
            Upload CSV
          </Button>
          <Button variant="primary" onClick={() => setShowAdd(true)}>
            <IconPlus className="h-4 w-4" />
            Add first-timer
          </Button>
        </div>
      }
    >
      <FirstTimerFilters items={items} assigneeOptions={assignees} value={filters} onChange={updateFilters} />

      <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
        {loading ? (
          <SkeletonRows rows={6} />
        ) : error ? (
          <div className="p-8 text-body text-concern">{error}</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-body font-medium text-ink-2">No first-timers match</p>
            <p className="mt-1 text-caption text-faint">Try clearing a filter.</p>
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="border-b border-hairline text-caption uppercase tracking-wide text-faint">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Meeting</th>
                  <th className="px-5 py-3 font-medium">Visit date</th>
                  <th className="px-5 py-3 font-medium">Assigned to</th>
                </tr>
              </thead>
              <tbody>
                {items.map((f) => {
                  const s = ftStatusMeta[f.status];
                  return (
                    <tr key={f.id} className="border-b border-hairline last:border-0 transition hover:bg-surface-2">
                      <td className="px-5 py-3">
                        <Link to={`/pastor/first-timers/${f.id}`} state={{ returnTo: `${location.pathname}${location.search}` }} className="text-body font-medium text-ink-2 hover:text-accent">
                          {f.firstName} {f.lastName}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </td>
                      <td className="px-5 py-3 text-body text-muted">{f.serviceName ?? '—'}</td>
                      <td className="px-5 py-3 text-body text-muted">{relativeDate(f.visitDate)}</td>
                      <td className="px-5 py-3 text-body text-muted">{f.assignedTo?.fullName ?? 'Unassigned'}</td>
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

      <AddFirstTimerModal open={showAdd} onClose={() => setShowAdd(false)} onSaved={reload} />
      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onSaved={reload} />
    </AppShell>
  );
}
