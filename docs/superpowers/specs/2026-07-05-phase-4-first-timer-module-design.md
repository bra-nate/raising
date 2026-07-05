# Phase 4 — First-Timer Module — Design

*Date: 2026-07-05*

## Goal

Follow-up team logs calls to first-time visitors; the conversion path turns a
first-timer into a congregation member. Mirrors the Member module (Phases 2–3)
in structure, access-control style, transaction discipline, and audit logging.

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
2. **Create access (POST /first-timers):** all follow-up roles + pastor
   (`followup_team_member`, `followup_team_lead`, `pastor`).
3. **Pre-conversion call history visibility:** pastor + team lead. The assigned
   leader viewing a converted member does not see it (403 → section hidden)
   unless they are also on the follow-up team.
4. **No new `ActivityAction` enum value.** First-timer *creation* writes no
   activity-log row (the enum has no `added_first_timer`). Only the existing
   `submitted_first_timer_report` and `converted_first_timer` actions are used.
   Assignment still produces a `first_timer_assigned` *notification*. This keeps
   Phase 4 migration-free.

## Backend

All services live under `server/src/services`, routes under
`server/src/routes`, mounted in `server/src/index.ts`. Prisma singleton only.
Access scoping is always enforced in the service layer against `req.user`;
query params are never trusted for scoping.

### `first-timers.service.ts` (mirrors `members.service.ts`)

- `listFirstTimers(user)` — team member → `{ assignedToId: user.id, isActive: true }`;
  team lead / pastor → `{ isActive: true }` (all). Order: pending first, then
  `visitDate desc`. Include `assignedTo: { select: { fullName: true } }`.
  Returns `{ data, total }`.
- `getFirstTimer(user, id)` — 404 if missing; 403 if team member and
  `assignedToId !== user.id`.
- `createFirstTimer(user, input)` — allowed for all follow-up roles + pastor.
  Validate `firstName`, `lastName`, `visitDate`. Optional `phone`, `email`,
  `address`, `serviceType`, `assignedToId`. If `assignedToId` set: validate it
  resolves to an active follow-up user, then
  `notificationsService.createNotification({ type: 'first_timer_assigned', ... })`
  for that user. **No activity-log write** (see Decision 4).
- `updateFirstTimer(user, id, input)` — team lead + pastor only (route-guarded).
  Editable: name, contact fields, `visitDate`, `serviceType`, `assignedToId`,
  `status`. Reassignment to a new `assignedToId` fires a fresh
  `first_timer_assigned` notification.
- `convertToMember(user, id, { assignedLeaderId, groupId? })` — team lead +
  pastor only. Guards: 404 if missing; 409 if `status === 'converted'` /
  `convertedMemberId` already set; validate `assignedLeaderId` resolves to a
  real `leader` (reuse the same check as `createMember`); if `groupId` given,
  validate it belongs to that leader. **`prisma.$transaction`:**
  1. create `Member` (`convertedFromFirstTimerId = id`, `assignedLeaderId`,
     `groupId`, `createdById = user.id`, name/contact copied from first-timer),
  2. update `FirstTimer` → `status='converted'`, `convertedAt=now`,
     `convertedMemberId = member.id`,
  3. `writeLog({ action: 'converted_first_timer', entityType: 'first_timer',
     entityId: id, metadata: { memberId, assignedLeaderId } }, tx)`.
  Returns the created member.

### `first-timer-reports.service.ts` (mirrors `member-reports.service.ts`)

- `loadFirstTimerForUser(user, firstTimerId)` — access helper: 404 if missing;
  403 if team member and not `assignedToId`.
- `listReports(user, firstTimerId)` — 400 if no id; access-guarded. Team member
  → `{ firstTimerId, reportedById: user.id }`; team lead + pastor →
  `{ firstTimerId }`. Include `reportedBy: { select: { fullName: true } }`,
  order `createdAt desc`. Returns `{ data, total }`.
- `createReport(user, input)` — validate `firstTimerId`, valid `callOutcome`;
  `content` optional. Team member must own the first-timer (via the helper).
  **`prisma.$transaction`:**
  1. insert `FirstTimerReport`,
  2. compute new status from the outcome map (Decision 1); if it differs and the
     first-timer isn't `converted`, update `firstTimer.status`,
  3. `writeLog({ action: 'submitted_first_timer_report', entityType:
     'first_timer_report', entityId, metadata: { firstTimerId, callOutcome } }, tx)`.
  Returns the created report.

