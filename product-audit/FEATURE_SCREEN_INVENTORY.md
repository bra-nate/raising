# Feature and Screen Inventory

## Inventory scope

- 23 page modules under `client/src/pages`
- 30 declared client route patterns, including root/wildcard redirects
- 56 Express route handlers under `/api/v1`
- Shared interactive surfaces: app shell/sidebar/drawer, notification bell, report modal, password modal, cases panel, privacy card, filters, theme toggle

“Verified” below means source-to-route behavior was traced. It does not imply a database-backed runtime pass.

## Route and action inventory

| Role | Route / screen | Purpose | Primary actions | Expected outcome | Audit status / gaps |
|---|---|---|---|---|---|
| Public | `/login` | Authenticate | Sign in, reveal password, select demo account in dev, change theme | Role home or generic error | Browser-reviewed; responsive and modal behavior passed; console warning and small mobile targets found |
| Pastor | `/pastor` | Operational overview | Open risk/case/member links | Prioritized current work | Static only; data correctness blocked |
| Pastor | `/pastor/members` | Find and act on all members | Search/filter/sort, export, add, open profile | Correct roster and preserved context | Static only; server list unbounded |
| Pastor | `/pastor/members/new` | Add/assign member | Identity, leader, group, contact, save | New profile and ownership | Missing duplicate-phone warning; backend consistency validation incomplete |
| Pastor | `/pastor/members/:id` | Review member care | Report, group change, redact/delete under policy, cases, privacy export/basis | Data and downstream views update | Optional fields lack edit UI; “No group” cannot persist |
| Pastor | `/pastor/first-timers` | Manage visitors | Search/filter, add/batch upload, open profile | Accurate roster | Static only; unbounded dataset |
| Pastor | `/pastor/first-timers/:id` | Review/convert visitor | Edit/assign/call/convert | Transactional member creation and retained history | Static only; E2E blocked |
| Pastor | `/pastor/leaders` | View leader coverage | Search/open leader | Understand roster/report risk | Static only |
| Pastor | `/pastor/leaders/:id` | Inspect one leader | Tabs/pagination, open member | Accurate scoped overview | Static only |
| Pastor | `/pastor/groups` | Maintain group structure | Create/edit/reassign/move/delete | Consistent group ownership and metrics | UI correctly hides writes from superadmin; E2E blocked |
| Pastor | `/pastor/insights` | Review outcomes | Inspect five trends, export CSV | Decision-useful trends | Static only; metric assertions blocked |
| Pastor | `/pastor/privacy` | Manage retention and access review | Review candidates, redact, inspect confidential access | Deliberate, auditable privacy actions | Static only; data tests blocked |
| Pastor | `/pastor/users` | Manage accounts | Create/edit role/reset/deactivate | Immediate permission change | Stale JWT makes outcome unsafe |
| Pastor | `/pastor/logs` | Investigate activity | Paginate | Explain who did what and when | Missing UI filters, date range, subject/detail |
| Pastor | `/pastor/settings` | Configure policy | Change toggles/enums/numbers | Valid policy persists with feedback | No per-key validation; optimistic failure not rolled back |
| Superadmin | `/admin` | Platform overview | Navigate support areas | Operate without pastoral content | Static boundary review; runtime blocked |
| Superadmin | `/admin/users` | Account support | Same account controls | Safe account lifecycle | Stale JWT defect |
| Superadmin | `/admin/groups` | Read structure | Inspect group counts | No member identities or writes | `mayEdit` guard exists; runtime blocked |
| Superadmin | `/admin/insights` | Read aggregate trends | Inspect/export metrics | Aggregate-only support view | Runtime boundary blocked |
| Superadmin | `/admin/logs` | Review platform audit | Paginate | Investigate events | Same investigation gaps as pastor |
| Superadmin | `/admin/settings` | Configure platform policy | Change settings | Valid and audited policy | Validation and optimistic-state defects |
| Leader | `/leader` | See own care workload | Open member/case/report action | Know next action | Static only |
| Leader | `/leader/members` | Manage assigned roster | Search/filter/sort/add/open | Own members only | No edit path for existing member details |
| Leader | `/leader/members/new` | Add assigned member | Identity/contact/save | Auto-assigned member | Duplicate warning absent; no group selection |
| Leader | `/leader/members/:id` | Record care and manage concern | Add report, case actions | Timeline/case updates | Runtime scope and persistence blocked |
| Follow-up roles | `/followup` | Work today's queue | Open overdue/due/callback/unassigned items; assign if lead | Correct next-work list | Static only |
| Follow-up roles | `/followup/first-timers` | Browse/add/upload visitors | Search/filter/add/batch/open | Accurate list and records | Static only; unbounded dataset |
| Follow-up roles | `/followup/first-timers/:id` | Contact/update/convert | Log call/callback; lead edits/assigns/converts | Status and handoff update | Runtime blocked |
| Any authenticated | Notification bell | Review alerts | Open, mark one/all read | Correct count and ownership | Source only; tests blocked |
| Forced-password user | Password modal | Establish private password | Current/new/confirm | Clean token and access | Source only; tests blocked |

