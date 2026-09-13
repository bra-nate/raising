import { prisma } from '../lib/prisma';
import { settingsService } from './settings.service';
import { membersService } from './members.service';

const DAY = 86_400_000;

/** Median, not mean — one visitor contacted after six months should not move the number. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The last `count` month keys, oldest first, so a trend reads left to right. */
function recentMonths(now: Date, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    keys.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return keys;
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / DAY);
}

function round(n: number | null, places = 1): number | null {
  return n === null ? null : Number(n.toFixed(places));
}

/**
 * Outcome metrics for the pastor. Every figure answers "are we getting better
 * at this", not "how much happened".
 *
 * ponytail: computed in JS over full table reads. Correct and readable at one
 * congregation's scale; move to grouped SQL if a church ever outgrows it.
 */
async function getMetrics(now = new Date(), monthsBack = 6) {
  const thresholdDays = await settingsService.getNumber('reportThresholdDays', 14);
  const months = recentMonths(now, monthsBack);
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1), 1));

  const [firstTimers, members, leaders, groups, resolvedCases, openCases] = await Promise.all([
    prisma.firstTimer.findMany({
      include: {
        assignedTo: { select: { id: true, fullName: true } },
        reports: { orderBy: { createdAt: 'asc' }, take: 1, select: { createdAt: true } },
      },
    }),
    prisma.member.findMany({
      where: { isActive: true },
      select: { id: true, assignedLeaderId: true, groupId: true, lastReportDate: true },
    }),
    prisma.user.findMany({ where: { role: 'leader', isActive: true }, select: { id: true, fullName: true } }),
    prisma.group.findMany({ select: { id: true, name: true } }),
    prisma.case.findMany({
      where: { status: 'resolved', resolvedAt: { not: null } },
      select: { kind: true, createdAt: true, resolvedAt: true },
    }),
    prisma.case.findMany({
      where: { status: { in: ['open', 'acknowledged'] } },
      select: { memberId: true, kind: true, createdAt: true },
    }),
  ]);

  // ── First-contact latency ──────────────────────────────────────────────
  const contacted = firstTimers.filter((f) => f.reports.length > 0);
  const latencies = contacted.map((f) => daysBetween(f.visitDate, f.reports[0].createdAt));

  const latencyByMonth = months.map((key) => {
    const inMonth = contacted.filter((f) => monthKey(f.visitDate) === key);
    return {
      month: key,
      medianDays: round(median(inMonth.map((f) => daysBetween(f.visitDate, f.reports[0].createdAt)))),
      contacted: inMonth.length,
    };
  });

  const neverContacted = firstTimers.filter((f) => f.reports.length === 0 && f.status !== 'converted').length;

  // ── Conversion ─────────────────────────────────────────────────────────
  const conversionByMonth = months.map((key) => {
    const visited = firstTimers.filter((f) => monthKey(f.visitDate) === key);
    const converted = visited.filter((f) => f.status === 'converted').length;
    return {
      month: key,
      visitors: visited.length,
      converted,
      rate: visited.length === 0 ? null : round((converted / visited.length) * 100),
    };
  });

  const byAssignee = new Map<string, { userId: string; fullName: string; assigned: number; converted: number }>();
  for (const f of firstTimers) {
    if (!f.assignedTo) continue;
    const row = byAssignee.get(f.assignedTo.id) ?? {
      userId: f.assignedTo.id,
      fullName: f.assignedTo.fullName,
      assigned: 0,
      converted: 0,
    };
    row.assigned += 1;
    if (f.status === 'converted') row.converted += 1;
    byAssignee.set(f.assignedTo.id, row);
  }
  const conversionByAssignee = [...byAssignee.values()]
    .map((r) => ({ ...r, rate: r.assigned === 0 ? null : round((r.converted / r.assigned) * 100) }))
    .sort((a, b) => b.assigned - a.assigned);

  // ── Concern resolution ─────────────────────────────────────────────────
  const resolutionDays = (kind?: 'concern' | 'safety') =>
    resolvedCases
      .filter((c) => (kind ? c.kind === kind : true))
      .map((c) => daysBetween(c.createdAt, c.resolvedAt!));

  const caseResolution = {
    medianDaysOverall: round(median(resolutionDays())),
    medianDaysConcern: round(median(resolutionDays('concern'))),
    medianDaysSafety: round(median(resolutionDays('safety'))),
    resolved: resolvedCases.length,
    open: openCases.length,
    oldestOpenDays: round(
      openCases.length === 0 ? null : Math.max(...openCases.map((c) => daysBetween(c.createdAt, now)))
    ),
    byMonth: months.map((key) => {
      const inMonth = resolvedCases.filter((c) => monthKey(c.resolvedAt!) === key);
      return {
        month: key,
        resolved: inMonth.length,
        medianDays: round(median(inMonth.map((c) => daysBetween(c.createdAt, c.resolvedAt!)))),
      };
    }),
  };

  // ── Leader reporting consistency ───────────────────────────────────────
  // A cycle is one threshold window. A leader is consistent when each of their
  // members was reported on in each cycle.
  const cycles = Math.min(6, Math.max(1, Math.floor(daysBetween(windowStart, now) / thresholdDays)));
  const reportsInWindow = await prisma.memberReport.findMany({
    where: { createdAt: { gte: new Date(now.getTime() - cycles * thresholdDays * DAY) } },
    select: { memberId: true, leaderId: true, createdAt: true },
  });

  const leaderConsistency = leaders
    .map((leader) => {
      const theirMembers = members.filter((m) => m.assignedLeaderId === leader.id);
      if (theirMembers.length === 0) {
        return { userId: leader.id, fullName: leader.fullName, members: 0, rate: null, trend: [] as (number | null)[] };
      }

      const trend: (number | null)[] = [];
      for (let c = cycles - 1; c >= 0; c -= 1) {
        const end = new Date(now.getTime() - c * thresholdDays * DAY);
        const start = new Date(end.getTime() - thresholdDays * DAY);
        const reported = new Set(
          reportsInWindow
            .filter((r) => r.leaderId === leader.id && r.createdAt >= start && r.createdAt < end)
            .map((r) => r.memberId)
        );
        const covered = theirMembers.filter((m) => reported.has(m.id)).length;
        trend.push(round((covered / theirMembers.length) * 100));
      }

      const known = trend.filter((t): t is number => t !== null);
      return {
        userId: leader.id,
        fullName: leader.fullName,
        members: theirMembers.length,
        rate: known.length === 0 ? null : round(known.reduce((a, b) => a + b, 0) / known.length),
        trend,
      };
    })
    .sort((a, b) => (a.rate ?? -1) - (b.rate ?? -1));

  // ── Group care risk ────────────────────────────────────────────────────
  const membersWithOpenCase = new Set(openCases.map((c) => c.memberId));
  const riskFor = (scoped: typeof members) => {
    const silent = scoped.filter(
      (m) => membersService.computeSilence(m.lastReportDate, thresholdDays) !== 'ok'
    ).length;
    const cased = scoped.filter((m) => membersWithOpenCase.has(m.id)).length;
    return {
      members: scoped.length,
      silent,
      openCases: cased,
      silenceRate: scoped.length === 0 ? null : round((silent / scoped.length) * 100),
    };
  };

  const groupRisk = [
    ...groups.map((g) => ({
      groupId: g.id,
      name: g.name,
      ...riskFor(members.filter((m) => m.groupId === g.id)),
    })),
    { groupId: null, name: 'No group', ...riskFor(members.filter((m) => m.groupId === null)) },
  ]
    .filter((g) => g.members > 0)
    .sort((a, b) => (b.silenceRate ?? -1) - (a.silenceRate ?? -1));

  return {
    months,
    firstContact: {
      medianDays: round(median(latencies)),
      contacted: contacted.length,
      neverContacted,
      byMonth: latencyByMonth,
    },
    conversion: { byMonth: conversionByMonth, byAssignee: conversionByAssignee },
    caseResolution,
    leaderConsistency: { cycles, cycleDays: thresholdDays, leaders: leaderConsistency },
    groupRisk,
  };
}

