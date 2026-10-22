import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { createFirstTimer, createMember, createUser, daysAgo, seedSettings } from '../test/fixtures';

const app = createApp();

function auth(user: { id: string; role: UserRole }) {
  return `Bearer ${signToken({ id: user.id, role: user.role })}`;
}

describe('paginated rosters', () => {
  it('returns a bounded, stable member page with metadata', async () => {
    await seedSettings();
    const pastor = await createUser({ role: 'pastor' });
    const leader = await createUser({ role: 'leader', fullName: 'Ada Leader' });
    for (const firstName of ['Echo', 'Alpha', 'Delta', 'Bravo', 'Charlie']) {
      await createMember(leader.id, { firstName, lastName: 'Person', lastReportDate: daysAgo(1) });
    }

    const res = await request(app)
      .get('/api/v1/members?page=2&pageSize=2&sort=name')
      .set('Authorization', auth(pastor))
      .expect(200);

    expect(res.body.data.map((member: { firstName: string }) => member.firstName)).toEqual(['Charlie', 'Delta']);
    expect(res.body).toMatchObject({ total: 5, count: 2, page: 2, pageSize: 2, pageCount: 3 });
  });

  it('filters members by their latest status and computed silence', async () => {
    await seedSettings({ reportThresholdDays: '10' });
    const pastor = await createUser({ role: 'pastor' });
    const leader = await createUser({ role: 'leader' });
    const recovered = await createMember(leader.id, { firstName: 'Recovered', lastReportDate: daysAgo(3) });
    const concern = await createMember(leader.id, { firstName: 'Current', lastReportDate: daysAgo(15) });
    await prisma.memberReport.createMany({
      data: [
        { memberId: recovered.id, leaderId: leader.id, statusTag: 'concern', content: 'old', createdAt: daysAgo(4) },
        { memberId: recovered.id, leaderId: leader.id, statusTag: 'good', content: 'new', createdAt: daysAgo(3) },
        { memberId: concern.id, leaderId: leader.id, statusTag: 'concern', content: 'current', createdAt: daysAgo(2) },
      ],
    });

    const res = await request(app)
      .get('/api/v1/members?page=1&pageSize=25&status=concern&silence=overdue')
      .set('Authorization', auth(pastor))
      .expect(200);

    expect(res.body.data.map((member: { id: string }) => member.id)).toEqual([concern.id]);
    expect(res.body.total).toBe(1);
  });

  it('paginates first-timers after applying search, status, and role scope', async () => {
    const pastor = await createUser({ role: 'pastor' });
    const member = await createUser({ role: 'followup_team_member', fullName: 'Follow Up' });
    const other = await createUser({ role: 'followup_team_member', fullName: 'Other Person' });
    await createFirstTimer({ firstName: 'Ama', assignedToId: member.id, status: 'pending', visitDate: daysAgo(1) });
    await createFirstTimer({ firstName: 'Amara', assignedToId: null, status: 'pending', visitDate: daysAgo(2) });
    await createFirstTimer({ firstName: 'Ama', assignedToId: other.id, status: 'pending', visitDate: daysAgo(3) });
    await createFirstTimer({ firstName: 'Ama', assignedToId: member.id, status: 'converted', visitDate: daysAgo(4) });

    const scoped = await request(app)
      .get('/api/v1/first-timers?page=1&pageSize=1&search=Ama&status=pending&sort=visitDate')
      .set('Authorization', auth(member))
      .expect(200);

    expect(scoped.body.data).toHaveLength(1);
    expect(scoped.body.data[0].firstName).toBe('Ama');
    expect(scoped.body).toMatchObject({ total: 2, count: 1, page: 1, pageSize: 1, pageCount: 2 });

    await request(app)
      .get('/api/v1/first-timers?page=1&pageSize=101')
      .set('Authorization', auth(pastor))
      .expect(400);
  });
});
