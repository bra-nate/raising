import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { JwtPayload } from '../lib/jwt';
import { writeLog } from './activity-log.service';
import { notificationsService } from './notifications.service';
import { settingsService } from './settings.service';

const FT_INCLUDE = {
  assignedTo: { select: { fullName: true } },
} as const;

// Team member sees own + the unassigned pool. Team lead / pastor see all active.
async function listFirstTimers(user: JwtPayload) {
  const where =
    user.role === 'followup_team_member'
      ? { isActive: true, OR: [{ assignedToId: user.id }, { assignedToId: null }] }
      : { isActive: true };
  const rows = await prisma.firstTimer.findMany({
    where,
    include: FT_INCLUDE,
    // pending first, then most recent meeting
    orderBy: [{ status: 'asc' }, { visitDate: 'desc' }],
  });
  return { data: rows, total: rows.length };
}

// Team member may view own or a claimable (unassigned) record; never another's.
async function getFirstTimer(user: JwtPayload, id: string) {
  const ft = await prisma.firstTimer.findUnique({ where: { id }, include: FT_INCLUDE });
  if (!ft) throw new AppError(404, 'First-timer not found');
  if (
    user.role === 'followup_team_member' &&
    ft.assignedToId !== null &&
    ft.assignedToId !== user.id
  ) {
    throw new AppError(403, 'Forbidden');
  }
  return ft;
}

interface CreateFirstTimerInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  serviceName?: string;
  visitDate?: string;
}

function parseVisitDate(value: string | undefined): Date {
  if (!value) throw new AppError(400, 'visitDate is required');
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new AppError(400, 'visitDate is invalid');
  return d;
}

async function createFirstTimer(user: JwtPayload, input: CreateFirstTimerInput) {
  if (!input.firstName?.trim() || !input.lastName?.trim()) {
    throw new AppError(400, 'firstName and lastName are required');
  }
  const visitDate = parseVisitDate(input.visitDate);

  const ft = await prisma.$transaction(async (tx) => {
    const created = await tx.firstTimer.create({
      data: {
        firstName: input.firstName!.trim(),
        lastName: input.lastName!.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        serviceName: input.serviceName?.trim() || null,
        visitDate,
      },
      include: FT_INCLUDE,
    });
    await writeLog({
      userId: user.id,
      action: 'added_first_timer',
      entityType: 'first_timer',
      entityId: created.id,
      metadata: { name: `${created.firstName} ${created.lastName}` },
      tx,
    });
    return created;
  });

  return ft;
}

interface BatchInput {
  meetingName?: string;
  visitDate?: string;
  rows?: { firstName?: string; lastName?: string; phone?: string; email?: string }[];
}

// One meeting per upload: meetingName -> serviceName, visitDate applied to all
// rows. Each created row logs `added_first_timer` sharing one batchId.
async function createBatch(user: JwtPayload, input: BatchInput) {
  const meetingName = input.meetingName?.trim();
  if (!meetingName) throw new AppError(400, 'meetingName is required');
  const visitDate = parseVisitDate(input.visitDate);
  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (rows.length === 0) throw new AppError(400, 'rows is required');

  const batchId = randomUUID();
  const errors: { row: number; reason: string }[] = [];

  const valid = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => {
      if (!r.firstName?.trim() || !r.lastName?.trim()) {
        errors.push({ row: i + 1, reason: 'firstName and lastName are required' });
        return false;
      }
      return true;
    });

  const created = await prisma.$transaction(async (tx) => {
    let count = 0;
    for (const { r } of valid) {
      const ft = await tx.firstTimer.create({
        data: {
          firstName: r.firstName!.trim(),
          lastName: r.lastName!.trim(),
          phone: r.phone?.trim() || null,
          email: r.email?.trim() || null,
          serviceName: meetingName,
          visitDate,
        },
      });
      await writeLog({
        userId: user.id,
        action: 'added_first_timer',
        entityType: 'first_timer',
        entityId: ft.id,
        metadata: { batchId, meetingName, name: `${ft.firstName} ${ft.lastName}` },
        tx,
      });
      count += 1;
    }
    return count;
  });

  return { created, errors };
}

interface UpdateFirstTimerInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  serviceName?: string;
  visitDate?: string;
  assignedToId?: string | null;
  status?: string;
}

const FT_STATUSES = ['pending', 'contacted', 'interested', 'not_interested', 'converted'];

