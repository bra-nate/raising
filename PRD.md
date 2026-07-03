# ShepherdLog — PRD
*Product Requirements Document v1.0*

---

## Problem Statement

A disciple-making ministry with a large congregation uses leaders to stay connected with individual members and report to the pastor. Currently this happens via email and informal messages — meaning the pastor has no consolidated view, report history is scattered, and there is no structured way to flag pastoral concerns. A separate follow-up team calls first-time visitors but has no shared system to log call outcomes or track whether first-timers have been converted into the main congregation.

ShepherdLog replaces all of this with a single structured reporting platform.

---

## Users and Roles

### Pastor
The single top-level authority. Created once during platform setup via a seed script.

**Can do everything:**
- View all members across all leaders and groups
- View all reports including confidential ones
- View all first-timer records and call logs
- Create, deactivate, and manage all user accounts
- Configure platform settings
- View the full activity log
- Redact or delete reports (subject to settings)
- Receive safety flag notifications immediately

### Leader
A member of the pastoral team responsible for a subset of the congregation.

**Can:**
- View and manage only their assigned members
- Add new members to the roster (auto-assigned to themselves)
- Submit reports on their assigned members
- Mark reports as confidential (restricts visibility to themselves + pastor)
- Flag reports as safety-critical (notifies pastor immediately)
- View report history on their own members
- View non-confidential reports on members they are assigned to

**Cannot:**
- See members assigned to other leaders
- See confidential reports written by other leaders
- See first-timer records
- Access the activity log or platform settings

### Follow-Up Team Lead
Oversees the first-timer follow-up team.

**Can:**
- View all first-timer records
- View all call logs from all team members
- Add first-timers and assign them to specific team members
- Submit call reports on any first-timer
- Convert a first-timer to a congregation member

**Cannot:**
- View member records or member reports
- Access platform settings or activity log

### Follow-Up Team Member
Front-line caller who contacts first-time visitors.

**Can:**
- View only the first-timers assigned to them
- Log call outcomes and notes on their assigned first-timers

**Cannot:**
- View first-timers assigned to other team members
- View member records
- Access any admin functions

---

## Feature Modules

### 1. Authentication and User Management

**Login**
- Email and password only
- No self-registration — all accounts created by pastor
- On successful login, server returns JWT; client stores in localStorage
- On success, client reads role from JWT payload and redirects to role-appropriate dashboard
- Failed login returns a generic error (do not distinguish wrong email vs wrong password)

**User Management (pastor only)**
- List all users: name, role, status (active/inactive), created date
- Create new user: full name, email, role, password
- Deactivate user (soft delete — sets `isActive = false`, preserves all historical reports)
- Edit user name or role
- Activity log entry written for every user creation, deactivation, or role change

---

### 2. Member Management

**Adding a Member**
- Any leader can add a member
- Required: first name, last name
- Optional: phone, email, address, group
- Member automatically assigned to the leader who added them (`assignedLeaderId = req.user.id`)
- Pastor can reassign a member to a different leader
- Members cannot be permanently deleted — only deactivated (`isActive = false`)
- Duplicate check on phone number: API warns if phone already exists, does not hard-block

**Member Profile**
- Displays: name, contact details, assigned leader, group, date added
- Shows: status summary derived from most recent report's status tag
- Shows: days since last report with silence status (on track / overdue / significantly overdue)
- Shows: full chronological report history, newest first
- Confidential reports shown with lock icon to authorised viewers only

**Member List — Leader**
- Only the leader's own assigned members
- Sortable by name, last report date, status tag
- Filterable by status tag, silence status
- Silence indicator per row

**Member List — Pastor**
- All members across all leaders and groups
- Filterable by leader, group, status tag, silence status
- Search by name
- Export to CSV

---

### 3. Report Submission — Member Module

**Report Form Fields**
- Status tag (required): Good / Needs Attention / Concern
- Report content (required): free text, no character limit
- Confidential toggle: visible to this leader and pastor only
- Safety flag checkbox: reserved for situations involving risk of harm

**On Submission (server)**
- `MemberReport` row created
- `member.lastReportDate` updated (same Prisma transaction)
- Activity log entry written
- If `isSafetyFlagged = true`: notification created for pastor + email sent immediately

**Confidential Reports**
- Displayed with a padlock badge wherever they appear
- Leader view: confidential reports written by a different leader are completely excluded from API response — not visible, not counted
- Pastor view: all reports shown, confidential flagged with padlock

**Safety-Flagged Reports**
- Displayed with a red alert badge
- Excluded from all delete and redact operations — no UI control appears and the API returns 403 if attempted
- Trigger immediate pastor notification and email on creation

---

### 4. Dashboard

**Pastor Dashboard**
Six summary stat cards:
- Total active members
- Reports submitted this week
- Members with status "Needs Attention" (count, clickable → filtered list)
- Members with status "Concern" (count, clickable → filtered list)
- First-timers registered this week
- First-timers with pending status (not yet contacted)

Silence alert panel:
- All members with no report within the configured threshold
- Amber: overdue; Red: significantly overdue (2× threshold)
- Each row links to the member profile

Recent reports feed:
- Last 20 reports across all leaders
- Shows member name, leader name, status tag, time ago
- Confidential reports shown with lock icon

**Leader Dashboard**
- Grid of their assigned members with status tag badge and last report date
- Silence warning per card
- "Add Report" shortcut on each card
- Summary row: total members, reports this week

