import { CallOutcome, FirstTimerStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { JwtPayload } from '../lib/jwt';
import { writeLog } from './activity-log.service';

const VALID_OUTCOMES: CallOutcome[] = [
  'answered',
  'no_answer',
  'callback_requested',
  'interested',
  'not_interested',
];

const REPORT_INCLUDE = {
  reportedBy: { select: { fullName: true } },
} as const;

// Outcome-driven status map. Returns null = leave status unchanged.
function statusForOutcome(outcome: CallOutcome): FirstTimerStatus | null {
  switch (outcome) {
    case 'interested':
      return 'interested';
    case 'not_interested':
      return 'not_interested';
    case 'answered':
    case 'callback_requested':
      return 'contacted';
    case 'no_answer':
    default:
      return null;
  }
}

// Team member may act on own or claimable (unassigned) records; never another's.
async function loadFirstTimerForUser(user: JwtPayload, firstTimerId: string) {
  const ft = await prisma.firstTimer.findUnique({ where: { id: firstTimerId } });
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

async function listReports(user: JwtPayload, firstTimerId: string) {
  if (!firstTimerId) throw new AppError(400, 'firstTimerId is required');
  await loadFirstTimerForUser(user, firstTimerId);

  const where =
    user.role === 'followup_team_member'
      ? { firstTimerId, reportedById: user.id }
      : { firstTimerId };

  const data = await prisma.firstTimerReport.findMany({
    where,
    include: REPORT_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return { data, total: data.length };
}

interface CreateReportInput {
  firstTimerId?: string;
  callOutcome?: CallOutcome;
  content?: string;
  /** Only meaningful when the outcome is callback_requested. */
  callbackAt?: string;
}

async function createReport(user: JwtPayload, input: CreateReportInput) {
  if (!input.firstTimerId) throw new AppError(400, 'firstTimerId is required');
  if (!input.callOutcome || !VALID_OUTCOMES.includes(input.callOutcome)) {
    throw new AppError(400, 'A valid callOutcome is required');
  }
  const ft = await loadFirstTimerForUser(user, input.firstTimerId);

  // A callback date only means something on a callback. Anything else is
  // dropped rather than silently stored against the wrong outcome.
  let callbackAt: Date | null = null;
  if (input.callOutcome === 'callback_requested' && input.callbackAt) {
    const parsed = new Date(input.callbackAt);
    if (Number.isNaN(parsed.getTime())) throw new AppError(400, 'callbackAt must be a valid date');
    callbackAt = parsed;
  }

  const report = await prisma.$transaction(async (tx) => {
    // Claim-on-call: a team member logging the first call on an unassigned
    // record takes ownership.
    if (ft.assignedToId === null && user.role === 'followup_team_member') {
      await tx.firstTimer.update({ where: { id: ft.id }, data: { assignedToId: user.id } });
      await writeLog({
        userId: user.id,
        action: 'claimed_first_timer',
        entityType: 'first_timer',
        entityId: ft.id,
        metadata: { via: 'call_log' },
        tx,
      });
    }

    const created = await tx.firstTimerReport.create({
      data: {
        firstTimerId: ft.id,
        reportedById: user.id,
        callOutcome: input.callOutcome!,
        content: input.content?.trim() || null,
        callbackAt,
      },
      include: REPORT_INCLUDE,
    });

    // Auto-update status; never overwrite a converted first-timer.
    const next = statusForOutcome(input.callOutcome!);
    if (next && ft.status !== 'converted' && ft.status !== next) {
      await tx.firstTimer.update({ where: { id: ft.id }, data: { status: next } });
    }

    await writeLog({
      userId: user.id,
      action: 'submitted_first_timer_report',
      entityType: 'first_timer_report',
      entityId: created.id,
      metadata: { firstTimerId: ft.id, callOutcome: input.callOutcome, callbackAt },
      tx,
    });

    return created;
  });

  return report;
}

export const firstTimerReportsService = { listReports, createReport };
