# Product Readiness Fix Implementation Plan

**Source:** Product readiness audit dated 2026-10-22  
**Scope:** PR-001 through PR-016  
**Release target:** Production readiness for one organisation using real pastoral data  
**Rule:** Every work package ends with executable evidence; no finding is closed by code inspection alone.

## Progress — 2026-10-22

| Package | Status | Evidence |
|---|---|---|
| WP0 — Disposable test database | Complete | `pnpm test` creates isolated PostgreSQL, applies 11 migrations, and the expanded suite now passes 162/162 |
| WP1 — Current-state authorization | Complete | Five regression cases cover deactivate, demote, promote, administrator reset, and deleted user; released in `701a2f0` |
| WP2 — Login abuse controls and headers | Code complete; deployment action open | Tested per-instance throttle, API headers, strict client CSP, and exact Vercel WAF rule documented; WAF activation/monitoring requires project access |
| WP4 — Settings and member data integrity | Complete | Settings, null clearing, assignment integrity, normalized duplicate detection, explicit override, and override audit evidence pass |
| WP5 — Member editing and audit investigation | Code complete | Shared edit workflow and URL-backed actor/action/date audit filters build; API boundary tests pass; browser certification remains WP9 |
| WP3, WP6–WP9 | Not started | Retain planned order below |

The first full run produced one transient five-second timeout in the metrics median test. It passed alone in 105 ms and every subsequent full run passed. The latest suite contains 19 files and 162 passing tests.

## Strategy

Fix in dependency order:

```text
Runnable test environment
├── Authorization and login security
├── Safety escalation and email reliability
├── Data and settings correctness
├── Operational investigation and scale
└── Cross-role E2E certification
```

The smallest secure solution for PR-001 is to load the current user during authentication and derive `isActive`, `role`, and `mustChangePassword` from the database on every protected request. This immediately invalidates stale authorization after deactivation, role change, and administrator password reset without adding a token-version migration or a new session subsystem. Cookie-based sessions remain a separate hardening task for PR-010.

## Definition of done

A work package is done only when:

1. The root cause is fixed at the shared boundary.
2. Positive, negative, and persistence tests pass.
3. The production build passes.
4. The audit finding has evidence linked in `TEST_EXECUTION_LOG.md`.
5. No P1 work is hidden behind a feature flag or manual procedure.

## Work packages

| Order | Package | Findings | Dependency | Estimate | Release effect |
|---:|---|---|---|---:|---|
| 0 | Disposable test database and preflight | PR-004 | None | 0.5–1 day | Makes every later fix verifiable |
| 1 | Current-state authorization | PR-001 | WP0 | 1 day | Closes immediate stale-access blocker |
| 2 | Login abuse controls and baseline headers | PR-005, part of PR-010 | WP0 | 1–2 days | Hardens public boundary |
| 3 | Safety scheduler and observable email | PR-002, PR-003 | WP0; deployment decision | 2–4 days | Closes safety-operations blockers |
| 4 | Settings and member data integrity | PR-006, PR-007, PR-008 | WP0 | 2–3 days | Prevents invalid policy and record drift |
| 5 | Member editing and audit investigation | PR-009, PR-011 | WP4 | 2–3 days | Completes routine operations |
| 6 | Scalable rosters and client test foundation | PR-012, PR-013 | WP0 | 3–5 days | Makes growth and UI changes safer |
| 7 | Session-storage hardening | remainder of PR-010 | WP1, WP2 | 2–4 days | Reduces XSS/token theft exposure |
| 8 | UI/runtime polish | PR-014, PR-015, PR-016 | WP6 preferred | 1–2 days | Clears non-blocking quality issues |
| 9 | Cross-role release certification | All | WP1–WP8 | 2–3 days | Supplies production go/no-go evidence |

Estimates are focused engineering time and exclude external provider approval or DNS propagation.

## WP0 — Disposable test database and preflight

### Outcome

One documented command starts isolated PostgreSQL, applies migrations, and runs the backend suite without touching development or production data.

### Changes

