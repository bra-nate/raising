import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { JwtPayload } from '../lib/jwt';
import { writeLog } from './activity-log.service';
import { settingsService } from './settings.service';
import { notificationsService } from './notifications.service';

const MONTH = 30 * 86_400_000;

/**
 * raising holds sensitive notes about people who never created an account and
 * never agreed to anything. This service exists so the pastor can answer three
 * questions about any of them: what do we hold, why, and for how long.
 */

// ── Retention ────────────────────────────────────────────────────────────

export interface RetentionCandidate {
  type: 'member' | 'first_timer';
  id: string;
  name: string;
  lastActivityAt: Date;
  monthsInactive: number;
  reportCount: number;
  /** Safeguarding records are never candidates, whatever their age. */
  exemptReason: string | null;
}

function monthsSince(d: Date, now: Date): number {
  return Math.floor((now.getTime() - d.getTime()) / MONTH);
}

/**
 * Records whose last activity predates the retention window. Only people the
 * ministry has stopped working with are considered — a quiet active member is
 * a pastoral problem, not a retention one.
 */
async function listRetentionCandidates(now = new Date()) {
  const retentionMonths = await settingsService.getNumber('retentionMonths', 0);
  if (retentionMonths <= 0) return { retentionMonths, data: [] as RetentionCandidate[], total: 0 };

  const cutoff = new Date(now.getTime() - retentionMonths * MONTH);

  const [members, firstTimers] = await Promise.all([
    prisma.member.findMany({
      where: { isActive: false, retentionRedactedAt: null },
      include: {
        reports: { orderBy: { createdAt: 'desc' }, select: { createdAt: true, isSafetyFlagged: true } },
      },
    }),
    prisma.firstTimer.findMany({
      where: { status: { not: 'converted' }, retentionRedactedAt: null },
      include: { reports: { orderBy: { createdAt: 'desc' }, select: { createdAt: true } } },
    }),
  ]);

  const data: RetentionCandidate[] = [];

  for (const m of members) {
    const lastActivityAt = m.reports[0]?.createdAt ?? m.createdAt;
    if (lastActivityAt >= cutoff) continue;
    data.push({
      type: 'member',
      id: m.id,
      name: `${m.firstName} ${m.lastName}`,
      lastActivityAt,
      monthsInactive: monthsSince(lastActivityAt, now),
      reportCount: m.reports.length,
      exemptReason: m.reports.some((r) => r.isSafetyFlagged)
        ? 'Holds a safety-flagged report — retained permanently'
        : null,
    });
  }

  for (const f of firstTimers) {
    const lastActivityAt = f.reports[0]?.createdAt ?? f.visitDate;
    if (lastActivityAt >= cutoff) continue;
    data.push({
      type: 'first_timer',
      id: f.id,
      name: `${f.firstName} ${f.lastName}`,
      lastActivityAt,
      monthsInactive: monthsSince(lastActivityAt, now),
      reportCount: f.reports.length,
      exemptReason: null,
    });
  }

  data.sort((a, b) => b.monthsInactive - a.monthsInactive);
  return { retentionMonths, data, total: data.length };
}

/**
 * Redaction is always a deliberate act by the pastor — never something a cron
 * job does while nobody is looking. Contact details go; the pastoral record
 * stays as a redacted stub so history and audit remain intact.
 */
