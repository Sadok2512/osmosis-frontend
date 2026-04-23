import { getVpsProxyUrl, getVpsProxyHeaders } from '@/lib/apiConfig';

export interface AdminUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
  created_at: string;
  last_login: string | null;
}

const SESSION_KEY = 'admin_session';
const TOKEN_KEY = 'admin_token';

export function getStoredSession(): AdminUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export async function loginAdmin(username: string, password: string): Promise<AdminUser> {
  // Call VPS backend /auth/login
  const url = getVpsProxyUrl('parser', '/api/v1/auth/login');
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...getVpsProxyHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.error || 'Login failed');

  const user: AdminUser = data.user;
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
  return user;
}

export async function fetchUsers(): Promise<AdminUser[]> {
  const url = getVpsProxyUrl('parser', '/api/v1/auth/users');
  const res = await fetch(url, { headers: getVpsProxyHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
  return await res.json();
}

export async function createUser(username: string, password: string, role: string): Promise<void> {
  const url = getVpsProxyUrl('parser', '/api/v1/auth/users');
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...getVpsProxyHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.error || 'Failed to create user');
}

export async function toggleUserStatus(userId: string, newStatus: string): Promise<void> {
  const url = getVpsProxyUrl('parser', `/api/v1/auth/users/${userId}/status?status=${newStatus}`);
  const res = await fetch(url, { method: 'PUT', headers: getVpsProxyHeaders() });
  if (!res.ok) throw new Error('Failed to toggle user status');
}

export async function deleteUser(userId: string): Promise<void> {
  const url = getVpsProxyUrl('parser', `/api/v1/auth/users/${userId}`);
  const res = await fetch(url, { method: 'DELETE', headers: getVpsProxyHeaders() });
  if (!res.ok) throw new Error('Failed to delete user');
}
