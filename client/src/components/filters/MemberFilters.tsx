import { useMemo } from 'react';
import { FilterBar } from './FilterBar';
import type { Member, SilenceStatus, StatusTag } from '../../types';

export type MemberFilterState = {
  search: string;
  leader: string;
  group: string;
  status: 'all' | StatusTag;
  silence: 'all' | SilenceStatus;
  sort: 'silence' | 'name' | 'lastReport';
};

export const emptyMemberFilters: MemberFilterState = {
  search: '',
  leader: 'all',
  group: 'all',
  status: 'all',
  silence: 'all',
  sort: 'silence',
};

const names = <T,>(items: T[], pick: (t: T) => string | undefined) =>
  Array.from(new Set(items.map(pick).filter(Boolean))) as string[];

/**
 * Member filter bar. Single-option selectors stay visible only when they can
 * separate assigned/grouped records from unassigned ones or hold an active filter.
 */
export function MemberFilters({
  members,
  leaderOptions,
  groupOptions,
  value,
  onChange,
}: {
  members: Member[];
  leaderOptions?: string[];
  groupOptions?: string[];
  value: MemberFilterState;
  onChange: (next: MemberFilterState) => void;
}) {
  const leaders = useMemo(() => {
    const options = leaderOptions ?? names(members, (m) => m.assignedLeader?.fullName);
    return value.leader !== 'all' && !options.includes(value.leader) ? [value.leader, ...options] : options;
  }, [leaderOptions, members, value.leader]);
  const groups = useMemo(() => {
    const options = groupOptions ?? names(members, (m) => m.group?.name);
    return value.group !== 'all' && !options.includes(value.group) ? [value.group, ...options] : options;
  }, [groupOptions, members, value.group]);
  const set = <K extends keyof MemberFilterState>(key: K, v: MemberFilterState[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <FilterBar
      search={value.search}
      onSearchChange={(v) => set('search', v)}
      selects={[
        {
          label: 'Filter by leader',
          value: value.leader,
          onChange: (v) => set('leader', v),
          hidden: value.leader === 'all' && leaders.length < 2,
          options: [{ value: 'all', label: 'All leaders' }, ...leaders.map((l) => ({ value: l, label: l }))],
        },
        {
          label: 'Filter by group',
          value: value.group,
          onChange: (v) => set('group', v),
          hidden: value.group === 'all' && groups.length === 0,
          options: [{ value: 'all', label: 'All groups' }, ...groups.map((g) => ({ value: g, label: g }))],
        },
        {
          label: 'Filter by latest status',
          value: value.status,
          onChange: (v) => set('status', v as MemberFilterState['status']),
          options: [
            { value: 'all', label: 'Any status' },
            { value: 'good', label: 'Good' },
            { value: 'needs_attention', label: 'Needs Attention' },
            { value: 'concern', label: 'Concern' },
          ],
        },
        {
          label: 'Filter by silence',
          value: value.silence,
          onChange: (v) => set('silence', v as MemberFilterState['silence']),
          options: [
            { value: 'all', label: 'Any silence' },
            { value: 'ok', label: 'On track' },
            { value: 'overdue', label: 'Overdue' },
            { value: 'significant', label: 'Significantly overdue' },
          ],
        },
        {
          label: 'Sort members',
          value: value.sort,
          onChange: (v) => set('sort', v as MemberFilterState['sort']),
          options: [
            { value: 'silence', label: 'Sort: Silence' },
            { value: 'name', label: 'Sort: Name' },
            { value: 'lastReport', label: 'Sort: Last report' },
          ],
        },
      ]}
    />
  );
}
