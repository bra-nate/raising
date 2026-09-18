# raising — PHASE.md
*Phased Build Plan*

---

## Build Philosophy

Each phase is a complete, usable vertical slice. Start a new Claude Code session per phase, loading CLAUDE.md, PRD.md, DATA.md, and this file into context. Complete each phase fully — including access control enforcement and activity logging — before moving to the next. Do not defer security or audit logging to a later phase.

---

## Phase 1 — Foundation
*Target: Monorepo scaffold, database, working auth, role routing*

### 1.1 Monorepo Setup
- [x] Create root `package.json` with `workspaces: ["client", "server"]`
- [x] `server/`: `npm init`, install: `express`, `@prisma/client`, `prisma`, `jsonwebtoken`, `bcrypt`, `cors`, `dotenv`, `node-cron`; dev: `typescript`, `ts-node-dev`, `@types/*`
- [x] `client/`: `npm create vite@latest -- --template react-ts`, install: `tailwindcss`, `react-router-dom`, `axios`
- [x] Configure `tsconfig.json` for both workspaces (strict mode)
- [x] Set up Tailwind in the client

### 1.2 Database Setup
- [x] Provision a PostgreSQL database (local for dev: `docker-compose.yml` with `postgres:15` image, or local install)
- [x] Copy schema from DATA.md into `server/prisma/schema.prisma`
- [x] Run `prisma migrate dev --name init`
- [x] Run seed script: creates settings defaults + pastor account
- [x] Verify tables exist and seed data is present

### 1.3 Express Server Base
- [x] `server/src/index.ts`: Express app, JSON body parser, CORS (origin = `VITE_API_URL`), routes mount, global error handler
- [x] `server/src/config.ts`: read and validate all env vars on startup — crash with a clear message if any are missing
- [x] `server/src/lib/prisma.ts`: PrismaClient singleton
- [x] `server/src/lib/jwt.ts`: `signToken(payload)` and `verifyToken(token)` helpers
- [x] `server/src/middleware/authenticate.ts`: verify JWT, attach `req.user`
- [x] `server/src/middleware/requireRole.ts`: role guard factory
- [x] `server/src/middleware/errorHandler.ts`: catch-all error middleware

### 1.4 Auth Routes
- [x] `POST /api/v1/auth/login`: find user by email, compare bcrypt hash, return signed JWT + user profile
- [x] `GET /api/v1/auth/me`: return `req.user` populated by `authenticate` middleware
- [x] No logout endpoint needed (stateless JWT — client discards token)

### 1.5 React Auth Shell
- [x] `AuthContext.tsx`: stores JWT in localStorage (`sl_token`), exposes `user`, `login()`, `logout()`, `isAuthenticated`
- [x] `useAuth.ts` hook wrapping the context
- [x] `client/src/lib/api.ts`: Axios instance with base URL from `VITE_API_URL`, auto-attaches `Authorization: Bearer` header from localStorage
- [x] `/login` page: email + password form, calls `POST /auth/login`, stores token, redirects to role root
- [x] Route guard component: reads role from context, redirects to correct dashboard
- [x] Placeholder pages for `/pastor`, `/leader`, `/followup` with role label

### 1.6 User Management (Pastor Only)
- [x] `GET /api/v1/users`: return all users (pastor only)
- [x] `POST /api/v1/users`: create user with bcrypt-hashed password; log `created_user`
- [x] `PATCH /api/v1/users/:id`: update name or role; log `updated_settings` if role changed
- [x] `PATCH /api/v1/users/:id/deactivate`: set `isActive = false`; log `deactivated_user`
- [x] `/pastor/users` page: user table + create user modal + deactivate action

**Phase 1 exit criteria:** Pastor logs in, lands on `/pastor`, creates a leader account. Leader logs in, lands on `/leader`. A request to `/api/v1/users` from a leader JWT returns 403.

---

## Phase 2 — Member Module
*Target: Leaders can manage their members and submit reports*

### 2.1 Member API
- [x] `GET /api/v1/members`: leader → own members only (`assignedLeaderId = req.user.id`); pastor → all; includes silence status derived from `lastReportDate` vs settings threshold
- [x] `POST /api/v1/members`: insert member with `assignedLeaderId = req.user.id` (or provided if pastor); log `added_member`
- [x] `GET /api/v1/members/:id`: leader → 403 if not their member; pastor → any
- [x] `PATCH /api/v1/members/:id`: same scope guard; log `updated_member`
- [x] `PATCH /api/v1/members/:id/deactivate`: pastor only
- [x] Settings read helper: `settingsService.get('reportThresholdDays')` — used in silence calculation

### 2.2 Member Report API
- [x] `GET /api/v1/member-reports?memberId=`: leader → own reports + non-confidential reports on their members (see DATA.md query); pastor → all
- [x] `POST /api/v1/member-reports`: validate member belongs to leader; insert report; update `member.lastReportDate` in same Prisma transaction; log `submitted_member_report`; if `isSafetyFlagged`, call notification service (create notification row + send email to pastor)
- [x] `PATCH /api/v1/member-reports/:id/redact`: check `isSafetyFlagged` (403 if true); check settings permission; update content to `[Redacted]`; log `redacted_report`
- [x] `DELETE /api/v1/member-reports/:id`: check `isSafetyFlagged` (403 if true); check settings; log `deleted_report` before deletion

