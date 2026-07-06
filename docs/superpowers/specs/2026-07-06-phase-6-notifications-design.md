# Phase 6 — Notifications — Design

*Date: 2026-07-06*

## Goal

Make the in-app notification bell and email alerts live, and stand up the two
scheduled cron jobs. The notification *creation* paths (safety flag,
first-timer assignment) already exist from Phases 2 and 4; this phase adds the
read surface, the mark-read mutations, the client bell, and the scheduler.

## Current State (already built)

- `server/src/services/notifications.service.ts` — `createNotification()` and
  `sendEmail()` (Resend REST; no-ops with a log line when `RESEND_API_KEY` is
  unset). Both used in production paths.
- Safety-flag path: `member-reports.service.ts` notifies + emails every active
  pastor synchronously before responding.
- First-timer assignment path: `first-timers.service.ts` creates a
  `first_timer_assigned` notification for the assignee.
- `Notification` model and `NotificationType` enum
  (`report_due | member_unreported | safety_flag | first_timer_assigned`)
  exist. No unique constraint usable for dedup.
- Settings `reportThresholdDays` (14) and `reportReminderDay` (`friday`) seeded.

## Decisions

- **Cron timezone:** `Africa/Accra` (UTC+0), matching CLAUDE.md's explicit
  resolution of "07:00 WAT = 07:00 UTC".
- **Bell scope:** visible to all authenticated users (pastor, leaders, and
  follow-up team all receive notifications). Mounted in the shared
  `AppShell` header.
- **Silence dedup:** query-then-skip guard (no unique constraint exists), keyed
  on pastor + `member_unreported` + `entityId = member.id` +
  `createdAt >= start-of-day in Africa/Accra`.

## 1. Backend service — extend `notifications.service.ts`

Add to the exported `notificationsService`:

- `list(userId)` → `{ data: Notification[], unreadCount: number }`.
  `data`: own notifications, `orderBy createdAt desc`, `take 20`.
  `unreadCount`: `count` where `userId` and `isRead: false` (counts all unread,
  not just the top 20).
- `markRead(userId, id)` → `updateMany({ where: { id, userId }, data: { isRead: true } })`.
  If `count === 0`, throw `AppError(404)` — this also prevents marking another
  user's notification.
- `markAllRead(userId)` → `updateMany({ where: { userId, isRead: false }, data: { isRead: true } })`.

## 2. Route — `routes/notifications.ts`

Mounted at `/api/v1/notifications` in `index.ts`. Every route uses
`authenticate` only (no `requireRole` — all roles have notifications).

- `GET /` → `list(req.user.id)` → `res.json(result)` (shape `{ data, unreadCount }`).
- `PATCH /:id/read` → `markRead(req.user.id, req.params.id)` → return updated-ish
  `{ ok: true }`.
- `PATCH /read-all` → `markAllRead(req.user.id)` → `{ ok: true }`.

Follows the `asyncHandler` + `AppError` pattern used by `settings.ts`.

## 3. Scheduler — `jobs/scheduler.ts`

`node-cron`, `startScheduler()` called from `index.ts` after routes mount (and
skipped when `NODE_ENV === 'test'`). Both jobs schedule with
`{ timezone: 'Africa/Accra' }`.

### Report reminder job — `0 8 * * *`

The `reportReminderDay` setting can change at runtime, so the cron fires daily
at 08:00 and the handler checks whether today's weekday (in Africa/Accra)
matches the configured `reportReminderDay`; if not, returns early. (Simpler and
more robust than re-registering cron on settings change.)

When it matches:
- Read `reportThresholdDays`.
- Query all active leaders.
- For each leader, find their active members with no report within
  `reportThresholdDays` (i.e. `lastReportDate` null or older than the cutoff).
- If any: `createNotification(userId: leader.id, type: 'report_due', ...)` +
  `sendEmail(leader.email, ...)` listing the count.

### Silence detection job — `0 7 * * *` daily

- Read `reportThresholdDays`; compute cutoff.
- Query active members where `lastReportDate` null or `< cutoff`.
- For each active pastor, for each silent member: dedup-guard (see Decisions)
  then `createNotification(userId: pastor.id, type: 'member_unreported',
  entityType: 'member', entityId: member.id, ...)`. No email (bell only) to
  avoid a daily email storm — matches PHASE.md which only specifies
  notification upsert here.

Start-of-day in Africa/Accra (UTC+0) equals start-of-day UTC, so the dedup
window is `new Date()` truncated to 00:00 UTC.

## 4. Frontend

- `types/index.ts`: `Notification` interface + `NotificationType` union.
- `lib/api.ts`: `getNotifications()`, `markNotificationRead(id)`,
  `markAllNotificationsRead()`.
- `hooks/useNotifications.ts`: fetch on mount; `setInterval` poll every 60s,
  cleared on unmount; exposes `notifications`, `unreadCount`, `markRead`,
  `markAllRead`, `loading`. Refetches after a mutation.
- `components/layout/NotificationBell.tsx`: bell icon with unread-count badge;
  click toggles a dropdown panel listing the 20 notifications (title, message,
  relative time, unread dot); clicking an item calls `markRead`; a "Mark all
  read" action calls `markAllRead`. Empty state when none. Uses existing `ui/`
  primitives and Relate design tokens (dark mode). Mounted in the `AppShell`
  header `actions` region so it shows on every page for every role.

## Testing

- Service unit tests (seeded test DB): `list` ordering + take 20 + unreadCount;
  `markRead` scoping (cannot mark another user's; 404 on miss); `markAllRead`;
  silence dedup skip on same-day re-run.
- Reminder/silence member-selection query correctness (a member reported inside
  threshold is excluded; null/overdue included).
- End-to-end: submit a safety-flagged report as a leader, confirm the pastor's
  bell shows it within the poll interval (exit criterion).

## Out of Scope

- Real-time push/websockets — 60s polling is sufficient at this scale.
- Reconfiguring cron registration on settings change — handled by the
  daily-fire + weekday-check approach.
