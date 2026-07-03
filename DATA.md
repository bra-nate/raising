# ShepherdLog — DATA.md
*Prisma Schema, Relationships, API Routes, and Access Control*

---

## Prisma Schema (`server/prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

enum UserRole {
  pastor
  leader
  followup_team_lead
  followup_team_member
}

enum StatusTag {
  good
  needs_attention
  concern
}

enum FirstTimerStatus {
  pending
  contacted
  interested
  not_interested
  converted
}

enum CallOutcome {
  answered
  no_answer
  callback_requested
  interested
  not_interested
}

enum ServiceType {
  sunday_service
  midweek
  special_event
  other
}

enum ActivityAction {
  submitted_member_report
  submitted_first_timer_report
  added_member
  updated_member
  converted_first_timer
  viewed_confidential_report
  redacted_report
  deleted_report
  created_user
  deactivated_user
  updated_settings
}

enum EntityType {
  member
  first_timer
  member_report
  first_timer_report
  user
  settings
}

enum NotificationType {
  report_due
  member_unreported
  safety_flag
  first_timer_assigned
}

enum DeletePermission {
  pastor_only
  leaders
}

enum ReminderDay {
  monday
  tuesday
  wednesday
  thursday
  friday
  saturday
  sunday
}

// ─────────────────────────────────────────────
// MODELS
// ─────────────────────────────────────────────

model User {
  id        String   @id @default(uuid())
  fullName  String
  email     String   @unique
  password  String                         // bcrypt hash
  role      UserRole
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  assignedMembers     Member[]        @relation("AssignedLeader")
  createdMembers      Member[]        @relation("CreatedBy")
  memberReports       MemberReport[]  @relation("ReportedBy")
  redactedReports     MemberReport[]  @relation("RedactedBy")
  assignedFirstTimers FirstTimer[]    @relation("AssignedTo")
  ledFirstTimers      FirstTimer[]    @relation("TeamLead")
  firstTimerReports   FirstTimerReport[]
  activityLogs        ActivityLog[]
  notifications       Notification[]
  updatedSettings     Setting[]

  @@map("users")
}

model Group {
  id        String   @id @default(uuid())
  name      String
  leaderId  String
  createdAt DateTime @default(now())

  // Relations
  leader  User     @relation(fields: [leaderId], references: [id])
  members Member[]

  @@map("groups")
}

model Member {
  id                       String    @id @default(uuid())
  firstName                String
  lastName                 String
  phone                    String?
  email                    String?
  address                  String?
  assignedLeaderId         String
  groupId                  String?
  lastReportDate           DateTime?
  isActive                 Boolean   @default(true)
  createdById              String
  convertedFromFirstTimerId String?  @unique
  createdAt                DateTime  @default(now())
  updatedAt                DateTime  @updatedAt

  // Relations
  assignedLeader         User         @relation("AssignedLeader", fields: [assignedLeaderId], references: [id])
  group                  Group?       @relation(fields: [groupId], references: [id])
  createdBy              User         @relation("CreatedBy", fields: [createdById], references: [id])
  convertedFromFirstTimer FirstTimer? @relation(fields: [convertedFromFirstTimerId], references: [id])
  reports                MemberReport[]

  @@map("members")
}

model MemberReport {
  id               String    @id @default(uuid())
  memberId         String
  leaderId         String
  statusTag        StatusTag
  content          String
  isConfidential   Boolean   @default(false)
  isSafetyFlagged  Boolean   @default(false)
  redactedAt       DateTime?
  redactedById     String?
  redactionSummary String?
  createdAt        DateTime  @default(now())

  // Relations
  member     Member  @relation(fields: [memberId], references: [id])
  leader     User    @relation("ReportedBy", fields: [leaderId], references: [id])
  redactedBy User?   @relation("RedactedBy", fields: [redactedById], references: [id])

  @@map("member_reports")
}

model FirstTimer {
  id                String           @id @default(uuid())
  firstName         String
  lastName          String
  phone             String?
  email             String?
  address           String?
  visitDate         DateTime
  serviceType       ServiceType?
  assignedToId      String?
  teamLeadId        String?
  status            FirstTimerStatus @default(pending)
  convertedAt       DateTime?
  convertedMemberId String?
  isActive          Boolean          @default(true)
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  // Relations
  assignedTo       User?              @relation("AssignedTo", fields: [assignedToId], references: [id])
  teamLead         User?              @relation("TeamLead", fields: [teamLeadId], references: [id])
  convertedMember  Member?            // back-relation via Member.convertedFromFirstTimerId
  reports          FirstTimerReport[]

  @@map("first_timers")
}