### 2.3 Settings Service
- [x] `settingsService.getAll()`: return all settings as key-value object
- [x] `settingsService.get(key)`: return single setting value
- [x] Settings are read on each request that needs them (no in-process cache needed at this scale)

### 2.4 Leader Frontend
- [x] `/leader` dashboard: member grid cards — name, status tag badge, last report date, silence indicator (amber/red dot), "Add Report" button
- [x] `/leader/members` list: sortable table with silence column
- [x] `/leader/members/new`: add member form
- [x] `/leader/members/:id`: member profile — details, report timeline, "Add Report" button
- [x] Report modal: status tag (radio), content (textarea), confidential toggle, safety flag checkbox

**Phase 2 exit criteria:** Leader adds a member, submits a report with Good / Needs Attention / Concern, sees the silence indicator. A safety-flagged report creates a notification for the pastor.

---

## Phase 3 — Pastor Member View and Dashboard
*Target: Pastor has full visibility across all members and reports*

### 3.1 Pastor Member Frontend
- [x] `/pastor/members`: all members, filter by leader/group/status/silence, search, CSV export button
- [x] `/pastor/members/new`: add member (can assign to any leader)
- [x] `/pastor/members/:id`: full report history including confidential (lock icon); log `viewed_confidential_report` when a confidential report card is opened (PATCH call to a `/activity-log` internal endpoint or inline in the GET)
- [x] Redact button per report (non-safety-flagged): confirm modal with redaction summary field
- [x] Delete button (if settings permit): confirm modal

### 3.2 Pastor Dashboard
- [x] `GET /api/v1/dashboard/pastor`: returns all six stat card values + silence list + recent 20 reports
  - Silence list: members where `lastReportDate` is null or `now - lastReportDate > threshold`
  - Keep this as a single dedicated endpoint — not assembled on the frontend from multiple calls
- [x] `/pastor` page: six stat cards, silence panel, recent reports feed

**Phase 3 exit criteria:** Pastor sees all members and reports. Silence panel is accurate. Redact action replaces content, retains row. Dashboard stats are correct.

---

## Phase 4 — First-Timer Module
*Target: Follow-up team logs calls; conversion path works*

### 4.1 First-Timer API
- [x] `GET /api/v1/first-timers`: team member → `assignedToId = req.user.id`; team lead + pastor → all
- [x] `POST /api/v1/first-timers`: create; if `assignedToId` set, create `first_timer_assigned` notification for that user
- [x] `GET /api/v1/first-timers/:id`: scope guard for team member
- [x] `PATCH /api/v1/first-timers/:id`: team lead or pastor only
- [x] `POST /api/v1/first-timers/:id/convert`: pastor or team lead only; Prisma transaction — create member, update first-timer status; log `converted_first_timer`

### 4.2 First-Timer Report API
- [x] `GET /api/v1/first-timer-reports?firstTimerId=`: team member → own reports only; team lead + pastor → all for that first-timer
- [x] `POST /api/v1/first-timer-reports`: team member must own the first-timer; auto-update `firstTimer.status` based on `callOutcome`; log `submitted_first_timer_report`

### 4.3 Follow-Up Frontend
- [x] `/followup` dashboard: first-timer list scoped by role, pending sorted to top
- [x] `/followup/first-timers/:id`: call history timeline, "Log Call" modal
- [x] Call outcome auto-updates status badge on profile after submission

### 4.4 Pastor First-Timer Views
- [x] `/pastor/first-timers`: all first-timers with filters
- [x] `/pastor/first-timers/:id`: full profile + "Convert to Son/Daughter" button
- [x] Conversion modal: select leader + group; on confirm runs convert API call

### 4.5 Converted Member View
- [x] Member profile shows "Joined as first-timer on [visitDate]" banner when `convertedFromFirstTimerId` is set
- [x] Below report timeline: "Call history before joining" section fetched via `GET /first-timer-reports?firstTimerId=`

**Phase 4 exit criteria:** Team member logs a call, status updates. Team lead converts a first-timer. New member profile shows call history from before conversion.

---

## Phase 5 — Activity Log and Settings
*Target: Audit trail complete; platform configuration live*

### 5.1 Activity Log Frontend
- [x] `/pastor/activity-log`: paginated table (20/page), filter by user, action, date range
- [x] Verify all actions from Phases 1–4 are writing log entries — spot-check one of each type

### 5.2 Settings Frontend
- [x] `GET /api/v1/settings` already exists from Phase 2
- [x] `PATCH /api/v1/settings`: pastor only; update one or more keys; log `updated_settings` with old and new value per changed key
- [x] `/pastor/settings` page: form for all 5 settings; save action
- [x] Settings propagation: all components that show delete/redact buttons must read `allowDeleteReports` from a settings context loaded at app mount

