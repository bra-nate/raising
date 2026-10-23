import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button } from '../../components/ui';
import { CasesPanel } from '../../components/cases/CasesPanel';
import { IconPeople, IconPlus, IconReports } from '../../components/ui/icons';
import { ReportModal } from '../../components/reports/ReportModal';
import { listMembers } from '../../lib/api';
import { fullName, relativeDate, silenceMeta, statusMeta } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';
import type { Member } from '../../types';

export default function LeaderDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.fullName.split(' ')[0] ?? 'there';
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reportFor, setReportFor] = useState<Member | null>(null);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const { data } = await listMembers();
      setMembers(data);
    } catch {
      setError('Could not load your members.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const needAttention = members.filter((m) => m.silence !== 'ok').length;
  const nextMember = [...members].sort((a, b) => {
    const rank = { significant: 0, overdue: 1, ok: 2 };
    return rank[a.silence ?? 'ok'] - rank[b.silence ?? 'ok'];
  })[0];

  return (
    <AppShell
      title="Dashboard"
      subtitle={loading ? undefined : `${members.length} member${members.length === 1 ? '' : 's'} · ${needAttention} need attention`}
      actions={
        <Button variant="primary" onClick={() => navigate('/leader/members/new')}>
          <IconPlus className="h-4 w-4" />
          Add member
        </Button>
      }
    >
      {loading ? (
        <div className="h-48 animate-pulse rounded-cardlg bg-wash" />
      ) : error ? (
        <p className="text-body text-concern">{error}</p>
      ) : members.length === 0 ? (
        <EmptyState onAdd={() => navigate('/leader/members/new')} />
      ) : (
        <>
          {nextMember && (
            <section className="rounded-cardlg bg-ink px-6 py-7 text-canvas shadow-feature sm:px-8 sm:py-9">
              <p className="text-caption font-medium uppercase tracking-[0.16em] text-canvas/65">Welcome, {firstName} · next action</p>
              <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-caption text-canvas/65">Report due for</p>
                  <h2 className="mt-1 text-heading font-semibold text-canvas">{fullName(nextMember)}</h2>
                  <p className="mt-2 flex items-center gap-1.5 text-body text-canvas/70">
                    <IconReports className="h-4 w-4" />
                    Last report {relativeDate(nextMember.lastReportDate)}
                  </p>
                </div>
                <Button variant="primary" onClick={() => setReportFor(nextMember)}>
                  Add report
                </Button>
              </div>
            </section>
          )}

          <div className="mt-6 flex items-end justify-between gap-4 border-b border-hairline pb-3">
            <div>
              <h2 className="text-heading-sm font-semibold text-ink-2">People in your care</h2>
              <p className="mt-1 text-caption text-muted">{needAttention} of {members.length} need a recent report</p>
            </div>
            <Link to="/leader/members" className="text-caption font-medium text-accent hover:underline">View all</Link>
          </div>

          <ul className="divide-y divide-hairline">
            {members.slice(0, 8).map((m) => {
              const s = silenceMeta[m.silence ?? 'ok'];
              return (
                <li key={m.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <Link to={`/leader/members/${m.id}`} className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} title={s.label} />
                      <span className="truncate text-body font-semibold text-ink-2 hover:text-accent">{fullName(m)}</span>
                      {m.latestStatus && <Badge tone={statusMeta[m.latestStatus].tone}>{statusMeta[m.latestStatus].label}</Badge>}
                    </span>
                    <span className="mt-1 block text-caption text-faint">
                      {m.group?.name ? `${m.group.name} · ` : ''}Last report {relativeDate(m.lastReportDate)}
                    </span>
                  </Link>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <Badge tone={s.tone}>{s.label}</Badge>
                    <Button variant="ghost" onClick={() => setReportFor(m)}>Add report</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-6">
        <CasesPanel
          title="Your open cases"
          emptyText="No open cases on your members."
        />
      </div>

      {reportFor && (
        <ReportModal
          open={!!reportFor}
          onClose={() => setReportFor(null)}
          memberId={reportFor.id}
          memberName={fullName(reportFor)}
          onSubmitted={() => {
            setReportFor(null);
            refresh();
          }}
        />
      )}
    </AppShell>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-cardlg border border-dashed border-hairline bg-surface/50 px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-input bg-wash text-accent">
        <IconPeople className="h-6 w-6" />
      </span>
      <h2 className="mt-5 text-heading-sm font-semibold text-ink-2">No members yet</h2>
      <p className="mt-1.5 max-w-sm text-body text-muted">
        Add the people in your care to start tracking reports and silence.
      </p>
      <div className="mt-5">
        <Button variant="primary" onClick={onAdd}>
          <IconPlus className="h-4 w-4" />
          Add your first member
        </Button>
      </div>
    </div>
  );
}
