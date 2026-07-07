import { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { AppError } from '../lib/errors';

interface CreateNotificationArgs {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  // Optional transaction client so the write can join a triggering transaction.
  tx?: Prisma.TransactionClient;
}

async function createNotification(args: CreateNotificationArgs) {
  const client = args.tx ?? prisma;
  return client.notification.create({
    data: {
      userId: args.userId,
      type: args.type,
      title: args.title,
      message: args.message,
      entityType: args.entityType,
      entityId: args.entityId,
    },
  });
}

/**
 * Send a transactional email via the Resend REST API. When no API key is
 * configured (local dev), this logs and no-ops rather than throwing — a missing
 * email must never break the operation that triggered it.
 */
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!config.resendApiKey) {
    console.log(`[email:skipped] no RESEND_API_KEY — would send "${subject}" to ${to}`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'raising <notifications@raising.local>',
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[email:failed] ${res.status} sending "${subject}" to ${to}`);
    }
  } catch (err) {
    console.error('[email:error]', err);
  }
}

async function list(userId: string) {
  const [data, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);
  return { data, unreadCount };
}

async function markRead(userId: string, id: string): Promise<void> {
  const result = await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });
  if (result.count === 0) throw new AppError(404, 'Notification not found');
}

async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}

export const notificationsService = { createNotification, sendEmail, list, markRead, markAllRead };
