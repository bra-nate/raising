import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, Card } from '../../components/ui';
import { IconPlus } from '../../components/ui/icons';
import { ReportModal } from '../../components/reports/ReportModal';
import { getMember, listMemberReports } from '../../lib/api';
import { formatDate, fullName, relativeDate, silenceMeta, statusMeta } from '../../lib/utils';
import type { Member, MemberReport } from '../../types';

export default function LeaderMemberProfile() {
  const { id = '' } = useParams();
  const [member, setMember] = useState<Member | null>(null);
  const [reports, setReports] = useState<MemberReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [m, r] = await Promise.all([getMember(id), listMemberReports(id)]);
      setMember(m);
      setReports(r.data);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 403 ? 'You do not have access to this member.' : 'Could not load this member.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <AppShell title="Member" back={{ to: '/leader/members', label: 'My Members' }}>
        <div className="h-40 animate-pulse rounded-card border border-hairline bg-surface/60" />
      </AppShell>
    );
  }

  if (error || !member) {
    return (
      <AppShell title="Member" back={{ to: '/leader/members', label: 'My Members' }}>
        <p className="text-body text-concern">{error || 'Not found.'}</p>
      </AppShell>
    );
  }

  const s = silenceMeta[member.silence ?? 'ok'];

  return (
    <AppShell
      title={fullName(member)}
      subtitle={member.group?.name}
      back={{ to: '/leader/members', label: 'My Members' }}
      actions={
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          <IconPlus className="h-4 w-4" />
          Add report
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Details */}
        <Card className="p-6 lg:col-span-1">
          <h2 className="text-caption uppercase tracking-wide text-faint">Details</h2>
          <dl className="mt-4 space-y-3 text-body">
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

        {/* Report timeline */}
        <div className="lg:col-span-2">
          <h2 className="mb-4 text-caption uppercase tracking-wide text-faint">Report timeline</h2>
          {reports.length === 0 ? (
            <div className="rounded-card border border-dashed border-hairline bg-surface/50 p-10 text-center">
              <p className="text-body font-medium text-ink-2">No reports yet</p>
              <p className="mt-1 text-caption text-faint">Submit the first report to start the timeline.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <ReportCard key={r.id} report={r} />
              ))}
            </div>
          )}
        </div>
      </div>

      <ReportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        memberId={member.id}
        memberName={fullName(member)}
        onSubmitted={() => {
          setModalOpen(false);
          refresh();
        }}
      />
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

function ReportCard({ report }: { report: MemberReport }) {
  const meta = statusMeta[report.statusTag];
  const redacted = !!report.redactedAt;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {report.isConfidential && <Badge tone="info">Confidential</Badge>}
          {report.isSafetyFlagged && <Badge tone="concern">Safety flag</Badge>}
        </div>
        <span className="shrink-0 text-caption text-faint">{formatDate(report.createdAt)}</span>
      </div>
      <p className={`mt-3 whitespace-pre-wrap text-body ${redacted ? 'italic text-faint' : 'text-ink-2'}`}>
        {report.content}
      </p>
      <div className="mt-3 flex items-center gap-2 text-caption text-faint">
        {report.leader?.fullName && <span>by {report.leader.fullName}</span>}
        {redacted && <span>· redacted {formatDate(report.redactedAt)}</span>}
      </div>
    </Card>
  );
}
