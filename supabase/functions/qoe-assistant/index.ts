import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ═══════════════════════════════════════════════════════════════
//  TYPES (Context-on-Demand)
// ═══════════════════════════════════════════════════════════════

type AgentId = "PULSE" | "TRACE" | "SENTINEL" | "TOPO" | "PARMY";

type Intent =
  | "global_summary"
  | "top_degradations"
  | "site_analysis"
  | "cell_analysis"
  | "compare"
  | "definition"
  | "trace_change"
  | "distribution"
  | "list_dimension_values"
  | "param_audit"
  | "other";

type Scope =
  | { level: "global" }
  | { level: "vendor"; vendor: string }
  | { level: "techno"; techno: string }
  | { level: "plaque"; plaque: string }
  | { level: "dor"; dor: string }
  | { level: "site"; siteName: string }
  | { level: "cell"; cellId: string; siteName?: string };

type DataNeed =
  | "agg_stats"
  | "worst_sites"
  | "best_sites"
  | "worst_cells"
  | "best_cells"
  | "kpi_snapshot"
  | "kpi_timeseries"
  | "alarms"
  | "topology"
  | "param_dump"
  | "parmy_sql"
  | "change_history"
  | "documents_rag"
  | "dimension_agg"
  | "dimension_values"
  | "topo_metric_agg"
  | "topo_inventory";

type Dimension1Type =
  | "Cellule" | "Site" | "Vendor" | "Bande" | "ARCEP" | "Application"
  | "RAT" | "TAC" | "AS" | "POP" | "Device_brand" | "OS" | "DOR"
  | "Plaque" | "ORF" | "application";

interface ContextPlan {
  agent: AgentId;
  intent: Intent;
  scope: Scope;
  needs: DataNeed[];
  limits: {
    maxSites: number;
    maxCells: number;
    maxKpis: number;
    maxDays: number;
    maxRagChunks: number;
  };
  groupBy?: { dimension1: string };
  metric?: string;
  resultLimit?: number;
  clarificationNeeded?: boolean;
  clarificationQuestion?: string;
}

interface UiScope {
  selectedSiteName?: string | null;
  selectedCellId?: string | null;
  page?: string;
}

interface AssistantFilters {
  vendor?: string;
  techno?: string;
  plaque?: string;
  dor?: string;
  dateRange?: { from: string; to: string };
}

// ═══════════════════════════════════════════════════════════════
//  UTILITIES (RAG, param, topo, changes — kept but now conditional)
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

function buildRAGContext(docs: RAGDoc[], maxChunks: number): string {
  return docs.slice(0, maxChunks).map((doc) => {
    const score = typeof doc.similarity === "number" ? `score: ${doc.similarity.toFixed(2)}` : "score: lexical";
    const chunk = typeof doc.chunk_index === "number" ? ` | chunk: ${doc.chunk_index}` : "";
    return `[${doc.filename}${chunk} | ${score}]\n${doc.content.slice(0, 900)}`;
  }).join("\n\n---\n\n");
}

async function searchRAGDocuments(query: string, maxChunks = 3): Promise<string> {
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
    const semanticCount = isShortQuery ? 6 : 4;

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
        supabase.from("rag_documents").select("filename, content, chunk_index").ilike("filename", `%${normalizedLikeQuery}%`).order("created_at", { ascending: false }).limit(4),
        supabase.from("rag_documents").select("filename, content, chunk_index").ilike("content", `%${normalizedLikeQuery}%`).order("created_at", { ascending: false }).limit(4)
      );
    }
    for (const term of terms.slice(0, 3)) {
      lexicalQueries.push(
        supabase.from("rag_documents").select("filename, content, chunk_index").ilike("content", `%${term}%`).order("created_at", { ascending: false }).limit(2)
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
    console.log(`RAG retrieval for "${cleanedQuery.slice(0, 40)}": semantic=${semanticDocs.length}, lexical=${lexicalDocs.length}, merged=${mergedDocs.length}`);
    if (mergedDocs.length === 0) return "";
    return buildRAGContext(mergedDocs, maxChunks);
  } catch (e) {
    console.error("RAG search failed:", e);
    return "";
  }
}

function isDimensionQuery(query: string): { isDim: boolean; isList: boolean } {
  const n = query.toLowerCase();
  // Use a shared dimension keyword pattern (with plural tolerance)
  const dimKw = "(dors?|vendor|fournisseurs?|bandes?|rats?|techno|technologie|plaques?|regions?|applications?|sites?|cellules?|arcep|tac|os|devices?|pop|as|orf)";
  const dimPatterns = [
    new RegExp(`\\bpar\\s+${dimKw}`, "i"),
    new RegExp(`\\bliste?r?\\s+(des?\\s+|les?\\s+)?${dimKw}`, "i"),
    new RegExp(`\\btous?t?e?s?\\s+(les?\\s+)?${dimKw}`, "i"),
  ];
  const isList = new RegExp(`\\b(liste?r?|tous?t?e?s?|toutes?|affiche|montre|donne)\\s+(les?\\s+|des?\\s+)?${dimKw}`, "i").test(n);
  const isDim = dimPatterns.some(p => p.test(n));
  return { isDim: isDim || isList, isList };
}

function isDistributionQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  const { isDim } = isDimensionQuery(query);
  return isDim || ["distribution", "répartition", "repartition",
    "par plaque", "par upr", "par vendor", "par site", "par bande", "par dor", "par region", "par zone"
  ].some((h) => normalized.includes(h));
}

function detectDimension1Type(message: string): Dimension1Type {
  const n = message.toLowerCase();
  const map: [RegExp, Dimension1Type][] = [
    [/\b(dors?|direction)\b/, "DOR"],
    [/\b(vendors?|fournisseurs?|constructeurs?)\b/, "Vendor"],
    [/\b(bandes?|bands?|frequen)\b/, "Bande"],
    [/\b(rats?|techno|technologie|4g\s*(vs|et)\s*5g|5g\s*(vs|et)\s*4g)\b/, "RAT"],
    [/\b(plaques?|regions?)\b/, "Plaque"],
    [/\b(applications?|apps?|services?)\b/, "Application"],
    [/\b(sites?)\b/, "Site"],
    [/\b(cellules?|cells?)\b/, "Cellule"],
    [/\b(arcep|zone_arcep)\b/, "ARCEP"],
    [/\b(tac)\b/, "TAC"],
    [/\b(os)\b/, "OS"],
    [/\b(devices?|terminaux?|terminals?|handsets?)\b/, "Device_brand"],
    [/\b(pop)\b/, "POP"],
    [/\b(as)\b/, "AS"],
    [/\b(orf)\b/, "ORF"],
  ];
  for (const [regex, dim] of map) {
    if (regex.test(n)) return dim;
  }
  return "Site"; // default
}

function detectMetric(message: string): string {
  const n = message.toLowerCase();
  const map: [RegExp, string][] = [
    [/\b(tilt|e[\s-]?tilt|inclinaison)\b/, "tilt"],
    [/\b(azimut|azimuth|orientation)\b/, "azimut"],
    [/\b(hba|hauteur\s*antenne|hauteur\s*bas)\b/, "hba"],
    [/\b(qos)\b/, "qos"],
    [/\b(qoe|qualit[eé])\b/, "qoe_index"],
    [/\b(debit\s*dl|throughput\s*dl|dl_throughput|débit\s*dl)\b/, "debit_dl"],
    [/\b(debit\s*ul|throughput\s*ul|ul_throughput|débit\s*ul)\b/, "debit_ul"],
    [/\b(rtt|latence|latency)\b/, "rtt_data_avg"],
    [/\b(traffic|volume|trafic)\b/, "volume_totale_dl"],
    [/\b(loss|perte)\b/, "loss_dl_rate"],
    [/\b(retrans|retr)\b/, "tcp_retr_rate_dl"],
    [/\b(dms\s*3|dms_3|dms3)\b/, "dms_debit_dl_3"],
    [/\b(dms\s*8|dms_8|dms8)\b/, "dms_debit_dl_8"],
    [/\b(dms\s*30|dms_30|dms30)\b/, "dms_debit_dl_30"],
    [/\b(session|sessions)\b/, "session_nbr"],
    [/\b(drop|dcr|coupure)\b/, "session_dcr"],
    [/\b(window\s*full|wind_full)\b/, "wind_full_rate"],
  ];
  for (const [regex, metric] of map) {
    if (regex.test(n)) return metric;
  }
  return "qoe_index"; // default
}

const TOPO_METRICS = new Set(["tilt", "azimut", "hba"]);

// ── Data providers for dimension queries on kpi_qoe_aggregated ──

async function fetchMetricDistributionByDimension1(
  dimension1Type: string,
  metric: string,
  filters?: AssistantFilters,
  days = 7,
  limit = 30
): Promise<string> {
  try {
    const supabase = getSupabase();
    
    // First check which columns exist
    const selectCols = `dimension_1, dimension_2, date_part, ${metric}, session_nbr`;
    
    let q = supabase.from("kpi_qoe_aggregated")
      .select(selectCols)
      .eq("dimension_1", dimension1Type)
      .not(metric, "is", null)
      .order("date_part", { ascending: false })
      .limit(1000);

    // Apply additional filters if present
    if (filters?.vendor) q = q.ilike("dimension_2", `%${filters.vendor}%`);

    const { data, error } = await q;
    if (error) {
      console.error("fetchMetricDistribution error:", error);
      // Try without session_nbr if it fails
      const q2 = supabase.from("kpi_qoe_aggregated")
        .select(`dimension_1, dimension_2, date_part, ${metric}`)
        .eq("dimension_1", dimension1Type)
        .not(metric, "is", null)
        .order("date_part", { ascending: false })
        .limit(1000);
      const { data: data2, error: error2 } = await q2;
      if (error2) { console.error("fetchMetricDistribution retry error:", error2); return ""; }
      if (!data2?.length) return `Aucune donnée pour dimension_1='${dimension1Type}'.`;
      return aggregateDistributionData(data2, dimension1Type, metric, limit, false);
    }
    if (!data?.length) return `Aucune donnée pour dimension_1='${dimension1Type}'.`;

    return aggregateDistributionData(data, dimension1Type, metric, limit, true);
  } catch (e) {
    console.error("fetchMetricDistribution failed:", e);
    return "";
  }
}

