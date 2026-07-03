import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listActivityLog } from '../../lib/api';
import type { ActivityLog } from '../../types';

// Human-readable labels for audit actions.
const ACTION_LABELS: Record<string, string> = {
  logged_in: 'signed in',
  created_user: 'created a user',
  deactivated_user: 'deactivated a user',
  changed_user_role: 'changed a user role',
  updated_settings: 'updated settings',
  viewed_confidential_report: 'viewed a confidential report',
  submitted_member_report: 'submitted a report',
  redacted_report: 'redacted a report',
  deleted_report: 'deleted a report',
  added_member: 'added a member',
  updated_member: 'updated a member',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}

export function RecentActivityPanel({ viewAllTo, limit = 8 }: { viewAllTo: string; limit?: number }) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listActivityLog({ pageSize: limit })
      .then((res) => setLogs(res.data))
      .catch(() => setError('Could not load activity.'))
      .finally(() => setLoading(false));
  }, [limit]);

  return (
    <div className="rounded-card border border-hairline bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
        <Link to={viewAllTo} className="text-xs font-medium text-accent hover:underline">
          View all
        </Link>
      </div>
      {loading ? (
        <p className="text-sm text-faint">Loading…</p>
      ) : error ? (
        <p className="text-sm text-concern">{error}</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-faint">No activity yet.</p>
      ) : (
        <ul className="space-y-3">
          {logs.map((log) => (
            <li key={log.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink">
                <span className="font-medium">{log.user?.fullName ?? 'Someone'}</span>{' '}
                <span className="text-faint">{actionLabel(log.action)}</span>
              </span>
              <time className="shrink-0 text-xs text-faint">
                {new Date(log.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
