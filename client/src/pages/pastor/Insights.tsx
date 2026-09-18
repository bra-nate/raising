import { useEffect, useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, Card, SkeletonRows } from '../../components/ui';
import { exportMetricsCsv, getMetrics } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import type { Metrics } from '../../types';

/** "2026-03" → "Mar". The year is implied by the run of months. */
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString(undefined, { month: 'short', timeZone: 'UTC' });
}

export default function Insights() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getMetrics()
      .then(setMetrics)
      .catch(() => setError('Could not load metrics.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleExport() {
    try {
      const blob = await exportMetricsCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'raising-metrics.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Could not export the metrics.');
    }
  }

  return (
    <AppShell
      title="Insights"
      subtitle="Whether the care is getting better, not how much of it happened."
      back={{ to: user?.role === 'superadmin' ? '/admin' : '/pastor', label: 'Dashboard' }}
      actions={
        <Button variant="secondary" onClick={handleExport} disabled={!metrics}>
          Export CSV
        </Button>
      }
    >
      {loading ? (
        <SkeletonRows rows={4} className="p-0" />
      ) : error ? (
        <p className="text-body text-concern">{error}</p>
      ) : metrics ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Headline
              label="First contact"
              value={metrics.firstContact.medianDays}
              unit="days"
              caption={`median · ${metrics.firstContact.neverContacted} never called`}
            />
            <Headline
              label="Case resolution"
              value={metrics.caseResolution.medianDaysOverall}
              unit="days"
              caption={`median · ${metrics.caseResolution.open} open now`}
            />
            <Headline
              label="Oldest open case"
              value={metrics.caseResolution.oldestOpenDays}
              unit="days"
              caption="nothing should sit here long"
              tone={
                (metrics.caseResolution.oldestOpenDays ?? 0) > 30
                  ? 'concern'
                  : (metrics.caseResolution.oldestOpenDays ?? 0) > 14
                    ? 'attention'
                    : undefined
              }
            />
            <Headline
              label="Conversion"
              value={metrics.conversion.byMonth[metrics.conversion.byMonth.length - 1]?.rate ?? null}
              unit="%"
              caption="this month"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="text-body font-semibold text-ink-2">Days to first contact</h2>
              <p className="mt-1 text-caption text-faint">
                How long a visitor waits for the first call. Lower is better.
              </p>
              <TrendBars
                rows={metrics.firstContact.byMonth.map((r) => ({
                  label: monthLabel(r.month),
                  value: r.medianDays,
                  suffix: r.medianDays === null ? 'no data' : `${r.medianDays}d`,
                }))}
                invert
              />
            </Card>

            <Card className="p-5">
              <h2 className="text-body font-semibold text-ink-2">Conversion rate</h2>
              <p className="mt-1 text-caption text-faint">
                Visitors in each month who went on to join. Higher is better.
              </p>
              <TrendBars
                rows={metrics.conversion.byMonth.map((r) => ({
                  label: monthLabel(r.month),
                  value: r.rate,
                  suffix: r.rate === null ? 'no visitors' : `${r.rate}% of ${r.visitors}`,
                }))}
                max={100}
              />
            </Card>

            <Card className="p-5">
              <h2 className="text-body font-semibold text-ink-2">Leader reporting consistency</h2>
              <p className="mt-1 text-caption text-faint">
                Share of each leader&rsquo;s members reported on per {metrics.leaderConsistency.cycleDays}-day
                cycle, averaged over {metrics.leaderConsistency.cycles}. Weakest first.
              </p>
              {metrics.leaderConsistency.leaders.length === 0 ? (
                <p className="mt-4 text-body text-faint">No leaders yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {metrics.leaderConsistency.leaders.map((l) => (
                    <li key={l.userId}>
                      <div className="flex items-center justify-between text-body">
                        <span className="text-ink-2">{l.fullName}</span>
                        <span className="text-caption text-faint">
                          {l.rate === null ? 'no members' : `${l.rate}% · ${l.members} members`}
                        </span>
                      </div>
                      <Bar value={l.rate} max={100} tone={toneForRate(l.rate)} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-body font-semibold text-ink-2">Care risk by group</h2>
              <p className="mt-1 text-caption text-faint">
                Share of each group&rsquo;s members with no recent report. Highest risk first.
              </p>
              {metrics.groupRisk.length === 0 ? (
                <p className="mt-4 text-body text-faint">No members yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {metrics.groupRisk.map((g) => (
                    <li key={g.groupId ?? 'none'}>
                      <div className="flex items-center justify-between text-body">
                        <span className="text-ink-2">{g.name}</span>
                        <span className="flex items-center gap-2 text-caption text-faint">
                          {g.openCases > 0 && <Badge tone="concern">{g.openCases} open</Badge>}
                          {g.silent}/{g.members} silent
                        </span>
                      </div>
                      <Bar value={g.silenceRate} max={100} tone={toneForSilence(g.silenceRate)} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="text-body font-semibold text-ink-2">Conversion by caller</h2>
            {metrics.conversion.byAssignee.length === 0 ? (
              <p className="mt-4 text-body text-faint">No first-timers assigned yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[420px] text-left">
                  <thead>
                    <tr className="border-b border-hairline text-caption uppercase tracking-wide text-faint">
                      <th className="py-2 font-medium">Caller</th>
                      <th className="py-2 font-medium">Assigned</th>
                      <th className="py-2 font-medium">Converted</th>
                      <th className="py-2 font-medium">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.conversion.byAssignee.map((a) => (
                      <tr key={a.userId} className="border-b border-hairline last:border-0">
                        <td className="py-2 text-body text-ink-2">{a.fullName}</td>
                        <td className="py-2 text-body text-muted">{a.assigned}</td>
                        <td className="py-2 text-body text-muted">{a.converted}</td>
                        <td className="py-2 text-body font-medium text-ink-2">
                          {a.rate === null ? '—' : `${a.rate}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}

type Tone = 'good' | 'attention' | 'concern' | undefined;

function toneForRate(rate: number | null): Tone {
  if (rate === null) return undefined;
  if (rate >= 80) return 'good';
  if (rate >= 50) return 'attention';
  return 'concern';
}

function toneForSilence(rate: number | null): Tone {
  if (rate === null) return undefined;
  if (rate >= 50) return 'concern';
  if (rate >= 20) return 'attention';
  return 'good';
}

function Headline({
  label,
  value,
  unit,
  caption,
  tone,
}: {
  label: string;
  value: number | null;
  unit: string;
  caption: string;
  tone?: Tone;
}) {
  const colour = tone === 'concern' ? 'text-concern' : tone === 'attention' ? 'text-attention' : 'text-ink-2';
  return (
    <Card className="p-5">
      <p className="text-caption uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-1 text-heading font-semibold ${colour}`}>
        {value === null ? '—' : value}
        {value !== null && <span className="ml-1 text-body font-normal text-faint">{unit}</span>}
      </p>
      <p className="mt-1 text-caption text-faint">{caption}</p>
    </Card>
  );
}

function Bar({ value, max, tone }: { value: number | null; max: number; tone: Tone }) {
  const pct = value === null ? 0 : Math.min(100, (value / max) * 100);
  const colour =
    tone === 'concern' ? 'bg-concern' : tone === 'attention' ? 'bg-attention' : tone === 'good' ? 'bg-good' : 'bg-accent';
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-pill bg-wash">
      <div className={`h-full rounded-pill ${colour}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * A month-by-month trend. `invert` marks metrics where lower is better, so the
 * colour still reads "good" when the bar is short.
 */
function TrendBars({
  rows,
  max,
  invert = false,
}: {
  rows: { label: string; value: number | null; suffix: string }[];
  max?: number;
  invert?: boolean;
}) {
  const values = rows.map((r) => r.value).filter((v): v is number => v !== null);
  const scale = max ?? Math.max(1, ...values);

  return (
    <ul className="mt-4 space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-center justify-between text-body">
            <span className="text-muted">{r.label}</span>
            <span className="text-caption text-faint">{r.suffix}</span>
          </div>
          <Bar
            value={r.value}
            max={scale}
            tone={
              r.value === null
                ? undefined
                : invert
                  ? r.value <= scale * 0.34
                    ? 'good'
                    : r.value <= scale * 0.67
                      ? 'attention'
                      : 'concern'
                  : 'good'
            }
          />
        </li>
      ))}
    </ul>
  );
}
