import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, Card } from '../../components/ui';
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
      <p className="mb-6 text-heading font-semibold text-ink-2">Welcome, {firstName}.</p>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-card border border-hairline bg-surface/60" />
          ))}
        </div>
      ) : error ? (
        <p className="text-body text-concern">{error}</p>
      ) : members.length === 0 ? (
        <EmptyState onAdd={() => navigate('/leader/members/new')} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => {
            const s = silenceMeta[m.silence ?? 'ok'];
            return (
              <Card key={m.id} interactive className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/leader/members/${m.id}`} className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} title={s.label} />
                      <span className="truncate text-body font-semibold text-ink-2 hover:text-accent">
                        {fullName(m)}
                      </span>
                    </span>
                    {m.group?.name && <span className="mt-0.5 block text-caption text-faint">{m.group.name}</span>}
                  </Link>
                  {m.latestStatus && <Badge tone={statusMeta[m.latestStatus].tone}>{statusMeta[m.latestStatus].label}</Badge>}
                </div>

                <div className="mt-4 flex items-center gap-1.5 text-caption text-muted">
                  <IconReports className="h-3.5 w-3.5" />
                  Last report: {relativeDate(m.lastReportDate)}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <Badge tone={s.tone}>{s.label}</Badge>
                  <Button variant="ghost" onClick={() => setReportFor(m)}>
                    Add report
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

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
