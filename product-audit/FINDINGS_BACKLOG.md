# Findings Backlog

Priorities follow the audit brief: P0 blocker, P1 critical, P2 major, P3 minor. “Verified” means directly supported by executed behavior or an unambiguous code/deployment path; it does not mean the fix was runtime-tested.

## Summary

| Priority | Count |
|---|---:|
| P0 | 0 |
| P1 | 5 |
| P2 | 8 |
| P3 | 3 |

## P1 findings

### PR-001 — Account changes do not revoke or refresh existing authorization

- **Remediation status (2026-10-22):** Fixed and pushed in `701a2f0`; current user state is reloaded by shared authentication middleware and five regressions pass.
- **Type:** Security / permission correctness
- **Priority:** P1
- **Persona / journey:** All authenticated roles; deactivation, role change, password reset
- **Location:** `server/src/middleware/authenticate.ts:10`, `server/src/lib/jwt.ts:12`, `server/src/config.ts:20`, `server/src/services/users.service.ts:94`, `:116`, `:180`
- **Confidence:** High
- **Steps to reproduce:** Sign in and retain the bearer token; from another administrator session deactivate the account, change its role, or reset its password; call a protected endpoint using the original token.
- **Expected:** The old token is rejected immediately, or each request revalidates active status, role, password gate, and token version.
- **Actual:** `authenticate` verifies the JWT signature and trusts embedded `role` / `mustChangePassword`; it does not read the user. Default token lifetime is seven days. Account mutations do not rotate a token version or revoke sessions.
- **Impact:** A deactivated user can retain access, a demoted user can retain privileged access, and a user whose password was reset can bypass the intended forced-change gate until token expiry.
- **Recommended fix:** Add server-side session/token-version state or rehydrate authorization-critical claims from the active user record on each request. Increment a version on role, password, and active-state changes. Shorten access-token life and use revocable refresh sessions if persistent sessions are needed.
- **Acceptance test:** For each mutation, prove the previously issued token receives 401/403 on the next protected request while a newly issued token reflects the new state.

### PR-002 — Safety escalation is not scheduled in the current deployment

- **Type:** Operational reliability
- **Priority:** P1
- **Persona / journey:** Pastor; safety report → acknowledgement/escalation
- **Location:** `server/vercel.json:3`, `DEPLOY-POC.md:29`
- **Confidence:** High
- **Steps to reproduce:** Deploy using the committed Vercel config; create an unacknowledged safety case; wait beyond `safetyAckHours`.
- **Expected:** The hourly endpoint runs and re-notifies the pastor after the acknowledgement window.
- **Actual:** Only the daily cron is configured. The repository explicitly says `/internal/cron/hourly` is not scheduled in the POC.
- **Impact:** A safety-critical case can sit without the promised escalation path.
- **Recommended fix:** Configure a reliable hourly scheduler, monitor invocations and failures, and document recovery for missed runs.
- **Acceptance test:** In a staging deployment with a short window, leave a safety case unacknowledged and verify one escalation notification/log per dedupe period.

### PR-003 — Critical email delivery is placeholder-based and not observable

- **Type:** Reliability / safety communication
- **Priority:** P1
- **Persona / journey:** Pastor; safety alert and role-change oversight
- **Location:** `server/src/services/notifications.service.ts:36`, `:49`, `:55`; `PHASE.md:208`
- **Confidence:** High
- **Steps to reproduce:** Configure Resend without changing the hard-coded `notifications@raising.local` sender, then trigger a safety email; or omit the key.
- **Expected:** A verified sender is used; delivery failure is recorded, retried, and alerted; critical actions expose notification state.
- **Actual:** Missing keys cause a log-only no-op; non-2xx responses and exceptions are logged and swallowed; the sender is a `.local` address; the production email-domain task is unchecked.
- **Impact:** The UI can report a successful safety submission while the promised immediate email never arrives.
- **Recommended fix:** Use a verified configurable sender, persist delivery attempts/status, retry transient failures, and alert operators. Keep in-app notification creation transactional and show delivery state separately.
- **Acceptance test:** Staging tests verify successful delivery, forced provider failure, retry, operator alert, and no loss of the in-app alert.

### PR-004 — No authenticated end-to-end release evidence is currently executable

