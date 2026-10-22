# User Journey Coverage Matrix

## Status legend

- **PASS:** Executed and observed through the expected outcome.
- **FAIL:** Executed and observed incorrect behavior.
- **PARTIAL:** Some steps executed or the implementation was traced, but the outcome was not verified end to end.
- **BLOCKED:** Execution could not start or complete because a required dependency was unavailable.
- **NOT RUN:** Identified but not executed in this audit.

## Coverage summary

- Material journeys discovered: **20**
- Fully executed and passed: **1** (public login shell only; not authentication)
- Partial: **3**
- Blocked: **15**
- Not run: **1**
- Critical authenticated journeys passed: **0**

The backend suite contains extensive intended coverage, but all 135 tests stopped in database setup. Those tests are evidence of test design and requirements, not evidence that behavior passed on this revision.

## Matrix

| ID | Persona | Goal | Preconditions and entry | Ordered steps / screens / actions | Data changes and handoff | Expected outcome | Evidence | Status | Severity if broken |
|---|---|---|---|---|---|---|---|---|---|
| J01 | Any user | Sign in and reach role home | Active account; `/login` | Enter email/password → submit → API login → role dashboard | Login activity record; JWT issued | Generic failures; correct role home; session persists safely | Public form and validation inspected; API/auth source traced; DB unavailable | PARTIAL | P1 |
| J02 | Newly provisioned user | Replace temporary password before accessing data | `mustChangePassword=true` | Sign in → forced password dialog → current/new/confirm → refresh profile | Password hash and gate change; clean token issued | No protected route accessible before change; new password works; old fails | Source and tests exist; tests blocked | BLOCKED | P1 |
| J03 | Pastor/superadmin | Create, change, reset, deactivate an account safely | Admin session | Users → create/edit/reset/deactivate → target signs in or reuses old session | User, log, notifications; permission handoff | New state applies immediately to every session | Source trace confirms stale-token risk; runtime repro blocked | BLOCKED | P1 |
| J04 | Leader/pastor | Add a member without duplicating or misassigning them | Authenticated role | Members → Add → required identity → leader/group/contact → save → profile | Member + audit event; leader owns care | Duplicate warning; valid leader/group; record visible in lists | Static trace found no duplicate warning; DB unavailable | BLOCKED | P2 |
| J05 | Leader | Record routine member wellbeing | Own member | Dashboard/list → profile → Add report → status/content → submit | Report + `lastReportDate` + log | Timeline and dashboard update; refresh persists | Source/transaction tests exist; DB unavailable | BLOCKED | P1 |
| J06 | Leader → pastor | Raise and resolve a concern/safety case | Own member and active pastor | Submit concern/safety report → case opens → notification → acknowledge → assign/plan/due → resolve with note | Report, case, notification, activity events; cross-role handoff | Safety alert immediate; overdue safety escalates; resolution auditable | Source traced; hourly deployment scheduler missing; DB unavailable | BLOCKED | P1 |
| J07 | Pastor | Understand current ministry risk | Seeded member/report/first-timer data | Pastor dashboard → stats → silence/cases → linked profile | Read-only derived data | Counts and links agree with source records | Static page/service review only | BLOCKED | P1 |
| J08 | Leader/pastor | Keep confidential reports private | Reports by multiple leaders | Mark confidential → query list/profile as author, other leader, pastor | Confidential report + access log where applicable | Author/pastor see; unrelated leader neither sees nor counts it | Explicit query-level tests exist; all blocked by DB | BLOCKED | P1 |
| J09 | Follow-up lead/member | See and claim/assign today's work | First-timers in multiple ownership states | Dashboard queue → unassigned/overdue → assign or first-call claim | `assignedToId`, notification, activity log | No duplicate ownership; member sees own + pool only | Service and tests traced; DB unavailable | BLOCKED | P1 |
| J10 | Follow-up member | Log call outcome and schedule callback | Own or claimable first-timer | Profile → outcome/notes/callback date → submit → revisit queue | Call report; status; optional claim and callback | Status updates; future callback scheduled; due callback resurfaces | Service tests cover intended rules; DB unavailable | BLOCKED | P1 |
| J11 | Follow-up lead/pastor → leader | Convert interested visitor to member | Eligible first-timer, leader/group | Profile → Convert → choose leader/group → confirm → member profile | Transaction creates member and marks first-timer converted; handoff to leader | No duplicate conversion; pre-join call history retained | Source transaction traced; DB unavailable | BLOCKED | P1 |
| J12 | Pastor | Restructure groups safely | Groups and assigned members | Groups → create/edit leader → move members → delete empty group | Group/member assignments + logs | Leader and group remain consistent; non-empty delete blocked | Source tests exist; DB unavailable | BLOCKED | P2 |
| J13 | Pastor/superadmin | Inspect outcome trends and export evidence | Historical records | Insights → inspect trends → CSV export | Read-only; download | Metrics are coherent, role-safe, and export matches view | Source and tests traced; DB unavailable | BLOCKED | P2 |
| J14 | Pastor | Fulfil privacy and retention duties | Closed/aged person records | Privacy → retention candidates → export JSON/CSV → legal basis → deliberate redaction → access review | Export log, legal basis, redaction, retention notification | Full subject record; safety exemptions; no automatic destructive action | Source/tests traced; DB unavailable | BLOCKED | P1 |
| J15 | Pastor/superadmin | Investigate an audit event | Activity history | Activity Log → filter actor/action/date → inspect detail → paginate | Read-only | Relevant event can be isolated and understood | UI executed statically; filters/detail/date absent | PARTIAL | P2 |
| J16 | Pastor/superadmin | Change operational policy safely | Settings loaded | Change threshold/enum/toggle → save → observe feedback → dependent workflow | Setting + audit event | Invalid input rejected; success/failure clear; dependent behavior changes | Source trace confirms only non-empty validation and optimistic UI | PARTIAL | P2 |
| J17 | Any user | Receive and clear notifications | Existing notifications | Bell → open → inspect → mark one/all read | `isRead` changes | Correct user's count/list updates and persists | Source/tests traced; DB unavailable | BLOCKED | P2 |
| J18 | Wrong-role user | Be denied direct URLs and APIs | Valid account with another role | Enter protected URL and call endpoint directly | None | UI redirects; server returns 403/404 without data leakage | Strong route/source evidence; executable permission tests blocked | BLOCKED | P1 |
| J19 | First-time visitor | Use login shell on mobile and keyboard | Local client only | `/login` at 375×667 → validation → open/close demo dialog → theme/reveal controls | None | No overflow; correct labels/focus; controls usable | Executed in local browser; no horizontal overflow; dialog focus/Escape/restore passed | PASS | P2 |
| J20 | Any user | Recover from loading, empty, API error, back/refresh/expired session | Varied network/session state | Navigate lists/profiles → fail/retry/refresh/back/direct URL | Varies | Clear error, recoverable retry, preserved context, safe re-auth | Static review found messages/skeletons; offline, retry, back, expiry not executed | NOT RUN | P2 |

