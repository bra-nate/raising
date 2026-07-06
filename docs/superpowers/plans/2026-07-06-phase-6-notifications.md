# Phase 6 — Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the in-app notification bell (read + mark-read), and the two `node-cron` scheduled jobs (report reminder, silence detection), on top of the already-built notification creation paths.

**Architecture:** Backend gains read/mutate methods on the existing `notificationsService`, a thin `/notifications` route, and a `jobs/scheduler.ts` whose job bodies are plain exported async functions (testable directly, cron just calls them). The Express bootstrap is split into `app.ts` (`createApp()`, testable with supertest) and `index.ts` (listen + start scheduler). Frontend gets typed API functions, a polling `useNotifications` hook, and a `NotificationBell` mounted in the shared `AppShell` header.

**Tech Stack:** Express, Prisma, node-cron (already installed), Vitest + supertest (added this phase), React 18 + TS, Tailwind, axios.

## Global Constraints

- Server strict TypeScript; all DB access via the `prisma` singleton in `server/src/lib/prisma.ts` — never `new PrismaClient()`.
- Routes call services; services call Prisma. Routes use `authenticate` + `asyncHandler` + `AppError` (see `routes/settings.ts`).
- Cron timezone is `Africa/Accra` (UTC+0). Weekday and start-of-day computations use UTC methods since Accra == UTC+0.
- `sendEmail` no-ops (logs) when `RESEND_API_KEY` is unset — never let a missing email break the triggering operation.
- Bell is visible to all authenticated roles; mount once in `AppShell`.
- Reuse existing client types `Notification` and `NotificationType` in `client/src/types/index.ts` — do not redefine them.
- JWT payload shape is `{ id: string, role: UserRole }` (see `lib/jwt.ts`).

---

### Task 1: Vitest test harness (server)

**Files:**
- Modify: `server/package.json` (devDeps + `test` script)
- Create: `server/vitest.config.ts`
- Create: `server/.env.test.example`
- Create: `server/src/test/setup.ts` (per-test DB reset + env load)
- Create: `server/src/test/fixtures.ts` (fixture + seed helpers)
- Create: `server/src/test/sanity.test.ts` (proves harness works)

**Interfaces:**
- Produces: `resetDb()` and `seedSettings(overrides?)`, `createUser(overrides?)`, `createMember(leaderId, overrides?)` in `src/test/fixtures.ts`; a `test` npm script running `vitest run`.

- [ ] **Step 1: Install dev dependencies**

```bash
cd server && pnpm add -D vitest supertest @types/supertest
```

- [ ] **Step 2: Add the test script to `server/package.json`**

In the `"scripts"` block add:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create `server/.env.test.example`**

```env
# Point at a SEPARATE database from dev — tests truncate tables.
DATABASE_URL="postgresql://user:password@localhost:5432/shepherdlog_test"
JWT_SECRET="test-secret-key-at-least-32-characters-long-xx"
JWT_EXPIRES_IN="7d"
NODE_ENV="test"
```

Then copy it to `server/.env.test` and set a real test DB URL. Create the DB and push schema once:

```bash
cd server && cp .env.test.example .env.test
# edit .env.test with a real test DB, then:
DATABASE_URL="<your-test-db-url>" pnpm prisma db push --skip-generate
```

- [ ] **Step 4: Create `server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

// Load test env BEFORE the prisma singleton (which reads DATABASE_URL at import) is constructed.
dotenv.config({ path: '.env.test' });

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    fileParallelism: false, // tests share one DB; run files serially
    hookTimeout: 30000,
  },
});
```

- [ ] **Step 5: Create `server/src/test/setup.ts`**

```ts
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
```

- [ ] **Step 6: Create `server/src/test/fixtures.ts`**

```ts
import { prisma } from '../lib/prisma';
import { UserRole } from '@prisma/client';

let seq = 0;
function uniq(): number {
  seq += 1;
  return seq;
}

export async function createUser(overrides: Partial<{ role: UserRole; isActive: boolean; email: string; fullName: string }> = {}) {
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
```

> Note: `createMember` sets `createdById` to the leader — confirm the `Member` model requires it (it has a `CreatedBy` relation). If `createdById` is optional in the schema, this still works. If additional required fields exist on `Member`, add them here with sensible defaults.