function aggregateDistributionData(
  data: any[],
  dimension1Type: string,
  metric: string,
  limit: number,
  hasSessionNbr: boolean
): string {
  const groups = new Map<string, { values: number[]; sessions: number }>();
  for (const r of data) {
    const label = r.dimension_2 || "N/A";
    if (!groups.has(label)) groups.set(label, { values: [], sessions: 0 });
    const g = groups.get(label)!;
    const val = r[metric];
    if (val != null) g.values.push(Number(val));
    if (hasSessionNbr && r.session_nbr != null) g.sessions += Number(r.session_nbr);
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  
  const sorted = Array.from(groups.entries())
    .map(([label, g]) => ({ label, avg: avg(g.values), count: g.values.length, sessions: g.sessions }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, limit);

  const header = hasSessionNbr
    ? `# | ${dimension1Type} | AVG(${metric}) | Points | Sessions`
    : `# | ${dimension1Type} | AVG(${metric}) | Points`;
  
  const lines = sorted.map((r, i) => {
    const base = `${i + 1} | ${r.label} | ${r.avg.toFixed(2)} | ${r.count}`;
    return hasSessionNbr ? `${base} | ${r.sessions}` : base;
  });

  // Also build chart data for the LLM
  const chartData = sorted.slice(0, 15).map(r => ({ label: r.label, value: Math.round(r.avg * 100) / 100 }));
  const chartJson = JSON.stringify({
    type: "bar",
    title: `${metric} par ${dimension1Type}`,
    xKey: "label",
    yKeys: ["value"],
    data: chartData,
  });

  return `DISTRIBUTION ${metric} par ${dimension1Type} (${data.length} points, ${groups.size} valeurs):\n${header}\n${lines.join("\n")}\n\nINSTRUCTION: Utilise ces données pour répondre. Inclus ce chart:\n\`\`\`chart\n${chartJson}\n\`\`\``;
}

async function fetchDimensionValues(
  dimension1Type: string,
  filters?: AssistantFilters,
  days = 7,
  limit = 200
): Promise<string> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("kpi_qoe_aggregated")
      .select("dimension_2")
      .eq("dimension_1", dimension1Type)
      .order("dimension_2")
      .limit(1000);

    if (error) { console.error("fetchDimensionValues error:", error); return ""; }
    if (!data?.length) return `Aucune valeur trouvée pour dimension_1='${dimension1Type}'.`;

    const unique = [...new Set(data.map((r: any) => r.dimension_2).filter(Boolean))].sort().slice(0, limit);
    return `VALEURS DISTINCTES pour ${dimension1Type} (${unique.length}):\n${unique.join(", ")}\n\nINSTRUCTION: Liste ces valeurs à l'utilisateur dans un format lisible.`;
  } catch (e) {
    console.error("fetchDimensionValues failed:", e);
    return "";
  }
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

async function fetchTopoMetricByDimension(
  metric: string,
  dimension: string,
  limit = 30
): Promise<string> {
  try {
    const supabase = getSupabase();
    // Map dimension keywords to topo column names
    const dimColMap: Record<string, string> = {
      DOR: "dor", Vendor: "constructeur", Bande: "bande", Plaque: "plaque",
      Site: "nom_site", ARCEP: "zone_arcep", Cellule: "nom_cellule",
      RAT: "techno",
    };
    const groupCol = dimColMap[dimension] || "dor";

    const { data, error } = await supabase
      .from("topo")
      .select(`${groupCol}, ${metric}`)
      .not(metric, "is", null)
      .limit(50000);

    if (error) { console.error("fetchTopoMetricByDimension error:", error); return ""; }
    if (!data?.length) return `Aucune donnée topo pour ${metric}.`;

    // Aggregate
    const groups = new Map<string, { values: number[]; count: number }>();
    for (const r of data) {
      const label = (r as any)[groupCol] || "N/A";
      if (!groups.has(label)) groups.set(label, { values: [], count: 0 });
      const g = groups.get(label)!;
      const val = (r as any)[metric];
      if (val != null) { g.values.push(Number(val)); g.count++; }
    }

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const sorted = Array.from(groups.entries())
      .map(([label, g]) => ({
        label,
        avg: avg(g.values),
        min: Math.min(...g.values),
        max: Math.max(...g.values),
        count: g.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    const header = `# | ${dimension} | AVG(${metric}) | MIN | MAX | Cells`;
    const lines = sorted.map((r, i) =>
      `${i + 1} | ${r.label} | ${r.avg.toFixed(1)} | ${r.min} | ${r.max} | ${r.count}`
    );

    const globalAvg = avg(data.map((r: any) => Number((r as any)[metric])).filter((v: number) => !isNaN(v)));

    const chartData = sorted.slice(0, 15).map(r => ({ label: r.label, value: Math.round(r.avg * 10) / 10 }));
    const chartJson = JSON.stringify({
      type: "bar",
      title: `${metric} moyen par ${dimension}`,
      xKey: "label",
      yKeys: ["value"],
      data: chartData,
    });

    return `DISTRIBUTION TOPO ${metric} par ${dimension} (${data.length} cellules, ${groups.size} groupes, moyenne globale: ${globalAvg.toFixed(1)}):\n${header}\n${lines.join("\n")}\n\nINSTRUCTION: Présente ces données de la table TOPO. Inclus ce chart:\n\`\`\`chart\n${chartJson}\n\`\`\``;
  } catch (e) {
    console.error("fetchTopoMetricByDimension failed:", e);
    return "";
  }
}

async function searchTopoForSite(siteName: string): Promise<string> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from("topo")
      .select("code_nidt, nom_site, nom_cellule, techno, bande, constructeur, region, plaque, azimut, latitude, longitude, hba, tac, tilt, pci, eci, nci, cid, etat_cellule, zone_arcep, essentiel, date_mes, date_fn8, dor")
      .ilike("nom_site", `%${siteName}%`)
      .order("nom_cellule")
      .limit(100);

    if (error) { console.error("Topo search error:", error); return ""; }
    if (!data?.length) return "";

    const header = "nom_cellule | techno | bande | azimut | tilt | hba | pci | tac | etat | constructeur | dor | lat | lng";
    const lines = data.map((r: any) =>
      `${r.nom_cellule} | ${r.techno || ""} | ${r.bande || ""} | ${r.azimut ?? "-"} | ${r.tilt ?? "-"} | ${r.hba ?? "-"} | ${r.pci ?? "-"} | ${r.tac ?? "-"} | ${r.etat_cellule || "-"} | ${r.constructeur || "-"} | ${r.dor || "-"} | ${r.latitude ?? "-"} | ${r.longitude ?? "-"}`
    );

    const sectorMap = new Map<number, any[]>();
    for (const r of data) {
      const sectorNum = parseInt(r.nom_cellule?.match(/(\d+)$/)?.[1] || "0");
      if (!sectorMap.has(sectorNum)) sectorMap.set(sectorNum, []);
      sectorMap.get(sectorNum)!.push(r);
    }

    let sectorAnalysis = "\n--- ANALYSE PAR SECTEUR ---\n";
    for (const [sNum, cells] of Array.from(sectorMap.entries()).sort(([a], [b]) => a - b)) {
      const azimuths = cells.map((c: any) => c.azimut).filter((a: any) => a != null);
      const tilts = cells.map((c: any) => c.tilt).filter((t: any) => t != null);
      const hbas = cells.map((c: any) => c.hba).filter((h: any) => h != null);
      const avgAz = azimuths.length ? Math.round(azimuths.reduce((a: number, b: number) => a + b, 0) / azimuths.length) : null;
      const deltaTilt = tilts.length >= 2 ? Math.max(...tilts) - Math.min(...tilts) : null;
      const bands = [...new Set(cells.map((c: any) => c.bande).filter(Boolean))];
      sectorAnalysis += `Secteur ${sNum}: ${cells.length} cellules, Az=${avgAz ?? "-"}°, Bandes=[${bands.join(",")}]`;
      if (tilts.length) sectorAnalysis += `, Tilts=[${tilts.join(",")}]`;
      if (deltaTilt != null) sectorAnalysis += `, DTilt=${deltaTilt}°${deltaTilt > 3 ? " ⚠️" : ""}`;
      if (hbas.length) sectorAnalysis += `, HBA=[${[...new Set(hbas)].join(",")}]m`;
      sectorAnalysis += "\n";
    }

    const first = data[0];
    return `TOPO "${first.nom_site}" (${first.code_nidt}, ${first.region || "-"}, ${first.plaque || "-"}, ${first.constructeur || "-"}, ${first.dor || "-"}, ${first.latitude},${first.longitude})\n${data.length} cells:\n${header}\n${lines.join("\n")}${sectorAnalysis}`;
  } catch (e) {
    console.error("Topo site search failed:", e);
    return "";
  }
}

async function fetchTopoInventory(filters?: AssistantFilters): Promise<string> {
  try {
    const supabase = getSupabase();

    // Use the RPC function for accurate counts (no 1000-row limit)
    const { data, error } = await supabase.rpc("topo_inventory_stats");
    if (error) {
      console.error("topo_inventory_stats RPC error:", error);
      return "";
    }
    if (!data) return "";

    const stats = data as any;
    let result = `INVENTAIRE TOPOLOGIQUE (données exactes de la table topo)\n`;
    result += `Total cellules: ${stats.total_cells}\n`;
    result += `Total sites distincts: ${stats.total_sites}\n`;
    result += `Moyenne cellules/site: ${stats.total_sites ? (stats.total_cells / stats.total_sites).toFixed(1) : "?"}\n\n`;

    if (stats.by_techno) {
      const technoEntries = Object.entries(stats.by_techno).sort(([,a],[,b]) => (b as number) - (a as number));
      result += `Par Technologie:\n${technoEntries.map(([k,v]) => `  ${k}: ${v}`).join("\n")}\n\n`;
    }
    if (stats.by_bande) {
      const bandeEntries = Object.entries(stats.by_bande).sort(([,a],[,b]) => (b as number) - (a as number));
      result += `Par Bande:\n${bandeEntries.map(([k,v]) => `  ${k}: ${v}`).join("\n")}\n\n`;
      // Add chart instruction
      const chartData = bandeEntries.slice(0, 15).map(([k, v]) => ({ label: k, value: v }));
      result += `INSTRUCTION: Présente ces données dans un tableau Markdown ET inclus ce chart:\n\`\`\`chart\n${JSON.stringify({ type: "bar", title: "Cellules par Bande", xKey: "label", yKeys: ["value"], data: chartData })}\n\`\`\`\n\n`;
    }
    if (stats.by_constructeur) {
      result += `Par Constructeur:\n${Object.entries(stats.by_constructeur).sort(([,a],[,b]) => (b as number) - (a as number)).map(([k,v]) => `  ${k}: ${v}`).join("\n")}\n\n`;
    }
    if (stats.by_dor) {
      const dorEntries = Object.entries(stats.by_dor).sort(([,a],[,b]) => (b as number) - (a as number));
      result += `Par DOR:\n${dorEntries.map(([k,v]) => `  ${k}: ${v}`).join("\n")}`;
    }

    return result;
  } catch (e) {
    console.error("Topo inventory failed:", e);
    return "";
  }
}

async function searchDumpParameters(query: string): Promise<string> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const tableCandidates = ["dump_parametre", "dump_parameter", "parameter_dump"];
    let activeDumpTable: string | null = null;
    for (const tableName of tableCandidates) {
      const probe = await supabase.from(tableName).select("parameter").limit(1);
      if (!probe.error) { activeDumpTable = tableName; break; }
      const msg = probe.error?.message?.toLowerCase() || "";
      if (!msg.includes("does not exist") && !msg.includes("relation") && !msg.includes("could not find")) {
        activeDumpTable = tableName; break;
      }
    }
    if (!activeDumpTable) return "AUCUNE TABLE de paramètres trouvée.";

    const paramName = extractParamName(query);
    const isDistrib = isDistributionQuery(query);
    const siteName = extractSiteName(query);
    const plaqueName = extractPlaqueName(query);

    if (plaqueName && !isDistrib) {
      let q = supabase.from(activeDumpTable).select("cell_name, site_name, parameter, value, vendor, bande, plaque").ilike("plaque", `%${plaqueName}%`);
      if (paramName) q = q.ilike("parameter", `%${paramName}%`);
      const { data, error } = await q.order("cell_name").limit(200);
      if (error) console.error(`${activeDumpTable} plaque search error:`, error);
      if (!data?.length) return `AUCUNE DONNÉE pour plaque "${plaqueName}"${paramName ? ` / param "${paramName}"` : ""}.`;
      const header = "cell_name | site_name | parameter | value | vendor | bande";
      const lines = data.map((r: any) => `${r.cell_name || ""} | ${r.site_name || ""} | ${r.parameter || ""} | ${r.value || ""} | ${r.vendor || ""} | ${r.bande || ""}`);
      return `PLAQUE ${plaqueName}${paramName ? ` / ${paramName}` : ""} (${data.length}):\n${header}\n${lines.join("\n")}`;
    }

    if (paramName && siteName && !isDistrib) {
      const { data, error } = await supabase.from(activeDumpTable)
        .select("dn, cell_name, site_name, parameter, value, version, vendor, bande, plaque")
        .ilike("parameter", `%${paramName}%`).ilike("site_name", `%${siteName}%`).order("cell_name").limit(200);
      if (error) console.error(`${activeDumpTable} site search error:`, error);
      if (!data?.length) return `AUCUNE DONNÉE pour "${paramName}" sur "${siteName}".`;
      const header = "dn | cell_name | site_name | parameter | value | version | vendor | bande";
      const lines = data.map((r: any) => `${r.dn || ""} | ${r.cell_name || ""} | ${r.site_name || ""} | ${r.parameter || ""} | ${r.value || ""} | ${r.version || ""} | ${r.vendor || ""} | ${r.bande || ""}`);
      return `${paramName} sur ${siteName} (${data.length}):\n${header}\n${lines.join("\n")}`;
    }

    if (isDistrib && paramName) {
      const groupCol = extractGroupByColumn(query);
      const { data, error } = await supabase.from(activeDumpTable).select(`${groupCol}, value, parameter`).ilike("parameter", `%${paramName}%`).limit(1000);
      if (error) console.error(`${activeDumpTable} aggregation error:`, error);
      if (!data?.length) return `AUCUNE DONNÉE pour "${paramName}".`;
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
      const header = `dimension | valeur | nb | pct_dim | pct_global`;
      const lines = Array.from(agg.entries()).map(([key, count]) => {
        const [dim, val] = key.split("::");
        const dimTotal = dimTotals.get(dim) || 1;
        return `${dim} | ${val} | ${count} | ${((count / dimTotal) * 100).toFixed(1)}% | ${((count / total) * 100).toFixed(1)}%`;
      }).sort();
      return `DISTRIBUTION ${paramName} par ${groupCol} (${total} cells):\n${header}\n${lines.join("\n")}\n\nINSTRUCTION: Génère un \`\`\`chart groupé.`;
    }

    const terms = extractSearchTerms(query);
    if (terms.length === 0) return "";
    const queries = terms.slice(0, 3).map((term) =>
      supabase.from(activeDumpTable!).select("dn, cell_name, vendor, site_name, parameter, version, value")
        .or(`parameter.ilike.%${term}%,site_name.ilike.%${term}%`).limit(30)
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
    if (rows.length === 0) return `AUCUNE DONNÉE pour: ${terms.join(", ")}`;
    const header = "dn | cell_name | vendor | site_name | parameter | version | value";
    const lines = rows.slice(0, 50).map((r: any) =>
      `${r.dn || ""} | ${r.cell_name || ""} | ${r.vendor || ""} | ${r.site_name || ""} | ${r.parameter || ""} | ${r.version || ""} | ${r.value || ""}`
    );
    return `Paramètres (${rows.length}):\n${header}\n${lines.join("\n")}`;
  } catch (e) {
    console.error("dump_parameter search failed:", e);
    return "";
  }
}

// ═══════════════════════════════════════════════════════════════
//  PARMY SQL ENGINE — AI-powered SQL generation for parameter_dump
// ═══════════════════════════════════════════════════════════════

const PARMY_SQL_SCHEMA = `
Table: parameter_dump
Columns:
  - site_name (text) — site identifier
  - cell_name (text) — cell identifier  
  - cell_dn (text) — cell distinguished name
  - dn (text) — distinguished name (MO path)
  - parameter (text) — parameter name (e.g. LNCEL.pMax, NRCELL.dlMimoMode)
  - value (text) — parameter value (as text, cast to numeric if needed)
  - version (text) — software version
  - vendor (text) — equipment vendor (Nokia, Ericsson, etc.)
  - bande (text) — frequency band (NR_3500, LTE2100, etc.)
  - plaque (text) — regional plaque
  - dor (text) — DOR region
  - zone_arcep (text) — ARCEP zone classification
  - netact (text) — network management system
  - mrbts_id (integer) — MRBTS identifier
  - enodeb_id (integer) — eNodeB identifier
  - gnodeb_id (integer) — gNodeB identifier
  - latitude (double precision)
  - longitude (double precision)

IMPORTANT RULES:
- ONLY generate SELECT queries on parameter_dump
- Always include LIMIT (max 500)
- Use ILIKE for text matching
- For numeric analysis, CAST value to numeric: CAST(value AS numeric)
- Use GROUP BY for aggregations
- Common patterns: COUNT, COUNT(DISTINCT ...), distribution with GROUP BY value, cross-tab with GROUP BY vendor/plaque/bande
`;

async function generateAndExecuteParmySql(
  userQuery: string,
  filters?: AssistantFilters
): Promise<string> {
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const useLovable = !!LOVABLE_API_KEY && !OPENROUTER_API_KEY;

    if (!LOVABLE_API_KEY && !OPENROUTER_API_KEY) {
      return "SQL engine unavailable: no AI API key configured.";
    }

    // Build filter context
    let filterContext = "";
    if (filters?.vendor) filterContext += `\nActive filter: vendor = '${filters.vendor}'`;
    if (filters?.plaque) filterContext += `\nActive filter: plaque = '${filters.plaque}'`;
    if (filters?.dor) filterContext += `\nActive filter: dor = '${filters.dor}'`;

    const sqlPrompt = `You are a SQL expert. Generate a PostgreSQL SELECT query for the parameter_dump table based on the user's question.

${PARMY_SQL_SCHEMA}
${filterContext}

User question: "${userQuery}"

Rules:
1. Output ONLY the SQL query, no explanation, no markdown code block
2. ONLY SELECT from parameter_dump
3. Always add LIMIT 500 at the end
4. Use ILIKE for text pattern matching
5. For value distributions, GROUP BY value and ORDER BY count DESC
6. For cross-dimension analysis, use multiple GROUP BY columns
7. Apply any active filters as WHERE conditions
8. If the user asks about a specific parameter (e.g. LNCEL.pMax), filter on parameter ILIKE '%LNCEL.pMax%'
9. For numeric comparisons on value column, use: CAST(NULLIF(value, '') AS numeric)
10. Include useful aggregations: COUNT(*), COUNT(DISTINCT site_name), COUNT(DISTINCT cell_name)

Generate the SQL now:`;

    const aiUrl = useLovable
      ? "https://ai.gateway.lovable.dev/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions";

    const aiHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (useLovable) {
      aiHeaders["Authorization"] = `Bearer ${LOVABLE_API_KEY}`;
    } else {
      aiHeaders["Authorization"] = `Bearer ${OPENROUTER_API_KEY}`;
    }

    const model = useLovable ? "google/gemini-2.5-flash-lite" : "google/gemini-2.5-flash-preview-05-20";

    const aiResponse = await fetch(aiUrl, {
      method: "POST",
      headers: aiHeaders,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: sqlPrompt }],
        stream: false,
      }),
    });

    if (!aiResponse.ok) {
      console.error("PARMY SQL gen AI error:", aiResponse.status);
      return "";
    }

    const aiData = await aiResponse.json();
    let generatedSql = aiData.choices?.[0]?.message?.content?.trim() || "";
    
    // Clean up: remove markdown code blocks if present
    generatedSql = generatedSql.replace(/^```(?:sql)?\n?/i, "").replace(/\n?```$/i, "").trim();
    
    if (!generatedSql || !generatedSql.toLowerCase().startsWith("select")) {
      console.error("PARMY SQL gen: invalid SQL output:", generatedSql);
      return "";
    }

    console.log(`⚙️ PARMY SQL generated: ${generatedSql.slice(0, 200)}`);

    // Execute via RPC
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc("execute_parmy_sql", { query_sql: generatedSql });

    if (error) {
      console.error("PARMY SQL execution error:", error);
      return `⚠️ SQL EXECUTION ERROR: ${error.message}\nGenerated SQL: ${generatedSql}`;
    }

    const rows = data as any[];
    if (!rows || rows.length === 0) {
      return `SQL QUERY (0 results):\n${generatedSql}\n\nAucun résultat trouvé.`;
    }

    // Format results as a table
    const columns = Object.keys(rows[0]);
    const header = columns.join(" | ");
    const separator = columns.map(() => "---").join(" | ");
    const lines = rows.slice(0, 100).map((r: any) =>
      columns.map(c => {
        const v = r[c];
        return v != null ? String(v) : "-";
      }).join(" | ")
    );

    // Build chart data if aggregation detected
    let chartBlock = "";
    if (generatedSql.toLowerCase().includes("group by") && columns.length >= 2) {
      const labelCol = columns[0];
      const valueCol = columns.find(c => c === "count" || c === "nb" || c === "total" || c === "avg_value" || c === "nb_cells" || c === "nb_sites") || columns[columns.length - 1];
      const chartData = rows.slice(0, 20).map((r: any) => ({
        label: String(r[labelCol] || "N/A").slice(0, 30),
        value: Number(r[valueCol]) || 0,
      }));
      chartBlock = `\n\nINSTRUCTION: Inclus ce chart:\n\`\`\`chart\n${JSON.stringify({
        type: "bar",
        title: `Résultat PARMY SQL`,
        xKey: "label",
        yKeys: ["value"],
        data: chartData,
      })}\n\`\`\``;
    }

    return `⚙️ PARMY SQL ENGINE — Requête exécutée avec succès\nSQL: ${generatedSql}\n\nRÉSULTATS (${rows.length} lignes):\n${header}\n${separator}\n${lines.join("\n")}${chartBlock}\n\nINSTRUCTION: Présente ces résultats de manière structurée avec analyse et recommandations.`;
  } catch (e) {
    console.error("PARMY SQL engine failed:", e);
    return "";
  }
}

