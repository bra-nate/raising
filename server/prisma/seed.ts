import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Settings defaults
  const settings = [
    { key: 'reportThresholdDays', value: '14', description: 'Days before a member is flagged as unreported' },
    { key: 'allowDeleteReports', value: 'false', description: 'Master toggle for report deletion' },
    { key: 'deletePermission', value: 'pastor_only', description: 'pastor_only | leaders' },
    { key: 'notificationsEnabled', value: 'true', description: 'Master toggle for in-app notifications' },
    { key: 'reportReminderDay', value: 'friday', description: 'Day of week for leader report reminders' },
  ];

  for (const s of settings) {
    await prisma.setting.upsert({ where: { key: s.key }, update: {}, create: s });
  }

  // Pastor account — change password after first login
  const hash = await bcrypt.hash('changeme123', 12);
  await prisma.user.upsert({
    where: { email: 'pastor@raising.local' },
    update: {},
    create: {
      fullName: 'Pastor',
      email: 'pastor@raising.local',
      password: hash,
      role: 'pastor',
    },
  });

  // Optional superadmin bootstrap — only when env vars are provided. Idempotent.
  const saEmail = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
  const saPassword = process.env.SUPERADMIN_PASSWORD;
  if (saEmail && saPassword) {
    const existing = await prisma.user.findFirst({ where: { role: 'superadmin' } });
    if (existing) {
      console.log(`Superadmin already exists (${existing.email}); skipping.`);
    } else {
      const saHash = await bcrypt.hash(saPassword, 12);
      const created = await prisma.user.create({
        data: {
          fullName: process.env.SUPERADMIN_NAME?.trim() || 'Super Admin',
          email: saEmail,
          password: saHash,
          role: 'superadmin',
        },
      });
      console.log(`Superadmin created: ${created.email}`);
    }
  } else {
    console.log('SUPERADMIN_EMAIL/PASSWORD not set; skipping superadmin bootstrap.');
  }

  console.log('Seed complete. Pastor login: pastor@raising.local / changeme123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
