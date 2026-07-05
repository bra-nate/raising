# Phase 4 — First-Timer Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the follow-up team log calls to first-time visitors (intake via CSV batch upload + single-add, assignment by claim-on-call) and let the pastor / team lead convert a first-timer into a congregation member, with the converted member's profile showing pre-conversion call history.

**Architecture:** Mirrors the existing Member module (Phases 2–3). Two new Express services (`first-timers.service.ts`, `first-timer-reports.service.ts`) hold all access scoping, transactions, and audit logging; thin routes call them. Four new React pages (follow-up + pastor list/profile) plus an extension to the existing pastor member profile. One Prisma migration.

**Tech Stack:** Express + Prisma (PostgreSQL) + TypeScript (server); Vite + React 18 + React Router + Axios + Tailwind (client). Package manager: **pnpm** (workspaces `raising-server`, `raising-client`).

## Global Constraints

- All routes prefixed `/api/v1/`; JSON bodies; errors `{ error: string }` with status via `AppError(status, message)`.
- Middleware order per route: `authenticate` → `requireRole(...)` → handler; handler wrapped in `asyncHandler`.
- Access scoping is enforced in the **service layer** against `req.user` (`JwtPayload = { id, role }`); query params are never trusted for scoping.
- All DB access through the `prisma` singleton (`server/src/lib/prisma.ts`); all multi-table writes use `prisma.$transaction`.
- Activity logging via `writeLog({ userId, action, entityType, entityId?, metadata?, tx? })`, called **inside** the triggering service function (pass `tx` when inside a transaction).
- Notifications via `notificationsService.createNotification({ userId, type, title, message, entityType?, entityId?, tx? })`.
- List endpoints return `{ data, total }`. Successful mutations return the entity.
- Never delete/redact `isSafetyFlagged` reports (not applicable to first-timer reports — no such flag exists).
- Roles: `pastor | leader | followup_team_lead | followup_team_member | superadmin`.
- No automated test framework exists. **Verification = TypeScript typecheck + manual walkthrough**, matching Phases 1–3.
- Frontend uses the Relate design system: components from `components/ui` (`Button`, `Input`, `Select`, `Field`, `Badge`, `Card`, `Modal`), `AppShell` layout, `lib/utils` helpers (`fullName`, `relativeDate`), design tokens, dark-mode aware. `Modal` already portals to `<body>`.

### Verification commands (used by every task)

- Server typecheck: `pnpm --filter raising-server exec tsc --noEmit`
- Client typecheck/build: `pnpm --filter raising-client exec tsc -b`
- Prisma: `pnpm --filter raising-server exec prisma migrate dev` / `prisma generate`
- Run API for manual checks: `pnpm dev:server` (port 3000). Get a token:
  ```bash
  TOKEN=$(curl -s localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' \
    -d '{"email":"pastor@example.com","password":"<seed-password>"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
  ```
  (Use the seeded pastor credentials from `server/prisma/seed.ts`. Create follow-up users via `/pastor/users` or the Users page for role-scoped checks.)

---

## Deviations from the spec (intentional)

- **Group selection at conversion is omitted.** There is no groups API, and existing member creation (`MemberInput`) has no `groupId`. `convertToMember` accepts an optional `groupId` server-side for forward-compat, but the convert modal selects a **leader only**, consistent with `PastorMemberNew`.

---

## Task 1: Schema migration — enum value, `serviceName`, drop `serviceType`

**Files:**
- Modify: `server/prisma/schema.prisma`

**Interfaces:**
- Produces: `ActivityAction.added_first_timer`; `FirstTimer.serviceName: String?` (replaces `serviceType`); removes `enum ServiceType`.

- [ ] **Step 1: Add the enum value.** In `schema.prisma`, add `added_first_timer` to `enum ActivityAction` (place after `converted_first_timer`):

```prisma
enum ActivityAction {
  submitted_member_report
  submitted_first_timer_report
  added_member
  updated_member
  converted_first_timer
  added_first_timer
  viewed_confidential_report
  redacted_report
  deleted_report
  created_user
  deactivated_user
  updated_settings
  logged_in
  changed_user_role
}
```

- [ ] **Step 2: Replace `serviceType` with `serviceName` on `FirstTimer`.** Change the field line:

```prisma
  // remove: serviceType ServiceType?
  serviceName       String?
```

Keep `visitDate DateTime` unchanged.

- [ ] **Step 3: Remove the now-unused `ServiceType` enum.** Delete the whole `enum ServiceType { … }` block (lines defining `sunday_service`/`midweek`/`special_event`/`other`). Confirm nothing else references it: `grep -rn "ServiceType" server/src` returns nothing.

- [ ] **Step 4: Create + apply the migration.**

Run: `pnpm --filter raising-server exec prisma migrate dev --name phase4_first_timers`
Expected: migration created under `server/prisma/migrations/`, applied, and `prisma generate` runs. (FirstTimer table is empty pre-Phase-4, so dropping `serviceType` loses no data.)

- [ ] **Step 5: Typecheck server.**

Run: `pnpm --filter raising-server exec tsc --noEmit`
Expected: PASS (no code references `serviceType` yet).

- [ ] **Step 6: Commit.**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(db): phase 4 schema — added_first_timer action, first-timer serviceName, drop serviceType"
```

---

## Task 2: `first-timers.service.ts`

**Files:**
- Create: `server/src/services/first-timers.service.ts`

**Interfaces:**
- Consumes: `prisma`, `AppError`, `JwtPayload`, `writeLog`, `notificationsService`, `randomUUID` from `node:crypto`.
- Produces: `firstTimersService = { listFirstTimers, getFirstTimer, createFirstTimer, createBatch, updateFirstTimer, convertToMember }`.
  - `listFirstTimers(user): Promise<{ data, total }>`
  - `getFirstTimer(user, id): Promise<FirstTimer>`
  - `createFirstTimer(user, input): Promise<FirstTimer>` — `input: { firstName, lastName, phone?, email?, serviceName?, visitDate }`
  - `createBatch(user, input): Promise<{ created: number; errors: { row: number; reason: string }[] }>` — `input: { meetingName, visitDate, rows: { firstName, lastName, phone?, email? }[] }`
  - `updateFirstTimer(user, id, input): Promise<FirstTimer>`
  - `convertToMember(user, id, input): Promise<Member>` — `input: { assignedLeaderId, groupId? }`

- [ ] **Step 1: Write the service file.**

```ts
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { JwtPayload } from '../lib/jwt';
import { writeLog } from './activity-log.service';
import { notificationsService } from './notifications.service';

const FT_INCLUDE = {
  assignedTo: { select: { fullName: true } },
} as const;

// Team member sees own + the unassigned pool. Team lead / pastor see all active.
async function listFirstTimers(user: JwtPayload) {
  const where =
    user.role === 'followup_team_member'
      ? { isActive: true, OR: [{ assignedToId: user.id }, { assignedToId: null }] }
      : { isActive: true };
  const rows = await prisma.firstTimer.findMany({
    where,
    include: FT_INCLUDE,
    // pending first, then most recent meeting
    orderBy: [{ status: 'asc' }, { visitDate: 'desc' }],
  });
  return { data: rows, total: rows.length };
}

// Team member may view own or a claimable (unassigned) record; never another's.
async function getFirstTimer(user: JwtPayload, id: string) {
  const ft = await prisma.firstTimer.findUnique({ where: { id }, include: FT_INCLUDE });
  if (!ft) throw new AppError(404, 'First-timer not found');
  if (
    user.role === 'followup_team_member' &&
    ft.assignedToId !== null &&
    ft.assignedToId !== user.id
  ) {
    throw new AppError(403, 'Forbidden');
  }
  return ft;
}

interface CreateFirstTimerInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  serviceName?: string;
  visitDate?: string;
}

function parseVisitDate(value: string | undefined): Date {
  if (!value) throw new AppError(400, 'visitDate is required');
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new AppError(400, 'visitDate is invalid');
  return d;
}

