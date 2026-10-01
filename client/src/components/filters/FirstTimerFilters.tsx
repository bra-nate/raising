import { useMemo } from 'react';
import { FilterBar } from './FilterBar';
import type { FirstTimer, FirstTimerStatus } from '../../types';

export type FirstTimerFilterState = {
  search: string;
  status: 'all' | FirstTimerStatus;
  assignee: string;
  sort: 'visitDate' | 'name' | 'status';
};

export const emptyFirstTimerFilters: FirstTimerFilterState = {
  search: '',
  status: 'all',
  assignee: 'all',
  sort: 'visitDate',
};

const ftName = (f: FirstTimer) => `${f.firstName} ${f.lastName}`;

/** Filter + sort a first-timer list. Shared by the pastor and follow-up views. */
export function applyFirstTimerFilters(items: FirstTimer[], f: FirstTimerFilterState): FirstTimer[] {
  const q = f.search.trim().toLowerCase();
  const list = items.filter((t) => {
    if (f.status !== 'all' && t.status !== f.status) return false;
    if (f.assignee !== 'all' && (t.assignedTo?.fullName ?? '') !== f.assignee) return false;
    if (q && !ftName(t).toLowerCase().includes(q)) return false;
    return true;
  });

  if (f.sort === 'name') list.sort((a, b) => ftName(a).localeCompare(ftName(b)));
  else if (f.sort === 'status') list.sort((a, b) => a.status.localeCompare(b.status));
  // Newest visit first — the people to call back are the ones who just showed up.
  else list.sort((a, b) => new Date(b.visitDate ?? 0).getTime() - new Date(a.visitDate ?? 0).getTime());
  return list;
}

/** First-timer filter bar. The assignee select hides only when it cannot narrow the list. */
export function FirstTimerFilters({
  items,
  value,
  onChange,
}: {
  items: FirstTimer[];
  value: FirstTimerFilterState;
  onChange: (next: FirstTimerFilterState) => void;
}) {
  const assignees = useMemo(
    () => Array.from(new Set(items.map((f) => f.assignedTo?.fullName).filter(Boolean))) as string[],
    [items]
  );
  const set = <K extends keyof FirstTimerFilterState>(key: K, v: FirstTimerFilterState[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <FilterBar
      search={value.search}
      onSearchChange={(v) => set('search', v)}
      selects={[
        {
          label: 'Filter by status',
          value: value.status,
          onChange: (v) => set('status', v as FirstTimerFilterState['status']),
          options: [
            { value: 'all', label: 'Any status' },
            { value: 'pending', label: 'Pending' },
            { value: 'contacted', label: 'Contacted' },
            { value: 'interested', label: 'Interested' },
            { value: 'not_interested', label: 'Not interested' },
            { value: 'converted', label: 'Converted' },
          ],
        },
        {
          label: 'Filter by assignee',
          value: value.assignee,
          onChange: (v) => set('assignee', v),
          hidden:
            value.assignee === 'all' &&
            (assignees.length === 0 || (assignees.length === 1 && items.every((item) => item.assignedTo))),
          options: [{ value: 'all', label: 'Anyone' }, ...assignees.map((a) => ({ value: a, label: a }))],
        },
        {
          label: 'Sort first-timers',
          value: value.sort,
          onChange: (v) => set('sort', v as FirstTimerFilterState['sort']),
          options: [
            { value: 'visitDate', label: 'Sort: Visit date' },
            { value: 'name', label: 'Sort: Name' },
            { value: 'status', label: 'Sort: Status' },
          ],
        },
      ]}
    />
  );
}
