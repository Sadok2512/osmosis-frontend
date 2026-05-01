// VPS Proxy — relays HTTPS requests to HTTP VPS services
// Routes: /vps-proxy?service=kpi&path=/api/topo&...
// Services: kpi (8001), parser (8000), agent (1000)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Cloudflare Tunnel fallback; direct VPS is preferred because the tunnel can
// return Cloudflare 530 while the VPS services themselves are healthy.
const CF_PARSER = 'https://api.qoebit.net';
const CF_KPI = 'https://kpi.qoebit.net';
const VPS_HOST = '185.248.33.125';

const SERVICE_URLS: Record<string, string[]> = {
  parser: [`http://${VPS_HOST}:8000`, CF_PARSER],
  agent:  [`http://${VPS_HOST}:8000`, CF_PARSER],
  kpi:    [`http://${VPS_HOST}:8001`, CF_KPI],
};

// Legacy compat
const SERVICE_PORTS: Record<string, number> = {
  kpi: 8001,
  parser: 8000,
  agent: 8000,
};

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

  return { ...base, items: [], data: [], rows: [] };
}

function buildSafePostFallback(service: string, path: string, message: string) {
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

      const isSafeRead = ['GET', 'HEAD'].includes(req.method) && (service === 'parser' || service === 'kpi');
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
    const isSafeRead = ['GET', 'HEAD'].includes(req.method) && (service === 'parser' || service === 'kpi');
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
    const isSafeRead = ['GET', 'HEAD'].includes(req.method) && (service === 'parser' || service === 'kpi');
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