**Follow-Up Dashboard — Team Member**
- Their assigned first-timers with status badge and last call date
- Pending first-timers sorted to top

**Follow-Up Dashboard — Team Lead**
- All first-timers with assigned team member shown
- Filter by team member, status

---

### 5. First-Timer Module

**Adding a First-Timer**
- Follow-up team member, team lead, or pastor can add
- Required: first name, last name, visit date
- Optional: phone, email, address, service type (Sunday Service / Midweek / Special Event / Other)
- Assigned to a specific follow-up team member (or left unassigned for team lead to assign)

**First-Timer Status Flow**
```
Pending → Contacted → Interested → Converted
                    ↘ Not Interested
```

Status updates automatically based on call outcome logged:
- `answered` or `callback_requested` → `contacted`
- `interested` → `interested`
- `not_interested` → `not_interested`

**Call Log**
Each call report includes:
- Call outcome (required): Answered / No Answer / Callback Requested / Interested / Not Interested
- Notes (optional): free text
- Timestamp auto-recorded

**Convert to Son/Daughter**
- Button visible to pastor and follow-up team lead
- Opens modal: select assigned leader, select group
- On confirm (single Prisma transaction):
  1. New `Member` row created with first-timer's details and `convertedFromFirstTimerId` set
  2. `FirstTimer` updated: `status = converted`, `convertedAt`, `convertedMemberId` populated
  3. Activity log entry written
- Member profile displays "Joined as first-timer on [visit date]" banner
- Original first-timer record retained — not deleted
- First-timer's call history accessible on the member profile via the `convertedFromFirstTimerId` relation

---

### 6. Confidentiality Controls

**Confidential Flag**
- Set at report creation by the submitting leader
- Immutable after creation — no update endpoint allows changing this flag
- Restricts API response: a leader querying another member's reports will never receive a confidential report written by a different leader

**Redact Action**
- Pastor can always redact a non-safety-flagged report
- Leaders can redact only if `settings.deletePermission = 'leaders'` AND `settings.allowDeleteReports = true`
- On redact: `content` replaced with `[Redacted]`, `redactionSummary` populated, `redactedAt` and `redactedById` set
- Report row retained — the audit record exists, the content is purged
- Activity log entry written

**Delete Action**
- Disabled by default (`settings.allowDeleteReports = false`)
- When enabled: pastor only, or leaders if `settings.deletePermission = 'leaders'`
- Cannot be applied to `isSafetyFlagged = true` reports — API returns 403
- Activity log entry written before deletion

---

### 7. Activity Log

Visible to pastor only. Append-only — no delete endpoint exists.

**Logged Events**

| Event | Triggered By |
|---|---|
| `submitted_member_report` | Leader submits report |
| `submitted_first_timer_report` | Team member logs call |
| `added_member` | New member added |
| `updated_member` | Member details edited |
| `converted_first_timer` | First-timer promoted to member |
| `viewed_confidential_report` | Any user opens a confidential report |
| `redacted_report` | Report content redacted |
| `deleted_report` | Report deleted |
| `created_user` | New user account created |
| `deactivated_user` | User deactivated |
| `updated_settings` | Any settings value changed |

**Display**
- Paginated table, newest first, 20 rows per page
- Columns: Date/Time, User, Action, Subject, Detail
- Filterable by user, action type, date range

---

### 8. Notifications

**In-App**
- Bell icon in nav with unread count badge
- Dropdown showing last 10 notifications: title, message, time ago, read/unread state
- Mark as read individually or all at once
- Frontend polls `GET /api/v1/notifications` every 60 seconds

**Notification Types**

| Type | Recipient | Trigger |
|---|---|---|
| `report_due` | Each leader | Scheduled — configured day of week |
| `member_unreported` | Pastor | Member exceeds silence threshold |
| `safety_flag` | Pastor | Any safety-flagged report submitted |
| `first_timer_assigned` | Team member | First-timer assigned to them |

**Email**
- Report reminders and safety flag emails sent via Resend
- Safety flag email fires synchronously on submission — does not wait for scheduled job

---

### 9. Settings (Pastor Only)

| Setting key | Type | Default | Description |
|---|---|---|---|
| `reportThresholdDays` | Integer | 14 | Days before a member is flagged as unreported |
| `allowDeleteReports` | Boolean | false | Master toggle for report deletion |
| `deletePermission` | Enum | `pastor_only` | `pastor_only` or `leaders` |
| `notificationsEnabled` | Boolean | true | Master toggle for in-app notifications |
| `reportReminderDay` | Enum | `friday` | Day of week for leader reminders |

Every settings change is logged in the activity log with old and new values.

---

## Non-Functional Requirements

- **Mobile-responsive:** All core flows (adding a member, submitting a report, logging a call) must work on a 375px viewport
- **Performance:** Member roster and report history load within 2 seconds for up to 500 members
- **Timezone:** All dates stored as UTC, displayed in Africa/Accra (GMT+0, no DST)
- **Accessibility:** WCAG 2.1 AA — sufficient colour contrast, keyboard navigable, screen-reader-friendly status badges
- **Data privacy:** A brief data policy notice displayed in the app footer — the platform records personal data on individuals who do not have platform accounts
- **Hosting agnostic:** The Express server must not depend on any platform-specific features. Configuration via environment variables only. No platform SDK imports.
