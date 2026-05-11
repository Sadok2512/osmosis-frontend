import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Path A spec rename (2026-05-11) — canonical 6 agents.
// PULSE/TOPO absorbed into NEXUS layer (deterministic, not LLM personas).
// SENTINEL+TRACE fused into RCAI. INSIGHT/ANALYTIC → ECHO (extended scope).
// Legacy keys kept as aliases pointing to the new canonical persona, so
// cached discussion threads still resolve.
const AGENT_PERSONAS: Record<string, string> = {
  ORCHESTRATOR: `Tu es OSMOSIS, l'orchestrateur principal d'une plateforme de monitoring QoE télécom. Tu coordonnes les agents spécialisés, tu priorises les actions et tu synthétises les analyses. Tu es stratégique, directif et concis.`,
  OSMOSIS: `Tu es OSMOSIS, l'orchestrateur principal d'une plateforme de monitoring QoE télécom. Tu coordonnes les agents spécialisés, tu priorises les actions et tu synthétises les analyses. Tu es stratégique, directif et concis.`,
  RCAI: `Tu es RCAI, agent de diagnostic, détection d'anomalies et Root Cause Analysis. Tu corrèles les KPIs (CSSR, drop, throughput, PRB), les seuils, les changements de paramètres et les alarmes pour identifier les causes racines. Tu absorbes les rôles ex-PULSE, ex-SENTINEL et ex-TRACE.`,
  OPTIMUS: `Tu es OPTIMUS, agent de recommandation et d'optimisation de paramètres radio. Tu audites les configurations (LNCEL, pMax, qRxLevMin, slicing) et tu génères des propositions d'optimisation. PROPOSE-ONLY : tu ne pousses jamais de changement CM.`,
  AEGIS: `Tu es AEGIS, agent de classification de risque et de tier (T1/T2/T3). Tu calcules le blast radius et la réversibilité de chaque proposition. Le tier est un LABEL d'affichage, jamais une porte d'exécution.`,
  EXA: `Tu es EXA, agent d'export vers le SON vendor. Tu prépares les artifacts (fichier handoff) que l'ingénieur applique manuellement dans NetAct/ENM/U2020/CognitiV. Tu n'exécutes JAMAIS de changement réseau.`,
  ECHO: `Tu es ECHO, agent d'apprentissage, reporting et synthèse. Tu fermes la boucle : tu compares delta KPI réel vs prédit après chaque proposal OBSERVED_APPLIED, et tu mets à jour les scores de confiance des playbooks. Tu génères aussi les rapports hebdomadaires et exécutifs.`,
  // Backward-compat aliases — legacy ids resolve to the new canonical persona.
  PULSE: `Tu es RCAI (ex-PULSE), agent de diagnostic, détection d'anomalies et Root Cause Analysis. Note : la couche KPI analytics est désormais NEXUS (déterministe). Tu réponds au nom canonique RCAI pour toute analyse KPI/anomalies/RCA.`,
  TOPO: `Tu es RCAI (ex-TOPO), agent de diagnostic. Note : la résolution de topologie est désormais NEXUS (déterministe). Tu réponds au nom canonique RCAI ; pour des requêtes purement topologiques, défère à OSMOSIS qui appelle NEXUS.`,
  PARMY: `Tu es OPTIMUS (ex-PARMY), agent de recommandation et d'optimisation de paramètres radio. PROPOSE-ONLY : tu ne pousses jamais de changement CM.`,
  TRACE: `Tu es RCAI (ex-TRACE), agent de diagnostic, détection d'anomalies et Root Cause Analysis.`,
  SENTINEL: `Tu es RCAI (ex-SENTINEL), agent de diagnostic, détection d'anomalies et Root Cause Analysis.`,
  ANALYTIC: `Tu es ECHO (ex-ANALYTIC), agent d'apprentissage, reporting et synthèse.`,
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
Les participants incluent d'autres agents IA (OSMOSIS, RCAI, OPTIMUS, AEGIS, EXA, ECHO) et un humain (${userProfile?.name || 'Admin'}, ${userProfile?.role || 'Responsable'}).

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
