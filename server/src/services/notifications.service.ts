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

type DeliveryResult = { status: 'sent' | 'failed' | 'skipped'; attempts: number };

async function updateDelivery(id: string, data: Prisma.EmailDeliveryUpdateInput): Promise<void> {
  try {
    await prisma.emailDelivery.update({ where: { id }, data });
  } catch (error) {
    console.error('[email:ledger-failed]', error);
  }
}

/** Email is secondary to the in-app alert: every outcome is recorded, none throw. */
async function sendEmail(to: string, subject: string, html: string): Promise<DeliveryResult> {
  if (!config.resendApiKey) {
    try {
      await prisma.emailDelivery.create({ data: { recipient: to, subject, status: 'skipped' } });
    } catch (error) {
      console.error('[email:ledger-failed]', error);
    }
    return { status: 'skipped', attempts: 0 };
  }

  let deliveryId: string;
  try {
    deliveryId = (await prisma.emailDelivery.create({ data: { recipient: to, subject } })).id;
  } catch (error) {
    console.error('[email:ledger-failed]', error);
    return { status: 'failed', attempts: 0 };
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: config.emailFrom, to, subject, html }),
      });

      if (response.ok) {
        const body = await response.json().catch(() => null) as { id?: string } | null;
        await updateDelivery(deliveryId, {
          status: 'sent', attempts: attempt, providerId: body?.id, sentAt: new Date(), lastError: null,
        });
        return { status: 'sent', attempts: attempt };
      }

      const transient = response.status === 429 || response.status >= 500;
      const lastError = `Resend returned HTTP ${response.status}`;
      await updateDelivery(deliveryId, {
        status: transient && attempt < 3 ? 'pending' : 'failed', attempts: attempt, lastError,
      });
      if (!transient) return { status: 'failed', attempts: attempt };
    } catch (error) {
      const lastError = (error instanceof Error ? error.message : 'Network error').slice(0, 500);
      await updateDelivery(deliveryId, {
        status: attempt < 3 ? 'pending' : 'failed', attempts: attempt, lastError,
      });
    }
  }

  return { status: 'failed', attempts: 3 };
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
