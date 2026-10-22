# Test Execution Log

**Audit date/time:** 2026-10-22 16:17–16:19 UTC  
**Host timezone:** Africa/Accra (UTC)  
**Revision:** `0e4b36b` on `main`  
**Data used:** No records created or modified. No migration or seed command was run.  
**External services:** Not invoked. The documented Vercel/Supabase POC was not tested because the audit brief requires permission before using external services.

## Environment and constraints

- Workspace contained installed dependencies and local `.env` / `.env.test` files; secret values were not printed.
- PostgreSQL expected by `.env.test` was not available at `localhost:5432`.
- No client test, lint, or E2E script is declared.
- A local Vite server was started only for the unauthenticated client surface.
- Authenticated browser journeys were not attempted without a safe database-backed test environment.

## Executed checks

| Time | Command / check | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|
| 16:16 | Repository/doc/route/schema inventory | Reconstruct product and execution surface | 23 page files, 30 route patterns, 56 API handlers, 15 backend test files | PASS | Source inventory commands |
| 16:16 | `pnpm build` | Server TypeScript and client TypeScript/Vite build | Passed; 131 modules; JS 363.24 kB / 104.80 kB gzip; CSS 25.26 kB / 5.97 kB gzip | PASS | Terminal output |
| 16:17 | `pnpm --filter raising-server test` | Execute backend tests against isolated test DB | 15 files / 135 tests stopped in setup; PostgreSQL connection refused at `localhost:5432`; no assertion reached | BLOCKED | Vitest summary and Prisma error |
| 16:17 | Start local client on `127.0.0.1:5174` | Serve public UI without data mutation | Started after local-listen permission | PASS | Vite ready output |
| 16:17 | Desktop login DOM/console at 1280×720 | Semantic form; no overflow/errors | Labels/headings/buttons present; no horizontal overflow; React Router warnings and React `fetchPriority` DOM-prop error observed | PARTIAL | Browser DOM snapshot and console |
| 16:18 | Empty login submit | Required field prevents invalid submit and focuses first field | Email validity false/valueMissing true; email focused | PASS | Browser evaluation |
| 16:18 | Demo account dialog keyboard behavior | Labelled dialog, managed focus, Escape, return focus | Focus landed on close; Escape closed; focus returned to “Use a demo account” | PASS | Browser DOM/focus evaluation |
| 16:18 | Mobile login at 375×667 | No horizontal overflow; usable controls | 375px document width; no horizontal overflow; page fit viewport | PASS | Browser evaluation |
| 16:18 | Mobile touch targets | Interactive targets at least 44×44 where applicable | Theme 44×44; Sign in 327×44; reveal 44×42; demo link 118×16 | PARTIAL | Browser bounding boxes |
| 16:19 | Source-level traceability | Map routes → services → entities → tests and deployment | Completed for auth, members, reports, cases, follow-up, groups, metrics, privacy, logs, settings, notifications | PASS | Cited source lines in artifacts |

## Backend test result interpretation

The 135 failures are **not classified as 135 confirmed defects**. Global test setup calls `TRUNCATE TABLE` before each test and failed to connect to PostgreSQL, so assertions never ran. The correct release interpretation is:

- Tests run: 135 attempted
- Tests passed: 0
- Tests failed on product assertions: 0 observed
- Tests blocked by environment: 135
- Test files blocked: 15 / 15

Covered-by-design areas include security boundaries, password lifecycle, cases, follow-up queue, groups, metrics, privacy, notifications, scheduled jobs, review regressions, and sanity. They remain unverified on this revision until rerun with a disposable database.

## Browser observations

### Desktop login

- URL redirected from `/` to `/login` as expected.
- Accessible tree exposed a level-one heading, labelled email/password fields, password-reveal button, submit button, theme toggle, carousel controls, and demo account control.
- Modal had `dialog` role and accessible name “Demo accounts.”
- Focus lifecycle passed.
- Console contained two React Router v7 future warnings and one React error about `fetchPriority` being forwarded as an unrecognised prop.

