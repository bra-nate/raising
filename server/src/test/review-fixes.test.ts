/**
 * Regressions found in review. Each test here failed before its fix.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { createUser, createMember, createFirstTimer, daysAgo, seedSettings } from './fixtures';

const app = createApp();

function auth(user: { id: string; role: UserRole }) {
  return `Bearer ${signToken({ id: user.id, role: user.role })}`;
}

describe('queue attempt totals count every call, not just the newest', () => {
  it('reports three attempts after three calls', async () => {
    await seedSettings({ firstContactDays: '2' });
    const lead = await createUser({ role: 'followup_team_lead' });
    const caller = await createUser({ role: 'followup_team_member' });
    const ft = await createFirstTimer({ visitDate: daysAgo(9), assignedToId: caller.id });

    for (const outcome of ['no_answer', 'no_answer', 'callback_requested']) {
      await request(app)
        .post('/api/v1/first-timer-reports')
        .set('Authorization', auth(caller))
        .send({ firstTimerId: ft.id, callOutcome: outcome })
        .expect(201);
    }

    const res = await request(app)
      .get('/api/v1/first-timers/queue')
      .set('Authorization', auth(lead))
      .expect(200);

    expect(res.body.callbacks[0].attempts).toBe(3);
  });
});

describe('a callback with a date is scheduled, not outstanding', () => {
  async function setup() {
    await seedSettings({ firstContactDays: '2' });
    const lead = await createUser({ role: 'followup_team_lead' });
    const caller = await createUser({ role: 'followup_team_member' });
    return { lead, caller };
  }

  function logCallback(caller: { id: string; role: UserRole }, firstTimerId: string, callbackAt?: string) {
    return request(app)
      .post('/api/v1/first-timer-reports')
      .set('Authorization', auth(caller))
      .send({ firstTimerId, callOutcome: 'callback_requested', callbackAt })
      .expect(201);
  }

  it('holds a future callback out of the due list', async () => {
    const { lead, caller } = await setup();
    const ft = await createFirstTimer({ visitDate: daysAgo(5), assignedToId: caller.id });
    await logCallback(caller, ft.id, new Date(Date.now() + 3 * 86_400_000).toISOString());

    const res = await request(app).get('/api/v1/first-timers/queue').set('Authorization', auth(lead)).expect(200);
    expect(res.body.counts.callbacks).toBe(0);
    expect(res.body.counts.callbacksScheduled).toBe(1);
  });

  it('brings a callback due once its date arrives', async () => {
    const { lead, caller } = await setup();
    const ft = await createFirstTimer({ visitDate: daysAgo(5), assignedToId: caller.id });
    await logCallback(caller, ft.id, daysAgo(1).toISOString());

    const res = await request(app).get('/api/v1/first-timers/queue').set('Authorization', auth(lead)).expect(200);
    expect(res.body.counts.callbacks).toBe(1);
    expect(res.body.counts.callbacksScheduled).toBe(0);
  });

  it('treats a callback with no date as due rather than hiding it', async () => {
    const { lead, caller } = await setup();
    const ft = await createFirstTimer({ visitDate: daysAgo(5), assignedToId: caller.id });
    await logCallback(caller, ft.id);

    const res = await request(app).get('/api/v1/first-timers/queue').set('Authorization', auth(lead)).expect(200);
    expect(res.body.counts.callbacks).toBe(1);
  });

  it('ignores a callback date on an outcome that is not a callback', async () => {
    const { caller } = await setup();
    const ft = await createFirstTimer({ visitDate: daysAgo(5), assignedToId: caller.id });

    await request(app)
      .post('/api/v1/first-timer-reports')
      .set('Authorization', auth(caller))
      .send({ firstTimerId: ft.id, callOutcome: 'answered', callbackAt: new Date().toISOString() })
      .expect(201);

    const report = await prisma.firstTimerReport.findFirstOrThrow({ where: { firstTimerId: ft.id } });
    expect(report.callbackAt).toBeNull();
  });
});

describe('deleting the newest report corrects the silence cache', () => {
  async function setup() {
    await seedSettings({ allowDeleteReports: 'true', deletePermission: 'pastor_only' });
    const pastor = await createUser({ role: 'pastor' });
    const leader = await createUser({ role: 'leader' });
    const member = await createMember(leader.id);
    return { pastor, leader, member };
  }

  function submit(leader: { id: string; role: UserRole }, memberId: string, content: string) {
    return request(app)
      .post('/api/v1/member-reports')
      .set('Authorization', auth(leader))
      .send({ memberId, statusTag: 'good', content })
      .expect(201);
  }

  it('falls back to the previous report', async () => {
    const { pastor, leader, member } = await setup();
    const first = (await submit(leader, member.id, 'first')).body;
    const second = (await submit(leader, member.id, 'second')).body;

    await request(app)
      .delete(`/api/v1/member-reports/${second.id}`)
      .set('Authorization', auth(pastor))
      .expect(200);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.lastReportDate?.toISOString()).toBe(new Date(first.createdAt).toISOString());
  });

  it('clears the date when the last remaining report is deleted', async () => {
    const { pastor, leader, member } = await setup();
    const only = (await submit(leader, member.id, 'only')).body;

    await request(app)
      .delete(`/api/v1/member-reports/${only.id}`)
      .set('Authorization', auth(pastor))
      .expect(200);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.lastReportDate).toBeNull();

    // And the member reads as overdue again, which is the point.
    const res = await request(app)
      .get(`/api/v1/members/${member.id}`)
      .set('Authorization', auth(pastor))
      .expect(200);
    expect(res.body.silence).toBe('overdue');
  });

  it('leaves the date alone when an older report is deleted', async () => {
    const { pastor, leader, member } = await setup();
    const first = (await submit(leader, member.id, 'first')).body;
    await submit(leader, member.id, 'second');
    const before = (await prisma.member.findUniqueOrThrow({ where: { id: member.id } })).lastReportDate;

    await request(app)
      .delete(`/api/v1/member-reports/${first.id}`)
      .set('Authorization', auth(pastor))
      .expect(200);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.lastReportDate?.toISOString()).toBe(before?.toISOString());
  });
});

describe('subject access export is available as CSV', () => {
  it('returns a sheet covering details, reports and cases', async () => {
    await seedSettings();
    const pastor = await createUser({ role: 'pastor' });
    const leader = await createUser({ role: 'leader' });
    const member = await createMember(leader.id);
    await request(app)
      .post('/api/v1/member-reports')
      .set('Authorization', auth(leader))
      .send({ memberId: member.id, statusTag: 'concern', content: 'a private matter', isConfidential: true })
      .expect(201);

    const res = await request(app)
      .get(`/api/v1/privacy/export/member/${member.id}?format=csv`)
      .set('Authorization', auth(pastor))
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.split('\r\n')[0]).toBe('"Section","Field","Value"');
    expect(res.text).toContain('a private matter');
    expect(res.text).toContain('"Case 1"');
  });
});