async function redactForRetention(user: JwtPayload, type: 'member' | 'first_timer', id: string) {
  const mode = (await settingsService.get('retentionMode')) ?? 'report_only';
  if (mode !== 'report_and_redact') {
    throw new AppError(403, 'Retention redaction is disabled — set retentionMode to report_and_redact');
  }

  if (type === 'member') {
    const member = await prisma.member.findUnique({
      where: { id },
      include: { reports: { select: { id: true, isSafetyFlagged: true } } },
    });
    if (!member) throw new AppError(404, 'Member not found');
    if (member.reports.some((r) => r.isSafetyFlagged)) {
      throw new AppError(403, 'This record holds a safety-flagged report and cannot be redacted');
    }

    await prisma.$transaction(async (tx) => {
      await tx.memberReport.updateMany({
        where: { memberId: id, isSafetyFlagged: false, redactedAt: null },
        data: { content: '[Redacted — retention]', redactedAt: new Date(), redactedById: user.id },
      });
      await tx.member.update({
        where: { id },
        data: { phone: null, email: null, address: null, retentionRedactedAt: new Date() },
      });
      await writeLog({
        userId: user.id,
        action: 'redacted_for_retention',
        entityType: 'member',
        entityId: id,
        metadata: { reportsRedacted: member.reports.length },
        tx,
      });
    });

    return { type, id, reportsRedacted: member.reports.length };
  }

  const ft = await prisma.firstTimer.findUnique({ where: { id }, include: { reports: { select: { id: true } } } });
  if (!ft) throw new AppError(404, 'First-timer not found');
  if (ft.status === 'converted') {
    throw new AppError(403, 'A converted first-timer is part of a member record and cannot be redacted here');
  }

  await prisma.$transaction(async (tx) => {
    await tx.firstTimerReport.updateMany({
      where: { firstTimerId: id },
      data: { content: '[Redacted — retention]' },
    });
    await tx.firstTimer.update({
      where: { id },
      data: { phone: null, email: null, address: null, retentionRedactedAt: new Date() },
    });
    await writeLog({
      userId: user.id,
      action: 'redacted_for_retention',
      entityType: 'first_timer',
      entityId: id,
      metadata: { reportsRedacted: ft.reports.length },
      tx,
    });
  });

  return { type, id, reportsRedacted: ft.reports.length };
}

/** Daily: tell the pastor what has aged out. Deduplicated to once per day. */
async function notifyRetentionDue(now = new Date()) {
  const { retentionMonths, data } = await listRetentionCandidates(now);
  if (retentionMonths <= 0) return { notified: 0 };

  const actionable = data.filter((c) => c.exemptReason === null);
  if (actionable.length === 0) return { notified: 0 };

  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const pastors = await prisma.user.findMany({ where: { role: 'pastor', isActive: true } });

  let notified = 0;
  for (const pastor of pastors) {
    const already = await prisma.notification.count({
      where: { userId: pastor.id, type: 'retention_due', createdAt: { gte: startOfDay } },
    });
    if (already > 0) continue;

    await notificationsService.createNotification({
      userId: pastor.id,
      type: 'retention_due',
      title: 'Records past retention',
      message: `${actionable.length} record(s) have had no activity for over ${retentionMonths} months.`,
    });
    notified += 1;
  }

  return { notified };
}

// ── Subject access export ────────────────────────────────────────────────

/**
 * Everything held on one person, for a subject access request. Confidential
 * and safety-flagged reports are included — the point of the export is
 * completeness — and the export itself is logged as an access event.
 */