- **Remediation status (2026-10-22):** Partially fixed. A one-command isolated PostgreSQL workflow now runs all 156 backend tests successfully; authenticated browser E2E coverage remains open under PR-013/WP6 and WP9.
- **Type:** Verification / release gate
- **Priority:** P1
- **Persona / journey:** All roles and all critical journeys
- **Location:** `server/.env.test`, `server/src/test/setup.ts:7`, `PHASE.md:209`
- **Confidence:** High
- **Steps to reproduce:** Run `pnpm --filter raising-server test` with no PostgreSQL at `localhost:5432`.
- **Expected:** A reproducible command provisions or connects to an isolated test database and runs assertions; the documented final walkthrough is completed.
- **Actual:** All 15 files / 135 tests fail in setup with `PrismaClientInitializationError`; zero assertions execute. No client or E2E test script exists. The final walkthrough remains unchecked.
- **Impact:** Permission, confidentiality, conversion, case, scheduler, privacy, and persistence behavior cannot be release-certified.
- **Recommended fix:** Provide a disposable database fixture (container or managed test DB), one-command migration/seed/test setup, and Playwright journeys for each role.
- **Acceptance test:** Clean checkout → one documented command → migrations → synthetic seed → all automated tests; then execute and archive the top critical E2E traces.

### PR-005 — Public login has no evidenced abuse controls

- **Remediation status (2026-10-22):** Code complete. Five attempts per account/network/window are enforced per instance, `429` includes `Retry-After`, baseline headers and client CSP are present, and regressions pass. The documented Vercel WAF rule still requires activation and monitoring in the project dashboard before this finding is fully closed.
- **Type:** Security
- **Priority:** P1
- **Persona / journey:** All users; sign in
- **Location:** `server/src/app.ts:21`, `server/src/routes/auth.ts:9`, `server/package.json`
- **Confidence:** Medium-high
- **Steps to reproduce:** Send repeated login attempts to `/api/v1/auth/login`.
- **Expected:** Layered throttling and monitoring limit credential stuffing and brute-force attempts without leaking account existence.
- **Actual:** The Express app registers CORS and JSON parsing but no rate limiter; no lockout, adaptive delay, WAF requirement, or auth-abuse telemetry is documented.
- **Impact:** Password-only accounts protecting sensitive pastoral data are exposed to automated guessing.
- **Recommended fix:** Add IP/account-aware throttling, monitoring, and deployment-level abuse protection. Avoid permanent account lockouts that enable denial of service.
- **Acceptance test:** Burst attempts are throttled with predictable 429 responses; valid users recover; generic error semantics remain intact; metrics/alerts fire.

## P2 findings

### PR-006 — Settings accept invalid values that can break operating policy

- **Remediation status (2026-10-22):** Fixed in working tree. All ten keys now have server-side enum/integer/range validation with `INVALID_SETTING_VALUE`; the UI supplies native bounds, rolls back failed saves, and announces success/errors. Boundary tests pass.
- **Type:** Correctness / configuration safety
- **Priority:** P2
- **Persona / journey:** Pastor or superadmin; configure policy
- **Location:** `server/src/services/settings.service.ts:25`, `:39`; `client/src/pages/admin/Settings.tsx:89`
- **Confidence:** High
- **Steps to reproduce:** PUT `safetyAckHours=-1`, `notificationsEnabled=banana`, or `reportReminderDay=noday`.
- **Expected:** Per-key type, enum, and range validation rejects invalid policy.
- **Actual:** The API only checks that the key is known and the string is non-empty. The UI optimistically keeps a value even when saving fails and supplies no success confirmation.
- **Impact:** Invalid thresholds or flags can silently disable reminders, distort queues, or make cases immediately/never overdue.
- **Recommended fix:** Define a schema per key; validate server-side; enforce sensible bounds; return structured errors; rollback UI state on failure.
- **Acceptance test:** Boundary and invalid-enum tests for all ten settings plus UI rollback/error announcement.

### PR-007 — Member duplicate-phone warning promised by the PRD is missing

