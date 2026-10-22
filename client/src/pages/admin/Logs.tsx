import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Button, Input, Select, SkeletonRows } from '../../components/ui';
import { listActivityLog, listUsers } from '../../lib/api';
import { homePathForRole } from '../../lib/roles';
import { useAuth } from '../../hooks/useAuth';
import type { ActivityLog, User } from '../../types';

const PAGE_SIZE = 25;
const ACTIONS = [
  'submitted_member_report', 'submitted_first_timer_report', 'added_member', 'updated_member',
  'converted_first_timer', 'added_first_timer', 'viewed_confidential_report', 'redacted_report',
  'deleted_report', 'created_user', 'deactivated_user', 'updated_settings', 'logged_in',
  'changed_user_role', 'changed_password', 'reset_user_password', 'opened_case', 'acknowledged_case',
  'assigned_case', 'resolved_case', 'escalated_case', 'assigned_first_timer', 'claimed_first_timer',
  'created_group', 'updated_group', 'deleted_group', 'exported_person_data', 'redacted_for_retention',
  'reviewed_confidential_access',
];

export default function Logs() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const action = searchParams.get('action') ?? '';
  const userId = searchParams.get('userId') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setSearchParams(next, { replace: true });
  }

  function setPage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) next.delete('page');
    else next.set('page', String(nextPage));
    setSearchParams(next);
  }

  useEffect(() => {
    listUsers().then((response) => setUsers(response.data)).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    listActivityLog({
      page,
      pageSize: PAGE_SIZE,
      action: action || undefined,
      userId: userId || undefined,
      from: from || undefined,
      to: to || undefined,
    })
      .then((response) => {
        setLogs(response.data);
        setTotal(response.total);
      })
      .catch(() => setError('Could not load the activity log. Check the selected filters.'))
      .finally(() => setLoading(false));
  }, [page, action, userId, from, to]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const home = user ? homePathForRole(user.role) : '/';

  return (
    <AppShell title="Activity Log" subtitle={loading ? undefined : `${total} entries`} back={{ to: home, label: 'Dashboard' }}>
      <div className="mb-4 grid gap-3 rounded-card border border-hairline bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-caption text-faint">
          <span>Actor</span>
          <Select value={userId} onChange={(event) => updateFilter('userId', event.target.value)}>
            <option value="">All users</option>
            {users.map((entry) => <option key={entry.id} value={entry.id}>{entry.fullName}</option>)}
          </Select>
        </label>
        <label className="space-y-1 text-caption text-faint">
          <span>Action</span>
          <Select value={action} onChange={(event) => updateFilter('action', event.target.value)}>
            <option value="">All actions</option>
            {ACTIONS.map((entry) => <option key={entry} value={entry}>{entry.replace(/_/g, ' ')}</option>)}
          </Select>
        </label>
        <label className="space-y-1 text-caption text-faint">
          <span>From</span>
          <Input type="date" value={from} max={to || undefined} onChange={(event) => updateFilter('from', event.target.value)} />
        </label>
        <label className="space-y-1 text-caption text-faint">
          <span>To</span>
          <Input type="date" value={to} min={from || undefined} onChange={(event) => updateFilter('to', event.target.value)} />
        </label>
      </div>

      {error ? <p className="text-body text-concern">{error}</p> : (
        <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-hairline text-caption uppercase tracking-wide text-faint">
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                  <th className="px-5 py-3 font-medium">Subject</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={4}><SkeletonRows rows={6} /></td></tr> : logs.length === 0 ? (
                  <tr><td colSpan={4} className="p-12 text-center"><p className="text-body font-medium text-ink-2">No activity matches these filters</p></td></tr>
                ) : logs.map((log) => (
                  <tr key={log.id} className="border-b border-hairline last:border-0">
                    <td className="whitespace-nowrap px-5 py-3 text-body text-faint">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-5 py-3 text-body text-ink-2">{log.user?.fullName ?? '—'}</td>
                    <td className="px-5 py-3 text-body text-ink-2">{log.action.replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3 text-body text-faint">
                      {log.entityType.replace(/_/g, ' ')}{log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <Button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1 || loading}>Previous</Button>
        <span className="text-caption text-faint">Page {page} of {totalPages}</span>
        <Button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages || loading}>Next</Button>
      </div>
    </AppShell>
  );
}
