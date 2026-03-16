/**
 * API URL helper — routes to VPS public services or Cloud fallback.
 *
 * VPS Services:
 *   QOEBIT Parser  → http://151.242.147.49:8000
 *   KPI Engine     → http://151.242.147.49:8001
 *   Agent Layer    → http://151.242.147.49:1000
 *
 * Source selection priority:
 * 1) URL query param: ?source=local|cloud
 * 2) localStorage key: qoebit_data_source
 * 3) Default: VPS (remote)
 */

const VPS_HOST = '151.242.147.49';

export const VPS_ENDPOINTS = {
  parser:  `http://${VPS_HOST}:8000`,   // QOEBIT Parser
  kpi:     `http://${VPS_HOST}:8001`,   // KPI Engine
  agent:   `http://${VPS_HOST}:1000`,   // Agent Layer
} as const;

const LOCAL_API_ENV = import.meta.env.VITE_LOCAL_API;
const DEFAULT_LOCAL_API = 'http://localhost:3001';
const DATA_SOURCE_KEY = 'qoebit_data_source';

type DataSource = 'local' | 'cloud' | 'vps';

const isDataSource = (value: string | null): value is DataSource =>
  value === 'local' || value === 'cloud' || value === 'vps';

const isBrowserRunningLocally = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return true;
  if (host.endsWith('.local') || host.startsWith('192.168.') || host.startsWith('10.')) return true;
  const private172 = host.match(/^172\.(\d{1,3})\./);
  if (private172) {
    const octet = Number(private172[1]);
    return octet >= 16 && octet <= 31;
  }
  return false;
};

const getLocalApiBase = (): string => LOCAL_API_ENV || DEFAULT_LOCAL_API;

export const getPreferredDataSource = (): DataSource => {
  if (typeof window === 'undefined') return 'vps';
  const urlParams = new URLSearchParams(window.location.search);
  const urlSource = urlParams.get('source');
  if (isDataSource(urlSource)) return urlSource;
  const stored = window.localStorage.getItem(DATA_SOURCE_KEY);
  if (isDataSource(stored)) return stored;
  // Default: use VPS when deployed, local when running locally
  return isBrowserRunningLocally() ? 'local' : 'vps';
};

export const setPreferredDataSource = (source: DataSource): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DATA_SOURCE_KEY, source);
};

export const isLocalMode = (): boolean => getPreferredDataSource() === 'local';
export const isVpsMode = (): boolean => getPreferredDataSource() === 'vps';

/**
 * Get the base URL for an edge function / API endpoint.
 * - local  → http://localhost:3001/api/{name}
 * - vps    → http://151.242.147.49:8001/api/{name}  (KPI Engine default)
 * - cloud  → https://xxx.supabase.co/functions/v1/{name}
 */
export function getApiUrl(functionName: string): string {
  const clean = functionName.replace(/^\/?(api\/)?/, '');
  const source = getPreferredDataSource();
  if (source === 'local') {
    return `${getLocalApiBase()}/api/${clean}`;
  }
  if (source === 'vps') {
    return `${VPS_ENDPOINTS.kpi}/${clean}`;
  }
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${clean}`;
}

/**
 * Get URL for a specific VPS service.
 */
export function getVpsUrl(service: keyof typeof VPS_ENDPOINTS, path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${VPS_ENDPOINTS[service]}${cleanPath}`;
}

/**
 * Get auth headers for API calls.
 */
export function getApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const source = getPreferredDataSource();
  if (source === 'cloud') {
    headers['Authorization'] = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;
  }
  return headers;
}

/**
 * Get auth headers for Agent Layer calls.
 */
export function getAgentHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': 'agent_secret_key',
  };
}
