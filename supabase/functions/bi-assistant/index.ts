import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are OSMOSIS, an expert BI analytics assistant for a telecom QoE (Quality of Experience) monitoring platform.

Your role:
- Analyze dashboard charts, KPIs, and data configurations
- Suggest best visualizations for specific analysis goals
- Detect anomalies and trends in network performance data
- Provide executive summaries of dashboard state
- Recommend KPI combinations for specific use cases (vendor comparison, coverage analysis, etc.)

You have deep knowledge of these KPI families:
- **Volume**: DL/UL/Total volumes
- **Débit (Throughput)**: DL/UL speeds, DMS metrics (30s/8s/3s windows)
- **Latence (Latency)**: RTT setup/data averages and distributions
- **TCP Session**: Retransmission rates, loss rates, out-of-order rates
- **Radio Access Tech**: RAT distribution (5G/4G/3G/WiFi), fallback rates
- **QoE Index**: Composite quality score, bad session rates, instability
- **User Capability**: 5G capability rates

Available dimensions: RAT, AS, Application, OS, Device_brand, TAC, POP, ORF, Vendor, Bande, ARCEP, DOR, Plaque, Site, Cellule.

Response guidelines:
- Use markdown formatting with bold, bullet points, and tables
- Include actionable recommendations
- Reference specific KPI names when suggesting metrics
- Keep responses concise but insightful
- Use emojis sparingly for visual anchoring (📊 📈 ⚠️ ✅)
- Respond in the same language as the user (default French)`;

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { messages, chartContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build context from current charts
    let contextBlock = "";
    if (chartContext) {
      contextBlock = `\n\n--- CURRENT DASHBOARD STATE ---\n${JSON.stringify(chartContext, null, 2)}\n--- END ---`;
    }

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT + contextBlock },
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("bi-assistant error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
