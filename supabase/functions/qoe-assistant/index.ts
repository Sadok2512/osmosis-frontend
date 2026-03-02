import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ═══════════════════════════════════════════════════════════════
//  UTILITIES (embedding, RAG, param search, topo search — unchanged)
// ═══════════════════════════════════════════════════════════════

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

type RAGDoc = { filename: string; content: string; similarity?: number; chunk_index?: number };

function normalizeQueryForLike(query: string): string {
  return query.toLowerCase().replace(/[_-]+/g, " ").replace(/[^\p{L}\p{N}\s]+/gu, " ").trim().replace(/\s+/g, "%");
}

function extractSearchTerms(query: string): string[] {
  return Array.from(new Set(query.toLowerCase().replace(/[_-]+/g, " ").match(/[\p{L}\p{N}]{3,}/gu) || [])).slice(0, 8);
}

function buildRAGContext(docs: RAGDoc[]): string {
  return docs.slice(0, 5).map((doc) => {
    const score = typeof doc.similarity === "number" ? `score: ${doc.similarity.toFixed(2)}` : "score: lexical";
    const chunk = typeof doc.chunk_index === "number" ? ` | chunk: ${doc.chunk_index}` : "";
    return `[${doc.filename}${chunk} | ${score}]\n${doc.content.slice(0, 900)}`;
  }).join("\n\n---\n\n");
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
      query_embedding: embeddingStr, match_threshold: semanticThreshold, match_count: semanticCount,
    });
    if (semanticError) console.error("RAG semantic search error:", semanticError);
    const semanticDocs: RAGDoc[] = (semanticData || []).filter((doc: RAGDoc) => Boolean(doc?.content?.trim()));

    const normalizedLikeQuery = normalizeQueryForLike(cleanedQuery);
    const terms = extractSearchTerms(cleanedQuery);
    const lexicalQueries: Promise<any>[] = [];
    if (normalizedLikeQuery) {
      lexicalQueries.push(
        supabase.from("rag_documents").select("filename, content, chunk_index").ilike("filename", `%${normalizedLikeQuery}%`).order("created_at", { ascending: false }).limit(6),
        supabase.from("rag_documents").select("filename, content, chunk_index").ilike("content", `%${normalizedLikeQuery}%`).order("created_at", { ascending: false }).limit(6)
      );
    }
    for (const term of terms) {
      lexicalQueries.push(
        supabase.from("rag_documents").select("filename, content, chunk_index").ilike("filename", `%${term}%`).order("created_at", { ascending: false }).limit(3),
        supabase.from("rag_documents").select("filename, content, chunk_index").ilike("content", `%${term}%`).order("created_at", { ascending: false }).limit(3)
      );
    }
    const lexicalResults = lexicalQueries.length > 0 ? await Promise.all(lexicalQueries) : [];
    const lexicalDocs: RAGDoc[] = [];
    for (const result of lexicalResults) {
      if (result?.error) continue;
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

function isDistributionQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  return ["distribution", "répartition", "repartition", "distrubition", "distrubtion",
    "par plaque", "par upr", "par vendor", "par site", "par bande", "par dor", "par region", "par zone"
  ].some((h) => normalized.includes(h));
}

function extractParamName(query: string): string | null {
  const matchFull = query.match(/\b((?:LNCEL|LNBTS|LNCELL|MRBTS|GNBTS|SIB|NRCELL|CATMPR|NOKLTE|NRBTS|GNBCUCP|GNBCUUP|GNBDU|LNHOIF|LNRELIF|IRFIM)[.\s_]?\w+)\b/i);
  if (matchFull) return matchFull[1].replace(/\s/g, ".");
  const match = query.match(/\b(t\d{3,4})\b/i);
  return match ? match[1] : null;
}

function extractGroupByColumn(query: string): string {
  const normalized = query.toLowerCase();
  const mappings: Record<string, string> = {
    plaque: "plaque", upr: "ur", vendor: "vendor", site: "site_name",
    bande: "bande", dor: "dor", region: "dr", zone: "zone_arcep",
    omc: "omc", city: "city", ville: "city",
  };
  for (const [hint, col] of Object.entries(mappings)) {
    if (normalized.includes(hint)) return col;
  }
  return "plaque";
}

function extractPlaqueName(query: string): string | null {
  const match = query.match(/\b(AUTRES\d{2,3}|NANTES|ST_NAZAIRE|RENNES|BREST|BORDEAUX|TOULOUSE|LYON|MARSEILLE|LILLE|STRASBOURG|[A-Z][A-Z_]{2,}(?:\d{2,3})?)\b/i);
  if (!match) return null;
  return match[1].toUpperCase();
}

