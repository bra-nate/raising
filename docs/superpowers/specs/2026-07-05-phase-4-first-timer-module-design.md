# Phase 4 — First-Timer Module — Design

*Date: 2026-07-05*

## Goal

Follow-up team logs calls to first-time visitors; the conversion path turns a
first-timer into a congregation member. Mirrors the Member module (Phases 2–3)
in structure, access-control style, transaction discipline, and audit logging.

First-timers arrive as a **list from a meeting**, so the primary intake is a
**CSV batch upload** (with a single-add form for one-off walk-ins). Assignment
is **claim-by-calling**: a team member picks someone from the unassigned pool
and logging the first call claims that first-timer to them.

**Exit criteria (from PHASE.md 4):** A team member logs a call and the status
updates. A team lead converts a first-timer. The new member profile shows the
call history from before conversion.

## Decisions (resolved during brainstorming)

1. **CallOutcome → FirstTimerStatus mapping (outcome-driven):**
   - `answered` → `contacted`
   - `callback_requested` → `contacted`
   - `interested` → `interested`
   - `not_interested` → `not_interested`
   - `no_answer` → no change
   - A first-timer already at `converted` is **never** overwritten.
2. **Create access:** all follow-up roles + pastor
   (`followup_team_member`, `followup_team_lead`, `pastor`) — for both single-add
   and CSV batch upload.
3. **Pre-conversion call history visibility:** pastor + team lead. The assigned
   leader viewing a converted member does not see it (403 → section hidden)
   unless they are also on the follow-up team.
4. **Creation is audited.** Add `added_first_timer` to the `ActivityAction`
   enum. Every created first-timer writes a log row (`userId` = who,
   `entityId` = which). A batch upload stamps a shared `batchId` (a UUID
   generated per upload) into each row's log `metadata`, so a batch is traceable
   as a unit ("these came in together, uploaded by X").
5. **Meeting model.** "Service joined" is a free-text **meeting name**, not the
   `serviceType` enum. Replace the unused `serviceType` field with
   `serviceName String?` on `FirstTimer`; keep `visitDate` (used by the
   converted-member banner). A batch = one meeting: the uploader supplies the
   meeting name + date once and every row inherits them. The single-add form has
   its own meeting-name + date fields. This is the batch's one schema migration
   (together with the enum value in Decision 4).
6. **Assignment is claim-by-calling.** Upload / single-add create first-timers
   **unassigned** (`assignedToId = null`, `status = pending`) in a shared pool. A
   team member sees their own + the unassigned pool. Logging the first call on an
   unassigned first-timer sets `assignedToId = self` in the same transaction as
   the report. Once claimed, other team members can't view/log on that record.
   Team lead + pastor see everyone and may reassign via edit (which fires a
   `first_timer_assigned` notification). Self-claim fires no notification.

## Schema migration

`server/prisma/schema.prisma`:
- `enum ActivityAction { … added_first_timer }` — new value.
- `model FirstTimer`: remove `serviceType ServiceType?`; add `serviceName String?`.
- Remove the now-unused `enum ServiceType` (nothing else references it).

Run `prisma migrate dev --name phase4_first_timers`.

## Backend

All services under `server/src/services`, routes under `server/src/routes`,
mounted in `server/src/index.ts`. Prisma singleton only. Access scoping is
always enforced in the service layer against `req.user`; query params are never
trusted for scoping.

### `first-timers.service.ts` (mirrors `members.service.ts`)

- `listFirstTimers(user)`:
  - team member → `{ isActive: true, OR: [{ assignedToId: user.id }, { assignedToId: null }] }`
    (own + unassigned pool);
  - team lead / pastor → `{ isActive: true }`.
  - Order: pending first, then `visitDate desc`. Include
    `assignedTo: { select: { fullName: true } }`. Returns `{ data, total }`.
- `getFirstTimer(user, id)` — 404 if missing; for a team member, allowed if
  `assignedToId === user.id` **or** `assignedToId === null`; else 403.