- [ ] **Step 7: Create `server/src/test/sanity.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { prisma } from '../lib/prisma';
import { createUser } from './fixtures';

describe('test harness', () => {
  it('starts each test with an empty users table', async () => {
    expect(await prisma.user.count()).toBe(0);
  });

  it('can create and read a user', async () => {
    await createUser({ role: 'pastor' });
    expect(await prisma.user.count()).toBe(1);
  });
});
```

- [ ] **Step 8: Run the sanity test**

Run: `cd server && pnpm test`
Expected: PASS, 2 tests. (If it errors on the DB connection, the test DB from Step 3 isn't reachable — fix the URL / push schema before continuing.)

- [ ] **Step 9: Commit**

```bash
git add server/package.json server/pnpm-lock.yaml server/vitest.config.ts server/.env.test.example server/src/test/
git commit -m "test(server): add vitest harness with test DB reset + fixtures"
```

---

### Task 2: Notification service read/mutate methods

**Files:**
- Modify: `server/src/services/notifications.service.ts`
- Test: `server/src/services/notifications.service.test.ts`

**Interfaces:**
- Consumes: `prisma` singleton; `AppError` from `../lib/errors`; fixtures from Task 1.
- Produces on `notificationsService`:
  - `list(userId: string): Promise<{ data: Notification[]; unreadCount: number }>`
  - `markRead(userId: string, id: string): Promise<void>` — throws `AppError(404)` if no row matches (also blocks marking another user's notification)
  - `markAllRead(userId: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `server/src/services/notifications.service.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { prisma } from '../lib/prisma';
import { notificationsService } from './notifications.service';
import { createUser } from '../test/fixtures';

async function makeNotif(userId: string, isRead = false) {
  return prisma.notification.create({
    data: { userId, type: 'safety_flag', title: 't', message: 'm', isRead },
  });
}

describe('notificationsService.list', () => {
  it('returns own notifications newest-first, capped at 20, with unread count', async () => {
    const user = await createUser();
    for (let i = 0; i < 25; i++) await makeNotif(user.id, i % 2 === 0);
    const { data, unreadCount } = await notificationsService.list(user.id);
    expect(data).toHaveLength(20);
    // Newest-first: created later has a later createdAt (or equal-then-insertion order).
    expect(new Date(data[0].createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(data[19].createdAt).getTime()
    );
    // unreadCount counts ALL unread, not just the top 20 (13 of 25 are unread).
    expect(unreadCount).toBe(13);
  });

  it('does not return other users notifications', async () => {
    const a = await createUser();
    const b = await createUser();
    await makeNotif(a.id);
    const { data, unreadCount } = await notificationsService.list(b.id);
    expect(data).toHaveLength(0);
    expect(unreadCount).toBe(0);
  });
});

describe('notificationsService.markRead', () => {
  it('marks own notification read', async () => {
    const user = await createUser();
    const n = await makeNotif(user.id);
    await notificationsService.markRead(user.id, n.id);
    const updated = await prisma.notification.findUnique({ where: { id: n.id } });
    expect(updated?.isRead).toBe(true);
  });

  it('throws 404 when the notification belongs to another user', async () => {
    const a = await createUser();
    const b = await createUser();
    const n = await makeNotif(a.id);
    await expect(notificationsService.markRead(b.id, n.id)).rejects.toMatchObject({ status: 404 });
    const untouched = await prisma.notification.findUnique({ where: { id: n.id } });
    expect(untouched?.isRead).toBe(false);
  });
});

describe('notificationsService.markAllRead', () => {
  it('marks every unread notification for the user read', async () => {
    const user = await createUser();
    await makeNotif(user.id);
    await makeNotif(user.id);
    await notificationsService.markAllRead(user.id);
    expect(await prisma.notification.count({ where: { userId: user.id, isRead: false } })).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && pnpm test src/services/notifications.service.test.ts`
Expected: FAIL — `list`/`markRead`/`markAllRead` are not functions.

- [ ] **Step 3: Implement the methods**

In `server/src/services/notifications.service.ts`, add the import at the top (alongside existing imports):

```ts
import { AppError } from '../lib/errors';
```

Add these three functions above the final `export const notificationsService = ...` line:

```ts
async function list(userId: string) {
  const [data, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);
  return { data, unreadCount };
}

async function markRead(userId: string, id: string): Promise<void> {
  const result = await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });
  if (result.count === 0) throw new AppError(404, 'Notification not found');
}

async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}
```

Update the export to include them:

```ts
export const notificationsService = { createNotification, sendEmail, list, markRead, markAllRead };
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && pnpm test src/services/notifications.service.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/notifications.service.ts server/src/services/notifications.service.test.ts
git commit -m "feat(notifications): add list/markRead/markAllRead service methods"
```

---

### Task 3: Notifications route + testable app bootstrap

**Files:**
- Create: `server/src/app.ts` (`createApp()`)
- Modify: `server/src/index.ts` (use `createApp`, keep `listen`)
- Create: `server/src/routes/notifications.ts`
- Test: `server/src/routes/notifications.test.ts`

**Interfaces:**
- Consumes: `notificationsService.list/markRead/markAllRead`; `authenticate`; `asyncHandler`; `signToken` from `../lib/jwt`.
- Produces: `createApp(): express.Application` from `src/app.ts`; routes `GET /api/v1/notifications`, `PATCH /api/v1/notifications/:id/read`, `PATCH /api/v1/notifications/read-all`.

- [ ] **Step 1: Create `server/src/app.ts`** (move app assembly out of `index.ts`)

```ts
import express from 'express';
import cors from 'cors';
import { config } from './config';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import memberRoutes from './routes/members';
import memberReportRoutes from './routes/member-reports';
import settingsRoutes from './routes/settings';
import activityLogRoutes from './routes/activity-log';
import dashboardRoutes from './routes/dashboard';
import firstTimerRoutes from './routes/first-timers';
import firstTimerReportRoutes from './routes/first-timer-reports';
import notificationRoutes from './routes/notifications';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.clientUrl }));
  app.use(express.json());

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', service: 'raising' });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/members', memberRoutes);
  app.use('/api/v1/member-reports', memberReportRoutes);
  app.use('/api/v1/settings', settingsRoutes);
  app.use('/api/v1/activity-log', activityLogRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use('/api/v1/first-timers', firstTimerRoutes);
  app.use('/api/v1/first-timer-reports', firstTimerReportRoutes);
  app.use('/api/v1/notifications', notificationRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler);

  return app;
}
```

- [ ] **Step 2: Replace `server/src/index.ts` body**

```ts
import { createApp } from './app';
import { config } from './config';

