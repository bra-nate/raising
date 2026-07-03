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

  console.log('Seed complete. Pastor login: pastor@raising.local / changeme123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