## Critical journey test specifications not run

### CJ-1 — Account revocation

1. Log in as a leader and store token A.
2. Pastor deactivates leader.
3. Use token A on list, detail, create-report, notification, and settings endpoints.
4. Expect immediate 401/403 on every call and client redirect on next request.
5. Repeat for demotion and administrator password reset.

### CJ-2 — Safety loop

1. Leader submits a safety-flagged report on their own member.
2. Assert report, safety case, in-app notification, activity record, and attempted email.
3. Verify leader cannot acknowledge safety case.
4. Advance beyond acknowledgement window and invoke the production-equivalent scheduler.
5. Assert one escalation event/notification; acknowledge; invoke again; assert no duplicate.
6. Resolve with and without a note; missing note must fail without mutation.

### CJ-3 — Follow-up conversion handoff

1. Add unassigned first-timer.
2. Team member logs first call and claims it.
3. Log callback with future date; verify scheduled, then due at target date.
4. Team lead converts to member assigned to leader/group.
5. Leader sees member; pastor sees original call history; first-timer no longer appears as open work.

### CJ-4 — Confidentiality and subject access

1. Leader A writes confidential and ordinary reports.
2. Reassign member to Leader B or exercise supported cross-leader scenario.
3. Assert B cannot receive confidential content or infer it from counts.
4. Pastor sees it and access is logged.
5. Subject export includes complete authorized data and export audit event.

### CJ-5 — Settings safety

1. Submit every valid boundary and invalid value for all writable settings.
2. Assert invalid values never persist and UI rolls back visibly.
3. Change report/safety/follow-up thresholds and verify dependent queues/jobs at boundary dates.
