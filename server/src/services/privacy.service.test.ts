/**
 * Privacy controls. The rules that must not bend: safeguarding records are
 * never redacted, retention never acts on its own, and an export is complete.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { createUser, createMember, createFirstTimer, daysAgo, seedSettings } from '../test/fixtures';
import { privacyService } from './privacy.service';

const app = createApp();
const MONTH = 30 * 86_400_000;

function auth(user: { id: string; role: UserRole }) {
  return `Bearer ${signToken({ id: user.id, role: user.role })}`;
}

function monthsAgo(n: number): Date {
  return new Date(Date.now() - n * MONTH);
}

async function scenario(settings: Record<string, string> = {}) {
  await seedSettings({ retentionMonths: '12', retentionMode: 'report_and_redact', ...settings });
  const pastor = await createUser({ role: 'pastor' });
  const leader = await createUser({ role: 'leader' });
  return { pastor, leader };
}

/** A deactivated member whose last report is `months` old. */
async function agedMember(leaderId: string, months: number, opts: { safety?: boolean } = {}) {
  const member = await createMember(leaderId);
  await prisma.member.update({ where: { id: member.id }, data: { isActive: false } });
  await prisma.memberReport.create({
    data: {
      memberId: member.id,
      leaderId,
      statusTag: 'good',
      content: 'old pastoral note',
      isSafetyFlagged: opts.safety ?? false,
      createdAt: monthsAgo(months),
    },
  });
  return member;
}

describe('retention flags only what has aged out', () => {
  it('flags a deactivated member past the window', async () => {
    const { pastor, leader } = await scenario();
    const member = await agedMember(leader.id, 18);

    const res = await request(app).get('/api/v1/privacy/retention').set('Authorization', auth(pastor)).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({ type: 'member', id: member.id, exemptReason: null });
  });

  it('leaves an active member alone however quiet they are', async () => {
    const { pastor, leader } = await scenario();
    const member = await createMember(leader.id, { lastReportDate: null });
    await prisma.memberReport.create({
      data: { memberId: member.id, leaderId: leader.id, statusTag: 'good', content: 'x', createdAt: monthsAgo(36) },
    });

    const res = await request(app).get('/api/v1/privacy/retention').set('Authorization', auth(pastor)).expect(200);
    expect(res.body.total).toBe(0);
  });

  it('marks a safety-flagged record exempt rather than listing it as actionable', async () => {
    const { pastor, leader } = await scenario();
    await agedMember(leader.id, 24, { safety: true });

    const res = await request(app).get('/api/v1/privacy/retention').set('Authorization', auth(pastor)).expect(200);
    expect(res.body.data[0].exemptReason).toMatch(/safety-flagged/i);
  });

  it('flags nothing at all when retention is set to indefinite', async () => {
    const { pastor, leader } = await scenario({ retentionMonths: '0' });
    await agedMember(leader.id, 60);

    const res = await request(app).get('/api/v1/privacy/retention').set('Authorization', auth(pastor)).expect(200);
    expect(res.body.total).toBe(0);
  });
});

describe('retention never acts on its own', () => {
  it('notifies rather than redacts, once a day', async () => {
    const { pastor, leader } = await scenario();
    const member = await agedMember(leader.id, 18);

    expect(await privacyService.notifyRetentionDue()).toEqual({ notified: 1 });
    expect(await privacyService.notifyRetentionDue()).toEqual({ notified: 0 });

    expect(await prisma.notification.count({ where: { userId: pastor.id, type: 'retention_due' } })).toBe(1);
    const report = await prisma.memberReport.findFirstOrThrow({ where: { memberId: member.id } });
    expect(report.content).toBe('old pastoral note');
  });

  it('refuses redaction while the mode is report_only', async () => {
    const { pastor, leader } = await scenario({ retentionMode: 'report_only' });
    const member = await agedMember(leader.id, 18);

    await request(app)
      .post(`/api/v1/privacy/retention/member/${member.id}/redact`)
      .set('Authorization', auth(pastor))
      .expect(403);
  });

  it('refuses to redact a record holding a safety-flagged report', async () => {
    const { pastor, leader } = await scenario();
    const member = await agedMember(leader.id, 24, { safety: true });

    await request(app)
      .post(`/api/v1/privacy/retention/member/${member.id}/redact`)
      .set('Authorization', auth(pastor))
      .expect(403);

    const report = await prisma.memberReport.findFirstOrThrow({ where: { memberId: member.id } });
    expect(report.content).toBe('old pastoral note');
  });

  it('redacts content and contact details when the pastor acts, keeping the row', async () => {
    const { pastor, leader } = await scenario();
    const member = await agedMember(leader.id, 18);
    await prisma.member.update({ where: { id: member.id }, data: { phone: '0200000000' } });

    await request(app)
      .post(`/api/v1/privacy/retention/member/${member.id}/redact`)
      .set('Authorization', auth(pastor))
      .expect(200);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.phone).toBeNull();
    expect(after.retentionRedactedAt).not.toBeNull();

    const report = await prisma.memberReport.findFirstOrThrow({ where: { memberId: member.id } });
    expect(report.content).toBe('[Redacted — retention]');

    expect(
      await prisma.activityLog.count({ where: { action: 'redacted_for_retention', entityId: member.id } })
    ).toBe(1);
  });

  it('drops a redacted record out of the candidate list', async () => {
    const { pastor, leader } = await scenario();
    const member = await agedMember(leader.id, 18);

    await request(app)
      .post(`/api/v1/privacy/retention/member/${member.id}/redact`)
      .set('Authorization', auth(pastor))
      .expect(200);

    const res = await request(app).get('/api/v1/privacy/retention').set('Authorization', auth(pastor)).expect(200);
    expect(res.body.total).toBe(0);
  });
});