## Backend feature inventory

| Feature | Core endpoints | Roles | State / audit expectation | Verification |
|---|---|---|---|---|
| Authentication | `/auth/login`, `/me`, `/logout`, `/change-password` | Authenticated/public | Login/change logs; forced gate | Source traced; database execution blocked |
| Users | `/users` CRUD-like actions | Pastor/superadmin | Creation, role, reset, deactivation logged | Stale-session defect confirmed statically |
| Members | `/members`, `/:id`, `/export` | Pastor/leader | Scoped ownership, soft deactivate, CSV | Duplicate and null-clearing gaps |
| Reports | `/member-reports` | Pastor/leader | Transaction, confidentiality, safety, redact/delete | Source/tests; execution blocked |
| Cases | `/cases` | Pastor/leader | Open/ack/assign/update/resolve/escalate | Scheduler deployment gap |
| First-timers | `/first-timers`, queue/batch/assign/convert | Pastor/follow-up roles | Claim/assign/status/convert logs | Source/tests; execution blocked |
| Call reports | `/first-timer-reports` | Pastor/follow-up roles | Status/callback/claim | Source/tests; execution blocked |
| Groups | `/groups` and move-members | Read: pastor/admin/leader; write: pastor | Structure and reassignment logs | Source/tests; execution blocked |
| Metrics | `/metrics`, `/export.csv` | Pastor/superadmin | Aggregate only | Source/tests; execution blocked |
| Privacy | `/privacy/*` | Pastor | Export, basis, retention, access review | Source/tests; execution blocked |
| Activity log | `/activity-log` | Pastor/superadmin | Append-only read surface | Functional but investigation UI incomplete |
| Settings | `/settings` | Read all auth; write pastor/admin | Policy update log | Domain validation missing |
| Notifications | `/notifications` | Authenticated | Own list/read state | Email reliability gap; DB tests blocked |
| Cron | `/internal/cron/daily`, `/hourly` | Secret bearer | Daily and safety jobs | Hourly not scheduled in POC |

## Dead, misleading, or incomplete controls

| Surface | Issue | Classification |
|---|---|---|
| Member profile “No group” | Sends empty string, but service turns it into `undefined`; selection does not clear persisted group | Broken |
| Settings inputs | UI immediately displays attempted value and does not roll back after API failure | Misleading state |
| Activity Log | PRD-promised filters/detail are absent | Missing capability |
| Add member | PRD-promised duplicate warning absent | Missing capability |
| Existing member profile | No edit control for name/contact/address despite manage/update capability | Missing capability |
| Demo account link | Development-only and clearly labelled, but exposes shared demo credentials when `VITE_DEMO=1`; must never be enabled with real data | Deployment-sensitive |

## State coverage

| State | Evidence | Gap |
|---|---|---|
| Loading | Skeletons widely present | Authenticated runtime not exercised |
| Empty | Lists/timelines include empty messaging | Quality varies; some are descriptive rather than action-oriented |
| Error | Most pages set friendly text | Retry controls are uncommon; error announcements are not consistently `role=alert` |
| Permission denied | Server role guards and some tailored client messages | Runtime negative cases blocked |
| No results | Filtered lists include no-result patterns in source | Not browser-executed |
| Offline | No explicit strategy | NOT RUN / not implemented |
| Duplicate submission | Submit buttons disable while pending | Server idempotency keys absent for create/convert paths |
| Unsaved changes | Forms generally navigate without dirty-state warning | No protection evidenced |
| Session expiry | 401 interceptor clears token and redirects | Cross-tab and stale-claim behavior unsafe |

## Accessibility, responsive, theme, and performance notes

- Shared modal uses native dialog semantics, focus trapping, Escape, and focus restoration; verified on login.
- Mobile drawer/background inert behavior and reduced-motion rules exist from the prior accessibility pass.
- Public login had no horizontal overflow at 375×667 and filled the viewport exactly.
- Demo link and password-reveal control fell short of 44px height in measurement.
- Login console showed a React warning for `fetchPriority`.
- All five login carousel images are represented in the DOM; non-first images are lazy, but the initial JavaScript bundle is 363.24 kB (104.80 kB gzip) and no route-based code splitting is evident.
- Member and first-timer lists are unbounded and locally filtered, which is the principal scale risk.
