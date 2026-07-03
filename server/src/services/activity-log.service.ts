import { ActivityAction, EntityType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

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
}

async function listLogs(opts: ListLogsOpts = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));

  const where: Prisma.ActivityLogWhereInput = {};
  if (opts.action) where.action = opts.action as ActivityAction;
  if (opts.userId) where.userId = opts.userId;

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
