/**
 * Demo data — leaders, groups, members, reports, first-timers, call logs.
 * Run with `npm run seed:demo`. Refuses to run when NODE_ENV=production.
 * Idempotent: bails out if the demo leaders already exist.
 */
import { PrismaClient, StatusTag, FirstTimerStatus, CallOutcome } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const PASSWORD = 'changeme123';

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const LEADERS = [
  { fullName: 'Kwame Mensah', email: 'kwame@raising.local', group: 'Grace House' },
  { fullName: 'Abena Owusu', email: 'abena@raising.local', group: 'Hope Cell' },
  { fullName: 'Daniel Boateng', email: 'daniel@raising.local', group: 'Zion Circle' },
  { fullName: 'Esther Adjei', email: 'esther@raising.local', group: 'Well of Life' },
];

const FOLLOWUP = [
  { fullName: 'Naa Ayorkor', email: 'naa@raising.local', role: 'followup_team_lead' as const },
  { fullName: 'Kofi Asante', email: 'kofi@raising.local', role: 'followup_team_member' as const },
];

// 24 members. daysSinceReport drives the silence buckets on the pastor dashboard:
// null = never reported, <14 ok, 14-28 overdue, >28 significantly overdue.
const MEMBERS: [string, string, number | null][] = [
  ['Yaw', 'Darko', 2], ['Akosua', 'Frimpong', 5], ['Kojo', 'Amankwah', 9],
  ['Efua', 'Nyarko', 17], ['Kwabena', 'Oppong', 31], ['Adwoa', 'Sarpong', null],
  ['Nana', 'Agyeman', 1], ['Ama', 'Bediako', 6], ['Kwesi', 'Tetteh', 12],
  ['Abigail', 'Quartey', 21], ['Samuel', 'Ofori', 40], ['Grace', 'Anum', 3],
  ['Isaac', 'Nkrumah', 8], ['Priscilla', 'Baidoo', 15], ['Emmanuel', 'Larbi', 35],
  ['Hannah', 'Addo', null], ['Michael', 'Otoo', 4], ['Rebecca', 'Ansah', 11],
  ['Joshua', 'Aidoo', 19], ['Deborah', 'Kyei', 27], ['Paul', 'Mireku', 7],
  ['Naomi', 'Yeboah', 13], ['Stephen', 'Danso', 45], ['Lydia', 'Appiah', 10],
];

const NOTES: Record<StatusTag, string[]> = {
  good: [
    'Attended midweek service and small group. Shared a testimony about work.',
    'Steady in devotions. Volunteered for the ushering rota this month.',
    'Doing well. Brought a colleague to Sunday service.',
  ],
  needs_attention: [
    'Missed two Sundays running. Said work shifts changed — following up.',
    'Seems withdrawn in group. Agreed to meet for coffee next week.',
    'Struggling with consistency in devotions. Set a check-in for Friday.',
  ],
  concern: [
    'Family situation at home is difficult. Requested prayer, will visit.',
    'Has not responded to calls in three weeks. Reaching out through a relative.',
    'Financial pressure causing real distress. Needs pastoral support.',
  ],
};

const FIRST_TIMERS: [string, string, number, FirstTimerStatus][] = [
  ['Selorm', 'Attah', 2, 'pending'],
  ['Mavis', 'Okine', 3, 'pending'],
  ['Bright', 'Osei', 6, 'contacted'],
  ['Comfort', 'Tagoe', 9, 'interested'],
  ['Elijah', 'Bonsu', 12, 'contacted'],
  ['Patience', 'Doku', 16, 'not_interested'],
  ['Godfred', 'Annan', 20, 'interested'],
  ['Vida', 'Amoah', 24, 'contacted'],
  ['Theophilus', 'Arthur', 30, 'converted'],
  ['Sandra', 'Nortey', 1, 'pending'],
];

