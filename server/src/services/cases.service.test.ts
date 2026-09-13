/**
 * Case lifecycle: a report that names a problem must open a case, a safety case
 * must escalate if nobody acknowledges it, and no case closes without a note.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { StatusTag, UserRole } from '@prisma/client';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { createUser, createMember, seedSettings } from '../test/fixtures';
import { casesService } from './cases.service';

const app = createApp();

function auth(user: { id: string; role: UserRole }) {
  return `Bearer ${signToken({ id: user.id, role: user.role })}`;
}

/** Submit a report through the API so the real transaction path runs. */
async function submitReport(
  leader: { id: string; role: UserRole },
  memberId: string,
  statusTag: StatusTag,
  isSafetyFlagged = false
) {
  return request(app)
    .post('/api/v1/member-reports')
    .set('Authorization', auth(leader))
    .send({ memberId, statusTag, content: 'report content', isSafetyFlagged })
    .expect(201);
}

async function scenario() {
  await seedSettings({ safetyAckHours: '4', concernDueDays: '7' });
  const pastor = await createUser({ role: 'pastor' });
  const leader = await createUser({ role: 'leader' });
  const member = await createMember(leader.id);
  return { pastor, leader, member };
}

describe('a report that names a problem opens a case', () => {
  it('opens a concern case for needs_attention and sets a due date', async () => {
    const { leader, member } = await scenario();
    await submitReport(leader, member.id, 'needs_attention');

    const c = await prisma.case.findFirstOrThrow({ where: { memberId: member.id } });
    expect(c.kind).toBe('concern');
    expect(c.status).toBe('open');
    expect(c.dueDate).not.toBeNull();
  });

  it('opens a safety case when the report is safety-flagged, whatever the status tag', async () => {
    const { leader, member } = await scenario();
    await submitReport(leader, member.id, 'good', true);

    const c = await prisma.case.findFirstOrThrow({ where: { memberId: member.id } });
    expect(c.kind).toBe('safety');
  });

  it('opens no case for a plain good report', async () => {
    const { leader, member } = await scenario();
    await submitReport(leader, member.id, 'good');
    expect(await prisma.case.count({ where: { memberId: member.id } })).toBe(0);
  });

  it('bumps the existing case rather than opening a duplicate', async () => {
    const { leader, member } = await scenario();
    await submitReport(leader, member.id, 'needs_attention');
    await submitReport(leader, member.id, 'concern');

    const cases = await prisma.case.findMany({ where: { memberId: member.id } });
    expect(cases).toHaveLength(1);
    expect(cases[0].reportCount).toBe(2);
  });

  it('tracks a concern and a safety case on the same member separately', async () => {
    const { leader, member } = await scenario();
    await submitReport(leader, member.id, 'concern');
    await submitReport(leader, member.id, 'good', true);

    const kinds = (await prisma.case.findMany({ where: { memberId: member.id } })).map((c) => c.kind).sort();
    expect(kinds).toEqual(['concern', 'safety']);
  });
});

describe('safety cases are pastor business', () => {
  it('403s a leader acknowledging a safety case on their own member', async () => {
    const { leader, member } = await scenario();
    await submitReport(leader, member.id, 'good', true);
    const c = await prisma.case.findFirstOrThrow({ where: { memberId: member.id } });

    await request(app)
      .patch(`/api/v1/cases/${c.id}/acknowledge`)
      .set('Authorization', auth(leader))
      .expect(403);
  });

  it('lets a leader acknowledge their own concern case', async () => {
    const { leader, member } = await scenario();
    await submitReport(leader, member.id, 'concern');
    const c = await prisma.case.findFirstOrThrow({ where: { memberId: member.id } });

    const res = await request(app)
      .patch(`/api/v1/cases/${c.id}/acknowledge`)
      .set('Authorization', auth(leader))
      .expect(200);
    expect(res.body.status).toBe('acknowledged');
  });

  it('never shows a leader another leader’s cases', async () => {
    const { leader, member } = await scenario();
    const otherLeader = await createUser({ role: 'leader' });
    const otherMember = await createMember(otherLeader.id);
    await submitReport(leader, member.id, 'concern');
    await submitReport(otherLeader, otherMember.id, 'concern');

    const res = await request(app)
      .get('/api/v1/cases')
      .set('Authorization', auth(leader))
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].memberId).toBe(member.id);
  });

  it('403s a leader reading another leader’s case by id', async () => {
    const { leader } = await scenario();
    const otherLeader = await createUser({ role: 'leader' });
    const otherMember = await createMember(otherLeader.id);
    await submitReport(otherLeader, otherMember.id, 'concern');
    const c = await prisma.case.findFirstOrThrow({ where: { memberId: otherMember.id } });

    await request(app).get(`/api/v1/cases/${c.id}`).set('Authorization', auth(leader)).expect(403);
  });
});

