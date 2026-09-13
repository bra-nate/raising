/**
 * The follow-up queue. "Due", "overdue" and "aging" are policy decided in the
 * service — these tests pin that policy so it cannot drift into the frontend.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { createUser, createFirstTimer, daysAgo, seedSettings } from '../test/fixtures';

const app = createApp();

function auth(user: { id: string; role: UserRole }) {
  return `Bearer ${signToken({ id: user.id, role: user.role })}`;
}

function getQueue(user: { id: string; role: UserRole }) {
  return request(app).get('/api/v1/first-timers/queue').set('Authorization', auth(user)).expect(200);
}

async function scenario() {
  await seedSettings({ firstContactDays: '2' });
  const lead = await createUser({ role: 'followup_team_lead' });
  const member = await createUser({ role: 'followup_team_member' });
  return { lead, member };
}

describe('the queue sorts visitors into what to do today', () => {
  it('counts a visitor past the first-contact window as overdue', async () => {
    const { lead } = await scenario();
    const ft = await createFirstTimer({ visitDate: daysAgo(5) });

    const res = await getQueue(lead);
    expect(res.body.counts.overdue).toBe(1);
    expect(res.body.overdue[0].id).toBe(ft.id);
    expect(res.body.overdue[0].ageDays).toBe(5);
  });

  it('counts a visitor exactly at the window as due today, not overdue', async () => {
    const { lead } = await scenario();
    await createFirstTimer({ visitDate: daysAgo(2) });

    const res = await getQueue(lead);
    expect(res.body.counts.dueToday).toBe(1);
    expect(res.body.counts.overdue).toBe(0);
  });

  it('leaves a visitor inside the window out of the due and overdue lists', async () => {
    const { lead } = await scenario();
    await createFirstTimer({ visitDate: daysAgo(1) });

    const res = await getQueue(lead);
    expect(res.body.counts.dueToday).toBe(0);
    expect(res.body.counts.overdue).toBe(0);
    expect(res.body.upcoming).toHaveLength(1);
  });

  it('drops a visitor out of the due queue once a call is logged', async () => {
    const { lead, member } = await scenario();
    const ft = await createFirstTimer({ visitDate: daysAgo(5) });

    await request(app)
      .post('/api/v1/first-timer-reports')
      .set('Authorization', auth(member))
      .send({ firstTimerId: ft.id, callOutcome: 'no_answer' })
      .expect(201);

    const res = await getQueue(lead);
    expect(res.body.counts.overdue).toBe(0);
    expect(res.body.counts.total).toBe(1);
  });

  it('surfaces a requested callback', async () => {
    const { lead, member } = await scenario();
    const ft = await createFirstTimer({ visitDate: daysAgo(3) });

    await request(app)
      .post('/api/v1/first-timer-reports')
      .set('Authorization', auth(member))
      .send({ firstTimerId: ft.id, callOutcome: 'callback_requested' })
      .expect(201);

    const res = await getQueue(lead);
    expect(res.body.counts.callbacks).toBe(1);
    expect(res.body.callbacks[0].lastOutcome).toBe('callback_requested');
  });

  it('excludes converted visitors from the queue entirely', async () => {
    const { lead } = await scenario();
    await createFirstTimer({ visitDate: daysAgo(9), status: 'converted' });

    const res = await getQueue(lead);
    expect(res.body.counts.total).toBe(0);
  });

  it('buckets uncontacted visitors by age', async () => {
    const { lead } = await scenario();
    await createFirstTimer({ visitDate: daysAgo(1) });
    await createFirstTimer({ visitDate: daysAgo(5) });
    await createFirstTimer({ visitDate: daysAgo(10) });
    await createFirstTimer({ visitDate: daysAgo(30) });

    const res = await getQueue(lead);
    expect(res.body.aging).toEqual({ d0_2: 1, d3_7: 1, d8_14: 1, d15plus: 1 });
  });
});

describe('the queue respects role scope', () => {
  it('shows a team member their own plus the unassigned pool, never another’s', async () => {
    const { member } = await scenario();
    const other = await createUser({ role: 'followup_team_member' });
    const mine = await createFirstTimer({ visitDate: daysAgo(5), assignedToId: member.id });
    const pool = await createFirstTimer({ visitDate: daysAgo(5) });
    await createFirstTimer({ visitDate: daysAgo(5), assignedToId: other.id });

    const res = await getQueue(member);
    expect(res.body.counts.total).toBe(2);
    expect(res.body.overdue.map((r: { id: string }) => r.id).sort()).toEqual([mine.id, pool.id].sort());
  });

  it('withholds workload from a team member and gives it to the lead', async () => {
    const { lead, member } = await scenario();
    await createFirstTimer({ visitDate: daysAgo(5), assignedToId: member.id });

    expect((await getQueue(member)).body.workload).toEqual([]);

    const leadView = await getQueue(lead);
    expect(leadView.body.workload).toHaveLength(1);
    expect(leadView.body.workload[0]).toMatchObject({ userId: member.id, open: 1, overdue: 1 });
  });
});

describe('assignment is explicit and recorded', () => {
  it('assigns, notifies, and logs', async () => {
    const { lead, member } = await scenario();
    const ft = await createFirstTimer({ visitDate: daysAgo(1) });

    await request(app)
      .patch(`/api/v1/first-timers/${ft.id}/assign`)
      .set('Authorization', auth(lead))
      .send({ assignedToId: member.id })
      .expect(200);

    expect((await prisma.firstTimer.findUniqueOrThrow({ where: { id: ft.id } })).assignedToId).toBe(member.id);
    expect(
      await prisma.notification.count({ where: { userId: member.id, type: 'first_timer_assigned' } })
    ).toBe(1);

    const log = await prisma.activityLog.findFirst({ where: { action: 'assigned_first_timer', entityId: ft.id } });
    expect(log?.userId).toBe(lead.id);
  });

  it('403s a team member assigning', async () => {
    const { member } = await scenario();
    const ft = await createFirstTimer({ visitDate: daysAgo(1) });

    await request(app)
      .patch(`/api/v1/first-timers/${ft.id}/assign`)
      .set('Authorization', auth(member))
      .send({ assignedToId: member.id })
      .expect(403);
  });

  it('records a claim when a team member logs the first call on an unassigned visitor', async () => {
    const { member } = await scenario();
    const ft = await createFirstTimer({ visitDate: daysAgo(3) });

    await request(app)
      .post('/api/v1/first-timer-reports')
      .set('Authorization', auth(member))
      .send({ firstTimerId: ft.id, callOutcome: 'answered' })
      .expect(201);

    expect((await prisma.firstTimer.findUniqueOrThrow({ where: { id: ft.id } })).assignedToId).toBe(member.id);
    const log = await prisma.activityLog.findFirst({ where: { action: 'claimed_first_timer', entityId: ft.id } });
    expect(log?.userId).toBe(member.id);
  });
});
