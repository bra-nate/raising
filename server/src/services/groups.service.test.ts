/**
 * Group management. The rules that matter: a group with members is never
 * dropped, and a group that changes leader takes its members with it.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { createUser, createMember, seedSettings } from '../test/fixtures';

const app = createApp();

function auth(user: { id: string; role: UserRole }) {
  return `Bearer ${signToken({ id: user.id, role: user.role })}`;
}

async function scenario() {
  await seedSettings();
  const pastor = await createUser({ role: 'pastor' });
  const leader = await createUser({ role: 'leader' });
  return { pastor, leader };
}

function createGroup(pastor: { id: string; role: UserRole }, leaderId: string, name = 'Zone A') {
  return request(app)
    .post('/api/v1/groups')
    .set('Authorization', auth(pastor))
    .send({ name, leaderId })
    .expect(201);
}

describe('a pastor manages groups', () => {
  it('creates a group and logs it', async () => {
    const { pastor, leader } = await scenario();
    const res = await createGroup(pastor, leader.id);

    expect(res.body.name).toBe('Zone A');
    const log = await prisma.activityLog.findFirst({ where: { action: 'created_group', entityId: res.body.id } });
    expect(log?.userId).toBe(pastor.id);
  });

  it('rejects a group pointed at a non-leader', async () => {
    const { pastor } = await scenario();
    const followup = await createUser({ role: 'followup_team_member' });

    await request(app)
      .post('/api/v1/groups')
      .set('Authorization', auth(pastor))
      .send({ name: 'Zone A', leaderId: followup.id })
      .expect(400);
  });

  it('403s a leader creating a group', async () => {
    const { leader } = await scenario();
    await request(app)
      .post('/api/v1/groups')
      .set('Authorization', auth(leader))
      .send({ name: 'Zone A', leaderId: leader.id })
      .expect(403);
  });

  it('reports member, silence and case counts per group', async () => {
    const { pastor, leader } = await scenario();
    const group = (await createGroup(pastor, leader.id)).body;
    const m1 = await createMember(leader.id, { lastReportDate: new Date() });
    const m2 = await createMember(leader.id, { lastReportDate: null });
    await prisma.member.updateMany({ where: { id: { in: [m1.id, m2.id] } }, data: { groupId: group.id } });
    await prisma.case.create({ data: { kind: 'concern', memberId: m1.id } });

    const res = await request(app).get('/api/v1/groups').set('Authorization', auth(pastor)).expect(200);
    expect(res.body.data[0]).toMatchObject({ memberCount: 2, silentCount: 1, openCaseCount: 1 });
  });

  it('shows a leader only their own groups', async () => {
    const { pastor, leader } = await scenario();
    const otherLeader = await createUser({ role: 'leader' });
    await createGroup(pastor, leader.id, 'Mine');
    await createGroup(pastor, otherLeader.id, 'Theirs');

    const res = await request(app).get('/api/v1/groups').set('Authorization', auth(leader)).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Mine');
  });
});

describe('a group that changes leader takes its members with it', () => {
  it('reassigns every member to the new leader', async () => {
    const { pastor, leader } = await scenario();
    const newLeader = await createUser({ role: 'leader' });
    const group = (await createGroup(pastor, leader.id)).body;
    const member = await createMember(leader.id);
    await prisma.member.update({ where: { id: member.id }, data: { groupId: group.id } });

    await request(app)
      .patch(`/api/v1/groups/${group.id}`)
      .set('Authorization', auth(pastor))
      .send({ leaderId: newLeader.id })
      .expect(200);

    const moved = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(moved.assignedLeaderId).toBe(newLeader.id);
  });

  it('leaves members alone on a plain rename', async () => {
    const { pastor, leader } = await scenario();
    const group = (await createGroup(pastor, leader.id)).body;
    const member = await createMember(leader.id);
    await prisma.member.update({ where: { id: member.id }, data: { groupId: group.id } });

    await request(app)
      .patch(`/api/v1/groups/${group.id}`)
      .set('Authorization', auth(pastor))
      .send({ name: 'Zone B' })
      .expect(200);

    expect((await prisma.member.findUniqueOrThrow({ where: { id: member.id } })).assignedLeaderId).toBe(leader.id);
  });
});

describe('a group with members is never dropped', () => {
  it('409s deleting a group that still has members', async () => {
    const { pastor, leader } = await scenario();
    const group = (await createGroup(pastor, leader.id)).body;
    const member = await createMember(leader.id);
    await prisma.member.update({ where: { id: member.id }, data: { groupId: group.id } });

    await request(app).delete(`/api/v1/groups/${group.id}`).set('Authorization', auth(pastor)).expect(409);
    expect(await prisma.group.count({ where: { id: group.id } })).toBe(1);
  });

  it('deletes an empty group and keeps the log entry', async () => {
    const { pastor, leader } = await scenario();
    const group = (await createGroup(pastor, leader.id)).body;

    await request(app).delete(`/api/v1/groups/${group.id}`).set('Authorization', auth(pastor)).expect(200);
    expect(await prisma.group.count({ where: { id: group.id } })).toBe(0);
    expect(await prisma.activityLog.count({ where: { action: 'deleted_group', entityId: group.id } })).toBe(1);
  });

  it('moves members to another group, following its leader', async () => {
    const { pastor, leader } = await scenario();
    const otherLeader = await createUser({ role: 'leader' });
    const from = (await createGroup(pastor, leader.id, 'From')).body;
    const to = (await createGroup(pastor, otherLeader.id, 'To')).body;
    const member = await createMember(leader.id);
    await prisma.member.update({ where: { id: member.id }, data: { groupId: from.id } });

    const res = await request(app)
      .patch(`/api/v1/groups/${from.id}/move-members`)
      .set('Authorization', auth(pastor))
      .send({ targetGroupId: to.id })
      .expect(200);

    expect(res.body.moved).toBe(1);
    const moved = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(moved.groupId).toBe(to.id);
    expect(moved.assignedLeaderId).toBe(otherLeader.id);

    await request(app).delete(`/api/v1/groups/${from.id}`).set('Authorization', auth(pastor)).expect(200);
  });
});
