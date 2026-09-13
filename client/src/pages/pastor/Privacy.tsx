import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Card } from '../../components/ui';
import {
  getConfidentialAccessReview,
  listRetentionCandidates,
  redactForRetention,
} from '../../lib/api';
import { formatDate, relativeDate } from '../../lib/utils';
import { roleLabels } from '../../lib/roles';
import type { ConfidentialAccessReview, RetentionCandidate } from '../../types';

export default function Privacy() {
  const [retention, setRetention] = useState<{ retentionMonths: number; data: RetentionCandidate[] } | null>(null);
  const [access, setAccess] = useState<ConfidentialAccessReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([listRetentionCandidates(), getConfidentialAccessReview()]);
      setRetention(r);
      setAccess(a);
      setError('');
    } catch {
      setError('Could not load the privacy review.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleRedact(c: RetentionCandidate) {
    if (
      !confirm(
        `Redact ${c.name}? Contact details are cleared and report content is replaced. The record itself stays. This cannot be undone.`
      )
    ) {
      return;
    }
    setBusyId(c.id);
    try {
      await redactForRetention(c.type, c.id);
      await refresh();
    } catch (err) {
      alert(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Could not redact this record.'
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell
      title="Privacy"
      subtitle="What is held on people who never held an account."
      back={{ to: '/pastor', label: 'Dashboard' }}
    >
      {loading ? (
        <p className="text-body text-faint">Loading…</p>
      ) : error ? (
        <p className="text-body text-concern">{error}</p>
      ) : (
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-body font-semibold text-ink-2">Retention review</h2>
              <Link to="/pastor/settings" className="text-caption text-muted transition hover:text-accent hover:underline">
                {retention && retention.retentionMonths > 0
                  ? `Flagging after ${retention.retentionMonths} months`
                  : 'Retention is set to indefinite'}
              </Link>
            </div>
            <p className="mt-1 text-caption text-faint">
              Closed records with no activity for longer than the retention window. Nothing here is redacted
              automatically — each one is a deliberate decision.
            </p>

            {!retention || retention.data.length === 0 ? (
              <p className="mt-4 text-body text-faint">
                {retention && retention.retentionMonths === 0
                  ? 'Set a retention window in Settings to start flagging aged records.'
                  : 'Nothing has aged out.'}
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {retention.data.map((c) => (
                  <li key={`${c.type}-${c.id}`} className="rounded-card border border-hairline px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body font-medium text-ink-2">{c.name}</span>
                      <Badge tone="neutral">{c.type === 'member' ? 'Member' : 'First-timer'}</Badge>
                      {c.exemptReason && <Badge tone="concern">Exempt</Badge>}
                    </div>
                    <p className="mt-1 text-caption text-faint">
                      No activity for {c.monthsInactive} months · last {formatDate(c.lastActivityAt)} ·{' '}
                      {c.reportCount} record{c.reportCount === 1 ? '' : 's'}
                    </p>
                    {c.exemptReason ? (
                      <p className="mt-2 text-caption text-concern">{c.exemptReason}</p>
                    ) : (
                      <button
                        onClick={() => handleRedact(c)}
                        disabled={busyId === c.id}
                        className="mt-2 text-caption font-medium text-concern transition hover:underline disabled:opacity-50"
                      >
                        {busyId === c.id ? 'Redacting…' : 'Redact'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-body font-semibold text-ink-2">Confidential access review</h2>
            <p className="mt-1 text-caption text-faint">
              Who has opened confidential reports they did not write, over the last {access?.days ?? 90} days.
            </p>

            {!access || access.total === 0 ? (
              <p className="mt-4 text-body text-faint">No confidential reports have been opened.</p>
            ) : (
              <>
                <ul className="mt-4 space-y-2">
                  {access.byUser.map((u) => (
                    <li key={u.userId} className="flex items-center justify-between text-body">
                      <span className="text-ink-2">
                        {u.fullName}
                        <span className="ml-2 text-caption text-faint">{roleLabels[u.role]}</span>
                      </span>
                      <span className="text-caption text-faint">
                        {u.views} view{u.views === 1 ? '' : 's'} · last {relativeDate(u.lastAt)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-caption text-faint">
                  {access.total} access event{access.total === 1 ? '' : 's'} in total. Full entries are in the{' '}
                  <Link to="/pastor/logs" className="text-accent hover:underline">
                    activity log
                  </Link>
                  .
                </p>
              </>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-body font-semibold text-ink-2">Subject access requests</h2>
            <p className="mt-1 text-caption text-faint">
              Everything held on one person — details, every report, cases, and calls made before they joined —
              is exported from their own profile. Each export is recorded in the activity log.
            </p>
            <div className="mt-4 flex gap-4">
              <Link to="/pastor/members" className="text-caption font-medium text-accent transition hover:underline">
                Find a member
              </Link>
              <Link
                to="/pastor/first-timers"
                className="text-caption font-medium text-accent transition hover:underline"
              >
                Find a first-timer
              </Link>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