const app = createApp();

app.listen(config.port, () => {
  console.log(`raising API listening on http://localhost:${config.port} (${config.nodeEnv})`);
});

export default app;
```

(Scheduler startup is added in Task 5.)

- [ ] **Step 3: Create the route `server/src/routes/notifications.ts`**

```ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { asyncHandler } from '../lib/asyncHandler';
import { notificationsService } from '../services/notifications.service';

const router = Router();

// All authenticated users have notifications — no role guard.
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await notificationsService.list(req.user!.id);
    res.json(result); // { data, unreadCount }
  })
);

router.patch(
  '/read-all',
  authenticate,
  asyncHandler(async (req, res) => {
    await notificationsService.markAllRead(req.user!.id);
    res.json({ ok: true });
  })
);

router.patch(
  '/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    await notificationsService.markRead(req.user!.id, req.params.id);
    res.json({ ok: true });
  })
);

export default router;
```

> Order matters: `/read-all` is declared before `/:id/read` so it is not captured by the `:id` param route.

- [ ] **Step 4: Write the failing route test `server/src/routes/notifications.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { createUser } from '../test/fixtures';

const app = createApp();

function auth(user: { id: string; role: any }) {
  return `Bearer ${signToken({ id: user.id, role: user.role })}`;
}

describe('GET /api/v1/notifications', () => {
  it('401 without a token', async () => {
    await request(app).get('/api/v1/notifications').expect(401);
  });

  it('returns the caller\'s notifications and unread count', async () => {
    const user = await createUser({ role: 'pastor' });
    await prisma.notification.create({ data: { userId: user.id, type: 'safety_flag', title: 't', message: 'm' } });
    const res = await request(app).get('/api/v1/notifications').set('Authorization', auth(user)).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.unreadCount).toBe(1);
  });
});

