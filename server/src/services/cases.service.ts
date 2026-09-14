import { CaseKind, CaseStatus, Prisma, StatusTag } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { JwtPayload } from '../lib/jwt';
import { writeLog } from './activity-log.service';
import { settingsService } from './settings.service';
import { notificationsService } from './notifications.service';

const CASE_INCLUDE = {
  member: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      assignedLeaderId: true,
      assignedLeader: { select: { id: true, fullName: true, role: true, isActive: true } },
    },
  },
  owner: { select: { fullName: true } },
  acknowledgedBy: { select: { fullName: true } },
  resolvedBy: { select: { fullName: true } },
} as const;

/** A case is live until it is resolved. */
const LIVE: CaseStatus[] = ['open', 'acknowledged'];

/**
 * Which kind of case a report warrants, if any. A safety flag always wins —
 * it carries the shorter fuse and the stricter close rules.
 */
export function caseKindFor(statusTag: StatusTag, isSafetyFlagged: boolean): CaseKind | null {
  if (isSafetyFlagged) return 'safety';
  if (statusTag === 'needs_attention' || statusTag === 'concern') return 'concern';
  return null;
}

/**
 * Open (or touch) the case a report warrants. Runs inside the report's own
 * transaction so a report never lands without its case.
 *
 * A second concern report on a member who already has a live concern case bumps
 * that case rather than opening a duplicate — the operational unit is the
 * member's situation, not the individual report.
 */
export async function openCaseForReport(
  tx: Prisma.TransactionClient,
  report: { id: string; statusTag: StatusTag; isSafetyFlagged: boolean; leaderId: string },
  memberId: string,
  dueDays: number
) {
  const kind = caseKindFor(report.statusTag, report.isSafetyFlagged);
  if (!kind) return null;

  const existing = await tx.case.findFirst({
    where: { memberId, kind, status: { in: LIVE } },
  });

  if (existing) {
    return tx.case.update({
      where: { id: existing.id },
      data: { reportCount: { increment: 1 } },
    });
  }

  const created = await tx.case.create({
    data: {
      kind,
      memberId,
      openedByReportId: report.id,
      // A safety case is due immediately; its clock is the acknowledgement timer.
      dueDate: kind === 'safety' ? new Date() : new Date(Date.now() + dueDays * 86_400_000),
    },
  });

  await writeLog({
    userId: report.leaderId,
    action: 'opened_case',
    entityType: 'case_record',
    entityId: created.id,
    metadata: { kind, memberId, reportId: report.id },
    tx,
  });

  return created;
}

/**
 * Leader → live cases on their own members. Pastor → everything.
 * Scoping is enforced here; query params never widen it.
 */
async function listCases(user: JwtPayload, opts: { status?: string; kind?: string; memberId?: string } = {}) {
  const where: Prisma.CaseWhereInput = {};

  if (opts.status === 'resolved') where.status = 'resolved';
  else if (opts.status === 'all') { /* no status filter */ }
  else where.status = { in: LIVE };

  if (opts.kind === 'safety' || opts.kind === 'concern') where.kind = opts.kind;
  if (opts.memberId) where.memberId = opts.memberId;

  if (user.role === 'leader') {
    where.member = { assignedLeaderId: user.id };
  }

  const rows = await prisma.case.findMany({
    where,
    include: CASE_INCLUDE,
    // Safety first, then oldest — the queue reads top-down.
    orderBy: [{ kind: 'desc' }, { createdAt: 'asc' }],
  });

  // The eligible owners travel with each case so the UI never has to guess —
  // and never offers a choice the service would reject.
  const pastors = await prisma.user.findMany({
    where: { role: 'pastor', isActive: true },
    select: { id: true, fullName: true },
    orderBy: { fullName: 'asc' },
  });

  const data = rows.map((c) => ({
    ...c,
    assignableOwners:
      c.kind === 'safety'
        ? pastors
        : [
            ...pastors,
            ...(c.member.assignedLeader?.isActive
              ? [{ id: c.member.assignedLeader.id, fullName: c.member.assignedLeader.fullName }]
              : []),
          ],
  }));

  return { data, total: data.length };
}