- **Remediation status (2026-10-22):** Fixed in working tree. Ghana-equivalent phone formats return `409 POSSIBLE_DUPLICATE` with safe match summaries; both create screens offer review or explicit override, and overrides are written to the activity log.
- **Type:** Missing capability / data quality
- **Priority:** P2
- **Persona / journey:** Pastor and leader; add member
- **Location:** `PRD.md` Member Management; `server/src/services/members.service.ts:100`
- **Confidence:** High
- **Steps to reproduce:** Create two members with the same non-empty phone.
- **Expected:** Creation remains possible but the API/UI warns about the existing match.
- **Actual:** No duplicate lookup or warning is implemented.
- **Impact:** Duplicate people fragment report history, cases, silence metrics, and privacy exports.
- **Recommended fix:** Normalize phone numbers, return potential matches before commit or with a warning response, and offer “review existing / create anyway.”
- **Acceptance test:** Same normalized phone surfaces the existing record and requires an explicit override; different numbers proceed normally.

### PR-008 — Optional member data and group assignment cannot be cleared

- **Remediation status (2026-10-22):** Fixed in working tree. Empty optional fields and group now persist as `null`; inactive leaders and leader/group mismatches are rejected on the shared write path. Create, update, and clearing regressions pass.
- **Type:** Functional defect / privacy
- **Priority:** P2
- **Persona / journey:** Pastor or leader; correct member data
- **Location:** `server/src/services/members.service.ts:164`, `client/src/pages/pastor/MemberProfile.tsx:216`
- **Confidence:** High
- **Steps to reproduce:** Set a member's `groupId`, then select “No group”; or send an empty phone/email/address.
- **Expected:** The field becomes `null` and the UI reflects removal.
- **Actual:** Empty strings are converted to `undefined`; Prisma omits the field. The service may still log an update.
- **Impact:** Incorrect group metrics persist and obsolete personal data cannot be removed through normal editing.
- **Recommended fix:** Use explicit `null` for nullable fields, validate group/leader consistency, and add tests for clearing every optional field.
- **Acceptance test:** Clear each optional field and group, reload all relevant screens/exports, and verify null plus one accurate audit entry.

### PR-009 — Activity-log investigation workflow is incomplete

- **Remediation status (2026-10-22):** Fixed in working tree. Actor, validated action, and inclusive date filters are URL-backed; results show a privacy-safe subject identifier and retain stable pagination.
- **Type:** Missing capability / audit usability
- **Priority:** P2
- **Persona / journey:** Pastor and superadmin; investigate an event
- **Location:** `client/src/pages/admin/Logs.tsx:19`, `server/src/services/activity-log.service.ts:32`
- **Confidence:** High
- **Steps to reproduce:** Open Activity Log and try to filter by actor, action, or date, or inspect event detail.
- **Expected:** PRD-specified user/action/date filters and meaningful detail/subject.
- **Actual:** UI provides pagination only and shows entity type, not metadata/detail. API lacks date bounds.
- **Impact:** The audit trail exists but is difficult to use during a privacy, safety, or permission incident.
- **Recommended fix:** Add server-validated date bounds and UI filters; show subject, entity link where permitted, and human-readable metadata.
- **Acceptance test:** Narrow by user/action/date and verify exact expected rows, pagination stability, and privacy-safe detail.

### PR-010 — JWT is stored in `localStorage` without evidenced CSP hardening

- **Remediation status (2026-10-22):** Partially fixed. API security headers and a strict deployed client CSP are now present, with the inline theme bootstrap moved to a same-origin file. HttpOnly session migration remains WP7.
- **Type:** Security architecture
- **Priority:** P2
- **Persona / journey:** All authenticated roles
- **Location:** `client/src/lib/api.ts:26`, `:32`, `:55`; `server/src/app.ts:21`
- **Confidence:** High for storage/header facts; medium for exploitability
- **Steps to reproduce:** Inspect the client token store and response-header configuration.
- **Expected:** Sensitive sessions use an XSS-resistant strategy or a documented, strong CSP and short-lived/revocable tokens.
- **Actual:** The bearer token is readable from JavaScript local storage; no Helmet/CSP setup is present in the API or client deployment config.
- **Impact:** Any script injection can exfiltrate a seven-day bearer token and pastoral-data access.
- **Recommended fix:** Prefer secure HttpOnly SameSite cookies with CSRF protection, or use short-lived access tokens held in memory plus revocable refresh cookies. Add CSP and security headers either way.
- **Acceptance test:** Token is unavailable to page JavaScript; CSRF and XSS regression tests pass; logout/revocation works across tabs.

