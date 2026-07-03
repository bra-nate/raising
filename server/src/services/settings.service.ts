import { prisma } from '../lib/prisma';

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

export const settingsService = { getAll, get, getNumber };
