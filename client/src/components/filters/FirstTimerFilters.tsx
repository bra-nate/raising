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

/** First-timer filters backed by the server's complete assignee facets. */
export function FirstTimerFilters({
  items,
  assigneeOptions,
  value,
  onChange,
}: {
  items: FirstTimer[];
  assigneeOptions?: string[];
  value: FirstTimerFilterState;
  onChange: (next: FirstTimerFilterState) => void;
}) {
  const assignees = useMemo(() => {
    const options = assigneeOptions ?? Array.from(new Set(items.map((f) => f.assignedTo?.fullName).filter(Boolean))) as string[];
    return value.assignee !== 'all' && !options.includes(value.assignee) ? [value.assignee, ...options] : options;
  }, [assigneeOptions, items, value.assignee]);
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
          options: [
            { value: 'all', label: 'Anyone' },
            { value: 'unassigned', label: 'Unassigned' },
            ...assignees.filter((a) => a !== 'unassigned').map((a) => ({ value: a, label: a })),
          ],
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
