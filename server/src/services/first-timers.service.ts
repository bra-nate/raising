import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { JwtPayload } from '../lib/jwt';
import { writeLog } from './activity-log.service';
import { notificationsService } from './notifications.service';

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

export const firstTimersService = {
  listFirstTimers,
  getFirstTimer,
  createFirstTimer,
  createBatch,
  updateFirstTimer,
  convertToMember,
};
