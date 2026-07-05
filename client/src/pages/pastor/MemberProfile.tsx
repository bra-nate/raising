import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, Card, Field, Modal } from '../../components/ui';
import { IconLock, IconPlus } from '../../components/ui/icons';
import { ReportModal } from '../../components/reports/ReportModal';
import {
  deleteMemberReport,
  getMember,
  getSettings,
  listFirstTimerReports,
  listMemberReports,
  redactMemberReport,
} from '../../lib/api';
import { callOutcomeLabels } from '../../lib/firstTimers';
import { formatDate, fullName, relativeDate, silenceMeta, statusMeta } from '../../lib/utils';
import type { FirstTimerReport, Member, MemberReport } from '../../types';

export default function PastorMemberProfile() {
  const { id = '' } = useParams();
  const [member, setMember] = useState<Member | null>(null);
  const [reports, setReports] = useState<MemberReport[]>([]);
  const [canModify, setCanModify] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [redactTarget, setRedactTarget] = useState<MemberReport | null>(null);
  const [preJoinCalls, setPreJoinCalls] = useState<FirstTimerReport[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [m, r, settings] = await Promise.all([getMember(id), listMemberReports(id), getSettings()]);
      setMember(m);
      setReports(r.data);
      setCanModify(settings.allowDeleteReports === 'true');
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 404 ? 'Member not found.' : 'Could not load this member.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Pre-conversion call history. A 403 (viewer not permitted) or any error
  // leaves the list empty so the section hides.
  useEffect(() => {
    const ftId = member?.convertedFromFirstTimerId;
    if (!ftId) return;
    listFirstTimerReports(ftId)
      .then((r) => setPreJoinCalls(r.data))
      .catch(() => setPreJoinCalls([]));
  }, [member?.convertedFromFirstTimerId]);

  async function handleDelete(report: MemberReport) {
    if (!confirm('Delete this report? The action is logged and cannot be undone.')) return;
    try {
      await deleteMemberReport(report.id);
      await refresh();
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not delete report.';
      alert(message);
    }
  }

  if (loading) {
    return (
      <AppShell title="Member" back={{ to: '/pastor/members', label: 'Members' }}>
        <div className="h-40 animate-pulse rounded-card border border-hairline bg-surface/60" />
      </AppShell>
    );
  }

  if (error || !member) {
    return (
      <AppShell title="Member" back={{ to: '/pastor/members', label: 'Members' }}>
        <p className="text-body text-concern">{error || 'Not found.'}</p>
      </AppShell>
    );
  }

  const s = silenceMeta[member.silence ?? 'ok'];

  return (
    <AppShell
      title={fullName(member)}
      subtitle={member.assignedLeader?.fullName ? `Led by ${member.assignedLeader.fullName}` : undefined}
      back={{ to: '/pastor/members', label: 'Members' }}
      actions={
        <Button variant="primary" onClick={() => setReportOpen(true)}>
          <IconPlus className="h-4 w-4" />
          Add report
        </Button>
      }
    >
      {member.convertedFromFirstTimer?.visitDate && (
        <div className="mb-6 rounded-card border border-info/30 bg-info/10 px-4 py-3 text-body text-ink-2">
          Joined as a first-timer on {relativeDate(member.convertedFromFirstTimer.visitDate)}.
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-1">
          <h2 className="text-caption uppercase tracking-wide text-faint">Details</h2>
          <dl className="mt-4 space-y-3 text-body">
            <Detail label="Leader" value={member.assignedLeader?.fullName} />
            <Detail label="Group" value={member.group?.name} />
            <Detail label="Phone" value={member.phone} />
            <Detail label="Email" value={member.email} />
            <Detail label="Address" value={member.address} />
            <div>
              <dt className="text-caption text-faint">Silence</dt>
              <dd className="mt-1">
                <Badge tone={s.tone}>{s.label}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-caption text-faint">Last report</dt>
              <dd className="mt-1 text-ink-2">{relativeDate(member.lastReportDate)}</dd>
            </div>
          </dl>
        </Card>

        <div className="lg:col-span-2">
          <h2 className="mb-4 text-caption uppercase tracking-wide text-faint">
            Full report history{reports.length > 0 && ` · ${reports.length}`}
          </h2>
          {reports.length === 0 ? (
            <div className="rounded-card border border-dashed border-hairline bg-surface/50 p-10 text-center">
              <p className="text-body font-medium text-ink-2">No reports yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <ReportCard
                  key={r.id}
                  report={r}
                  canModify={canModify}
                  onRedact={() => setRedactTarget(r)}
                  onDelete={() => handleDelete(r)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {preJoinCalls.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-heading-sm font-semibold text-ink-2">Call history before joining</h2>
          <ol className="space-y-3">
            {preJoinCalls.map((r) => (
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
        </section>
      )}

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        memberId={member.id}
        memberName={fullName(member)}
        onSubmitted={() => {
          setReportOpen(false);
          refresh();
        }}
      />

      {redactTarget && (
        <RedactModal
          report={redactTarget}
          onClose={() => setRedactTarget(null)}
          onDone={() => {
            setRedactTarget(null);
            refresh();
          }}
        />
      )}
    </AppShell>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-caption text-faint">{label}</dt>
      <dd className="mt-0.5 text-ink-2">{value || '—'}</dd>
    </div>
  );
}

function ReportCard({
  report,
  canModify,
  onRedact,
  onDelete,
}: {
  report: MemberReport;
  canModify: boolean;
  onRedact: () => void;
  onDelete: () => void;
}) {
  const meta = statusMeta[report.statusTag];
  const redacted = !!report.redactedAt;
  // Safety-flagged reports can never be redacted or deleted.
  const showActions = canModify && !report.isSafetyFlagged && !redacted;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {report.isConfidential && (
            <span className="inline-flex items-center gap-1 rounded-badge bg-info/10 px-1.5 py-0.5 text-caption font-medium text-info">
              <IconLock className="h-3 w-3" />
              Confidential
            </span>
          )}
          {report.isSafetyFlagged && <Badge tone="concern">Safety flag</Badge>}
        </div>
        <span className="shrink-0 text-caption text-faint">{formatDate(report.createdAt)}</span>
      </div>
      <p className={`mt-3 whitespace-pre-wrap text-body ${redacted ? 'italic text-faint' : 'text-ink-2'}`}>
        {report.content}
      </p>
      {redacted && report.redactionSummary && (
        <p className="mt-2 text-caption text-faint">Redaction note: {report.redactionSummary}</p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-caption text-faint">
          {report.leader?.fullName && `by ${report.leader.fullName}`}
          {redacted && ` · redacted ${formatDate(report.redactedAt)}`}
        </span>
        {showActions && (
          <span className="flex items-center gap-1">
            <Button variant="ghost" onClick={onRedact}>
              Redact
            </Button>
            <Button variant="danger" onClick={onDelete}>
              Delete
            </Button>
          </span>
        )}
      </div>
    </Card>
  );
}

function RedactModal({
  report,
  onClose,
  onDone,
}: {
  report: MemberReport;
  onClose: () => void;
  onDone: () => void;
}) {
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await redactMemberReport(report.id, summary);
      onDone();
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not redact report.';
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Redact report"
      description="The report content is replaced with [Redacted]. The row and audit trail are kept."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Redaction summary" hint="A short reason, kept on the record.">
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-input border border-border bg-surface px-3.5 py-2.5 text-body text-ink-2 outline-none transition placeholder:text-faint focus:border-info focus:shadow-focus"
            placeholder="Why is this being redacted?"
          />
        </Field>
        {error && <p className="text-body text-concern">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Redacting…' : 'Redact report'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
