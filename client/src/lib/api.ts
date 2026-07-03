import axios from 'axios';
import type { ApiList, AuthUser, User, UserRole } from '../types';

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
