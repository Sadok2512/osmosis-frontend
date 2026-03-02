/**
 * API URL helper — switches between Lovable Cloud and local Express server.
 *
 * Source selection priority:
 * 1) URL query param: ?source=local|cloud
 * 2) localStorage key: qoebit_data_source
 * 3) Auto-detect localhost/LAN => local, otherwise cloud
 */

const LOCAL_API_ENV = import.meta.env.VITE_LOCAL_API;
const DEFAULT_LOCAL_API = 'http://localhost:3001';
const DATA_SOURCE_KEY = 'qoebit_data_source';

type DataSource = 'local' | 'cloud';

const isBrowserRunningLocally = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;

  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
    return true;
  }

  if (host.endsWith('.local') || host.startsWith('192.168.') || host.startsWith('10.')) {
    return true;
  }

  const private172 = host.match(/^172\.(\d{1,3})\./);
  if (private172) {
    const octet = Number(private172[1]);
    return octet >= 16 && octet <= 31;
  }

  return false;
};

const isDataSource = (value: string | null): value is DataSource => value === 'local' || value === 'cloud';

const getLocalApiBase = (): string => LOCAL_API_ENV || DEFAULT_LOCAL_API;

export const getPreferredDataSource = (): DataSource => {
  if (typeof window === 'undefined') return 'local';
  const urlParams = new URLSearchParams(window.location.search);
  const urlSource = urlParams.get('source');
  if (isDataSource(urlSource)) return urlSource;
  const stored = window.localStorage.getItem(DATA_SOURCE_KEY);
  if (isDataSource(stored)) return stored;
  return isBrowserRunningLocally() ? 'local' : 'cloud';
};

export const setPreferredDataSource = (source: DataSource): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DATA_SOURCE_KEY, source);
};

export const isLocalMode = (): boolean => getPreferredDataSource() === 'local';

/**
 * Get the base URL for an edge function / API endpoint.
 * In cloud mode: https://xxx.supabase.co/functions/v1/{name}
 * In local mode: http://localhost:3001/api/{name}
 */
export function getApiUrl(functionName: string): string {
  const clean = functionName.replace(/^\/?(api\/)?/, '');
  if (isLocalMode()) {
    return `${getLocalApiBase()}/api/${clean}`;
  }
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${clean}`;
}

/**
 * Get auth headers for API calls.
 * In cloud mode: includes Bearer token.
 * In local mode: no auth needed.
 */
export function getApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (!isLocalMode()) {
    headers['Authorization'] = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;
  }
  return headers;
}

