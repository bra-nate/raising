/**
 * Separation of duties: a superadmin administers the platform — accounts,
 * settings, audit — and must never reach pastoral data.
 * See docs/superpowers/specs/2026-07-03-superadmin-and-audit-logging-design.md
 *
 * These are the routes that regressed once already, by being written with
 * `requireRole('pastor', 'superadmin')` out of habit.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { createUser, createMember, seedSettings } from './fixtures';

const app = createApp();

function auth(user: { id: string; role: UserRole }) {
  return `Bearer ${signToken({ id: user.id, role: user.role })}`;
}

async function scenario() {
  await seedSettings();
  const superadmin = await createUser({ role: 'superadmin' });
  const leader = await createUser({ role: 'leader' });
  const member = await createMember(leader.id);
  return { superadmin, leader, member };
}

describe('a superadmin cannot reach pastoral data', () => {
  it('403s on cases', async () => {
    const { superadmin } = await scenario();
    await request(app).get('/api/v1/cases').set('Authorization', auth(superadmin)).expect(403);
  });

  it('403s on a subject-access export — the worst of the four, it returns report content', async () => {
    const { superadmin, member } = await scenario();
    await request(app)
      .get(`/api/v1/privacy/export/member/${member.id}`)
      .set('Authorization', auth(superadmin))
      .expect(403);
  });

  it('403s on retention, which lists members by name', async () => {
    const { superadmin } = await scenario();
    await request(app).get('/api/v1/privacy/retention').set('Authorization', auth(superadmin)).expect(403);
  });

  it('403s on congregation-wide metrics', async () => {
    const { superadmin } = await scenario();
    await request(app).get('/api/v1/metrics').set('Authorization', auth(superadmin)).expect(403);
  });

  it('403s on groups, read and write', async () => {
    const { superadmin, leader } = await scenario();
    await request(app).get('/api/v1/groups').set('Authorization', auth(superadmin)).expect(403);
    await request(app)
      .post('/api/v1/groups')
      .set('Authorization', auth(superadmin))
      .send({ name: 'Zone A', leaderId: leader.id })
      .expect(403);
  });

  it('403s on members and member reports', async () => {
    const { superadmin, member } = await scenario();
    await request(app).get('/api/v1/members').set('Authorization', auth(superadmin)).expect(403);
    await request(app)
      .get(`/api/v1/member-reports?memberId=${member.id}`)
      .set('Authorization', auth(superadmin))
      .expect(403);
  });
});

describe('a superadmin keeps the platform duties the design grants', () => {
  it('reads users, settings and the activity log', async () => {
    const { superadmin } = await scenario();
    await request(app).get('/api/v1/users').set('Authorization', auth(superadmin)).expect(200);
    await request(app).get('/api/v1/settings').set('Authorization', auth(superadmin)).expect(200);
    await request(app).get('/api/v1/activity-log').set('Authorization', auth(superadmin)).expect(200);
  });

  it('creates a user', async () => {
    const { superadmin } = await scenario();
    await request(app)
      .post('/api/v1/users')
      .set('Authorization', auth(superadmin))
      .send({ fullName: 'New Leader', email: 'new.leader@test.local', password: 'password123', role: 'leader' })
      .expect(201);
  });
});

describe('case ownership is an allowlist, because assignment discloses', () => {
  async function concernCase() {
    await seedSettings({ concernDueDays: '7' });
    const pastor = await createUser({ role: 'pastor' });
    const leader = await createUser({ role: 'leader' });
    const member = await createMember(leader.id);
    await request(app)
      .post('/api/v1/member-reports')
      .set('Authorization', auth(leader))
      .send({ memberId: member.id, statusTag: 'concern', content: 'x' })
      .expect(201);
    const c = await prisma.case.findFirstOrThrow({ where: { memberId: member.id } });
    return { pastor, leader, member, c };
  }

  it('rejects a follow-up team member as owner', async () => {
    const { pastor, c } = await concernCase();
    const followup = await createUser({ role: 'followup_team_member' });

    await request(app)
      .patch(`/api/v1/cases/${c.id}/assign`)
      .set('Authorization', auth(pastor))
      .send({ ownerId: followup.id })
      .expect(400);

    // No assignment means no notification leaking the member's name.
    expect(await prisma.notification.count({ where: { userId: followup.id } })).toBe(0);
  });

  it('rejects an unrelated leader as owner', async () => {
    const { pastor, c } = await concernCase();
    const otherLeader = await createUser({ role: 'leader' });

    await request(app)
      .patch(`/api/v1/cases/${c.id}/assign`)
      .set('Authorization', auth(pastor))
      .send({ ownerId: otherLeader.id })
      .expect(400);
  });

  it('accepts the member’s own leader', async () => {
    const { pastor, leader, c } = await concernCase();

    await request(app)
      .patch(`/api/v1/cases/${c.id}/assign`)
      .set('Authorization', auth(pastor))
      .send({ ownerId: leader.id })
      .expect(200);

    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).ownerId).toBe(leader.id);
  });

  it('restricts a safety case to a pastor owner, even the member’s own leader', async () => {
    await seedSettings();
    const pastor = await createUser({ role: 'pastor' });
    const leader = await createUser({ role: 'leader' });
    const member = await createMember(leader.id);
    await request(app)
      .post('/api/v1/member-reports')
      .set('Authorization', auth(leader))
      .send({ memberId: member.id, statusTag: 'good', content: 'x', isSafetyFlagged: true })
      .expect(201);
    const c = await prisma.case.findFirstOrThrow({ where: { memberId: member.id, kind: 'safety' } });

    await request(app)
      .patch(`/api/v1/cases/${c.id}/assign`)
      .set('Authorization', auth(pastor))
      .send({ ownerId: leader.id })
      .expect(400);

    await request(app)
      .patch(`/api/v1/cases/${c.id}/assign`)
      .set('Authorization', auth(pastor))
      .send({ ownerId: pastor.id })
      .expect(200);
  });

  it('offers only eligible owners on the case list', async () => {
    const { pastor, leader, c } = await concernCase();
    await createUser({ role: 'followup_team_member' });

    const res = await request(app).get('/api/v1/cases').set('Authorization', auth(pastor)).expect(200);
    const row = res.body.data.find((x: { id: string }) => x.id === c.id);
    expect(row.assignableOwners.map((o: { id: string }) => o.id).sort()).toEqual([pastor.id, leader.id].sort());
  });
});