### Mobile login

- Viewport: 375×667.
- Document/client width: 375; no horizontal scrolling.
- Document/client height: 667.
- Desktop carousel was absent from the accessible mobile surface.
- Touch-target exceptions: demo-account text link and password-reveal height.

## Checks not available

| Check | Reason | Required next step |
|---|---|---|
| Authenticated role journeys | No safe reachable test database/accounts | Provision isolated DB, migrate, seed synthetic roles, then run E2E |
| Backend tests | PostgreSQL unavailable | Start/provide disposable PostgreSQL and rerun unchanged command |
| Client automated tests | No runner/config/scripts | Add component and Playwright suites |
| Lint | No lint script/config declared | Add a repository lint command or document intentional omission |
| Production smoke test | External POC use requires explicit permission and safe credentials | Run against staging/POC with synthetic account after authorization |
| Email delivery | Resend is external and sender setup is documented incomplete | Configure verified staging sender and capture provider/delivery evidence |
| Hourly safety escalation | Not scheduled in current Vercel config | Configure staging scheduler and execute time-bound case test |
| Accessibility of authenticated screens | No authenticated browser state | Run axe/manual keyboard checks per role after test environment exists |
| Load/performance at realistic scale | No safe dataset; no load tooling declared | Seed synthetic volume and define p95/payload/render budgets |

## Reproduction commands

```sh
# Build
pnpm build

# Backend suite — requires an isolated PostgreSQL matching server/.env.test
pnpm --filter raising-server test

# Public client browser surface
pnpm --filter raising-client dev --host 127.0.0.1
```

Do not run migrations or demo seeds against any database containing real data. The next test environment should be disposable and populated only with synthetic records.

## Remediation verification update — 2026-10-22

WP0 and WP1 added an isolated PostgreSQL container workflow, a database-name safety guard, current-state authorization, and regression coverage.

| Check | Result |
|---|---|
| `pnpm test` | PASS — container healthy, 11 migrations applied/already current, 15 files and 140 tests passed |
| Focused metrics timeout rerun | PASS — 1 passed in 105 ms |
| Second full backend run | PASS — 140/140 |
| `pnpm build` | PASS — server and client production builds |
| `git diff --check` | PASS |

WP3 code added the twelfth migration for an email-delivery ledger, configurable production sender enforcement, bounded transient retry, permanent-failure handling, and cron completion logging.

| Check | Result |
|---|---|
| Full backend suite | PASS — 20 files and 166 tests on immediate rerun |
| Provider simulations | PASS — sent, transient recovery, transient final failure, permanent rejection, and skipped email with retained in-app alert |
| `pnpm build` | PASS — server and client production builds |
| External boundary | Hourly scheduler, verified Resend domain, live delivery, and missed-run alerts still require staging/project access |
| Cleanup | Temporary test container and Compose network removed with `pnpm test:db:down` |

The original blocked result above remains the audit-time record. This update demonstrates that backend assertions are now executable; it does not claim that authenticated browser journeys have run.

### Continued remediation verification

WP2 and the first WP4 slice added login throttling, security headers/CSP, per-key settings validation, settings rollback feedback, nullable member-field clearing, and leader/group integrity checks.

| Check | Result |
|---|---|
| Full backend suite | PASS — 18 files and 156 tests |
| `pnpm build` | PASS — server and client production builds; 131 client modules |
| `git diff --check` | PASS |
| External boundary | Vercel WAF activation and live monitoring remain operator actions requiring project access |

WP4 and WP5 continuation added normalized duplicate detection with audited override, shared member editing, and server-validated URL-backed activity-log filters.

| Check | Result |
|---|---|
| Full backend suite | PASS — 19 files and 162 tests |
| `pnpm build` | PASS — server and client production builds; 133 client modules |
| `git diff --check` | PASS |
