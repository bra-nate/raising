import axios from 'axios';
import type {
  ActivityLog,
  ApiList,
  AuthUser,
  CareCase,
  CaseKind,
  CallOutcome,
  FirstTimer,
  FirstTimerReport,
  FirstTimerStatus,
  FollowUpQueue,
  Group,
  Member,
  MemberReport,
  Metrics,
  ConfidentialAccessReview,
  Notification,
  RetentionCandidate,
  PastorDashboard,
  StatusTag,
  User,
  UserRole,
} from '../types';

const TOKEN_KEY = 'sl_token';

export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api/v1`,
});

// Attach the bearer token from localStorage on every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear the token and bounce to login.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// ── Auth ──────────────────────────────────────
export async function login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const { data } = await api.post('/auth/login', { email, password });
  return data;
}

export async function getMe(): Promise<AuthUser> {
  const { data } = await api.get('/auth/me');
  return data;
}

// Returns a fresh token: the old one carries the password-gate claim.
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ token?: string }> {
  const { data } = await api.post('/auth/change-password', { currentPassword, newPassword });
  return data;
}

// ── Privacy ───────────────────────────────────
export async function listRetentionCandidates(): Promise<{
  retentionMonths: number;
  data: RetentionCandidate[];
  total: number;
}> {
  const { data } = await api.get('/privacy/retention');
  return data;
}

export async function redactForRetention(type: 'member' | 'first_timer', id: string): Promise<void> {
  await api.post(`/privacy/retention/${type}/${id}/redact`);
}

export async function exportPersonData(type: 'member' | 'first_timer', id: string): Promise<unknown> {
  const { data } = await api.get(`/privacy/export/${type}/${id}`);
  return data;
}

export async function exportPersonCsv(type: 'member' | 'first_timer', id: string): Promise<Blob> {
  const { data } = await api.get(`/privacy/export/${type}/${id}`, {
    params: { format: 'csv' },
    responseType: 'blob',
  });
  return data;
}

export async function getConfidentialAccessReview(days = 90): Promise<ConfidentialAccessReview> {
  const { data } = await api.get('/privacy/confidential-access', { params: { days } });
  return data;
}

export async function setLegalBasis(
  type: 'member' | 'first_timer',
  id: string,
  input: { legalBasis?: string; consentNote?: string }
): Promise<void> {
  await api.patch(`/privacy/legal-basis/${type}/${id}`, input);
}

// ── Metrics ───────────────────────────────────
export async function getMetrics(): Promise<Metrics> {
  const { data } = await api.get('/metrics');
  return data;
}

export async function exportMetricsCsv(): Promise<Blob> {
  const { data } = await api.get('/metrics/export.csv', { responseType: 'blob' });
  return data;
}

// ── Groups ────────────────────────────────────
export async function listGroups(): Promise<ApiList<Group>> {
  const { data } = await api.get('/groups');
  return data;
}

export async function createGroup(input: { name: string; leaderId: string }): Promise<Group> {
  const { data } = await api.post('/groups', input);
  return data;
}

export async function updateGroup(id: string, input: { name?: string; leaderId?: string }): Promise<Group> {
  const { data } = await api.patch(`/groups/${id}`, input);
  return data;
}

export async function moveGroupMembers(id: string, targetGroupId: string | null): Promise<{ moved: number }> {
  const { data } = await api.patch(`/groups/${id}/move-members`, { targetGroupId });
  return data;
}

export async function deleteGroup(id: string): Promise<{ id: string }> {
  const { data } = await api.delete(`/groups/${id}`);
  return data;
}

// ── Follow-up queue ───────────────────────────
export async function getFollowUpQueue(): Promise<FollowUpQueue> {
  const { data } = await api.get('/first-timers/queue');
  return data;
}

export async function assignFirstTimer(id: string, assignedToId: string | null): Promise<FirstTimer> {
  const { data } = await api.patch(`/first-timers/${id}/assign`, { assignedToId });
  return data;
}

// ── Cases ─────────────────────────────────────
export async function listCases(params: {
  status?: 'open' | 'resolved' | 'all';
  kind?: CaseKind;
  memberId?: string;
} = {}): Promise<ApiList<CareCase>> {
  const { data } = await api.get('/cases', { params });
  return data;
}

export async function acknowledgeCase(id: string): Promise<CareCase> {
  const { data } = await api.patch(`/cases/${id}/acknowledge`);
  return data;
}

export async function assignCase(id: string, ownerId: string): Promise<CareCase> {
  const { data } = await api.patch(`/cases/${id}/assign`, { ownerId });
  return data;
}

export async function updateCase(id: string, input: { actionPlan?: string; dueDate?: string }): Promise<CareCase> {
  const { data } = await api.patch(`/cases/${id}`, input);
  return data;
}

export async function resolveCase(id: string, resolutionNote: string): Promise<CareCase> {
  const { data } = await api.patch(`/cases/${id}/resolve`, { resolutionNote });
  return data;
}

// ── Users (pastor) ────────────────────────────
export async function listUsers(): Promise<ApiList<User>> {
  const { data } = await api.get('/users');
  return data;
}

export async function createUser(input: {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
}): Promise<User> {
  const { data } = await api.post('/users', input);
  return data;
}

export async function updateUser(id: string, input: { fullName?: string; role?: UserRole }): Promise<User> {
  const { data } = await api.patch(`/users/${id}`, input);
  return data;
}

export async function resetUserPassword(id: string, newPassword: string): Promise<void> {
  await api.patch(`/users/${id}/password`, { newPassword });
}

export async function deactivateUser(id: string): Promise<User> {
  const { data } = await api.patch(`/users/${id}/deactivate`);
  return data;
}

// ── Members ───────────────────────────────────
export async function listMembers(): Promise<ApiList<Member>> {
  const { data } = await api.get('/members');
  return data;
}

export async function getMember(id: string): Promise<Member> {
  const { data } = await api.get(`/members/${id}`);
  return data;
}

export interface MemberInput {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  address?: string;
  assignedLeaderId?: string;
  groupId?: string;
}

export async function createMember(input: MemberInput): Promise<Member> {
  const { data } = await api.post('/members', input);
  return data;
}

export async function updateMember(id: string, input: Partial<MemberInput>): Promise<Member> {
  const { data } = await api.patch(`/members/${id}`, input);
  return data;
}

// ── Member Reports ────────────────────────────
export async function listMemberReports(memberId: string): Promise<ApiList<MemberReport>> {
  const { data } = await api.get('/member-reports', { params: { memberId } });
  return data;
}

export interface MemberReportInput {
  memberId: string;
  statusTag: StatusTag;
  content: string;
  isConfidential?: boolean;
  isSafetyFlagged?: boolean;
}

export async function createMemberReport(input: MemberReportInput): Promise<MemberReport> {
  const { data } = await api.post('/member-reports', input);
  return data;
}

export async function redactMemberReport(id: string, redactionSummary: string): Promise<MemberReport> {
  const { data } = await api.patch(`/member-reports/${id}/redact`, { redactionSummary });
  return data;
}

export async function deleteMemberReport(id: string): Promise<{ id: string }> {
  const { data } = await api.delete(`/member-reports/${id}`);
  return data;
}

// ── Pastor Dashboard ──────────────────────────
export async function getPastorDashboard(): Promise<PastorDashboard> {
  const { data } = await api.get('/dashboard/pastor');
  return data;
}

// CSV export — returns a blob URL the caller can trigger a download from.
export async function exportMembersCsv(): Promise<Blob> {
  const { data } = await api.get('/members/export', { responseType: 'blob' });
  return data;
}

// ── Activity Log (pastor + superadmin) ────────
export async function listActivityLog(params?: {
  page?: number;
  pageSize?: number;
  action?: string;
  userId?: string;
}): Promise<ApiList<ActivityLog>> {
  const { data } = await api.get('/activity-log', { params });
  return data;
}

// ── Settings (read all; write pastor + superadmin) ──
export async function getSettings(): Promise<Record<string, string>> {
  const { data } = await api.get('/settings');
  return data.data;
}

export async function updateSetting(key: string, value: string): Promise<{ key: string; value: string }> {
  const { data } = await api.put(`/settings/${key}`, { value });
  return data;
}

// ── First-Timers ──────────────────────────────
export async function listFirstTimers(): Promise<ApiList<FirstTimer>> {
  const { data } = await api.get('/first-timers');
  return data;
}

export async function getFirstTimer(id: string): Promise<FirstTimer> {
  const { data } = await api.get(`/first-timers/${id}`);
  return data;
}

export interface FirstTimerInput {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  serviceName?: string;
  visitDate: string;
}

export async function createFirstTimer(input: FirstTimerInput): Promise<FirstTimer> {
  const { data } = await api.post('/first-timers', input);
  return data;
}

export interface BatchUploadRow {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
}
export interface BatchUploadInput {
  meetingName: string;
  visitDate: string;
  rows: BatchUploadRow[];
}
export async function uploadFirstTimersBatch(
  input: BatchUploadInput
): Promise<{ created: number; errors: { row: number; reason: string }[] }> {
  const { data } = await api.post('/first-timers/batch', input);
  return data;
}

export async function updateFirstTimer(
  id: string,
  input: Partial<FirstTimerInput> & { assignedToId?: string | null; status?: FirstTimerStatus }
): Promise<FirstTimer> {
  const { data } = await api.patch(`/first-timers/${id}`, input);
  return data;
}

export async function convertFirstTimer(
  id: string,
  input: { assignedLeaderId: string; groupId?: string }
): Promise<Member> {
  const { data } = await api.post(`/first-timers/${id}/convert`, input);
  return data;
}

// ── First-Timer Reports ───────────────────────
export async function listFirstTimerReports(firstTimerId: string): Promise<ApiList<FirstTimerReport>> {
  const { data } = await api.get('/first-timer-reports', { params: { firstTimerId } });
  return data;
}

export interface FirstTimerReportInput {
  firstTimerId: string;
  callOutcome: CallOutcome;
  content?: string;
  /** Only honoured when callOutcome is callback_requested. */
  callbackAt?: string;
}
export async function createFirstTimerReport(input: FirstTimerReportInput): Promise<FirstTimerReport> {
  const { data } = await api.post('/first-timer-reports', input);
  return data;
}

export async function getNotifications(): Promise<{ data: Notification[]; unreadCount: number }> {
  const res = await api.get('/notifications');
  return res.data;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.patch(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.patch('/notifications/read-all');
}
