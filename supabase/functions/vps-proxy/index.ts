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

    // Build target URL preserving extra query params
    const targetUrl = new URL(`http://${VPS_HOST}:${port}${path}`);
    // Forward all query params except 'service' and 'path'
    for (const [key, value] of url.searchParams.entries()) {
      if (key !== 'service' && key !== 'path') {
        targetUrl.searchParams.set(key, value);
      }
    }

    // Build headers for the upstream request
    const upstreamHeaders: Record<string, string> = {
      'Content-Type': req.headers.get('content-type') || 'application/json',
    };
    // Forward x-api-key for agent service
    const apiKey = req.headers.get('x-api-key');
    if (apiKey) {
      upstreamHeaders['x-api-key'] = apiKey;
    }

    // Forward the request
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
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