**Phase 5 exit criteria:** Activity log shows all historical events. Pastor toggles `allowDeleteReports` off — redact and delete buttons disappear for all roles immediately.

---

## Phase 6 — Notifications
*Target: In-app bell and email alerts are live*

### 6.1 Notification Bell
- [x] `GET /api/v1/notifications`: own notifications, sorted by `createdAt` desc, last 20
- [x] `PATCH /api/v1/notifications/:id/read` and `PATCH /api/v1/notifications/read-all`
- [x] `NotificationBell` component: polls every 60 seconds, shows unread count badge
- [x] Dropdown panel: notification list, mark-as-read on click

### 6.2 Notification Service (`server/src/services/notifications.service.ts`)
- [x] `createNotification(userId, type, title, message, entityId?)`: insert into `notifications`
- [x] `sendEmail(to, subject, html)`: call Resend API
- [x] Safety flag path (already triggered in Phase 2): confirm bell updates in real-time for pastor during a test

### 6.3 Scheduled Jobs (`server/src/jobs/scheduler.ts`)
- [x] `node-cron` setup inside Express process — starts on server boot
- [x] **Report reminder job**: runs on configured `reportReminderDay` at 08:00 WAT
  - Query all active leaders
  - For each, find members with no report in the last `reportThresholdDays`
  - If any: call `createNotification` + `sendEmail`
- [x] **Silence detection job**: runs daily at 07:00 WAT
  - Query all active members where `lastReportDate` is null or past threshold
  - Upsert pastor notification (deduplicate — don't create duplicate notifications for the same member on the same day)

### 6.4 First-Timer Assignment Notification
- [x] Already triggered in Phase 4 `POST /first-timers` — confirm it fires correctly

**Phase 6 exit criteria:** Pastor receives safety flag bell notification immediately when a leader submits a flagged report. Leader receives a notification on the configured reminder day.

---

## Phase 7 — Polish and Hardening
*Target: Production-ready*

- [x] Mobile responsiveness audit — all core flows work at 375px viewport (sidebar becomes a drawer below `md`; header actions wrap to their own row below `sm`; every table already scrolled)
- [x] Empty states on all list views (no members yet, no reports yet)
- [ ] Loading skeletons on all async fetches — every async page already shows a loading state in text; skeletons are a perceived-speed upgrade, not a gap
- [x] Error states with user-friendly messages (network failure, 403, 404)
- [x] Security test: log in as a leader and attempt `GET /api/v1/members?assignedLeaderId=<other-leader-id>` directly — must return only own members
- [x] Security test: attempt to redact or delete a safety-flagged report via direct API call — must return 403
- [x] Security test: attempt to call `DELETE /api/v1/activity-log/anything` — must return 404 (no route exists)
- [x] Confirm `JWT_SECRET` and `DATABASE_URL` never appear in any client bundle (check Vite build output)
- [x] Data privacy notice in app footer
- [ ] Set all production environment variables on chosen host
- [ ] Configure Resend domain and verify sender email
- [ ] Final end-to-end walkthrough:
  - Pastor creates leader → leader logs in
  - Leader adds member → submits report (Good, then Concern)
  - Pastor views dashboard — stats reflect correctly
  - Pastor views member profile — sees both reports
  - Follow-up team member adds first-timer → logs call
  - Team lead converts first-timer → member profile shows call history
  - Pastor checks activity log — all events present
  - Pastor toggles `allowDeleteReports` off — delete buttons disappear

---

## Phase 7.5 — Password Lifecycle
*Shipped*

- [x] `POST /auth/change-password` — verifies the current password, rejects reuse
- [x] `PATCH /users/:id/password` — pastor-issued reset, actor recorded in the log
- [x] Shared `lib/password.ts` — one validation and hashing rule for all three call sites
- [x] `PasswordModal` in both modes: sidebar self-serve, per-row reset in User Management
- [x] Force rotation on first login — `mustChangePassword` set on account creation and on a pastor-issued reset, cleared by `change-password`. The claim rides in the JWT, so `authenticate` gates every route but `/auth/me`, `/auth/logout` and `/auth/change-password`; `RequireRole` renders a non-dismissable `PasswordModal` in place of the page. Pinned by `src/test/password-gate.test.ts`.

---

## Phases 8–12 — Operational Completeness

Planned and tracked in ROADMAP.md; summarised here so this file stays the index.

| Phase | Scope | State |
|---|---|---|
| 8 | Case management — concern and safety cases that someone owns and closes, with escalation | Built |
| 9 | Follow-up queue — due today, overdue, aging, workload; explicit assignment plus claim-on-call | Built |
| 10 | Group management — CRUD, leader handover moves members, care-risk summary | Built |
| 11 | Outcome metrics — first-contact latency, conversion, resolution time, leader consistency, group risk | Built |
| 12 | Privacy and retention — retention review, subject access export, legal basis, confidential access review | Built |

Deliberately out of scope: multi-tenancy. raising is single-organisation software;
`churchId` would touch every query and every test for no present benefit.
