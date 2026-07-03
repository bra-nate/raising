import { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { config } from '../config';

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

export const notificationsService = { createNotification, sendEmail };
