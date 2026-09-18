export type UserRole = 'superadmin' | 'pastor' | 'leader' | 'followup_team_lead' | 'followup_team_member';
export type StatusTag = 'good' | 'needs_attention' | 'concern';
export type FirstTimerStatus = 'pending' | 'contacted' | 'interested' | 'not_interested' | 'converted';
export type CallOutcome = 'answered' | 'no_answer' | 'callback_requested' | 'interested' | 'not_interested';
export type NotificationType =
  | 'report_due'
  | 'member_unreported'
  | 'safety_flag'
  | 'first_timer_assigned'
  | 'case_assigned'
  | 'case_escalated';
export type CaseKind = 'concern' | 'safety';
export type CaseStatus = 'open' | 'acknowledged' | 'resolved';
export type SilenceStatus = 'ok' | 'overdue' | 'significant';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  /** On a pastor-issued password — every route is gated until it is replaced. */
  mustChangePassword: boolean;
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
  legalBasis?: string | null;
  consentNote?: string | null;
  retentionRedactedAt?: string | null;
  // Computed server-side — never derived on the frontend.
  silence?: SilenceStatus;
  latestStatus?: StatusTag | null;
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

export interface RetentionCandidate {
  type: 'member' | 'first_timer';
  id: string;
  name: string;
  lastActivityAt: string;
  monthsInactive: number;
  reportCount: number;
  exemptReason: string | null;
}

export interface ConfidentialAccessReview {
  days: number;
  total: number;
  byUser: { userId: string; fullName: string; role: UserRole; views: number; lastAt: string }[];
  entries: { id: string; at: string; by: string; role: UserRole; memberId: string | null }[];
}

export interface Metrics {
  months: string[];
  firstContact: {
    medianDays: number | null;
    contacted: number;
    neverContacted: number;
    byMonth: { month: string; medianDays: number | null; contacted: number }[];
  };
  conversion: {
    byMonth: { month: string; visitors: number; converted: number; rate: number | null }[];
    byAssignee: { userId: string; fullName: string; assigned: number; converted: number; rate: number | null }[];
  };
  caseResolution: {
    medianDaysOverall: number | null;
    medianDaysConcern: number | null;
    medianDaysSafety: number | null;
    resolved: number;
    open: number;
    oldestOpenDays: number | null;
    byMonth: { month: string; resolved: number; medianDays: number | null }[];
  };
  leaderConsistency: {
    cycles: number;
    cycleDays: number;
    leaders: { userId: string; fullName: string; members: number; rate: number | null; trend: (number | null)[] }[];
  };
  groupRisk: {
    groupId: string | null;
    name: string;
    members: number;
    silent: number;
    openCases: number;
    silenceRate: number | null;
  }[];
}

export interface Group {
  id: string;
  name: string;
  leaderId: string;
  leader?: { id: string; fullName: string };
  createdAt: string;
  // Computed server-side.
  memberCount: number;
  silentCount: number;
  openCaseCount: number;
}

export interface CareCase {
  id: string;
  kind: CaseKind;
  status: CaseStatus;
  memberId: string;
  member?: { id: string; firstName: string; lastName: string; assignedLeaderId: string };
  ownerId?: string | null;
  owner?: { fullName: string } | null;
  dueDate?: string | null;
  actionPlan?: string | null;
  acknowledgedAt?: string | null;
  acknowledgedBy?: { fullName: string } | null;
  resolvedAt?: string | null;
  resolvedBy?: { fullName: string } | null;
  resolutionNote?: string | null;
  reportCount: number;
  createdAt: string;
  /** Eligible owners, resolved server-side — a pastor, or the member's own leader. */
  assignableOwners?: { id: string; fullName: string }[];
}

export interface FirstTimer {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  address?: string;
  visitDate: string;
  serviceName?: string;
  assignedToId?: string | null;
  assignedTo?: { fullName: string };
  teamLeadId?: string;
  status: FirstTimerStatus;
  convertedAt?: string;
  convertedMemberId?: string;
  isActive: boolean;
  legalBasis?: string | null;
  consentNote?: string | null;
  retentionRedactedAt?: string | null;
  createdAt: string;
}

export interface QueueEntry {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  visitDate: string;
  serviceName?: string | null;
  status: FirstTimerStatus;
  assignedToId?: string | null;
  assignedTo?: { id: string; fullName: string } | null;
  lastAttemptAt?: string | null;
  lastOutcome?: CallOutcome | null;
  callbackAt?: string | null;
  attempts: number;
  dueAt: string;
  ageDays: number;
}

export interface FollowUpQueue {
  dueToday: QueueEntry[];
  overdue: QueueEntry[];
  upcoming: QueueEntry[];
  callbacks: QueueEntry[];
  callbacksScheduled: QueueEntry[];
  unassigned: QueueEntry[];
  aging: { d0_2: number; d3_7: number; d8_14: number; d15plus: number };
  workload: { userId: string; fullName: string; open: number; overdue: number }[];
  assignees: { id: string; fullName: string }[];
  counts: {
    total: number;
    dueToday: number;
    overdue: number;
    callbacks: number;
    callbacksScheduled: number;
    unassigned: number;
  };
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

export interface PastorStats {
  totalActiveMembers: number;
  reportsThisWeek: number;
  needsAttention: number;
  concern: number;
  firstTimersThisWeek: number;
  pendingFirstTimers: number;
}

export interface SilenceRow {
  id: string;
  firstName: string;
  lastName: string;
  assignedLeader: { fullName: string };
  lastReportDate?: string | null;
  silence: SilenceStatus;
}

export interface RecentReport {
  id: string;
  statusTag: StatusTag;
  isConfidential: boolean;
  isSafetyFlagged: boolean;
  createdAt: string;
  member: { id: string; firstName: string; lastName: string };
  leader: { fullName: string };
}

export interface PastorDashboard {
  stats: PastorStats;
  silence: SilenceRow[];
  recentReports: RecentReport[];
}
