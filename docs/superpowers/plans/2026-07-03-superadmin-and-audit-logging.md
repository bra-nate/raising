# Superadmin Role + Complete Audit Logging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a platform-only `superadmin` role that manages users, settings, and audit logs (alongside the pastor), and close all audit-logging gaps so every significant action is recorded and viewable.

**Architecture:** Backend is Express + Prisma with a strict service layer; access control is an explicit `requireRole(...)` allowlist, so `superadmin` gets pastoral-data isolation for free (never added to those routes). Audit logging uses the existing `writeLog()` helper called inside the triggering service function. Frontend is a Vite + React SPA with role-scoped routing (`RequireRole`) and role-scoped nav.

**Tech Stack:** Express, Prisma (PostgreSQL), JWT, bcrypt, React 18 + TypeScript, React Router, Tailwind, Axios.

## Global Constraints

- All API routes prefixed `/api/v1/`. List endpoints return `{ data: T[], total: number }`.
- Errors return `{ error: string }` with an appropriate HTTP status (via `AppError`).
- Access control is enforced in the service/route layer, never the frontend. `superadmin` must NEVER be granted on members / member-reports / pastoral routes.
- Activity log rows are never deleted; no delete/update endpoint for them.
- Safety-flagged reports remain immune to delete/redact (unchanged).
- All DB writes go through service files using the `prisma` singleton from `lib/prisma.ts`; multi-table writes use `prisma.$transaction`.
- `writeLog()` is called inside the triggering service function (never from a route, never fire-and-forget), passing `tx` when inside a transaction.
- Package manager is **pnpm**. Server typecheck/build: `pnpm --filter raising-server build`. Client build: `pnpm --filter raising-client build`.

## Testing approach (read before starting)