### PR-011 — Member editing is not exposed despite “manage” requirements

- **Remediation status (2026-10-22):** Fixed in working tree. Pastor and leader profiles share one edit modal for permitted identity/contact fields, send only changed values, persist clearing through the API, and warn before dirty close or browser navigation.
- **Type:** Missing capability
- **Priority:** P2
- **Persona / journey:** Leader and pastor; keep a member record current
- **Location:** `client/src/pages/leader/MemberProfile.tsx`, `client/src/pages/pastor/MemberProfile.tsx`
- **Confidence:** High
- **Steps to reproduce:** Open a member profile and try to correct name, phone, email, or address.
- **Expected:** Authorized roles can edit supported fields with validation, confirmation, and audit feedback.
- **Actual:** Pastor can change group; neither profile exposes general member editing even though the API supports it and the PRD says leaders can manage assigned members.
- **Impact:** Staff need developer/API assistance to correct routine contact data.
- **Recommended fix:** Add an edit flow scoped to authorized fields and role rules; combine with PR-008 clearing behavior and duplicate detection.
- **Acceptance test:** Both roles edit permitted fields; unauthorized leader is rejected; changes persist in profile, lists, and exports.

### PR-012 — Large roster endpoints are unbounded

- **Type:** Performance / operability
- **Priority:** P2
- **Persona / journey:** Pastor, leader, follow-up roles; list and search
- **Location:** `server/src/services/members.service.ts:66`, `server/src/services/first-timers.service.ts:14`, client-side filters
- **Confidence:** High
- **Steps to reproduce:** Load thousands of members/first-timers.
- **Expected:** Server pagination, stable sort, search/filter parameters, and bounded payloads.
- **Actual:** Services return entire applicable datasets; list UIs filter locally.
- **Impact:** Response time, browser rendering, memory use, and mobile usability degrade as the congregation grows.
- **Recommended fix:** Add cursor or page pagination with server-side filters/sort and preserve query state in URLs.
- **Acceptance test:** Large synthetic dataset meets agreed p95 latency/payload/render budgets and deep links restore list state.

### PR-013 — No client unit, integration, or E2E suite

- **Type:** Test coverage
- **Priority:** P2
- **Persona / journey:** All roles
- **Location:** `client/package.json`
- **Confidence:** High
- **Steps to reproduce:** Inspect declared scripts and test files.
- **Expected:** Automated coverage of route guards, forms, dialogs, error states, responsive paths, and critical cross-role journeys.
- **Actual:** Client declares only dev/build/preview. No Playwright/Cypress or component-test setup exists.
- **Impact:** UI regressions and disconnected controls can ship despite a clean TypeScript build.
- **Recommended fix:** Add focused component tests and Playwright journeys, beginning with the five critical workflows in `RELEASE_ACTION_PLAN.md`.
- **Acceptance test:** CI runs browser tests against a disposable database and retains traces/screenshots on failure.

## P3 findings

### PR-014 — Development login emits a React DOM-prop console error

- **Type:** Runtime quality
- **Priority:** P3
- **Location:** `client/src/pages/Login.tsx:107`
- **Evidence:** Browser console reported React does not recognise `fetchPriority`; production build still passed.
- **Impact:** Adds console noise and can conceal more important warnings.
- **Fix / acceptance:** Use the version-compatible DOM property or upgrade types/runtime consistently; load the page with zero React warnings.

### PR-015 — Two mobile login controls miss the 44px target guideline

- **Type:** Accessibility / responsive usability
- **Priority:** P3
- **Location:** `client/src/pages/Login.tsx:198`, password reveal control
- **Evidence:** At 375×667, the demo link measured 118×16 and the password control 44×42.
- **Impact:** Small targets are harder for users with motor impairments.
- **Fix / acceptance:** Give both at least a 44×44 interactive box and verify at 375px.

### PR-016 — Dashboard visual language is repetitive

- **Type:** Design quality
- **Priority:** P3
- **Location:** authenticated dashboard/list pages
- **Evidence:** Static review shows repeated rounded card grids and tables; no critical usability defect confirmed.
- **Impact:** Dense pages can blur priority and feel templated, especially for high-risk actions.
- **Fix / acceptance:** Reserve cards for bounded objects, strengthen risk hierarchy, and usability-test the “what should I do next?” question with each role.