- `createFirstTimer(user, input)` — single-add; all follow-up roles + pastor.
  Validate `firstName`, `lastName`, `visitDate`; optional `phone`, `email`,
  `serviceName`. Created unassigned. `writeLog('added_first_timer', entityType:
  'first_timer', entityId, metadata: { name })`.
- `createBatch(user, { meetingName, visitDate, rows })` — CSV upload; same roles.
  Validate `meetingName`, `visitDate`, and each row (`firstName` + `lastName`
  required; `phone`/`email` optional). Generate one `batchId` (UUID). In a single
  `prisma.$transaction`: create every valid row (unassigned, `serviceName =
  meetingName`, `visitDate`), each with a `writeLog('added_first_timer', …,
  metadata: { batchId, name })`. Returns `{ created: n, errors: [{ row, reason }] }`.
  Rows that fail validation are reported, not silently dropped.
- `updateFirstTimer(user, id, input)` — team lead + pastor only (route-guarded).
  Editable: name, contact, `visitDate`, `serviceName`, `assignedToId`, `status`.
  Setting `assignedToId` to a new active follow-up user fires a
  `first_timer_assigned` notification for the assignee.
- `convertToMember(user, id, { assignedLeaderId, groupId? })` — team lead +
  pastor only. Guards: 404 if missing; 409 if already `converted` /
  `convertedMemberId` set; validate `assignedLeaderId` resolves to a real
  `leader`; if `groupId` given, validate it belongs to that leader.
  **`prisma.$transaction`:** create `Member`
  (`convertedFromFirstTimerId = id`, name/contact copied, `assignedLeaderId`,
  `groupId`, `createdById = user.id`); update `FirstTimer` → `status='converted'`,
  `convertedAt=now`, `convertedMemberId = member.id`;
  `writeLog('converted_first_timer', entityType: 'first_timer', entityId: id,
  metadata: { memberId, assignedLeaderId }, tx)`. Returns the created member.

### `first-timer-reports.service.ts` (mirrors `member-reports.service.ts`)

- `loadFirstTimerForUser(user, firstTimerId)` — 404 if missing; team member
  allowed if `assignedToId === user.id` **or** `assignedToId === null`
  (claimable); else 403.
- `listReports(user, firstTimerId)` — 400 if no id; access-guarded. Team member
  → `{ firstTimerId, reportedById: user.id }`; team lead + pastor →
  `{ firstTimerId }`. Include `reportedBy: { select: { fullName: true } }`,
  order `createdAt desc`. Returns `{ data, total }`.
- `createReport(user, input)` — validate `firstTimerId`, valid `callOutcome`;
  `content` optional. Load via the helper (enforces claimable/own).
  **`prisma.$transaction`:**
  1. if `assignedToId === null` and the user is a follow-up team member, set
     `assignedToId = user.id` (**claim**);
  2. insert `FirstTimerReport`;
  3. compute new status from the outcome map (Decision 1); if it differs and the
     record isn't `converted`, update `firstTimer.status`;
  4. `writeLog('submitted_first_timer_report', entityType: 'first_timer_report',
     entityId, metadata: { firstTimerId, callOutcome }, tx)`.
  Returns the created report.

### Routes

- `routes/first-timers.ts` — `authenticate` on all.
  - `GET /` and `POST /` and `POST /batch` and `GET /:id`:
    `requireRole('pastor', 'followup_team_lead', 'followup_team_member')`.
  - `PATCH /:id` and `POST /:id/convert`:
    `requireRole('pastor', 'followup_team_lead')`.
  - Declare `/batch` before `/:id`.
- `routes/first-timer-reports.ts` — `GET /?firstTimerId=` and `POST /`:
  `requireRole('pastor', 'followup_team_lead', 'followup_team_member')`.
- Mount in `index.ts`: `/api/v1/first-timers`, `/api/v1/first-timer-reports`.

## Frontend

Reuse the Relate design system and existing primitives (`AppShell`, `Modal`,
`Badge`, `Card`, `Input`, `Select`, form components). Dark mode + design tokens
per the design-system memory.

