import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Card, Select, SkeletonRows } from '../../components/ui';
import { assignFirstTimer, getFollowUpQueue } from '../../lib/api';
import { fullName, relativeDate } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';
import type { FollowUpQueue, QueueEntry } from '../../types';

const outcomeLabels: Record<string, string> = {
  answered: 'answered',
  no_answer: 'no answer',
  callback_requested: 'callback requested',
  interested: 'interested',
  not_interested: 'not interested',
};

export default function FollowUpDashboard() {
  const { user } = useAuth();
  const firstName = user?.fullName.split(' ')[0] ?? 'there';
  const isLead = user?.role === 'followup_team_lead' || user?.role === 'pastor';

  const [queue, setQueue] = useState<FollowUpQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setQueue(await getFollowUpQueue());
      setError('');
    } catch {
      setError('Could not load the queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAssign(id: string, assignedToId: string) {
    try {
      await assignFirstTimer(id, assignedToId || null);
      await refresh();
    } catch {
      alert('Could not assign this visitor.');
    }
  }

  const nextContact = queue?.overdue[0] ?? queue?.callbacks[0] ?? queue?.dueToday[0] ?? queue?.unassigned[0];
  const nextContactReason = queue?.overdue[0]
    ? 'This follow-up is overdue.'
    : queue?.callbacks[0]
      ? 'A requested callback is due.'
      : queue?.dueToday[0]
        ? 'This follow-up is due today.'
        : 'This visitor still needs an owner.';

  return (
    <AppShell
      title="Dashboard"
      subtitle={isLead ? 'The team’s queue and where it stands.' : 'Your queue for today.'}
    >
      {error ? (
        <p className="text-body text-concern">{error}</p>
      ) : loading ? (
        <SkeletonRows rows={6} className="p-0" />
      ) : queue ? (
        <>
          <section className="rounded-cardlg bg-ink px-6 py-7 text-canvas shadow-feature sm:px-8 sm:py-9">
            <p className="text-caption font-medium uppercase tracking-[0.16em] text-canvas/65">Welcome, {firstName} · next contact</p>
            <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              {nextContact ? (
                <div>
                  <h2 className="text-heading font-semibold text-canvas">{fullName(nextContact)}</h2>
                  <p className="mt-2 text-body text-canvas/70">
                    {nextContactReason} Visited {relativeDate(nextContact.visitDate)}.
                  </p>
                </div>
              ) : (
                <div>
                  <h2 className="text-heading font-semibold text-canvas">The queue is clear</h2>
                  <p className="mt-2 text-body text-canvas/70">No calls or assignments need attention right now.</p>
                </div>
              )}
              <Link
                to={nextContact ? `/followup/first-timers/${nextContact.id}` : '/followup/first-timers'}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-btn bg-canvas px-5 py-2.5 text-body font-semibold text-ink transition hover:bg-canvas/90 focus:outline-none focus-visible:shadow-focus"
              >
                {nextContact ? 'Open contact' : 'View all first-timers'}
              </Link>
            </div>
          </section>

          <dl className="mt-6 grid grid-cols-2 divide-x divide-y divide-hairline border-y border-hairline sm:grid-cols-4 sm:divide-y-0">
            <Stat label="Due today" value={queue.counts.dueToday} tone="attention" />
            <Stat label="Overdue" value={queue.counts.overdue} tone="concern" />
            <Stat label="Callbacks due" value={queue.counts.callbacks} tone="attention" />
            <Stat label="Unassigned" value={queue.counts.unassigned} />
          </dl>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <QueueList
              title="Overdue"
              entries={queue.overdue}
              empty="Nothing overdue. The team is current."
              assignees={isLead ? queue.assignees : undefined}
              onAssign={handleAssign}
            />
            <QueueList
              title="Due today"
              entries={queue.dueToday}
              empty="Nothing due today."
              assignees={isLead ? queue.assignees : undefined}
              onAssign={handleAssign}
            />
            <QueueList
              title="Callbacks due"
              entries={queue.callbacks}
              empty="No callbacks outstanding."
              assignees={isLead ? queue.assignees : undefined}
              onAssign={handleAssign}
            />

            <QueueList
              title="Callbacks scheduled"
              entries={queue.callbacksScheduled}
              empty="Nothing booked ahead."
              assignees={isLead ? queue.assignees : undefined}
              onAssign={handleAssign}
            />

            <Card className="p-5">
              <h2 className="mb-4 text-body font-semibold text-ink-2">Waiting to be contacted</h2>
              <dl className="space-y-2">
                <AgeRow label="0–2 days" value={queue.aging.d0_2} />
                <AgeRow label="3–7 days" value={queue.aging.d3_7} />
                <AgeRow label="8–14 days" value={queue.aging.d8_14} />
                <AgeRow label="15+ days" value={queue.aging.d15plus} tone="concern" />
              </dl>

              {isLead && queue.workload.length > 0 && (
                <>
                  <h2 className="mb-3 mt-6 text-body font-semibold text-ink-2">Workload</h2>
                  <ul className="space-y-2">
                    {queue.workload.map((w) => (
                      <li key={w.userId} className="flex items-center justify-between text-body">
                        <span className="text-muted">{w.fullName}</span>
                        <span className="text-caption text-faint">
                          {w.open} open{w.overdue > 0 && ` · ${w.overdue} overdue`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </div>

          <Link
            to="/followup/first-timers"
            className="mt-6 flex items-center justify-between rounded-cardlg border border-hairline bg-surface px-6 py-4 text-left transition hover:border-accent/40 hover:shadow-elevated"
          >
            <span className="text-body font-medium text-ink-2">All first-timers</span>
            <span className="text-caption text-faint">{queue.counts.total} in the queue</span>
          </Link>
        </>
      ) : null}
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'attention' | 'concern' }) {
  const colour = value === 0 ? 'text-ink-2' : tone === 'concern' ? 'text-concern' : tone === 'attention' ? 'text-attention' : 'text-ink-2';
  return (
    <div className="px-4 py-4 first:pl-0 sm:px-6 sm:first:pl-0">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className={`mt-1 text-heading font-semibold ${colour}`}>{value}</dd>
    </div>
  );
}

function AgeRow({ label, value, tone }: { label: string; value: number; tone?: 'concern' }) {
  return (
    <div className="flex items-center justify-between text-body">
      <dt className="text-muted">{label}</dt>
      <dd className={value > 0 && tone === 'concern' ? 'font-medium text-concern' : 'text-ink-2'}>{value}</dd>
    </div>
  );
}

function QueueList({
  title,
  entries,
  empty,
  assignees,
  onAssign,
}: {
  title: string;
  entries: QueueEntry[];
  empty: string;
  /** Present only for a lead or pastor — a team member gets no assign control. */
  assignees?: { id: string; fullName: string }[];
  onAssign: (id: string, assignedToId: string) => void;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-body font-semibold text-ink-2">{title}</h2>
        {entries.length > 0 && <span className="text-caption text-faint">{entries.length}</span>}
      </div>

      {entries.length === 0 ? (
        <p className="text-body text-faint">{empty}</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {entries.map((e) => (
            <li key={e.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/followup/first-timers/${e.id}`}
                  className="text-body font-medium text-ink-2 hover:text-accent hover:underline"
                >
                  {fullName(e)}
                </Link>
                {e.ageDays > 14 && <Badge tone="concern">{e.ageDays}d</Badge>}
              </div>

              <p className="mt-1 text-caption text-faint">
                Visited {relativeDate(e.visitDate)}
                {e.serviceName && ` · ${e.serviceName}`}
                {e.lastAttemptAt
                  ? ` · ${e.attempts} attempt${e.attempts === 1 ? '' : 's'}, last ${relativeDate(e.lastAttemptAt)}${
                      e.lastOutcome ? ` (${outcomeLabels[e.lastOutcome] ?? e.lastOutcome})` : ''
                    }`
                  : ' · never called'}
                {e.callbackAt && ` · call back ${relativeDate(e.callbackAt)}`}
              </p>

              <p className="mt-1 text-caption text-faint">
                {e.assignedTo ? e.assignedTo.fullName : 'Unassigned'}
              </p>

              {assignees && (
                <Select
                  className="mt-2"
                  value={e.assignedToId ?? ''}
                  onChange={(ev) => onAssign(e.id, ev.target.value)}
                  aria-label={`Assign ${fullName(e)}`}
                >
                  <option value="">Unassigned</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fullName}
                    </option>
                  ))}
                </Select>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
