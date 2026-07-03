import axios from 'axios';
import type { ActivityLog, ApiList, AuthUser, Member, MemberReport, StatusTag, User, UserRole } from '../types';

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
