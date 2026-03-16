import { env } from '@/lib/env';

export type ServiceName = 'parser' | 'kpi' | 'agent';

const serviceBaseMap: Record<ServiceName, string> = {
  parser: env.parserApiBase,
  kpi: env.kpiApiBase,
  agent: env.agentApiBase,
};

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function buildUrl(base: string, path: string, params?: Record<string, unknown>) {
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : (payload as Record<string, unknown>)?.message || response.statusText;
    throw new ApiError(String(message), response.status, payload);
  }

  return payload as T;
}

export async function request<T>(service: ServiceName, path: string, options?: RequestInit & { params?: Record<string, unknown> }) {
  const token = localStorage.getItem('qoebit_access_token');
  const base = serviceBaseMap[service];
  const url = buildUrl(base, path, options?.params);
  const headers = new Headers(options?.headers || {});

  if (!(options?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (service === 'agent' && env.agentApiKey && !headers.has('x-api-key')) {
    headers.set('x-api-key', env.agentApiKey);
  }

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });

  return parseResponse<T>(response);
}
