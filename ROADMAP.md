# raising — Operational Completeness Roadmap

Phases 1–7 (PHASE.md) built the reporting platform. These phases close the gaps
between "records activity" and "runs an operation": cases that resolve, a
follow-up queue that shows work, outcomes rather than counts, and a privacy
posture that matches the sensitivity of what is stored.

Multi-tenancy is deliberately out of scope. This is single-organisation software.

---

## Phase 8 — Case Management
*Closes: concern resolution, safety escalation*

`Needs Attention`, `Concern`, and safety flags are currently snapshots. A snapshot
cannot be owned, chased, or closed. One `Case` model serves both, because a
safety case is a concern case with a shorter fuse.

### 8.1 Schema
- [x] `Case` model: `kind` (concern | safety), `memberId`, `reportId`, `ownerId?`,
      `status` (open | acknowledged | resolved), `dueDate?`, `actionPlan?`,
      `acknowledgedAt?` / `acknowledgedById?`, `resolvedAt?` / `resolvedById?`,
      `resolutionNote?`
- [x] `CaseStatus` / `CaseKind` enums; `case` added to `EntityType`
- [x] New `ActivityAction` values: `opened_case`, `acknowledged_case`,
      `assigned_case`, `resolved_case`, `escalated_case`
- [x] Settings: `safetyAckHours` (default 4), `concernDueDays` (default 7)

### 8.2 Service
- [x] Open a case inside the existing `createMemberReport` transaction when
      `isSafetyFlagged` or `statusTag` is `needs_attention` / `concern`
- [x] One open case per member per kind — a second concern report updates the
      existing case rather than opening a duplicate
- [x] `acknowledge` / `assign` / `resolve`, each logging and each role-scoped
- [x] Leader scoping: a leader sees cases on their own members only; safety cases
      are pastor-visible regardless of who wrote the report

### 8.3 Escalation
- [x] Scheduler job: safety cases unacknowledged past `safetyAckHours` re-notify
      the pastor and log `escalated_case` (deduplicated per case per day)
- [x] Concern cases past `dueDate` surface in the pastor dashboard

### 8.4 Frontend
- [x] Open-cases panel on the pastor dashboard, aged and sorted by kind
- [x] Case actions on the member profile: acknowledge, assign, add plan, resolve
- [x] Leader dashboard shows their own open cases

**Exit:** a safety-flagged report opens a case, notifies the pastor, escalates if
unacknowledged, and cannot be closed without a resolution note.

---

## Phase 9 — Follow-Up Queue
*Closes: thin follow-up dashboard, undefined assignment*

### 9.1 Assignment rule (decided, then enforced)
- [x] Team leads and the pastor assign explicitly: `PATCH /first-timers/:id/assign`
- [x] The unassigned pool stays claimable — logging a call on an unassigned
      first-timer claims it — but the claim is now explicit and logged
- [x] New `ActivityAction`: `assigned_first_timer`, `claimed_first_timer`
- [x] PRD updated to match, since today it describes only the first half

### 9.2 Queue data
- [x] `GET /first-timers/queue`: due today, overdue, aging buckets, last attempt
      date and outcome, scheduled callbacks, per-assignee workload
- [x] `callbackAt` on a call report — a callback with a future date is scheduled
      work, not outstanding work; one with no date stays due
- [x] Settings: `firstContactDays` (default 2) — what "due" means

### 9.3 Frontend
- [x] `/followup` becomes the queue: due today, overdue, unassigned pool, my load
- [x] Team lead view adds workload by assignee and an assign control

**Exit:** a team member opens `/followup` and sees what to do today without
opening the list.

---

## Phase 10 — Group Management
*Closes: groups exist in the schema with no way to manage them*

- [x] `GET/POST/PATCH /groups`, pastor-writable; `DELETE` only when empty
- [x] Reassign a member's group from the member profile; bulk reassign on the
      group page for when a group's leader changes
