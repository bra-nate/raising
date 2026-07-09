import { describe, it, expect } from 'vitest';
import { prisma } from '../lib/prisma';
import { runReportReminder, runSilenceDetection } from './scheduler';
import { createUser, createMember, seedSettings } from '../test/fixtures';

// A fixed Friday in UTC: 2026-01-02 is a Friday.
const FRIDAY = new Date('2026-01-02T08:00:00.000Z');
const MONDAY = new Date('2026-01-05T08:00:00.000Z');
const daysAgo = (base: Date, n: number) => new Date(base.getTime() - n * 24 * 60 * 60 * 1000);

describe('runReportReminder', () => {
  it('does nothing when today is not the configured reminder day', async () => {
    await seedSettings({ reportReminderDay: 'friday' });
    const leader = await createUser({ role: 'leader' });
    await createMember(leader.id, { lastReportDate: null });
    await runReportReminder(MONDAY);
    expect(await prisma.notification.count()).toBe(0);
  });

  it('notifies a leader with an overdue member on the reminder day', async () => {
    await seedSettings({ reportReminderDay: 'friday', reportThresholdDays: '14' });
    const leader = await createUser({ role: 'leader' });
    await createMember(leader.id, { lastReportDate: daysAgo(FRIDAY, 30) }); // overdue
    await runReportReminder(FRIDAY);
    const notifs = await prisma.notification.findMany({ where: { userId: leader.id } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('report_due');
  });

  it('does not notify a leader whose members are all recently reported', async () => {
    await seedSettings({ reportReminderDay: 'friday', reportThresholdDays: '14' });
    const leader = await createUser({ role: 'leader' });
    await createMember(leader.id, { lastReportDate: daysAgo(FRIDAY, 2) }); // within threshold
    await runReportReminder(FRIDAY);
    expect(await prisma.notification.count({ where: { userId: leader.id } })).toBe(0);
  });
});

describe('runSilenceDetection', () => {
  it('creates a member_unreported notification for the pastor per silent member', async () => {
    await seedSettings({ reportThresholdDays: '14' });
    const pastor = await createUser({ role: 'pastor' });
    const leader = await createUser({ role: 'leader' });
    const m = await createMember(leader.id, { lastReportDate: null });
    await runSilenceDetection(FRIDAY);
    const notifs = await prisma.notification.findMany({ where: { userId: pastor.id } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('member_unreported');
    expect(notifs[0].entityId).toBe(m.id);
  });

  it('does not duplicate a notification for the same member on the same day', async () => {
    await seedSettings({ reportThresholdDays: '14' });
    const pastor = await createUser({ role: 'pastor' });
    const leader = await createUser({ role: 'leader' });
    await createMember(leader.id, { lastReportDate: null });
    await runSilenceDetection(FRIDAY);
    await runSilenceDetection(FRIDAY); // second run same day
    expect(await prisma.notification.count({ where: { userId: pastor.id } })).toBe(1);
  });

  it('ignores members reported within the threshold', async () => {
    await seedSettings({ reportThresholdDays: '14' });
    const pastor = await createUser({ role: 'pastor' });
    const leader = await createUser({ role: 'leader' });
    await createMember(leader.id, { lastReportDate: daysAgo(FRIDAY, 3) });
    await runSilenceDetection(FRIDAY);
    expect(await prisma.notification.count({ where: { userId: pastor.id } })).toBe(0);
  });
});
