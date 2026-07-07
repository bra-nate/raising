import { beforeEach, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';

// Truncate users CASCADE — cascades to members, reports, notifications,
// activity_logs, settings (all reference users). RESTART IDENTITY resets seqs.
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});