describe('a case cannot be closed silently', () => {
  it('400s a resolve with no note, leaving the case open', async () => {
    const { pastor, leader, member } = await scenario();
    await submitReport(leader, member.id, 'concern');
    const c = await prisma.case.findFirstOrThrow({ where: { memberId: member.id } });

    await request(app)
      .patch(`/api/v1/cases/${c.id}/resolve`)
      .set('Authorization', auth(pastor))
      .send({ resolutionNote: '   ' })
      .expect(400);

    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('open');
  });

  it('records who closed it, when, and why', async () => {
    const { pastor, leader, member } = await scenario();
    await submitReport(leader, member.id, 'concern');
    const c = await prisma.case.findFirstOrThrow({ where: { memberId: member.id } });

    await request(app)
      .patch(`/api/v1/cases/${c.id}/resolve`)
      .set('Authorization', auth(pastor))
      .send({ resolutionNote: 'Visited at home, settled.' })
      .expect(200);

    const resolved = await prisma.case.findUniqueOrThrow({ where: { id: c.id } });
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedById).toBe(pastor.id);
    expect(resolved.resolutionNote).toBe('Visited at home, settled.');

    const log = await prisma.activityLog.findFirst({ where: { action: 'resolved_case', entityId: c.id } });
    expect(log?.userId).toBe(pastor.id);
  });

  it('400s resolving a case twice', async () => {
    const { pastor, leader, member } = await scenario();
    await submitReport(leader, member.id, 'concern');
    const c = await prisma.case.findFirstOrThrow({ where: { memberId: member.id } });
    const resolve = () =>
      request(app)
        .patch(`/api/v1/cases/${c.id}/resolve`)
        .set('Authorization', auth(pastor))
        .send({ resolutionNote: 'done' });

    await resolve().expect(200);
    await resolve().expect(400);
  });
});

describe('an unacknowledged safety case escalates', () => {
  /** Age a case by rewriting createdAt — the clock is what is under test. */
  async function ageCase(id: string, hours: number) {
    await prisma.case.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - hours * 3_600_000) },
    });
  }

  it('does not escalate inside the acknowledgement window', async () => {
    const { leader, member } = await scenario();
    await submitReport(leader, member.id, 'good', true);
    const c = await prisma.case.findFirstOrThrow({ where: { memberId: member.id } });
    await ageCase(c.id, 1);

    expect(await casesService.escalateStaleSafetyCases()).toEqual({ escalated: 0 });
  });

  it('escalates past the window and notifies the pastor', async () => {
    const { pastor, leader, member } = await scenario();
    await submitReport(leader, member.id, 'good', true);
    const c = await prisma.case.findFirstOrThrow({ where: { memberId: member.id } });
    await ageCase(c.id, 6);

    expect(await casesService.escalateStaleSafetyCases()).toEqual({ escalated: 1 });
    expect(
      await prisma.notification.count({ where: { userId: pastor.id, type: 'case_escalated', entityId: c.id } })
    ).toBe(1);
  });

  it('escalates a case at most once a day', async () => {
    const { leader, member } = await scenario();
    await submitReport(leader, member.id, 'good', true);
    const c = await prisma.case.findFirstOrThrow({ where: { memberId: member.id } });
    await ageCase(c.id, 6);

    await casesService.escalateStaleSafetyCases();
    expect(await casesService.escalateStaleSafetyCases()).toEqual({ escalated: 0 });
  });

  it('stops escalating once acknowledged', async () => {
    const { pastor, leader, member } = await scenario();
    await submitReport(leader, member.id, 'good', true);
    const c = await prisma.case.findFirstOrThrow({ where: { memberId: member.id } });
    await ageCase(c.id, 6);

    await request(app)
      .patch(`/api/v1/cases/${c.id}/acknowledge`)
      .set('Authorization', auth(pastor))
      .expect(200);

    expect(await casesService.escalateStaleSafetyCases()).toEqual({ escalated: 0 });
  });
});