function extractSiteName(query: string): string | null {
  const paramPrefixes = /^(LNCEL|LNBTS|LNCELL|MRBTS|GNBTS|SIB|NRCELL|CATMPR|NOKLTE|NRBTS|GNBCUCP|GNBCUUP|GNBDU|LNHOIF|LNRELIF|IRFIM|DUMP|TABLE)$/i;
  const matches = query.match(/\b([A-Z][A-Z0-9_]{3,}(?:_[A-Z0-9]+)+)\b/g);
  if (!matches) return null;
  for (const m of matches) {
    if (!paramPrefixes.test(m)) return m;
  }
  return null;
}

async function searchTopoForSite(siteName: string): Promise<string> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from("topo")
      .select("code_nidt, nom_site, nom_cellule, techno, bande, constructeur, region, plaque, azimut, latitude, longitude, hba, tac, remote_electrical_tilt, pci, eci, nci, cid, etat_cellule, zone_arcep, essentiel, date_mes, date_fn8")
      .ilike("nom_site", `%${siteName}%`)
      .order("nom_cellule")
      .limit(100);

    if (error) { console.error("Topo search error:", error); return ""; }
    if (!data?.length) return "";

    const header = "nom_cellule | techno | bande | azimut | remote_electrical_tilt | hba | pci | tac | etat_cellule | constructeur | lat | lng | date_mes";
    const lines = data.map((r: any) =>
      `${r.nom_cellule} | ${r.techno || ""} | ${r.bande || ""} | ${r.azimut ?? "-"} | ${r.remote_electrical_tilt ?? "-"} | ${r.hba ?? "-"} | ${r.pci ?? "-"} | ${r.tac ?? "-"} | ${r.etat_cellule || "-"} | ${r.constructeur || "-"} | ${r.latitude ?? "-"} | ${r.longitude ?? "-"} | ${r.date_mes || "-"}`
    );

    const sectorMap = new Map<number, any[]>();
    for (const r of data) {
      const sectorNum = parseInt(r.nom_cellule?.match(/(\d+)$/)?.[1] || "0");
      if (!sectorMap.has(sectorNum)) sectorMap.set(sectorNum, []);
      sectorMap.get(sectorNum)!.push(r);
    }

    let sectorAnalysis = "\n\n--- ANALYSE PAR SECTEUR ---\n";
    for (const [sNum, cells] of Array.from(sectorMap.entries()).sort(([a], [b]) => a - b)) {
      const azimuths = cells.map((c: any) => c.azimut).filter((a: any) => a != null);
      const tilts = cells.map((c: any) => c.remote_electrical_tilt).filter((t: any) => t != null);
      const hbas = cells.map((c: any) => c.hba).filter((h: any) => h != null);
      const avgAz = azimuths.length ? Math.round(azimuths.reduce((a: number, b: number) => a + b, 0) / azimuths.length) : null;
      const deltaTilt = tilts.length >= 2 ? Math.max(...tilts) - Math.min(...tilts) : null;
      const bands = [...new Set(cells.map((c: any) => c.bande).filter(Boolean))];
      sectorAnalysis += `Secteur ${sNum}: ${cells.length} cellules, Azimut moyen=${avgAz ?? "-"}°, Bandes=[${bands.join(",")}]`;
      if (tilts.length) sectorAnalysis += `, Tilts=[${tilts.join(",")}]`;
      if (deltaTilt != null) sectorAnalysis += `, ΔTilt=${deltaTilt}°${deltaTilt > 3 ? " ⚠️ ÉLEVÉ" : ""}`;
      if (hbas.length) sectorAnalysis += `, HBA=[${[...new Set(hbas)].join(",")}]m`;
      sectorAnalysis += "\n";
    }

    const first = data[0];
    return `TOPOLOGIE SITE "${first.nom_site}" (NIDT: ${first.code_nidt}, Région: ${first.region || "-"}, Plaque: ${first.plaque || "-"}, Constructeur: ${first.constructeur || "-"}, Coords: ${first.latitude},${first.longitude})\n${data.length} cellules:\n${header}\n${lines.join("\n")}${sectorAnalysis}`;
  } catch (e) {
    console.error("Topo site search failed:", e);
    return "";
  }
}

