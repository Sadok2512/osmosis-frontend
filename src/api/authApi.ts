import { request } from '@/api/httpClient';
import type { AuthTokenResponse } from '@/api/types';

export const authApi = {
  login: (username: string, password: string) =>
    request<AuthTokenResponse>('parser', 'auth/token', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
};
