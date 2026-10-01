import { useMemo } from 'react';
import { FilterBar } from './FilterBar';
import { fullName } from '../../lib/utils';
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

const SILENCE_RANK: Record<string, number> = { significant: 0, overdue: 1, ok: 2 };

/** Filter + sort a member list. Shared so pastor and leader views never drift apart. */
export function applyMemberFilters(members: Member[], f: MemberFilterState): Member[] {
  const q = f.search.trim().toLowerCase();
  const list = members.filter((m) => {
    if (f.leader !== 'all' && m.assignedLeader?.fullName !== f.leader) return false;
    if (f.group !== 'all' && m.group?.name !== f.group) return false;
    if (f.status !== 'all' && m.latestStatus !== f.status) return false;
    if (f.silence !== 'all' && (m.silence ?? 'ok') !== f.silence) return false;
    if (q && !fullName(m).toLowerCase().includes(q)) return false;
    return true;
  });

  if (f.sort === 'name') list.sort((a, b) => fullName(a).localeCompare(fullName(b)));
  else if (f.sort === 'silence')
    list.sort((a, b) => SILENCE_RANK[a.silence ?? 'ok'] - SILENCE_RANK[b.silence ?? 'ok']);
  else
    list.sort(
      (a, b) => new Date(a.lastReportDate ?? 0).getTime() - new Date(b.lastReportDate ?? 0).getTime()
    );
  return list;
}

const names = <T,>(items: T[], pick: (t: T) => string | undefined) =>
  Array.from(new Set(items.map(pick).filter(Boolean))) as string[];

/**
 * Member filter bar. Single-option selectors stay visible only when they can
 * separate assigned/grouped records from unassigned ones or hold an active filter.
 */
export function MemberFilters({
  members,
  value,
  onChange,
}: {
  members: Member[];
  value: MemberFilterState;
  onChange: (next: MemberFilterState) => void;
}) {
  const leaders = useMemo(() => names(members, (m) => m.assignedLeader?.fullName), [members]);
  const groups = useMemo(() => names(members, (m) => m.group?.name), [members]);
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
          hidden:
            value.group === 'all' &&
            (groups.length === 0 || (groups.length === 1 && members.every((member) => member.group))),
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
