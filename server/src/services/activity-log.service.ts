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

export const activityLogService = { writeLog };
