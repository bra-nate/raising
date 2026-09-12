/**
 * Security regression tests for the Absolute Rules in CLAUDE.md.
 * Each test here maps to a rule that must never silently regress:
 * leader scope isolation, confidential filtering, safety-flag immutability,
 * and the absence of any activity-log mutation surface.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { StatusTag, UserRole } from '@prisma/client';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { createUser, createMember, seedSettings } from './fixtures';

const app = createApp();

function auth(user: { id: string; role: UserRole }) {
  return `Bearer ${signToken({ id: user.id, role: user.role })}`;
}

function createReport(
  memberId: string,
  leaderId: string,
  overrides: Partial<{ isConfidential: boolean; isSafetyFlagged: boolean; content: string; statusTag: StatusTag }> = {}
) {
  return prisma.memberReport.create({
    data: {
      memberId,
      leaderId,
      statusTag: overrides.statusTag ?? 'good',
      content: overrides.content ?? 'original content',
      isConfidential: overrides.isConfidential ?? false,
      isSafetyFlagged: overrides.isSafetyFlagged ?? false,
    },
  });
}

/** Two leaders, each with one member. The cross-tenant fixture. */
async function twoLeaders() {
  await seedSettings();
  const leaderA = await createUser({ role: 'leader' });
  const leaderB = await createUser({ role: 'leader' });
  const memberA = await createMember(leaderA.id);
  const memberB = await createMember(leaderB.id);
  return { leaderA, leaderB, memberA, memberB };
}

describe('a leader can never reach another leader’s members', () => {
  it('ignores an assignedLeaderId query param aimed at another leader', async () => {
    const { leaderA, leaderB, memberA } = await twoLeaders();
    const res = await request(app)
      .get(`/api/v1/members?assignedLeaderId=${leaderB.id}`)
      .set('Authorization', auth(leaderA))
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(memberA.id);
  });

  it('403 reading another leader’s member by id', async () => {
    const { leaderA, memberB } = await twoLeaders();
    await request(app).get(`/api/v1/members/${memberB.id}`).set('Authorization', auth(leaderA)).expect(403);
  });

  it('403 patching another leader’s member', async () => {
    const { leaderA, memberB } = await twoLeaders();
    await request(app)
      .patch(`/api/v1/members/${memberB.id}`)
      .set('Authorization', auth(leaderA))
      .send({ firstName: 'Hijacked' })
      .expect(403);
    const after = await prisma.member.findUnique({ where: { id: memberB.id } });
    expect(after?.firstName).not.toBe('Hijacked');
  });

  it('403 listing reports for another leader’s member', async () => {
    const { leaderA, leaderB, memberB } = await twoLeaders();
    await createReport(memberB.id, leaderB.id);
    await request(app)
      .get(`/api/v1/member-reports?memberId=${memberB.id}`)
      .set('Authorization', auth(leaderA))
      .expect(403);
  });

  it('403 submitting a report on another leader’s member', async () => {
    const { leaderA, memberB } = await twoLeaders();
    await request(app)
      .post('/api/v1/member-reports')
      .set('Authorization', auth(leaderA))
      .send({ memberId: memberB.id, statusTag: 'good', content: 'not mine to write' })
      .expect(403);
    expect(await prisma.memberReport.count({ where: { memberId: memberB.id } })).toBe(0);
  });

  it('ignores assignedLeaderId in the body when a leader creates a member', async () => {
    const { leaderA, leaderB } = await twoLeaders();
    const res = await request(app)
      .post('/api/v1/members')
      .set('Authorization', auth(leaderA))
      .send({ firstName: 'New', lastName: 'Member', assignedLeaderId: leaderB.id })
      .expect(201);
    expect(res.body.assignedLeaderId).toBe(leaderA.id);
  });
});

describe('confidential reports are filtered in the query, not the frontend', () => {
  it('hides a confidential report authored by someone else on the leader’s own member', async () => {
    await seedSettings();
    const pastor = await createUser({ role: 'pastor' });
    const leader = await createUser({ role: 'leader' });
    const member = await createMember(leader.id);
    await createReport(member.id, pastor.id, { isConfidential: true, content: 'pastor private note' });
    const visible = await createReport(member.id, leader.id, { content: 'leader note' });

    const res = await request(app)
      .get(`/api/v1/member-reports?memberId=${member.id}`)
      .set('Authorization', auth(leader))
      .expect(200);

    expect(res.body.data.map((r: { id: string }) => r.id)).toEqual([visible.id]);
  });

  it('shows a leader their own confidential report', async () => {
    await seedSettings();
    const leader = await createUser({ role: 'leader' });
    const member = await createMember(leader.id);
    const own = await createReport(member.id, leader.id, { isConfidential: true });

    const res = await request(app)
      .get(`/api/v1/member-reports?memberId=${member.id}`)
      .set('Authorization', auth(leader))
      .expect(200);

    expect(res.body.data.map((r: { id: string }) => r.id)).toEqual([own.id]);
  });

  it('shows the pastor every report including confidential ones', async () => {
    await seedSettings();
    const pastor = await createUser({ role: 'pastor' });
    const leader = await createUser({ role: 'leader' });
    const member = await createMember(leader.id);
    await createReport(member.id, leader.id, { isConfidential: true });
    await createReport(member.id, leader.id);

    const res = await request(app)
      .get(`/api/v1/member-reports?memberId=${member.id}`)
      .set('Authorization', auth(pastor))
      .expect(200);

    expect(res.body.data).toHaveLength(2);
  });
});

