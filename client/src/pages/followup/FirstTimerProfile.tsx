import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, Card, Field, Modal, Select } from '../../components/ui';
import { IconPhone } from '../../components/ui/icons';
import { createFirstTimerReport, getFirstTimer, listFirstTimerReports } from '../../lib/api';
import { callOutcomeLabels, ftStatusMeta } from '../../lib/firstTimers';
import { relativeDate } from '../../lib/utils';
import type { CallOutcome, FirstTimer, FirstTimerReport } from '../../types';

const OUTCOMES: CallOutcome[] = ['answered', 'no_answer', 'callback_requested', 'interested', 'not_interested'];

export default function FollowUpFirstTimerProfile() {
  const { id = '' } = useParams();
  const [ft, setFt] = useState<FirstTimer | null>(null);
  const [reports, setReports] = useState<FirstTimerReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showLog, setShowLog] = useState(false);

  async function reload() {
    const [f, r] = await Promise.all([getFirstTimer(id), listFirstTimerReports(id)]);
    setFt(f);
    setReports(r.data);
  }

  useEffect(() => {
    reload()
      .catch(() => setError('Could not load this first-timer.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading)
    return (
      <AppShell title="First-timer">
        <div className="p-8 text-body text-faint">Loading…</div>
      </AppShell>
    );
  if (error || !ft)
    return (
      <AppShell title="First-timer" back={{ to: '/followup/first-timers', label: 'First-Timers' }}>
        <div className="p-8 text-body text-concern">{error || 'Not found.'}</div>
      </AppShell>
    );

  const s = ftStatusMeta[ft.status];

  return (
    <AppShell
      title={`${ft.firstName} ${ft.lastName}`}
      subtitle={ft.serviceName ? `Joined at ${ft.serviceName}` : undefined}
      back={{ to: '/followup/first-timers', label: 'First-Timers' }}
      actions={
        <Button variant="primary" onClick={() => setShowLog(true)}>
          <IconPhone className="h-4 w-4" />
          Log call
        </Button>
      }
    >
      <Card className="mb-6 max-w-lg p-6">
        <div className="flex items-center gap-2">
          <Badge tone={s.tone}>{s.label}</Badge>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-body">
          <div>
            <dt className="text-caption text-faint">Phone</dt>
            <dd className="text-ink-2">{ft.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-caption text-faint">Email</dt>
            <dd className="text-ink-2">{ft.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-caption text-faint">Visit date</dt>
            <dd className="text-ink-2">{relativeDate(ft.visitDate)}</dd>
          </div>
          <div>
            <dt className="text-caption text-faint">Assigned to</dt>
            <dd className="text-ink-2">{ft.assignedTo?.fullName ?? 'Unassigned'}</dd>
          </div>
        </dl>
      </Card>

      <h2 className="mb-3 text-heading-sm font-semibold text-ink-2">Call history</h2>
      {reports.length === 0 ? (
        <p className="text-body text-muted">No calls logged yet.</p>
      ) : (
        <ol className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-card border border-hairline bg-surface p-4">
              <div className="flex items-center justify-between">
                <Badge tone="info">{callOutcomeLabels[r.callOutcome] ?? r.callOutcome}</Badge>
                <span className="text-caption text-faint">{relativeDate(r.createdAt)}</span>
              </div>
              {r.content && <p className="mt-2 text-body text-muted">{r.content}</p>}
              {r.reportedBy && <p className="mt-1 text-caption text-faint">by {r.reportedBy.fullName}</p>}
            </li>
          ))}
        </ol>
      )}

      <LogCallModal open={showLog} onClose={() => setShowLog(false)} firstTimerId={id} onSaved={reload} />
    </AppShell>
  );
}

function LogCallModal({
  open,
  onClose,
  firstTimerId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  firstTimerId: string;
  onSaved: () => Promise<void>;
}) {
  const [callOutcome, setCallOutcome] = useState<CallOutcome>('answered');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createFirstTimerReport({ firstTimerId, callOutcome, content: content.trim() || undefined });
      await onSaved();
      setContent('');
      setCallOutcome('answered');
      onClose();
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not log the call.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Log a call" description="Logging a call assigns this first-timer to you.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Outcome">
          <Select value={callOutcome} onChange={(e) => setCallOutcome(e.target.value as CallOutcome)}>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {callOutcomeLabels[o]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" hint="Optional">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="w-full rounded-input border border-border bg-surface px-3.5 py-2.5 text-body text-ink-2 outline-none transition placeholder:text-faint focus:border-info focus:shadow-focus"
          />
        </Field>
        {error && <p className="text-body text-concern">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save call'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
