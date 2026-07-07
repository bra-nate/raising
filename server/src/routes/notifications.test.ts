import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { createUser } from '../test/fixtures';

const app = createApp();

function auth(user: { id: string; role: UserRole }) {
  return `Bearer ${signToken({ id: user.id, role: user.role })}`;
}

describe('GET /api/v1/notifications', () => {
  it('401 without a token', async () => {
    await request(app).get('/api/v1/notifications').expect(401);
  });

  it("returns the caller's notifications and unread count", async () => {
    const user = await createUser({ role: 'pastor' });
    await prisma.notification.create({ data: { userId: user.id, type: 'safety_flag', title: 't', message: 'm' } });
    const res = await request(app).get('/api/v1/notifications').set('Authorization', auth(user)).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.unreadCount).toBe(1);
  });
});

describe('PATCH read endpoints', () => {
  it('marks one read', async () => {
    const user = await createUser();
    const n = await prisma.notification.create({ data: { userId: user.id, type: 'safety_flag', title: 't', message: 'm' } });
    await request(app).patch(`/api/v1/notifications/${n.id}/read`).set('Authorization', auth(user)).expect(200);
    expect((await prisma.notification.findUnique({ where: { id: n.id } }))?.isRead).toBe(true);
  });

  it("404 marking another user's notification", async () => {
    const a = await createUser();
    const b = await createUser();
    const n = await prisma.notification.create({ data: { userId: a.id, type: 'safety_flag', title: 't', message: 'm' } });
    await request(app).patch(`/api/v1/notifications/${n.id}/read`).set('Authorization', auth(b)).expect(404);
  });

  it('marks all read', async () => {
    const user = await createUser();
    await prisma.notification.create({ data: { userId: user.id, type: 'safety_flag', title: 't', message: 'm' } });
    await prisma.notification.create({ data: { userId: user.id, type: 'safety_flag', title: 't', message: 'm' } });
    await request(app).patch('/api/v1/notifications/read-all').set('Authorization', auth(user)).expect(200);
    expect(await prisma.notification.count({ where: { userId: user.id, isRead: false } })).toBe(0);
  });
});
