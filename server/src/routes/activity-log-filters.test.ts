import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { createUser } from '../test/fixtures';

const app = createApp();

describe('activity log filters', () => {
  it('combines actor, action, and inclusive date bounds', async () => {
    const pastor = await createUser({ role: 'pastor' });
    const other = await createUser({ role: 'leader' });
    await prisma.activityLog.createMany({
      data: [
        { userId: pastor.id, action: 'logged_in', entityType: 'user', createdAt: new Date('2026-10-10T08:00:00Z') },
        { userId: pastor.id, action: 'updated_member', entityType: 'member', createdAt: new Date('2026-10-11T23:59:00Z') },
        { userId: other.id, action: 'logged_in', entityType: 'user', createdAt: new Date('2026-10-11T12:00:00Z') },
        { userId: pastor.id, action: 'logged_in', entityType: 'user', createdAt: new Date('2026-10-12T00:00:00Z') },
      ],
    });

    const response = await request(app)
      .get('/api/v1/activity-log')
      .query({ userId: pastor.id, action: 'logged_in', from: '2026-10-10', to: '2026-10-11' })
      .set('Authorization', `Bearer ${signToken({ id: pastor.id, role: pastor.role })}`)
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0]).toMatchObject({ userId: pastor.id, action: 'logged_in' });
  });

  it.each([
    { from: 'not-a-date' },
    { from: '2026-02-30' },
    { from: '2026-10-12', to: '2026-10-11' },
    { action: 'invented_action' },
  ])('rejects invalid filters: %j', async (query) => {
    const pastor = await createUser({ role: 'pastor' });
    await request(app)
      .get('/api/v1/activity-log')
      .query(query)
      .set('Authorization', `Bearer ${signToken({ id: pastor.id, role: pastor.role })}`)
      .expect(400);
  });
});
