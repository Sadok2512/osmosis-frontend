/**
 * API URL helper — routes through VPS proxy edge function (HTTPS→HTTP relay).
 *
 * VPS Services:
 *   QOEBIT Parser  → http://151.242.147.49:8000
 *   KPI Engine     → http://151.242.147.49:8001
 *   Agent Layer    → http://151.242.147.49:1000
 *
 * All calls go through the vps-proxy edge function to avoid mixed-content blocking.
 */

const VPS_HOST = '151.242.147.49';

// Cloudflare Tunnel endpoints (HTTPS, works from anywhere)
const CF_PARSER = 'https://api.qoebit.net';
const CF_KPI = 'https://kpi.qoebit.net';

// Detect if we're on the Cloudflare tunnel domain
const isOnTunnel = typeof window !== 'undefined' && (
  window.location.hostname === 'app.qoebit.net' ||
  window.location.hostname.endsWith('.qoebit.net')
);

export const VPS_ENDPOINTS = {
  parser:  isOnTunnel ? CF_PARSER : `http://${VPS_HOST}:8000`,
  kpi:     isOnTunnel ? CF_KPI : `http://${VPS_HOST}:8001`,
  agent:   isOnTunnel ? CF_PARSER : `http://${VPS_HOST}:8000`,
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
  return isBrowserRunningLocally() ? 'local' : 'vps';
};

export const setPreferredDataSource = (source: DataSource): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DATA_SOURCE_KEY, source);
};

export const isLocalMode = (): boolean => getPreferredDataSource() === 'local';
export const isVpsMode = (): boolean => getPreferredDataSource() === 'vps';

// ── VPS Proxy via Edge Function ──

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'nmblfljpqiyxayaswmwn';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

/**
 * Build a URL that goes through the vps-proxy edge function.
 * @param service - 'kpi' | 'parser' | 'agent'
 * @param path - e.g. '/api/topo' or '/health'
 * @param extraParams - additional query params to forward
 */
export function getVpsProxyUrl(
  service: keyof typeof VPS_ENDPOINTS,
  path: string,
  extraParams?: Record<string, string>,
): string {
  // Direct VPS mode: skip proxy when browser is on VPS
  const onVps = typeof window !== 'undefined' && window.location.hostname === VPS_HOST;
  if (onVps) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const ep = VPS_ENDPOINTS[service];
    const params = new URLSearchParams(extraParams || {});
    const qs = params.toString();
    return `${ep}${cleanPath}${qs ? (cleanPath.includes('?') ? '&' : '?') + qs : ''}`;
  }
  const base = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/vps-proxy`;
  const params = new URLSearchParams();
  params.set('service', service);
  params.set('path', path.startsWith('/') ? path : `/${path}`);
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      params.set(k, v);
    }
  }
  return `${base}?${params}`;
}

/**
 * Headers for calling the vps-proxy edge function.
 */
export function getVpsProxyHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    ...extraHeaders,
  };
}

/**
 * Get the base URL for an edge function / API endpoint.
 */
export function getApiUrl(functionName: string): string {
  const clean = functionName.replace(/^\/?(api\/)?/, '');
  const source = getPreferredDataSource();
  if (source === 'local') {
    return `${getLocalApiBase()}/api/${clean}`;
  }
  if (source === 'vps') {
    // Cloud-only Edge Functions — always route to Supabase Cloud
    const cloudOnlyFunctions = ['qoe-assistant', 'bi-assistant', 'agent-discussion', 'rag-embed', 'qoe-map-extract', 'admin-auth', 'backend-admin', 'import-dump', 'import-topo'];
    const isCloudOnly = cloudOnlyFunctions.some(f => clean.startsWith(f));
    if (isCloudOnly) {
      return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${clean}`;
    }
    // When browser is on the VPS itself, call services directly (no proxy needed)
    const onVps = typeof window !== 'undefined' && (
      window.location.hostname === VPS_HOST ||
      window.location.hostname.endsWith('.qoebit.net')
    );

    // KPI Engine endpoints → :8001
    const kpiPrefixes = ['monitor', 'catalog', 'kpi/', 'anomalies', 'clusters', 'config/aggregation', 'config/jobs', 'config/ne-scope', 'config/quality', 'config/stats', 'internal/'];
    const isKpi = kpiPrefixes.some(p => clean.startsWith(p));
    if (isKpi) {
      return onVps ? `${VPS_ENDPOINTS.kpi}/${clean}` : getVpsProxyUrl('kpi', `/${clean}`);
    }
    // Parser endpoints → :8000
    const parserPrefixes = ['topo', 'qoe-map', 'qoe-metrics', 'dump-parameter', 'parameter-changes', 'bi-query', 'bi-distinct', 'bi-date-range', 'sentinel', 'alarms', 'cm', 'pm'];
    const isParser = parserPrefixes.some(p => clean.startsWith(p));
    if (isParser) {
      return onVps ? `${VPS_ENDPOINTS.parser}/api/v1/${clean}` : getVpsProxyUrl('parser', `/api/v1/${clean}`);
    }
    return onVps ? `${VPS_ENDPOINTS.kpi}/${clean}` : getVpsProxyUrl('kpi', `/${clean}`);
  }
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${clean}`;
}

/**
 * Get URL for a specific VPS service (direct — use only from local).
 */
export function getVpsUrl(service: keyof typeof VPS_ENDPOINTS, path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${VPS_ENDPOINTS[service]}${cleanPath}`;
}

/**
 * Get auth headers for API calls.
 */
export function getApiHeaders(): Record<string, string> {
  const source = getPreferredDataSource();
  if (source === 'vps') {
    // Direct VPS mode: simple headers (no proxy auth needed)
    const onVps = typeof window !== 'undefined' && (
      window.location.hostname === VPS_HOST ||
      window.location.hostname.endsWith('.qoebit.net')
    );
    if (onVps) {
      return { 'Content-Type': 'application/json' };
    }
    return getVpsProxyHeaders();
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (source === 'cloud') {
    headers['Authorization'] = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;
  }
  return headers;
}

/**
 * Get auth headers for Agent Layer calls (through proxy).
 */
export function getAgentHeaders(): Record<string, string> {
  const source = getPreferredDataSource();
  if (source === 'vps') {
    return {
      ...getVpsProxyHeaders(),
      'x-api-key': 'agent_secret_key',
    };
  }
  return {
    'Content-Type': 'application/json',
    'x-api-key': 'agent_secret_key',
  };
}