describe('safety-flagged reports can never be redacted or deleted', () => {
  // allowDeleteReports is ON throughout — the safety flag alone must block these.
  async function flaggedReport() {
    await seedSettings({ allowDeleteReports: 'true', deletePermission: 'leaders' });
    const pastor = await createUser({ role: 'pastor' });
    const leader = await createUser({ role: 'leader' });
    const member = await createMember(leader.id);
    const report = await createReport(member.id, leader.id, {
      isSafetyFlagged: true,
      statusTag: 'concern',
      content: 'must survive',
    });
    return { pastor, leader, report };
  }

  it('403 when the pastor tries to redact one', async () => {
    const { pastor, report } = await flaggedReport();
    await request(app)
      .patch(`/api/v1/member-reports/${report.id}/redact`)
      .set('Authorization', auth(pastor))
      .send({ redactionSummary: 'cleanup' })
      .expect(403);
    const after = await prisma.memberReport.findUnique({ where: { id: report.id } });
    expect(after?.content).toBe('must survive');
    expect(after?.redactedAt).toBeNull();
  });

  it('403 when the pastor tries to delete one', async () => {
    const { pastor, report } = await flaggedReport();
    await request(app)
      .delete(`/api/v1/member-reports/${report.id}`)
      .set('Authorization', auth(pastor))
      .expect(403);
    expect(await prisma.memberReport.findUnique({ where: { id: report.id } })).not.toBeNull();
  });

  it('403 when the authoring leader tries to delete one', async () => {
    const { leader, report } = await flaggedReport();
    await request(app)
      .delete(`/api/v1/member-reports/${report.id}`)
      .set('Authorization', auth(leader))
      .expect(403);
    expect(await prisma.memberReport.findUnique({ where: { id: report.id } })).not.toBeNull();
  });

  it('a non-flagged report is still redactable — proving the flag is what blocks', async () => {
    await seedSettings({ allowDeleteReports: 'true', deletePermission: 'leaders' });
    const pastor = await createUser({ role: 'pastor' });
    const leader = await createUser({ role: 'leader' });
    const member = await createMember(leader.id);
    const report = await createReport(member.id, leader.id, { content: 'ordinary' });

    await request(app)
      .patch(`/api/v1/member-reports/${report.id}/redact`)
      .set('Authorization', auth(pastor))
      .expect(200);
    const after = await prisma.memberReport.findUnique({ where: { id: report.id } });
    expect(after?.content).toBe('[Redacted]');
  });
});

describe('the activity log has no mutation surface', () => {
  it('404 on DELETE — no such route exists', async () => {
    const pastor = await createUser({ role: 'pastor' });
    await request(app)
      .delete('/api/v1/activity-log/anything')
      .set('Authorization', auth(pastor))
      .expect(404);
  });

  it('403 when a leader reads the activity log', async () => {
    const leader = await createUser({ role: 'leader' });
    await request(app).get('/api/v1/activity-log').set('Authorization', auth(leader)).expect(403);
  });
});

describe('role guards on privileged routes', () => {
  it('403 when a leader lists users', async () => {
    const leader = await createUser({ role: 'leader' });
    await request(app).get('/api/v1/users').set('Authorization', auth(leader)).expect(403);
  });

  it('403 when a leader writes settings', async () => {
    await seedSettings({ allowDeleteReports: 'false' });
    const leader = await createUser({ role: 'leader' });
    await request(app)
      .put('/api/v1/settings/allowDeleteReports')
      .set('Authorization', auth(leader))
      .send({ value: 'true' })
      .expect(403);
    expect(await settingValue('allowDeleteReports')).toBe('false');
  });

  it('401 without a token', async () => {
    await request(app).get('/api/v1/members').expect(401);
  });
});

async function settingValue(key: string) {
  return (await prisma.setting.findUnique({ where: { key } }))?.value;
}
