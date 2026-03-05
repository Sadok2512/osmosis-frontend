import { supabase } from '@/integrations/supabase/client';

export interface AdminUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
  created_at: string;
  last_login: string | null;
}

const SESSION_KEY = 'admin_session';

export function getStoredSession(): AdminUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export async function loginAdmin(username: string, password: string): Promise<AdminUser> {
  // Call edge function for secure password verification
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-auth`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ action: 'login', username, password }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  
  const user: AdminUser = data.user;
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

export async function fetchUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('admin_users')
    .select('id, username, role, status, created_at, last_login')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as AdminUser[];
}

export async function createUser(username: string, password: string, role: string): Promise<void> {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-auth`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ action: 'create_user', username, password, role }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create user');
}

export async function toggleUserStatus(userId: string, newStatus: string): Promise<void> {
  const { error } = await supabase
    .from('admin_users')
    .update({ status: newStatus } as any)
    .eq('id', userId);
  if (error) throw error;
}

export async function deleteUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('admin_users')
    .delete()
    .eq('id', userId);
  if (error) throw error;
}