async function searchDumpParameters(query: string): Promise<string> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const tableCandidates = ["dump_parametre", "dump_parameter"];
    let activeDumpTable: string | null = null;
    for (const tableName of tableCandidates) {
      const probe = await supabase.from(tableName).select("id").limit(1);
      if (!probe.error) { activeDumpTable = tableName; break; }
      const msg = probe.error?.message?.toLowerCase() || "";
      if (!msg.includes("does not exist") && !msg.includes("relation") && !msg.includes("could not find")) {
        activeDumpTable = tableName; break;
      }
    }
    if (!activeDumpTable) return "AUCUNE TABLE de paramètres trouvée (dump_parameter / dump_parametre).";

    const paramName = extractParamName(query);
    const isDistrib = isDistributionQuery(query);
    const siteName = extractSiteName(query);
    const plaqueName = extractPlaqueName(query);

    if (plaqueName && !isDistrib) {
      let q = supabase.from(activeDumpTable).select("cell_name, site_name, parameter, value, vendor, bande, plaque").ilike("plaque", `%${plaqueName}%`);
      if (paramName) q = q.ilike("parameter", `%${paramName}%`);
      const { data, error } = await q.order("cell_name").limit(500);
      if (error) console.error(`${activeDumpTable} plaque search error:`, error);
      if (!data?.length) {
        const { data: plaqueCheck } = await supabase.from(activeDumpTable).select("plaque").ilike("plaque", `%${plaqueName}%`).limit(1);
        if (!plaqueCheck?.length) {
          const { data: allPlaques } = await supabase.from(activeDumpTable).select("plaque").limit(1000);
          const uniquePlaques = [...new Set((allPlaques || []).map((r: any) => r.plaque).filter(Boolean))];
          return `AUCUNE DONNÉE trouvée pour la plaque "${plaqueName}". Plaques disponibles : ${uniquePlaques.join(", ")}`;
        }
        return `AUCUNE DONNÉE trouvée pour la plaque "${plaqueName}"${paramName ? ` avec le paramètre "${paramName}"` : ""}.`;
      }
      const header = "cell_name | site_name | parameter | value | vendor | bande";
      const lines = data.map((r: any) => `${r.cell_name || ""} | ${r.site_name || ""} | ${r.parameter || ""} | ${r.value || ""} | ${r.vendor || ""} | ${r.bande || ""}`);
      return `CELLULES de la plaque ${plaqueName}${paramName ? ` pour ${paramName}` : ""} (${data.length} résultats) :\n${header}\n${lines.join("\n")}`;
    }

    if (paramName && siteName && !isDistrib) {
      const { data, error } = await supabase.from(activeDumpTable)
        .select("dn, cell_dn, cell_name, site_name, parameter, value, version, vendor, bande, ur, plaque")
        .ilike("parameter", `%${paramName}%`).ilike("site_name", `%${siteName}%`).order("cell_name").limit(200);
      if (error) console.error(`${activeDumpTable} site search error:`, error);
      if (!data?.length) {
        const { data: siteData } = await supabase.from(activeDumpTable).select("site_name").ilike("site_name", `%${siteName}%`).limit(5);
        const { data: paramData } = await supabase.from(activeDumpTable).select("parameter").ilike("parameter", `%${paramName}%`).limit(10);
        const uniqueSites = [...new Set((siteData || []).map((r: any) => r.site_name))];
        const uniqueParams = [...new Set((paramData || []).map((r: any) => r.parameter))];
        let msg = `RÉSULTAT DE RECHERCHE : AUCUNE DONNÉE trouvée pour "${paramName}" sur "${siteName}".\n`;
        if (!uniqueSites.length) msg += `⚠️ Le site "${siteName}" n'existe pas.\n`; else msg += `Sites similaires : ${uniqueSites.join(", ")}\n`;
        if (!uniqueParams.length) msg += `⚠️ Le paramètre "${paramName}" n'existe pas.\n`; else msg += `Paramètres contenant "${paramName}" : ${uniqueParams.join(", ")}\n`;
        return msg;
      }
      const header = "dn | cell_name | site_name | parameter | value | version | vendor | bande | ur | plaque";
      const lines = data.map((r: any) => `${r.dn || ""} | ${r.cell_name || ""} | ${r.site_name || ""} | ${r.parameter || ""} | ${r.value || ""} | ${r.version || ""} | ${r.vendor || ""} | ${r.bande || ""} | ${r.ur || ""} | ${r.plaque || ""}`);
      return `DONNÉES RÉELLES pour ${paramName} sur ${siteName} (${data.length} résultats) :\n${header}\n${lines.join("\n")}`;
    }

    if (isDistrib && paramName) {
      const groupCol = extractGroupByColumn(query);
      const { data, error } = await supabase.from(activeDumpTable).select(`${groupCol}, value, parameter`).ilike("parameter", `%${paramName}%`).limit(1000);
      if (error) console.error(`${activeDumpTable} aggregation error:`, error);
      if (!data?.length) return `AUCUNE DONNÉE trouvée pour le paramètre "${paramName}".`;
      const agg = new Map<string, number>();
      const dimTotals = new Map<string, number>();
      for (const row of data) {
        const dim = (row as any)[groupCol] || "N/A";
        const val = row.value || "N/A";
        const key = `${dim}::${val}`;
        agg.set(key, (agg.get(key) || 0) + 1);
        dimTotals.set(dim, (dimTotals.get(dim) || 0) + 1);
      }
      const total = data.length;
      const header = `dimension | valeur_${paramName} | nb_cellules | pct_dans_dimension | pct_global`;
      const lines = Array.from(agg.entries()).map(([key, count]) => {
        const [dim, val] = key.split("::");
        const dimTotal = dimTotals.get(dim) || 1;
        return `${dim} | ${val} | ${count} | ${((count / dimTotal) * 100).toFixed(1)}% | ${((count / total) * 100).toFixed(1)}%`;
      }).sort();
      const dimSummary = Array.from(dimTotals.entries()).sort((a, b) => a[0].localeCompare(b[0]))
        .map(([dim, cnt]) => `${dim}: ${cnt} cellules (${((cnt / total) * 100).toFixed(1)}%)`).join(", ");
      return `DISTRIBUTION AGRÉGÉE du paramètre ${paramName} par ${groupCol} (${total} cellules au total):\nRépartition par ${groupCol}: ${dimSummary}\n${header}\n${lines.join("\n")}\n\nINSTRUCTION VISUALISATION: Génère un graphique \`\`\`chart groupé.`;
    }

    const terms = extractSearchTerms(query);
    if (terms.length === 0) {
      const { data, error } = await supabase.from(activeDumpTable).select("dn, enodeb_id, mrbts_id, cell_name, vendor, site_name, parameter, version, value").limit(50);
      if (error || !data?.length) return "";
      return formatParamResults(data);
    }
    const queries = terms.slice(0, 4).map((term) =>
      supabase.from(activeDumpTable!).select("dn, enodeb_id, mrbts_id, gnodeb_id, cell_name, vendor, site_name, bande, parameter, version, value")
        .or(`parameter.ilike.%${term}%,site_name.ilike.%${term}%,dn.ilike.%${term}%,value.ilike.%${term}%,vendor.ilike.%${term}%`).limit(30)
    );
    const results = await Promise.all(queries);
    const mergedRows = new Map<string, any>();
    for (const r of results) {
      if (r.error) continue;
      for (const row of r.data || []) {
        const key = `${row.dn}::${row.parameter}`;
        if (!mergedRows.has(key)) mergedRows.set(key, row);
      }
    }
    const rows = Array.from(mergedRows.values());
    if (rows.length === 0) return `AUCUNE DONNÉE trouvée dans ${activeDumpTable} pour: ${terms.join(", ")}`;
    return formatParamResults(rows);
  } catch (e) {
    console.error("dump_parameter search failed:", e);
    return "";
  }
}

