import { prisma } from '../lib/prisma';
import { settingsService } from './settings.service';
import { membersService, SilenceStatus } from './members.service';

interface PastorStats {
  totalActiveMembers: number;
  reportsThisWeek: number;
  needsAttention: number;
  concern: number;
  firstTimersThisWeek: number;
  pendingFirstTimers: number;
}

interface SilenceRow {
  id: string;
  firstName: string;
  lastName: string;
  assignedLeader: { fullName: string };
  lastReportDate: Date | null;
  silence: SilenceStatus;
}

const SILENCE_RANK: Record<SilenceStatus, number> = { significant: 0, overdue: 1, ok: 2 };

/**
 * Single dedicated endpoint for the pastor dashboard — six stat values, the
 * silence list, and the 20 most recent reports across all leaders. Assembled
 * here, never on the frontend from multiple calls.
 */
async function pastorDashboard() {
  const thresholdDays = await settingsService.getNumber('reportThresholdDays', 14);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const members = await prisma.member.findMany({
    where: { isActive: true },
    include: {
      assignedLeader: { select: { fullName: true } },
      reports: { orderBy: { createdAt: 'desc' }, take: 1, select: { statusTag: true } },
    },
  });

  let needsAttention = 0;
  let concern = 0;
  const silence: SilenceRow[] = [];
  for (const m of members) {
    const latest = m.reports[0]?.statusTag;
    if (latest === 'needs_attention') needsAttention++;
    if (latest === 'concern') concern++;
    const s = membersService.computeSilence(m.lastReportDate, thresholdDays);
    if (s !== 'ok') {
      silence.push({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        assignedLeader: m.assignedLeader,
        lastReportDate: m.lastReportDate,
        silence: s,
      });
    }
  }
  silence.sort((a, b) => SILENCE_RANK[a.silence] - SILENCE_RANK[b.silence]);

  const [reportsThisWeek, firstTimersThisWeek, pendingFirstTimers, recentReports] = await Promise.all([
    prisma.memberReport.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.firstTimer.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.firstTimer.count({ where: { status: 'pending', isActive: true } }),
    prisma.memberReport.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        statusTag: true,
        isConfidential: true,
        isSafetyFlagged: true,
        createdAt: true,
        member: { select: { id: true, firstName: true, lastName: true } },
        leader: { select: { fullName: true } },
      },
    }),
  ]);

  const stats: PastorStats = {
    totalActiveMembers: members.length,
    reportsThisWeek,
    needsAttention,
    concern,
    firstTimersThisWeek,
    pendingFirstTimers,
  };

  return { stats, silence, recentReports };
}

export const dashboardService = { pastorDashboard };
