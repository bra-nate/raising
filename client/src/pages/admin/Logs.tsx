import { useEffect, useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui';
import { listActivityLog } from '../../lib/api';
import { homePathForRole } from '../../lib/roles';
import { useAuth } from '../../hooks/useAuth';
import type { ActivityLog } from '../../types';

const PAGE_SIZE = 25;

export default function Logs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    listActivityLog({ page, pageSize: PAGE_SIZE })
      .then((res) => {
        setLogs(res.data);
        setTotal(res.total);
      })
      .catch(() => setError('Could not load the activity log.'))
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const home = user ? homePathForRole(user.role) : '/';

  return (
    <AppShell
      title="Activity Log"
      subtitle={loading ? undefined : `${total} entries`}
      back={{ to: home, label: 'Dashboard' }}
    >
      {error ? (
        <p className="text-body text-concern">{error}</p>
      ) : (
        <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-hairline text-caption uppercase tracking-wide text-faint">
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                  <th className="px-5 py-3 font-medium">Entity</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-body text-faint">
                      Loading…
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center">
                      <p className="text-body font-medium text-ink-2">No activity recorded yet</p>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-b border-hairline last:border-0">
                      <td className="whitespace-nowrap px-5 py-3 text-body text-faint">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-body text-ink-2">{log.user?.fullName ?? '—'}</td>
                      <td className="px-5 py-3 text-body text-ink-2">{log.action.replace(/_/g, ' ')}</td>
                      <td className="px-5 py-3 text-body text-faint">{log.entityType}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <Button
          variant="secondary"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || loading}
        >
          Previous
        </Button>
        <span className="text-caption text-faint">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="secondary"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || loading}
        >
          Next
        </Button>
      </div>
    </AppShell>
  );
}