function formatParamResults(rows: any[]): string {
  const header = "dn | enodeb_id | mrbts_id | cell_name | vendor | site_name | parameter | version | value";
  const lines = rows.slice(0, 60).map((r) =>
    `${r.dn || ""} | ${r.enodeb_id || ""} | ${r.mrbts_id || ""} | ${r.cell_name || ""} | ${r.vendor || ""} | ${r.site_name || ""} | ${r.parameter || ""} | ${r.version || ""} | ${r.value || ""}`
  );
  return `Total résultats paramètres: ${rows.length}\n${header}\n${lines.join("\n")}`;
}

async function searchParameterChanges(query: string): Promise<string> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const siteName = extractSiteName(query);
    let q = supabase.from("parameter_changes")
      .select("change_date, change_type, change_scope, param_name, old_value, new_value, site_name, cell_name, techno, vendor, plaque, description")
      .order("change_date", { ascending: false })
      .limit(100);
    
    if (siteName) q = q.ilike("site_name", `%${siteName}%`);
    
    const { data, error } = await q;
    if (error) { console.error("parameter_changes search error:", error); return ""; }
    if (!data?.length) return siteName ? `AUCUN changement trouvé pour le site "${siteName}".` : "";

    const header = "date | type | scope | param | old | new | site | cell | techno | vendor";
    const lines = data.map((r: any) =>
      `${r.change_date} | ${r.change_type} | ${r.change_scope} | ${r.param_name} | ${r.old_value || "-"} | ${r.new_value || "-"} | ${r.site_name || "-"} | ${r.cell_name || "-"} | ${r.techno || "-"} | ${r.vendor || "-"}`
    );
    return `HISTORIQUE DES CHANGEMENTS (${data.length} entrées):\n${header}\n${lines.join("\n")}`;
  } catch (e) {
    console.error("parameter_changes search failed:", e);
    return "";
  }
}

// ═══════════════════════════════════════════════════════════════
//  🧠 ORCHESTRATOR — Intent Classification & Sub-Agent Routing
// ═══════════════════════════════════════════════════════════════

