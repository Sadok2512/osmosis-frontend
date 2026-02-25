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

type RAGDoc = {
  filename: string;
  content: string;
  similarity?: number;
  chunk_index?: number;
};

function normalizeQueryForLike(query: string): string {
  return query
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim()
    .replace(/\s+/g, "%");
}

function extractSearchTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .match(/[\p{L}\p{N}]{3,}/gu) || []
    )
  ).slice(0, 8);
}

function isDocumentFocusedQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  const docHints = [
    "document", "fichier", "ppt", "pptx", "docx", "xlsx", "slide",
    "ctce", "ul_data_split", "data split", "rag"
  ];
  const networkHints = [
    "qoe", "rtt", "throughput", "site", "cell", "cellule", "plaque",
    "vendor", "tcp", "latence", "débit", "debit", "sessions", "5g", "4g"
  ];

  const hasDocHint = docHints.some((hint) => normalized.includes(hint));
  const hasNetworkHint = networkHints.some((hint) => normalized.includes(hint));

  return hasDocHint && !hasNetworkHint;
}

function buildRAGContext(docs: RAGDoc[]): string {
  return docs
    .slice(0, 5)
    .map((doc) => {
      const score = typeof doc.similarity === "number"
        ? `score: ${doc.similarity.toFixed(2)}`
        : "score: lexical";
      const chunk = typeof doc.chunk_index === "number" ? ` | chunk: ${doc.chunk_index}` : "";
      return `[${doc.filename}${chunk} | ${score}]\n${doc.content.slice(0, 900)}`;
    })
    .join("\n\n---\n\n");
}

async function searchRAGDocuments(query: string): Promise<string> {
  try {
    const cleanedQuery = query.trim();
    if (!cleanedQuery) return "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const isShortQuery = cleanedQuery.length < 36 || cleanedQuery.split(/\s+/).length <= 5;
    const queryEmbedding = generateSimpleEmbedding(cleanedQuery);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    const semanticThreshold = isShortQuery ? 0.12 : 0.22;
    const semanticCount = isShortQuery ? 8 : 5;

    const { data: semanticData, error: semanticError } = await supabase.rpc("match_documents", {
      query_embedding: embeddingStr,
      match_threshold: semanticThreshold,
      match_count: semanticCount,
    });

    if (semanticError) {
      console.error("RAG semantic search error:", semanticError);
    }

    const semanticDocs: RAGDoc[] = (semanticData || []).filter(
      (doc: RAGDoc) => Boolean(doc?.content?.trim())
    );

    const normalizedLikeQuery = normalizeQueryForLike(cleanedQuery);
    const terms = extractSearchTerms(cleanedQuery);

    const lexicalQueries: Promise<any>[] = [];

    if (normalizedLikeQuery) {
      lexicalQueries.push(
        supabase
          .from("rag_documents")
          .select("filename, content, chunk_index")
          .ilike("filename", `%${normalizedLikeQuery}%`)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("rag_documents")
          .select("filename, content, chunk_index")
          .ilike("content", `%${normalizedLikeQuery}%`)
          .order("created_at", { ascending: false })
          .limit(6)
      );
    }

    for (const term of terms) {
      lexicalQueries.push(
        supabase
          .from("rag_documents")
          .select("filename, content, chunk_index")
          .ilike("filename", `%${term}%`)
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("rag_documents")
          .select("filename, content, chunk_index")
          .ilike("content", `%${term}%`)
          .order("created_at", { ascending: false })
          .limit(3)
      );
    }

    const lexicalResults = lexicalQueries.length > 0 ? await Promise.all(lexicalQueries) : [];
    const lexicalDocs: RAGDoc[] = [];

    for (const result of lexicalResults) {
      if (result?.error) {
        console.error("RAG lexical search error:", result.error);
        continue;
      }
      for (const doc of result?.data || []) {
        if (doc?.content?.trim()) lexicalDocs.push(doc as RAGDoc);
      }
    }

    const merged = new Map<string, RAGDoc>();
    for (const doc of [...semanticDocs, ...lexicalDocs]) {
      const key = `${doc.filename}::${doc.chunk_index ?? "na"}::${doc.content.slice(0, 80)}`;
      if (!merged.has(key)) merged.set(key, doc);
    }

    const mergedDocs = Array.from(merged.values());
    console.log(`RAG retrieval for "${cleanedQuery}": semantic=${semanticDocs.length}, lexical=${lexicalDocs.length}, merged=${mergedDocs.length}`);
    if (mergedDocs.length === 0) return "";

    return buildRAGContext(mergedDocs);
  } catch (e) {
    console.error("RAG search failed:", e);
    return "";
  }
}