// Team lead + pastor only (route-guarded).
async function updateFirstTimer(user: JwtPayload, id: string, input: UpdateFirstTimerInput) {
  const existing = await prisma.firstTimer.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'First-timer not found');

  const data: Record<string, unknown> = {};
  if (input.firstName !== undefined) {
    if (!input.firstName.trim()) throw new AppError(400, 'firstName cannot be empty');
    data.firstName = input.firstName.trim();
  }
  if (input.lastName !== undefined) {
    if (!input.lastName.trim()) throw new AppError(400, 'lastName cannot be empty');
    data.lastName = input.lastName.trim();
  }
  if (input.phone !== undefined) data.phone = input.phone.trim() || null;
  if (input.email !== undefined) data.email = input.email.trim() || null;
  if (input.serviceName !== undefined) data.serviceName = input.serviceName.trim() || null;
  if (input.visitDate !== undefined) data.visitDate = parseVisitDate(input.visitDate);
  if (input.status !== undefined) {
    if (!FT_STATUSES.includes(input.status)) throw new AppError(400, 'Invalid status');
    data.status = input.status;
  }

  let notifyAssignee: string | null = null;
  if (input.assignedToId !== undefined) {
    if (input.assignedToId === null) {
      data.assignedToId = null;
    } else {
      const assignee = await prisma.user.findUnique({ where: { id: input.assignedToId } });
      const followupRoles = ['followup_team_lead', 'followup_team_member'];
      if (!assignee || !assignee.isActive || !followupRoles.includes(assignee.role)) {
        throw new AppError(400, 'assignedToId must be an active follow-up team member');
      }
      data.assignedToId = input.assignedToId;
      if (existing.assignedToId !== input.assignedToId) notifyAssignee = input.assignedToId;
    }
  }

  if (Object.keys(data).length === 0) throw new AppError(400, 'Nothing to update');

  const ft = await prisma.firstTimer.update({ where: { id }, data, include: FT_INCLUDE });

  if (input.assignedToId !== undefined && existing.assignedToId !== input.assignedToId) {
    await writeLog({
      userId: user.id,
      action: 'assigned_first_timer',
      entityType: 'first_timer',
      entityId: ft.id,
      metadata: { to: input.assignedToId, from: existing.assignedToId },
    });
  }

  if (notifyAssignee) {
    await notificationsService.createNotification({
      userId: notifyAssignee,
      type: 'first_timer_assigned',
      title: 'First-timer assigned to you',
      message: `${ft.firstName} ${ft.lastName} was assigned to you for follow-up.`,
      entityType: 'first_timer',
      entityId: ft.id,
    });
  }

  return ft;
}

interface ConvertInput {
  assignedLeaderId?: string;
  groupId?: string;
}

// Team lead + pastor only (route-guarded). Atomic: create member + flip status.
async function convertToMember(user: JwtPayload, id: string, input: ConvertInput) {
  const ft = await prisma.firstTimer.findUnique({ where: { id } });
  if (!ft) throw new AppError(404, 'First-timer not found');
  if (ft.status === 'converted' || ft.convertedMemberId) {
    throw new AppError(409, 'First-timer is already converted');
  }
  if (!input.assignedLeaderId) throw new AppError(400, 'assignedLeaderId is required');
  const leader = await prisma.user.findUnique({ where: { id: input.assignedLeaderId } });
  if (!leader || leader.role !== 'leader') throw new AppError(400, 'assignedLeaderId must be a leader');
  if (input.groupId) {
    const group = await prisma.group.findUnique({ where: { id: input.groupId } });
    if (!group || group.leaderId !== input.assignedLeaderId) {
      throw new AppError(400, 'groupId must belong to the assigned leader');
    }
  }

  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.member.create({
      data: {
        firstName: ft.firstName,
        lastName: ft.lastName,
        phone: ft.phone,
        email: ft.email,
        address: ft.address,
        assignedLeaderId: input.assignedLeaderId!,
        groupId: input.groupId || null,
        createdById: user.id,
        convertedFromFirstTimerId: ft.id,
      },
    });
    await tx.firstTimer.update({
      where: { id: ft.id },
      data: { status: 'converted', convertedAt: new Date(), convertedMemberId: created.id },
    });
    await writeLog({
      userId: user.id,
      action: 'converted_first_timer',
      entityType: 'first_timer',
      entityId: ft.id,
      metadata: { memberId: created.id, assignedLeaderId: input.assignedLeaderId },
      tx,
    });
    return created;
  });

  return member;
}

// ── Queue ─────────────────────────────────────

const QUEUE_INCLUDE = {
  assignedTo: { select: { id: true, fullName: true } },
  reports: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { createdAt: true, callOutcome: true },
  },
} as const;

type QueueRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  visitDate: Date;
  serviceName: string | null;
  status: string;
  assignedToId: string | null;
  assignedTo: { id: string; fullName: string } | null;
  reports: { createdAt: Date; callOutcome: string }[];
};

function startOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * The working queue for the follow-up team. Everything here is derived in the
 * service — "due", "overdue" and "aging" are policy, not presentation, and the
 * frontend must never recompute them.
 *
 * A visitor is due `firstContactDays` after their visit and stays due until
 * somebody logs a call. Once contacted they leave the queue unless the last
 * outcome asked for a callback.
 */
async function getQueue(user: JwtPayload, now = new Date()) {
  const firstContactDays = await settingsService.getNumber('firstContactDays', 2);

  const where =
    user.role === 'followup_team_member'
      ? { isActive: true, OR: [{ assignedToId: user.id }, { assignedToId: null }] }
      : { isActive: true };

  const rows = (await prisma.firstTimer.findMany({
    where: { ...where, status: { not: 'converted' as const } },
    include: QUEUE_INCLUDE,
    orderBy: { visitDate: 'asc' },
  })) as unknown as QueueRow[];

  const today = startOfDay(now);

  const shape = (r: QueueRow) => {
    const last = r.reports[0] ?? null;
    const dueAt = new Date(r.visitDate.getTime() + firstContactDays * 86_400_000);
    return {
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      phone: r.phone,
      visitDate: r.visitDate,
      serviceName: r.serviceName,
      status: r.status,
      assignedToId: r.assignedToId,
      assignedTo: r.assignedTo,
      lastAttemptAt: last?.createdAt ?? null,
      lastOutcome: last?.callOutcome ?? null,
      attempts: r.reports.length,
      dueAt,
      ageDays: Math.floor((today - startOfDay(r.visitDate)) / 86_400_000),
    };
  };

  const all = rows.map(shape);

  // Never contacted and past the first-contact window.
  const uncontacted = all.filter((r) => r.lastAttemptAt === null);
  const overdue = uncontacted.filter((r) => startOfDay(r.dueAt) < today);
  const dueToday = uncontacted.filter((r) => startOfDay(r.dueAt) === today);
  const upcoming = uncontacted.filter((r) => startOfDay(r.dueAt) > today);
  const callbacks = all.filter((r) => r.lastOutcome === 'callback_requested');
  const unassigned = all.filter((r) => r.assignedToId === null);

  // Aging buckets measure how long a visitor has gone uncontacted — the number
  // that matters when asking whether the team is keeping up.
  const aging = {
    d0_2: uncontacted.filter((r) => r.ageDays <= 2).length,
    d3_7: uncontacted.filter((r) => r.ageDays > 2 && r.ageDays <= 7).length,
    d8_14: uncontacted.filter((r) => r.ageDays > 7 && r.ageDays <= 14).length,
    d15plus: uncontacted.filter((r) => r.ageDays > 14).length,
  };

  // Workload is a lead/pastor view — a team member has no business seeing it.
  const workload =
    user.role === 'followup_team_member'
      ? []
      : Object.values(
          all
            .filter((r) => r.assignedTo)
            .reduce<Record<string, { userId: string; fullName: string; open: number; overdue: number }>>(
              (acc, r) => {
                const key = r.assignedTo!.id;
                acc[key] ??= { userId: key, fullName: r.assignedTo!.fullName, open: 0, overdue: 0 };
                acc[key].open += 1;
                if (r.lastAttemptAt === null && startOfDay(r.dueAt) < today) acc[key].overdue += 1;
                return acc;
              },
              {}
            )
        ).sort((a, b) => b.open - a.open);

  // The roster a lead can assign to. Returned here rather than opening the
  // pastor-only /users route to another role.
  const assignees =
    user.role === 'followup_team_member'
      ? []
      : await prisma.user.findMany({
          where: { isActive: true, role: { in: ['followup_team_lead', 'followup_team_member'] } },
          select: { id: true, fullName: true },
          orderBy: { fullName: 'asc' },
        });

  return {
    dueToday,
    overdue,
    upcoming,
    callbacks,
    unassigned,
    aging,
    workload,
    assignees,
    counts: {
      total: all.length,
      dueToday: dueToday.length,
      overdue: overdue.length,
      callbacks: callbacks.length,
      unassigned: unassigned.length,
    },
  };
}

export const firstTimersService = {
  getQueue,
  listFirstTimers,
  getFirstTimer,
  createFirstTimer,
  createBatch,
  updateFirstTimer,
  convertToMember,
};