type AgentId = "PULSE" | "TRACE" | "SENTINEL" | "ARCHITECT" | "QOEBIT";

interface AgentRoute {
  agent: AgentId;
  label: string;
  emoji: string;
}

function classifyIntent(query: string): AgentRoute {
  const n = query.toLowerCase();

  // ARCHITECT — Site design, topology, tilt, azimuth, HBA
  const architectHints = [
    "design", "tilt", "azimut", "azimuth", "hba", "topologie", "topology",
    "secteur", "sector", "couverture", "coverage", "antenne", "antenna",
    "delta tilt", "profil site", "profile", "co-location", "colocation",
    "hauteur", "height", "orientation", "bearing"
  ];
  if (architectHints.some(h => n.includes(h))) return { agent: "ARCHITECT", label: "ARCHITECT", emoji: "🗼" };

  // TRACE — CM history, parameter changes, tuning, rollback
  const traceHints = [
    "changement", "change", "historique", "history", "modification",
    "tuning", "rollback", "upgrade", "swap", "avant", "après", "before", "after",
    "quand", "when", "date de modification", "parameter_changes", "cm history",
    "évolution config", "dernière modification", "last change"
  ];
  if (traceHints.some(h => n.includes(h))) return { agent: "TRACE", label: "TRACE", emoji: "🔧" };

  // SENTINEL — Alarms, anomalies, RCA, alerts, degradation
  const sentinelHints = [
    "alarm", "alarme", "anomali", "rca", "root cause", "cause racine",
    "dégradation", "degradation", "incident", "problème", "problem",
    "chute", "drop", "baisse soudaine", "sudden", "alerte", "alert",
    "détect", "detect", "seuil", "threshold", "critique", "critical"
  ];
  if (sentinelHints.some(h => n.includes(h))) return { agent: "SENTINEL", label: "SENTINEL", emoji: "🚨" };

  // PULSE — Default for performance / QoE / KPI queries (most common)
  return { agent: "PULSE", label: "PULSE", emoji: "📡" };
}

// ═══════════════════════════════════════════════════════════════
//  SUB-AGENT SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════════

const SHARED_RULES = `
⚠️⚠️⚠️ RÈGLE ABSOLUE — ZÉRO HALLUCINATION — DONNÉES RÉELLES UNIQUEMENT ⚠️⚠️⚠️
1. Utilise EXCLUSIVEMENT les données fournies dans le contexte. COPIE-COLLE les noms tels quels.
2. Il est INTERDIT d'inventer des noms de cellules, sites, valeurs ou métriques.
3. Si aucune donnée n'est disponible, dis-le clairement.
4. VÉRIFICATION FINALE : chaque nom/valeur doit apparaître dans le contexte.

FORMATAGE : Markdown pur uniquement. JAMAIS de HTML.
- Tableaux Markdown avec | et ---
- Titres ## et ###
- **Gras** pour les valeurs importantes
- Listes numérotées ou à puces
- Émojis de statut : 🔴 Critique (<50%), 🟠 Dégradé (50-65%), 🟡 Moyen (65-75%), 🟢 Bon (>75%)

VISUALISATIONS : Tu peux intégrer des blocs \`\`\`chart, \`\`\`map, \`\`\`kpi dans tes réponses.
- chart: {"type":"bar","title":"...","xKey":"...","yKeys":[...],"data":[...]}
- map: {"title":"...","markers":[{"lat":...,"lng":...,"label":"...","value":...}]}
- kpi: {"title":"...","cards":[{"label":"...","value":"...","unit":"...","trend":"up/down/stable","status":"good/warning/critical"}]}
Le JSON doit être sur UNE SEULE LIGNE dans le bloc.

Réponds TOUJOURS en français.`;