- [x] `/pastor/groups` page: groups, leader, member count, care risk summary
- [x] New `ActivityAction`: `created_group`, `updated_group`, `deleted_group`

**Exit:** a pastor restructures groups without database access.

---

## Phase 11 — Outcome Metrics
*Closes: the system measures activity, not outcomes*

Depends on Phase 8 and 9 timestamps — without cases and claims there is nothing
to measure but counts.

- [x] `GET /metrics`: first-contact latency (median days visit → first call),
      conversion rate by assignee and by month, concern resolution time,
      leader reporting consistency (cycles reported / cycles due),
      per-group care risk (silence rate + open cases)
- [x] `/pastor/insights` page with the five, each as a trend not a single number
- [x] CSV export of the underlying rows

**Exit:** the pastor can answer "are we getting better at this" from the app.

---

## Phase 12 — Privacy and Retention
*Closes: sensitive records about people who never consented to an account*

- [x] Settings: `retentionMonths` (default 0 = retain indefinitely),
      `retentionMode` (report only | report and redact)
- [x] Scheduler job: flag records past retention; redaction is never automatic
      without the pastor acting, and safety-flagged rows are always exempt
- [x] Per-person export: everything held on one member or first-timer, as JSON
      and CSV, for a subject access request
- [x] `legalBasis` / `consentNote` on Member and FirstTimer
- [x] Confidential access review: existing `viewed_confidential_report` entries
      surfaced as a reviewable report, not buried in the activity log

**Exit:** the pastor can answer "what do we hold on this person, why, and for
how long" and produce it.

---

## Phase 13 — Documentation Reconciliation
*Closes: brand and planning drift*

- [x] ShepherdLog → raising across PRD, DATA, PHASE, SCREEN-FLOW, CLAUDE.md
- [x] PHASE.md checkboxes reflect what is actually built (1, 4, 5, 6 are done)
- [x] Password lifecycle recorded in PHASE.md as shipped
- [x] This roadmap folded into PHASE.md as phases 8–12

**Exit:** the repository is the source of truth again.

---

## Review fixes — 2026-09-14

A review of phases 8–12 found seven issues. Six were code; the seventh is the
deployment list, which PHASE.md already tracks as open.

- [x] **Superadmin reached pastoral data.** `requireRole('pastor', 'superadmin')`
      was written out of habit onto cases, privacy, metrics and groups. The
      superadmin design puts a platform administrator *beside* the pastor for
      accounts, settings and audit — never above them for pastoral data, and the
      subject-access export returns full report content including confidential
      and safety-flagged reports. Those four route files are now pastor-only,
      and `src/test/superadmin-boundary.test.ts` pins the whole boundary so it
      cannot regress by habit again.
- [x] **Case ownership was unrestricted.** Any active user could be made owner,
      and the assignment notification alone discloses the member's name and the
      case kind. Owners are now the pastor or the member's own assigned leader;
      a safety case may only be owned by a pastor. The eligible set travels with
      each case as `assignableOwners` so the UI never offers a rejected choice.
- [x] **Case assignment and due dates had no UI.** The panel showed an owner but
      offered no way to set one. Both controls are now on the case card.
- [x] **Callbacks were not scheduled.** They were an outcome bucket with no date,
      so a callback appeared immediately and stayed outstanding forever. Added
      `FirstTimerReport.callbackAt`, a date field on the call form, and a
      separate scheduled-vs-due split in the queue.
- [x] **Queue attempt totals were wrong.** `attempts` read `reports.length` on a
      query with `take: 1`, so it could only ever be 0 or 1. Now a `_count`.
- [x] **Deleting the newest report left silence stale.** `lastReportDate` is a
      cache that only `createReport` maintained, so deleting the newest report
      left a member looking recently covered by a report that no longer exists —
      feeding silence, reminders, leader consistency and group risk. Deletion now
      recomputes it inside the same transaction.
- [x] **Subject access export was JSON-only.** CSV added, matching the metrics
      export, because a subject access request is answered to a person.