describe('PATCH read endpoints', () => {
  it('marks one read', async () => {
    const user = await createUser();
    const n = await prisma.notification.create({ data: { userId: user.id, type: 'safety_flag', title: 't', message: 'm' } });
    await request(app).patch(`/api/v1/notifications/${n.id}/read`).set('Authorization', auth(user)).expect(200);
    expect((await prisma.notification.findUnique({ where: { id: n.id } }))?.isRead).toBe(true);
  });

  it('404 marking another user\'s notification', async () => {
    const a = await createUser();
    const b = await createUser();
    const n = await prisma.notification.create({ data: { userId: a.id, type: 'safety_flag', title: 't', message: 'm' } });
    await request(app).patch(`/api/v1/notifications/${n.id}/read`).set('Authorization', auth(b)).expect(404);
  });

  it('marks all read', async () => {
    const user = await createUser();
    await prisma.notification.create({ data: { userId: user.id, type: 'safety_flag', title: 't', message: 'm' } });
    await prisma.notification.create({ data: { userId: user.id, type: 'safety_flag', title: 't', message: 'm' } });
    await request(app).patch('/api/v1/notifications/read-all').set('Authorization', auth(user)).expect(200);
    expect(await prisma.notification.count({ where: { userId: user.id, isRead: false } })).toBe(0);
  });
});
```

- [ ] **Step 5: Run the route tests**

Run: `cd server && pnpm test src/routes/notifications.test.ts`
Expected: PASS (5 tests). If they fail because the route isn't mounted, confirm Step 1 added `notificationRoutes`.

- [ ] **Step 6: Typecheck the server**

Run: `cd server && pnpm build`
Expected: no TS errors (confirms the `app.ts`/`index.ts` split compiles).

- [ ] **Step 7: Commit**

```bash
git add server/src/app.ts server/src/index.ts server/src/routes/notifications.ts server/src/routes/notifications.test.ts
git commit -m "feat(notifications): add /notifications route + extract createApp"
```

---

### Task 4: Scheduler job bodies

**Files:**
- Create: `server/src/jobs/scheduler.ts`
- Test: `server/src/jobs/scheduler.test.ts`

**Interfaces:**
- Consumes: `prisma`, `settingsService.get/getNumber`, `notificationsService.createNotification/sendEmail`, fixtures.
- Produces:
  - `runReportReminder(now?: Date): Promise<void>` — if today's weekday (UTC) ≠ configured `reportReminderDay`, returns without acting; else notifies+emails each active leader who has ≥1 member with no report within `reportThresholdDays`.
  - `runSilenceDetection(now?: Date): Promise<void>` — for each active pastor, creates a `member_unreported` notification per active silent member, skipping members already notified for that pastor today (`createdAt >= start-of-day UTC`).
  - `startScheduler(): void` — registers both cron jobs (Africa/Accra). Not unit-tested.

- [ ] **Step 1: Write failing tests `server/src/jobs/scheduler.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { prisma } from '../lib/prisma';
import { runReportReminder, runSilenceDetection } from './scheduler';
import { createUser, createMember, seedSettings } from '../test/fixtures';

// A fixed Friday in UTC: 2026-01-02 is a Friday.
const FRIDAY = new Date('2026-01-02T08:00:00.000Z');
const MONDAY = new Date('2026-01-05T08:00:00.000Z');
const daysAgo = (base: Date, n: number) => new Date(base.getTime() - n * 24 * 60 * 60 * 1000);

