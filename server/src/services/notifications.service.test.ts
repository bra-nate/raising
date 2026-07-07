import { describe, it, expect } from 'vitest';
import { prisma } from '../lib/prisma';
import { notificationsService } from './notifications.service';
import { createUser } from '../test/fixtures';

async function makeNotif(userId: string, isRead = false) {
  return prisma.notification.create({
    data: { userId, type: 'safety_flag', title: 't', message: 'm', isRead },
  });
}

describe('notificationsService.list', () => {
  it('returns own notifications newest-first, capped at 20, with unread count', async () => {
    const user = await createUser();
    for (let i = 0; i < 25; i++) await makeNotif(user.id, i % 2 === 0);
    const { data, unreadCount } = await notificationsService.list(user.id);
    expect(data).toHaveLength(20);
    // Newest-first: created later has a later createdAt (or equal-then-insertion order).
    expect(new Date(data[0].createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(data[19].createdAt).getTime()
    );
    // unreadCount counts ALL unread, not just the top 20. Even i (0,2..24) are
    // read → 13 read, odd i (1,3..23) unread → 12 unread.
    expect(unreadCount).toBe(12);
  });

  it('does not return other users notifications', async () => {
    const a = await createUser();
    const b = await createUser();
    await makeNotif(a.id);
    const { data, unreadCount } = await notificationsService.list(b.id);
    expect(data).toHaveLength(0);
    expect(unreadCount).toBe(0);
  });
});

describe('notificationsService.markRead', () => {
  it('marks own notification read', async () => {
    const user = await createUser();
    const n = await makeNotif(user.id);
    await notificationsService.markRead(user.id, n.id);
    const updated = await prisma.notification.findUnique({ where: { id: n.id } });
    expect(updated?.isRead).toBe(true);
  });

  it('throws 404 when the notification belongs to another user', async () => {
    const a = await createUser();
    const b = await createUser();
    const n = await makeNotif(a.id);
    await expect(notificationsService.markRead(b.id, n.id)).rejects.toMatchObject({ status: 404 });
    const untouched = await prisma.notification.findUnique({ where: { id: n.id } });
    expect(untouched?.isRead).toBe(false);
  });
});

describe('notificationsService.markAllRead', () => {
  it('marks every unread notification for the user read', async () => {
    const user = await createUser();
    await makeNotif(user.id);
    await makeNotif(user.id);
    await notificationsService.markAllRead(user.id);
    expect(await prisma.notification.count({ where: { userId: user.id, isRead: false } })).toBe(0);
  });
});