### Types & API client

- `types/index.ts`: on `FirstTimer` replace `serviceType?` with
  `serviceName?: string`; add `teamLeadId?`, `convertedAt?`, `convertedMemberId?`.
  Remove the `ServiceType` union (add none — meeting name is free text).
- `lib/api.ts`: `listFirstTimers`, `getFirstTimer`, `createFirstTimer`,
  `uploadFirstTimersBatch`, `updateFirstTimer`, `convertFirstTimer`,
  `listFirstTimerReports`, `createFirstTimerReport`, with typed inputs.
- `lib/nav.ts`: replace the two `phase: 4` placeholders with live routes
  (`/followup/first-timers`, `/pastor/first-timers`).

### CSV upload flow

- Client parses the chosen CSV file in-browser (header row: `firstName`,
  `lastName`, `phone`, `email`) into rows and shows a **preview table** (with
  per-row validation flags) before commit.
- Uploader enters **meeting name + meeting date** (applies to the whole batch).
- On confirm, POST `{ meetingName, visitDate, rows }` to `/first-timers/batch`;
  show the `{ created, errors }` summary.

### Follow-up pages (`pages/followup/`)

- `FirstTimers.tsx` — role-scoped list (own + unassigned pool for team members;
  all for team lead), pending sorted to top, status badge, assigned-to, meeting
  name, visit date, empty state. Actions: "Upload CSV" (modal with preview) and
  "Add First-Timer" (single-add form: name, contact, meeting name, meeting date).
- `FirstTimerProfile.tsx` — details + call-history timeline + "Log Call" modal
  (callOutcome radio, optional notes). On submit the record is claimed (if it was
  in the pool) and the status badge re-renders from the returned data.

### Pastor pages (`pages/pastor/`)

- `FirstTimers.tsx` — all first-timers, filters (status, assigned-to, search),
  empty state. Same upload + single-add actions.
- `FirstTimerProfile.tsx` — full profile + call history + "Convert to
  Son/Daughter" button. Convert modal: select leader, then group scoped to that
  leader; on confirm call `convertFirstTimer`, then link to the new member. When
  already converted, show a link to the member instead of the button.

### Converted-member view (extend `pages/pastor/MemberProfile.tsx`)

- Banner "Joined as first-timer on [visitDate]" when `convertedFromFirstTimerId`
  is set (`Member.convertedFromFirstTimer.visitDate` already available).
- "Call history before joining" section below the report timeline, fetched via
  `listFirstTimerReports(convertedFromFirstTimerId)`. Shown for pastor + team
  lead; a 403 (leader) simply hides the section.

### Routing (`App.tsx`)

Add under `RequireRole`:
- `/followup/first-timers`, `/followup/first-timers/:id` —
  `['followup_team_lead', 'followup_team_member']`.
- `/pastor/first-timers`, `/pastor/first-timers/:id` — `['pastor']`.

## Testing / verification

- Batch upload of N rows creates N unassigned first-timers with the batch's
  meeting name + date; each has an `added_first_timer` log sharing one `batchId`;
  invalid rows come back in `errors`, not created.
- Single-add creates one unassigned first-timer with its own `added_first_timer`
  log.
- Team member sees own + unassigned pool but not another member's claimed
  first-timer (403 on GET); logging a call on a pool record claims it to them.
- `answered` → `pending → contacted`; `interested`/`not_interested` set matching
  status; `no_answer` leaves it; `converted` never overwritten.
- Team lead reassigns a first-timer via edit → assignee gets a
  `first_timer_assigned` notification.
- Team lead converts → transaction creates member, first-timer → `converted`;
  second convert attempt → 409.
- Converted member profile (pastor) shows banner + pre-conversion call history;
  as the assigned leader the history section is hidden.
- Team member cannot PATCH or convert (403).

## Out of scope (later phases)

- Notification bell UI + polling (Phase 6).
- Scheduled jobs (Phase 6).
- Activity-log frontend / settings frontend (Phase 5, partly present).
