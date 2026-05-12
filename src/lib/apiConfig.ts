/**
 * API URL helper — routes through VPS proxy edge function (HTTPS→HTTP relay).
 *
 * VPS Services:
 *   OSMOSIS Parser  → http://185.248.33.125:8000
 *   KPI Engine     → http://185.248.33.125:8001
 *   Agent Layer    → http://185.248.33.125:1000
 *
 * All calls go through the vps-proxy edge function to avoid mixed-content blocking.
 */

const VPS_HOST = import.meta.env.VITE_VPS_HOST || 'localhost';
if (VPS_HOST === 'localhost') console.warn('[apiConfig] VITE_VPS_HOST not set — VPS mode will use localhost');

// Detect hosting context: app.qoebit.net serves frontend + API from same origin via nginx
const isOnAppDomain = typeof window !== 'undefined' && (
  window.location.hostname === 'app.qoebit.net' ||
  window.location.hostname === 'app.osmosis.net' ||
  window.location.hostname === VPS_HOST ||
  window.location.hostname === '185.248.33.125'
);

// Cloudflare Tunnel endpoints (legacy — separate domains per service)
const CF_PARSER = 'https://api.qoebit.net';
const CF_KPI = 'https://kpi.qoebit.net';
// ml-engine off-domain fallback. No dedicated CF tunnel yet — when one
// is provisioned, set CF_ML to e.g. 'https://ml.qoebit.net'. Until then
// the off-domain branch returns the empty string which forces callers
// to handle the missing-tunnel case gracefully.
const CF_ML = '';

// On app.qoebit.net: use same-origin relative paths (nginx proxies /api/ and /kpi-api/)
// On VPS IP: same-origin
// Elsewhere: use Cloudflare tunnels
export const VPS_ENDPOINTS = {
  parser:  isOnAppDomain ? '' : CF_PARSER,                       // same-origin: /api/v1/... works directly
  kpi:     isOnAppDomain ? '/kpi-api' : CF_KPI,                  // same-origin: /kpi-api/... proxied by nginx
  // Agent off-domain: route through the parser's /api/v1/agent/* router
  // (app.api.v1.endpoints.agent_proxy) which forwards to the agent service
  // at AGENT_URL (default http://127.0.0.1:1000 on the VPS, set to 11000
  // on Back100). Direct hits to /orchestrator/stream on api.qoebit.net
  // returned 404 because the parser only mounts the orchestrator route
  // under that prefix, not at root.
  agent:   isOnAppDomain ? '/agent-api' : `${CF_PARSER}/api/v1/agent`,
  // ml-engine extracted from parser on 2026-05-10. On-VPS calls go
  // through the spa-proxy at /ml-api/* → :11002. Off-domain has no
  // tunnel yet — callers should expect empty string when CF_ML is unset.
  ml:      isOnAppDomain ? '/ml-api' : CF_ML,
  // agentic-engine — closed-loop orchestration over the 6 OSMOSIS agents.
  // Phase 1 (2026-05-12): auto-RCA from ML anomalies. On-VPS calls go
  // through /agentic-api/* → :11003. Off-domain has no tunnel yet.
  agentic: isOnAppDomain ? '/agentic-api' : CF_ML,
} as const;

// Local Express server retired 2026-05-08 (was qoebit-frontend/server,
// port :3001). Production never used it; the local-mode branches of
// getApiUrl/getPreferredDataSource now degrade to VPS so a stale
// localStorage `osmosis_data_source=local` doesn't break the app.
const DATA_SOURCE_KEY = 'osmosis_data_source';

/** Default request timeout (30s) */
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Log a backend request with the originating widget name.
 * Format: [Backend][WidgetName] METHOD url  body=…
 * Use in any component that issues a fetch towards the VPS / KPI Engine.
 */
export function logBackendRequest(
  widgetName: string,
  method: string,
  url: string,
  body?: unknown,
): void {
  try {
    const safeBody = body === undefined
      ? undefined
      : (typeof body === 'string' ? body : JSON.stringify(body));
    // eslint-disable-next-line no-console
    console.log(
      `%c[Backend][${widgetName}]%c ${method} ${url}`,
      'color:#0E7C66;font-weight:600',
      'color:inherit',
      safeBody ? { body: safeBody.length > 2000 ? safeBody.slice(0, 2000) + '…' : safeBody } : '',
    );
  } catch {
    // ignore logging failures
  }
  // Also push to the in-app live log panel.
  try {
    const safeBodyForLog = body === undefined
      ? undefined
      : (typeof body === 'string' ? body : JSON.stringify(body));
    // Lazy import to avoid circular deps at module init.
    import('./backendRequestLog').then(m =>
      m.pushBackendRequestEntry(widgetName, method, url, safeBodyForLog),
    );
  } catch {
    // ignore
  }
}

