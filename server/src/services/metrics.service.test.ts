/**
 * Outcome metrics. These pin the definitions — a median that quietly becomes a
 * mean, or a rate counting converted visitors twice, would look plausible and
 * be wrong.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { createUser, createMember, createFirstTimer, daysAgo, seedSettings } from '../test/fixtures';

const app = createApp();

function auth(user: { id: string; role: UserRole }) {
  return `Bearer ${signToken({ id: user.id, role: user.role })}`;
}

function getMetrics(user: { id: string; role: UserRole }) {
  return request(app).get('/api/v1/metrics').set('Authorization', auth(user)).expect(200);
}

/** A call logged `daysAfter` the visit, written directly to control the clock. */
async function logCall(firstTimerId: string, reportedById: string, visitDate: Date, daysAfter: number) {
  return prisma.firstTimerReport.create({
    data: {
      firstTimerId,
      reportedById,
      callOutcome: 'answered',
      createdAt: new Date(visitDate.getTime() + daysAfter * 86_400_000),
    },
  });
}

async function scenario() {
  await seedSettings();
  const pastor = await createUser({ role: 'pastor' });
  const caller = await createUser({ role: 'followup_team_member' });
  return { pastor, caller };
}

describe('first-contact latency', () => {
  it('takes the median, not the mean', async () => {
    const { pastor, caller } = await scenario();
    // 1, 2, 30 days → median 2, mean ~11.
    for (const d of [1, 2, 30]) {
      const visit = daysAgo(40);
      const ft = await createFirstTimer({ visitDate: visit });
      await logCall(ft.id, caller.id, visit, d);
    }

    const res = await getMetrics(pastor);
    expect(res.body.firstContact.medianDays).toBe(2);
    expect(res.body.firstContact.contacted).toBe(3);
  });

  it('counts visitors nobody ever called', async () => {
    const { pastor } = await scenario();
    await createFirstTimer({ visitDate: daysAgo(20) });

    const res = await getMetrics(pastor);
    expect(res.body.firstContact.neverContacted).toBe(1);
    expect(res.body.firstContact.medianDays).toBeNull();
  });
});

describe('conversion', () => {
  it('reports a rate per assignee', async () => {
    const { pastor, caller } = await scenario();
    await createFirstTimer({ visitDate: daysAgo(10), assignedToId: caller.id, status: 'converted' });
    await createFirstTimer({ visitDate: daysAgo(10), assignedToId: caller.id });

    const res = await getMetrics(pastor);
    expect(res.body.conversion.byAssignee[0]).toMatchObject({
      userId: caller.id,
      assigned: 2,
      converted: 1,
      rate: 50,
    });
  });

  it('returns a null rate for a month with no visitors rather than zero', async () => {
    const { pastor } = await scenario();
    const res = await getMetrics(pastor);
    expect(res.body.conversion.byMonth.every((m: { rate: number | null }) => m.rate === null)).toBe(true);
  });
});

describe('case resolution', () => {
  it('measures days from opening to resolution and tracks the oldest open case', async () => {
    const { pastor } = await scenario();
    const leader = await createUser({ role: 'leader' });
    const member = await createMember(leader.id);

    await prisma.case.create({
      data: {
        kind: 'concern',
        memberId: member.id,
        status: 'resolved',
        createdAt: daysAgo(10),
        resolvedAt: daysAgo(6),
        resolutionNote: 'done',
      },
    });
    await prisma.case.create({ data: { kind: 'safety', memberId: member.id, createdAt: daysAgo(3) } });

    const res = await getMetrics(pastor);
    expect(res.body.caseResolution.medianDaysConcern).toBe(4);
    expect(res.body.caseResolution.open).toBe(1);
    expect(res.body.caseResolution.oldestOpenDays).toBe(3);
  });
});

describe('leader consistency', () => {
  it('scores a leader who reported on every member higher than one who reported on none', async () => {
    const { pastor } = await scenario();
    const diligent = await createUser({ role: 'leader' });
    const silent = await createUser({ role: 'leader' });
    const m1 = await createMember(diligent.id);
    await createMember(silent.id);
    await prisma.memberReport.create({
      data: { memberId: m1.id, leaderId: diligent.id, statusTag: 'good', content: 'x' },
    });

    const res = await getMetrics(pastor);
    const rows: { userId: string; rate: number | null }[] = res.body.leaderConsistency.leaders;
    const diligentRow = rows.find((r) => r.userId === diligent.id)!;
    const silentRow = rows.find((r) => r.userId === silent.id)!;

    expect(diligentRow.rate).toBeGreaterThan(silentRow.rate!);
    expect(silentRow.rate).toBe(0);
    // Worst first — the list exists to show where care is slipping.
    expect(rows[0].userId).toBe(silent.id);
  });
});

describe('group risk', () => {
  it('ranks groups by silence rate and includes ungrouped members', async () => {
    const { pastor } = await scenario();
    const leader = await createUser({ role: 'leader' });
    const group = await prisma.group.create({ data: { name: 'Zone A', leaderId: leader.id } });
    const silent = await createMember(leader.id, { lastReportDate: null });
    await prisma.member.update({ where: { id: silent.id }, data: { groupId: group.id } });
    await createMember(leader.id, { lastReportDate: new Date() });

    const res = await getMetrics(pastor);
    expect(res.body.groupRisk[0]).toMatchObject({ name: 'Zone A', members: 1, silent: 1, silenceRate: 100 });
    expect(res.body.groupRisk.map((g: { name: string }) => g.name)).toContain('No group');
  });
});

describe('access', () => {
  it('403s a leader', async () => {
    await scenario();
    const leader = await createUser({ role: 'leader' });
    await request(app).get('/api/v1/metrics').set('Authorization', auth(leader)).expect(403);
  });

  it('exports the tables as CSV', async () => {
    const { pastor } = await scenario();
    const res = await request(app)
      .get('/api/v1/metrics/export.csv')
      .set('Authorization', auth(pastor))
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.split('\r\n')[0]).toBe('"Section","Key","Metric","Value"');
  });
});
