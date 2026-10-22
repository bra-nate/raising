import { ActivityAction, EntityType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';

interface WriteLogArgs {
  userId: string;
  action: ActivityAction;
  entityType: EntityType;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  // Optional transaction client so the log write joins the triggering operation's transaction.
  tx?: Prisma.TransactionClient;
}

/**
 * Append an activity log entry. Call this from inside the same service function
 * as the triggering operation — never fire-and-forget, never from a route handler.
 * Activity log rows are never deleted.
 */
export async function writeLog(args: WriteLogArgs): Promise<void> {
  const client = args.tx ?? prisma;
  await client.activityLog.create({
    data: {
      userId: args.userId,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      metadata: args.metadata,
    },
  });
}

interface ListLogsOpts {
  page?: number;
  pageSize?: number;
  action?: string;
  userId?: string;
  from?: string;
  to?: string;
}

function dateBoundary(value: string, nextDay = false): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError(400, 'Dates must use YYYY-MM-DD');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AppError(400, 'Invalid date');
  }
  if (nextDay) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

async function listLogs(opts: ListLogsOpts = {}) {
  const page = Number.isFinite(opts.page) && (opts.page as number) >= 1 ? Math.floor(opts.page as number) : 1;
  const rawSize = Number.isFinite(opts.pageSize) ? Math.floor(opts.pageSize as number) : 25;
  const pageSize = Math.min(100, Math.max(1, rawSize));

  const where: Prisma.ActivityLogWhereInput = {};
  if (opts.action) {
    if (!Object.values(ActivityAction).includes(opts.action as ActivityAction)) {
      throw new AppError(400, 'Invalid activity action');
    }
    where.action = opts.action as ActivityAction;
  }
  if (opts.userId) where.userId = opts.userId;
  const from = opts.from ? dateBoundary(opts.from) : undefined;
  const to = opts.to ? dateBoundary(opts.to, true) : undefined;
  if (from && to && from >= to) throw new AppError(400, 'from must be on or before to');
  if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };

  const [rows, total] = await prisma.$transaction([
    prisma.activityLog.findMany({
      where,
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return { data: rows, total };
}

export const activityLogService = { writeLog, listLogs };