async function searchParameterChanges(query: string): Promise<string> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const siteName = extractSiteName(query);
    let q = supabase.from("parameter_changes")
      .select("change_date, change_type, change_scope, param_name, old_value, new_value, site_name, cell_name, techno, vendor, plaque")
      .order("change_date", { ascending: false })
      .limit(80);
    if (siteName) q = q.ilike("site_name", `%${siteName}%`);
    const { data, error } = await q;
    if (error) { console.error("parameter_changes error:", error); return ""; }
    if (!data?.length) return siteName ? `AUCUN changement pour "${siteName}".` : "";
    const header = "date | type | scope | param | old | new | site | cell | techno | vendor";
    const lines = data.map((r: any) =>
      `${r.change_date} | ${r.change_type} | ${r.change_scope} | ${r.param_name} | ${r.old_value || "-"} | ${r.new_value || "-"} | ${r.site_name || "-"} | ${r.cell_name || "-"} | ${r.techno || "-"} | ${r.vendor || "-"}`
    );
    return `CHANGEMENTS (${data.length}):\n${header}\n${lines.join("\n")}`;
  } catch (e) {
    console.error("parameter_changes search failed:", e);
    return "";
  }
}

// ═══════════════════════════════════════════════════════════════
//  DATA PROVIDER — fetch targeted data from DB
// ═══════════════════════════════════════════════════════════════

function getSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function fetchAggStats(filters?: AssistantFilters, maxDays = 7): Promise<string> {
  try {
    const supabase = getSupabase();
    let q = supabase.from("kpi_qoe_aggregated")
      .select("dimension_1, dimension_2, date_part, qoe_index, debit_dl, debit_ul, rtt_data_avg, dms_debit_dl_3, dms_debit_dl_8, dms_debit_dl_30, tcp_retr_rate_dl, loss_dl_rate, session_dcr, session_nbr, wind_full_rate")
      .order("date_part", { ascending: false })
      .limit(500);

    if (filters?.vendor) {
      q = q.eq("dimension_1", "Vendor").ilike("dimension_2", `%${filters.vendor}%`);
    } else if (filters?.techno) {
      q = q.eq("dimension_1", "Techno");
    } else if (filters?.plaque) {
      q = q.eq("dimension_1", "Plaque").ilike("dimension_2", `%${filters.plaque}%`);
    } else if (filters?.dor) {
      q = q.eq("dimension_1", "DOR").ilike("dimension_2", `%${filters.dor}%`);
    }

    const { data, error } = await q;
    if (error) { console.error("fetchAggStats error:", error); return ""; }
    if (!data?.length) return "Aucune donnée agrégée disponible.";

    const groups = new Map<string, { qoe: number[]; dl: number[]; ul: number[]; rtt: number[]; dms3: number[]; dms8: number[]; dms30: number[]; loss: number[]; retr: number[]; sess: number; count: number }>();
    for (const r of data) {
      const key = r.dimension_2 || "Global";
      if (!groups.has(key)) groups.set(key, { qoe: [], dl: [], ul: [], rtt: [], dms3: [], dms8: [], dms30: [], loss: [], retr: [], sess: 0, count: 0 });
      const g = groups.get(key)!;
      if (r.qoe_index != null) g.qoe.push(r.qoe_index);
      if (r.debit_dl != null) g.dl.push(r.debit_dl);
      if (r.debit_ul != null) g.ul.push(r.debit_ul);
      if (r.rtt_data_avg != null) g.rtt.push(r.rtt_data_avg);
      if (r.dms_debit_dl_3 != null) g.dms3.push(r.dms_debit_dl_3);
      if (r.dms_debit_dl_8 != null) g.dms8.push(r.dms_debit_dl_8);
      if (r.dms_debit_dl_30 != null) g.dms30.push(r.dms_debit_dl_30);
      if (r.loss_dl_rate != null) g.loss.push(r.loss_dl_rate);
      if (r.tcp_retr_rate_dl != null) g.retr.push(r.tcp_retr_rate_dl);
      if (r.session_nbr != null) g.sess += r.session_nbr;
      g.count++;
    }

    const avg = (arr: number[]) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const header = "Dimension | Pts | QoE | DL_Mbps | UL_Mbps | RTT_ms | DMS3% | DMS8% | DMS30% | Loss% | Retr% | Sessions";
    const lines = Array.from(groups.entries()).map(([k, g]) =>
      `${k} | ${g.count} | ${avg(g.qoe).toFixed(1)} | ${avg(g.dl).toFixed(1)} | ${avg(g.ul).toFixed(1)} | ${avg(g.rtt).toFixed(0)} | ${avg(g.dms3).toFixed(1)} | ${avg(g.dms8).toFixed(1)} | ${avg(g.dms30).toFixed(1)} | ${(avg(g.loss) * 100).toFixed(2)} | ${(avg(g.retr) * 100).toFixed(2)} | ${g.sess}`
    );
    return `STATS AGRÉGÉES (${data.length} points, ${groups.size} dimensions):\n${header}\n${lines.join("\n")}`;
  } catch (e) {
    console.error("fetchAggStats failed:", e);
    return "";
  }
}

