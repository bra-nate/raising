import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, Input, Select } from '../../components/ui';
import { IconPlus, IconSearch, IconUpload } from '../../components/ui/icons';
import { listFirstTimers } from '../../lib/api';
import { ftStatusMeta } from '../../lib/firstTimers';
import { relativeDate } from '../../lib/utils';
import type { FirstTimer, FirstTimerStatus } from '../../types';
import { AddFirstTimerModal, UploadModal } from '../followup/FirstTimers';

export default function PastorFirstTimers() {
  const [items, setItems] = useState<FirstTimer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | FirstTimerStatus>('all');
  const [assignee, setAssignee] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  async function reload() {
    const { data } = await listFirstTimers();
    setItems(data);
  }
  useEffect(() => {
    reload()
      .catch(() => setError('Could not load first-timers.'))
      .finally(() => setLoading(false));
  }, []);

  const assignees = useMemo(
    () => Array.from(new Set(items.map((f) => f.assignedTo?.fullName).filter(Boolean))) as string[],
    [items]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((f) => {
      if (status !== 'all' && f.status !== status) return false;
      if (assignee !== 'all' && (f.assignedTo?.fullName ?? '') !== assignee) return false;
      if (q && !`${f.firstName} ${f.lastName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, status, assignee]);

  return (
    <AppShell
      title="First-Timers"
      subtitle={loading ? undefined : `${filtered.length} of ${items.length} shown`}
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
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name…" className="pl-9" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as 'all' | FirstTimerStatus)}>
          <option value="all">Any status</option>
          <option value="pending">Pending</option>
          <option value="contacted">Contacted</option>
          <option value="interested">Interested</option>
          <option value="not_interested">Not interested</option>
          <option value="converted">Converted</option>
        </Select>
        <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="all">Anyone</option>
          {assignees.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      </div>

      <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
        {loading ? (
          <div className="p-8 text-body text-faint">Loading…</div>
        ) : error ? (
          <div className="p-8 text-body text-concern">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-body font-medium text-ink-2">No first-timers match</p>
            <p className="mt-1 text-caption text-faint">Try clearing a filter.</p>
          </div>
        ) : (
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
                {filtered.map((f) => {
                  const s = ftStatusMeta[f.status];
                  return (
                    <tr key={f.id} className="border-b border-hairline last:border-0 transition hover:bg-surface-2">
                      <td className="px-5 py-3">
                        <Link to={`/pastor/first-timers/${f.id}`} className="text-body font-medium text-ink-2 hover:text-accent">
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
        )}
      </div>

      <AddFirstTimerModal open={showAdd} onClose={() => setShowAdd(false)} onSaved={reload} />
      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onSaved={reload} />
    </AppShell>
  );
}
