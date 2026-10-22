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

const oneOf = (allowed: readonly string[]) => (value: string) => allowed.includes(value);
const integer = (min: number, max: number) => (value: string) => {
  if (!/^\d+$/.test(value)) return false;
  const parsed = Number(value);
  return parsed >= min && parsed <= max;
};

// Keep policy constraints at the API boundary; UI controls are not trusted.
const VALIDATORS = {
  reportThresholdDays: integer(1, 365),
  allowDeleteReports: oneOf(['true', 'false']),
  deletePermission: oneOf(['pastor_only', 'leaders']),
  notificationsEnabled: oneOf(['true', 'false']),
  reportReminderDay: oneOf(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
  safetyAckHours: integer(1, 168),
  concernDueDays: integer(1, 365),
  firstContactDays: integer(1, 90),
  retentionMonths: integer(0, 120),
  retentionMode: oneOf(['report_only', 'report_and_redact']),
} as const;

async function update(actorId: string, key: string, value: string) {
  const validator = VALIDATORS[key as keyof typeof VALIDATORS];
  if (!validator) {
    throw new AppError(400, 'Unknown setting');
  }
  const normalized = value.trim();
  if (!validator(normalized)) {
    throw new AppError(400, `Invalid value for ${key}`, 'INVALID_SETTING_VALUE');
  }

  const existing = await prisma.setting.findUnique({ where: { key } });
  const updated = await prisma.setting.upsert({
    where: { key },
    update: { value: normalized, updatedById: actorId },
    create: { key, value: normalized, updatedById: actorId },
  });

  await writeLog({
    userId: actorId,
    action: 'updated_settings',
    entityType: 'settings',
    entityId: key,
    metadata: { key, from: existing?.value ?? null, to: normalized },
  });

  return { key: updated.key, value: updated.value };
}

export const settingsService = { getAll, get, getNumber, update };