async function loadForUser(user: JwtPayload, id: string) {
  const found = await prisma.case.findUnique({ where: { id }, include: CASE_INCLUDE });
  if (!found) throw new AppError(404, 'Case not found');
  if (user.role === 'leader' && found.member.assignedLeaderId !== user.id) {
    throw new AppError(403, 'Forbidden');
  }
  return found;
}

async function getCase(user: JwtPayload, id: string) {
  return loadForUser(user, id);
}

/**
 * Safeguarding cases are pastor business. A leader may work their own concern
 * cases but may never acknowledge, reassign, or close a safety case — including
 * one raised on their own member.
 */
function assertMayAct(user: JwtPayload, kind: CaseKind) {
  if (kind === 'safety' && user.role !== 'pastor') {
    throw new AppError(403, 'Only a pastor can act on a safety case');
  }
}

async function acknowledgeCase(user: JwtPayload, id: string) {
  const existing = await loadForUser(user, id);
  assertMayAct(user, existing.kind);
  if (existing.status !== 'open') throw new AppError(400, 'Case is no longer open');

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.case.update({
      where: { id },
      data: { status: 'acknowledged', acknowledgedAt: new Date(), acknowledgedById: user.id },
      include: CASE_INCLUDE,
    });
    await writeLog({
      userId: user.id,
      action: 'acknowledged_case',
      entityType: 'case_record',
      entityId: id,
      metadata: { kind: row.kind, memberId: row.memberId },
      tx,
    });
    return row;
  });

  return updated;
}

/**
 * Who may carry a pastoral case. Anyone else — follow-up staff, a platform
 * admin, an unrelated leader — would learn the member's name and the case kind
 * from the assignment notification alone, so the allowlist is the disclosure
 * boundary, not just a permission.
 *
 * Safety cases are narrower still: safeguarding stays with the pastor.
 */
async function assertMayOwn(owner: { id: string; role: string; isActive: boolean }, existing: { kind: CaseKind; member: { assignedLeaderId: string } }) {
  if (!owner.isActive) throw new AppError(400, 'Owner must be an active user');

  if (existing.kind === 'safety') {
    if (owner.role !== 'pastor') {
      throw new AppError(400, 'A safety case may only be owned by a pastor');
    }
    return;
  }

  const mayOwn = owner.role === 'pastor' || (owner.role === 'leader' && owner.id === existing.member.assignedLeaderId);
  if (!mayOwn) {
    throw new AppError(400, 'A case may only be owned by a pastor or the member’s assigned leader');
  }
}

async function assignCase(user: JwtPayload, id: string, ownerId: string) {
  const existing = await loadForUser(user, id);
  assertMayAct(user, existing.kind);
  if (existing.status === 'resolved') throw new AppError(400, 'Case is already resolved');

  const owner = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!owner) throw new AppError(400, 'Owner must be an active user');
  await assertMayOwn(owner, existing);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.case.update({ where: { id }, data: { ownerId }, include: CASE_INCLUDE });
    await writeLog({
      userId: user.id,
      action: 'assigned_case',
      entityType: 'case_record',
      entityId: id,
      metadata: { ownerId, from: existing.ownerId ?? null },
      tx,
    });
    await notificationsService.createNotification({
      userId: ownerId,
      type: 'case_assigned',
      title: row.kind === 'safety' ? 'Safety case assigned to you' : 'Case assigned to you',
      message: `${row.member.firstName} ${row.member.lastName} — you are now the owner.`,
      entityType: 'case_record',
      entityId: id,
      tx,
    });
    return row;
  });

  return updated;
}

interface UpdateCaseInput {
  actionPlan?: string;
  dueDate?: string;
}

