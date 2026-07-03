# Design: Superadmin Role + Complete Audit Logging

*Date: 2026-07-03*
*Project: ShepherdLog*

---

## Problem

Two related gaps in the current platform:

1. **No dedicated administrator.** Account creation and settings management are locked to the `pastor` role. There is no platform-administration role separate from pastoral oversight.
2. **Incomplete audit trail.** The `writeLog()` infrastructure is solid and every *currently built* mutation is logged, but (a) there is no way to *read* the logs, (b) confidential-report views, settings changes, and login events are not logged, and (c) role changes are mislabeled as `updated_settings`.

This design adds a platform-only `superadmin` role and closes all identified audit-logging gaps.

---

## Part 1 — Superadmin Role

### Principle

`superadmin` is a **platform administrator**, positioned *beside* the pastor for administrative duties, **not above** the pastor for pastoral data. Separation of duties is preserved: the pastor remains the top of pastoral oversight; the superadmin manages accounts, settings, and audits activity.

### Capabilities

| Capability | pastor | superadmin |
|---|---|---|
| Create / update / deactivate users (any role) | ✅ | ✅ |
| Read / write settings | ✅ | ✅ |
| View activity logs | ✅ | ✅ |
| View members / reports / confidential pastoral data | ✅ | ❌ |
| Submit / redact / delete reports | ✅ | ❌ |

- **Both** pastor and superadmin can manage users and settings.
- A **pastor may create superadmin accounts** (confirmed — consistent with "both can manage"). Any manager can assign any role.
- The superadmin's lack of pastoral access falls out **naturally** from `requireRole` being an explicit allowlist: `superadmin` is simply never added to pastoral routes, which return 403. **All existing confidentiality and safety-flag guarantees remain intact** — a superadmin cannot reach those endpoints.

### Changes

1. **Schema** (`server/prisma/schema.prisma`): add `superadmin` to `enum UserRole`; generate migration.
2. **User routes** (`server/src/routes/users.ts`): change `router.use(authenticate, requireRole('pastor'))` → `requireRole('pastor', 'superadmin')`.
3. **User service** (`server/src/services/users.service.ts`): add `superadmin` to the `VALID_ROLES` allowlist so the role can be assigned.
4. **Bootstrap seed** (`server/prisma/seed.ts` or `server/src/scripts/seedSuperadmin.ts`):
   - Reads `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `SUPERADMIN_NAME` from env.
   - bcrypt-hashes the password and inserts one superadmin.
   - **Idempotent**: skips creation if a user with that email (or any superadmin) already exists.
   - Run once at deploy. Additional superadmins are created afterward via `/users`.
   - Document the new env vars in `server/.env.example`.

---

## Part 2 — Complete Audit Logging

The `writeLog()` contract is unchanged: called inside the triggering service function, joins the operation's transaction where one exists, rows are never deleted, no delete endpoint.

### 2a. Activity-log read route (the "Logs" surface)

- **New route** `server/src/routes/activity-log.ts`, mounted at `/api/v1/activity-log` in `index.ts`.
- Guard: `requireRole('pastor', 'superadmin')`.
- `GET /` — paginated list returning `{ data, total }`, newest first, with filters (by actor, action, entityType, date range).
- **New service** `server/src/services/activity-log.service.ts` gains a `listLogs()` function alongside the existing `writeLog()` (or a thin `activity-log-read.service.ts` — implementation plan decides). Includes the actor's name/email via Prisma relation for display.
- **No write/update/delete endpoints** — read-only, per the absolute rule.

> **Design note — logs vs. confidentiality:** activity-log rows carry metadata (e.g. `memberId`, `statusTag`, `isConfidential`) that references pastoral entities. Because the superadmin's purpose here is *auditing*, they see full log rows (actor, action, entity type, entity id, timestamp, metadata). This is a deliberate, accepted crossing of the "no pastoral data" line — an auditor who cannot see what happened is not an auditor. Logs expose *that* an action occurred and its metadata, never the pastoral *content* (report notes, etc.).

### 2b. Confidential-report view logging

- Write `viewed_confidential_report` (enum already exists) whenever a confidential report is retrieved/opened, inside the relevant read function in `member-reports.service.ts`.
- Metadata: `{ reportId, memberId }`, actor = requesting user.

### 2c. Settings-change logging

- The new settings write path (`PUT/PATCH` on the settings route → `settings.service.ts`) calls `writeLog({ action: 'updated_settings', entityType: 'settings', metadata: { changed fields } })`.
- **New settings route** `server/src/routes/settings.ts`, mounted at `/api/v1/settings`:
  - `GET /` — any authenticated user.
  - `PUT`/`PATCH` — `requireRole('pastor', 'superadmin')`.
  - Wires the existing `settings.service.ts`.

### 2d. Login-event logging

- Add enum value `logged_in` (and `login_failed` for failed attempts) to `ActivityAction`.
- `auth.service.ts login()` calls `writeLog` on success (`logged_in`) and on failed attempts (`login_failed`, metadata `{ email }`, no user relation required — see note).
- **Note:** failed logins may have no valid `userId`. Either allow `userId` nullable for these rows or record the attempted email in metadata with a system/actor convention. Implementation plan resolves the exact schema treatment.

### 2e. Role-change logging fix

- Add enum value `changed_user_role` to `ActivityAction`.
- In `users.service.ts updateUser()`, a role change writes `changed_user_role` (currently mislabeled `updated_settings`), metadata `{ from, to }`.

### Enum additions summary (`ActivityAction`)

- `logged_in`
- `login_failed`
- `changed_user_role`

(`viewed_confidential_report` and `updated_settings` already exist.)

---

## Part 3 — Frontend

- **Superadmin surface** = **Users + Settings + Logs** only. Pastoral nav items hidden.
- `client/src/lib/nav.ts`: add superadmin nav entries (Users, Settings, Logs).
- Login redirect / `App.tsx` routing: route `superadmin` to the admin area; guard pastoral routes against it.
- Pages (reuse existing pastor admin components where possible):
  - Users management (create/edit/deactivate, role selector includes `superadmin`).
  - Settings editor.
  - **Logs page** — paginated, filterable table backed by `/activity-log`.
- Types (`client/src/types/index.ts`): add `superadmin` to the role union; add ActivityLog types if not present.

---

## Out of Scope

- First-timer / follow-up-team services and their audit actions (not yet built).
- Refresh tokens, session management changes.
- Any change to the confidentiality/safety-flag rules themselves.

---

## Testing

- **Access control:** superadmin gets 403 on members / member-reports; 200 on users / settings / activity-log. Pastor retains all current access. Leader unaffected.
- **Role assignment:** pastor and superadmin can each create a superadmin; invalid roles rejected.
- **Seed:** idempotent — running twice creates exactly one superadmin.
- **Audit coverage:** each of the five logged events produces exactly one correctly-typed log row with expected metadata; confidential view logs on read; failed login logs without a valid user.
- **Read route:** pagination, filters, and role guard behave; no write/delete endpoints exist.
