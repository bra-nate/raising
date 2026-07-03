import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { writeLog } from './activity-log.service';

/**
 * Settings are read on each request that needs them — no in-process cache is
 * warranted at this scale. Values are stored as strings; callers coerce.
 */
async function getAll(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function get(key: string): Promise<string | undefined> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value;
}

async function getNumber(key: string, fallback: number): Promise<number> {
  const value = await get(key);
  const parsed = value !== undefined ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Known, writable settings keys — reject anything else.
const WRITABLE_KEYS = [
  'reportThresholdDays',
  'allowDeleteReports',
  'deletePermission',
  'notificationsEnabled',
  'reportReminderDay',
] as const;

async function update(actorId: string, key: string, value: string) {
  if (!WRITABLE_KEYS.includes(key as (typeof WRITABLE_KEYS)[number])) {
    throw new AppError(400, 'Unknown setting');
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(400, 'A non-empty value is required');
  }

  const existing = await prisma.setting.findUnique({ where: { key } });
  const updated = await prisma.setting.update({
    where: { key },
    data: { value, updatedById: actorId },
  });

  await writeLog({
    userId: actorId,
    action: 'updated_settings',
    entityType: 'settings',
    entityId: key,
    metadata: { key, from: existing?.value ?? null, to: value },
  });

  return { key: updated.key, value: updated.value };
}

export const settingsService = { getAll, get, getNumber, update };