model FirstTimerReport {
  id            String      @id @default(uuid())
  firstTimerId  String
  reportedById  String
  callOutcome   CallOutcome
  content       String?
  createdAt     DateTime    @default(now())

  // Relations
  firstTimer  FirstTimer  @relation(fields: [firstTimerId], references: [id])
  reportedBy  User        @relation(fields: [reportedById], references: [id])

  @@map("first_timer_reports")
}

model ActivityLog {
  id         String         @id @default(uuid())
  userId     String
  action     ActivityAction
  entityType EntityType
  entityId   String?
  metadata   Json?
  createdAt  DateTime       @default(now())

  // Relations
  user  User  @relation(fields: [userId], references: [id])

  @@map("activity_logs")
}

model Notification {
  id         String           @id @default(uuid())
  userId     String
  type       NotificationType
  title      String
  message    String
  isRead     Boolean          @default(false)
  entityType String?
  entityId   String?
  createdAt  DateTime         @default(now())

  // Relations
  user  User  @relation(fields: [userId], references: [id])

  @@map("notifications")
}

model Setting {
  id          String   @id @default(uuid())
  key         String   @unique
  value       String
  description String?
  updatedById String?
  updatedAt   DateTime @updatedAt

  // Relations
  updatedBy  User?  @relation(fields: [updatedById], references: [id])

  @@map("settings")
}
```

---

## Seed Script (`server/prisma/seed.ts`)

Run once after initial migration to create settings defaults and the pastor account.

```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Settings defaults
  const settings = [
    { key: 'reportThresholdDays',  value: '14',          description: 'Days before a member is flagged as unreported' },
    { key: 'allowDeleteReports',   value: 'false',        description: 'Master toggle for report deletion' },
    { key: 'deletePermission',     value: 'pastor_only',  description: 'pastor_only | leaders' },
    { key: 'notificationsEnabled', value: 'true',         description: 'Master toggle for in-app notifications' },
    { key: 'reportReminderDay',    value: 'friday',       description: 'Day of week for leader report reminders' },
  ];

  for (const s of settings) {
    await prisma.setting.upsert({ where: { key: s.key }, update: {}, create: s });
  }

  // Pastor account — change password after first login
  const hash = await bcrypt.hash('changeme123', 12);
  await prisma.user.upsert({
    where: { email: 'pastor@shepherdlog.local' },
    update: {},
    create: {
      fullName: 'Pastor',
      email: 'pastor@shepherdlog.local',
      password: hash,
      role: 'pastor',
    },
  });

  console.log('Seed complete.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

---

## API Routes

Base prefix: `/api/v1`

### Auth

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | Public | Email + password → JWT |
| POST | `/auth/logout` | Authenticated | Client-side token clear (stateless) |
| GET | `/auth/me` | Authenticated | Return current user profile |

### Users

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/users` | Pastor | List all users |
| POST | `/users` | Pastor | Create new user |
| PATCH | `/users/:id` | Pastor | Update name or role |
| PATCH | `/users/:id/deactivate` | Pastor | Soft delete |

### Members

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/members` | Pastor, Leader | List members (scoped to leader's own) |
| POST | `/members` | Pastor, Leader | Add member |
| GET | `/members/:id` | Pastor, Leader (own only) | Member profile |
| PATCH | `/members/:id` | Pastor, Leader (own only) | Update member details |
| PATCH | `/members/:id/deactivate` | Pastor | Deactivate member |
| GET | `/members/export` | Pastor | CSV export |

### Member Reports

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/member-reports?memberId=` | Pastor, Leader (own members, filtered) | Reports for a member |
| POST | `/member-reports` | Pastor, Leader | Submit report |
| PATCH | `/member-reports/:id/redact` | Pastor (always), Leader (if permitted) | Redact report |
| DELETE | `/member-reports/:id` | Pastor (always), Leader (if permitted) | Delete report |

### First-Timers

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/first-timers` | Pastor, FU Lead (all), FU Member (assigned only) | List first-timers |
| POST | `/first-timers` | Pastor, FU Lead, FU Member | Add first-timer |
| GET | `/first-timers/:id` | Pastor, FU Lead, FU Member (own only) | First-timer profile |
| PATCH | `/first-timers/:id` | Pastor, FU Lead | Update details or assignment |
| POST | `/first-timers/:id/convert` | Pastor, FU Lead | Convert to member |

### First-Timer Reports

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/first-timer-reports?firstTimerId=` | Pastor, FU Lead (all), FU Member (own only) | Call history |
| POST | `/first-timer-reports` | Pastor, FU Lead, FU Member (own) | Log call |

### Activity Log

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/activity-log` | Pastor | Paginated log with filters |

### Notifications

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/notifications` | Authenticated | Own notifications |
| PATCH | `/notifications/:id/read` | Authenticated | Mark one as read |
| PATCH | `/notifications/read-all` | Authenticated | Mark all as read |

### Settings

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/settings` | Authenticated | Read all settings |
| PATCH | `/settings` | Pastor | Update one or more settings |

---

## Middleware Implementation Reference

### `authenticate.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt';

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = verifyToken(header.split(' ')[1]);
    req.user = payload; // { id: string, role: UserRole }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
```

### `requireRole.ts`

```typescript
import { UserRole } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
```

---

## Service-Layer Access Scoping Reference

Every list query must scope to the requesting user. Never trust query parameters for scoping.

### Members query — leader
```typescript
// Always filter by assignedLeaderId = req.user.id for leaders
prisma.member.findMany({
  where: {
    assignedLeaderId: userId,
    isActive: true,
  }
});
```

### Member reports query — leader
```typescript
// Leader sees: reports they wrote + non-confidential reports on their members
prisma.memberReport.findMany({
  where: {
    member: { assignedLeaderId: userId },
    OR: [
      { leaderId: userId },                  // reports they wrote (incl. confidential)
      { isConfidential: false },             // non-confidential from any leader on their members
    ],
  }
});
```

### First-timer reports query — team member
```typescript
// Team member sees only call reports they submitted
prisma.firstTimerReport.findMany({
  where: { reportedById: userId }
});
```

### Safety flag guard — redact/delete
```typescript
const report = await prisma.memberReport.findUnique({ where: { id } });
if (!report) return res.status(404).json({ error: 'Not found' });
if (report.isSafetyFlagged) return res.status(403).json({ error: 'Safety-flagged reports cannot be modified' });
```

---

## TypeScript Interfaces (`client/src/types/index.ts`)

```typescript
export type UserRole = 'pastor' | 'leader' | 'followup_team_lead' | 'followup_team_member';
export type StatusTag = 'good' | 'needs_attention' | 'concern';
export type FirstTimerStatus = 'pending' | 'contacted' | 'interested' | 'not_interested' | 'converted';
export type CallOutcome = 'answered' | 'no_answer' | 'callback_requested' | 'interested' | 'not_interested';
export type NotificationType = 'report_due' | 'member_unreported' | 'safety_flag' | 'first_timer_assigned';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface Member {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  address?: string;
  assignedLeaderId: string;
  assignedLeader?: { fullName: string };
  groupId?: string;
  group?: { name: string };
  lastReportDate?: string;
  isActive: boolean;
  convertedFromFirstTimerId?: string;
  convertedFromFirstTimer?: { visitDate: string };
  createdAt: string;
}

export interface MemberReport {
  id: string;
  memberId: string;
  leaderId: string;
  leader?: { fullName: string };
  statusTag: StatusTag;
  content: string;
  isConfidential: boolean;
  isSafetyFlagged: boolean;
  redactedAt?: string;
  redactionSummary?: string;
  createdAt: string;
}

export interface FirstTimer {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  visitDate: string;
  serviceType?: string;
  assignedToId?: string;
  assignedTo?: { fullName: string };
  status: FirstTimerStatus;
  convertedAt?: string;
  convertedMemberId?: string;
  isActive: boolean;
  createdAt: string;
}

export interface FirstTimerReport {
  id: string;
  firstTimerId: string;
  reportedById: string;
  reportedBy?: { fullName: string };
  callOutcome: CallOutcome;
  content?: string;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  user?: { fullName: string };
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  entityId?: string;
  createdAt: string;
}

export interface Setting {
  key: string;
  value: string;
  description?: string;
}

export interface ApiList<T> {
  data: T[];
  total: number;
}
```