// ── Global fetch interceptor: captures the response body for any URL that
//    was logged via logBackendRequest, so the BackendRequestDialog can show
//    request + response without modifying every call site.
if (typeof window !== 'undefined' && !(window as unknown as { __vpsFetchPatched?: boolean }).__vpsFetchPatched) {
  (window as unknown as { __vpsFetchPatched?: boolean }).__vpsFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL ? input.toString() : (input as Request).url;
    let res: Response;
    try {
      res = await originalFetch(input as RequestInfo, init);
    } catch (err: unknown) {
      try {
        const m = await import('./backendRequestLog');
        m.attachResponseToLatest(url, undefined, undefined, err instanceof Error ? err.message : String(err));
      } catch { /* ignore */ }
      throw err;
    }
    // Clone so the original consumer is unaffected.
    try {
      const clone = res.clone();
      clone.text().then(text => {
        import('./backendRequestLog').then(m => {
          m.attachResponseToLatest(url, res.status, text);
        }).catch(() => { /* ignore */ });
      }).catch(() => { /* ignore */ });
    } catch { /* ignore */ }
    return res;
  };
}

/** Agent API key from env */
export const AGENT_API_KEY = import.meta.env.VITE_AGENT_API_KEY || '';

type DataSource = 'local' | 'cloud' | 'vps';

const isDataSource = (value: string | null): value is DataSource =>
  value === 'local' || value === 'cloud' || value === 'vps';

export const getPreferredDataSource = (): DataSource => {
  if (typeof window === 'undefined') return 'vps';
  const urlParams = new URLSearchParams(window.location.search);
  const urlSource = urlParams.get('source');
  if (isDataSource(urlSource)) return urlSource;
  const stored = window.localStorage.getItem(DATA_SOURCE_KEY);
  if (isDataSource(stored)) return stored;
  // Default = vps for everyone now. The previous LAN/loopback heuristic
  // routed to the local Express server which was deleted 2026-05-08.
  return 'vps';
};

export const setPreferredDataSource = (source: DataSource): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DATA_SOURCE_KEY, source);
};

export const isLocalMode = (): boolean => getPreferredDataSource() === 'local';
export const isVpsMode = (): boolean => getPreferredDataSource() === 'vps';

