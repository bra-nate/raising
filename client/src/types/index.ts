export type UserRole = 'pastor' | 'leader' | 'followup_team_lead' | 'followup_team_member';
export type StatusTag = 'good' | 'needs_attention' | 'concern';
export type FirstTimerStatus = 'pending' | 'contacted' | 'interested' | 'not_interested' | 'converted';
export type CallOutcome = 'answered' | 'no_answer' | 'callback_requested' | 'interested' | 'not_interested';
export type NotificationType = 'report_due' | 'member_unreported' | 'safety_flag' | 'first_timer_assigned';
export type SilenceStatus = 'ok' | 'overdue' | 'significant';

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