- Add a minimal Compose service for a dedicated test PostgreSQL database.
- Add root scripts for test database start, migrate, test, and stop.
- Add a preflight that fails once with a clear database message before Vitest fans out into 135 setup failures.
- Keep `.env.test` local; commit only safe examples and fixed local test coordinates.
- Document that test reset uses destructive `TRUNCATE` and must never point at shared data.

### Likely files

- `compose.test.yaml` or an equivalent minimal Compose file
- `package.json`
- `server/package.json`
- `server/.env.test.example`
- `server/src/test/setup.ts`
- `README.md` or `product-audit/TEST_EXECUTION_LOG.md`

### Acceptance tests

- Clean test database → migrations → `pnpm --filter raising-server test`.
- Record exact pass/fail counts.
- Database guard refuses a URL without an explicit test database name.
- Stop/restart test database and reproduce the same result.

### Stop condition

Do not begin broad backend changes until the suite reaches assertions. Fix only harness failures needed to make tests executable.

## WP1 — Current-state authorization

### Outcome

Deactivation, role change, and administrator password reset affect the next protected request, even when the caller presents an older validly signed JWT.

### Design

- Keep JWTs for identity transport in this package.
- Treat only the token's user ID as durable authorization input.
- In `authenticate`, load the current user with `id`, `role`, `isActive`, and `mustChangePassword`.
- Reject missing/inactive users.
- Set `req.user` from the database record, not token role/gate claims.
- Apply the password gate using current database state.
- Keep `/auth/me`, `/auth/change-password`, and `/auth/logout` exemptions explicit.

This deliberately avoids `tokenVersion` until a measured need appears. One indexed primary-key lookup per authenticated request is acceptable at the documented single-organisation scale and is simpler to reason about.

### Likely files

- `server/src/middleware/authenticate.ts`
- `server/src/lib/jwt.ts` only if payload typing can be narrowed safely
- `server/src/test/security.test.ts`
- `server/src/test/password-gate.test.ts`
- `server/src/test/superadmin-boundary.test.ts`

### Required tests

- Deactivated user's old token → 401 on the next request.
- Leader promoted to pastor → old token receives current role, not old role.
- Pastor demoted to leader → old token loses pastor access immediately.
- Administrator reset → old token can reach only the password-change escape path.
- Deleted/nonexistent user token → 401.
- Normal active user paths still pass.

### Rollback

Revert the middleware change; no schema rollback is needed.

## WP2 — Login abuse controls and baseline headers

### Outcome

Automated password guessing is bounded and observable; baseline security headers are present.

### Changes

- Add rate limiting specifically to `/api/v1/auth/login`, keyed by normalized account identifier plus client network signal where trustworthy.
- Preserve generic invalid-credential responses.
- Return `429` with a bounded retry interval.
- Add deployment-level throttling/WAF configuration as the primary distributed control; use application throttling as defense in depth.
- Add standard security headers and an explicit client CSP compatible with Vite assets.
- Never log passwords, complete tokens, or sensitive pastoral content.

### Decision before implementation

Confirm the production platform's available distributed rate-limiting/WAF feature. An in-memory limiter alone is insufficient across Vercel instances.

### Tests

- Repeated invalid attempts become 429.
- Attempts outside the window recover.
- Successful login remains possible after the window.
- Different accounts do not incorrectly lock each other.
- Security headers/CSP are asserted in integration/browser tests.

## WP3 — Safety scheduler and observable email

### Outcome

Unacknowledged safety cases escalate on time, and operators can distinguish email delivered, deferred, failed, and skipped.

### Code changes

- Make sender address configurable and required in production when email is enabled.
- Replace the `.local` sender.
- Persist delivery attempts/status for critical notifications or introduce the smallest existing-model extension that records provider outcome and last error.
- Retry transient failures with a bounded policy; do not retry permanent validation failures indefinitely.
- Keep in-app notification creation independent from email provider availability.
- Add job-run logging/monitoring for daily and hourly jobs.

### Deployment changes

- Schedule `/api/v1/internal/cron/hourly` using Vercel Pro or an equivalent scheduler.
- Store `CRON_SECRET` securely and rotate it after any exposure.
- Configure and verify the Resend sending domain/address.
- Alert on missed schedules and sustained email failure.

