import React, { createContext, useContext, useMemo, useState } from 'react';
import { authApi } from '@/api/authApi';

type AuthContextValue = {
  token: string | null;
  isAuthenticated: boolean;
  userId: string;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('qoebit_access_token'));
  const [userId, setUserId] = useState<string>(() => localStorage.getItem('qoebit_user_id') || 'web-user');

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      isAuthenticated: Boolean(token),
      userId,
      login: async (username: string, password: string) => {
        const result = await authApi.login(username, password);
        localStorage.setItem('qoebit_access_token', result.access_token);
        localStorage.setItem('qoebit_user_id', username);
        setToken(result.access_token);
        setUserId(username);
      },
      logout: () => {
        localStorage.removeItem('qoebit_access_token');
        localStorage.removeItem('qoebit_user_id');
        setToken(null);
        setUserId('web-user');
      },
    }),
    [token, userId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