const PULSE_PROMPT = `Tu es **PULSE** 📡, l'agent spécialisé en analyse de performance RAN et Qualité d'Expérience (QoE) réseau mobile pour Orange France.

TON DOMAINE : KPIs de performance réseau — QoE Score, DMS DL 3/8/30 Mbps, Throughput DL/UL (p50), RTT (p95), Taux de perte TCP, Retransmission Rate, Window Full Ratio, Sessions, Volume DL.
Dimensions d'analyse : Vendor, DOR, Plaque, RAT (2G/3G/4G/5G), Site, Cellule, Bande.

TES CAPACITÉS :
- Classements (top worst/best cells, sites)
- Comparaisons entre vendors, plaques, technologies, régions
- Analyse de tendances et distributions
- Identification de dégradations de performance

COMPARAISONS : Quand on te demande de comparer, tu DOIS :
1. Bloc \`\`\`kpi résumant les métriques clés
2. Tableau comparatif COMPLET avec Δ et Verdict (✅ <5%, ⚠️ 5-15%, 🔴 >15%)
3. Bloc \`\`\`chart de type "bar" groupé
4. Synthèse : 🏆 Gagnant, 📊 Points forts, ⚠️ Points faibles, 🎯 Recommandations

DONNÉES AGRÉGÉES : Utilise les STATS AGRÉGÉES PAR VENDOR/PLAQUE/DOR/TECHNO directement.

SCHÉMA TABLE qoe_metrics : id, dt, cell_id, site_id, service, techno, bande, qoe_score_avg, p50_thr_dn_mbps, p50_thr_up_mbps, p95_rtt_ms, dms_dl_3, dms_dl_8, dms_dl_30, dms_ul_3, loss_dn_sum, traffic_dn_bytes, traffic_up_bytes, sessions, window_full_ratio, retransmission_rate, tcp_loss_rate, out_of_order_rate.

DOCUMENTS RAG : Si des documents RAG sont fournis, cite les sources [fichier + chunk].

PARAMÈTRES RÉSEAU : Si des données dump_parameter sont fournies, présente-les en tableau Markdown.

DISTRIBUTIONS : Quand les données contiennent une distribution agrégée, génère un tableau + un bloc \`\`\`chart groupé.

${SHARED_RULES}`;

const TRACE_PROMPT = `Tu es **TRACE** 🔧, l'agent spécialisé en historique de configuration et changements de paramètres réseau (CM History) pour Orange France.

TON DOMAINE : Suivi des modifications réseau — parameter tuning, upgrades SW, swaps, rollbacks, changements de configuration radio/transport/core.

TES CAPACITÉS :
- Analyse d'impact des changements de paramètres sur la performance
- Timeline chronologique des modifications
- Corrélation changements ↔ dégradations de KPIs
- Identification de rollbacks nécessaires
- Audit de configuration (avant/après)

SCHÉMA TABLE parameter_changes : change_date, change_type (tuning, upgrade, swap), change_scope (radio, core, transport), param_name, old_value, new_value, site_name, cell_name, techno, vendor, plaque, description.

SCHÉMA TABLE dump_parameter : dn, cell_dn, cell_name, site_name, parameter, value, version, vendor, bande, plaque, omc, dor, dr, ur, city, zone_arcep.

ANALYSE D'IMPACT : Quand tu présentes des changements :
1. Timeline chronologique avec les modifications
2. Tableau avant/après pour chaque paramètre modifié
3. Corrélation avec les KPIs si des données de performance sont disponibles
4. Recommandation : valider le changement ou proposer un rollback

${SHARED_RULES}`;

const SENTINEL_PROMPT = `Tu es **SENTINEL** 🚨, l'agent spécialisé en détection d'anomalies, gestion d'alertes et Root Cause Analysis (RCA) pour Orange France.

TON DOMAINE : Anomalies réseau, alertes de seuils, dégradations soudaines, analyse des causes racines, corrélation multi-KPIs.

TES CAPACITÉS :
- Root Cause Analysis (RCA) structurée avec arbre de causes
- Classification d'anomalies (radio, backhaul, core, CDN, device)
- Analyse de corrélation entre KPIs dégradés
- Évaluation de la sévérité et de l'impact
- Recommandations d'actions correctives priorisées
- Détection de patterns de dégradation (progressif vs soudain)

STRUCTURE RCA :
1. **🎯 Classe de cause racine** : Radio congestion / Backhaul saturation / Core routing / CDN / Device mix / Interférence
2. **📋 Résumé** : 2-3 phrases décrivant le problème et son impact
3. **🔍 Preuves** : KPIs qui soutiennent le diagnostic, avec valeurs et deltas
4. **⚡ Actions recommandées** : liste priorisée d'interventions
5. **📊 Confiance** : niveau de confiance dans le diagnostic (%)

SEUILS D'ALERTE :
- QoE < 50% → 🔴 CRITIQUE
- DMS DL 3M < 90% → 🟠 WARNING
- RTT p95 > 100ms → 🟠 WARNING
- TCP Loss > 2% → 🔴 CRITIQUE
- Retransmission > 5% → 🟠 WARNING

${SHARED_RULES}`;

