import { prisma } from '../lib/prisma';
import { UserRole } from '@prisma/client';

let seq = 0;
function uniq(): number {
  seq += 1;
  return seq;
}

export async function createUser(
  overrides: Partial<{ role: UserRole; isActive: boolean; email: string; fullName: string }> = {}
) {
  const n = uniq();
  return prisma.user.create({
    data: {
      fullName: overrides.fullName ?? `User ${n}`,
      email: overrides.email ?? `user${n}@test.local`,
      password: 'x', // not used in these tests
      role: overrides.role ?? 'leader',
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createMember(
  assignedLeaderId: string,
  overrides: Partial<{ isActive: boolean; lastReportDate: Date | null; firstName: string; lastName: string }> = {}
) {
  const n = uniq();
  return prisma.member.create({
    data: {
      firstName: overrides.firstName ?? `Mem${n}`,
      lastName: overrides.lastName ?? 'Test',
      assignedLeaderId,
      createdById: assignedLeaderId,
      isActive: overrides.isActive ?? true,
      lastReportDate: overrides.lastReportDate === undefined ? null : overrides.lastReportDate,
    },
  });
}

export async function seedSettings(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    reportThresholdDays: '14',
    reportReminderDay: 'friday',
    ...overrides,
  };
  for (const [key, value] of Object.entries(defaults)) {
    await prisma.setting.create({ data: { key, value } });
  }
}

export async function createFirstTimer(
  overrides: Partial<{ visitDate: Date; assignedToId: string | null; status: string; firstName: string }> = {}
) {
  const n = uniq();
  return prisma.firstTimer.create({
    data: {
      firstName: overrides.firstName ?? `Visitor${n}`,
      lastName: 'Test',
      visitDate: overrides.visitDate ?? new Date(),
      assignedToId: overrides.assignedToId ?? null,
      status: (overrides.status as never) ?? 'pending',
    },
  });
}

/** N days before now, at the same clock time. */
export function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}