This repository ships **no automated-test harness** (no jest/vitest, no test files). Introducing a Prisma-integration test framework is out of scope (YAGNI, and against the codebase's established convention). Each task is therefore verified by:
1. **Typecheck/build** — `pnpm --filter raising-server build` (backend) or `pnpm --filter raising-client build` (frontend) must pass with no errors.
2. **Runtime verification** — for backend behavior, start the dev server and exercise the endpoint with `curl`, asserting on status codes and JSON; for audit rows, query the DB. Concrete commands are given per task.

Prerequisite for runtime checks: a running Postgres with `DATABASE_URL` set, migrations applied, and the seed run. Obtain a pastor JWT once and reuse it:

```bash
# From repo root, with server running on :3000
PASTOR_TOKEN=$(curl -s localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"pastor@raising.local","password":"changeme123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
echo "$PASTOR_TOKEN"
```

---

## File Structure

**Backend — create:**
- `server/src/routes/settings.ts` — settings read/write route
- `server/src/routes/activity-log.ts` — activity-log read route

**Backend — modify:**
- `server/prisma/schema.prisma` — enum additions (`superadmin`, `logged_in`, `changed_user_role`)
- `server/prisma/seed.ts` — seed first superadmin from env
- `server/src/config.ts` — read superadmin seed env vars
- `server/.env.example` — document new env vars
- `server/src/services/users.service.ts` — allow `superadmin` role; role-change logging fix
- `server/src/services/auth.service.ts` — log successful login
- `server/src/services/member-reports.service.ts` — log confidential-report views
- `server/src/services/settings.service.ts` — add `update()` write path with logging
- `server/src/services/activity-log.service.ts` — add `listLogs()` read function
- `server/src/routes/users.ts` — guard `requireRole('pastor','superadmin')`
- `server/src/index.ts` — mount settings + activity-log routes

**Frontend — create:**
- `client/src/pages/admin/Dashboard.tsx` — superadmin dashboard
- `client/src/pages/admin/Logs.tsx` — full logs page (shared route target for pastor + superadmin)
- `client/src/pages/admin/Settings.tsx` — settings editor
- `client/src/components/dashboard/RecentActivityPanel.tsx` — shared recent-activity panel

**Frontend — modify:**
- `client/src/types/index.ts` — add `superadmin` to `UserRole`
- `client/src/lib/roles.ts` — home path + label for `superadmin`
- `client/src/lib/api.ts` — `listActivityLog`, `getSettings`, `updateSetting`
- `client/src/lib/nav.ts` — superadmin nav group; make pastor's Activity Log + Settings live
- `client/src/App.tsx` — superadmin routes; pastor Logs + Settings routes

---

## Task 1: Schema — enum additions + migration

**Files:**
- Modify: `server/prisma/schema.prisma` (enum `UserRole` ~line 15, enum `ActivityAction` ~line 44)

**Interfaces:**
- Produces: Prisma enum values `UserRole.superadmin`, `ActivityAction.logged_in`, `ActivityAction.changed_user_role` usable in all later tasks.

- [ ] **Step 1: Add `superadmin` to `UserRole`**

In `server/prisma/schema.prisma`, change:

```prisma
enum UserRole {
  pastor
  leader
  followup_team_lead
  followup_team_member
}
```

to:

```prisma
enum UserRole {
  superadmin
  pastor
  leader
  followup_team_lead
  followup_team_member
}
```

- [ ] **Step 2: Add new `ActivityAction` values**

In the same file, add `logged_in` and `changed_user_role` to `enum ActivityAction` (append after the existing values, before the closing brace):

```prisma
  created_user
  deactivated_user
  updated_settings
  logged_in
  changed_user_role
}
```

- [ ] **Step 3: Create and apply the migration**

Run:
```bash
pnpm --filter raising-server exec prisma migrate dev --name add_superadmin_and_audit_actions
```
Expected: migration created under `server/prisma/migrations/`, applied cleanly, and `prisma generate` runs (client types now include the new enum values).

- [ ] **Step 4: Verify the client types regenerated**

Run:
```bash
pnpm --filter raising-server build
```
Expected: PASS (no type errors). The generated `UserRole`/`ActivityAction` types now include the new members.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(db): add superadmin role and logged_in/changed_user_role audit actions"
```

---

## Task 2: Allow superadmin to manage users

**Files:**
- Modify: `server/src/services/users.service.ts:16` (`VALID_ROLES`)
- Modify: `server/src/routes/users.ts:12` (route guard)

**Interfaces:**
- Consumes: `UserRole.superadmin` (Task 1).
- Produces: `/api/v1/users` accessible to `superadmin`; `superadmin` assignable as a role.

- [ ] **Step 1: Add `superadmin` to `VALID_ROLES`**

In `server/src/services/users.service.ts`, change:

```ts
const VALID_ROLES: UserRole[] = ['pastor', 'leader', 'followup_team_lead', 'followup_team_member'];
```

to:

```ts
const VALID_ROLES: UserRole[] = ['superadmin', 'pastor', 'leader', 'followup_team_lead', 'followup_team_member'];
```

- [ ] **Step 2: Widen the users route guard to include superadmin**

In `server/src/routes/users.ts`, change:

```ts
router.use(authenticate, requireRole('pastor'));
```

to:

```ts
router.use(authenticate, requireRole('pastor', 'superadmin'));
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter raising-server build`
Expected: PASS.

- [ ] **Step 4: Runtime verify — pastor can create a superadmin**

With the server running and `$PASTOR_TOKEN` set:
```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/v1/users \
  -H "Authorization: Bearer $PASTOR_TOKEN" -H 'Content-Type: application/json' \
  -d '{"fullName":"Admin One","email":"admin1@raising.local","password":"changeme123","role":"superadmin"}'
```
Expected: `201`.

- [ ] **Step 5: Runtime verify — superadmin can list users**

```bash
SA_TOKEN=$(curl -s localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin1@raising.local","password":"changeme123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/v1/users -H "Authorization: Bearer $SA_TOKEN"
```
Expected: `200`.

- [ ] **Step 6: Runtime verify — superadmin is BLOCKED from pastoral data**

```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/v1/members -H "Authorization: Bearer $SA_TOKEN"
curl -s -o /dev/null -w '%{http_code}\n' "localhost:3000/api/v1/member-reports?memberId=x" -H "Authorization: Bearer $SA_TOKEN"
```
Expected: `403` for both.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/users.service.ts server/src/routes/users.ts
git commit -m "feat(users): allow superadmin to manage accounts; keep pastoral routes closed"
```

---

## Task 3: Seed the first superadmin from env

**Files:**
- Modify: `server/src/config.ts`
- Modify: `server/prisma/seed.ts`
- Modify: `server/.env.example`

**Interfaces:**
- Consumes: `UserRole.superadmin` (Task 1).
- Produces: idempotent superadmin bootstrap driven by `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` / `SUPERADMIN_NAME`.

- [ ] **Step 1: Expose seed env vars in config**

In `server/src/config.ts`, add these fields to the exported `config` object (they are optional — seed only runs when present):

```ts
  superadminEmail: process.env.SUPERADMIN_EMAIL || '',
  superadminPassword: process.env.SUPERADMIN_PASSWORD || '',
  superadminName: process.env.SUPERADMIN_NAME || 'Super Admin',
```

- [ ] **Step 2: Document env vars**

Append to `server/.env.example`:

```env
# Optional — seeds the first superadmin account when set (run: pnpm --filter raising-server seed)
SUPERADMIN_EMAIL=""
SUPERADMIN_PASSWORD=""
SUPERADMIN_NAME="Super Admin"
```

- [ ] **Step 3: Add idempotent superadmin seeding**

In `server/prisma/seed.ts`, inside `main()` after the pastor upsert block and before `console.log('Seed complete...`, add:

```ts
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
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter raising-server build`
Expected: PASS.

- [ ] **Step 5: Runtime verify — seed is idempotent**

```bash
SUPERADMIN_EMAIL="root@raising.local" SUPERADMIN_PASSWORD="changeme123" pnpm --filter raising-server seed
# run again — must not create a second superadmin
SUPERADMIN_EMAIL="root@raising.local" SUPERADMIN_PASSWORD="changeme123" pnpm --filter raising-server seed
```
Expected: first run prints "Superadmin created: root@raising.local"; second prints "Superadmin already exists … skipping."

- [ ] **Step 6: Commit**

```bash
git add server/src/config.ts server/prisma/seed.ts server/.env.example
git commit -m "feat(seed): bootstrap first superadmin from env (idempotent)"
```

---

## Task 4: Log successful logins

**Files:**
- Modify: `server/src/services/auth.service.ts`

**Interfaces:**
- Consumes: `writeLog` from `./activity-log.service`, `ActivityAction.logged_in` (Task 1).
- Produces: one `logged_in` activity row per successful login.

- [ ] **Step 1: Import writeLog**

In `server/src/services/auth.service.ts`, add to the imports at the top:

```ts
import { writeLog } from './activity-log.service';
```

- [ ] **Step 2: Write the log on successful login**

In `login()`, after `const token = signToken({ id: user.id, role: user.role });` and before `return {`, add:

```ts
  await writeLog({
    userId: user.id,
    action: 'logged_in',
    entityType: 'user',
    entityId: user.id,
  });
```

(Failed logins are intentionally NOT logged.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter raising-server build`
Expected: PASS. (Note: `entityType: 'user'` matches the existing `EntityType` enum member.)

- [ ] **Step 4: Runtime verify — a login writes exactly one row**

```bash
# capture count before
BEFORE=$(pnpm --filter raising-server exec prisma db execute --stdin <<'SQL' 2>/dev/null || true
SELECT count(*) FROM activity_logs WHERE action='logged_in';
SQL
)
# perform a login
curl -s -o /dev/null localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"pastor@raising.local","password":"changeme123"}'
```
Then confirm a new `logged_in` row exists (via your DB tool of choice, e.g. `psql`): the count increased by 1 and the newest row's `userId` matches the pastor.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/auth.service.ts
git commit -m "feat(audit): log successful logins"
```

---

## Task 5: Log confidential-report views

**Files:**
- Modify: `server/src/services/member-reports.service.ts` (`listReports`)

**Interfaces:**
- Consumes: `writeLog`, `ActivityAction.viewed_confidential_report` (already in schema).
- Produces: a `viewed_confidential_report` row when a user retrieves confidential reports they did NOT author.

**Rationale:** `listReports` is the only read path. A leader's query never returns other people's confidential reports (filtered out already), so only a pastor viewing a leader's confidential report triggers this — exactly the audit-worthy case. Viewing one's own confidential report is not logged.

- [ ] **Step 1: Log confidential views after fetching**

In `server/src/services/member-reports.service.ts`, in `listReports`, replace the trailing `return { data, total: data.length };` with:

```ts
  // Audit: record when a user retrieves confidential reports they did not author.
  const confidentialViewed = data.filter((r) => r.isConfidential && r.leaderId !== user.id);
  if (confidentialViewed.length > 0) {
    await writeLog({
      userId: user.id,
      action: 'viewed_confidential_report',
      entityType: 'member_report',
      entityId: memberId,
      metadata: { memberId, reportIds: confidentialViewed.map((r) => r.id) },
    });
  }

  return { data, total: data.length };
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter raising-server build`
Expected: PASS.

- [ ] **Step 3: Runtime verify**

Preconditions: a member exists with at least one confidential report authored by a leader (not the pastor). As the pastor:
```bash
curl -s -o /dev/null "localhost:3000/api/v1/member-reports?memberId=<MEMBER_ID>" \
  -H "Authorization: Bearer $PASTOR_TOKEN"
```
Expected: a new `viewed_confidential_report` row with `userId` = pastor and `metadata.reportIds` listing the confidential report(s). Repeating the call as the authoring leader produces NO such row (they authored it / it's filtered).

- [ ] **Step 4: Commit**

```bash
git add server/src/services/member-reports.service.ts
git commit -m "feat(audit): log confidential-report views by non-authors"
```

---

## Task 6: Settings write path + settings route + settings-change logging

**Files:**
- Modify: `server/src/services/settings.service.ts`
- Create: `server/src/routes/settings.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `writeLog`, `ActivityAction.updated_settings` (exists), `EntityType.settings` (exists), `prisma`, `AppError`.
- Produces:
  - `settingsService.update(actorId: string, key: string, value: string): Promise<{ key: string; value: string }>`
  - `GET /api/v1/settings` → `{ data: Record<string,string> }` (any authenticated user)
  - `PUT /api/v1/settings/:key` body `{ value: string }` → `{ key, value }` (pastor + superadmin)

- [ ] **Step 1: Add `update()` to the settings service**

In `server/src/services/settings.service.ts`, add these imports at the top:

```ts
import { AppError } from '../lib/errors';
import { writeLog } from './activity-log.service';
```

Then add this function before the final `export const settingsService = ...` and include it in the export:

```ts
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
```

Update the export line to:

```ts
export const settingsService = { getAll, get, getNumber, update };
```

- [ ] **Step 2: Create the settings route**

Create `server/src/routes/settings.ts`:

```ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { settingsService } from '../services/settings.service';
import { asyncHandler } from '../lib/asyncHandler';
import { AppError } from '../lib/errors';

const router = Router();

// Any authenticated user may read settings (silence thresholds, toggles, etc.).
router.get(
  '/',
  authenticate,
  asyncHandler(async (_req, res) => {
    const data = await settingsService.getAll();
    res.json({ data });
  })
);

// Only pastor + superadmin may change settings.
router.put(
  '/:key',
  authenticate,
  requireRole('pastor', 'superadmin'),
  asyncHandler(async (req, res) => {
    const { value } = req.body ?? {};
    if (typeof value !== 'string') throw new AppError(400, 'value is required');
    const result = await settingsService.update(req.user!.id, req.params.key, value);
    res.json(result);
  })
);

export default router;
```

- [ ] **Step 3: Mount the route**

In `server/src/index.ts`, add the import alongside the other route imports:

```ts
import settingsRoutes from './routes/settings';
```

and mount it with the others:

```ts
app.use('/api/v1/settings', settingsRoutes);
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter raising-server build`
Expected: PASS.

- [ ] **Step 5: Runtime verify — read, write, guard, audit**

```bash
# read (pastor)
curl -s localhost:3000/api/v1/settings -H "Authorization: Bearer $PASTOR_TOKEN"
# write (pastor) — expect 200 and {"key":"reportThresholdDays","value":"21"}
curl -s localhost:3000/api/v1/settings/reportThresholdDays -X PUT \
  -H "Authorization: Bearer $PASTOR_TOKEN" -H 'Content-Type: application/json' -d '{"value":"21"}'
# superadmin may also write — expect 200
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/v1/settings/reportThresholdDays -X PUT \
  -H "Authorization: Bearer $SA_TOKEN" -H 'Content-Type: application/json' -d '{"value":"14"}'
# unknown key — expect 400
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/v1/settings/bogus -X PUT \
  -H "Authorization: Bearer $PASTOR_TOKEN" -H 'Content-Type: application/json' -d '{"value":"x"}'
```
Expected: read returns the settings map; writes return `200`; unknown key returns `400`; each successful write produced an `updated_settings` activity row with `metadata.from`/`metadata.to`.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/settings.service.ts server/src/routes/settings.ts server/src/index.ts
git commit -m "feat(settings): add pastor/superadmin settings write route with audit logging"
```

---

## Task 7: Fix role-change audit action

**Files:**
- Modify: `server/src/services/users.service.ts` (`updateUser`, the role-change `writeLog`)

**Interfaces:**
- Consumes: `ActivityAction.changed_user_role` (Task 1).
- Produces: role changes now log as `changed_user_role` instead of `updated_settings`.

- [ ] **Step 1: Change the action on the role-change log**

In `server/src/services/users.service.ts`, inside `updateUser`, change the role-change `writeLog` block's `action` and comment:

```ts
  // A role change is an audit-relevant event.
  if (data.role !== undefined && data.role !== target.role) {
    await writeLog({
      userId: actorId,
      action: 'changed_user_role',
      entityType: 'user',
      entityId: user.id,
      metadata: { field: 'role', from: target.role, to: data.role },
    });
  }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter raising-server build`
Expected: PASS.

- [ ] **Step 3: Runtime verify**

```bash
# change a user's role, then confirm a changed_user_role row was written
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/v1/users/<USER_ID> -X PATCH \
  -H "Authorization: Bearer $PASTOR_TOKEN" -H 'Content-Type: application/json' -d '{"role":"leader"}'
```
Expected: `200`, and a new `changed_user_role` activity row (not `updated_settings`) with `metadata.from`/`metadata.to`.

- [ ] **Step 4: Commit**

```bash
git add server/src/services/users.service.ts
git commit -m "fix(audit): log role changes as changed_user_role"
```

---

## Task 8: Activity-log read service + route

**Files:**
- Modify: `server/src/services/activity-log.service.ts` (add `listLogs`)
- Create: `server/src/routes/activity-log.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `prisma`, existing `writeLog`.
- Produces:
  - `activityLogService.listLogs(opts: { page?: number; pageSize?: number; action?: string; userId?: string }): Promise<{ data: ActivityLogRow[]; total: number }>` where each row includes `user: { fullName: string }`.
  - `GET /api/v1/activity-log?page=&pageSize=&action=&userId=` (pastor + superadmin) → `{ data, total }`

- [ ] **Step 1: Add `listLogs` to the service**

In `server/src/services/activity-log.service.ts`, add before the final `export const activityLogService = ...`:

```ts
interface ListLogsOpts {
  page?: number;
  pageSize?: number;
  action?: string;
  userId?: string;
}

async function listLogs(opts: ListLogsOpts = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));

  const where: Prisma.ActivityLogWhereInput = {};
  if (opts.action) where.action = opts.action as ActivityAction;
  if (opts.userId) where.userId = opts.userId;

  const [rows, total] = await prisma.$transaction([
    prisma.activityLog.findMany({
      where,
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return { data: rows, total };
}
```

Update the export to include it:

```ts
export const activityLogService = { writeLog, listLogs };
```

- [ ] **Step 2: Create the route**

Create `server/src/routes/activity-log.ts`:

```ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { activityLogService } from '../services/activity-log.service';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

// Read-only audit trail. Pastor + superadmin only. No write/delete endpoints.
router.use(authenticate, requireRole('pastor', 'superadmin'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
    const pageSize = req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : undefined;
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const result = await activityLogService.listLogs({ page, pageSize, action, userId });
    res.json(result);
  })
);

export default router;
```

- [ ] **Step 3: Mount the route**

In `server/src/index.ts`, add the import:

```ts
import activityLogRoutes from './routes/activity-log';
```

and mount:

```ts
app.use('/api/v1/activity-log', activityLogRoutes);
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter raising-server build`
Expected: PASS. (Note: `Prisma` and `ActivityAction` are already imported in `activity-log.service.ts`.)

- [ ] **Step 5: Runtime verify — read + guard**

```bash
# pastor & superadmin: 200
curl -s -o /dev/null -w '%{http_code}\n' "localhost:3000/api/v1/activity-log?pageSize=5" -H "Authorization: Bearer $PASTOR_TOKEN"
curl -s -o /dev/null -w '%{http_code}\n' "localhost:3000/api/v1/activity-log?pageSize=5" -H "Authorization: Bearer $SA_TOKEN"
# body shape
curl -s "localhost:3000/api/v1/activity-log?pageSize=5" -H "Authorization: Bearer $PASTOR_TOKEN"
```
Expected: both `200`; body is `{ "data": [ { …, "user": { "fullName": … } } ], "total": N }`, newest first. A leader token returns `403`.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/activity-log.service.ts server/src/routes/activity-log.ts server/src/index.ts
git commit -m "feat(audit): read-only activity-log endpoint for pastor + superadmin"
```

---

## Task 9: Frontend foundations — types, roles, api

**Files:**
- Modify: `client/src/types/index.ts:1`
- Modify: `client/src/lib/roles.ts`
- Modify: `client/src/lib/api.ts`

**Interfaces:**
- Consumes: backend endpoints from Tasks 6 & 8.
- Produces:
  - `UserRole` union includes `'superadmin'`.
  - `homePathForRole('superadmin') === '/admin'`; `roleLabels.superadmin === 'Super Admin'`.
  - `listActivityLog(params?): Promise<ApiList<ActivityLog>>`
  - `getSettings(): Promise<Record<string, string>>`
  - `updateSetting(key: string, value: string): Promise<{ key: string; value: string }>`

- [ ] **Step 1: Add superadmin to the role union**

In `client/src/types/index.ts`, change the first line to:

```ts
export type UserRole = 'superadmin' | 'pastor' | 'leader' | 'followup_team_lead' | 'followup_team_member';
```

- [ ] **Step 2: Add superadmin home path + label**

In `client/src/lib/roles.ts`, add a case to `homePathForRole` (before `default`):

```ts
    case 'superadmin':
      return '/admin';
```

and add to `roleLabels`:

```ts
  superadmin: 'Super Admin',
```

- [ ] **Step 3: Add API functions**

In `client/src/lib/api.ts`, add `ActivityLog` to the type import from `../types`, then append:

```ts
// ── Activity Log (pastor + superadmin) ────────
export async function listActivityLog(params?: {
  page?: number;
  pageSize?: number;
  action?: string;
  userId?: string;
}): Promise<ApiList<ActivityLog>> {
  const { data } = await api.get('/activity-log', { params });
  return data;
}

// ── Settings (read all; write pastor + superadmin) ──
export async function getSettings(): Promise<Record<string, string>> {
  const { data } = await api.get('/settings');
  return data.data;
}

export async function updateSetting(key: string, value: string): Promise<{ key: string; value: string }> {
  const { data } = await api.put(`/settings/${key}`, { value });
  return data;
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter raising-client build`
Expected: PASS. (`ActivityLog` and `Setting` types already exist in `types/index.ts`; `roleLabels` is a `Record<UserRole,string>` so the new key is required and now present.)

- [ ] **Step 5: Commit**

```bash
git add client/src/types/index.ts client/src/lib/roles.ts client/src/lib/api.ts
git commit -m "feat(client): superadmin role type, home path, and activity-log/settings API clients"
```

---

## Task 10: Shared RecentActivityPanel component

**Files:**
- Create: `client/src/components/dashboard/RecentActivityPanel.tsx`

**Interfaces:**
- Consumes: `listActivityLog` (Task 9), `ActivityLog` type.
- Produces: `<RecentActivityPanel limit?={number} />` — a self-contained card that fetches recent logs and links to `/…/logs` (link target passed via prop `viewAllTo`).

- [ ] **Step 1: Create the component**

Create `client/src/components/dashboard/RecentActivityPanel.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listActivityLog } from '../../lib/api';
import type { ActivityLog } from '../../types';

// Human-readable labels for audit actions.
const ACTION_LABELS: Record<string, string> = {
  logged_in: 'signed in',
  created_user: 'created a user',
  deactivated_user: 'deactivated a user',
  changed_user_role: 'changed a user role',
  updated_settings: 'updated settings',
  viewed_confidential_report: 'viewed a confidential report',
  submitted_member_report: 'submitted a report',
  redacted_report: 'redacted a report',
  deleted_report: 'deleted a report',
  added_member: 'added a member',
  updated_member: 'updated a member',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}

export function RecentActivityPanel({ viewAllTo, limit = 8 }: { viewAllTo: string; limit?: number }) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listActivityLog({ pageSize: limit })
      .then((res) => setLogs(res.data))
      .catch(() => setError('Could not load activity.'))
      .finally(() => setLoading(false));
  }, [limit]);

  return (
    <div className="rounded-card border border-hairline bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
        <Link to={viewAllTo} className="text-xs font-medium text-accent hover:underline">
          View all
        </Link>
      </div>
      {loading ? (
        <p className="text-sm text-faint">Loading…</p>
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-faint">No activity yet.</p>
      ) : (
        <ul className="space-y-3">
          {logs.map((log) => (
            <li key={log.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink">
                <span className="font-medium">{log.user?.fullName ?? 'Someone'}</span>{' '}
                <span className="text-faint">{actionLabel(log.action)}</span>
              </span>
              <time className="shrink-0 text-xs text-faint">
                {new Date(log.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter raising-client build`
Expected: PASS. (If any Tailwind token class name here—`text-accent`, `text-danger`—does not exist in the project, substitute the nearest existing token used elsewhere in `components/`; verify by grepping `client/src` for the class before finalizing.)

- [ ] **Step 3: Commit**

```bash
git add client/src/components/dashboard/RecentActivityPanel.tsx
git commit -m "feat(client): shared RecentActivityPanel for dashboards"
```

---

## Task 11: Logs page

**Files:**
- Create: `client/src/pages/admin/Logs.tsx`

**Interfaces:**
- Consumes: `listActivityLog` (Task 9), `AppShell`, `useAuth`.
- Produces: `<Logs />` — paginated, filterable audit table. Reused by pastor and superadmin routes; back link derives from the current user's home path.

- [ ] **Step 1: Create the page**

Create `client/src/pages/admin/Logs.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { listActivityLog } from '../../lib/api';
import { homePathForRole } from '../../lib/roles';
import { useAuth } from '../../hooks/useAuth';
import type { ActivityLog } from '../../types';

const PAGE_SIZE = 25;

export default function Logs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    listActivityLog({ page, pageSize: PAGE_SIZE })
      .then((res) => {
        setLogs(res.data);
        setTotal(res.total);
      })
      .catch(() => setError('Could not load the activity log.'))
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const home = user ? homePathForRole(user.role) : '/';

  return (
    <AppShell
      title="Activity Log"
      subtitle={loading ? undefined : `${total} entries`}
      back={{ to: home, label: 'Dashboard' }}
    >
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : (
        <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-hairline text-xs uppercase tracking-wide text-faint">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-hairline last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-faint">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-ink">{log.user?.fullName ?? '—'}</td>
                  <td className="px-4 py-3 text-ink">{log.action.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-faint">{log.entityType}</td>
                </tr>
              ))}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-faint">
                    No activity recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          className="rounded-md border border-hairline px-3 py-1.5 text-ink disabled:opacity-40"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || loading}
        >
          Previous
        </button>
        <span className="text-faint">
          Page {page} of {totalPages}
        </span>
        <button
          className="rounded-md border border-hairline px-3 py-1.5 text-ink disabled:opacity-40"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || loading}
        >
          Next
        </button>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter raising-client build`
Expected: PASS. (Confirm `AppShell`'s `back` prop shape matches `{ to, label }` as used in `pages/pastor/Users.tsx`. Adjust token class names if any don't exist, per Task 10 note.)

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/admin/Logs.tsx
git commit -m "feat(client): activity-log page (pastor + superadmin)"
```

---

## Task 12: Settings page

**Files:**
- Create: `client/src/pages/admin/Settings.tsx`

**Interfaces:**
- Consumes: `getSettings`, `updateSetting` (Task 9), `AppShell`, `useAuth`.
- Produces: `<Settings />` — edits the known settings keys; reused by pastor and superadmin routes.

- [ ] **Step 1: Create the page**

Create `client/src/pages/admin/Settings.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { Button, Field, Input, Select } from '../../components/ui';
import { getSettings, updateSetting } from '../../lib/api';
import { homePathForRole } from '../../lib/roles';
import { useAuth } from '../../hooks/useAuth';

// Field definitions for the known, writable settings.
const FIELDS: Array<{
  key: string;
  label: string;
  help: string;
  type: 'number' | 'boolean' | 'select';
  options?: Array<{ value: string; label: string }>;
}> = [
  { key: 'reportThresholdDays', label: 'Report threshold (days)', help: 'Days before a member is flagged as unreported.', type: 'number' },
  { key: 'allowDeleteReports', label: 'Allow report deletion', help: 'Master toggle for redact/delete.', type: 'boolean' },
  {
    key: 'deletePermission',
    label: 'Who may delete',
    help: 'Applies when deletion is enabled.',
    type: 'select',
    options: [
      { value: 'pastor_only', label: 'Pastor only' },
      { value: 'leaders', label: 'Leaders' },
    ],
  },
  { key: 'notificationsEnabled', label: 'Notifications enabled', help: 'Master toggle for in-app notifications.', type: 'boolean' },
  {
    key: 'reportReminderDay',
    label: 'Report reminder day',
    help: 'Day of week leaders are reminded.',
    type: 'select',
    options: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => ({
      value: d,
      label: d.charAt(0).toUpperCase() + d.slice(1),
    })),
  },
];

export default function Settings() {
  const { user } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getSettings()
      .then(setValues)
      .catch(() => setError('Could not load settings.'))
      .finally(() => setLoading(false));
  }, []);

  async function save(key: string, value: string) {
    setSavingKey(key);
    setValues((v) => ({ ...v, [key]: value }));
    try {
      await updateSetting(key, value);
    } catch {
      setError(`Could not save ${key}.`);
    } finally {
      setSavingKey(null);
    }
  }

  const home = user ? homePathForRole(user.role) : '/';

  return (
    <AppShell title="Settings" back={{ to: home, label: 'Dashboard' }}>
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      {loading ? (
        <p className="text-sm text-faint">Loading…</p>
      ) : (
        <div className="max-w-xl space-y-6 rounded-card border border-hairline bg-surface p-6 shadow-card">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.help}>
              {f.type === 'boolean' ? (
                <Select
                  value={values[f.key] ?? 'false'}
                  onChange={(e) => save(f.key, e.target.value)}
                  disabled={savingKey === f.key}
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </Select>
              ) : f.type === 'select' ? (
                <Select
                  value={values[f.key] ?? ''}
                  onChange={(e) => save(f.key, e.target.value)}
                  disabled={savingKey === f.key}
                >
                  {f.options!.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  type="number"
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  onBlur={(e) => save(f.key, e.target.value)}
                  disabled={savingKey === f.key}
                />
              )}
            </Field>
          ))}
        </div>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter raising-client build`
Expected: PASS. **Before finalizing**, confirm the `Field`/`Input`/`Select` component prop names (`label`, `hint`, `disabled`) against `client/src/components/ui/` — the Users page imports these from `../../components/ui`. If `Field` uses a different prop for helper text (e.g. `help` instead of `hint`), match the actual signature.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/admin/Settings.tsx
git commit -m "feat(client): settings editor (pastor + superadmin)"
```

---

## Task 13: Superadmin dashboard, nav, and routing

**Files:**
- Create: `client/src/pages/admin/Dashboard.tsx`
- Modify: `client/src/lib/nav.ts`
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/pastor/Dashboard.tsx` (add RecentActivityPanel)

**Interfaces:**
- Consumes: `RecentActivityPanel` (Task 10), `Logs`/`Settings` pages (Tasks 11–12), `PastorUsers` (existing), `RequireRole`.
- Produces: `/admin`, `/admin/users`, `/admin/logs`, `/admin/settings` routes; pastor `/pastor/logs`, `/pastor/settings` routes; superadmin nav; recent-activity on both dashboards.

- [ ] **Step 1: Create the superadmin dashboard**

Create `client/src/pages/admin/Dashboard.tsx`:

```tsx
import { AppShell } from '../../components/layout/AppShell';
import { RecentActivityPanel } from '../../components/dashboard/RecentActivityPanel';
import { useAuth } from '../../hooks/useAuth';

export default function AdminDashboard() {
  const { user } = useAuth();

  return (
    <AppShell title="Admin" subtitle={user ? `Signed in as ${user.fullName}` : undefined}>
      <div className="grid gap-6 lg:grid-cols-2">
        <RecentActivityPanel viewAllTo="/admin/logs" />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Add the superadmin nav group and make pastor items live**

In `client/src/lib/nav.ts`, add a `case 'superadmin':` at the top of the switch, returning:

```ts
    case 'superadmin':
      return [
        { items: [{ label: 'Dashboard', to: '/admin', icon: IconGrid }] },
        {
          heading: 'Admin',
          items: [
            { label: 'Users', to: '/admin/users', icon: IconUsers },
            { label: 'Activity Log', to: '/admin/logs', icon: IconActivity },
            { label: 'Settings', to: '/admin/settings', icon: IconSettings },
          ],
        },
      ];
```

Then in the existing `case 'pastor':` Admin group, give the Activity Log and Settings items live routes (remove their `phase`):

```ts
          items: [
            { label: 'Users', to: '/pastor/users', icon: IconUsers },
            { label: 'Activity Log', to: '/pastor/logs', icon: IconActivity },
            { label: 'Settings', to: '/pastor/settings', icon: IconSettings },
          ],
```

- [ ] **Step 3: Add routes in App.tsx**

In `client/src/App.tsx`, add imports:

```ts
import AdminDashboard from './pages/admin/Dashboard';
import AdminLogs from './pages/admin/Logs';
import AdminSettings from './pages/admin/Settings';
```

Add pastor Logs + Settings routes (after the `/pastor/users` route):

```tsx
            <Route
              path="/pastor/logs"
              element={
                <RequireRole roles={['pastor']}>
                  <AdminLogs />
                </RequireRole>
              }
            />
            <Route
              path="/pastor/settings"
              element={
                <RequireRole roles={['pastor']}>
                  <AdminSettings />
                </RequireRole>
              }
            />
```

Add the superadmin route block (after the pastor block):

```tsx
            {/* Superadmin */}
            <Route
              path="/admin"
              element={
                <RequireRole roles={['superadmin']}>
                  <AdminDashboard />
                </RequireRole>
              }
            />
            <Route
              path="/admin/users"
              element={
                <RequireRole roles={['superadmin']}>
                  <PastorUsers />
                </RequireRole>
              }
            />
            <Route
              path="/admin/logs"
              element={
                <RequireRole roles={['superadmin']}>
                  <AdminLogs />
                </RequireRole>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <RequireRole roles={['superadmin']}>
                  <AdminSettings />
                </RequireRole>
              }
            />
```

Note: `PastorUsers` is already imported. Its "back" link points to `/pastor`; that is a known cosmetic quirk when reused at `/admin/users` and is acceptable for this pass (a follow-up can make the back target role-aware).

- [ ] **Step 4: Add RecentActivityPanel to the pastor dashboard**

In `client/src/pages/pastor/Dashboard.tsx`, import the panel and render it within the dashboard content:

```tsx
import { RecentActivityPanel } from '../../components/dashboard/RecentActivityPanel';
```

Place `<RecentActivityPanel viewAllTo="/pastor/logs" />` in a sensible spot in the existing layout (e.g. appended to the main content grid/column). Match the surrounding JSX structure.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter raising-client build`
Expected: PASS.

- [ ] **Step 6: Runtime verify (browser)**

Start client + server. Then:
- Log in as the superadmin → lands on `/admin`; nav shows Dashboard, Users, Activity Log, Settings only. Recent-activity panel loads. `/admin/users`, `/admin/logs`, `/admin/settings` all render. Manually visiting `/pastor` or `/leader` redirects to `/admin`.
- Log in as the pastor → dashboard shows the recent-activity panel; `/pastor/logs` and `/pastor/settings` render and work.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/admin client/src/lib/nav.ts client/src/App.tsx client/src/pages/pastor/Dashboard.tsx
git commit -m "feat(client): superadmin dashboard/nav/routes; logs panel on pastor + admin dashboards"
```

---

## Final verification

- [ ] **Backend build:** `pnpm --filter raising-server build` → PASS
- [ ] **Client build:** `pnpm --filter raising-client build` → PASS
- [ ] **Access-control matrix (runtime):** superadmin → 200 on users/settings/activity-log, 403 on members/member-reports; leader → 403 on activity-log/settings-write; pastor → 200 across admin + pastoral.
- [ ] **Audit coverage (runtime):** performing each of login, create/deactivate user, role change, settings change, confidential-report view produces exactly one correctly-typed `activity_logs` row.
- [ ] **Seed idempotency:** running the seed twice yields exactly one superadmin.
```
