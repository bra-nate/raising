import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, Card, Field, Modal, Select } from '../../components/ui';
import { convertFirstTimer, getFirstTimer, listFirstTimerReports, listUsers } from '../../lib/api';
import { callOutcomeLabels, ftStatusMeta } from '../../lib/firstTimers';
import { relativeDate } from '../../lib/utils';
import type { FirstTimer, FirstTimerReport, User } from '../../types';

export default function PastorFirstTimerProfile() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [ft, setFt] = useState<FirstTimer | null>(null);
  const [reports, setReports] = useState<FirstTimerReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConvert, setShowConvert] = useState(false);

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
      <AppShell title="First-timer" back={{ to: '/pastor/first-timers', label: 'First-Timers' }}>
        <div className="p-8 text-body text-concern">{error || 'Not found.'}</div>
      </AppShell>
    );

  const s = ftStatusMeta[ft.status];
  const isConverted = ft.status === 'converted' || Boolean(ft.convertedMemberId);

  return (
    <AppShell
      title={`${ft.firstName} ${ft.lastName}`}
      subtitle={ft.serviceName ? `Joined at ${ft.serviceName}` : undefined}
      back={{ to: '/pastor/first-timers', label: 'First-Timers' }}
      actions={
        isConverted && ft.convertedMemberId ? (
          <Button variant="secondary" onClick={() => navigate(`/pastor/members/${ft.convertedMemberId}`)}>
            View member
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setShowConvert(true)}>
            Convert to Son/Daughter
          </Button>
        )
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

      <ConvertModal open={showConvert} onClose={() => setShowConvert(false)} firstTimerId={id} />
    </AppShell>
  );
}

function ConvertModal({ open, onClose, firstTimerId }: { open: boolean; onClose: () => void; firstTimerId: string }) {
  const navigate = useNavigate();
  const [leaders, setLeaders] = useState<User[]>([]);
  const [assignedLeaderId, setAssignedLeaderId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    listUsers()
      .then(({ data }) => setLeaders(data.filter((u) => u.role === 'leader' && u.isActive)))
      .catch(() => setError('Could not load leaders.'));
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!assignedLeaderId) {
      setError('Select a leader.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const member = await convertFirstTimer(firstTimerId, { assignedLeaderId });
      navigate(`/pastor/members/${member.id}`);
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Conversion failed.');
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Convert to Son/Daughter"
      description="Creates a member from this first-timer and assigns them to a leader."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Assigned leader">
          <Select value={assignedLeaderId} onChange={(e) => setAssignedLeaderId(e.target.value)} required>
            <option value="">Select a leader…</option>
            {leaders.map((l) => (
              <option key={l.id} value={l.id}>
                {l.fullName}
              </option>
            ))}
          </Select>
        </Field>
        {error && <p className="text-body text-concern">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Converting…' : 'Convert'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