async function updateCase(user: JwtPayload, id: string, input: UpdateCaseInput) {
  const existing = await loadForUser(user, id);
  assertMayAct(user, existing.kind);
  if (existing.status === 'resolved') throw new AppError(400, 'Case is already resolved');

  const data: { actionPlan?: string | null; dueDate?: Date } = {};
  if (input.actionPlan !== undefined) data.actionPlan = input.actionPlan.trim() || null;
  if (input.dueDate !== undefined) {
    const parsed = new Date(input.dueDate);
    if (Number.isNaN(parsed.getTime())) throw new AppError(400, 'dueDate must be a valid date');
    data.dueDate = parsed;
  }
  if (Object.keys(data).length === 0) throw new AppError(400, 'Nothing to update');

  return prisma.case.update({ where: { id }, data, include: CASE_INCLUDE });
}

/** A case cannot be closed silently — the resolution note is the record. */
async function resolveCase(user: JwtPayload, id: string, resolutionNote: string) {
  const existing = await loadForUser(user, id);
  assertMayAct(user, existing.kind);
  if (existing.status === 'resolved') throw new AppError(400, 'Case is already resolved');
  if (!resolutionNote?.trim()) throw new AppError(400, 'A resolution note is required to close a case');

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.case.update({
      where: { id },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedById: user.id,
        resolutionNote: resolutionNote.trim(),
      },
      include: CASE_INCLUDE,
    });
    await writeLog({
      userId: user.id,
      action: 'resolved_case',
      entityType: 'case_record',
      entityId: id,
      metadata: { kind: row.kind, memberId: row.memberId },
      tx,
    });
    return row;
  });

  return updated;
}

/**
 * Safety cases still unacknowledged past the configured window re-notify every
 * active pastor. Deduplicated to one escalation per case per day — an alert
 * that fires hourly stops being read.
 */
async function escalateStaleSafetyCases(now = new Date()) {
  const ackHours = await settingsService.getNumber('safetyAckHours', 4);
  const cutoff = new Date(now.getTime() - ackHours * 3_600_000);
  const dayAgo = new Date(now.getTime() - 86_400_000);

  const stale = await prisma.case.findMany({
    where: {
      kind: 'safety',
      status: 'open',
      createdAt: { lt: cutoff },
      OR: [{ lastEscalatedAt: null }, { lastEscalatedAt: { lt: dayAgo } }],
    },
    include: CASE_INCLUDE,
  });
  if (stale.length === 0) return { escalated: 0 };

  const pastors = await prisma.user.findMany({ where: { role: 'pastor', isActive: true } });

  for (const c of stale) {
    const name = `${c.member.firstName} ${c.member.lastName}`;
    const hours = Math.floor((now.getTime() - c.createdAt.getTime()) / 3_600_000);
    for (const pastor of pastors) {
      await notificationsService.createNotification({
        userId: pastor.id,
        type: 'case_escalated',
        title: 'Safety case unacknowledged',
        message: `${name} — raised ${hours}h ago and still not acknowledged.`,
        entityType: 'case_record',
        entityId: c.id,
      });
      await notificationsService.sendEmail(
        pastor.email,
        'Safety case still unacknowledged',
        `<p>The safety case on <strong>${name}</strong> was raised ${hours} hours ago and has not been acknowledged.</p>`
      );
    }
    await prisma.case.update({ where: { id: c.id }, data: { lastEscalatedAt: now } });
    await writeLog({
      // System-driven escalation is attributed to the case owner when there is
      // one, else the first pastor — the log has no null actor.
      userId: c.ownerId ?? pastors[0]?.id ?? c.member.assignedLeaderId,
      action: 'escalated_case',
      entityType: 'case_record',
      entityId: c.id,
      metadata: { hoursOpen: hours, kind: c.kind },
    });
  }

  return { escalated: stale.length };
}

export const casesService = {
  listCases,
  getCase,
  acknowledgeCase,
  assignCase,
  updateCase,
  resolveCase,
  escalateStaleSafetyCases,
};
