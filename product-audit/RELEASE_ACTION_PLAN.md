# Release Action Plan

## Release decision

**Hold production release.** A synthetic-data POC can continue if it is explicitly treated as non-production and safety/email guarantees are not represented as operationally reliable.

## Ordered actions

### 1. Make authorization state revocable — P1

**Suggested owner:** Backend/security  
**Addresses:** PR-001, PR-010

1. Choose a revocation model: server-side sessions or user `tokenVersion` plus short-lived access tokens.
2. Revalidate `isActive`, role, password gate, and version on protected requests.
3. Invalidate all prior sessions on deactivation, role change, administrator reset, and user password change as policy dictates.
4. Move persistent session material to secure HttpOnly SameSite cookies or document and implement an equivalent threat model.
5. Add security headers/CSP and regression tests.

**Exit condition:** Previously issued credentials fail immediately after every account-state mutation, and browser JavaScript cannot read persistent session secrets.

### 2. Close the safety-notification operational loop — P1

**Suggested owner:** Backend + DevOps/SRE  
**Addresses:** PR-002, PR-003

1. Configure the hourly safety-escalation schedule in staging and production.
2. Replace the hard-coded `.local` sender with a verified configurable address.
3. Persist email attempts and delivery state; retry transient failures and alert on permanent failure.
4. Add scheduler invocation/failure monitoring and a runbook for missed executions.
5. Prove dedupe and acknowledgement stop conditions.

**Exit condition:** A staged unacknowledged safety case reliably escalates within the configured window, with observable in-app and email outcomes and no duplicate flood.

### 3. Restore executable release evidence — P1

**Suggested owner:** QA + backend + DevOps  
**Addresses:** PR-004, PR-013

1. Provide a disposable PostgreSQL environment with a documented one-command setup.
2. Apply migrations and seed only synthetic test identities/data.
3. Run the existing 135 backend tests and fix real assertion failures.
4. Add Playwright for the five critical journeys below.
5. Store traces/screenshots/logs for failed CI runs.

**Exit condition:** Clean checkout to green backend + E2E is repeatable in CI and locally without manual database surgery.

### 4. Harden public authentication abuse controls — P1

**Suggested owner:** Backend/security + platform  
**Addresses:** PR-005

1. Add account/IP-aware login throttling and adaptive delay.
2. Confirm deployment-level WAF/rate controls and document their configuration.
3. Emit safe auth-abuse metrics and alerts without logging passwords/tokens.
4. Exercise recovery behavior for legitimate users.

**Exit condition:** Automated bursts are bounded and observable while generic login errors and legitimate recovery remain intact.

### 5. Repair data/configuration correctness — P2

**Suggested owner:** Backend + frontend  
**Addresses:** PR-006, PR-007, PR-008, PR-011

1. Add per-setting schemas, ranges, enum checks, and UI rollback/success feedback.
2. Normalize phone numbers and implement reviewable duplicate warnings.
3. Allow explicit `null` clearing for member contact/group fields.
4. Validate group belongs to assigned leader on every create/update path.
5. Add authorized member edit UI and cross-screen persistence tests.

**Exit condition:** Invalid policy cannot persist; records can be corrected/cleared; duplicate and ownership inconsistencies are prevented or explicitly overridden.

### 6. Complete audit and scale workflows — P2

**Suggested owner:** Product + frontend + backend  
**Addresses:** PR-009, PR-012

1. Add activity-log user/action/date filters and readable event detail.
2. Add server-side pagination/filter/sort for member and first-timer lists.
3. Put filter/page state in URLs so inspect → act → return preserves context.
4. Test with realistic synthetic volume.

**Exit condition:** An administrator can isolate an incident quickly, and large rosters remain within agreed latency and payload budgets.

### 7. Finish quality polish — P3

**Suggested owner:** Frontend/design  
**Addresses:** PR-014, PR-015, PR-016

1. Remove runtime console warnings.
2. Raise small mobile targets to 44×44.
3. Prioritize work/risk over repeated card treatment on dense dashboards.

## Critical E2E suite to add first

1. **Provision and revoke:** pastor creates leader → forced password change → leader accesses own data → pastor deactivates → old session denied.
2. **Member care loop:** leader adds member → good report → concern report → pastor sees dashboard/case → assign/plan/resolve → audit trail matches.
3. **Safety loop:** safety report → immediate in-app/email attempt → leader denied acknowledgement → scheduled escalation → pastor acknowledges/resolves.
4. **Follow-up handoff:** add unassigned visitor → member claims with first call → callback schedule/due → lead converts → assigned leader sees member and pre-join history.
5. **Confidentiality/privacy:** confidential report invisible to unauthorised leader → visible to pastor → subject export contains complete authorised history → access/export events logged.

Each test must include one negative permission or validation case, persistence after reload, direct URL/API checks, and desktop/mobile coverage where the interaction changes.

## Quick wins

- Validate settings with a small per-key schema map and add server tests.
- Change member optional updates from empty-string→`undefined` to explicit `null` semantics.
- Remove the incompatible `fetchPriority` prop warning.
- Give the demo-account and password-reveal controls full 44px hit areas.
- Add a test-environment preflight that reports a single clear database prerequisite instead of 135 setup failures.

## Retest checklist

- [ ] `pnpm build` passes.
- [ ] Backend suite passes with counts recorded; no blocked tests.
- [ ] Client unit/component suite passes.
- [ ] Five critical E2E journeys pass with traces retained.
- [ ] Old tokens fail after deactivate, role change, reset, and password change.
- [ ] Login throttling returns 429 under abuse and recovers correctly.
- [ ] Safety email uses verified sender; success/failure/retry are observable.
- [ ] Hourly safety escalation runs in deployed staging and is monitored.
- [ ] Duplicate phone warning and explicit override work.
- [ ] Member fields/group can be cleared and stay cleared after reload/export.
- [ ] Invalid settings never persist; UI rolls back and announces failure.
- [ ] Activity-log filters/details support a realistic investigation.
- [ ] Member and first-timer lists stay responsive at agreed synthetic scale.
- [ ] Keyboard, focus, contrast, reduced-motion, and 375px checks pass on every critical screen.
- [ ] Production smoke test uses synthetic data and includes refresh/back/direct URLs/session expiry.
- [ ] `PHASE.md` production checklist is updated only after observed evidence.

## Exact production-release conditions

Production can be reconsidered only when all of the following are true:

1. PR-001 through PR-005 are closed with automated evidence.
2. All existing backend tests execute; no critical suite is blocked.
3. The five critical E2E journeys pass against a production-like staging environment.
4. The hourly scheduler and verified email channel are deployed, monitored, and failure-tested.
5. The repository's final walkthrough is completed by role using synthetic data and recorded in the test log.
6. Remaining P2 risks have explicit product-owner acceptance or a dated fix plan; no unresolved P2 may compromise privacy, permissions, or data integrity.

## Remaining risks after plan

- No multi-tenancy: acceptable only for the documented single-organisation scope.
- No self-service account recovery: acceptable if pastor-led recovery is an explicit operating procedure with coverage and availability expectations.
- Third-party availability (Vercel, Supabase, Resend) still requires backup, monitoring, incident response, and data-processing review appropriate to sensitive pastoral data.
- Legal/privacy policy must be validated by the organisation; code cannot establish lawful basis or retention policy on its own.
