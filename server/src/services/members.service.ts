import { Prisma, StatusTag } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { JwtPayload } from '../lib/jwt';
import { writeLog } from './activity-log.service';
import { settingsService } from './settings.service';
import { listMetadata, paginationFromQuery } from '../lib/listQuery';

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
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    select: { statusTag: true },
  },
} satisfies Prisma.MemberInclude;

type MemberRow = Prisma.MemberGetPayload<{ include: typeof MEMBER_INCLUDE }>;

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
const MEMBER_SORTS = ['silence', 'name', 'lastReport'] as const;
const SILENCE_STATUSES: SilenceStatus[] = ['ok', 'overdue', 'significant'];

async function memberIdsWithLatestStatus(status: StatusTag): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ memberId: string }[]>(Prisma.sql`
    SELECT latest."memberId"
    FROM (
      SELECT DISTINCT ON ("memberId") "memberId", "statusTag"
      FROM "member_reports"
      ORDER BY "memberId", "createdAt" DESC, "id" DESC
    ) AS latest
    WHERE latest."statusTag"::text = ${status}
  `);
  return rows.map((row) => row.memberId);
}

async function listMembers(user: JwtPayload, query: Record<string, unknown> = {}) {
  const thresholdDays = await settingsService.getNumber('reportThresholdDays', 14);
  const pagination = paginationFromQuery(query);
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const leader = typeof query.leader === 'string' ? query.leader.trim() : '';
  const group = typeof query.group === 'string' ? query.group.trim() : '';
  const status = typeof query.status === 'string' && query.status !== 'all' ? query.status : '';
  const silence = typeof query.silence === 'string' && query.silence !== 'all' ? query.silence : '';
  const sort = typeof query.sort === 'string' ? query.sort : 'silence';

  if (status && !Object.values(StatusTag).includes(status as StatusTag)) {
    throw new AppError(400, 'Invalid status');
  }
  if (silence && !SILENCE_STATUSES.includes(silence as SilenceStatus)) {
    throw new AppError(400, 'Invalid silence');
  }
  if (!MEMBER_SORTS.includes(sort as (typeof MEMBER_SORTS)[number])) {
    throw new AppError(400, 'Invalid sort');
  }

  const where: Prisma.MemberWhereInput =
    user.role === 'leader' ? { assignedLeaderId: user.id, isActive: true } : {};
  const facetWhere: Prisma.MemberWhereInput = { ...where };
  if (search) where.AND = search.split(/\s+/).map((term) => ({
    OR: [
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
    ],
  }));
  if (leader && leader !== 'all') where.assignedLeader = { fullName: leader };
  if (group && group !== 'all') where.group = { name: group };
  if (status) where.id = { in: await memberIdsWithLatestStatus(status as StatusTag) };

  const overdueAt = new Date(Date.now() - thresholdDays * 86_400_000);
  const significantAt = new Date(Date.now() - thresholdDays * 2 * 86_400_000);
  if (silence === 'ok') where.lastReportDate = { gte: overdueAt };
  if (silence === 'overdue') {
    const existing = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
    where.AND = [...existing,
      { OR: [{ lastReportDate: null }, { lastReportDate: { lt: overdueAt, gte: significantAt } }] },
    ];
  }
  if (silence === 'significant') where.lastReportDate = { lt: significantAt };

  const orderBy: Prisma.MemberOrderByWithRelationInput[] =
    sort === 'name'
      ? [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }]
      : [{ lastReportDate: 'asc' }, { firstName: 'asc' }, { id: 'asc' }];

  const [rows, total, facetRows] = await Promise.all([
    prisma.member.findMany({
      where,
      include: MEMBER_INCLUDE,
      orderBy,
      ...(pagination ? { skip: pagination.skip, take: pagination.pageSize } : {}),
    }),
    prisma.member.count({ where }),
    pagination
      ? prisma.member.findMany({
          where: facetWhere,
          select: { assignedLeader: { select: { fullName: true } }, group: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);
  const data = (rows as MemberRow[]).map((m) => shape(m, thresholdDays));
  const facets = pagination
    ? {
        leaders: [...new Set(facetRows.map((row) => row.assignedLeader.fullName))].sort(),
        groups: [...new Set(facetRows.map((row) => row.group?.name).filter((name): name is string => Boolean(name)))].sort(),
      }
    : undefined;
  return { data, ...listMetadata(total, data.length, pagination), facets };
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
  allowDuplicate?: boolean;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00233')) return digits.slice(2);
  if (digits.length === 10 && digits.startsWith('0')) return `233${digits.slice(1)}`;
  return digits;
}

async function findPhoneMatches(phone?: string) {
  const normalized = phone ? normalizePhone(phone) : '';
  if (!normalized) return [];

  const candidates = await prisma.member.findMany({
    where: { phone: { not: null } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      isActive: true,
      assignedLeader: { select: { fullName: true } },
    },
  });
  return candidates.filter((member) => normalizePhone(member.phone!) === normalized).slice(0, 5);
}

async function assertGroupBelongsToLeader(groupId: string, leaderId: string): Promise<void> {
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { leaderId: true } });
  if (!group || group.leaderId !== leaderId) {
    throw new AppError(400, 'groupId must belong to the assigned leader');
  }
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
    if (!leader || !leader.isActive || leader.role !== 'leader') {
      throw new AppError(400, 'assignedLeaderId must be an active leader');
    }
    assignedLeaderId = input.assignedLeaderId;
  }

  if (input.groupId) await assertGroupBelongsToLeader(input.groupId, assignedLeaderId);

  const phoneMatches = await findPhoneMatches(input.phone);
  if (phoneMatches.length > 0 && input.allowDuplicate !== true) {
    throw new AppError(409, 'A member with this phone number may already exist', 'POSSIBLE_DUPLICATE', {
      matches: phoneMatches,
    });
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
    metadata: {
      name: `${member.firstName} ${member.lastName}`,
      assignedLeaderId,
      ...(phoneMatches.length > 0
        ? { duplicateOverride: true, duplicateMemberIds: phoneMatches.map((match) => match.id) }
        : {}),
    },
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

type MemberUpdateData = {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  groupId?: string | null;
};

async function updateMember(user: JwtPayload, id: string, input: UpdateMemberInput) {
  const existing = await prisma.member.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Member not found');
  if (user.role === 'leader' && existing.assignedLeaderId !== user.id) {
    throw new AppError(403, 'Forbidden');
  }

  const data: MemberUpdateData = {};
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
  if (input.address !== undefined) data.address = input.address.trim() || null;
  if (input.groupId !== undefined) {
    if (input.groupId) await assertGroupBelongsToLeader(input.groupId, existing.assignedLeaderId);
    data.groupId = input.groupId || null;
  }

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
