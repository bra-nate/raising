import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { settingsService } from '../services/settings.service';
import { notificationsService } from '../services/notifications.service';
import { casesService } from '../services/cases.service';
import { privacyService } from '../services/privacy.service';

const TZ = 'Africa/Accra'; // UTC+0 — weekday/start-of-day computed with UTC methods

const DAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function cutoffDate(now: Date, thresholdDays: number): Date {
  return new Date(now.getTime() - thresholdDays * 24 * 60 * 60 * 1000);
}

/** Report reminder: fires daily; acts only on the configured weekday. */
export async function runReportReminder(now: Date = new Date()): Promise<void> {
  const reminderDay = (await settingsService.get('reportReminderDay')) ?? 'friday';
  if (DAY_INDEX[reminderDay] !== now.getUTCDay()) return;

  const thresholdDays = await settingsService.getNumber('reportThresholdDays', 14);
  const cutoff = cutoffDate(now, thresholdDays);

  const leaders = await prisma.user.findMany({ where: { role: 'leader', isActive: true } });
  for (const leader of leaders) {
    const overdue = await prisma.member.count({
      where: {
        assignedLeaderId: leader.id,
        isActive: true,
        OR: [{ lastReportDate: null }, { lastReportDate: { lt: cutoff } }],
      },
    });
    if (overdue === 0) continue;

    await notificationsService.createNotification({
      userId: leader.id,
      type: 'report_due',
      title: 'Weekly report reminder',
      message: `You have ${overdue} member${overdue === 1 ? '' : 's'} without a recent report.`,
    });
    await notificationsService.sendEmail(
      leader.email,
      'Weekly report reminder',
      `<p>You have <strong>${overdue}</strong> member(s) without a report in the last ${thresholdDays} days.</p>`
    );
  }
}

/** Silence detection: daily; one pastor notification per silent member, deduped per day. */
export async function runSilenceDetection(now: Date = new Date()): Promise<void> {
  const thresholdDays = await settingsService.getNumber('reportThresholdDays', 14);
  const cutoff = cutoffDate(now, thresholdDays);
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const silent = await prisma.member.findMany({
    where: {
      isActive: true,
      OR: [{ lastReportDate: null }, { lastReportDate: { lt: cutoff } }],
    },
  });
  if (silent.length === 0) return;

  const pastors = await prisma.user.findMany({ where: { role: 'pastor', isActive: true } });
  for (const pastor of pastors) {
    for (const member of silent) {
      const already = await prisma.notification.count({
        where: {
          userId: pastor.id,
          type: 'member_unreported',
          entityId: member.id,
          createdAt: { gte: startOfDay },
        },
      });
      if (already > 0) continue;

      await notificationsService.createNotification({
        userId: pastor.id,
        type: 'member_unreported',
        title: 'Member unreported',
        message: `${member.firstName} ${member.lastName} has no recent report.`,
        entityType: 'member',
        entityId: member.id,
      });
    }
  }
}

/**
 * Safety escalation: hourly, because a safeguarding acknowledgement window is
 * measured in hours, not days. The dedupe lives in the service.
 */
export async function runSafetyEscalation(now: Date = new Date()): Promise<void> {
  await casesService.escalateStaleSafetyCases(now);
}

/** Retention review: daily. Flags only — redaction is always a pastor's act. */
export async function runRetentionReview(now: Date = new Date()): Promise<void> {
  await privacyService.notifyRetentionDue(now);
}

/** Register the cron jobs. Called once on server boot (never under test). */
export function startScheduler(): void {
  cron.schedule(
    '0 8 * * *',
    () => {
      runReportReminder().catch((err) => console.error('[cron:report-reminder]', err));
    },
    { timezone: TZ }
  );

  cron.schedule(
    '0 7 * * *',
    () => {
      runSilenceDetection().catch((err) => console.error('[cron:silence-detection]', err));
    },
    { timezone: TZ }
  );

  cron.schedule(
    '30 7 * * *',
    () => {
      runRetentionReview().catch((err) => console.error('[cron:retention-review]', err));
    },
    { timezone: TZ }
  );

  cron.schedule(
    '0 * * * *',
    () => {
      runSafetyEscalation().catch((err) => console.error('[cron:safety-escalation]', err));
    },
    { timezone: TZ }
  );

  console.log(
    '[scheduler] report-reminder (08:00) + silence-detection (07:00) + retention-review (07:30) + safety-escalation (hourly) registered — Africa/Accra'
  );
}