describe('runReportReminder', () => {
  it('does nothing when today is not the configured reminder day', async () => {
    await seedSettings({ reportReminderDay: 'friday' });
    const leader = await createUser({ role: 'leader' });
    await createMember(leader.id, { lastReportDate: null });
    await runReportReminder(MONDAY);
    expect(await prisma.notification.count()).toBe(0);
  });

  it('notifies a leader with an overdue member on the reminder day', async () => {
    await seedSettings({ reportReminderDay: 'friday', reportThresholdDays: '14' });
    const leader = await createUser({ role: 'leader' });
    await createMember(leader.id, { lastReportDate: daysAgo(FRIDAY, 30) }); // overdue
    await runReportReminder(FRIDAY);
    const notifs = await prisma.notification.findMany({ where: { userId: leader.id } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('report_due');
  });

  it('does not notify a leader whose members are all recently reported', async () => {
    await seedSettings({ reportReminderDay: 'friday', reportThresholdDays: '14' });
    const leader = await createUser({ role: 'leader' });
    await createMember(leader.id, { lastReportDate: daysAgo(FRIDAY, 2) }); // within threshold
    await runReportReminder(FRIDAY);
    expect(await prisma.notification.count({ where: { userId: leader.id } })).toBe(0);
  });
});

describe('runSilenceDetection', () => {
  it('creates a member_unreported notification for the pastor per silent member', async () => {
    await seedSettings({ reportThresholdDays: '14' });
    const pastor = await createUser({ role: 'pastor' });
    const leader = await createUser({ role: 'leader' });
    const m = await createMember(leader.id, { lastReportDate: null });
    await runSilenceDetection(FRIDAY);
    const notifs = await prisma.notification.findMany({ where: { userId: pastor.id } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('member_unreported');
    expect(notifs[0].entityId).toBe(m.id);
  });

  it('does not duplicate a notification for the same member on the same day', async () => {
    await seedSettings({ reportThresholdDays: '14' });
    const pastor = await createUser({ role: 'pastor' });
    const leader = await createUser({ role: 'leader' });
    await createMember(leader.id, { lastReportDate: null });
    await runSilenceDetection(FRIDAY);
    await runSilenceDetection(FRIDAY); // second run same day
    expect(await prisma.notification.count({ where: { userId: pastor.id } })).toBe(1);
  });

  it('ignores members reported within the threshold', async () => {
    await seedSettings({ reportThresholdDays: '14' });
    const pastor = await createUser({ role: 'pastor' });
    const leader = await createUser({ role: 'leader' });
    await createMember(leader.id, { lastReportDate: daysAgo(FRIDAY, 3) });
    await runSilenceDetection(FRIDAY);
    expect(await prisma.notification.count({ where: { userId: pastor.id } })).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && pnpm test src/jobs/scheduler.test.ts`
Expected: FAIL — module `./scheduler` not found / functions undefined.

- [ ] **Step 3: Implement `server/src/jobs/scheduler.ts`**

```ts
import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { settingsService } from '../services/settings.service';
import { notificationsService } from '../services/notifications.service';

const TZ = 'Africa/Accra'; // UTC+0 — weekday/start-of-day computed with UTC methods

const DAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

function cutoffDate(now: Date, thresholdDays: number): Date {
  return new Date(now.getTime() - thresholdDays * 24 * 60 * 60 * 1000);
}

/** Report reminder: fires daily; acts only on the configured weekday. */
export async function runReportReminder(now: Date = new Date()): Promise<void> {
  const reminderDay = (await settingsService.get('reportReminderDay')) ?? 'friday';
  if (DAY_INDEX[reminderDay] !== now.getUTCDay()) return;

  const thresholdDays = await settingsService.getNumber('reportThresholdDays', 14);
  const cutoff = cutoffDate(now, thresholdDays);

  const leaders = await prisma.user.findMany({ where: { role: 'leader', isActive: true } });
  for (const leader of leaders) {
    const overdue = await prisma.member.count({
      where: {
        assignedLeaderId: leader.id,
        isActive: true,
        OR: [{ lastReportDate: null }, { lastReportDate: { lt: cutoff } }],
      },
    });
    if (overdue === 0) continue;

    await notificationsService.createNotification({
      userId: leader.id,
      type: 'report_due',
      title: 'Weekly report reminder',
      message: `You have ${overdue} member${overdue === 1 ? '' : 's'} without a recent report.`,
    });
    await notificationsService.sendEmail(
      leader.email,
      'Weekly report reminder',
      `<p>You have <strong>${overdue}</strong> member(s) without a report in the last ${thresholdDays} days.</p>`
    );
  }
}

/** Silence detection: daily; one pastor notification per silent member, deduped per day. */
export async function runSilenceDetection(now: Date = new Date()): Promise<void> {
  const thresholdDays = await settingsService.getNumber('reportThresholdDays', 14);
  const cutoff = cutoffDate(now, thresholdDays);
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const silent = await prisma.member.findMany({
    where: {
      isActive: true,
      OR: [{ lastReportDate: null }, { lastReportDate: { lt: cutoff } }],
    },
  });
  if (silent.length === 0) return;

  const pastors = await prisma.user.findMany({ where: { role: 'pastor', isActive: true } });
  for (const pastor of pastors) {
    for (const member of silent) {
      const already = await prisma.notification.count({
        where: {
          userId: pastor.id,
          type: 'member_unreported',
          entityId: member.id,
          createdAt: { gte: startOfDay },
        },
      });
      if (already > 0) continue;

      await notificationsService.createNotification({
        userId: pastor.id,
        type: 'member_unreported',
        title: 'Member unreported',
        message: `${member.firstName} ${member.lastName} has no recent report.`,
        entityType: 'member',
        entityId: member.id,
      });
    }
  }
}

/** Register both cron jobs. Called once on server boot (never under test). */
export function startScheduler(): void {
  cron.schedule('0 8 * * *', () => {
    runReportReminder().catch((err) => console.error('[cron:report-reminder]', err));
  }, { timezone: TZ });

  cron.schedule('0 7 * * *', () => {
    runSilenceDetection().catch((err) => console.error('[cron:silence-detection]', err));
  }, { timezone: TZ });

  console.log('[scheduler] report-reminder (08:00) + silence-detection (07:00) registered — Africa/Accra');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && pnpm test src/jobs/scheduler.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the full server suite**

Run: `cd server && pnpm test`
Expected: PASS — all files (sanity, service, route, scheduler).

- [ ] **Step 6: Commit**

```bash
git add server/src/jobs/scheduler.ts server/src/jobs/scheduler.test.ts
git commit -m "feat(scheduler): report-reminder + silence-detection jobs with tests"
```

---

### Task 5: Start the scheduler on boot

**Files:**
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `startScheduler` from `./jobs/scheduler`.

- [ ] **Step 1: Wire `startScheduler()` into `index.ts`**

Replace `server/src/index.ts` with:

```ts
import { createApp } from './app';
import { config } from './config';
import { startScheduler } from './jobs/scheduler';

const app = createApp();

app.listen(config.port, () => {
  console.log(`raising API listening on http://localhost:${config.port} (${config.nodeEnv})`);
  startScheduler();
});

export default app;
```

- [ ] **Step 2: Typecheck**

Run: `cd server && pnpm build`
Expected: no TS errors.

- [ ] **Step 3: Boot the server and confirm registration**

Run: `cd server && pnpm dev`
Expected: logs `raising API listening ...` then `[scheduler] report-reminder (08:00) + silence-detection (07:00) registered — Africa/Accra`. Stop the server (Ctrl-C).

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(scheduler): start cron jobs on server boot"
```

---

### Task 6: Client API functions + useNotifications hook

**Files:**
- Modify: `client/src/lib/api.ts`
- Create: `client/src/hooks/useNotifications.ts`

**Interfaces:**
- Consumes: `api` axios instance; existing `Notification` type.
- Produces:
  - `getNotifications(): Promise<{ data: Notification[]; unreadCount: number }>`
  - `markNotificationRead(id: string): Promise<void>`
  - `markAllNotificationsRead(): Promise<void>`
  - `useNotifications()` → `{ notifications: Notification[]; unreadCount: number; loading: boolean; markRead(id): Promise<void>; markAllRead(): Promise<void>; refetch(): Promise<void> }`

- [ ] **Step 1: Add API functions to `client/src/lib/api.ts`**

Ensure `Notification` is in the type import block at the top, then append:

```ts
export async function getNotifications(): Promise<{ data: Notification[]; unreadCount: number }> {
  const res = await api.get('/notifications');
  return res.data;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.patch(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.patch('/notifications/read-all');
}
```

- [ ] **Step 2: Create `client/src/hooks/useNotifications.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Notification } from '../types';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../lib/api';

const POLL_MS = 60_000;

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const refetch = useCallback(async () => {
    try {
      const { data, unreadCount } = await getNotifications();
      if (!mounted.current) return;
      setNotifications(data);
      setUnreadCount(unreadCount);
    } catch {
      // Polling failure is non-fatal — keep last known state.
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refetch();
    const id = setInterval(refetch, POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [refetch]);

  const markRead = useCallback(async (id: string) => {
    await markNotificationRead(id);
    await refetch();
  }, [refetch]);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    await refetch();
  }, [refetch]);

  return { notifications, unreadCount, loading, markRead, markAllRead, refetch };
}
```

- [ ] **Step 3: Typecheck the client**

Run: `cd client && pnpm build` (or `pnpm tsc --noEmit`)
Expected: no TS errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/api.ts client/src/hooks/useNotifications.ts
git commit -m "feat(client): notification API functions + useNotifications polling hook"
```

---

### Task 7: NotificationBell component + AppShell mount

**Files:**
- Create: `client/src/components/layout/NotificationBell.tsx`
- Modify: `client/src/components/layout/AppShell.tsx`

**Interfaces:**
- Consumes: `useNotifications`, `IconBell` (`components/ui/icons`), `relativeDate` (`lib/utils`).

- [ ] **Step 1: Create `client/src/components/layout/NotificationBell.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { IconBell } from '../ui/icons';
import { relativeDate } from '../../lib/utils';
import { useNotifications } from '../../hooks/useNotifications';

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:text-accent hover:bg-surface-2"
      >
        <IconBell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-hairline bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-2">
            <span className="text-caption font-semibold text-ink-2">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead()}
                className="text-caption text-accent transition hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-caption text-faint">You&apos;re all caught up.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => !n.isRead && markRead(n.id)}
                  className={`flex w-full flex-col gap-0.5 border-b border-hairline px-4 py-3 text-left transition hover:bg-surface-2 ${
                    n.isRead ? 'opacity-60' : ''
                  }`}
                >
                  <span className="flex items-center gap-2 text-caption font-semibold text-ink-2">
                    {!n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                    {n.title}
                  </span>
                  <span className="text-caption text-muted">{n.message}</span>
                  <span className="text-[11px] text-faint">{relativeDate(n.createdAt)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

> The Tailwind color tokens above (`text-muted`, `bg-surface`, `border-hairline`, `bg-accent`, `text-faint`, `text-ink-2`, `bg-surface-2`) are the project's Relate tokens seen in `AppShell`/`Sidebar`. If any token name differs in `tailwind.config.ts`, use the matching one. Match dark-mode behaviour of the existing header.

- [ ] **Step 2: Mount the bell in `AppShell.tsx` header**

In `client/src/components/layout/AppShell.tsx`, add the import:

```tsx
import { NotificationBell } from './NotificationBell';
```

Change the header's right-side region from:

```tsx
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
```

to:

```tsx
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <NotificationBell />
          </div>
```

- [ ] **Step 3: Typecheck the client**

Run: `cd client && pnpm build`
Expected: no TS errors.

- [ ] **Step 4: End-to-end verification (exit criteria)**

Start both apps (`pnpm dev` at repo root). Then:
1. Log in as a **leader**. Add a member (if none), submit a report with the **safety flag** checked.
2. Log in as the **pastor** in another browser/profile. Within 60s the bell badge shows an unread count; open the dropdown — the safety-flag notification is listed. Click it → unread dot clears, badge decrements.
3. Click "Mark all read" → badge disappears.

Confirm each of the above visually. This satisfies "pastor receives safety flag bell notification" from the exit criteria.

- [ ] **Step 5: Verify the reminder path manually (optional but recommended)**

In a `node`/`ts-node` REPL or a throwaway script, import and call `runReportReminder(new Date('2026-01-02T08:00:00Z'))` against dev data with a leader who has an overdue member, then confirm a `report_due` row appears and the leader's bell shows it. (This exercises the second exit criterion without waiting for Friday 08:00.)

- [ ] **Step 6: Commit**

```bash
git add client/src/components/layout/NotificationBell.tsx client/src/components/layout/AppShell.tsx
git commit -m "feat(client): notification bell in app header with polling + mark-read"
```

---

## Self-Review

**Spec coverage:**
- 6.1 `GET /notifications` → Task 3. `PATCH /:id/read` + `/read-all` → Task 3. `NotificationBell` polling + badge → Tasks 6–7. Dropdown + mark-on-click → Task 7. ✅
- 6.2 `createNotification`/`sendEmail` already exist (Task 0 state); safety-flag bell confirmed in Task 7 Step 4. ✅
- 6.3 node-cron on boot → Task 5. Report reminder (configured day, 08:00) → Task 4 `runReportReminder`. Silence detection (daily 07:00, dedup) → Task 4 `runSilenceDetection`. ✅
- 6.4 First-timer assignment already fires (Phase 4); no code needed — covered by existing tests/manual (call it out during execution, not re-implemented). ✅

**Placeholder scan:** No TBD/TODO; every code step has full code. The token-name and `createMember` required-field notes are explicit verification instructions, not deferred work.

**Type consistency:** `list` returns `{ data, unreadCount }` everywhere (service, route, api, hook). `markRead(userId, id)` order consistent. `signToken({ id, role })` matches `JwtPayload`. `startScheduler` / `runReportReminder` / `runSilenceDetection` names consistent across Tasks 4–5.

**Open verification points flagged for the implementer:** (1) test DB reachable before Task 1 Step 8; (2) `Member` required fields in `createMember`; (3) Relate Tailwind token names in the bell.
