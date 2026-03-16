// VPS Proxy — relays HTTPS requests to HTTP VPS services
// Routes: /vps-proxy?service=kpi&path=/api/topo&...
// Services: kpi (8001), parser (8000), agent (1000)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const VPS_HOST = '151.242.147.49';
const SERVICE_PORTS: Record<string, number> = {
  kpi: 8001,
  parser: 8000,
  agent: 1000,
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

    const port = SERVICE_PORTS[service];
    if (!port) {
      return new Response(JSON.stringify({ error: `Unknown service: ${service}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetUrl = new URL(`http://${VPS_HOST}:${port}${path}`);
    for (const [key, value] of url.searchParams.entries()) {
      if (key !== 'service' && key !== 'path') {
        targetUrl.searchParams.set(key, value);
      }
    }

    const upstreamHeaders: Record<string, string> = {
      'Content-Type': req.headers.get('content-type') || 'application/json',
    };
    const apiKey = req.headers.get('x-api-key');
    if (apiKey) {
      upstreamHeaders['x-api-key'] = apiKey;
    }

    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text();

    const upstreamRes = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: upstreamHeaders,
      body,
    });

    const responseBody = await upstreamRes.text();

    return new Response(responseBody, {
      status: upstreamRes.status,
      headers: {
        ...corsHeaders,
        'Content-Type': upstreamRes.headers.get('content-type') || 'application/json',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[vps-proxy] Error:', message);

    const url = new URL(req.url);
    const service = url.searchParams.get('service') || 'kpi';
    const path = url.searchParams.get('path') || '/health';
    const isSafeRead = ['GET', 'HEAD'].includes(req.method) && (service === 'parser' || service === 'kpi');

    if (isSafeRead) {
      return new Response(JSON.stringify(buildSafeFallback(service, path, message)), {
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
