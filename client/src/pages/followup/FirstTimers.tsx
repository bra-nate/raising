import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, Field, Input, Modal } from '../../components/ui';
import { IconPlus, IconSearch, IconUpload } from '../../components/ui/icons';
import {
  createFirstTimer,
  listFirstTimers,
  uploadFirstTimersBatch,
  type BatchUploadRow,
} from '../../lib/api';
import { ftStatusMeta, parseCsv } from '../../lib/firstTimers';
import { relativeDate } from '../../lib/utils';
import type { FirstTimer } from '../../types';

export default function FollowUpFirstTimers() {
  const [items, setItems] = useState<FirstTimer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((f) => `${f.firstName} ${f.lastName}`.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <AppShell
      title="First-Timers"
      subtitle={loading ? undefined : `${filtered.length} of ${items.length} shown`}
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
      <div className="mb-4 relative max-w-sm">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name…" className="pl-9" />
      </div>

      <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
        {loading ? (
          <div className="p-8 text-body text-faint">Loading…</div>
        ) : error ? (
          <div className="p-8 text-body text-concern">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-body font-medium text-ink-2">No first-timers yet</p>
            <p className="mt-1 text-caption text-faint">Upload a meeting list or add one to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
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
                        <Link to={`/followup/first-timers/${f.id}`} className="text-body font-medium text-ink-2 hover:text-accent">
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

export function AddFirstTimerModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', serviceName: '', visitDate: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.visitDate) {
      setError('First name, last name, and visit date are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createFirstTimer(form);
      await onSaved();
      setForm({ firstName: '', lastName: '', phone: '', email: '', serviceName: '', visitDate: '' });
      onClose();
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not add first-timer.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add first-timer" description="For a single walk-in.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="First name">
            <Input value={form.firstName} onChange={set('firstName')} required />
          </Field>
          <Field label="Last name">
            <Input value={form.lastName} onChange={set('lastName')} required />
          </Field>
        </div>
        <Field label="Meeting" hint="Which service they joined">
          <Input value={form.serviceName} onChange={set('serviceName')} />
        </Field>
        <Field label="Visit date">
          <Input type="date" value={form.visitDate} onChange={set('visitDate')} required />
        </Field>
        <Field label="Phone" hint="Optional">
          <Input value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Email" hint="Optional">
          <Input type="email" value={form.email} onChange={set('email')} />
        </Field>
        {error && <p className="text-body text-concern">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function UploadModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [meetingName, setMeetingName] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [rows, setRows] = useState<BatchUploadRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: { row: number; reason: string }[] } | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ''));
      setRows(parsed.rows);
      setParseErrors(parsed.errors);
    };
    reader.readAsText(file);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!meetingName.trim() || !visitDate) {
      setError('Meeting name and date are required.');
      return;
    }
    if (rows.length === 0) {
      setError('Upload a CSV with at least one valid row.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await uploadFirstTimersBatch({ meetingName, visitDate, rows });
      setResult(res);
      await onSaved();
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed.');
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setMeetingName('');
    setVisitDate('');
    setRows([]);
    setParseErrors([]);
    setError('');
    setResult(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Upload first-timers"
      description="One meeting per upload. CSV columns: firstName, lastName, phone, email."
    >
      {result ? (
        <div className="space-y-4">
          <p className="text-body text-ink-2">
            Created <strong>{result.created}</strong> first-timer(s).
          </p>
          {result.errors.length > 0 && (
            <ul className="max-h-40 overflow-y-auto rounded-input border border-hairline bg-wash p-3 text-caption text-muted">
              {result.errors.map((er) => (
                <li key={er.row}>
                  Row {er.row}: {er.reason}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Meeting name">
            <Input value={meetingName} onChange={(e) => setMeetingName(e.target.value)} required />
          </Field>
          <Field label="Meeting date">
            <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} required />
          </Field>
          <Field label="CSV file" hint="Header row with firstName, lastName, phone, email">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="block w-full text-body text-muted file:mr-3 file:rounded-btn file:border file:border-action file:bg-surface file:px-3 file:py-2 file:text-body file:text-action-ink"
            />
          </Field>
          {rows.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-input border border-hairline">
              <table className="w-full text-left text-caption">
                <thead>
                  <tr className="text-faint">
                    <th className="px-3 py-1.5">Name</th>
                    <th className="px-3 py-1.5">Phone</th>
                    <th className="px-3 py-1.5">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-hairline">
                      <td className="px-3 py-1.5 text-ink-2">
                        {r.firstName} {r.lastName}
                      </td>
                      <td className="px-3 py-1.5 text-muted">{r.phone ?? '—'}</td>
                      <td className="px-3 py-1.5 text-muted">{r.email ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {parseErrors.length > 0 && (
            <ul className="text-caption text-attention">
              {parseErrors.map((er, i) => (
                <li key={i}>{er}</li>
              ))}
            </ul>
          )}
          <p className="text-caption text-faint">{rows.length} row(s) ready.</p>
          {error && <p className="text-body text-concern">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving || rows.length === 0}>
              {saving ? 'Uploading…' : `Upload ${rows.length}`}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