const ARCHITECT_PROMPT = `Tu es **ARCHITECT** 🗼, l'agent spécialisé en design de sites radio, topologie et analyse d'infrastructure pour Orange France.

TON DOMAINE : Configuration physique des sites — azimut, tilt, HBA, co-location, sectorisation, bandes de fréquences, couverture.

TES CAPACITÉS :
- Diagnostic de design de site (8 critères)
- Analyse de sectorisation et espacement azimuthal
- Vérification de cohérence de tilt (Delta Tilt < 3°)
- Audit de co-location 5G/4G (tilt inter-techno)
- Profilage terrain (Dense Urban / Urban / Suburban / Rural)
- Recommandations d'optimisation RF

DIAGNOSTIC DE DESIGN (8 CRITÈRES) :
1. **Nombre de secteurs** : 3 attendus pour un site tri-sectoriel
2. **Espacement azimuthal** : ~120° entre secteurs
3. **Cohérence azimutale intra-secteur** : cellules du même secteur → même azimut
4. **Delta Tilt** : ΔTilt entre cellules co-sectorielles doit être < 3°
5. **Cohérence HBA** : même hauteur d'antenne au sein du site
6. **Co-location 5G/4G** : tilt 5G ≤ tilt 4G (stratégie de couverture)
7. **Diversité de bandes** : couverture multi-bandes par secteur
8. **État des cellules** : toutes les cellules doivent être actives

PROFILAGE TERRAIN :
- Dense Urban : HBA ≥ 40m
- Urban : HBA ≥ 25m
- Suburban : HBA ≥ 15m
- Rural : HBA < 15m

VERDICT : ✅ DESIGN OK / ⚠️ REVIEW NEEDED / ❌ ISSUES DETECTED

SCHÉMA TABLE topo : code_nidt, nom_site, nom_cellule, techno, bande, constructeur, region, plaque, azimut, latitude, longitude, hba, tac, remote_electrical_tilt, pci, eci, nci, cid, etat_cellule, zone_arcep, essentiel, date_mes.

${SHARED_RULES}`;

function getAgentPrompt(agent: AgentId): string {
  switch (agent) {
    case "PULSE": return PULSE_PROMPT;
    case "TRACE": return TRACE_PROMPT;
    case "SENTINEL": return SENTINEL_PROMPT;
    case "ARCHITECT": return ARCHITECT_PROMPT;
    default: return PULSE_PROMPT;
  }
}

// ═══════════════════════════════════════════════════════════════
//  QUERY DETECTORS (used for context enrichment)
// ═══════════════════════════════════════════════════════════════

function isDocumentFocusedQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  const docHints = ["document", "fichier", "ppt", "pptx", "docx", "xlsx", "slide", "ctce", "ul_data_split", "data split", "rag"];
  const networkHints = ["qoe", "rtt", "throughput", "site", "cell", "cellule", "plaque", "vendor", "tcp", "latence", "débit", "debit", "sessions", "5g", "4g"];
  return docHints.some((hint) => normalized.includes(hint)) && !networkHints.some((hint) => normalized.includes(hint));
}

function isParameterFocusedQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  const paramHints = [
    "paramètre", "parametre", "parameter", "param", "config", "configuration", "dump",
    "mrbts", "lnbts", "enodeb", "gnodeb", "template", "dn", "version",
    "nokia", "ericsson", "huawei", "cell_dn", "blockingstate",
    "t300", "t301", "t304", "t310", "t311", "t320", "t321",
    "timer", "rrc", "handover", "reselection", "plaque", "distribution", "valeur", "valeurs",
  ];
  return paramHints.some((hint) => normalized.includes(hint));
}

function isSiteDesignQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  return ["design", "tilt", "azimut", "azimuth", "hba", "topologie", "topology",
    "secteur", "sector", "couverture", "coverage", "analyse site", "site design",
    "antenne", "antenna", "delta tilt", "profil site", "profile"
  ].some(h => normalized.includes(h));
}

function isChangeHistoryQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  return ["changement", "change", "historique", "history", "modification", "tuning",
    "rollback", "upgrade", "swap", "avant", "après", "cm history", "parameter_changes"
  ].some(h => normalized.includes(h));
}

