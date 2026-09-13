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
  changed_password: 'changed their password',
  reset_user_password: "reset a user's password",
  updated_settings: 'updated settings',
  viewed_confidential_report: 'viewed a confidential report',
  submitted_member_report: 'submitted a report',
  redacted_report: 'redacted a report',
  deleted_report: 'deleted a report',
  added_member: 'added a member',
  updated_member: 'updated a member',
  opened_case: 'opened a case',
  acknowledged_case: 'acknowledged a case',
  assigned_case: 'assigned a case',
  resolved_case: 'resolved a case',
  escalated_case: 'escalated a case',
  assigned_first_timer: 'assigned a first-timer',
  claimed_first_timer: 'claimed a first-timer',
  created_group: 'created a group',
  updated_group: 'updated a group',
  deleted_group: 'deleted a group',
  exported_person_data: 'exported a person’s data',
  redacted_for_retention: 'redacted a record for retention',
  reviewed_confidential_access: 'reviewed confidential access',
  added_first_timer: 'added a first-timer',
  submitted_first_timer_report: 'logged a call',
  converted_first_timer: 'converted a first-timer',
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