async function createFirstTimer(user: JwtPayload, input: CreateFirstTimerInput) {
  if (!input.firstName?.trim() || !input.lastName?.trim()) {
    throw new AppError(400, 'firstName and lastName are required');
  }
  const visitDate = parseVisitDate(input.visitDate);

  const ft = await prisma.$transaction(async (tx) => {
    const created = await tx.firstTimer.create({
      data: {
        firstName: input.firstName!.trim(),
        lastName: input.lastName!.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        serviceName: input.serviceName?.trim() || null,
        visitDate,
      },
      include: FT_INCLUDE,
    });
    await writeLog({
      userId: user.id,
      action: 'added_first_timer',
      entityType: 'first_timer',
      entityId: created.id,
      metadata: { name: `${created.firstName} ${created.lastName}` },
      tx,
    });
    return created;
  });

  return ft;
}

interface BatchInput {
  meetingName?: string;
  visitDate?: string;
  rows?: { firstName?: string; lastName?: string; phone?: string; email?: string }[];
}

// One meeting per upload: meetingName -> serviceName, visitDate applied to all
// rows. Each created row logs `added_first_timer` sharing one batchId.
async function createBatch(user: JwtPayload, input: BatchInput) {
  const meetingName = input.meetingName?.trim();
  if (!meetingName) throw new AppError(400, 'meetingName is required');
  const visitDate = parseVisitDate(input.visitDate);
  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (rows.length === 0) throw new AppError(400, 'rows is required');

  const batchId = randomUUID();
  const errors: { row: number; reason: string }[] = [];

  const valid = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => {
      if (!r.firstName?.trim() || !r.lastName?.trim()) {
        errors.push({ row: i + 1, reason: 'firstName and lastName are required' });
        return false;
      }
      return true;
    });

  const created = await prisma.$transaction(async (tx) => {
    let count = 0;
    for (const { r } of valid) {
      const ft = await tx.firstTimer.create({
        data: {
          firstName: r.firstName!.trim(),
          lastName: r.lastName!.trim(),
          phone: r.phone?.trim() || null,
          email: r.email?.trim() || null,
          serviceName: meetingName,
          visitDate,
        },
      });
      await writeLog({
        userId: user.id,
        action: 'added_first_timer',
        entityType: 'first_timer',
        entityId: ft.id,
        metadata: { batchId, meetingName, name: `${ft.firstName} ${ft.lastName}` },
        tx,
      });
      count += 1;
    }
    return count;
  });

  return { created, errors };
}

interface UpdateFirstTimerInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  serviceName?: string;
  visitDate?: string;
  assignedToId?: string | null;
  status?: string;
}

const FT_STATUSES = ['pending', 'contacted', 'interested', 'not_interested', 'converted'];

// Team lead + pastor only (route-guarded).
async function updateFirstTimer(user: JwtPayload, id: string, input: UpdateFirstTimerInput) {
  const existing = await prisma.firstTimer.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'First-timer not found');

  const data: Record<string, unknown> = {};
  if (input.firstName !== undefined) {
    if (!input.firstName.trim()) throw new AppError(400, 'firstName cannot be empty');
    data.firstName = input.firstName.trim();
  }
  if (input.lastName !== undefined) {
    if (!input.lastName.trim()) throw new AppError(400, 'lastName cannot be empty');
    data.lastName = input.lastName.trim();
  }
  if (input.phone !== undefined) data.phone = input.phone.trim() || null;
  if (input.email !== undefined) data.email = input.email.trim() || null;
  if (input.serviceName !== undefined) data.serviceName = input.serviceName.trim() || null;
  if (input.visitDate !== undefined) data.visitDate = parseVisitDate(input.visitDate);
  if (input.status !== undefined) {
    if (!FT_STATUSES.includes(input.status)) throw new AppError(400, 'Invalid status');
    data.status = input.status;
  }

  let notifyAssignee: string | null = null;
  if (input.assignedToId !== undefined) {
    if (input.assignedToId === null) {
      data.assignedToId = null;
    } else {
      const assignee = await prisma.user.findUnique({ where: { id: input.assignedToId } });
      const followupRoles = ['followup_team_lead', 'followup_team_member'];
      if (!assignee || !assignee.isActive || !followupRoles.includes(assignee.role)) {
        throw new AppError(400, 'assignedToId must be an active follow-up team member');
      }
      data.assignedToId = input.assignedToId;
      if (existing.assignedToId !== input.assignedToId) notifyAssignee = input.assignedToId;
    }
  }

  if (Object.keys(data).length === 0) throw new AppError(400, 'Nothing to update');

  const ft = await prisma.firstTimer.update({ where: { id }, data, include: FT_INCLUDE });

  if (notifyAssignee) {
    await notificationsService.createNotification({
      userId: notifyAssignee,
      type: 'first_timer_assigned',
      title: 'First-timer assigned to you',
      message: `${ft.firstName} ${ft.lastName} was assigned to you for follow-up.`,
      entityType: 'first_timer',
      entityId: ft.id,
    });
  }

  return ft;
}

interface ConvertInput {
  assignedLeaderId?: string;
  groupId?: string;
}

// Team lead + pastor only (route-guarded). Atomic: create member + flip status.
async function convertToMember(user: JwtPayload, id: string, input: ConvertInput) {
  const ft = await prisma.firstTimer.findUnique({ where: { id } });
  if (!ft) throw new AppError(404, 'First-timer not found');
  if (ft.status === 'converted' || ft.convertedMemberId) {
    throw new AppError(409, 'First-timer is already converted');
  }
  if (!input.assignedLeaderId) throw new AppError(400, 'assignedLeaderId is required');
  const leader = await prisma.user.findUnique({ where: { id: input.assignedLeaderId } });
  if (!leader || leader.role !== 'leader') throw new AppError(400, 'assignedLeaderId must be a leader');
  if (input.groupId) {
    const group = await prisma.group.findUnique({ where: { id: input.groupId } });
    if (!group || group.leaderId !== input.assignedLeaderId) {
      throw new AppError(400, 'groupId must belong to the assigned leader');
    }
  }

  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.member.create({
      data: {
        firstName: ft.firstName,
        lastName: ft.lastName,
        phone: ft.phone,
        email: ft.email,
        address: ft.address,
        assignedLeaderId: input.assignedLeaderId!,
        groupId: input.groupId || null,
        createdById: user.id,
        convertedFromFirstTimerId: ft.id,
      },
    });
    await tx.firstTimer.update({
      where: { id: ft.id },
      data: { status: 'converted', convertedAt: new Date(), convertedMemberId: created.id },
    });
    await writeLog({
      userId: user.id,
      action: 'converted_first_timer',
      entityType: 'first_timer',
      entityId: ft.id,
      metadata: { memberId: created.id, assignedLeaderId: input.assignedLeaderId },
      tx,
    });
    return created;
  });

  return member;
}

export const firstTimersService = {
  listFirstTimers,
  getFirstTimer,
  createFirstTimer,
  createBatch,
  updateFirstTimer,
  convertToMember,
};
```

- [ ] **Step 2: Typecheck server.**

Run: `pnpm --filter raising-server exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add server/src/services/first-timers.service.ts
git commit -m "feat(server): first-timers service — list/get/create/batch/update/convert"
```

---

## Task 3: `first-timers` routes + mount

**Files:**
- Create: `server/src/routes/first-timers.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `firstTimersService` (Task 2), `authenticate`, `requireRole`, `asyncHandler`.
- Produces: mounted router at `/api/v1/first-timers`.

- [ ] **Step 1: Write the router.** `/batch` is declared before `/:id`.

```ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { firstTimersService } from '../services/first-timers.service';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();
const FOLLOWUP = ['pastor', 'followup_team_lead', 'followup_team_member'] as const;

router.use(authenticate);

router.get(
  '/',
  requireRole(...FOLLOWUP),
  asyncHandler(async (req, res) => {
    res.json(await firstTimersService.listFirstTimers(req.user!));
  })
);

router.post(
  '/',
  requireRole(...FOLLOWUP),
  asyncHandler(async (req, res) => {
    const ft = await firstTimersService.createFirstTimer(req.user!, req.body ?? {});
    res.status(201).json(ft);
  })
);

// Must precede '/:id'.
router.post(
  '/batch',
  requireRole(...FOLLOWUP),
  asyncHandler(async (req, res) => {
    const result = await firstTimersService.createBatch(req.user!, req.body ?? {});
    res.status(201).json(result);
  })
);

router.get(
  '/:id',
  requireRole(...FOLLOWUP),
  asyncHandler(async (req, res) => {
    res.json(await firstTimersService.getFirstTimer(req.user!, req.params.id));
  })
);

router.patch(
  '/:id',
  requireRole('pastor', 'followup_team_lead'),
  asyncHandler(async (req, res) => {
    res.json(await firstTimersService.updateFirstTimer(req.user!, req.params.id, req.body ?? {}));
  })
);

router.post(
  '/:id/convert',
  requireRole('pastor', 'followup_team_lead'),
  asyncHandler(async (req, res) => {
    const member = await firstTimersService.convertToMember(req.user!, req.params.id, req.body ?? {});
    res.status(201).json(member);
  })
);

export default router;
```

- [ ] **Step 2: Mount in `index.ts`.** Add the import beside the other route imports and mount beside the others:

```ts
import firstTimerRoutes from './routes/first-timers';
// …
app.use('/api/v1/first-timers', firstTimerRoutes);
```

- [ ] **Step 3: Typecheck server.**