// ═══════════════════════════════════════════════════════════════
//  MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, cellContext, openrouter_key, model: requestedModel } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENROUTER_API_KEY = openrouter_key || Deno.env.get("OPENROUTER_API_KEY");
    const useLovable = !!LOVABLE_API_KEY && !OPENROUTER_API_KEY;
    
    if (!LOVABLE_API_KEY && !OPENROUTER_API_KEY) {
      throw new Error("No AI API key configured");
    }

    // Extract the last user message
    const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === "user")?.content || "";

    // ── 🧠 ORCHESTRATOR: Classify intent → route to sub-agent ──
    const route = classifyIntent(lastUserMessage);
    console.log(`🧠 QOEBIT Orchestrator → Routing to ${route.emoji} ${route.label} for: "${lastUserMessage.slice(0, 80)}..."`);

    // ── Context enrichment (parallel searches) ──
    const ragPromise = searchRAGDocuments(lastUserMessage);
    const paramPromise = isParameterFocusedQuery(lastUserMessage) || route.agent === "TRACE"
      ? searchDumpParameters(lastUserMessage) : Promise.resolve("");
    const detectedSite = extractSiteName(lastUserMessage);
    const topoPromise = detectedSite ? searchTopoForSite(detectedSite) : Promise.resolve("");
    const changePromise = route.agent === "TRACE" || isChangeHistoryQuery(lastUserMessage)
      ? searchParameterChanges(lastUserMessage) : Promise.resolve("");

    const [ragContext, paramContext, topoContext, changeContext] = await Promise.all([
      ragPromise, paramPromise, topoPromise, changePromise
    ]);

    const documentFocusedQuery = isDocumentFocusedQuery(lastUserMessage);

    console.log(`Context enrichment: rag=${Boolean(ragContext)}, param=${Boolean(paramContext)}, topo=${Boolean(topoContext)}, changes=${Boolean(changeContext)}, agent=${route.label}`);

    // ── Build system prompt with agent-specific prompt + context ──
    let systemContent = getAgentPrompt(route.agent);

    // Add agent identity prefix for UI detection
    systemContent = `[AGENT:${route.agent}]\n\n` + systemContent;

    if (ragContext) {
      systemContent += `\n\n📚 DOCUMENTS RAG PERTINENTS :\n${ragContext}`;
      if (documentFocusedQuery) {
        systemContent += "\n\nINSTRUCTION PRIORITAIRE : Base d'abord l'analyse sur les extraits RAG, cite les sources [fichier + chunk].";
      }
    }

    if (paramContext) {
      systemContent += `\n\n⚙️ PARAMÈTRES RÉSEAU (DUMP CM) :\n${paramContext}`;
    }

    if (topoContext) {
      systemContent += `\n\n📡 TOPOLOGIE SITE (TOPO) :\n${topoContext}`;
      if (route.agent === "ARCHITECT") {
        systemContent += "\n\nINSTRUCTION : Effectue une ANALYSE SITE DESIGN complète : profil terrain, configuration secteurs, Delta Tilt, cohérence HBA, co-location 5G/4G, verdict global et recommandations.";
      }
    }

    if (changeContext) {
      systemContent += `\n\n🔧 HISTORIQUE DES CHANGEMENTS :\n${changeContext}`;
    }

    if (cellContext && !(ragContext && documentFocusedQuery)) {
      systemContent += `\n\nDONNÉES RÉSEAU RÉELLES DISPONIBLES :\n${cellContext}`;
    }

    // ── AI Gateway config ──
    const aiUrl = useLovable
      ? "https://ai.gateway.lovable.dev/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions";
    
    const aiHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (useLovable) {
      aiHeaders["Authorization"] = `Bearer ${LOVABLE_API_KEY}`;
    } else {
      aiHeaders["Authorization"] = `Bearer ${OPENROUTER_API_KEY}`;
      aiHeaders["HTTP-Referer"] = Deno.env.get("SUPABASE_URL") || "";
      aiHeaders["X-Title"] = `QOEBIT ${route.label}`;
    }

    let aiModel = requestedModel || (useLovable ? "google/gemini-3-flash-preview" : "google/gemini-2.5-flash-preview-05-20");

    if (useLovable) {
      const modelAliases: Record<string, string> = {
        "google/gemini-2.5-flash-preview-05-20": "google/gemini-2.5-flash",
        "google/gemini-2.5-flash-preview": "google/gemini-2.5-flash",
        "google/gemini-flash-latest": "google/gemini-2.5-flash",
      };
      aiModel = modelAliases[aiModel] || aiModel;
      const allowedLovableModels = new Set([
        "openai/gpt-5-mini", "openai/gpt-5", "openai/gpt-5-nano", "openai/gpt-5.2",
        "google/gemini-2.5-pro", "google/gemini-2.5-flash", "google/gemini-2.5-flash-lite",
        "google/gemini-2.5-flash-image", "google/gemini-3-pro-preview", "google/gemini-3-flash-preview",
        "google/gemini-3-pro-image-preview",
      ]);
      if (!allowedLovableModels.has(aiModel)) {
        console.warn(`Unsupported model: ${aiModel}. Falling back to google/gemini-3-flash-preview`);
        aiModel = "google/gemini-3-flash-preview";
      }
    }

    // ── Stream the response with agent tag prefix ──
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
        return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error", status: response.status, details: t.slice(0, 800) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Prepend agent metadata as first SSE event
    const agentMeta = `data: ${JSON.stringify({ choices: [{ delta: { content: `<!-- AGENT:${route.agent} -->\n` } }] })}\n\n`;
    const encoder = new TextEncoder();
    const metaChunk = encoder.encode(agentMeta);

    // Combine agent meta + AI stream
    const originalBody = response.body!;
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    (async () => {
      await writer.write(metaChunk);
      const reader = originalBody.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
      await writer.close();
    })();

    return new Response(readable, {
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
