// VPS Proxy — relays HTTPS requests to HTTP VPS services
// Routes: /vps-proxy?service=kpi&path=/api/topo&...
// Services: kpi (8001), parser (8000), agent (1000)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Max-Age': '86400',
};

// Cloudflare Tunnel fallback; direct VPS is preferred because the tunnel can
// return Cloudflare 530 while the VPS services themselves are healthy.
const CF_PARSER = 'https://api.qoebit.net';
const CF_KPI = 'https://kpi.qoebit.net';
const VPS_HOST = '185.248.33.125';

const SERVICE_URLS: Record<string, string[]> = {
  parser:  [`http://${VPS_HOST}:8000`, CF_PARSER],
  agent:   [`http://${VPS_HOST}:8000`, CF_PARSER],
  kpi:     [`http://${VPS_HOST}:8001`, CF_KPI],
  ml:      [`http://${VPS_HOST}:11002`],
  agentic: [`http://${VPS_HOST}:11002`],
};

// Legacy compat
const SERVICE_PORTS: Record<string, number> = {
  kpi: 8001,
  parser: 8000,
  agent: 8000,
  ml: 11002,
  agentic: 11002,
};

// ── Topology stale-cache ──
// Survives upstream Postgres outages: GET /api/v1/topo/sites and /topo/cells
// successful 2xx responses are written to Deno KV; on upstream failure we
// serve the last good body with X-Stale-Cache + X-Stale-Age headers so the
// frontend can keep the map populated and show a "stale" badge.
const TOPO_CACHE_PATHS = new Set([
  '/api/v1/topo/sites',
  '/api/v1/topo/cells',
]);
const TOPO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let _kvPromise: Promise<Deno.Kv | null> | null = null;
function getKv(): Promise<Deno.Kv | null> {
  if (!_kvPromise) {
    _kvPromise = (Deno as any).openKv
      ? Deno.openKv().catch((e: unknown) => {
          console.warn('[vps-proxy] Deno KV unavailable:', e instanceof Error ? e.message : e);
          return null;
        })
      : Promise.resolve(null);
  }
  return _kvPromise;
}

function isTopoCacheable(method: string, service: string, path: string): boolean {
  return method === 'GET' && service === 'parser' && TOPO_CACHE_PATHS.has(path);
}

function topoCacheKey(path: string, qs: string): Deno.KvKey {
  return ['topo-cache', path, qs];
}

interface TopoCacheEntry { body: string; storedAt: number }

