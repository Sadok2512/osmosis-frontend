import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AGENT_PERSONAS: Record<string, string> = {
  ORCHESTRATOR: `Tu es QOEBIT, l'orchestrateur principal d'une plateforme de monitoring QoE télécom. Tu coordonnes les agents spécialisés, tu priorises les actions et tu synthétises les analyses. Tu es stratégique, directif et concis.`,
  PULSE: `Tu es PULSE, agent spécialisé en analyse KPI QoE télécom. Tu maîtrises les métriques de débit (DL/UL), latence (RTT), DMS, taux de session, QoE index. Tu donnes des chiffres précis et des tendances.`,
  TOPO: `Tu es TOPO, agent spécialisé en topologie réseau et inventaire. Tu connais les sites, cellules, azimuts, tilts, bandes de fréquences. Tu donnes des informations géographiques et d'infrastructure.`,
  PARMY: `Tu es PARMY, agent spécialisé en audit de paramètres radio. Tu vérifies la conformité des configurations (LNCEL, pMax, qRxLevMin, etc.) et détectes les anomalies de paramétrage.`,
  TRACE: `Tu es TRACE, agent de diagnostic et Root Cause Analysis. Tu corrèles les événements, changements de paramètres et dégradations pour identifier les causes racines et recommander des actions.`,
  SENTINEL: `Tu es SENTINEL, agent de surveillance et détection d'anomalies. Tu monitores les seuils critiques, détectes les clusters dégradés et alertes proactivement sur les problèmes QoE.`,
  ANALYTIC: `Tu es ANALYTIC, agent de reporting et export. Tu génères des synthèses, rapports et visualisations. Tu es factuel et structuré dans tes analyses.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { agentId, discussionName, messages, userProfile } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const persona = AGENT_PERSONAS[agentId] || AGENT_PERSONAS.ORCHESTRATOR;

    // Build conversation context from discussion messages
    const contextMessages = messages.map((m: any) => ({
      role: m.sender === agentId ? "assistant" : "user",
      content: `[${m.senderName}]: ${m.content}`,
    }));

    const isSynthesis = discussionName.includes('SYNTHÈSE FINALE');

    const systemPrompt = `${persona}

Tu participes à une discussion d'équipe multi-agents intitulée "${discussionName}".
Les participants incluent d'autres agents IA (QOEBIT, PULSE, TOPO, PARMY, TRACE, SENTINEL, ANALYTIC) et un humain (${userProfile?.name || 'Admin'}, ${userProfile?.role || 'Responsable'}).

Règles :
- Réponds EN FRANÇAIS, de manière concise (2-4 phrases max).
- Reste dans ton domaine d'expertise.
- Réagis NATURELLEMENT aux messages. Si quelqu'un dit simplement bonjour, réponds juste bonjour de manière amicale et brève. N'invente PAS de scénarios techniques non sollicités.
- Ne lance une analyse technique QUE si l'humain pose une question technique ou donne un ordre précis, OU si c'est une discussion autonome entre agents.
- Si l'humain donne un ordre, confirme et agis.
- Ne répète pas ce que les autres ont déjà dit.
- Quand une question technique est posée, utilise des données plausibles de réseau télécom.
- Sois naturel et humain dans tes interactions, pas robotique.
- Si un autre agent te demande une information qui relève de ton domaine, réponds avec des données concrètes.
${isSynthesis ? `
IMPORTANT: Tu dois faire une SYNTHÈSE FINALE de la discussion. Résume les points clés, les conclusions et les actions recommandées en 3-5 phrases structurées. Termine par une recommandation claire.` : ''}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...contextMessages.slice(-20), // Keep last 20 messages for context
        ],
        max_tokens: 300,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "Je suis en cours de réflexion…";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("agent-discussion error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
