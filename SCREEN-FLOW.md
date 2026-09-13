# raising — SCREEN-FLOW.md
*Screen Architecture and Navigation by Role*

---

## Route Map (React Router)

```
/login

/pastor                          → Pastor Dashboard
/pastor/members                  → All Members Roster
/pastor/members/new              → Add Member
/pastor/members/:id              → Member Profile + Reports
/pastor/first-timers             → All First-Timers
/pastor/first-timers/:id         → First-Timer Profile
/pastor/users                    → User Management
/pastor/activity-log             → Activity Log
/pastor/settings                 → Platform Settings

/leader                          → Leader Dashboard
/leader/members                  → My Members
/leader/members/new              → Add Member
/leader/members/:id              → Member Profile + Add Report

/followup                        → Follow-Up Dashboard
/followup/first-timers           → First-Timer List (scoped by role)
/followup/first-timers/:id       → First-Timer Profile + Log Call
```

All routes under `/pastor`, `/leader`, and `/followup` are protected by a `<ProtectedRoute role="...">` wrapper component that reads from `AuthContext`. If the user's role doesn't match the route prefix, they are redirected to their own dashboard root.

---

## Shared Components (All Roles)

### App Shell (`AppShell.tsx`)
- Left sidebar navigation — role-specific links (see per-role sections below)
- Notification bell with unread count badge (polls every 60 seconds)
- Current user: name, role label
- Logout button (clears `sl_token` from localStorage, redirects to `/login`)

### Notification Panel (dropdown from bell)
- Last 10 notifications
- Each: icon by type, title, message, time ago, read/unread dot
- Click → mark as read + navigate to related entity
- "Mark all read" link

---

## Auth

### `/login`
```
┌─────────────────────────────────────┐
│                                     │
│         [Platform Logo]             │
│                                     │
│  Email ________________________     │
│  Password ______________________    │
│                                     │
│  [Sign In]                          │
│                                     │
└─────────────────────────────────────┘
```
On success: store JWT in `localStorage`, decode role from payload, redirect to role root.
No "Forgot Password" link — pastor resets passwords directly in the database or via an admin script.

---

## Pastor Screens

### `/pastor` — Dashboard

**Top row: 6 stat cards**
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Total Members│ │Reports (7d)  │ │Needs Attn.   │
│     142      │ │      37      │ │      8  →    │
└──────────────┘ └──────────────┘ └──────────────┘
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Concern     │ │First-Timers  │ │Not Contacted │
│     3   →   │ │  (7d): 12    │ │      5   →   │
└──────────────┘ └──────────────┘ └──────────────┘
```
Cards with "→" are clickable — navigate to the filtered list.
Data fetched from `GET /api/v1/dashboard/pastor` (single call).

**Silence Alert Panel**
- Heading: "Members Requiring Attention" + count badge
- Table: Member Name | Assigned Leader | Last Report | Days Overdue | Severity (amber / red)
- Sorted by days overdue descending
- Click row → `/pastor/members/:id`

**Recent Reports Feed**
- Last 20 reports across all leaders
- Each row: status badge | member name | leader name | time ago | 🔒 if confidential
- Click row → `/pastor/members/:id`

---

### `/pastor/members` — All Members Roster

**Filter bar**
- Search: name text input (client-side filter on loaded data)
- Filter dropdowns: Leader | Group | Status Tag | Silence Status

**Table**
| Name | Leader | Group | Status | Last Report | Silence | |
|------|--------|-------|--------|-------------|---------|---|
| Jane Doe | Kwame A. | Group 3 | 🟢 Good | 3 days ago | — | → |
| John Smith | Ama B. | Group 1 | 🟡 Needs Attn | 18 days ago | 🟠 | → |

- "Add Member" button → `/pastor/members/new`
- "Export CSV" button → `GET /api/v1/members/export` (triggers file download)

---

### `/pastor/members/:id` — Member Profile (Pastor)

**Header**
- Full name, assigned leader (editable dropdown), group, contact details (editable inline)
- Status badge (from most recent report's status tag)
- Silence banner: shown if no report within threshold — "No report filed in X days"
- Converted-from banner: "Joined as first-timer on [visitDate]" — shown if `convertedFromFirstTimerId` is set

**Report Timeline** (newest first)

Each report card:
```
┌────────────────────────────────────────────┐
│ 🟡 Needs Attention   [🔒 Confidential]     │
│ Filed by: Kwame A. · 14 Jun 2026           │
│                                             │
│ Report content here. Or [Redacted] if      │
│ redaction has occurred.                    │
│                                             │
│           [Redact ▾]  [Delete]             │
└────────────────────────────────────────────┘
```
- 🚨 Safety-flagged reports: red badge, no Redact / Delete controls appear
- Redact → modal: confirm action + enter redaction summary text
- Delete → modal: warning text + confirm
- `allowDeleteReports = false` in settings → Redact and Delete buttons do not render

**Call History Section** (only if converted from first-timer)
- Fetched from `GET /api/v1/first-timer-reports?firstTimerId=:convertedFromFirstTimerId`
- Labelled "Call history before joining" — read-only

---

### `/pastor/first-timers` — All First-Timers

**Filter bar**: Status (multi-select) | Assigned Team Member | Visit date range

**Table**
| Name | Visit Date | Service | Assigned To | Status | Last Contact | |
|------|-----------|---------|-------------|--------|-------------|---|

"Add First-Timer" button → inline slide-over form

---

### `/pastor/first-timers/:id` — First-Timer Profile (Pastor)

- Contact details, visit date, service type
- Status badge, assigned team member + team lead
- Full call history (all team members' calls)
- "Convert to Son/Daughter" button:
  ```
  ┌─────────────────────────────────────┐
  │ Convert to Son/Daughter             │
  │                                     │
  │ Assign to Leader: [dropdown]        │
  │ Assign to Group:  [dropdown]        │
  │                                     │
  │ [Cancel]   [Confirm Conversion]     │
  └─────────────────────────────────────┘
  ```
  On confirm → `POST /api/v1/first-timers/:id/convert`
  On success → navigate to new member profile

---

### `/pastor/users` — User Management

**User table**
| Name | Email | Role | Status | Created | |
|------|-------|------|--------|---------|---|
| Kwame Asante | kwame@... | Leader | Active | 01 Jan | Edit |

"Add User" button → modal:
```
Full Name: ___________
Email: _______________
Role: [dropdown]
Password: ____________