### Routes

- `routes/first-timers.ts` — `authenticate` on all. `GET /` + `POST /`
  (`pastor`, `followup_team_lead`, `followup_team_member`); `GET /:id` (same);
  `PATCH /:id` (`pastor`, `followup_team_lead`); `POST /:id/convert`
  (`pastor`, `followup_team_lead`). Handlers call the service and return the
  entity; `asyncHandler` wraps each.
- `routes/first-timer-reports.ts` — `GET /?firstTimerId=` + `POST /`
  (`pastor`, `followup_team_lead`, `followup_team_member`).
- Mount both in `index.ts`: `/api/v1/first-timers`, `/api/v1/first-timer-reports`.

## Frontend

Reuse the Relate design system and existing primitives (`AppShell`, `Modal`,
`Badge`, `Card`, `Input`, `Select`, form components). Dark mode + design tokens
per the design-system memory. No silence logic here.

### Types & API client

- `types/index.ts`: ensure `FirstTimer` has `teamLeadId?`, `convertedAt?`,
  `convertedMemberId?`; add a `ServiceType` union
  (`'sunday_service' | 'midweek' | 'special_event' | 'other'`).
- `lib/api.ts`: `listFirstTimers`, `getFirstTimer`, `createFirstTimer`,
  `updateFirstTimer`, `convertFirstTimer`, `listFirstTimerReports`,
  `createFirstTimerReport`, with typed inputs.
- `lib/nav.ts`: replace the two `phase: 4` placeholder items with live routes:
  `/followup/first-timers` and `/pastor/first-timers`.

### Follow-up pages (`pages/followup/`)

- `FirstTimers.tsx` — role-scoped list (server-scoped), pending sorted to top,
  status badge, assigned-to, visit date, empty state. "Add First-Timer" opens a
  form modal (name, contact, visit date, service type, optional assignee).
- `FirstTimerProfile.tsx` — details + call-history timeline + "Log Call" modal
  (callOutcome radio, optional notes). Status badge re-renders from the returned
  record after submission.

### Pastor pages (`pages/pastor/`)

- `FirstTimers.tsx` — all first-timers, filters (status, assigned-to, search),
  empty state.
- `FirstTimerProfile.tsx` — full profile + call history + "Convert to
  Son/Daughter" button. Convert modal: select leader, then group scoped to that
  leader; on confirm call `convertFirstTimer`, then link to the new member.
  Hide/disable the button when already converted (link to the member instead).

### Converted-member view (extend `pages/pastor/MemberProfile.tsx`)

- Banner "Joined as first-timer on [visitDate]" when `convertedFromFirstTimerId`
  is set (data already on `Member.convertedFromFirstTimer.visitDate`).
- "Call history before joining" section below the report timeline, fetched via
  `listFirstTimerReports(convertedFromFirstTimerId)`. Shown for pastor + team
  lead; a 403 (leader) simply hides the section.

### Routing (`App.tsx`)

Add under `RequireRole`:
- `/followup/first-timers` and `/followup/first-timers/:id` —
  `['followup_team_lead', 'followup_team_member']`.
- `/pastor/first-timers` and `/pastor/first-timers/:id` — `['pastor']`.

## Testing / verification

- Team member logs a call with `answered` → first-timer moves `pending → contacted`.
- `interested` / `not_interested` set the matching status; `no_answer` leaves it.
- Team lead converts a first-timer → transaction creates the member, first-timer
  becomes `converted`; a second convert attempt returns 409.
- Converted member profile (as pastor) shows the joined banner and pre-conversion
  call history; as the assigned leader the history section is hidden.
- Access: team member cannot GET another member's assigned first-timer (403);
  team member cannot PATCH or convert (403).
- Assignment creates a `first_timer_assigned` notification for the assignee.

## Out of scope (later phases)

- Notification bell UI + polling (Phase 6).
- Scheduled jobs (Phase 6).
- Activity-log frontend / settings frontend (Phase 5, already partly present).