const SYSTEM_PROMPT = `Tu es un assistant expert en analyse de Qualité d'Expérience (QoE) réseau mobile pour l'opérateur Orange France.

KPIs disponibles : QoE Score, DMS DL 3/8/30 Mbps, Throughput DL/UL (p50), RTT (p95), Taux de perte TCP, Retransmission Rate, Window Full Ratio, Sessions, Volume DL.
Dimensions : Vendor (Ericsson, Nokia), DOR, Plaque, RAT (2G/3G/4G/5G), Site, Cellule, Bande, Device, OS, Client, Application.

RÈGLE ABSOLUE — DONNÉES RÉELLES UNIQUEMENT :
- Tu reçois dans le contexte un tableau de données réseau RÉELLES avec les vrais noms de cellules (cell_id), sites (site_name), vendors, plaques, technos et KPIs mesurés.
- Tu dois EXCLUSIVEMENT utiliser les cell_id et site_name EXACTS qui apparaissent dans ce tableau. Copie-colle les noms tels quels.
- Il est STRICTEMENT INTERDIT d'inventer, générer ou halluciner des noms de cellules ou de sites (ex: ne JAMAIS écrire "ERICSSON_cell_1", "NOKIA_site_X", "Cell_A", etc.).
- Si tu ne trouves pas de données pertinentes dans le contexte fourni, dis-le explicitement au lieu d'inventer des données.
- Chaque cellule ou site mentionné dans ta réponse DOIT exister dans le tableau de données fourni.
- Dans les tableaux, inclus toujours les colonnes "Cell ID" et "Site" avec les noms EXACTS copiés depuis les données.

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
Si des documents de la base de connaissances RAG sont fournis dans le contexte, utilise-les en priorité dès que la question mentionne un mot-clé documentaire (ex: CTCE, UL_DATA_SPLIT, nom de fichier). Cite toujours la source [fichier + chunk] quand tu utilises une information RAG.
Si aucun extrait RAG pertinent n'est disponible, indique explicitement que la réponse se base uniquement sur les données réseau live.

VISUALISATIONS INTERACTIVES :
Tu peux intégrer des graphiques, cartes et cartes KPI directement dans ta réponse en utilisant des blocs de code spéciaux.

Pour un graphique Recharts, utilise un bloc \`\`\`chart avec du JSON :
\`\`\`chart
{"type":"bar","title":"QoE par Vendor","xKey":"vendor","yKeys":["qoe"],"data":[{"vendor":"Ericsson","qoe":78.5},{"vendor":"Nokia","qoe":72.3}]}
\`\`\`
Types supportés : "line", "bar", "area", "scatter". Champs requis : type, xKey, yKeys (tableau), data (tableau d'objets).

Pour une mini-carte avec des marqueurs de sites, utilise un bloc \`\`\`map :
\`\`\`map
{"title":"Sites critiques","markers":[{"lat":48.85,"lng":2.35,"label":"SITE_ABC","value":42.1},{"lat":45.76,"lng":4.83,"label":"SITE_DEF","value":55.0}]}
\`\`\`
Champs requis : markers (tableau avec lat, lng, label). Optionnel : value (QoE pour colorer), title.
IMPORTANT : utilise les coordonnées GPS réelles des sites si elles sont dans le contexte. Sinon, n'inclus PAS de bloc map.

Pour des cartes KPI résumées, utilise un bloc \`\`\`kpi :
\`\`\`kpi
{"title":"Résumé Réseau","cards":[{"label":"QoE Moyen","value":"76.2","unit":"%","trend":"up","delta":"+1.3 vs S-1","status":"good"},{"label":"RTT p95","value":"45","unit":"ms","trend":"stable","status":"good"}]}
\`\`\`
Champs requis : cards (tableau). Chaque carte a : label, value. Optionnel : unit, trend ("up"/"down"/"stable"), delta, status ("critical"/"warning"/"good"/"excellent").

RÈGLES D'UTILISATION DES VISUALISATIONS :
- Utilise un bloc \`\`\`kpi en haut de ta réponse pour résumer les métriques clés quand c'est pertinent.
- Utilise un bloc \`\`\`chart pour illustrer des comparaisons, tendances ou distributions.
- Utilise un bloc \`\`\`map UNIQUEMENT si tu as les coordonnées GPS des sites dans le contexte.
- Le JSON dans les blocs doit être valide et sur UNE SEULE LIGNE (pas de retours à la ligne dans le JSON).
- Combine texte Markdown + blocs de visualisation pour des réponses riches et interactives.

Réponds TOUJOURS en français.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, cellContext, openrouter_key, model: requestedModel } = await req.json();
    
    // Determine which AI gateway to use
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENROUTER_API_KEY = openrouter_key || Deno.env.get("OPENROUTER_API_KEY");
    
    const useLovable = !!LOVABLE_API_KEY && !OPENROUTER_API_KEY;
    
    if (!LOVABLE_API_KEY && !OPENROUTER_API_KEY) {
      throw new Error("No AI API key configured");
    }

    // Extract the last user message for RAG search
    const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === "user")?.content || "";
    
    // Search RAG documents for relevant context
    const ragContext = await searchRAGDocuments(lastUserMessage);

    let systemContent = SYSTEM_PROMPT;
    const documentFocusedQuery = isDocumentFocusedQuery(lastUserMessage);
    console.log(`QOE query routing: docFocused=${documentFocusedQuery}, ragFound=${Boolean(ragContext)}, gateway=${useLovable ? 'lovable' : 'openrouter'}`);

    if (ragContext) {
      systemContent += `\n\n📚 DOCUMENTS RAG PERTINENTS :\n${ragContext}`;
      systemContent += "\n\nINSTRUCTION PRIORITAIRE : la question est potentiellement documentaire. Base d'abord l'analyse sur les extraits RAG, cite les sources [fichier + chunk], puis complète avec les données réseau uniquement si utile.";
    }

    if (cellContext && !(ragContext && documentFocusedQuery)) {
      systemContent += `\n\nDONNÉES RÉSEAU RÉELLES DISPONIBLES :\n${cellContext}`;
    }

    const aiUrl = useLovable
      ? "https://ai.gateway.lovable.dev/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions";
    
    const aiHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    if (useLovable) {
      aiHeaders["Authorization"] = `Bearer ${LOVABLE_API_KEY}`;
    } else {
      aiHeaders["Authorization"] = `Bearer ${OPENROUTER_API_KEY}`;
      aiHeaders["HTTP-Referer"] = Deno.env.get("SUPABASE_URL") || "";
      aiHeaders["X-Title"] = "QOEBIT Assistant";
    }

    let aiModel = requestedModel || (useLovable ? "google/gemini-3-flash-preview" : "google/gemini-2.5-flash-preview-05-20");

    // Normalize model names when using Lovable AI gateway
    if (useLovable) {
      const modelAliases: Record<string, string> = {
        "google/gemini-2.5-flash-preview-05-20": "google/gemini-2.5-flash",
        "google/gemini-2.5-flash-preview": "google/gemini-2.5-flash",
        "google/gemini-flash-latest": "google/gemini-2.5-flash",
      };

      aiModel = modelAliases[aiModel] || aiModel;

      const allowedLovableModels = new Set([
        "openai/gpt-5-mini",
        "openai/gpt-5",
        "openai/gpt-5-nano",
        "openai/gpt-5.2",
        "google/gemini-2.5-pro",
        "google/gemini-2.5-flash",
        "google/gemini-2.5-flash-lite",
        "google/gemini-2.5-flash-image",
        "google/gemini-3-pro-preview",
        "google/gemini-3-flash-preview",
        "google/gemini-3-pro-image-preview",
      ]);

      if (!allowedLovableModels.has(aiModel)) {
        console.warn(`Unsupported model for Lovable AI gateway: ${aiModel}. Falling back to google/gemini-3-flash-preview`);
        aiModel = "google/gemini-3-flash-preview";
      }
    }

    const response = await fetch(aiUrl, {
      method: "POST",
      headers: aiHeaders,
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: "system", content: systemContent },
          ...messages,
        ],
        stream: true,
      }),
    });

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
        JSON.stringify({ error: "AI gateway error", status: response.status, details: t.slice(0, 800) }),
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
