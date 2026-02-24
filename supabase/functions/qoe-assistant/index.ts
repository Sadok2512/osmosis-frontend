import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Generate a deterministic 768-dim embedding from text (same algo as rag-embed)
function generateSimpleEmbedding(text: string): number[] {
  const dim = 768;
  const vec = new Array(dim).fill(0);
  const normalized = text.toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    const idx = (code * (i + 1) * 31) % dim;
    vec[idx] += 1;
  }
  const mag = Math.sqrt(vec.reduce((s: number, v: number) => s + v * v, 0)) || 1;
  return vec.map((v: number) => v / mag);
}

async function searchRAGDocuments(query: string): Promise<string> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const queryEmbedding = generateSimpleEmbedding(query);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    const { data, error } = await supabase.rpc("match_documents", {
      query_embedding: embeddingStr,
      match_threshold: 0.3,
      match_count: 5,
    });

    if (error) {
      console.error("RAG search error:", error);
      return "";
    }

    if (!data || data.length === 0) return "";

    const ragContext = data
      .map((doc: { filename: string; content: string; similarity: number }) =>
        `[${doc.filename} (score: ${doc.similarity.toFixed(2)})]\n${doc.content.slice(0, 800)}`
      )
      .join("\n\n---\n\n");

    return ragContext;
  } catch (e) {
    console.error("RAG search failed:", e);
    return "";
  }
}

const SYSTEM_PROMPT = `Tu es un assistant expert en analyse de Qualité d'Expérience (QoE) réseau mobile pour l'opérateur Orange France.

KPIs disponibles : QoE Score, DMS DL 3/8/30 Mbps, Throughput DL/UL (p50), RTT (p95), Taux de perte TCP, Retransmission Rate, Window Full Ratio, Sessions, Volume DL.
Dimensions : Vendor (Ericsson, Nokia), DOR, Plaque, RAT (2G/3G/4G/5G), Site, Cellule, Bande, Device, OS, Client, Application.

IMPORTANT — NOMMAGE DES SITES ET CELLULES :
- Quand l'utilisateur te fournit un contexte avec des données réseau (sites, cellules), utilise EXACTEMENT les noms de sites et cell_ids fournis.
- Ne génère JAMAIS de noms fictifs si des données réelles sont fournies dans le contexte.
- Quand tu mentionnes des sites ou cellules dans ta réponse, utilise toujours le format exact du cell_id (ex: "SITE_ABC_cell_1") tel qu'il apparaît dans les données.
- Dans les tableaux, inclus toujours une colonne "Cell ID" ou "Site" avec le nom exact.

RÈGLES DE FORMATAGE ABSOLUES (VIOLATION = ERREUR CRITIQUE) :
- Tu ne dois JAMAIS utiliser de HTML. Pas de <div>, <table>, <td>, <th>, <tr>, <span>, <style> ni aucune autre balise HTML. JAMAIS.
- Si tu veux faire un tableau, utilise UNIQUEMENT la syntaxe Markdown avec | et ---.
- Structure avec ## et ### pour les titres.
- Mets en **gras** les valeurs importantes, noms de sites et KPIs critiques.
- Utilise des listes numérotées (1. 2. 3.) ou à puces (- ) pour les recommandations.
- Chaque point sur sa propre ligne avec une ligne vide avant et après chaque bloc (paragraphe, liste, tableau).
- Ne mets JAMAIS plusieurs points sur la même ligne.
- RAPPEL FINAL : Zéro HTML. Uniquement du Markdown pur.

EXEMPLE DE FORMAT DE RÉPONSE :

## 📊 Analyse des 10 pires sites en QoE

| # | Cell ID | Site | Techno | QoE Score | TPUT DL | RTT p95 | Statut |
|---|---------|------|--------|-----------|---------|---------|--------|
| 1 | CELL_ID_1 | SITE_NAME | 4G | **41.2%** | 4.8 Mbps | 185 ms | 🔴 Critique |

### 🔍 Analyse

Les cellules présentent des **dégradations significatives**.

### ✅ Actions recommandées

1. **Audit** sur CELL_ID_1

IMPORTANT : Dans la colonne Statut du tableau, utilise TOUJOURS ces indicateurs avec émojis :
- 🔴 Critique — QoE < 50%
- 🟠 Dégradé — QoE 50-65%
- 🟡 Moyen — QoE 65-75%
- 🟢 Bon — QoE 75-85%
- 🟢 Excellent — QoE > 85%

---

Valeurs réalistes à utiliser :
- QoE Score: 40-95%
- Throughput DL: 5-300 Mbps
- RTT: 10-200ms
- DMS DL 3M: 85-99%
- DMS DL 8M: 60-95%
- DMS DL 30M: 15-65%
- Loss Rate: 0.01-5%

DOCUMENTS RAG :
Si des documents de la base de connaissances RAG sont fournis dans le contexte, utilise-les pour enrichir tes réponses avec des informations techniques précises. Cite la source du document quand tu utilises une information provenant du RAG.

Réponds TOUJOURS en français.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, cellContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Extract the last user message for RAG search
    const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === "user")?.content || "";
    
    // Search RAG documents for relevant context
    const ragContext = await searchRAGDocuments(lastUserMessage);

    let systemContent = SYSTEM_PROMPT;
    if (cellContext) {
      systemContent += `\n\nDONNÉES RÉSEAU RÉELLES DISPONIBLES :\n${cellContext}`;
    }
    if (ragContext) {
      systemContent += `\n\n📚 DOCUMENTS RAG PERTINENTS :\n${ragContext}`;
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
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemContent },
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
