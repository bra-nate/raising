import { StatusTag } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { JwtPayload } from '../lib/jwt';
import { writeLog } from './activity-log.service';
import { settingsService } from './settings.service';
import { notificationsService } from './notifications.service';

const VALID_STATUS: StatusTag[] = ['good', 'needs_attention', 'concern'];

const REPORT_INCLUDE = {
  leader: { select: { fullName: true } },
} as const;

// Ensure the requesting user may act on this member at all.
async function loadMemberForUser(user: JwtPayload, memberId: string) {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) throw new AppError(404, 'Member not found');
  if (user.role === 'leader' && member.assignedLeaderId !== user.id) {
    throw new AppError(403, 'Forbidden');
  }
  return member;
}

/**
 * Reports for a member.
 * - Leader: reports they wrote (incl. confidential) + non-confidential reports
 *   on their members. Confidential filtering is enforced in the query — never
 *   on the frontend.
 * - Pastor: all reports.
 */
async function listReports(user: JwtPayload, memberId: string) {
  if (!memberId) throw new AppError(400, 'memberId is required');
  await loadMemberForUser(user, memberId);

  const where =
    user.role === 'leader'
      ? {
          memberId,
          member: { assignedLeaderId: user.id },
          OR: [{ leaderId: user.id }, { isConfidential: false }],
        }
      : { memberId };

  const data = await prisma.memberReport.findMany({
    where,
    include: REPORT_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  // Audit: record when a user retrieves confidential reports they did not author.
  const confidentialViewed = data.filter((r) => r.isConfidential && r.leaderId !== user.id);
  if (confidentialViewed.length > 0) {
    await writeLog({
      userId: user.id,
      action: 'viewed_confidential_report',
      entityType: 'member',
      entityId: memberId,
      metadata: { memberId, reportIds: confidentialViewed.map((r) => r.id) },
    });
  }

  return { data, total: data.length };
}

interface CreateReportInput {
  memberId?: string;
  statusTag?: StatusTag;
  content?: string;
  isConfidential?: boolean;
  isSafetyFlagged?: boolean;
}

async function createReport(user: JwtPayload, input: CreateReportInput) {
  if (!input.memberId) throw new AppError(400, 'memberId is required');
  if (!input.statusTag || !VALID_STATUS.includes(input.statusTag)) {
    throw new AppError(400, 'A valid statusTag is required');
  }
  if (!input.content?.trim()) throw new AppError(400, 'content is required');

  const member = await loadMemberForUser(user, input.memberId);

  const isSafetyFlagged = Boolean(input.isSafetyFlagged);
  const isConfidential = Boolean(input.isConfidential);

  // Report insert + lastReportDate update + audit log are one atomic unit.
  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.memberReport.create({
      data: {
        memberId: member.id,
        leaderId: user.id,
        statusTag: input.statusTag!,
        content: input.content!.trim(),
        isConfidential,
        isSafetyFlagged,
      },
      include: REPORT_INCLUDE,
    });

    await tx.member.update({ where: { id: member.id }, data: { lastReportDate: created.createdAt } });

    await writeLog({
      userId: user.id,
      action: 'submitted_member_report',
      entityType: 'member_report',
      entityId: created.id,
      metadata: { memberId: member.id, statusTag: created.statusTag, isSafetyFlagged, isConfidential },
      tx,
    });

    return created;
  });

  // Safety flag: notify every active pastor immediately — synchronously before
  // the response is returned.
  if (isSafetyFlagged) {
    const pastors = await prisma.user.findMany({ where: { role: 'pastor', isActive: true } });
    const memberName = `${member.firstName} ${member.lastName}`;
    for (const pastor of pastors) {
      await notificationsService.createNotification({
        userId: pastor.id,
        type: 'safety_flag',
        title: 'Safety-flagged report',
        message: `A safety concern was flagged on ${memberName}.`,
        entityType: 'member_report',
        entityId: report.id,
      });
      await notificationsService.sendEmail(
        pastor.email,
        'Safety-flagged report submitted',
        `<p>A safety concern was flagged on <strong>${memberName}</strong> by ${report.leader.fullName}.</p>`
      );
    }
  }

  return report;
}

// allowDeleteReports gates redact + delete for everyone. When enabled, pastor
// may always act; a leader may act only if deletePermission grants it and the
// report is on one of their own members.
async function assertMutationAllowed(user: JwtPayload, reportId: string) {
  const report = await prisma.memberReport.findUnique({
    where: { id: reportId },
    include: { member: { select: { assignedLeaderId: true } } },
  });
  if (!report) throw new AppError(404, 'Report not found');

  // Safety-flagged reports can never be redacted or deleted.
  if (report.isSafetyFlagged) {
    throw new AppError(403, 'Safety-flagged reports cannot be modified');
  }

  const allowDelete = (await settingsService.get('allowDeleteReports')) === 'true';
  if (!allowDelete) throw new AppError(403, 'Report modification is disabled');

  if (user.role !== 'pastor') {
    const permission = await settingsService.get('deletePermission');
    if (permission !== 'leaders') throw new AppError(403, 'Forbidden');
    if (report.member.assignedLeaderId !== user.id) throw new AppError(403, 'Forbidden');
  }

  return report;
}

async function redactReport(user: JwtPayload, id: string, redactionSummary?: string) {
  await assertMutationAllowed(user, id);

  const report = await prisma.$transaction(async (tx) => {
    const updated = await tx.memberReport.update({
      where: { id },
      data: {
        content: '[Redacted]',
        redactedAt: new Date(),
        redactedById: user.id,
        redactionSummary: redactionSummary?.trim() || null,
      },
      include: REPORT_INCLUDE,
    });
    await writeLog({
      userId: user.id,
      action: 'redacted_report',
      entityType: 'member_report',
      entityId: id,
      metadata: { redactionSummary: redactionSummary?.trim() || null },
      tx,
    });
    return updated;
  });

  return report;
}

async function deleteReport(user: JwtPayload, id: string) {
  const report = await assertMutationAllowed(user, id);

  await prisma.$transaction(async (tx) => {
    // Log before deletion — the audit trail must outlive the row.
    await writeLog({
      userId: user.id,
      action: 'deleted_report',
      entityType: 'member_report',
      entityId: id,
      metadata: { memberId: report.memberId, statusTag: report.statusTag },
      tx,
    });
    await tx.memberReport.delete({ where: { id } });
  });

  return { id };
}

export const memberReportsService = { listReports, createReport, redactReport, deleteReport };