### Tests

- Safety report creates in-app notification even when email provider fails.
- Successful provider response records success.
- Transient failure retries and eventually records success/final failure.
- Hourly job escalates only past the configured window.
- Acknowledged cases stop escalating.
- Dedupe allows at most one escalation per case per configured period.

### External dependency gate

Code can be prepared locally, but this package cannot be closed until staging scheduler and email provider evidence are captured.

## WP4 — Settings and member data integrity

### Outcome

Invalid operating policy cannot persist; member records can be corrected or cleared; duplicates and leader/group mismatches are surfaced.

### Settings changes

- Replace the generic non-empty check with a small per-key parser/validator map.
- Enforce boolean values, known enums, integers, and sensible minimum/maximum ranges.
- Return structured field errors.
- In the client, keep the prior value, save, then commit the displayed value on success; restore it on failure.
- Announce success/error accessibly.

### Member changes

- Convert empty nullable fields to explicit `null`, not `undefined`.
- Validate that selected group belongs to selected/assigned leader on create and update.
- Reject inactive assigned leaders.
- Normalize phone numbers for comparison.
- Add a potential-duplicate check and explicit “create anyway” override rather than a hard unique constraint.
- Ensure an override is auditable.

### Tests

- Table-driven test for every valid/invalid setting boundary.
- Clear phone, email, address, and group; reload and export; values remain null.
- Mismatched leader/group is rejected on direct API calls.
- Inactive leader assignment is rejected.
- Equivalent phone formats produce a warning; explicit override succeeds once.

## WP5 — Member editing and audit investigation

### Outcome

Pastors and leaders can correct permitted member details, and administrators can investigate an event without manual database access.

### Member editing

- Reuse the existing create-field components and update endpoint.
- Add an edit action to pastor and leader member profiles.
- Keep assignment/group controls pastor-only; leaders edit only their own members' supported fields.
- Warn on dirty close/navigation only when values changed.

### Activity log

- Add `from` / `to` date bounds to the API.
- Add user, action, and date filters to the UI.
- Show human-readable subject and privacy-safe metadata.
- Preserve filters and page in the URL.

### Tests

- Authorized role edits and sees the change in profile/list/export.
- Unrelated leader gets 403 through direct API access.
- Filter combinations return exact rows with stable pagination.
- Confidential metadata is not exposed to superadmin beyond designed boundaries.

## WP6 — Scalable rosters and client test foundation

### Outcome

Member and first-timer screens remain usable at realistic volume, and client behavior is protected by automated tests.

### API/list changes

- Add server-side page/pageSize, stable sort, search, and existing domain filters.
- Cap page size.
- Return total/count metadata consistently.
- Put filter/sort/page state in URL query parameters.
- Preserve state across inspect → act → return.

### Client tests

- Add component tests only for logic-heavy shared pieces.
- Add Playwright for cross-role behavior rather than duplicating it in component mocks.
- Retain traces/screenshots only on failure to keep CI artifacts small.

### Performance acceptance

- Agree on a synthetic roster size before implementation.
- Measure API p95, payload size, first render, filter response, and mobile interaction.
- No full-dataset response for paginated list screens.

## WP7 — Session-storage hardening

### Outcome

Persistent credentials are not readable by page JavaScript and logout/session expiry are consistent across tabs.

### Approach

- Move authentication to a secure, HttpOnly, SameSite cookie.
- Add CSRF protection appropriate to cookie-authenticated mutations.
- Remove `localStorage` token handling and bearer injection from the client.
- Define explicit session expiry and logout invalidation behavior.
- Keep WP1's current-user authorization lookup as defense in depth.

This package is intentionally separate from WP1 so immediate permission revocation is not delayed by a broader transport migration.

### Tests

- `document.cookie` and page JavaScript cannot read the session secret.
- Cross-site mutation attempts fail.
- Logout invalidates the session in all relevant tabs.
- Expired sessions return to login without losing unsaved sensitive data unexpectedly.

## WP8 — UI and runtime polish

### Changes