async function fetchWorstSites(filters: AssistantFilters | undefined, maxSites: number): Promise<string> {
  try {
    const supabase = getSupabase();
    let q = supabase.from("kpi_qoe_aggregated")
      .select("dimension_1, dimension_2, date_part, qoe_index, debit_dl, rtt_data_avg, dms_debit_dl_3, dms_debit_dl_8, dms_debit_dl_30, session_nbr, loss_dl_rate, tcp_retr_rate_dl")
      .not("qoe_index", "is", null)
      .order("qoe_index", { ascending: true })
      .limit(maxSites * 3);

    const { data, error } = await q;
    if (error) { console.error("fetchWorstSites error:", error); return ""; }
    if (!data?.length) return "Aucun site dégradé trouvé.";

    const seen = new Set<string>();
    const unique = data.filter(r => {
      const key = `${r.dimension_1}::${r.dimension_2}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, maxSites);

    const header = "# | Dim1 | Dim2 | Date | QoE | DL | RTT | DMS3 | DMS8 | DMS30 | Loss | Retr | Sessions";
    const lines = unique.map((r, i) =>
      `${i + 1} | ${r.dimension_1} | ${r.dimension_2} | ${r.date_part} | ${r.qoe_index?.toFixed(1) ?? "-"} | ${r.debit_dl?.toFixed(1) ?? "-"} | ${r.rtt_data_avg?.toFixed(0) ?? "-"} | ${r.dms_debit_dl_3?.toFixed(1) ?? "-"} | ${r.dms_debit_dl_8?.toFixed(1) ?? "-"} | ${r.dms_debit_dl_30?.toFixed(1) ?? "-"} | ${r.loss_dl_rate != null ? (r.loss_dl_rate * 100).toFixed(2) : "-"} | ${r.tcp_retr_rate_dl != null ? (r.tcp_retr_rate_dl * 100).toFixed(2) : "-"} | ${r.session_nbr ?? "-"}`
    );
    return `TOP ${unique.length} WORST (par QoE):\n${header}\n${lines.join("\n")}`;
  } catch (e) {
    console.error("fetchWorstSites failed:", e);
    return "";
  }
}

async function fetchSiteSnapshot(siteName: string): Promise<string> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("kpi_qoe_aggregated")
      .select("*")
      .or(`dimension_1.ilike.%${siteName}%,dimension_2.ilike.%${siteName}%`)
      .order("date_part", { ascending: false })
      .limit(30);

    if (error) { console.error("fetchSiteSnapshot error:", error); return ""; }
    if (!data?.length) return `Aucune donnée KPI pour le site "${siteName}".`;

    const kpis = ["qoe_index", "debit_dl", "debit_ul", "rtt_data_avg", "rtt_setup_avg", "dms_debit_dl_3", "dms_debit_dl_8", "dms_debit_dl_30", "loss_dl_rate", "tcp_retr_rate_dl", "session_dcr", "session_nbr", "wind_full_rate"];
    const lines = data.slice(0, 10).map(r => {
      const vals = kpis.map(k => {
        const v = (r as any)[k];
        return v != null ? (typeof v === "number" ? v.toFixed(2) : String(v)) : "-";
      });
      return `${r.date_part} | ${r.dimension_1} | ${r.dimension_2} | ${vals.join(" | ")}`;
    });
    return `SITE SNAPSHOT "${siteName}" (${data.length} pts):\nDate | Dim1 | Dim2 | ${kpis.join(" | ")}\n${lines.join("\n")}`;
  } catch (e) {
    console.error("fetchSiteSnapshot failed:", e);
    return "";
  }
}

// ═══════════════════════════════════════════════════════════════
//  🧠 CONTEXT PLANNER — Intent + Scope + Needs + Limits
// ═══════════════════════════════════════════════════════════════

function isParameterFocusedQuery(query: string): boolean {
  const n = query.toLowerCase();
  return ["paramètre", "parametre", "parameter", "param", "config", "configuration", "dump",
    "mrbts", "lnbts", "enodeb", "gnodeb", "template", "dn", "version",
    "nokia", "ericsson", "huawei", "cell_dn", "blockingstate",
    "t300", "t301", "t304", "t310", "t311", "t320", "t321",
    "timer", "rrc", "handover", "reselection", "distribution", "valeur", "valeurs",
  ].some((hint) => n.includes(hint));
}

function isChangeHistoryQuery(query: string): boolean {
  const n = query.toLowerCase();
  return ["changement", "change", "historique", "history", "modification", "tuning",
    "rollback", "upgrade", "swap", "avant", "après", "cm history", "parameter_changes"
  ].some(h => n.includes(h));
}

function isTopoInventoryQuery(query: string): boolean {
  const n = query.toLowerCase();
  const countHints = ["nombre", "combien", "count", "inventaire", "inventory", "nb site", "nb cellule", "nb cell", "total site", "total cell", "statistique topo", "stats topo", "nombes", "nbre"];
  const topoTargets = ["cellule", "cell", "site", "antenne", "antenna", "secteur", "sector", "bande", "techno"];
  return countHints.some(h => n.includes(h)) && topoTargets.some(t => n.includes(t));
}

function isSiteDesignQuery(query: string): boolean {
  const n = query.toLowerCase();
  return ["design", "tilt", "azimut", "azimuth", "hba", "topologie", "topology",
    "secteur", "sector", "couverture", "coverage", "analyse site", "site design",
    "antenne", "antenna", "delta tilt", "profil site", "profile",
    "nombre de cellule", "nombre de site", "nombre des cellule", "nombre des site",
    "combien de cellule", "combien de site", "inventaire", "nb cellule", "nb site"
  ].some(h => n.includes(h));
}

function isSentinelQuery(query: string): boolean {
  const n = query.toLowerCase();
  return ["alarm", "alarme", "anomali", "rca", "root cause", "cause racine",
    "dégradation", "degradation", "incident", "problème", "problem",
    "chute", "drop", "baisse soudaine", "sudden", "alerte", "alert",
    "détect", "detect", "seuil", "threshold", "critique", "critical"
  ].some(h => n.includes(h));
}

function isParmyQuery(query: string): boolean {
  const n = query.toLowerCase();
  return ["audit", "auditer", "vérifier", "verifier", "check", "contrôle", "controle",
    "cohérence", "coherence", "consistency", "recommandation", "recommendation",
    "best practice", "bonne pratique", "conformité", "conformite", "compliance",
    "benchmark param", "template", "valeur standard", "standard value",
    "écart", "ecart", "deviation", "outlier", "anomalie param",
    "dispersion", "homogénéité", "homogeneite", "uniformité", "uniformite",
    "param check", "parameter audit", "param audit", "vérif param", "verif param",
    "analyse param", "optimis", "tuning recomm", "config audit",
    "non conforme", "non-conforme", "hors norme", "hors-norme",
    "valeur aberrante", "valeur atypique", "outlier param"
  ].some(h => n.includes(h));
}

function classifyAgent(query: string): AgentId {
  const n = query.toLowerCase();
  // Topo inventory queries (nombre de cellules, combien de sites) → TOPO always first
  if (isTopoInventoryQuery(query)) return "TOPO";
  // Pure topo metric queries (just "tilt", "azimut", "hba") → TOPO
  const met = detectMetric(query);
  if (TOPO_METRICS.has(met)) return "TOPO";
  // Site design queries → TOPO
  if (isSiteDesignQuery(query)) return "TOPO";
  // PARMY: parameter audit, check, consistency, recommendations — BEFORE dimension queries
  if (isParmyQuery(query)) return "PARMY";
  if (isParameterFocusedQuery(query)) return "PARMY";
  // Dimension queries go to PULSE
  const { isDim } = isDimensionQuery(query);
  if (isDim) return "PULSE";
  const isCompare = ["compare", "comparer", "comparaison", "vs", "versus", "benchmark"].some(h => n.includes(h));
  if (isCompare) return "PULSE";
  if (isChangeHistoryQuery(query)) return "TRACE";
  if (isSentinelQuery(query)) return "SENTINEL";
  return "PULSE";
}

function classifyIntent(query: string, scope: Scope): Intent {
  const n = query.toLowerCase();
  // Top/worst/best queries take HIGHEST priority (even if "par DOR" is present)
  const topHints = ["top", "pire", "worst", "meilleur", "best", "classement", "ranking", "dégradé", "degradé", "degraded"];
  if (topHints.some(h => n.includes(h))) return "top_degradations";
  // Dimension queries
  const { isDim, isList } = isDimensionQuery(query);
  if (isList) return "list_dimension_values";
  if (isDim) return "distribution";
  if (isChangeHistoryQuery(query)) return "trace_change";
  if (isParmyQuery(query)) return "param_audit";
  if (scope.level === "cell") return "cell_analysis";
  if (scope.level === "site") return "site_analysis";

  const compareHints = ["compare", "comparer", "comparaison", "vs", "versus", "différence"];
  if (compareHints.some(h => n.includes(h))) return "compare";

  const defHints = ["définition", "definition", "c'est quoi", "qu'est-ce que", "explique", "explain"];
  if (defHints.some(h => n.includes(h))) return "definition";

  const summaryHints = ["résumé", "resume", "summary", "état", "etat", "overview", "global", "bilan"];
  if (summaryHints.some(h => n.includes(h))) return "global_summary";

  return "other";
}

function resolveScope(
  query: string,
  uiScope?: UiScope,
  filters?: AssistantFilters
): Scope {
  if (uiScope?.selectedCellId) {
    return { level: "cell", cellId: uiScope.selectedCellId, siteName: uiScope.selectedSiteName || undefined };
  }
  if (uiScope?.selectedSiteName) {
    return { level: "site", siteName: uiScope.selectedSiteName };
  }
  const siteFromText = extractSiteName(query);
  if (siteFromText) {
    return { level: "site", siteName: siteFromText };
  }
  if (filters?.vendor) return { level: "vendor", vendor: filters.vendor };
  if (filters?.techno) return { level: "techno", techno: filters.techno };
  if (filters?.plaque) return { level: "plaque", plaque: filters.plaque };
  if (filters?.dor) return { level: "dor", dor: filters.dor };
  // Detect techno comparison (4G vs 5G) BEFORE vendor detection
  const technoMatch = query.match(/\b(4G|5G|3G|2G|LTE|NR)\b/gi);
  if (technoMatch && technoMatch.length >= 1) {
    const isCompare = ["compare", "comparer", "comparaison", "vs", "versus", "benchmark", "qualité par technologie", "par technologie", "par techno"].some(h => query.toLowerCase().includes(h));
    if (isCompare || technoMatch.length >= 2) return { level: "techno", techno: technoMatch.join(",") };
  }
  const vendorMatch = query.match(/\b(ericsson|nokia|huawei|samsung)\b/i);
  if (vendorMatch) return { level: "vendor", vendor: vendorMatch[1] };
  const plaqueFromText = extractPlaqueName(query);
  if (plaqueFromText) return { level: "plaque", plaque: plaqueFromText };
  return { level: "global" };
}

function buildContextPlan(
  query: string,
  uiScope?: UiScope,
  filters?: AssistantFilters
): ContextPlan {
  const scope = resolveScope(query, uiScope, filters);
  const agent = classifyAgent(query);
  const intent = classifyIntent(query, scope);

  const needs: DataNeed[] = [];
  const limits = { maxSites: 20, maxCells: 0, maxKpis: 10, maxDays: 7, maxRagChunks: 3 };

  let groupBy: { dimension1: string } | undefined;
  let metric: string | undefined;
  let resultLimit = 30;

  // Handle dimension-based intents FIRST
  if (intent === "distribution") {
    const dim1 = detectDimension1Type(query);
    const met = detectMetric(query);
    groupBy = { dimension1: dim1 };
    metric = met;
    if (TOPO_METRICS.has(met)) {
      needs.push("topo_metric_agg", "documents_rag");
    } else {
      needs.push("dimension_agg", "documents_rag");
    }
  } else if (intent === "list_dimension_values") {
    const dim1 = detectDimension1Type(query);
    groupBy = { dimension1: dim1 };
    needs.push("dimension_values", "documents_rag");
  } else {
    // Original agent-based logic
    switch (agent) {
      case "PULSE":
        needs.push("documents_rag");
        if (intent === "global_summary" || intent === "compare" || intent === "other") {
          needs.push("agg_stats", "worst_sites");
        } else if (intent === "top_degradations") {
          needs.push("worst_sites");
          limits.maxSites = 20;
        } else if (intent === "site_analysis") {
          needs.push("kpi_snapshot", "worst_cells");
          limits.maxCells = 30;
        } else if (intent === "cell_analysis") {
          needs.push("kpi_snapshot");
          limits.maxCells = 1;
        }
        break;

      case "SENTINEL":
        needs.push("documents_rag");
        if (scope.level === "site" || scope.level === "cell") {
          needs.push("kpi_snapshot", "worst_cells");
          limits.maxCells = 20;
        } else {
          needs.push("agg_stats", "worst_sites");
          limits.maxSites = 15;
        }
        break;

      case "TRACE":
        needs.push("documents_rag", "change_history");
        if (isParameterFocusedQuery(query)) needs.push("param_dump");
        if (scope.level === "site") needs.push("topology");
        break;

      case "TOPO":
        needs.push("documents_rag");
        if (isTopoInventoryQuery(query)) {
          needs.push("topo_inventory");
        } else {
          // For topo metric queries (tilt, azimut, hba) without specific site, fetch global distribution
          const topoMet = detectMetric(query);
          if (TOPO_METRICS.has(topoMet)) {
            const dim1 = detectDimension1Type(query);
            groupBy = { dimension1: dim1 };
            metric = topoMet;
            needs.push("topo_metric_agg");
          }
          needs.push("topology");
          if (scope.level === "site") {
            needs.push("kpi_snapshot");
            limits.maxCells = 30;
          }
        }
        break;

      case "PARMY":
        needs.push("documents_rag", "parmy_sql");
        if (isParameterFocusedQuery(query)) needs.push("param_dump");
        if (scope.level === "site") needs.push("topology", "kpi_snapshot");
        if (isChangeHistoryQuery(query)) needs.push("change_history");
        break;
    }
  }

  const n = query.toLowerCase();
  if (n.includes("hier") || n.includes("24h") || n.includes("aujourd")) limits.maxDays = 1;
  else if (n.includes("semaine") || n.includes("7j") || n.includes("7 jour")) limits.maxDays = 7;
  else if (n.includes("mois") || n.includes("30j")) limits.maxDays = 30;

  let clarificationNeeded = false;
  let clarificationQuestion: string | undefined;

  console.log(`📋 Plan: agent=${agent}, intent=${intent}, scope=${JSON.stringify(scope)}, needs=[${needs.join(",")}], groupBy=${JSON.stringify(groupBy)}, metric=${metric}`);

  return { agent, intent, scope, needs, limits, groupBy, metric, resultLimit, clarificationNeeded, clarificationQuestion };
}

// ═══════════════════════════════════════════════════════════════
//  CONTEXT BUILDER — fetch only what the plan requires
// ═══════════════════════════════════════════════════════════════

async function buildContextFromPlan(
  plan: ContextPlan,
  query: string,
  filters?: AssistantFilters,
  legacyCellContext?: string
): Promise<{ context: string; parmySqlDebug: string }> {
  const sections: string[] = [];

  const promises: Record<string, Promise<string>> = {};

  if (plan.needs.includes("documents_rag")) {
    promises.rag = searchRAGDocuments(query, plan.limits.maxRagChunks);
  }
  if (plan.needs.includes("agg_stats")) {
    promises.agg = fetchAggStats(filters, plan.limits.maxDays);
  }
  if (plan.needs.includes("worst_sites")) {
    promises.worst = fetchWorstSites(filters, plan.limits.maxSites);
  }
  if (plan.needs.includes("kpi_snapshot") && plan.scope.level === "site") {
    promises.snapshot = fetchSiteSnapshot((plan.scope as any).siteName);
  }
  if (plan.needs.includes("topology")) {
    const siteName = plan.scope.level === "site" ? (plan.scope as any).siteName :
                     plan.scope.level === "cell" ? (plan.scope as any).siteName : null;
    if (siteName) promises.topo = searchTopoForSite(siteName);
  }
  if (plan.needs.includes("param_dump")) {
    promises.params = searchDumpParameters(query);
  }
  if (plan.needs.includes("parmy_sql")) {
    promises.parmySql = generateAndExecuteParmySql(query, filters);
  }
  if (plan.needs.includes("change_history")) {
    promises.changes = searchParameterChanges(query);
  }
  if (plan.needs.includes("dimension_agg") && plan.groupBy?.dimension1) {
    promises.dimAgg = fetchMetricDistributionByDimension1(
      plan.groupBy.dimension1,
      plan.metric || "qoe_index",
      filters,
      plan.limits.maxDays,
      plan.resultLimit || 30
    );
  }
  if (plan.needs.includes("topo_metric_agg") && plan.groupBy?.dimension1) {
    promises.topoAgg = fetchTopoMetricByDimension(
      plan.metric || "tilt",
      plan.groupBy.dimension1,
      plan.resultLimit || 30
    );
  }
  if (plan.needs.includes("dimension_values") && plan.groupBy?.dimension1) {
    promises.dimValues = fetchDimensionValues(
      plan.groupBy.dimension1,
      filters,
      plan.limits.maxDays,
      plan.resultLimit || 200
    );
  }
  if (plan.needs.includes("topo_inventory")) {
    promises.topoInv = fetchTopoInventory(filters);
  }

  const keys = Object.keys(promises);
  const results = await Promise.all(Object.values(promises));
  const resolved: Record<string, string> = {};
  keys.forEach((k, i) => { resolved[k] = results[i]; });

  console.log(`📦 Context fetched: ${keys.filter(k => resolved[k]).join(", ") || "none"}`);

  if (resolved.topoInv) sections.push(`🗼 INVENTAIRE TOPO:\n${resolved.topoInv}`);
  if (resolved.topoAgg) sections.push(`📡 DISTRIBUTION TOPO:\n${resolved.topoAgg}`);
  if (resolved.dimAgg) sections.push(`📊 DISTRIBUTION PAR DIMENSION:\n${resolved.dimAgg}`);
  if (resolved.dimValues) sections.push(`📋 VALEURS DIMENSION:\n${resolved.dimValues}`);
  if (resolved.agg) sections.push(`📊 STATS AGRÉGÉES:\n${resolved.agg}`);
  if (resolved.worst) sections.push(`📉 WORST:\n${resolved.worst}`);
  if (resolved.snapshot) sections.push(`📋 SITE SNAPSHOT:\n${resolved.snapshot}`);
  if (resolved.topo) sections.push(`📡 TOPOLOGIE:\n${resolved.topo}`);
  if (resolved.params) sections.push(`⚙️ PARAMÈTRES:\n${resolved.params}`);
  if (resolved.parmySql) sections.push(`⚙️ PARMY SQL ENGINE:\n${resolved.parmySql}`);
  if (resolved.changes) sections.push(`🔧 HISTORIQUE CHANGEMENTS:\n${resolved.changes}`);
  if (resolved.rag) sections.push(`📚 DOCUMENTS RAG:\n${resolved.rag}`);

  if (sections.length <= 1 && legacyCellContext && legacyCellContext.length > 0) {
    const cap = Math.min(legacyCellContext.length, 40000);
    sections.push(`📊 DONNÉES RÉSEAU (legacy):\n${legacyCellContext.slice(0, cap)}`);
  }

  return { context: sections.join("\n\n"), parmySqlDebug: resolved.parmySql || "" };
}

// ═══════════════════════════════════════════════════════════════
//  BUDGET ENFORCEMENT
// ═══════════════════════════════════════════════════════════════

const MAX_CONTEXT_CHARS = 100_000;
const MAX_MESSAGES_CHARS = 20_000;

function enforceBudgets(
  systemContent: string,
  context: string,
  messages: { role: string; content: string }[]
): { systemContent: string; context: string; messages: { role: string; content: string }[] } {
  const MAX_RECENT = 6;
  const trimmedMessages = messages.map((m, i) => {
    const isRecent = i >= messages.length - MAX_RECENT;
    if (isRecent || m.role === "user") return m;
    if (m.content.length > 500) {
      return { ...m, content: m.content.slice(0, 500) + "\n[... tronqué ...]" };
    }
    return m;
  });

  let totalMsgChars = trimmedMessages.reduce((s, m) => s + m.content.length, 0);
  const finalMessages = totalMsgChars > MAX_MESSAGES_CHARS
    ? trimmedMessages.slice(-MAX_RECENT)
    : trimmedMessages;

  let finalContext = context;
  if (finalContext.length > MAX_CONTEXT_CHARS) {
    finalContext = finalContext.slice(0, MAX_CONTEXT_CHARS) + "\n[... contexte tronqué pour budget tokens ...]";
  }

  return { systemContent, context: finalContext, messages: finalMessages };
}

// ═══════════════════════════════════════════════════════════════
//  SUB-AGENT SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════════

const SHARED_RULES = `
⚠️ RÈGLE ABSOLUE — ZÉRO HALLUCINATION — DONNÉES RÉELLES UNIQUEMENT
1. Utilise EXCLUSIVEMENT les données fournies dans le contexte. COPIE-COLLE les noms tels quels.
2. Il est INTERDIT d'inventer des noms de cellules, sites, valeurs ou métriques.
3. Si aucune donnée n'est disponible, dis-le clairement.

FORMATAGE : Markdown pur (pas de HTML).
- Tableaux Markdown | et ---
- Titres ## et ###
- **Gras** pour les valeurs importantes
- Émojis de statut : 🔴 Critique (<50%), 🟠 Dégradé (50-65%), 🟡 Moyen (65-75%), 🟢 Bon (>75%)

VISUALISATIONS : Tu peux intégrer des blocs \`\`\`chart, \`\`\`map, \`\`\`kpi.
- chart: {"type":"bar","title":"...","xKey":"...","yKeys":[...],"data":[...]}
- map: {"title":"...","markers":[{"lat":...,"lng":...,"label":"...","value":...}]}
- kpi: {"title":"...","cards":[{"label":"...","value":"...","unit":"...","trend":"up/down/stable","status":"good/warning/critical"}]}
Le JSON doit être sur UNE SEULE LIGNE.

Réponds TOUJOURS en français.`;

const PULSE_PROMPT = `Tu es **PULSE** 📡, agent spécialisé en performance RAN et QoE réseau mobile.

## 32 KPIs PRINCIPAUX (colonnes qoe_metric / kpi_qoe_aggregated)
### QoE & Sessions
- qoe_index (QoE Score, %, 🟢>75 🟡65-75 🟠50-65 🔴<50)
- session_nbr (Nombre de sessions, count)
- session_dcr (Drop Call Rate, %)
- session_dur_moy (Durée moyenne session, s)
- Mauvaise_Session_Rate (Taux mauvaises sessions, %)
- Mauvaise_Session_nbr (Nombre mauvaises sessions, count)

### Débits
- debit_dl (Débit DL moyen, Mbps, 🟢>50 🟡20-50 🟠10-20 🔴<10)
- debit_ul (Débit UL moyen, Mbps)
- debit_dl_max (Débit DL max, Mbps)
- debit_ul_max (Débit UL max, Mbps)
- volume_totale_dl (Volume DL, GB)
- volume_totale_ul (Volume UL, GB)
- volume_totale_totale (Volume Total, GB)

### DMS (Disponibilité Minimum de Service)
- dms_debit_dl_3 (DMS DL > 3Mbps, %, 🟢>95 🟠<90)
- dms_debit_dl_8 (DMS DL > 8Mbps, %, 🟢>85 🟠<75)
- dms_debit_dl_30 (DMS DL > 30Mbps, %)
- dms_debit_ul_1 (DMS UL > 1Mbps, %)
- dms_debit_ul_3 (DMS UL > 3Mbps, %)
- dms_debit_ul_5 (DMS UL > 5Mbps, %)

### Latence (RTT)
- rtt_setup_avg (RTT Setup, µs, 🟢<40000 🟠>80000 🔴>150000)
- rtt_data_avg (RTT Data, µs, 🟢<40000 🟠>80000 🔴>150000)

### TCP (Pertes & Retransmissions)
- loss_dl_rate (Perte DL, %, 🟢<1 🟠1-3 🔴>3)
- loss_ul_rate (Perte UL, %)
- tcp_retr_rate_dl (Retransmission DL, %, 🟢<1 🟠1-3 🔴>5)
- tcp_retr_rate_ul (Retransmission UL, %)
- out_of_order_rate (Out of Order, %)
- wind_full_rate (Window Full, %)

### Mobilité & RAT
- fallback_5G_to_4G_rate (Fallback 5G→4G, %)
- fallback_4G_to_3G2G_rate (Fallback 4G→3G/2G, %)
- instability_rate (Instabilité RAT, %)
- time_rat_5g_pct (Temps en 5G, %)
- time_rat_4g_pct (Temps en 4G, %)

## 16 DIMENSIONS (Dimension_1 → valeurs Dimension_2)
- Cellule → nom_cellule (identifiant logique antenne)
- Site → nom_site (identifiant physique)
- Vendor → Nokia, Ericsson, Samsung, Huawei
- Bande → NR_3500, NR_700, NR_2100, LTE2100, LTE800, LTE2600, LTE1800, LTE700
- ARCEP → Top15, TGV, AXE, Rural, Intermédiaire
- Application → Streaming, WEB
- RAT → 0(Réservé), 1(3G), 2(2G), 3(WiFi), 4(5G NSA), 6(4G LTE), 10(5G SA)
- TAC → FWA (box), Mobile
- AS → Google, Amazon, Microsoft, Meta, Other
- POP → CNM (probe 5G), CNL (probe non-5G)
- Device_brand → Samsung, iPhone, Other
- OS → Android, iOS, Other
- DOR → (toutes les DOR depuis topo.region)
- Plaque → (toutes les plaques)
- ORF → Chat, Cloud, Control, Download, Enterprise, Games, MMS, Mail, MailOrange, Others, P2P, Streaming, Unknown, VPN, VVM, VoIP, WEB

COMPARAISONS : 1) Bloc kpi 2) Tableau comparatif 3) Chart bar groupé 4) Synthèse + recommandations.
${SHARED_RULES}`;

const TRACE_PROMPT = `Tu es **TRACE** 🔧, agent spécialisé en historique de configuration et changements réseau (CM History).
Domaine : tuning, upgrades SW, swaps, rollbacks.
Présente les changements en timeline chronologique + tableau avant/après + corrélation KPIs.
${SHARED_RULES}`;

const SENTINEL_PROMPT = `Tu es **SENTINEL** 🚨, agent spécialisé en détection d'anomalies et RCA.
Structure RCA : 1) Classe cause racine 2) Résumé 3) Preuves KPI 4) Actions recommandées 5) Confiance.
Seuils : QoE<50% → 🔴, DMS3<90% → 🟠, RTT>100ms → 🟠, TCP Loss>2% → 🔴.
${SHARED_RULES}`;

const TOPO_PROMPT = `Tu es **TOPO** 🗼, agent spécialisé en topologie réseau, design de sites radio et inventaire infrastructure.

## COMPÉTENCES
1. **Inventaire** : Nombre exact de cellules, sites, répartition par bande/techno/constructeur/DOR
2. **Design de site** : Diagnostic 8 critères (azimut, tilt, HBA, co-loc 5G/4G, diversité bandes, état cellules)
3. **Métriques physiques** : Tilt, azimut, HBA — distribution et analyse par dimension

## DONNÉES SOURCES
- Table **topo** : colonnes code_nidt, nom_site, nom_cellule, techno, bande, constructeur, azimut, tilt, hba, pci, tac, eci, nci, etat_cellule, zone_arcep, plaque, dor, latitude, longitude
- Les données te sont fournies dans le contexte ci-dessous. Utilise-les DIRECTEMENT.

## COULEURS TEXTE (utilise du Markdown gras et émojis pour mettre en valeur)
- Tilt : 🔷 (teal)
- Azimut : 🔵 (bleu royal)
- HBA : 🟣 (violet)
- Nb sites : 🟩 (vert forêt)
- Nb cells : ♻️ (émeraude)
- DOR : 🔹 (indigo)
- Bande : 🟧 (orange)
- Constructeur : 🩷 (rose)
- Zone ARCEP : 🟨 (jaune)

## COULEURS CHARTS
Quand tu génères un chart bar, utilise des couleurs distinctes par catégorie :
- colors: ["#0d9488","#2563eb","#9333ea","#ea580c","#16a34a","#be185d","#ca8a04","#0891b2"]

## RÈGLES DE RÉPONSE
- Pour les inventaires : présente un tableau Markdown avec les totaux + un chart bar
- Pour les analyses par dimension : tableau + chart + commentaire
- Verdict site : ✅ OK / ⚠️ REVIEW / ❌ ISSUES
- Si une métrique (ex: tilt) a toutes ses valeurs NULL, dis-le explicitement : "Les valeurs de tilt ne sont pas renseignées dans la base de données."
${SHARED_RULES}`;

const PARMY_PROMPT = `Tu es **PARMY** ⚙️, agent spécialisé en audit, vérification et optimisation des paramètres radio réseau.

## MOTEUR SQL INTÉGRÉ
Tu disposes d'un **moteur SQL** qui génère et exécute automatiquement des requêtes SQL sur la table \`parameter_dump\`.
- Les résultats SQL te sont fournis dans le contexte sous "PARMY SQL ENGINE"
- Utilise ces données RÉELLES pour tes analyses — ne les invente JAMAIS
- Tu peux effectuer des agrégations (GROUP BY vendor, plaque, bande, dor, zone_arcep), des distributions de valeurs, des comptages, des cross-tabs
- Le moteur gère automatiquement la génération SQL à partir de la question utilisateur

## COMPÉTENCES
1. **Audit de paramètres** : Vérification de cohérence des valeurs de paramètres radio (timers RRC, handover, puissances, MIMO, etc.)
2. **Détection d'anomalies** : Identification des valeurs atypiques, outliers, paramètres hors norme par rapport au template ou aux best practices
3. **Analyse comparative** : Comparaison des paramètres entre sites, plaques, vendors, bandes pour détecter les écarts
4. **Recommandations** : Suggestions d'optimisation basées sur les best practices 3GPP et les standards opérateur
5. **Contrôle de conformité** : Vérification de l'alignement avec les templates de référence
6. **Requêtes SQL avancées** : Agrégations, distributions, cross-tabs, filtres combinés sur parameter_dump

## DONNÉES SOURCES
- Table **parameter_dump** : colonnes dn, cell_dn, cell_name, site_name, parameter, value, version, vendor, bande, plaque, dor, zone_arcep, netact, latitude, longitude, mrbts_id, enodeb_id, gnodeb_id
- Table **parameter_changes** : historique des modifications (change_date, param_name, old_value, new_value, change_type, change_scope)
- Table **topo** : données topologiques pour corrélation

## MÉTHODOLOGIE D'AUDIT
1. **Inventaire** : Lister les paramètres concernés et leurs valeurs actuelles
2. **Statistiques** : Calculer la distribution des valeurs (mode, médiane, outliers)
3. **Comparaison** : Identifier les écarts par rapport au template/majorité
4. **Impact** : Évaluer l'impact potentiel des écarts sur la performance
5. **Recommandation** : Proposer les actions correctives avec priorité

## FORMAT DE RÉPONSE AUDIT
- 📋 **Périmètre** : Scope de l'audit (site, plaque, vendor, paramètre)
- 📊 **Résultats** : Tableau des valeurs + distribution
- ⚠️ **Écarts détectés** : Liste des non-conformités avec sévérité (🔴 Critique, 🟠 Majeur, 🟡 Mineur)
- 💡 **Recommandations** : Actions correctives ordonnées par priorité
- ✅ **Conformes** : Paramètres validés
- 🔍 **SQL exécuté** : Mentionne la requête SQL utilisée pour la transparence

## PARAMÈTRES CLÉS CONNUS
### LTE (4G) — Préfixe LNCEL/LNBTS
- LNCEL.pMax (Puissance max, typique: 43-46 dBm)
- LNCEL.dlChBw (Bande passante DL: 5/10/15/20 MHz)
- LNCEL.dlMimoMode (Mode MIMO: 0=SingleTX, 10=TXDiv, 30=OL-MIMO, 40=CL-MIMO)
- LNCEL.dlRsBoost (RS Boost: 0-6 dB)
- Timers RRC: t300, t301, t304, t310, t311, t320, t321

### 5G NR — Préfixe NRCELL/GNBTS
- Paramètres NR similaires avec préfixes NRCELL, GNBDU, GNBCUCP

## COULEURS ET SÉVÉRITÉS
- 🔴 **Critique** : Valeur pouvant causer des coupures ou indisponibilité
- 🟠 **Majeur** : Valeur sous-optimale impactant les performances
- 🟡 **Mineur** : Écart léger, optimisation possible
- 🟢 **Conforme** : Valeur alignée avec le template/best practice
${SHARED_RULES}`;

function getAgentPrompt(agent: AgentId): string {
  switch (agent) {
    case "PULSE": return PULSE_PROMPT;
    case "TRACE": return TRACE_PROMPT;
    case "SENTINEL": return SENTINEL_PROMPT;
    case "TOPO": return TOPO_PROMPT;
    case "PARMY": return PARMY_PROMPT;
    default: return PULSE_PROMPT;
  }
}

// ═══════════════════════════════════════════════════════════════
//  MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      messages,
      uiScope,
      filters,
      openrouter_key,
      model: requestedModel,
      cellContext: legacyCellContext,
      kpiMonitorContext,
      forcedAgent,
    } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENROUTER_API_KEY = openrouter_key || Deno.env.get("OPENROUTER_API_KEY");
    const useLovable = !!LOVABLE_API_KEY && !OPENROUTER_API_KEY;

    if (!LOVABLE_API_KEY && !OPENROUTER_API_KEY) {
      throw new Error("No AI API key configured");
    }

    const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === "user")?.content || "";

    const plan = buildContextPlan(lastUserMessage, uiScope, filters);

    // Override agent if user forced selection — rebuild plan with forced agent
    if (forcedAgent && ["PULSE", "TOPO", "PARMY", "TRACE", "SENTINEL"].includes(forcedAgent)) {
      const originalAgent = plan.agent;
      plan.agent = forcedAgent as AgentId;
      // Rebuild needs for the forced agent
      plan.needs = ["documents_rag"];
      const q = lastUserMessage.toLowerCase();
      switch (forcedAgent) {
        case "PARMY":
          plan.needs.push("parmy_sql");
          if (isParameterFocusedQuery(lastUserMessage)) plan.needs.push("param_dump");
          if (plan.scope.level === "site") plan.needs.push("topology", "kpi_snapshot");
          if (isChangeHistoryQuery(lastUserMessage)) plan.needs.push("change_history");
          plan.intent = "param_audit";
          break;
        case "PULSE":
          plan.needs.push("agg_stats", "worst_sites");
          if (plan.scope.level === "site") plan.needs.push("kpi_snapshot", "topology");
          break;
        case "TOPO":
          if (isTopoInventoryQuery(lastUserMessage)) {
            plan.needs.push("topo_inventory");
          } else {
            plan.needs.push("topology");
          }
          break;
        case "TRACE":
          plan.needs.push("change_history");
          if (isParameterFocusedQuery(lastUserMessage)) plan.needs.push("param_dump");
          if (plan.scope.level === "site") plan.needs.push("topology");
          break;
        case "SENTINEL":
          plan.needs.push("agg_stats", "worst_sites");
          break;
      }
      console.log(`🎯 Agent FORCÉ: ${originalAgent} → ${forcedAgent} | needs=[${plan.needs.join(",")}]`);
    }

    console.log(`🧠 QOEBIT → ${plan.agent} | intent=${plan.intent} | scope=${JSON.stringify(plan.scope)}`);

    if (plan.clarificationNeeded && plan.clarificationQuestion) {
      const clarMsg = `<!-- AGENT:${plan.agent} -->\n${plan.clarificationQuestion}`;
      const sseData = `data: ${JSON.stringify({ choices: [{ delta: { content: clarMsg } }] })}\n\ndata: [DONE]\n\n`;
      return new Response(sseData, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    const { context, parmySqlDebug } = await buildContextFromPlan(plan, lastUserMessage, filters, legacyCellContext);

    // ── Agent Learning: fetch few-shots + user memory ──
    const supaClient = getSupabase();
    let learningContext = '';
    try {
      // Few-shot examples from positively-rated responses
      const { data: fewShots } = await supaClient
        .from('agent_feedback')
        .select('user_question, assistant_response')
        .eq('agent', plan.agent)
        .eq('rating', 1)
        .order('created_at', { ascending: false })
        .limit(3);

      if (fewShots && fewShots.length > 0) {
        const examples = fewShots.map((d: any, i: number) =>
          `--- Exemple ${i + 1} ---\nQ: ${d.user_question}\nR: ${(d.assistant_response || '').slice(0, 800)}`
        ).join('\n\n');
        learningContext += `\n\n🎓 EXEMPLES DE BONNES RÉPONSES (few-shot learning - réponses validées par l'utilisateur):\n${examples}`;
      }

      // User preferences/memory
      const { data: memories } = await supaClient
        .from('agent_memory')
        .select('key, value')
        .eq('memory_type', 'preference')
        .order('updated_at', { ascending: false })
        .limit(10);

      if (memories && memories.length > 0) {
        const prefs = memories.map((d: any) => `- ${d.key}: ${JSON.stringify(d.value?.data || d.value)}`).join('\n');
        learningContext += `\n\n🧠 MÉMOIRE UTILISATEUR (préférences apprises):\n${prefs}\nAdapte ton style et tes réponses selon ces préférences.`;
      }
    } catch (learningErr) {
      console.warn('Learning context fetch failed:', learningErr);
    }

    let systemContent = `[AGENT:${plan.agent}]\n\n` + getAgentPrompt(plan.agent);

    if (kpiMonitorContext) {
      systemContent += `\n\n📊 KPI MONITOR CONTEXT:\n${kpiMonitorContext}`;
    }

    if (context) {
      systemContent += `\n\n${context}`;
    }

    if (learningContext) {
      systemContent += learningContext;
    }

    const budgeted = enforceBudgets(systemContent, "", messages);
    systemContent = budgeted.systemContent;
    const finalMessages = budgeted.messages;

    const totalChars = systemContent.length + finalMessages.reduce((s, m) => s + m.content.length, 0);
    console.log(`📏 Total payload: ${(totalChars / 1024).toFixed(1)} KB (system=${(systemContent.length / 1024).toFixed(1)} KB, msgs=${(finalMessages.reduce((s, m) => s + m.content.length, 0) / 1024).toFixed(1)} KB)`);

    const aiUrl = useLovable
      ? "https://ai.gateway.lovable.dev/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions";

    const aiHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (useLovable) {
      aiHeaders["Authorization"] = `Bearer ${LOVABLE_API_KEY}`;
    } else {
      aiHeaders["Authorization"] = `Bearer ${OPENROUTER_API_KEY}`;
      aiHeaders["HTTP-Referer"] = Deno.env.get("SUPABASE_URL") || "";
      aiHeaders["X-Title"] = `QOEBIT ${plan.agent}`;
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

    const response = await fetch(aiUrl, {
      method: "POST",
      headers: aiHeaders,
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: "system", content: systemContent },
          ...finalMessages,
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

    const agentMeta = `data: ${JSON.stringify({ choices: [{ delta: { content: `<!-- AGENT:${plan.agent} -->\n` } }] })}\n\n`;
    const encoder = new TextEncoder();
    const metaChunk = encoder.encode(agentMeta);

    const originalBody = response.body!;
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    (async () => {
      await writer.write(metaChunk);

      // Inject SQL debug block for PARMY agent
      if (plan.agent === "PARMY" && parmySqlDebug) {
        const sqlMatch = parmySqlDebug.match(/SQL: (.+?)(?:\n\n|$)/s);
        const sqlQuery = sqlMatch ? sqlMatch[1].trim() : "";
        const dataPreview = parmySqlDebug.slice(0, 2000);
        let debugBlock = "\n\n---\n<details><summary>🔍 **DEBUG — SQL & Données brutes**</summary>\n\n";
        if (sqlQuery) debugBlock += "```sql\n" + sqlQuery + "\n```\n\n";
        debugBlock += "**Résultat brut (extrait) :**\n```\n" + dataPreview + "\n```\n\n</details>\n\n---\n\n";
        const debugChunk = encoder.encode(
          `data: ${JSON.stringify({ choices: [{ delta: { content: debugBlock } }] })}\n\n`
        );
        await writer.write(debugChunk);
      }

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