describe('subject access export', () => {
  it('returns everything held on a member, confidential reports included, and logs the access', async () => {
    const { pastor, leader } = await scenario();
    const member = await createMember(leader.id);
    await prisma.memberReport.create({
      data: { memberId: member.id, leaderId: leader.id, statusTag: 'good', content: 'open note' },
    });
    await prisma.memberReport.create({
      data: {
        memberId: member.id,
        leaderId: leader.id,
        statusTag: 'concern',
        content: 'private note',
        isConfidential: true,
      },
    });

    const res = await request(app)
      .get(`/api/v1/privacy/export/member/${member.id}`)
      .set('Authorization', auth(pastor))
      .expect(200);

    expect(res.body.reports).toHaveLength(2);
    expect(res.body.reports.map((r: { content: string }) => r.content)).toContain('private note');
    expect(
      await prisma.activityLog.count({ where: { action: 'exported_person_data', entityId: member.id } })
    ).toBe(1);
  });

  it('includes the calls made before a converted member joined', async () => {
    const { pastor, leader } = await scenario();
    const caller = await createUser({ role: 'followup_team_member' });
    const ft = await createFirstTimer({ visitDate: daysAgo(40) });
    await prisma.firstTimerReport.create({
      data: { firstTimerId: ft.id, reportedById: caller.id, callOutcome: 'answered', content: 'first call' },
    });
    const member = await createMember(leader.id);
    await prisma.member.update({ where: { id: member.id }, data: { convertedFromFirstTimerId: ft.id } });

    const res = await request(app)
      .get(`/api/v1/privacy/export/member/${member.id}`)
      .set('Authorization', auth(pastor))
      .expect(200);

    expect(res.body.callsBeforeJoining).toHaveLength(1);
    expect(res.body.callsBeforeJoining[0].content).toBe('first call');
  });

  it('403s a leader exporting anybody', async () => {
    const { leader } = await scenario();
    const member = await createMember(leader.id);
    await request(app)
      .get(`/api/v1/privacy/export/member/${member.id}`)
      .set('Authorization', auth(leader))
      .expect(403);
  });
});

describe('confidential access review', () => {
  it('groups confidential views by reader', async () => {
    const { pastor, leader } = await scenario();
    const member = await createMember(leader.id);
    for (let i = 0; i < 3; i += 1) {
      await prisma.activityLog.create({
        data: {
          userId: leader.id,
          action: 'viewed_confidential_report',
          entityType: 'member',
          entityId: member.id,
        },
      });
    }

    const res = await request(app)
      .get('/api/v1/privacy/confidential-access')
      .set('Authorization', auth(pastor))
      .expect(200);

    expect(res.body.total).toBe(3);
    expect(res.body.byUser[0]).toMatchObject({ userId: leader.id, views: 3 });
  });
});

describe('legal basis', () => {
  it('records why a person’s data is held', async () => {
    const { pastor, leader } = await scenario();
    const member = await createMember(leader.id);

    await request(app)
      .patch(`/api/v1/privacy/legal-basis/member/${member.id}`)
      .set('Authorization', auth(pastor))
      .send({ legalBasis: 'Legitimate interest', consentNote: 'Verbal consent at membership class' })
      .expect(200);

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.legalBasis).toBe('Legitimate interest');
    expect(after.consentNote).toBe('Verbal consent at membership class');
  });
});
