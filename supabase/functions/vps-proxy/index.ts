// VPS Proxy — relays HTTPS requests to HTTP VPS services
// Routes: /vps-proxy?service=kpi&path=/api/topo&...
// Services: kpi (8001), parser (8000), agent (1000)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Cloudflare Tunnel (permanent, HTTPS) — bypasses Iran IP blocking
const CF_PARSER = 'https://api.qoebit.net';
const CF_KPI = 'https://kpi.qoebit.net';
const VPS_HOST = '151.242.147.49';

const SERVICE_URLS: Record<string, string[]> = {
  parser: [CF_PARSER, `http://${VPS_HOST}:8000`],
  agent:  [CF_PARSER, `http://${VPS_HOST}:8000`],
  kpi:    [CF_KPI, `http://${VPS_HOST}:8001`],
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

    // Build target URL — try Cloudflare tunnel first, then direct IP
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
    const fetchTimeout = isAgentPost ? 290_000 : 60_000; // 290s for agent, 60s for others

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(targetUrl.toString(), {
        method: req.method,
        headers: upstreamHeaders,
        body: body ? body : undefined,
        signal: AbortSignal.timeout(fetchTimeout),
      });
    } catch (fetchErr) {
      // Try fallback URL if available
      if (urls.length > 1) {
        const fallbackUrl = buildUrl(urls[1]);
        console.warn(`[vps-proxy] Primary failed, trying fallback: ${fallbackUrl.toString()}`);
        try {
          upstreamRes = await fetch(fallbackUrl.toString(), {
            method: req.method,
            headers: upstreamHeaders,
            body: body ? body : undefined,
            signal: AbortSignal.timeout(fetchTimeout),
          });
        } catch (fallbackErr) {
          const msg = fallbackErr instanceof Error ? fallbackErr.message : 'All endpoints failed';
          console.error(`[vps-proxy] All upstreams failed:`, msg);
          // Fall through to error handling below
        }
      }
    }
    // @ts-ignore - upstreamRes may be unassigned if all fetches failed
    if (!upstreamRes) {
      const msg = 'All VPS endpoints unreachable';
      console.error(`[vps-proxy] ${msg}`);

      const isSafeRead = ['GET', 'HEAD'].includes(req.method) && (service === 'parser' || service === 'kpi');
      const isSafePost = req.method === 'POST' && (service === 'kpi' || service === 'parser') &&
        (path.includes('/query/') || path.includes('/summary') || path.includes('/table') || path.includes('/pm/'));
      const isAgentPost = req.method === 'POST' && service === 'agent';
      if (isSafeRead || isSafePost) {
        const fallback = isSafePost
          ? { unavailable: true, service, path, error: msg, series: [], data: [], rows: [], total: 0 }
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
      (path.includes('/query/') || path.includes('/summary') || path.includes('/table') || path.includes('/pm/'));
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

    if (!upstreamRes.ok && (isSafeRead || isSafePost)) {
      const errorSnippet = responseBody.slice(0, 300) || `HTTP ${upstreamRes.status}`;
      console.warn(`[vps-proxy] Safe fallback for upstream ${upstreamRes.status}: ${errorSnippet}`);
      const fallback = isSafePost
        ? { unavailable: true, service, path, error: `Upstream ${upstreamRes.status}: ${errorSnippet}`, series: [], data: [], rows: [], total: 0 }
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
      (path.includes('/query/') || path.includes('/summary') || path.includes('/table') || path.includes('/pm/'));

    if (isSafeRead || isSafePost) {
      const fallback = isSafePost
        ? { unavailable: true, service, path, error: message, series: [], data: [], rows: [], total: 0 }
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