async function exportPerson(user: JwtPayload, type: 'member' | 'first_timer', id: string) {
  if (type === 'member') {
    const member = await prisma.member.findUnique({
      where: { id },
      include: {
        assignedLeader: { select: { fullName: true } },
        group: { select: { name: true } },
        reports: { include: { leader: { select: { fullName: true } } }, orderBy: { createdAt: 'asc' } },
        cases: { orderBy: { createdAt: 'asc' } },
        convertedFromFirstTimer: { include: { reports: { orderBy: { createdAt: 'asc' } } } },
      },
    });
    if (!member) throw new AppError(404, 'Member not found');

    await writeLog({
      userId: user.id,
      action: 'exported_person_data',
      entityType: 'member',
      entityId: id,
      metadata: { reportCount: member.reports.length },
    });

    return {
      subject: {
        type: 'member',
        name: `${member.firstName} ${member.lastName}`,
        phone: member.phone,
        email: member.email,
        address: member.address,
        legalBasis: member.legalBasis,
        consentNote: member.consentNote,
        leader: member.assignedLeader.fullName,
        group: member.group?.name ?? null,
        addedOn: member.createdAt,
      },
      reports: member.reports.map((r) => ({
        date: r.createdAt,
        by: r.leader.fullName,
        statusTag: r.statusTag,
        content: r.content,
        isConfidential: r.isConfidential,
        isSafetyFlagged: r.isSafetyFlagged,
        redactedAt: r.redactedAt,
      })),
      cases: member.cases.map((c) => ({
        kind: c.kind,
        status: c.status,
        openedOn: c.createdAt,
        resolvedOn: c.resolvedAt,
        resolutionNote: c.resolutionNote,
      })),
      callsBeforeJoining:
        member.convertedFromFirstTimer?.reports.map((r) => ({
          date: r.createdAt,
          outcome: r.callOutcome,
          content: r.content,
        })) ?? [],
      exportedAt: new Date(),
    };
  }

  const ft = await prisma.firstTimer.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { fullName: true } },
      reports: { include: { reportedBy: { select: { fullName: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!ft) throw new AppError(404, 'First-timer not found');

  await writeLog({
    userId: user.id,
    action: 'exported_person_data',
    entityType: 'first_timer',
    entityId: id,
    metadata: { reportCount: ft.reports.length },
  });

  return {
    subject: {
      type: 'first_timer',
      name: `${ft.firstName} ${ft.lastName}`,
      phone: ft.phone,
      email: ft.email,
      address: ft.address,
      legalBasis: ft.legalBasis,
      consentNote: ft.consentNote,
      visitDate: ft.visitDate,
      serviceName: ft.serviceName,
      status: ft.status,
      assignedTo: ft.assignedTo?.fullName ?? null,
    },
    calls: ft.reports.map((r) => ({
      date: r.createdAt,
      by: r.reportedBy.fullName,
      outcome: r.callOutcome,
      content: r.content,
    })),
    exportedAt: new Date(),
  };
}

// ── Confidential access review ───────────────────────────────────────────

/**
 * Who has read confidential reports they did not write. These entries already
 * exist in the activity log; burying a safeguarding control in a paginated
 * feed is not a review.
 */
async function confidentialAccessReview(user: JwtPayload, days = 90) {
  const since = new Date(Date.now() - days * 86_400_000);

  const entries = await prisma.activityLog.findMany({
    where: { action: 'viewed_confidential_report', createdAt: { gte: since } },
    include: { user: { select: { id: true, fullName: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const byUser = new Map<string, { userId: string; fullName: string; role: string; views: number; lastAt: Date }>();
  for (const e of entries) {
    const row = byUser.get(e.userId) ?? {
      userId: e.userId,
      fullName: e.user.fullName,
      role: e.user.role,
      views: 0,
      lastAt: e.createdAt,
    };
    row.views += 1;
    if (e.createdAt > row.lastAt) row.lastAt = e.createdAt;
    byUser.set(e.userId, row);
  }

  await writeLog({
    userId: user.id,
    action: 'reviewed_confidential_access',
    entityType: 'settings',
    metadata: { days, entries: entries.length },
  });

  return {
    days,
    total: entries.length,
    byUser: [...byUser.values()].sort((a, b) => b.views - a.views),
    entries: entries.slice(0, 100).map((e) => ({
      id: e.id,
      at: e.createdAt,
      by: e.user.fullName,
      role: e.user.role,
      memberId: e.entityId,
      metadata: e.metadata,
    })),
  };
}

// ── Consent / legal basis ────────────────────────────────────────────────

async function setLegalBasis(
  user: JwtPayload,
  type: 'member' | 'first_timer',
  id: string,
  input: { legalBasis?: string; consentNote?: string }
) {
  const data = {
    ...(input.legalBasis !== undefined ? { legalBasis: input.legalBasis.trim() || null } : {}),
    ...(input.consentNote !== undefined ? { consentNote: input.consentNote.trim() || null } : {}),
  };
  if (Object.keys(data).length === 0) throw new AppError(400, 'Nothing to update');

  if (type === 'member') {
    const updated = await prisma.member.update({ where: { id }, data }).catch(() => null);
    if (!updated) throw new AppError(404, 'Member not found');
    await writeLog({ userId: user.id, action: 'updated_member', entityType: 'member', entityId: id, metadata: data });
    return updated;
  }

  const updated = await prisma.firstTimer.update({ where: { id }, data }).catch(() => null);
  if (!updated) throw new AppError(404, 'First-timer not found');
  await writeLog({
    userId: user.id,
    action: 'updated_member',
    entityType: 'first_timer',
    entityId: id,
    metadata: data,
  });
  return updated;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const v = value instanceof Date ? value.toISOString() : String(value);
  return `"${v.replace(/"/g, '""')}"`;
}

/**
 * The same export as JSON, flattened into one sheet. A subject access request
 * is usually answered to a person, not to a system, and a spreadsheet is what
 * they can actually read.
 */
async function exportPersonCsv(user: JwtPayload, type: 'member' | 'first_timer', id: string): Promise<string> {
  const data = await exportPerson(user, type, id);
  const lines: string[] = [['Section', 'Field', 'Value'].map(csvCell).join(',')];
  const push = (section: string, field: string, value: unknown) =>
    lines.push([section, field, value].map(csvCell).join(','));

  for (const [field, value] of Object.entries(data.subject)) push('Details', field, value);

  // Each group is empty for the type it does not apply to, so there is no
  // branching to get wrong.
  const reports = 'reports' in data ? (data.reports ?? []) : [];
  const cases = 'cases' in data ? (data.cases ?? []) : [];
  const priorCalls = 'callsBeforeJoining' in data ? (data.callsBeforeJoining ?? []) : [];
  const calls = 'calls' in data ? (data.calls ?? []) : [];

  reports.forEach((r, i) => {
    push(`Report ${i + 1}`, 'date', r.date);
    push(`Report ${i + 1}`, 'by', r.by);
    push(`Report ${i + 1}`, 'status', r.statusTag);
    push(`Report ${i + 1}`, 'content', r.content);
    push(`Report ${i + 1}`, 'confidential', r.isConfidential ? 'yes' : 'no');
    push(`Report ${i + 1}`, 'safety flagged', r.isSafetyFlagged ? 'yes' : 'no');
  });

  cases.forEach((c, i) => {
    push(`Case ${i + 1}`, 'kind', c.kind);
    push(`Case ${i + 1}`, 'status', c.status);
    push(`Case ${i + 1}`, 'opened', c.openedOn);
    push(`Case ${i + 1}`, 'resolved', c.resolvedOn);
    push(`Case ${i + 1}`, 'resolution', c.resolutionNote);
  });

  priorCalls.forEach((c, i) => {
    push(`Call before joining ${i + 1}`, 'date', c.date);
    push(`Call before joining ${i + 1}`, 'outcome', c.outcome);
    push(`Call before joining ${i + 1}`, 'content', c.content);
  });

  calls.forEach((c, i) => {
    push(`Call ${i + 1}`, 'date', c.date);
    push(`Call ${i + 1}`, 'by', c.by);
    push(`Call ${i + 1}`, 'outcome', c.outcome);
    push(`Call ${i + 1}`, 'content', c.content);
  });

  push('Export', 'generated', data.exportedAt);
  return lines.join('\r\n');
}

export const privacyService = {
  listRetentionCandidates,
  redactForRetention,
  notifyRetentionDue,
  exportPerson,
  exportPersonCsv,
  confidentialAccessReview,
  setLegalBasis,
};
