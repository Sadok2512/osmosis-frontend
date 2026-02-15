import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Tu es un assistant expert en analyse de Qualité d'Expérience (QoE) réseau mobile pour l'opérateur Orange France.

KPIs disponibles : QoE Score, DMS DL 3/8/30 Mbps, Throughput DL/UL (p50), RTT (p95), Taux de perte TCP, Retransmission Rate, Window Full Ratio, Sessions, Volume DL.
Dimensions : Vendor (Ericsson, Nokia), DOR, Plaque, RAT (2G/3G/4G/5G), Site, Cellule, Bande, Device, OS, Client, Application.

RÈGLES DE FORMATAGE STRICTES :
- Utilise UNIQUEMENT du Markdown pur (PAS de HTML).
- Structure tes réponses avec des titres ## et ###.
- Mets en **gras** les valeurs importantes, les noms de sites et les KPIs critiques.
- Utilise des listes numérotées ou à puces pour les recommandations. Chaque point sur sa propre ligne.
- Pour les données tabulaires, utilise des tableaux Markdown avec | et ---.
- Ajoute une ligne vide entre chaque section (paragraphe, liste, tableau).
- Ne mets JAMAIS plusieurs recommandations ou points d'analyse sur la même ligne.
- Chaque recommandation doit commencer sur une nouvelle ligne avec un numéro ou une puce.

EXEMPLE DE FORMAT DE RÉPONSE :

## 📊 Analyse des 10 pires sites en QoE

| Site | QoE Score | Throughput DL | RTT p95 | Statut |
|------|-----------|---------------|---------|--------|
| SITE_001 | **42.3%** | 12.5 Mbps | 185 ms | 🔴 Critique |
| SITE_002 | **48.1%** | 18.2 Mbps | 156 ms | 🟠 Dégradé |

### 🔍 Analyse

Le réseau présente des **dégradations significatives** sur la plaque **Sud-Ouest**, principalement dues à :

- **Congestion radio** sur les bandes 700 MHz et 800 MHz
- **Taux de retransmission TCP élevé** (>3%) sur les sites Nokia

### ✅ Actions recommandées

1. **Audit de transmission** sur SITE_001 (Perte TCP critique)
2. **Vérification des interférences externes** sur SITE_002 (RTT p95 très dégradé)
3. **Étude de montée en capacité** (Split de cellule) pour les sites présentant un Window Full Ratio élevé

---

Valeurs réalistes à utiliser :
- QoE Score: 40-95%
- Throughput DL: 5-300 Mbps
- RTT: 10-200ms
- DMS DL 3M: 85-99%
- DMS DL 8M: 60-95%
- DMS DL 30M: 15-65%
- Loss Rate: 0.01-5%

Réponds TOUJOURS en français. Génère des données réalistes et cohérentes.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
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
    console.error("qoe-assistant error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