// ── VPS Proxy via Edge Function ──

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
if (!SUPABASE_PROJECT_ID) console.error('[apiConfig] VITE_SUPABASE_PROJECT_ID is required but not set');
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
  // Separate query params embedded in path to avoid BOOT_ERROR in edge functions
  let cleanPath = path.startsWith('/') ? path : `/${path}`;
  const mergedExtra: Record<string, string> = { ...(extraParams || {}) };
  const qIdx = cleanPath.indexOf('?');
  if (qIdx >= 0) {
    new URLSearchParams(cleanPath.slice(qIdx + 1)).forEach((v, k) => {
      if (!mergedExtra[k]) mergedExtra[k] = v;
    });
    cleanPath = cleanPath.slice(0, qIdx);
  }

  // Direct mode: skip proxy when browser is on VPS or Cloudflare tunnel
  const onDirect = typeof window !== 'undefined' && (
    window.location.hostname === VPS_HOST ||
    window.location.hostname.endsWith('.qoebit.net') ||
    window.location.hostname.endsWith('.osmosis.net')
  );
  if (onDirect) {
    const ep = VPS_ENDPOINTS[service];
    const params = new URLSearchParams(mergedExtra);
    const qs = params.toString();
    return `${ep}${cleanPath}${qs ? '?' + qs : ''}`;
  }
  const base = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/vps-proxy`;
  const params = new URLSearchParams();
  params.set('service', service);
  params.set('path', cleanPath);
  for (const [k, v] of Object.entries(mergedExtra)) {
    params.set(k, v);
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
  const clean = functionName.replace(/^\/?(api\/)?(v\d+\/)?/, '');
  // 'local' source falls through to 'vps' since the Express server is gone.
  const source = getPreferredDataSource();
  if (source === 'vps' || source === 'local') {
    // Separate path from inline query string to avoid double-encoding in proxy URL
    const qIdx = clean.indexOf('?');
    const cleanPath = qIdx >= 0 ? clean.substring(0, qIdx) : clean;
    const inlineQs = qIdx >= 0 ? clean.substring(qIdx + 1) : '';
    const extraParams: Record<string, string> = {};
    if (inlineQs) {
      for (const [k, v] of new URLSearchParams(inlineQs).entries()) {
        extraParams[k] = v;
      }
    }

    // Cloud-only Edge Functions — always route to Supabase Cloud
    const cloudOnlyFunctions = ['qoe-assistant', 'bi-assistant', 'agent-discussion', 'rag-embed', 'qoe-map-extract', 'admin-auth', 'backend-admin', 'import-dump', 'import-topo'];
    const isCloudOnly = cloudOnlyFunctions.some(f => cleanPath.startsWith(f));
    if (isCloudOnly) {
      return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${clean}`;
    }
    // When browser is on the VPS or on a Cloudflare tunnel domain, call services directly
    const onDirect = typeof window !== 'undefined' && (
      window.location.hostname === VPS_HOST ||
      window.location.hostname.endsWith('.qoebit.net') ||
      window.location.hostname.endsWith('.osmosis.net')
    );

    // KPI Engine endpoints → kpi.osmosis.net (or :8001 on VPS)
    const kpiPrefixes = ['monitor', 'catalog', 'kpi/', 'anomalies', 'clusters', 'config/aggregation', 'config/jobs', 'config/ne-scope', 'config/quality', 'config/stats', 'internal/'];
    const isKpi = kpiPrefixes.some(p => cleanPath.startsWith(p));
    if (isKpi) {
      return onDirect ? `${VPS_ENDPOINTS.kpi}/${clean}` : getVpsProxyUrl('kpi', `/${cleanPath}`, Object.keys(extraParams).length ? extraParams : undefined);
    }
    // Parser endpoints → api.osmosis.net/api/v1/* (or :8000 on VPS)
    const parserPrefixes = ['topo', 'config/topo', 'qoe-map', 'qoe-metrics', 'dump-parameter', 'dump', 'parameter-changes', 'bi-query', 'bi-distinct', 'bi-date-range', 'bi-catalog', 'sentinel', 'alarms', 'cm', 'pm', 'neighbors', 'filters', 'agent'];
    const isParser = parserPrefixes.some(p => cleanPath.startsWith(p));
    if (isParser) {
      return onDirect ? `${VPS_ENDPOINTS.parser}/api/v1/${clean}` : getVpsProxyUrl('parser', `/api/v1/${cleanPath}`, Object.keys(extraParams).length ? extraParams : undefined);
    }
    return onDirect ? `${VPS_ENDPOINTS.kpi}/${clean}` : getVpsProxyUrl('kpi', `/${cleanPath}`, Object.keys(extraParams).length ? extraParams : undefined);
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
    // Direct mode: simple headers when on VPS or Cloudflare tunnel (no proxy auth needed)
    const onDirect = typeof window !== 'undefined' && (
      window.location.hostname === VPS_HOST ||
      window.location.hostname.endsWith('.qoebit.net') ||
      window.location.hostname.endsWith('.osmosis.net')
    );
    if (onDirect) {
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
      'x-api-key': AGENT_API_KEY,
    };
  }
  return {
    'Content-Type': 'application/json',
    'x-api-key': AGENT_API_KEY,
  };
}

/**
 * Fetch with timeout — wraps native fetch with AbortSignal.timeout.
 * @param input - fetch input (URL or Request)
 * @param init - fetch init options (signal is merged, not overwritten)
 * @param timeoutMs - timeout in milliseconds (default: REQUEST_TIMEOUT_MS)
 */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Merge with existing signal if provided
  if (init?.signal) {
    init.signal.addEventListener('abort', () => controller.abort());
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

/**
 * Fetch with automatic retry on transient edge function cold-start errors
 * (503 BOOT_ERROR / WORKER_LIMIT). Retries up to `maxRetries` times with
 * exponential backoff. Use for any call that goes through the vps-proxy
 * edge function.
 */
export async function fetchVpsWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: { maxRetries?: number; timeoutMs?: number; baseDelayMs?: number } = {},
): Promise<Response> {
  const { maxRetries = 2, timeoutMs = REQUEST_TIMEOUT_MS, baseDelayMs = 400 } = options;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(input, init, timeoutMs);
      if (res.status === 503 && attempt < maxRetries) {
        const text = await res.clone().text().catch(() => '');
        if (/BOOT_ERROR|WORKER_LIMIT|please check logs/i.test(text)) {
          await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
          continue;
        }
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetchVpsWithRetry failed');
}
