import { StatusTag } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { JwtPayload } from '../lib/jwt';
import { writeLog } from './activity-log.service';
import { settingsService } from './settings.service';

export type SilenceStatus = 'ok' | 'overdue' | 'significant';

/**
 * Silence is computed in the service layer — never on the frontend.
 * null lastReportDate (never reported) counts as overdue; past 2× the
 * threshold is significantly overdue.
 */
function computeSilence(lastReportDate: Date | null, thresholdDays: number): SilenceStatus {
  if (!lastReportDate) return 'overdue';
  const days = (Date.now() - lastReportDate.getTime()) / (1000 * 60 * 60 * 24);
  if (days > thresholdDays * 2) return 'significant';
  if (days > thresholdDays) return 'overdue';
  return 'ok';
}

const MEMBER_INCLUDE = {
  assignedLeader: { select: { fullName: true } },
  group: { select: { name: true } },
  convertedFromFirstTimer: { select: { visitDate: true } },
  reports: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { statusTag: true },
  },
} as const;

type MemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  assignedLeaderId: string;
  groupId: string | null;
  lastReportDate: Date | null;
  isActive: boolean;
  convertedFromFirstTimerId: string | null;
  createdAt: Date;
  assignedLeader: { fullName: string };
  group: { name: string } | null;
  convertedFromFirstTimer: { visitDate: Date } | null;
  reports: { statusTag: StatusTag }[];
};

function shape(m: MemberRow, thresholdDays: number) {
  const { reports, ...rest } = m;
  return {
    ...rest,
    latestStatus: reports[0]?.statusTag ?? null,
    silence: computeSilence(m.lastReportDate, thresholdDays),
  };
}

/**
 * Leader → own active members only. Pastor → all members.
 * Query scoping is enforced here; query params are never trusted for scoping.
 */
async function listMembers(user: JwtPayload) {
  const thresholdDays = await settingsService.getNumber('reportThresholdDays', 14);
  const rows = (await prisma.member.findMany({
    where: user.role === 'leader' ? { assignedLeaderId: user.id, isActive: true } : {},
    include: MEMBER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  })) as MemberRow[];
  const data = rows.map((m) => shape(m, thresholdDays));
  return { data, total: data.length };
}

async function getMember(user: JwtPayload, id: string) {
  const thresholdDays = await settingsService.getNumber('reportThresholdDays', 14);
  const member = (await prisma.member.findUnique({
    where: { id },
    include: MEMBER_INCLUDE,
  })) as MemberRow | null;
  if (!member) throw new AppError(404, 'Member not found');
  if (user.role === 'leader' && member.assignedLeaderId !== user.id) {
    throw new AppError(403, 'Forbidden');
  }
  return shape(member, thresholdDays);
}

interface CreateMemberInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
  groupId?: string;
  assignedLeaderId?: string; // honored for pastor only
}

async function createMember(user: JwtPayload, input: CreateMemberInput) {
  if (!input.firstName?.trim() || !input.lastName?.trim()) {
    throw new AppError(400, 'firstName and lastName are required');
  }

  // Leaders may only create members assigned to themselves. Pastor may target
  // any leader; the assignment must resolve to an actual leader account.
  let assignedLeaderId = user.id;
  if (user.role === 'pastor') {
    if (!input.assignedLeaderId) throw new AppError(400, 'assignedLeaderId is required');
    const leader = await prisma.user.findUnique({ where: { id: input.assignedLeaderId } });
    if (!leader || leader.role !== 'leader') throw new AppError(400, 'assignedLeaderId must be a leader');
    assignedLeaderId = input.assignedLeaderId;
  }

  const member = await prisma.member.create({
    data: {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address: input.address?.trim() || null,
      groupId: input.groupId || null,
      assignedLeaderId,
      createdById: user.id,
    },
  });

  await writeLog({
    userId: user.id,
    action: 'added_member',
    entityType: 'member',
    entityId: member.id,
    metadata: { name: `${member.firstName} ${member.lastName}`, assignedLeaderId },
  });

  return member;
}

interface UpdateMemberInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
  groupId?: string;
}

async function updateMember(user: JwtPayload, id: string, input: UpdateMemberInput) {
  const existing = await prisma.member.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Member not found');
  if (user.role === 'leader' && existing.assignedLeaderId !== user.id) {
    throw new AppError(403, 'Forbidden');
  }

  const data: UpdateMemberInput = {};
  if (input.firstName !== undefined) {
    if (!input.firstName.trim()) throw new AppError(400, 'firstName cannot be empty');
    data.firstName = input.firstName.trim();
  }
  if (input.lastName !== undefined) {
    if (!input.lastName.trim()) throw new AppError(400, 'lastName cannot be empty');
    data.lastName = input.lastName.trim();
  }
  if (input.phone !== undefined) data.phone = input.phone.trim() || undefined;
  if (input.email !== undefined) data.email = input.email.trim() || undefined;
  if (input.address !== undefined) data.address = input.address.trim() || undefined;
  if (input.groupId !== undefined) data.groupId = input.groupId || undefined;

  if (Object.keys(data).length === 0) throw new AppError(400, 'Nothing to update');

  const member = await prisma.member.update({ where: { id }, data });

  await writeLog({
    userId: user.id,
    action: 'updated_member',
    entityType: 'member',
    entityId: member.id,
    metadata: { fields: Object.keys(data) },
  });

  return member;
}

// Pastor-only (route-guarded).
async function deactivateMember(user: JwtPayload, id: string) {
  const existing = await prisma.member.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Member not found');

  const member = await prisma.member.update({ where: { id }, data: { isActive: false } });

  await writeLog({
    userId: user.id,
    action: 'updated_member',
    entityType: 'member',
    entityId: member.id,
    metadata: { deactivated: true },
  });

  return member;
}

// Escape a value for CSV: wrap in quotes and double any embedded quotes.
function csvCell(value: string | null | undefined): string {
  const v = value ?? '';
  return `"${v.replace(/"/g, '""')}"`;
}

// Pastor-only export of all members (route-guarded).
async function exportCsv(): Promise<string> {
  const thresholdDays = await settingsService.getNumber('reportThresholdDays', 14);
  const rows = (await prisma.member.findMany({
    include: MEMBER_INCLUDE,
    orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }],
  })) as MemberRow[];

  const header = [
    'First Name',
    'Last Name',
    'Phone',
    'Email',
    'Address',
    'Leader',
    'Group',
    'Last Report',
    'Silence',
    'Latest Status',
    'Active',
  ];

  const lines = rows.map((m) =>
    [
      m.firstName,
      m.lastName,
      m.phone,
      m.email,
      m.address,
      m.assignedLeader.fullName,
      m.group?.name ?? '',
      m.lastReportDate ? m.lastReportDate.toISOString().slice(0, 10) : '',
      computeSilence(m.lastReportDate, thresholdDays),
      m.reports[0]?.statusTag ?? '',
      m.isActive ? 'yes' : 'no',
    ]
      .map(csvCell)
      .join(',')
  );

  return [header.map(csvCell).join(','), ...lines].join('\r\n');
}

export const membersService = {
  listMembers,
  getMember,
  createMember,
  updateMember,
  deactivateMember,
  computeSilence,
  exportCsv,
};
