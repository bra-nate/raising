import { beforeEach, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import { resetLoginRateLimit } from '../middleware/loginRateLimit';

function assertTestDatabase(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is required for tests');

  const database = new URL(raw).pathname.slice(1);
  if (!database.endsWith('_test')) {
    throw new Error(`Refusing to truncate non-test database "${database}"`);
  }
}

// Truncate users CASCADE — cascades to members, reports, notifications,
// activity_logs, settings (all reference users). RESTART IDENTITY resets seqs.
export async function resetDb(): Promise<void> {
  assertTestDatabase();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE users, email_deliveries RESTART IDENTITY CASCADE');
}

beforeEach(async () => {
  resetLoginRateLimit();
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});