const CALL_NOTES: Record<CallOutcome, string> = {
  answered: 'Spoke briefly. Thanked them for visiting and shared service times.',
  no_answer: 'Called twice, no answer. Left a voice note.',
  callback_requested: 'Was at work. Asked to be called back over the weekend.',
  interested: 'Asked about the midweek group and wants to be connected to a leader.',
  not_interested: 'Polite but said they are settled at another church.',
};

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data in production.');
  }

  const existing = await prisma.user.findUnique({ where: { email: LEADERS[0].email } });
  if (existing) {
    console.log('Demo data already present. Nothing to do.');
    return;
  }

  const pastor = await prisma.user.findFirst({ where: { role: 'pastor' } });
  if (!pastor) throw new Error('No pastor found — run `npm run seed` first.');

  const hash = await bcrypt.hash(PASSWORD, 12);

  const leaders = await Promise.all(
    LEADERS.map((l) =>
      prisma.user.create({ data: { fullName: l.fullName, email: l.email, password: hash, role: 'leader' } })
    )
  );
  const followup = await Promise.all(
    FOLLOWUP.map((f) =>
      prisma.user.create({ data: { fullName: f.fullName, email: f.email, password: hash, role: f.role } })
    )
  );

  const groups = await Promise.all(
    LEADERS.map((l, i) => prisma.group.create({ data: { name: l.group, leaderId: leaders[i].id } }))
  );

  // Members round-robin across the four leaders, each with a short report history.
  let reportCount = 0;
  for (let i = 0; i < MEMBERS.length; i++) {
    const [firstName, lastName, since] = MEMBERS[i];
    const leader = leaders[i % leaders.length];
    const member = await prisma.member.create({
      data: {
        firstName,
        lastName,
        phone: `+2332${String(40000000 + i * 137).slice(0, 8)}`,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
        assignedLeaderId: leader.id,
        groupId: groups[i % groups.length].id,
        createdById: leader.id,
        lastReportDate: since === null ? null : daysAgo(since),
        createdAt: daysAgo(60 + i),
      },
    });

    if (since === null) continue;

    // Most recent report carries the status the dashboard counts, so put the
    // interesting tag last: every 5th member reads as concern, every 3rd as
    // needs_attention, the rest good.
    const latestTag: StatusTag = i % 5 === 0 ? 'concern' : i % 3 === 0 ? 'needs_attention' : 'good';
    const history: StatusTag[] = ['good', i % 2 === 0 ? 'good' : 'needs_attention', latestTag];

    for (let r = 0; r < history.length; r++) {
      const tag = history[r];
      const at = daysAgo(since + (history.length - 1 - r) * 14);
      const report = await prisma.memberReport.create({
        data: {
          memberId: member.id,
          leaderId: leader.id,
          statusTag: tag,
          content: NOTES[tag][(i + r) % 3],
          // A couple of confidential reports so the pastor-only filtering is visible.
          isConfidential: tag === 'concern' && r === history.length - 1 && i % 10 === 0,
          createdAt: at,
        },
      });
      reportCount++;
      await prisma.activityLog.create({
        data: {
          userId: leader.id,
          action: 'submitted_member_report',
          entityType: 'member_report',
          entityId: report.id,
          metadata: { memberName: `${firstName} ${lastName}`, statusTag: tag },
          createdAt: at,
        },
      });
    }

    await prisma.activityLog.create({
      data: {
        userId: leader.id,
        action: 'added_member',
        entityType: 'member',
        entityId: member.id,
        metadata: { memberName: `${firstName} ${lastName}` },
        createdAt: daysAgo(60 + i),
      },
    });
  }

  // One safety-flagged report on a concern member, plus the pastor notification
  // the service would have raised.
  const flaggedMember = await prisma.member.findFirst({
    where: { firstName: 'Samuel', lastName: 'Ofori' },
    include: { assignedLeader: true },
  });
  if (flaggedMember) {
    const flagged = await prisma.memberReport.create({
      data: {
        memberId: flaggedMember.id,
        leaderId: flaggedMember.assignedLeaderId,
        statusTag: 'concern',
        content: 'Disclosed a situation at home that may not be safe. Escalating to the pastor immediately.',
        isSafetyFlagged: true,
        createdAt: daysAgo(2),
      },
    });
    reportCount++;
    await prisma.member.update({ where: { id: flaggedMember.id }, data: { lastReportDate: daysAgo(2) } });
    await prisma.notification.create({
      data: {
        userId: pastor.id,
        type: 'safety_flag',
        title: 'Safety-flagged report',
        message: `${flaggedMember.assignedLeader.fullName} flagged a report on ${flaggedMember.firstName} ${flaggedMember.lastName}.`,
        entityType: 'member_report',
        entityId: flagged.id,
        createdAt: daysAgo(2),
      },
    });
  }

  // First-timers with call logs, assigned across the follow-up team.
  let callCount = 0;
  for (let i = 0; i < FIRST_TIMERS.length; i++) {
    const [firstName, lastName, since, status] = FIRST_TIMERS[i];
    const assignee = followup[i % followup.length];
    const ft = await prisma.firstTimer.create({
      data: {
        firstName,
        lastName,
        phone: `+2332${String(50000000 + i * 311).slice(0, 8)}`,
        visitDate: daysAgo(since),
        serviceName: i % 2 === 0 ? 'Sunday First Service' : 'Sunday Second Service',
        assignedToId: assignee.id,
        teamLeadId: followup[0].id,
        status,
        createdAt: daysAgo(since),
      },
    });

    if (status === 'pending') continue;

    const outcomes: CallOutcome[] =
      status === 'not_interested'
        ? ['no_answer', 'not_interested']
        : status === 'interested' || status === 'converted'
          ? ['no_answer', 'answered', 'interested']
          : ['callback_requested', 'answered'];

    for (let c = 0; c < outcomes.length; c++) {
      await prisma.firstTimerReport.create({
        data: {
          firstTimerId: ft.id,
          reportedById: assignee.id,
          callOutcome: outcomes[c],
          content: CALL_NOTES[outcomes[c]],
          createdAt: daysAgo(since - c - 1 < 0 ? 0 : since - c - 1),
        },
      });
      callCount++;
    }

    // The converted first-timer gets a real member record linked back to them.
    if (status === 'converted') {
      const leader = leaders[0];
      const member = await prisma.member.create({
        data: {
          firstName,
          lastName,
          phone: ft.phone,
          assignedLeaderId: leader.id,
          groupId: groups[0].id,
          createdById: assignee.id,
          convertedFromFirstTimerId: ft.id,
          lastReportDate: daysAgo(5),
          createdAt: daysAgo(14),
        },
      });
      await prisma.memberReport.create({
        data: {
          memberId: member.id,
          leaderId: leader.id,
          statusTag: 'good',
          content: 'Settling in well since joining the group. Keen to be part of the choir.',
          createdAt: daysAgo(5),
        },
      });
      reportCount++;
      await prisma.firstTimer.update({
        where: { id: ft.id },
        data: { convertedAt: daysAgo(14), convertedMemberId: member.id },
      });
      await prisma.activityLog.create({
        data: {
          userId: assignee.id,
          action: 'converted_first_timer',
          entityType: 'first_timer',
          entityId: ft.id,
          metadata: { name: `${firstName} ${lastName}`, memberId: member.id },
          createdAt: daysAgo(14),
        },
      });
    }
  }

  console.log(
    `Demo seed complete: ${leaders.length} leaders, ${followup.length} follow-up, ` +
      `${MEMBERS.length + 1} members, ${reportCount} reports, ${FIRST_TIMERS.length} first-timers, ${callCount} call logs.`
  );
  console.log(`All demo accounts use password: ${PASSWORD}`);
  console.log(LEADERS.map((l) => `  leader: ${l.email}`).join('\n'));
  console.log(FOLLOWUP.map((f) => `  ${f.role}: ${f.email}`).join('\n'));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
