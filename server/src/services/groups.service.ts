import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { JwtPayload } from '../lib/jwt';
import { writeLog } from './activity-log.service';
import { settingsService } from './settings.service';
import { membersService } from './members.service';

/**
 * Groups with the numbers that make them worth looking at: how many members,
 * how many are silent, and how many carry an open case. A group page that only
 * listed names would not tell a pastor where care is slipping.
 */
async function listGroups(user: JwtPayload) {
  const thresholdDays = await settingsService.getNumber('reportThresholdDays', 14);

  const groups = await prisma.group.findMany({
    where: user.role === 'leader' ? { leaderId: user.id } : {},
    include: {
      leader: { select: { id: true, fullName: true } },
      members: {
        where: { isActive: true },
        select: { id: true, lastReportDate: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  const openCases = await prisma.case.groupBy({
    by: ['memberId'],
    where: { status: { in: ['open', 'acknowledged'] } },
    _count: true,
  });
  const memberHasCase = new Set(openCases.map((c) => c.memberId));

  const data = groups.map((g) => {
    const silent = g.members.filter(
      (m) => membersService.computeSilence(m.lastReportDate, thresholdDays) !== 'ok'
    ).length;
    return {
      id: g.id,
      name: g.name,
      leaderId: g.leaderId,
      leader: g.leader,
      createdAt: g.createdAt,
      memberCount: g.members.length,
      silentCount: silent,
      openCaseCount: g.members.filter((m) => memberHasCase.has(m.id)).length,
    };
  });

  return { data, total: data.length };
}

async function assertLeader(leaderId: string) {
  const leader = await prisma.user.findUnique({ where: { id: leaderId } });
  if (!leader || !leader.isActive || leader.role !== 'leader') {
    throw new AppError(400, 'leaderId must be an active leader');
  }
}

// Pastor-only (route-guarded).
async function createGroup(user: JwtPayload, input: { name?: string; leaderId?: string }) {
  const name = input.name?.trim();
  if (!name) throw new AppError(400, 'name is required');
  if (!input.leaderId) throw new AppError(400, 'leaderId is required');
  await assertLeader(input.leaderId);

  const group = await prisma.group.create({ data: { name, leaderId: input.leaderId } });

  await writeLog({
    userId: user.id,
    action: 'created_group',
    entityType: 'group',
    entityId: group.id,
    metadata: { name, leaderId: input.leaderId },
  });

  return group;
}

/**
 * Renaming is cosmetic; moving a group to a new leader is not — every member in
 * it moves with it, which is the whole point when a leader hands over.
 */
async function updateGroup(user: JwtPayload, id: string, input: { name?: string; leaderId?: string }) {
  const existing = await prisma.group.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Group not found');

  const data: { name?: string; leaderId?: string } = {};
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new AppError(400, 'name cannot be empty');
    data.name = input.name.trim();
  }
  if (input.leaderId !== undefined && input.leaderId !== existing.leaderId) {
    await assertLeader(input.leaderId);
    data.leaderId = input.leaderId;
  }
  if (Object.keys(data).length === 0) throw new AppError(400, 'Nothing to update');

  const group = await prisma.$transaction(async (tx) => {
    const updated = await tx.group.update({ where: { id }, data });

    // A group's members follow its leader — otherwise a handover leaves members
    // assigned to someone who no longer runs the group they are in.
    let moved = 0;
    if (data.leaderId) {
      const result = await tx.member.updateMany({
        where: { groupId: id },
        data: { assignedLeaderId: data.leaderId },
      });
      moved = result.count;
    }

    await writeLog({
      userId: user.id,
      action: 'updated_group',
      entityType: 'group',
      entityId: id,
      metadata: {
        fields: Object.keys(data),
        ...(data.leaderId ? { leaderFrom: existing.leaderId, leaderTo: data.leaderId, membersMoved: moved } : {}),
      },
      tx,
    });

    return updated;
  });

  return group;
}

/** Deletion only when empty — a group with members is reassigned, never dropped. */
async function deleteGroup(user: JwtPayload, id: string) {
  const group = await prisma.group.findUnique({ where: { id } });
  if (!group) throw new AppError(404, 'Group not found');

  const memberCount = await prisma.member.count({ where: { groupId: id } });
  if (memberCount > 0) {
    throw new AppError(409, `Group still has ${memberCount} member(s) — move them first`);
  }

  await prisma.$transaction(async (tx) => {
    await writeLog({
      userId: user.id,
      action: 'deleted_group',
      entityType: 'group',
      entityId: id,
      metadata: { name: group.name },
      tx,
    });
    await tx.group.delete({ where: { id } });
  });

  return { id };
}

/** Move every member of one group to another (or to no group at all). */
async function moveMembers(user: JwtPayload, id: string, targetGroupId: string | null) {
  const source = await prisma.group.findUnique({ where: { id } });
  if (!source) throw new AppError(404, 'Group not found');

  let targetLeaderId: string | null = null;
  if (targetGroupId) {
    const target = await prisma.group.findUnique({ where: { id: targetGroupId } });
    if (!target) throw new AppError(400, 'targetGroupId does not exist');
    targetLeaderId = target.leaderId;
  }

  const moved = await prisma.$transaction(async (tx) => {
    const result = await tx.member.updateMany({
      where: { groupId: id },
      // Members follow the target group's leader; ungrouping leaves the leader as is.
      data: targetLeaderId
        ? { groupId: targetGroupId, assignedLeaderId: targetLeaderId }
        : { groupId: null },
    });
    await writeLog({
      userId: user.id,
      action: 'updated_group',
      entityType: 'group',
      entityId: id,
      metadata: { movedTo: targetGroupId, count: result.count },
      tx,
    });
    return result.count;
  });

  return { moved };
}

export const groupsService = { listGroups, createGroup, updateGroup, deleteGroup, moveMembers };