async function readTopoCache(path: string, qs: string): Promise<TopoCacheEntry | null> {
  const kv = await getKv();
  if (!kv) return null;
  try {
    const entry = await kv.get<TopoCacheEntry>(topoCacheKey(path, qs));
    return entry.value ?? null;
  } catch (e) {
    console.warn('[vps-proxy] KV read failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

async function writeTopoCache(path: string, qs: string, body: string): Promise<void> {
  const kv = await getKv();
  if (!kv) return;
  try {
    await kv.set(
      topoCacheKey(path, qs),
      { body, storedAt: Date.now() } as TopoCacheEntry,
      { expireIn: TOPO_CACHE_TTL_MS },
    );
  } catch (e) {
    console.warn('[vps-proxy] KV write failed:', e instanceof Error ? e.message : e);
  }
}

function isWorthCaching(body: string): boolean {
  if (!body) return false;
  if (body.includes('"unavailable":true')) return false;
  try {
    const json = JSON.parse(body);
    const sites = Array.isArray(json?.sites) ? json.sites : null;
    const cells = Array.isArray(json?.cells) ? json.cells : null;
    // Skip zero-result responses — caching "0 sites" would mask future outages
    // by replaying empty data as the "last good" snapshot.
    if (sites && cells) return sites.length > 0 || cells.length > 0;
    if (sites) return sites.length > 0;
    if (cells) return cells.length > 0;
    return true;
  } catch { return false; }
}

function staleResponse(entry: TopoCacheEntry): Response {
  const ageSec = Math.max(0, Math.round((Date.now() - entry.storedAt) / 1000));
  return new Response(entry.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'X-Stale-Cache': 'true',
      'X-Stale-Age': String(ageSec),
    },
  });
}

function buildSafeFallback(service: string, path: string, message: string) {
  const base = {
    unavailable: true,
    service,
    path,
    error: message,
    total: 0,
  };

  if (path.includes('/topo/sites')) {
    return { ...base, sites: [], cells: [], rows: [] };
  }
  if (path.includes('/topo/cells')) {
    return { ...base, cells: [], rows: [] };
  }
  if (path.includes('/filters/count') || /\/filters\/[^/]+\/count$/.test(path)) {
    return { ...base, cells: 0, sites: 0 };
  }
  if (path.includes('/qoe/metrics')) {
    return { ...base, items: [], data: [], rows: [] };
  }
  if (path.includes('/topo/distinct')) {
    return [];
  }
  if (path.includes('/topo/hierarchy')) {
    return { ...base, items: [], rows: [] };
  }
  if (service === 'ml' && path.includes('/profiles')) {
    return { ...base, profiles: [], count: 0 };
  }
  if (service === 'ml' && path.includes('/anomalies')) {
    return { ...base, items: [], total: 0, page: 1, pages: 0 };
  }

  return { ...base, items: [], data: [], rows: [] };
}

function buildSafePostFallback(service: string, path: string, message: string) {
  if (service === 'ml') {
    return { unavailable: true, service, path, error: message, queued: false, task_id: '', profile_id: null };
  }
  if (path.includes('/filters/count') || /\/filters\/[^/]+\/count$/.test(path)) {
    return buildSafeFallback(service, path, message);
  }
  if (path.includes('/cm/') || path.includes('/neighbors') || path.includes('/sentinel') || path.includes('/bi-')) {
    return { unavailable: true, service, path, error: message, items: [], data: [], rows: [], changes: [], neighbors: [], total: 0 };
  }

  return { unavailable: true, service, path, error: message, series: [], data: [], rows: [], total: 0 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const service = url.searchParams.get('service') || 'kpi';
    const path = url.searchParams.get('path') || '/health';

    console.log(`[vps-proxy] ${req.method} service=${service} path=${path}`);

    const port = SERVICE_PORTS[service];
    if (!port) {
      return new Response(JSON.stringify({ error: `Unknown service: ${service}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build target URL — try direct VPS first, then Cloudflare tunnel fallback
    const urls = SERVICE_URLS[service] || [`http://${VPS_HOST}:${port}`];
    const extraParams = new URLSearchParams();
    for (const [key, value] of url.searchParams.entries()) {
      if (key !== 'service' && key !== 'path') {
        extraParams.set(key, value);
      }
    }
    const qs = extraParams.toString();
    const buildUrl = (base: string) => {
      const u = new URL(`${base}${path}`);
      if (qs) {
        for (const [k, v] of extraParams.entries()) u.searchParams.set(k, v);
      }
      return u;
    };
    const targetUrl = buildUrl(urls[0]);

    const upstreamHeaders: Record<string, string> = {
      'Content-Type': req.headers.get('content-type') || 'application/json',
    };
    const apiKey = req.headers.get('x-api-key');
    if (apiKey) {
      upstreamHeaders['x-api-key'] = apiKey;
    }

    let body: string | undefined;
    if (!['GET', 'HEAD'].includes(req.method)) {
      try {
        body = await req.text();
        console.log(`[vps-proxy] Body size: ${(body.length / 1024).toFixed(1)} KB`);
      } catch (bodyErr) {
        console.error(`[vps-proxy] Failed to read body:`, bodyErr);
        return new Response(JSON.stringify({ error: 'Failed to read request body' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log(`[vps-proxy] Fetching: ${targetUrl.toString()}`);

    // Agent streams can take minutes (multi-round tool calls) — use generous timeout
    const isAgentPost = req.method === 'POST' && service === 'agent';
    // Heavy distinct catalogue queries (e.g. dump/params/distinct returning ~9k rows
    // from cold ClickHouse) regularly take 35-50s. Give them a longer per-attempt
    // window so the request completes instead of returning the empty-fallback.
    const isHeavyDistinct = /\/dump\/params\/distinct/.test(path);
    // Edge function hard idle limit is ~150s. Keep total wall-clock well under it
    // so we always have time to return a fallback response.
    const startedAt = Date.now();
    const TOTAL_BUDGET_MS = isAgentPost ? 290_000 : (isHeavyDistinct ? 140_000 : 130_000);
    const PER_ATTEMPT_MS  = isAgentPost ? 290_000 : (isHeavyDistinct ? 70_000  : 40_000);
    const remainingBudget = () => Math.max(0, TOTAL_BUDGET_MS - (Date.now() - startedAt));

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const tryFetch = async (u: string): Promise<Response> => {
      const attemptTimeout = Math.min(PER_ATTEMPT_MS, remainingBudget());
      return await fetch(u, {
        method: req.method,
        headers: upstreamHeaders,
        body: body ? body : undefined,
        signal: AbortSignal.timeout(attemptTimeout),
      });
    };

    // Retry transient failures (network errors, Cloudflare 52x/530, 502/503/504) with exponential backoff
    const MAX_ATTEMPTS = isAgentPost ? 1 : 2; // 2 attempts max to stay under 150s
    let upstreamRes: Response | undefined;
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Stop early if we don't have enough budget for another attempt + safety margin
      if (remainingBudget() < 5_000) {
        console.warn(`[vps-proxy] Aborting retries — budget exhausted (${remainingBudget()}ms left)`);
        break;
      }
      const baseUrl = urls[Math.min(attempt, urls.length - 1)];
      const u = buildUrl(baseUrl).toString();
      try {
        const res = await tryFetch(u);
        if (res.status === 502 || res.status === 503 || res.status === 504 || (res.status >= 520 && res.status <= 530)) {
          console.warn(`[vps-proxy] Upstream ${res.status} on attempt ${attempt + 1}/${MAX_ATTEMPTS} (${u})`);
          await res.body?.cancel().catch(() => {});
          if (attempt < MAX_ATTEMPTS - 1 && remainingBudget() > 5_000) {
            await sleep(Math.min(400 * Math.pow(2, attempt), remainingBudget() - 1_000));
            continue;
          }
          upstreamRes = res; // surface the last transient response
          break;
        }
        upstreamRes = res;
        break;
      } catch (fetchErr) {
        lastErr = fetchErr;
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        console.warn(`[vps-proxy] Fetch failed attempt ${attempt + 1}/${MAX_ATTEMPTS} (${u}): ${msg}`);
        if (attempt < MAX_ATTEMPTS - 1 && remainingBudget() > 5_000) {
          await sleep(Math.min(400 * Math.pow(2, attempt), remainingBudget() - 1_000));
        }
      }
    }
    if (!upstreamRes && lastErr) {
      console.error(`[vps-proxy] All upstreams failed:`, lastErr instanceof Error ? lastErr.message : lastErr);
    }
    // @ts-ignore - upstreamRes may be unassigned if all fetches failed
    if (!upstreamRes) {
      const msg = 'All VPS endpoints unreachable';
      console.error(`[vps-proxy] ${msg}`);

      if (isTopoCacheable(req.method, service, path)) {
        const cached = await readTopoCache(path, qs);
        if (cached) {
          console.warn(`[vps-proxy] Serving stale topo cache for ${path} (age=${Math.round((Date.now() - cached.storedAt) / 1000)}s)`);
          return staleResponse(cached);
        }
      }

      const isSafeRead = ['GET', 'HEAD'].includes(req.method) && (service === 'parser' || service === 'kpi' || service === 'ml');
      const isSafePost = req.method === 'POST' && (service === 'kpi' || service === 'parser') &&
        (path.includes('/query/') || path.includes('/summary') || path.includes('/table') || path.includes('/pm/') || path.includes('/alarms/') || path.includes('/catalog/') || path.includes('/filters/count') || /\/filters\/[^/]+\/count$/.test(path) || path.includes('/cm/') || path.includes('/neighbors') || path.includes('/sentinel') || path.includes('/bi-') || path.includes('/dashboards'));
      const isAgentPost = req.method === 'POST' && service === 'agent';
      if (isSafeRead || isSafePost) {
        const fallback = isSafePost
          ? buildSafePostFallback(service, path, msg)
          : buildSafeFallback(service, path, msg);
        return new Response(JSON.stringify(fallback), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (isAgentPost) {
        return new Response(JSON.stringify({ unavailable: true, service, path, error: `Agent service unreachable: ${msg}`, content: "Le service Agent est temporairement indisponible. Veuillez réessayer." }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: `VPS unreachable: ${msg}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[vps-proxy] Upstream responded: ${upstreamRes.status}`);

    const contentType = upstreamRes.headers.get('content-type') || 'application/json';
    const isSafeRead = ['GET', 'HEAD'].includes(req.method) && (service === 'parser' || service === 'kpi' || service === 'ml');
    const isSafePost = req.method === 'POST' && (service === 'kpi' || service === 'parser') &&
      (path.includes('/query/') || path.includes('/summary') || path.includes('/table') || path.includes('/pm/') || path.includes('/alarms/') || path.includes('/catalog/') || path.includes('/filters/count') || /\/filters\/[^/]+\/count$/.test(path) || path.includes('/cm/') || path.includes('/neighbors') || path.includes('/sentinel') || path.includes('/bi-') || path.includes('/dashboards'));
    const isSafeWrite = ['PUT', 'DELETE'].includes(req.method) && (service === 'kpi' || service === 'parser') && path.includes('/catalog/');
    const isAgentPost2 = req.method === 'POST' && service === 'agent';

    // Stream SSE responses directly (don't buffer)
    if (contentType.includes('text/event-stream') && upstreamRes.body) {
      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    const responseBody = await upstreamRes.text();

    if (!upstreamRes.ok && (isSafeRead || isSafePost || isSafeWrite)) {
      const errorSnippet = responseBody.slice(0, 300) || `HTTP ${upstreamRes.status}`;
      console.warn(`[vps-proxy] Safe fallback for upstream ${upstreamRes.status}: ${errorSnippet}`);

      if (isTopoCacheable(req.method, service, path)) {
        const cached = await readTopoCache(path, qs);
        if (cached) {
          console.warn(`[vps-proxy] Serving stale topo cache for ${path} (age=${Math.round((Date.now() - cached.storedAt) / 1000)}s)`);
          return staleResponse(cached);
        }
      }

      const fallback = (isSafePost || isSafeWrite)
        ? buildSafePostFallback(service, path, `Upstream ${upstreamRes.status}: ${errorSnippet}`)
        : buildSafeFallback(service, path, `Upstream ${upstreamRes.status}: ${errorSnippet}`);
      return new Response(JSON.stringify(fallback), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!upstreamRes.ok && isAgentPost2) {
      const errorSnippet = responseBody.slice(0, 300) || `HTTP ${upstreamRes.status}`;
      console.warn(`[vps-proxy] Agent fallback for upstream ${upstreamRes.status}: ${errorSnippet}`);
      return new Response(JSON.stringify({ unavailable: true, service, path, error: `Agent error ${upstreamRes.status}: ${errorSnippet}`, content: "Le service Agent a rencontré une erreur. Veuillez réessayer." }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (upstreamRes.ok && isTopoCacheable(req.method, service, path) && isWorthCaching(responseBody)) {
      // Fire-and-forget; don't slow the response on KV write hiccups.
      writeTopoCache(path, qs, responseBody).catch(() => {});
    }

    return new Response(responseBody, {
      status: upstreamRes.status,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[vps-proxy] Error:', message);

    const url = new URL(req.url);
    const service = url.searchParams.get('service') || 'kpi';
    const path = url.searchParams.get('path') || '/health';
    const catchExtra = new URLSearchParams();
    for (const [k, v] of url.searchParams.entries()) {
      if (k !== 'service' && k !== 'path') catchExtra.set(k, v);
    }
    const catchQs = catchExtra.toString();

    if (isTopoCacheable(req.method, service, path)) {
      const cached = await readTopoCache(path, catchQs);
      if (cached) {
        console.warn(`[vps-proxy] Serving stale topo cache (catch) for ${path} (age=${Math.round((Date.now() - cached.storedAt) / 1000)}s)`);
        return staleResponse(cached);
      }
    }

    const isSafeRead = ['GET', 'HEAD'].includes(req.method) && (service === 'parser' || service === 'kpi' || service === 'ml');
    const isSafePost = req.method === 'POST' && (service === 'kpi' || service === 'parser') &&
      (path.includes('/query/') || path.includes('/summary') || path.includes('/table') || path.includes('/pm/') || path.includes('/alarms/') || path.includes('/catalog/') || path.includes('/filters/count') || /\/filters\/[^/]+\/count$/.test(path) || path.includes('/cm/') || path.includes('/neighbors') || path.includes('/sentinel') || path.includes('/bi-'));

    if (isSafeRead || isSafePost) {
      const fallback = isSafePost
        ? buildSafePostFallback(service, path, message)
        : buildSafeFallback(service, path, message);
      return new Response(JSON.stringify(fallback), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