Run: `pnpm --filter raising-server exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual verify.** With `pnpm dev:server` running and a pastor `$TOKEN`:

```bash
# create single
curl -s localhost:3000/api/v1/first-timers -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"firstName":"Ada","lastName":"Obi","visitDate":"2026-07-05","serviceName":"Sunday Service"}'
# batch
curl -s localhost:3000/api/v1/first-timers/batch -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"meetingName":"Sunday Service","visitDate":"2026-07-05","rows":[{"firstName":"Kofi","lastName":"Mensah"},{"lastName":"NoFirst"}]}'
# list
curl -s localhost:3000/api/v1/first-timers -H "Authorization: Bearer $TOKEN"
```
Expected: single returns 201 with a first-timer; batch returns `{"created":1,"errors":[{"row":2,"reason":"firstName and lastName are required"}]}`; list returns `{ data, total }`.

- [ ] **Step 5: Commit.**

```bash
git add server/src/routes/first-timers.ts server/src/index.ts
git commit -m "feat(server): mount /api/v1/first-timers routes"
```

---

## Task 4: `first-timer-reports.service.ts` (claim-on-call + status map)

**Files:**
- Create: `server/src/services/first-timer-reports.service.ts`

**Interfaces:**
- Consumes: `prisma`, `AppError`, `JwtPayload`, `writeLog`, `CallOutcome`/`FirstTimerStatus` from `@prisma/client`.
- Produces: `firstTimerReportsService = { listReports, createReport }`.
  - `listReports(user, firstTimerId): Promise<{ data, total }>`
  - `createReport(user, input): Promise<FirstTimerReport>` — `input: { firstTimerId, callOutcome, content? }`

- [ ] **Step 1: Write the service file.**

```ts
import { CallOutcome, FirstTimerStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { JwtPayload } from '../lib/jwt';
import { writeLog } from './activity-log.service';

const VALID_OUTCOMES: CallOutcome[] = [
  'answered',
  'no_answer',
  'callback_requested',
  'interested',
  'not_interested',
];

const REPORT_INCLUDE = {
  reportedBy: { select: { fullName: true } },
} as const;

// Outcome-driven status map. Returns null = leave status unchanged.
function statusForOutcome(outcome: CallOutcome): FirstTimerStatus | null {
  switch (outcome) {
    case 'interested':
      return 'interested';
    case 'not_interested':
      return 'not_interested';
    case 'answered':
    case 'callback_requested':
      return 'contacted';
    case 'no_answer':
    default:
      return null;
  }
}

// Team member may act on own or claimable (unassigned) records; never another's.
async function loadFirstTimerForUser(user: JwtPayload, firstTimerId: string) {
  const ft = await prisma.firstTimer.findUnique({ where: { id: firstTimerId } });
  if (!ft) throw new AppError(404, 'First-timer not found');
  if (
    user.role === 'followup_team_member' &&
    ft.assignedToId !== null &&
    ft.assignedToId !== user.id
  ) {
    throw new AppError(403, 'Forbidden');
  }
  return ft;
}

async function listReports(user: JwtPayload, firstTimerId: string) {
  if (!firstTimerId) throw new AppError(400, 'firstTimerId is required');
  await loadFirstTimerForUser(user, firstTimerId);

  const where =
    user.role === 'followup_team_member'
      ? { firstTimerId, reportedById: user.id }
      : { firstTimerId };

  const data = await prisma.firstTimerReport.findMany({
    where,
    include: REPORT_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return { data, total: data.length };
}

interface CreateReportInput {
  firstTimerId?: string;
  callOutcome?: CallOutcome;
  content?: string;
}

async function createReport(user: JwtPayload, input: CreateReportInput) {
  if (!input.firstTimerId) throw new AppError(400, 'firstTimerId is required');
  if (!input.callOutcome || !VALID_OUTCOMES.includes(input.callOutcome)) {
    throw new AppError(400, 'A valid callOutcome is required');
  }
  const ft = await loadFirstTimerForUser(user, input.firstTimerId);

  const report = await prisma.$transaction(async (tx) => {
    // Claim-on-call: a team member logging the first call on an unassigned
    // record takes ownership.
    if (ft.assignedToId === null && user.role === 'followup_team_member') {
      await tx.firstTimer.update({ where: { id: ft.id }, data: { assignedToId: user.id } });
    }

    const created = await tx.firstTimerReport.create({
      data: {
        firstTimerId: ft.id,
        reportedById: user.id,
        callOutcome: input.callOutcome!,
        content: input.content?.trim() || null,
      },
      include: REPORT_INCLUDE,
    });

    // Auto-update status; never overwrite a converted first-timer.
    const next = statusForOutcome(input.callOutcome!);
    if (next && ft.status !== 'converted' && ft.status !== next) {
      await tx.firstTimer.update({ where: { id: ft.id }, data: { status: next } });
    }

    await writeLog({
      userId: user.id,
      action: 'submitted_first_timer_report',
      entityType: 'first_timer_report',
      entityId: created.id,
      metadata: { firstTimerId: ft.id, callOutcome: input.callOutcome },
      tx,
    });

    return created;
  });

  return report;
}

export const firstTimerReportsService = { listReports, createReport };
```

- [ ] **Step 2: Typecheck server.**

Run: `pnpm --filter raising-server exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add server/src/services/first-timer-reports.service.ts
git commit -m "feat(server): first-timer-reports service — claim-on-call + status map"
```

---

## Task 5: `first-timer-reports` routes + mount

**Files:**
- Create: `server/src/routes/first-timer-reports.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `firstTimerReportsService` (Task 4).
- Produces: mounted router at `/api/v1/first-timer-reports`.

- [ ] **Step 1: Write the router.**

```ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { firstTimerReportsService } from '../services/first-timer-reports.service';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();
const FOLLOWUP = ['pastor', 'followup_team_lead', 'followup_team_member'] as const;

router.use(authenticate);

router.get(
  '/',
  requireRole(...FOLLOWUP),
  asyncHandler(async (req, res) => {
    const firstTimerId = typeof req.query.firstTimerId === 'string' ? req.query.firstTimerId : '';
    res.json(await firstTimerReportsService.listReports(req.user!, firstTimerId));
  })
);

router.post(
  '/',
  requireRole(...FOLLOWUP),
  asyncHandler(async (req, res) => {
    const report = await firstTimerReportsService.createReport(req.user!, req.body ?? {});
    res.status(201).json(report);
  })
);

export default router;
```

- [ ] **Step 2: Mount in `index.ts`.**

```ts
import firstTimerReportRoutes from './routes/first-timer-reports';
// …
app.use('/api/v1/first-timer-reports', firstTimerReportRoutes);
```

- [ ] **Step 3: Typecheck server.**

Run: `pnpm --filter raising-server exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual verify.** With a pastor `$TOKEN` and a first-timer id `$FT` from Task 3:

```bash
curl -s localhost:3000/api/v1/first-timer-reports -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"firstTimerId\":\"$FT\",\"callOutcome\":\"answered\",\"content\":\"Reached, will visit again\"}"
curl -s "localhost:3000/api/v1/first-timer-reports?firstTimerId=$FT" -H "Authorization: Bearer $TOKEN"
curl -s "localhost:3000/api/v1/first-timers/$FT" -H "Authorization: Bearer $TOKEN"
```
Expected: report created (201); list returns it; the first-timer's `status` is now `contacted`.

- [ ] **Step 5: Commit.**

```bash
git add server/src/routes/first-timer-reports.ts server/src/index.ts
git commit -m "feat(server): mount /api/v1/first-timer-reports routes"
```

---

## Task 6: Frontend types, API client, nav

**Files:**
- Modify: `client/src/types/index.ts`
- Modify: `client/src/lib/api.ts`
- Modify: `client/src/lib/nav.ts`

**Interfaces:**
- Produces (types): updated `FirstTimer` (`serviceName?`, `teamLeadId?`, `convertedAt?`, `convertedMemberId?`); `FirstTimerReport` unchanged (already present).
- Produces (api): `listFirstTimers`, `getFirstTimer`, `createFirstTimer`, `uploadFirstTimersBatch`, `updateFirstTimer`, `convertFirstTimer`, `listFirstTimerReports`, `createFirstTimerReport`, plus input interfaces `FirstTimerInput`, `BatchUploadInput`, `FirstTimerReportInput`.
- Produces (nav): live `/followup/first-timers` and `/pastor/first-timers` items.

- [ ] **Step 1: Update `types/index.ts`.** Replace the `FirstTimer` interface (lines ~59–74) with:

```ts
export interface FirstTimer {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  address?: string;
  visitDate: string;
  serviceName?: string;
  assignedToId?: string | null;
  assignedTo?: { fullName: string };
  teamLeadId?: string;
  status: FirstTimerStatus;
  convertedAt?: string;
  convertedMemberId?: string;
  isActive: boolean;
  createdAt: string;
}
```

- [ ] **Step 2: Add API functions to `lib/api.ts`.** Add `FirstTimer`, `FirstTimerReport` to the type import block at the top, then append this section at the end of the file:

```ts
// ── First-Timers ──────────────────────────────
export async function listFirstTimers(): Promise<ApiList<FirstTimer>> {
  const { data } = await api.get('/first-timers');
  return data;
}

export async function getFirstTimer(id: string): Promise<FirstTimer> {
  const { data } = await api.get(`/first-timers/${id}`);
  return data;
}

export interface FirstTimerInput {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  serviceName?: string;
  visitDate: string;
}

export async function createFirstTimer(input: FirstTimerInput): Promise<FirstTimer> {
  const { data } = await api.post('/first-timers', input);
  return data;
}

export interface BatchUploadRow {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
}
export interface BatchUploadInput {
  meetingName: string;
  visitDate: string;
  rows: BatchUploadRow[];
}
export async function uploadFirstTimersBatch(
  input: BatchUploadInput
): Promise<{ created: number; errors: { row: number; reason: string }[] }> {
  const { data } = await api.post('/first-timers/batch', input);
  return data;
}

export async function updateFirstTimer(
  id: string,
  input: Partial<FirstTimerInput> & { assignedToId?: string | null; status?: FirstTimerStatus }
): Promise<FirstTimer> {
  const { data } = await api.patch(`/first-timers/${id}`, input);
  return data;
}

export async function convertFirstTimer(
  id: string,
  input: { assignedLeaderId: string; groupId?: string }
): Promise<Member> {
  const { data } = await api.post(`/first-timers/${id}/convert`, input);
  return data;
}

// ── First-Timer Reports ───────────────────────
export async function listFirstTimerReports(firstTimerId: string): Promise<ApiList<FirstTimerReport>> {
  const { data } = await api.get('/first-timer-reports', { params: { firstTimerId } });
  return data;
}

export interface FirstTimerReportInput {
  firstTimerId: string;
  callOutcome: CallOutcome;
  content?: string;
}
export async function createFirstTimerReport(input: FirstTimerReportInput): Promise<FirstTimerReport> {
  const { data } = await api.post('/first-timer-reports', input);
  return data;
}
```

Also add `CallOutcome`, `FirstTimer`, `FirstTimerReport`, and `FirstTimerStatus` to the existing `import type { … }` from `'../types'` at the top of `api.ts` (`Member` is already imported there).

- [ ] **Step 3: Make nav items live in `lib/nav.ts`.** In the `pastor` group replace `{ label: 'First-Timers', icon: IconPhone, phase: 4 }` with `{ label: 'First-Timers', to: '/pastor/first-timers', icon: IconPhone }`. In the follow-up group replace `{ label: 'First-Timers', icon: IconPhone, phase: 4 }` with `{ label: 'First-Timers', to: '/followup/first-timers', icon: IconPhone }`.

- [ ] **Step 4: Typecheck client.**

Run: `pnpm --filter raising-client exec tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add client/src/types/index.ts client/src/lib/api.ts client/src/lib/nav.ts
git commit -m "feat(client): first-timer types, API client, live nav"
```

---

## Task 7: Shared first-timer list utilities + follow-up list page

**Files:**
- Create: `client/src/lib/firstTimers.ts` (status badge meta + CSV parser — shared by follow-up and pastor pages)
- Create: `client/src/pages/followup/FirstTimers.tsx`

**Interfaces:**
- Consumes: api functions (Task 6), `AppShell`, `Button`, `Modal`, `Field`, `Input`, `Badge`, `useAuth`.
- Produces: `ftStatusMeta` map and `parseCsv(text): { rows: BatchUploadRow[]; errors: string[] }` in `lib/firstTimers.ts`; default-export `FollowUpFirstTimers` page.

- [ ] **Step 1: Write `lib/firstTimers.ts`.**

```ts
import type { FirstTimerStatus } from '../types';
import type { BatchUploadRow } from './api';

export const ftStatusMeta: Record<FirstTimerStatus, { label: string; tone: 'neutral' | 'info' | 'good' | 'attention' | 'concern' }> = {
  pending: { label: 'Pending', tone: 'attention' },
  contacted: { label: 'Contacted', tone: 'info' },
  interested: { label: 'Interested', tone: 'good' },
  not_interested: { label: 'Not interested', tone: 'concern' },
  converted: { label: 'Converted', tone: 'good' },
};

export const callOutcomeLabels: Record<string, string> = {
  answered: 'Answered',
  no_answer: 'No answer',
  callback_requested: 'Callback requested',
  interested: 'Interested',
  not_interested: 'Not interested',
};

// Minimal CSV parser: header row maps columns firstName,lastName,phone,email.
// Handles quoted cells with embedded commas/quotes. Blank lines skipped.
export function parseCsv(text: string): { rows: BatchUploadRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    errors.push('CSV needs a header row and at least one data row.');
    return { rows: [], errors };
  }
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };
  const header = parseLine(lines[0]).map((h) => h.toLowerCase());
  const idx = {
    firstName: header.indexOf('firstname'),
    lastName: header.indexOf('lastname'),
    phone: header.indexOf('phone'),
    email: header.indexOf('email'),
  };
  if (idx.firstName === -1 || idx.lastName === -1) {
    errors.push('CSV header must include firstName and lastName columns.');
    return { rows: [], errors };
  }
  const rows: BatchUploadRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const firstName = cells[idx.firstName] ?? '';
    const lastName = cells[idx.lastName] ?? '';
    if (!firstName || !lastName) {
      errors.push(`Row ${i}: missing first or last name — skipped.`);
      continue;
    }
    rows.push({
      firstName,
      lastName,
      phone: idx.phone >= 0 ? cells[idx.phone] || undefined : undefined,
      email: idx.email >= 0 ? cells[idx.email] || undefined : undefined,
    });
  }
  return { rows, errors };
}
```

- [ ] **Step 2: Write `pages/followup/FirstTimers.tsx`.** Mirrors the `AppShell`+table shell of `pages/pastor/Members.tsx`. Includes an "Upload CSV" modal (parse → preview → commit) and an "Add first-timer" modal (single-add).

```tsx
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, Field, Input, Modal } from '../../components/ui';
import { IconPlus, IconSearch, IconUpload } from '../../components/ui/icons';
import {
  createFirstTimer,
  listFirstTimers,
  uploadFirstTimersBatch,
  type BatchUploadRow,
} from '../../lib/api';
import { ftStatusMeta, parseCsv } from '../../lib/firstTimers';
import { relativeDate } from '../../lib/utils';
import type { FirstTimer } from '../../types';