function csvCell(value: string | number | null | undefined): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/** The metric tables flattened into one sheet, so the numbers can be checked. */
async function exportCsv(now = new Date()): Promise<string> {
  const m = await getMetrics(now);
  const lines: string[] = [['Section', 'Key', 'Metric', 'Value'].map(csvCell).join(',')];

  const push = (section: string, key: string, metric: string, value: string | number | null) =>
    lines.push([section, key, metric, value].map(csvCell).join(','));

  push('First contact', 'overall', 'Median days', m.firstContact.medianDays);
  push('First contact', 'overall', 'Never contacted', m.firstContact.neverContacted);
  for (const r of m.firstContact.byMonth) push('First contact', r.month, 'Median days', r.medianDays);

  for (const r of m.conversion.byMonth) push('Conversion', r.month, 'Rate %', r.rate);
  for (const r of m.conversion.byAssignee) push('Conversion', r.fullName, 'Rate %', r.rate);

  push('Case resolution', 'overall', 'Median days', m.caseResolution.medianDaysOverall);
  push('Case resolution', 'concern', 'Median days', m.caseResolution.medianDaysConcern);
  push('Case resolution', 'safety', 'Median days', m.caseResolution.medianDaysSafety);
  push('Case resolution', 'open', 'Oldest open days', m.caseResolution.oldestOpenDays);

  for (const l of m.leaderConsistency.leaders) push('Leader consistency', l.fullName, 'Rate %', l.rate);
  for (const g of m.groupRisk) push('Group risk', g.name, 'Silence rate %', g.silenceRate);

  return lines.join('\r\n');
}

export const metricsService = { getMetrics, exportCsv };