[Cancel]  [Create User]
```
Edit row → change name or role (inline or modal)
Deactivate → confirmation modal

---

### `/pastor/activity-log` — Activity Log

**Filters**: User | Action Type | Date Range

**Table** (paginated, 20 rows, newest first)
| Date/Time | User | Action | Subject | Detail |
|-----------|------|--------|---------|--------|
| 28 Jun 09:15 | Kwame A. | Submitted Report | Jane Doe | Needs Attention |
| 28 Jun 08:03 | Pastor | Viewed Confidential | John Smith | Report from 10 Jun |

---

### `/pastor/settings` — Settings

```
Report Settings
───────────────
Unreported member threshold:  [14] days

Report Deletion
───────────────
Allow report deletion:        ○ Off  ● On
Permission:                   [Pastor Only ▾]

Notifications
─────────────
Enable notifications:         ● On  ○ Off
Report reminder day:          [Friday ▾]

[Save Settings]
```

---

## Leader Screens

### `/leader` — Dashboard

**Stat row**: My Members [count] | Reports This Week [count] | Overdue [count]

**Member Grid**
```
┌────────────────────┐  ┌────────────────────┐
│ Jane Doe           │  │ John Smith         │
│ 🟢 Good            │  │ 🟡 Needs Attention │
│ Last report: 3d    │  │ Last report: 18d 🟠│
│ [Add Report]       │  │ [Add Report]       │
└────────────────────┘  └────────────────────┘
```

"Add Member" button → `/leader/members/new`

---

### `/leader/members/:id` — Member Profile (Leader)

**Member details** — phone, email, address, group (inline editable, saves on blur or submit)

**Silence banner** (if applicable)

**Report Timeline**
- Shows: reports this leader wrote (including their own confidential ones with 🔒)
- Shows: non-confidential reports on this member by any leader
- Does NOT show: confidential reports written by other leaders (excluded at API level)

**"Add Report" button** → modal:
```
Status*
  ● Good
  ○ Needs Attention
  ○ Concern

Report ________________________________
       ________________________________

□ Mark as confidential (pastor + me only)
□ 🚨 Safety concern (notifies pastor immediately)

[Cancel]  [Submit Report]
```

---

## Follow-Up Team Screens

### `/followup` — Dashboard (Team Member)

```
┌────────────────────────────────────────┐
│ Sarah Mensah          🔵 Contacted     │
│ Visit: 22 Jun · Last call: 3 days ago  │
│ [View]                                 │
└────────────────────────────────────────┘
┌────────────────────────────────────────┐
│ Fred Owusu            🔴 Pending       │
│ Visit: 25 Jun · Not yet contacted      │
│ [View]                                 │
└────────────────────────────────────────┘
```

Pending sorted to top. "Add First-Timer" button.

---

### `/followup` — Dashboard (Team Lead)

Same layout, all first-timers, "Assigned To" column visible.
Filter bar: by team member, by status.

---

### `/followup/first-timers/:id` — First-Timer Profile

**Header**: name, visit date, service type, phone/email, status badge, assigned team member

**"Convert to Son/Daughter"** (team lead only) → same conversion modal as pastor view

**Call History Timeline**
```
┌──────────────────────────────────────┐
│ ✅ Answered · 26 Jun 2026            │
│ Called by: Yaw Mensah                │
│                                      │
│ "Spoke for 10 mins. She enjoyed the  │
│  service and wants to come back."    │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│ 📵 No Answer · 24 Jun 2026           │
│ Called by: Yaw Mensah                │
└──────────────────────────────────────┘
```

**"Log Call" button** (team member on own; team lead on any):
```
Outcome*
  ○ Answered
  ○ No Answer
  ○ Callback Requested
  ○ Interested
  ○ Not Interested

Notes (optional) _____________________

[Cancel]  [Log Call]
```

---

## Visual Reference

### Status Tag Badges

| Tag | Colour | Meaning |
|---|---|---|
| Good | Green | Member is doing well and engaged |
| Needs Attention | Amber | Something to watch, may need pastoral care |
| Concern | Red | Urgent — requires pastor awareness |

### Silence Indicators

| State | Indicator | Condition |
|---|---|---|
| On track | None | Reported within threshold |
| Overdue | 🟠 Amber dot | Past threshold (e.g. 14 days) |
| Significantly overdue | 🔴 Red dot | Past 2× threshold (e.g. 28 days) |

### First-Timer Status Badges

| Status | Colour | Meaning |
|---|---|---|
| Pending | Red | No call attempt yet |
| Contacted | Blue | Called, acknowledged |
| Interested | Green | Expressed interest in returning |
| Not Interested | Grey | Declined further contact |
| Converted | Purple | Now a congregation member |

### Report Badges

| Badge | Meaning |
|---|---|
| 🔒 Confidential | Pastor + submitting leader only |
| 🚨 Safety | Cannot be deleted or redacted — pastor notified |