export default function FollowUpFirstTimers() {
  const [items, setItems] = useState<FirstTimer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  async function reload() {
    const { data } = await listFirstTimers();
    setItems(data);
  }

  useEffect(() => {
    reload()
      .catch(() => setError('Could not load first-timers.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((f) => `${f.firstName} ${f.lastName}`.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <AppShell
      title="First-Timers"
      subtitle={loading ? undefined : `${filtered.length} of ${items.length} shown`}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowUpload(true)}>
            <IconUpload className="h-4 w-4" />
            Upload CSV
          </Button>
          <Button variant="primary" onClick={() => setShowAdd(true)}>
            <IconPlus className="h-4 w-4" />
            Add first-timer
          </Button>
        </div>
      }
    >
      <div className="mb-4 relative max-w-sm">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name…" className="pl-9" />
      </div>

      <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
        {loading ? (
          <div className="p-8 text-body text-faint">Loading…</div>
        ) : error ? (
          <div className="p-8 text-body text-concern">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-body font-medium text-ink-2">No first-timers yet</p>
            <p className="mt-1 text-caption text-faint">Upload a meeting list or add one to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-hairline text-caption uppercase tracking-wide text-faint">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Meeting</th>
                  <th className="px-5 py-3 font-medium">Visit date</th>
                  <th className="px-5 py-3 font-medium">Assigned to</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => {
                  const s = ftStatusMeta[f.status];
                  return (
                    <tr key={f.id} className="border-b border-hairline last:border-0 transition hover:bg-surface-2">
                      <td className="px-5 py-3">
                        <Link to={`/followup/first-timers/${f.id}`} className="text-body font-medium text-ink-2 hover:text-accent">
                          {f.firstName} {f.lastName}
                        </Link>
                      </td>
                      <td className="px-5 py-3"><Badge tone={s.tone}>{s.label}</Badge></td>
                      <td className="px-5 py-3 text-body text-muted">{f.serviceName ?? '—'}</td>
                      <td className="px-5 py-3 text-body text-muted">{relativeDate(f.visitDate)}</td>
                      <td className="px-5 py-3 text-body text-muted">{f.assignedTo?.fullName ?? 'Unassigned'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddFirstTimerModal open={showAdd} onClose={() => setShowAdd(false)} onSaved={reload} />
      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onSaved={reload} />
    </AppShell>
  );
}

function AddFirstTimerModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', serviceName: '', visitDate: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.visitDate) {
      setError('First name, last name, and visit date are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createFirstTimer(form);
      await onSaved();
      setForm({ firstName: '', lastName: '', phone: '', email: '', serviceName: '', visitDate: '' });
      onClose();
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not add first-timer.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add first-timer" description="For a single walk-in.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="First name"><Input value={form.firstName} onChange={set('firstName')} required /></Field>
          <Field label="Last name"><Input value={form.lastName} onChange={set('lastName')} required /></Field>
        </div>
        <Field label="Meeting" hint="Which service they joined"><Input value={form.serviceName} onChange={set('serviceName')} /></Field>
        <Field label="Visit date"><Input type="date" value={form.visitDate} onChange={set('visitDate')} required /></Field>
        <Field label="Phone" hint="Optional"><Input value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Email" hint="Optional"><Input type="email" value={form.email} onChange={set('email')} /></Field>
        {error && <p className="text-body text-concern">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Adding…' : 'Add'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function UploadModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [meetingName, setMeetingName] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [rows, setRows] = useState<BatchUploadRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: { row: number; reason: string }[] } | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ''));
      setRows(parsed.rows);
      setParseErrors(parsed.errors);
    };
    reader.readAsText(file);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!meetingName.trim() || !visitDate) { setError('Meeting name and date are required.'); return; }
    if (rows.length === 0) { setError('Upload a CSV with at least one valid row.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await uploadFirstTimersBatch({ meetingName, visitDate, rows });
      setResult(res);
      await onSaved();
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed.');
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setMeetingName(''); setVisitDate(''); setRows([]); setParseErrors([]); setError(''); setResult(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={close} title="Upload first-timers" description="One meeting per upload. CSV columns: firstName, lastName, phone, email.">
      {result ? (
        <div className="space-y-4">
          <p className="text-body text-ink-2">Created <strong>{result.created}</strong> first-timer(s).</p>
          {result.errors.length > 0 && (
            <ul className="max-h-40 overflow-y-auto rounded-input border border-hairline bg-wash p-3 text-caption text-muted">
              {result.errors.map((er) => <li key={er.row}>Row {er.row}: {er.reason}</li>)}
            </ul>
          )}
          <div className="flex justify-end"><Button variant="primary" onClick={close}>Done</Button></div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Meeting name"><Input value={meetingName} onChange={(e) => setMeetingName(e.target.value)} required /></Field>
          <Field label="Meeting date"><Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} required /></Field>
          <Field label="CSV file" hint="Header row with firstName, lastName, phone, email">
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="block w-full text-body text-muted file:mr-3 file:rounded-btn file:border file:border-action file:bg-surface file:px-3 file:py-2 file:text-body file:text-action-ink" />
          </Field>
          {rows.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-input border border-hairline">
              <table className="w-full text-left text-caption">
                <thead><tr className="text-faint"><th className="px-3 py-1.5">Name</th><th className="px-3 py-1.5">Phone</th><th className="px-3 py-1.5">Email</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-hairline"><td className="px-3 py-1.5 text-ink-2">{r.firstName} {r.lastName}</td><td className="px-3 py-1.5 text-muted">{r.phone ?? '—'}</td><td className="px-3 py-1.5 text-muted">{r.email ?? '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {parseErrors.length > 0 && <ul className="text-caption text-attention">{parseErrors.map((er, i) => <li key={i}>{er}</li>)}</ul>}
          <p className="text-caption text-faint">{rows.length} row(s) ready.</p>
          {error && <p className="text-body text-concern">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving || rows.length === 0}>{saving ? 'Uploading…' : `Upload ${rows.length}`}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
```

- [ ] **Step 3: Ensure `IconUpload` exists.** Check `client/src/components/ui/icons.tsx` for an `IconUpload` export; if absent, add one mirroring `IconDownload` (an upward arrow). Example:

```tsx
export const IconUpload = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 15V3m0 0 4 4m-4-4L8 7" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);
```

- [ ] **Step 4: Typecheck client.**

Run: `pnpm --filter raising-client exec tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add client/src/lib/firstTimers.ts client/src/pages/followup/FirstTimers.tsx client/src/components/ui/icons.tsx
git commit -m "feat(client): follow-up first-timers list with CSV upload + single-add"
```

---

## Task 8: Follow-up first-timer profile + Log Call

**Files:**
- Create: `client/src/pages/followup/FirstTimerProfile.tsx`

**Interfaces:**
- Consumes: `getFirstTimer`, `listFirstTimerReports`, `createFirstTimerReport`, `ftStatusMeta`, `callOutcomeLabels`, `relativeDate`.
- Produces: default-export `FollowUpFirstTimerProfile`.

- [ ] **Step 1: Write the page.**

```tsx
import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, Card, Field, Input, Modal, Select } from '../../components/ui';
import { IconPhone } from '../../components/ui/icons';
import { createFirstTimerReport, getFirstTimer, listFirstTimerReports } from '../../lib/api';
import { callOutcomeLabels, ftStatusMeta } from '../../lib/firstTimers';
import { relativeDate } from '../../lib/utils';
import type { CallOutcome, FirstTimer, FirstTimerReport } from '../../types';

const OUTCOMES: CallOutcome[] = ['answered', 'no_answer', 'callback_requested', 'interested', 'not_interested'];

export default function FollowUpFirstTimerProfile() {
  const { id = '' } = useParams();
  const [ft, setFt] = useState<FirstTimer | null>(null);
  const [reports, setReports] = useState<FirstTimerReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showLog, setShowLog] = useState(false);

  async function reload() {
    const [f, r] = await Promise.all([getFirstTimer(id), listFirstTimerReports(id)]);
    setFt(f);
    setReports(r.data);
  }

  useEffect(() => {
    reload()
      .catch(() => setError('Could not load this first-timer.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <AppShell title="First-timer"><div className="p-8 text-body text-faint">Loading…</div></AppShell>;
  if (error || !ft) return <AppShell title="First-timer" back={{ to: '/followup/first-timers', label: 'First-Timers' }}><div className="p-8 text-body text-concern">{error || 'Not found.'}</div></AppShell>;

  const s = ftStatusMeta[ft.status];

  return (
    <AppShell
      title={`${ft.firstName} ${ft.lastName}`}
      subtitle={ft.serviceName ? `Joined at ${ft.serviceName}` : undefined}
      back={{ to: '/followup/first-timers', label: 'First-Timers' }}
      actions={<Button variant="primary" onClick={() => setShowLog(true)}><IconPhone className="h-4 w-4" />Log call</Button>}
    >
      <Card className="mb-6 max-w-lg p-6">
        <div className="flex items-center gap-2"><Badge tone={s.tone}>{s.label}</Badge></div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-body">
          <div><dt className="text-caption text-faint">Phone</dt><dd className="text-ink-2">{ft.phone ?? '—'}</dd></div>
          <div><dt className="text-caption text-faint">Email</dt><dd className="text-ink-2">{ft.email ?? '—'}</dd></div>
          <div><dt className="text-caption text-faint">Visit date</dt><dd className="text-ink-2">{relativeDate(ft.visitDate)}</dd></div>
          <div><dt className="text-caption text-faint">Assigned to</dt><dd className="text-ink-2">{ft.assignedTo?.fullName ?? 'Unassigned'}</dd></div>
        </dl>
      </Card>

      <h2 className="mb-3 text-heading-sm font-semibold text-ink-2">Call history</h2>
      {reports.length === 0 ? (
        <p className="text-body text-muted">No calls logged yet.</p>
      ) : (
        <ol className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-card border border-hairline bg-surface p-4">
              <div className="flex items-center justify-between">
                <Badge tone="info">{callOutcomeLabels[r.callOutcome] ?? r.callOutcome}</Badge>
                <span className="text-caption text-faint">{relativeDate(r.createdAt)}</span>
              </div>
              {r.content && <p className="mt-2 text-body text-muted">{r.content}</p>}
              {r.reportedBy && <p className="mt-1 text-caption text-faint">by {r.reportedBy.fullName}</p>}
            </li>
          ))}
        </ol>
      )}

      <LogCallModal open={showLog} onClose={() => setShowLog(false)} firstTimerId={id} onSaved={reload} />
    </AppShell>
  );
}

function LogCallModal({ open, onClose, firstTimerId, onSaved }: { open: boolean; onClose: () => void; firstTimerId: string; onSaved: () => Promise<void> }) {
  const [callOutcome, setCallOutcome] = useState<CallOutcome>('answered');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createFirstTimerReport({ firstTimerId, callOutcome, content: content.trim() || undefined });
      await onSaved();
      setContent('');
      setCallOutcome('answered');
      onClose();
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not log the call.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Log a call" description="Logging a call assigns this first-timer to you.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Outcome">
          <Select value={callOutcome} onChange={(e) => setCallOutcome(e.target.value as CallOutcome)}>
            {OUTCOMES.map((o) => <option key={o} value={o}>{callOutcomeLabels[o]}</option>)}
          </Select>
        </Field>
        <Field label="Notes" hint="Optional">
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4}
            className="w-full rounded-input border border-border bg-surface px-3.5 py-2.5 text-body text-ink-2 outline-none transition placeholder:text-faint focus:border-info focus:shadow-focus" />
        </Field>
        {error && <p className="text-body text-concern">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save call'}</Button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Typecheck client.**

Run: `pnpm --filter raising-client exec tsc -b`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add client/src/pages/followup/FirstTimerProfile.tsx
git commit -m "feat(client): follow-up first-timer profile with call logging"
```

---

## Task 9: Pastor first-timer list page

**Files:**
- Create: `client/src/pages/pastor/FirstTimers.tsx`

**Interfaces:**
- Consumes: same api + `lib/firstTimers` utilities as Task 7. Reuses the same upload + single-add modals — extract them or re-declare. To stay DRY, **export** `AddFirstTimerModal` and `UploadModal` from `pages/followup/FirstTimers.tsx` and import them here.
- Produces: default-export `PastorFirstTimers`.

- [ ] **Step 1: Export the shared modals from Task 7.** In `pages/followup/FirstTimers.tsx`, change `function AddFirstTimerModal` → `export function AddFirstTimerModal` and `function UploadModal` → `export function UploadModal`.

- [ ] **Step 2: Write `pages/pastor/FirstTimers.tsx`.** Adds a status filter and an assigned-to filter; back link to `/pastor`; rows link to `/pastor/first-timers/:id`.

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, Input, Select } from '../../components/ui';
import { IconPlus, IconSearch, IconUpload } from '../../components/ui/icons';
import { listFirstTimers } from '../../lib/api';
import { ftStatusMeta } from '../../lib/firstTimers';
import { relativeDate } from '../../lib/utils';
import type { FirstTimer, FirstTimerStatus } from '../../types';
import { AddFirstTimerModal, UploadModal } from '../followup/FirstTimers';

export default function PastorFirstTimers() {
  const [items, setItems] = useState<FirstTimer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | FirstTimerStatus>('all');
  const [assignee, setAssignee] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  async function reload() {
    const { data } = await listFirstTimers();
    setItems(data);
  }
  useEffect(() => {
    reload().catch(() => setError('Could not load first-timers.')).finally(() => setLoading(false));
  }, []);

  const assignees = useMemo(
    () => Array.from(new Set(items.map((f) => f.assignedTo?.fullName).filter(Boolean))) as string[],
    [items]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((f) => {
      if (status !== 'all' && f.status !== status) return false;
      if (assignee !== 'all' && (f.assignedTo?.fullName ?? '') !== assignee) return false;
      if (q && !`${f.firstName} ${f.lastName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, status, assignee]);

  return (
    <AppShell
      title="First-Timers"
      subtitle={loading ? undefined : `${filtered.length} of ${items.length} shown`}
      back={{ to: '/pastor', label: 'Dashboard' }}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowUpload(true)}><IconUpload className="h-4 w-4" />Upload CSV</Button>
          <Button variant="primary" onClick={() => setShowAdd(true)}><IconPlus className="h-4 w-4" />Add first-timer</Button>
        </div>
      }
    >
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name…" className="pl-9" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as 'all' | FirstTimerStatus)}>
          <option value="all">Any status</option>
          <option value="pending">Pending</option>
          <option value="contacted">Contacted</option>
          <option value="interested">Interested</option>
          <option value="not_interested">Not interested</option>
          <option value="converted">Converted</option>
        </Select>
        <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="all">Anyone</option>
          {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
      </div>

      <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
        {loading ? (
          <div className="p-8 text-body text-faint">Loading…</div>
        ) : error ? (
          <div className="p-8 text-body text-concern">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center"><p className="text-body font-medium text-ink-2">No first-timers match</p><p className="mt-1 text-caption text-faint">Try clearing a filter.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="border-b border-hairline text-caption uppercase tracking-wide text-faint">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Meeting</th>
                  <th className="px-5 py-3 font-medium">Visit date</th>
                  <th className="px-5 py-3 font-medium">Assigned to</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => {
                  const s = ftStatusMeta[f.status];
                  return (
                    <tr key={f.id} className="border-b border-hairline last:border-0 transition hover:bg-surface-2">
                      <td className="px-5 py-3">
                        <Link to={`/pastor/first-timers/${f.id}`} className="text-body font-medium text-ink-2 hover:text-accent">{f.firstName} {f.lastName}</Link>
                      </td>
                      <td className="px-5 py-3"><Badge tone={s.tone}>{s.label}</Badge></td>
                      <td className="px-5 py-3 text-body text-muted">{f.serviceName ?? '—'}</td>
                      <td className="px-5 py-3 text-body text-muted">{relativeDate(f.visitDate)}</td>
                      <td className="px-5 py-3 text-body text-muted">{f.assignedTo?.fullName ?? 'Unassigned'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddFirstTimerModal open={showAdd} onClose={() => setShowAdd(false)} onSaved={reload} />
      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onSaved={reload} />
    </AppShell>
  );
}
```

- [ ] **Step 3: Typecheck client.**

Run: `pnpm --filter raising-client exec tsc -b`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add client/src/pages/pastor/FirstTimers.tsx client/src/pages/followup/FirstTimers.tsx
git commit -m "feat(client): pastor first-timers list with filters"
```

---

## Task 10: Pastor first-timer profile + Convert modal

**Files:**
- Create: `client/src/pages/pastor/FirstTimerProfile.tsx`

**Interfaces:**
- Consumes: `getFirstTimer`, `listFirstTimerReports`, `convertFirstTimer`, `listUsers`, `ftStatusMeta`, `callOutcomeLabels`, `relativeDate`.
- Produces: default-export `PastorFirstTimerProfile`.

- [ ] **Step 1: Write the page.** Read-only call history (pastor sees all reports) + a Convert modal that selects a leader (leaders fetched via `listUsers`, filtered client-side as in `PastorMemberNew`). When already converted, link to the member.

```tsx
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, Card, Field, Modal, Select } from '../../components/ui';
import { convertFirstTimer, getFirstTimer, listFirstTimerReports, listUsers } from '../../lib/api';
import { callOutcomeLabels, ftStatusMeta } from '../../lib/firstTimers';
import { relativeDate } from '../../lib/utils';
import type { FirstTimer, FirstTimerReport, User } from '../../types';

export default function PastorFirstTimerProfile() {
  const { id = '' } = useParams();
  const [ft, setFt] = useState<FirstTimer | null>(null);
  const [reports, setReports] = useState<FirstTimerReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConvert, setShowConvert] = useState(false);

  async function reload() {
    const [f, r] = await Promise.all([getFirstTimer(id), listFirstTimerReports(id)]);
    setFt(f);
    setReports(r.data);
  }
  useEffect(() => {
    reload().catch(() => setError('Could not load this first-timer.')).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <AppShell title="First-timer"><div className="p-8 text-body text-faint">Loading…</div></AppShell>;
  if (error || !ft) return <AppShell title="First-timer" back={{ to: '/pastor/first-timers', label: 'First-Timers' }}><div className="p-8 text-body text-concern">{error || 'Not found.'}</div></AppShell>;

  const s = ftStatusMeta[ft.status];
  const isConverted = ft.status === 'converted' || Boolean(ft.convertedMemberId);

  return (
    <AppShell
      title={`${ft.firstName} ${ft.lastName}`}
      subtitle={ft.serviceName ? `Joined at ${ft.serviceName}` : undefined}
      back={{ to: '/pastor/first-timers', label: 'First-Timers' }}
      actions={
        isConverted && ft.convertedMemberId ? (
          <Button variant="secondary" onClick={() => { window.location.href = `/pastor/members/${ft.convertedMemberId}`; }}>View member</Button>
        ) : (
          <Button variant="primary" onClick={() => setShowConvert(true)}>Convert to Son/Daughter</Button>
        )
      }
    >
      <Card className="mb-6 max-w-lg p-6">
        <div className="flex items-center gap-2"><Badge tone={s.tone}>{s.label}</Badge></div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-body">
          <div><dt className="text-caption text-faint">Phone</dt><dd className="text-ink-2">{ft.phone ?? '—'}</dd></div>
          <div><dt className="text-caption text-faint">Email</dt><dd className="text-ink-2">{ft.email ?? '—'}</dd></div>
          <div><dt className="text-caption text-faint">Visit date</dt><dd className="text-ink-2">{relativeDate(ft.visitDate)}</dd></div>
          <div><dt className="text-caption text-faint">Assigned to</dt><dd className="text-ink-2">{ft.assignedTo?.fullName ?? 'Unassigned'}</dd></div>
        </dl>
      </Card>

      <h2 className="mb-3 text-heading-sm font-semibold text-ink-2">Call history</h2>
      {reports.length === 0 ? (
        <p className="text-body text-muted">No calls logged yet.</p>
      ) : (
        <ol className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-card border border-hairline bg-surface p-4">
              <div className="flex items-center justify-between">
                <Badge tone="info">{callOutcomeLabels[r.callOutcome] ?? r.callOutcome}</Badge>
                <span className="text-caption text-faint">{relativeDate(r.createdAt)}</span>
              </div>
              {r.content && <p className="mt-2 text-body text-muted">{r.content}</p>}
              {r.reportedBy && <p className="mt-1 text-caption text-faint">by {r.reportedBy.fullName}</p>}
            </li>
          ))}
        </ol>
      )}

      <ConvertModal open={showConvert} onClose={() => setShowConvert(false)} firstTimerId={id} />
    </AppShell>
  );
}

function ConvertModal({ open, onClose, firstTimerId }: { open: boolean; onClose: () => void; firstTimerId: string }) {
  const navigate = useNavigate();
  const [leaders, setLeaders] = useState<User[]>([]);
  const [assignedLeaderId, setAssignedLeaderId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    listUsers()
      .then(({ data }) => setLeaders(data.filter((u) => u.role === 'leader' && u.isActive)))
      .catch(() => setError('Could not load leaders.'));
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!assignedLeaderId) { setError('Select a leader.'); return; }
    setSaving(true);
    setError('');
    try {
      const member = await convertFirstTimer(firstTimerId, { assignedLeaderId });
      navigate(`/pastor/members/${member.id}`);
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Conversion failed.');
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Convert to Son/Daughter" description="Creates a member from this first-timer and assigns them to a leader.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Assigned leader">
          <Select value={assignedLeaderId} onChange={(e) => setAssignedLeaderId(e.target.value)} required>
            <option value="">Select a leader…</option>
            {leaders.map((l) => <option key={l.id} value={l.id}>{l.fullName}</option>)}
          </Select>
        </Field>
        {error && <p className="text-body text-concern">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Converting…' : 'Convert'}</Button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Typecheck client.**

Run: `pnpm --filter raising-client exec tsc -b`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add client/src/pages/pastor/FirstTimerProfile.tsx
git commit -m "feat(client): pastor first-timer profile with convert flow"
```

---

## Task 11: Converted-member view on `MemberProfile`

**Files:**
- Modify: `client/src/pages/pastor/MemberProfile.tsx`

**Interfaces:**
- Consumes: `listFirstTimerReports`, `callOutcomeLabels`, `relativeDate`, existing `member` state (`Member | null`), `member.convertedFromFirstTimerId` / `member.convertedFromFirstTimer.visitDate`.
- Produces: a "Joined as first-timer" banner + a "Call history before joining" section.

Context (already in the file): `const [member, setMember] = useState<Member | null>(null)` (line 19); `useEffect`, `useState` already imported; `Badge` and `relativeDate` already imported. The returned JSX has a `<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">` (line 87) whose closing `</div>` is at line 131, immediately before `<ReportModal … />`.

- [ ] **Step 1: Add imports.** Add `listFirstTimerReports` to the existing `from '../../lib/api'` import block; add two new imports below it:

```tsx
import { callOutcomeLabels } from '../../lib/firstTimers';
import type { Member, MemberReport, FirstTimerReport } from '../../types';
```

(That replaces the existing `import type { Member, MemberReport } from '../../types';` on line 15 — just add `FirstTimerReport`.)

- [ ] **Step 2: Fetch pre-conversion call history.** After the `redactTarget` state declaration (line 25), add state; after the existing `useEffect(() => { refresh(); }, [refresh])` block (line 43), add an effect. A 403 (viewer is a leader, not permitted) or any error leaves the list empty so the section hides:

```tsx
const [preJoinCalls, setPreJoinCalls] = useState<FirstTimerReport[]>([]);
```

```tsx
useEffect(() => {
  const ftId = member?.convertedFromFirstTimerId;
  if (!ftId) return;
  listFirstTimerReports(ftId)
    .then((r) => setPreJoinCalls(r.data))
    .catch(() => setPreJoinCalls([]));
}, [member?.convertedFromFirstTimerId]);
```

- [ ] **Step 3: Add the banner** as the first child inside the `<AppShell …>` body, immediately before `<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">` (line 87), rendered only when converted:

```tsx
{member.convertedFromFirstTimer?.visitDate && (
  <div className="mb-6 rounded-card border border-info/30 bg-info/10 px-4 py-3 text-body text-ink-2">
    Joined as a first-timer on {relativeDate(member.convertedFromFirstTimer.visitDate)}.
  </div>
)}
```

(At this point in the render `member` is non-null — the `if (error || !member)` guard on line 65 has already returned.)

- [ ] **Step 4: Add the pre-join call history section** after the grid's closing `</div>` (line 131), immediately before the `<ReportModal … />`, shown only when there are calls:

```tsx
{preJoinCalls.length > 0 && (
  <section className="mt-8">
    <h2 className="mb-3 text-heading-sm font-semibold text-ink-2">Call history before joining</h2>
    <ol className="space-y-3">
      {preJoinCalls.map((r) => (
        <li key={r.id} className="rounded-card border border-hairline bg-surface p-4">
          <div className="flex items-center justify-between">
            <Badge tone="info">{callOutcomeLabels[r.callOutcome] ?? r.callOutcome}</Badge>
            <span className="text-caption text-faint">{relativeDate(r.createdAt)}</span>
          </div>
          {r.content && <p className="mt-2 text-body text-muted">{r.content}</p>}
          {r.reportedBy && <p className="mt-1 text-caption text-faint">by {r.reportedBy.fullName}</p>}
        </li>
      ))}
    </ol>
  </section>
)}
```

(`Badge` and `relativeDate` are already imported in this file.)

- [ ] **Step 5: Typecheck client.**

Run: `pnpm --filter raising-client exec tsc -b`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add client/src/pages/pastor/MemberProfile.tsx
git commit -m "feat(client): converted-member banner + pre-join call history"
```

---

## Task 12: Wire routes + follow-up dashboard link

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/followup/Dashboard.tsx`

**Interfaces:**
- Consumes: all four new pages.
- Produces: live routes `/followup/first-timers`, `/followup/first-timers/:id`, `/pastor/first-timers`, `/pastor/first-timers/:id`.

- [ ] **Step 1: Import the pages in `App.tsx`** (beside the other page imports):

```tsx
import FollowUpFirstTimers from './pages/followup/FirstTimers';
import FollowUpFirstTimerProfile from './pages/followup/FirstTimerProfile';
import PastorFirstTimers from './pages/pastor/FirstTimers';
import PastorFirstTimerProfile from './pages/pastor/FirstTimerProfile';
```

- [ ] **Step 2: Add pastor routes** inside the `{/* Pastor */}` block (after `/pastor/members/:id`):

```tsx
<Route path="/pastor/first-timers" element={<RequireRole roles={['pastor']}><PastorFirstTimers /></RequireRole>} />
<Route path="/pastor/first-timers/:id" element={<RequireRole roles={['pastor']}><PastorFirstTimerProfile /></RequireRole>} />
```

- [ ] **Step 3: Add follow-up routes** inside the `{/* Follow-up team */}` block (after the `/followup` dashboard route):

```tsx
<Route path="/followup/first-timers" element={<RequireRole roles={['followup_team_lead', 'followup_team_member']}><FollowUpFirstTimers /></RequireRole>} />
<Route path="/followup/first-timers/:id" element={<RequireRole roles={['followup_team_lead', 'followup_team_member']}><FollowUpFirstTimerProfile /></RequireRole>} />
```

- [ ] **Step 4: Replace the follow-up dashboard placeholder** in `pages/followup/Dashboard.tsx` — swap the "arrives in Phase 4" empty state for a live entry link to `/followup/first-timers`:

```tsx
import { Link } from 'react-router-dom';
// …inside the returned AppShell, replace the dashed placeholder block with:
<Link
  to="/followup/first-timers"
  className="flex items-center justify-between rounded-cardlg border border-hairline bg-surface px-6 py-5 text-left transition hover:border-accent/40 hover:shadow-elevated"
>
  <span>
    <span className="block text-heading-sm font-semibold text-ink-2">First-Timers</span>
    <span className="mt-1 block text-body text-muted">View your queue, log calls, and track follow-ups.</span>
  </span>
  <IconPhone className="h-6 w-6 text-accent" />
</Link>
```

- [ ] **Step 5: Typecheck client + full build.**

Run: `pnpm --filter raising-client exec tsc -b`
Then: `pnpm build`
Expected: both PASS.

- [ ] **Step 6: End-to-end manual verify.** Start `pnpm dev`, then:
  1. Log in as a follow-up team member → Dashboard → First-Timers shows the unassigned pool.
  2. Open a first-timer, Log a call (`answered`) → status badge becomes **Contacted**, "Assigned to" becomes you.
  3. Log in as pastor → First-Timers → filters work; open the same first-timer → call history visible; **Convert to Son/Daughter** → pick a leader → lands on the new member profile.
  4. The member profile shows **"Joined as a first-timer on …"** and **"Call history before joining"** with the earlier call.
  5. Re-open the converted first-timer as pastor → shows **View member** (no re-convert); a second convert via API returns 409.

- [ ] **Step 7: Commit.**

```bash
git add client/src/App.tsx client/src/pages/followup/Dashboard.tsx
git commit -m "feat(client): wire first-timer routes + follow-up dashboard entry"
```

---

## Final verification (whole phase)

- [ ] Server typecheck clean: `pnpm --filter raising-server exec tsc --noEmit`
- [ ] Client build clean: `pnpm build`
- [ ] Exit criteria met: team member logs a call and status updates; team lead converts a first-timer; new member profile shows pre-conversion call history.
- [ ] Access spot-checks: team member GET on another member's claimed first-timer → 403; team member PATCH/convert → 403; batch upload with a nameless row reports it in `errors`.
- [ ] Audit spot-check: `added_first_timer` rows exist (one per created first-timer; batch rows share a `batchId`); `submitted_first_timer_report` and `converted_first_timer` rows exist.