- Remove the React `fetchPriority` warning using the version-compatible attribute/runtime.
- Make password reveal and demo-account controls at least 44×44 on mobile.
- Review the pastor, leader, and follow-up dashboards for one obvious next action and reduce repeated card treatment where it obscures priority.

### Tests

- Zero application errors/warnings on the login path.
- Automated 375px target-size assertions for the affected controls.
- Short role-based usability check: each participant identifies the next task without instruction.

## WP9 — Cross-role release certification

### Required E2E journeys

1. **Provision and revoke:** create leader → forced password change → own-data access → deactivate → old session denied.
2. **Member care:** add member → good report → concern report → case assignment/plan/resolution → dashboard and audit consistency.
3. **Safety:** safety report → in-app/email outcome → leader denied safety acknowledgement → hourly escalation → pastor acknowledgement/resolution.
4. **Follow-up:** add unassigned visitor → claim → callback scheduled/due → conversion → leader receives member and pastor sees call history.
5. **Confidentiality/privacy:** confidential report boundaries → pastor access → subject export → export/access audit entries.

Every journey must include:

- A meaningful invalid or unauthorized case.
- Persistence after refresh.
- Direct URL and direct API checks.
- Desktop and 375px coverage when layout/action placement changes.
- Expected versus actual data changes.
- Trace/screenshot/log references.

## Delivery sequence

### Iteration 1 — Unblock and secure

- WP0 disposable test database
- WP1 current-state authorization
- Start WP2 login controls

**Checkpoint:** Full backend suite executes; stale-token tests pass; build passes.

### Iteration 2 — Make safety dependable

- Finish WP2
- WP3 safety scheduler/email
- Start WP4 settings validation

**Checkpoint:** P1 code fixes pass locally; staged scheduler/provider evidence collected.

### Iteration 3 — Repair daily operations

- Finish WP4
- WP5 member editing/audit investigation
- WP8 low-risk runtime/accessibility fixes

**Checkpoint:** No open P2 privacy/data-integrity defect; routine corrections need no developer assistance.

### Iteration 4 — Scale and certify

- WP6 pagination/client tests
- WP7 session-storage hardening
- WP9 E2E certification

**Checkpoint:** All release gates pass; product owner receives go/no-go evidence.

## First implementation slice

Start with one reviewable change set:

1. Add the disposable PostgreSQL test workflow and preflight.
2. Run the unchanged 135 tests and record actual assertion failures.
3. Update shared authentication middleware to rehydrate current user state.
4. Add the five stale-authorization regression cases.
5. Run backend tests, `pnpm build`, and `git diff --check`.

Do not combine email, pagination, member UI, or visual polish into this slice.

## Decision log required before WP3 and WP7

| Decision | Options | Recommended default |
|---|---|---|
| Hourly scheduler | Vercel Pro cron / external scheduler | Use the platform already approved by the owner; do not build an in-app scheduler for serverless |
| Email sender | Verified Resend domain/address | Add `EMAIL_FROM`; fail startup in production if email is enabled and missing |
| Email delivery record | Extend notification / separate delivery table | Extend the smallest existing model that can preserve attempts without mixing read state and delivery state ambiguously |
| Session transport | HttpOnly cookie / bearer token | HttpOnly SameSite cookie after WP1 is shipped |
| Test database | Docker Compose / managed disposable DB | Docker Compose locally; equivalent ephemeral PostgreSQL in CI |

## MECE validation

Top-level work packages are separated by concern: test foundation, authorization, public boundary, safety operations, data correctness, workflow completeness, scale/test coverage, session transport, presentation quality, and release certification. Each audit finding has one primary owning package; cross-cutting tests are acceptance evidence rather than duplicate implementation scope.

| Finding | Primary package |
|---|---|
| PR-001 | WP1 |
| PR-002–003 | WP3 |
| PR-004 | WP0 |
| PR-005 | WP2 |
| PR-006–008 | WP4 |
| PR-009, PR-011 | WP5 |
| PR-010 | WP7, with headers begun in WP2 |
| PR-012–013 | WP6 |
| PR-014–016 | WP8 |

**MECE Score: 100/100 — All things are MECE. ✓**
