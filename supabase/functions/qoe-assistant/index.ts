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

function isParameterFocusedQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  const paramHints = [
    "paramètre", "parametre", "parameter", "param", "config",
    "configuration", "dump", "mrbts", "lnbts", "enodeb", "gnodeb",
    "template", "dn", "version", "hw.", "sw", "vendor",
    "nokia", "ericsson", "huawei", "cell_dn", "blockingstate",
    "imsemer", "btsname", "netype", "managedelement",
    "t300", "t301", "t304", "t310", "t311", "t320", "t321",
    "timer", "rrc", "handover", "reselection", "plaque",
    "distribution", "valeur", "valeurs",
  ];
  return paramHints.some((hint) => normalized.includes(hint));
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

function isDistributionQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  return ["distribution", "répartition", "repartition", "distrubition", "distrubtion",
    "par plaque", "par upr", "par vendor", "par site", "par bande", "par dor", "par region", "par zone"
  ].some((h) => normalized.includes(h));
}

function extractParamName(query: string): string | null {
  // Match "SIB.t300", "NRCELL.t300", "LNCEL.T300", "CATMPR.t300ModeACatM" etc.
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
  // Match known plaque patterns like AUTRES53, NANTES, ST_NAZAIRE, etc.
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

function isSiteDesignQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  return ["design", "tilt", "azimut", "azimuth", "hba", "topologie", "topology",
    "secteur", "sector", "couverture", "coverage", "analyse site", "site design",
    "antenne", "antenna", "delta tilt", "profil site", "profile"
  ].some(h => normalized.includes(h));
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

    // Group by sector for design analysis
    const sectorMap = new Map<number, any[]>();
    for (const r of data) {
      const cellName = r.nom_cellule || "";
      const lastChar = cellName.replace(/\d+$/, "").slice(-1);
      const sectorNum = parseInt(cellName.match(/(\d+)$/)?.[1] || "0");
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
      if (!probe.error) {
        activeDumpTable = tableName;
        break;
      }
      const msg = probe.error?.message?.toLowerCase() || "";
      if (!msg.includes("does not exist") && !msg.includes("relation") && !msg.includes("could not find")) {
        activeDumpTable = tableName;
        break;
      }
    }

    if (!activeDumpTable) {
      return "AUCUNE TABLE de paramètres trouvée (dump_parameter / dump_parametre).";
    }

    const paramName = extractParamName(query);
    const isDistrib = isDistributionQuery(query);
    const siteName = extractSiteName(query);
    const plaqueName = extractPlaqueName(query);

    // Plaque-specific cell listing with optional parameter filter
    if (plaqueName && !isDistrib) {
      console.log(`[${activeDumpTable}] Plaque cell listing: plaque=${plaqueName}, param=${paramName}`);
      let q = supabase
        .from(activeDumpTable)
        .select("cell_name, site_name, parameter, value, vendor, bande, plaque")
        .ilike("plaque", `%${plaqueName}%`);
      if (paramName) q = q.ilike("parameter", `%${paramName}%`);
      const { data, error } = await q.order("cell_name").limit(500);

      if (error) { console.error(`${activeDumpTable} plaque search error:`, error); }
      if (!data?.length) {
        // Check if plaque exists at all
        const { data: plaqueCheck } = await supabase.from(activeDumpTable).select("plaque").ilike("plaque", `%${plaqueName}%`).limit(1);
        if (!plaqueCheck?.length) {
          const { data: allPlaques } = await supabase.from(activeDumpTable).select("plaque").limit(1000);
          const uniquePlaques = [...new Set((allPlaques || []).map((r: any) => r.plaque).filter(Boolean))];
          return `AUCUNE DONNÉE trouvée pour la plaque "${plaqueName}". Plaques disponibles : ${uniquePlaques.join(", ")}`;
        }
        return `AUCUNE DONNÉE trouvée pour la plaque "${plaqueName}"${paramName ? ` avec le paramètre "${paramName}"` : ""}. La plaque existe mais ne contient pas ${paramName ? `ce paramètre` : `de données`}.`;
      }

      const header = "cell_name | site_name | parameter | value | vendor | bande";
      const lines = data.map((r: any) =>
        `${r.cell_name || ""} | ${r.site_name || ""} | ${r.parameter || ""} | ${r.value || ""} | ${r.vendor || ""} | ${r.bande || ""}`
      );
      return `CELLULES de la plaque ${plaqueName}${paramName ? ` pour ${paramName}` : ""} (${data.length} résultats) :\n${header}\n${lines.join("\n")}`;
    }
    // Site-specific parameter query (e.g. "T300 pour FIRMINY_TDF")
    if (paramName && siteName && !isDistrib) {
      console.log(`[${activeDumpTable}] Site+param search: param=${paramName}, site=${siteName}`);
      const { data, error } = await supabase
        .from(activeDumpTable)
        .select("dn, cell_dn, cell_name, site_name, parameter, value, version, vendor, bande, ur, plaque")
        .ilike("parameter", `%${paramName}%`)
        .ilike("site_name", `%${siteName}%`)
        .order("cell_name")
        .limit(200);

      if (error) { console.error(`${activeDumpTable} site search error:`, error); return ""; }
      if (!data?.length) {
        // Check if site/param exist separately
        const { data: siteData } = await supabase.from(activeDumpTable).select("site_name").ilike("site_name", `%${siteName}%`).limit(5);
        const { data: paramData } = await supabase.from(activeDumpTable).select("parameter").ilike("parameter", `%${paramName}%`).limit(10);
        const uniqueSites = [...new Set((siteData || []).map((r: any) => r.site_name))];
        const uniqueParams = [...new Set((paramData || []).map((r: any) => r.parameter))];
        let msg = `RÉSULTAT DE RECHERCHE : AUCUNE DONNÉE trouvée pour le paramètre "${paramName}" sur le site "${siteName}".\n`;
        if (!uniqueSites.length) msg += `⚠️ Le site "${siteName}" n'existe pas dans la base ${activeDumpTable}.\n`;
        else msg += `Sites similaires : ${uniqueSites.join(", ")}\n`;
        if (!uniqueParams.length) msg += `⚠️ Le paramètre "${paramName}" n'existe pas dans la base.\n`;
        else msg += `Paramètres contenant "${paramName}" : ${uniqueParams.join(", ")}\n`;
        return msg;
      }
      const header = "dn | cell_name | site_name | parameter | value | version | vendor | bande | ur | plaque";
      const lines = data.map((r: any) =>
        `${r.dn || ""} | ${r.cell_name || ""} | ${r.site_name || ""} | ${r.parameter || ""} | ${r.value || ""} | ${r.version || ""} | ${r.vendor || ""} | ${r.bande || ""} | ${r.ur || ""} | ${r.plaque || ""}`
      );
      return `DONNÉES RÉELLES pour ${paramName} sur ${siteName} (${data.length} résultats) :\n${header}\n${lines.join("\n")}`;
    }

    // Aggregated distribution query
    if (isDistrib && paramName) {
      const groupCol = extractGroupByColumn(query);
      console.log(`[${activeDumpTable}] Aggregation: param=${paramName}, groupBy=${groupCol}`);

      const { data, error } = await supabase
        .from(activeDumpTable)
        .select(`${groupCol}, value, parameter`)
        .ilike("parameter", `%${paramName}%`)
        .limit(1000);

      if (error) { console.error(`${activeDumpTable} aggregation error:`, error); return ""; }
      if (!data?.length) return `AUCUNE DONNÉE trouvée pour le paramètre "${paramName}" dans la base ${activeDumpTable}.`;

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
      const lines = Array.from(agg.entries())
        .map(([key, count]) => {
          const [dim, val] = key.split("::");
          const dimTotal = dimTotals.get(dim) || 1;
          const pctDim = ((count / dimTotal) * 100).toFixed(1);
          const pctGlobal = ((count / total) * 100).toFixed(1);
          return { dim, val, count, pctDim, pctGlobal };
        })
        .sort((a, b) => a.dim.localeCompare(b.dim) || b.count - a.count)
        .map((r) => `${r.dim} | ${r.val} | ${r.count} | ${r.pctDim}% | ${r.pctGlobal}%`);

      // Build per-dimension summary
      const dimSummary = Array.from(dimTotals.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([dim, cnt]) => `${dim}: ${cnt} cellules (${((cnt / total) * 100).toFixed(1)}%)`)
        .join(", ");

      return `DISTRIBUTION AGRÉGÉE du paramètre ${paramName} par ${groupCol} (${total} cellules au total):\nRépartition par ${groupCol}: ${dimSummary}\n${header}\n${lines.join("\n")}\n\nINSTRUCTION VISUALISATION: Génère un graphique \`\`\`chart groupé avec xKey="${groupCol}" et une barre par valeur distincte du paramètre. Chaque barre représente le nb_cellules. Ajoute aussi les pourcentages dans le tableau Markdown.`;
    }

    // Standard search
    const terms = extractSearchTerms(query);
    if (terms.length === 0) {
      const { data, error } = await supabase
        .from(activeDumpTable)
        .select("dn, enodeb_id, mrbts_id, cell_name, vendor, site_name, parameter, version, value")
        .limit(50);
      if (error || !data?.length) return "";
      return formatParamResults(data);
    }

    const queries = terms.slice(0, 4).map((term) =>
      supabase
        .from(activeDumpTable)
        .select("dn, enodeb_id, mrbts_id, gnodeb_id, cell_name, vendor, site_name, bande, parameter, version, value")
        .or(`parameter.ilike.%${term}%,site_name.ilike.%${term}%,dn.ilike.%${term}%,value.ilike.%${term}%,vendor.ilike.%${term}%`)
        .limit(30)
    );

    const results = await Promise.all(queries);
    const merged = new Map<string, any>();
    for (const r of results) {
      if (r.error) { console.error(`${activeDumpTable} search error:`, r.error); continue; }
      for (const row of r.data || []) {
        const key = `${row.dn}::${row.parameter}`;
        if (!merged.has(key)) merged.set(key, row);
      }
    }

    const rows = Array.from(merged.values());
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

const SYSTEM_PROMPT = `Tu es un assistant expert en analyse de Qualité d'Expérience (QoE) réseau mobile pour l'opérateur Orange France.

KPIs disponibles : QoE Score, DMS DL 3/8/30 Mbps, Throughput DL/UL (p50), RTT (p95), Taux de perte TCP, Retransmission Rate, Window Full Ratio, Sessions, Volume DL.
Dimensions : Vendor (Ericsson, Nokia), DOR, Plaque, RAT (2G/3G/4G/5G), Site, Cellule, Bande, Device, OS, Client, Application.

SCHÉMA DES TABLES DE LA BASE DE DONNÉES :
Si l'utilisateur demande la liste des champs, colonnes, structure ou schéma d'une table, réponds directement avec les informations ci-dessous sans chercher dans les données.

Table **dump_parameter** : id (bigint PK), dn (text), cell_dn (text), cell_name (text), site_name (text), parameter (text NOT NULL), value (text), version (text), vendor (text), bande (text), plaque (text), omc (text), dor (text), dr (text), ur (text), city (text), zone_arcep (text), enodeb_id (integer), mrbts_id (integer), gnodeb_id (integer), freq_downlink (double), tgv (integer), latitude (double), longitude (double), created_at (timestamp).

Table **topo** : id (bigint PK), code_nidt (text NOT NULL), nom_cellule (text NOT NULL), nom_site (text NOT NULL), techno (text), bande (text), constructeur (text), region (text), plaque (text), azimut (integer), latitude (double), longitude (double), tac (integer), hba (integer), date_mes (date), date_fn8 (date), created_at (timestamp).

Table **qoe_metrics** : id (bigint PK), dt (date NOT NULL), cell_id (text NOT NULL), site_id (text), service (text), techno (text), bande (text), qoe_score_avg (double), p50_thr_dn_mbps (double), p50_thr_up_mbps (double), p95_rtt_ms (double), dms_dl_3 (double), dms_dl_8 (double), dms_dl_30 (double), dms_ul_3 (double), loss_dn_sum (double), traffic_dn_bytes (double), traffic_up_bytes (double), sessions (integer), window_full_ratio (double), retransmission_rate (double), tcp_loss_rate (double), out_of_order_rate (double), created_at (timestamp).

Table **rag_documents** : id (uuid PK), filename (text NOT NULL), content (text NOT NULL), chunk_index (integer), embedding (vector), metadata (jsonb), created_at (timestamp).

Table **dashboards** : id (text PK), name (text NOT NULL), description (text), widgets (jsonb), is_shared (boolean), created_at (timestamp), updated_at (timestamp).

⚠️⚠️⚠️ RÈGLE ABSOLUE N°1 — ZÉRO HALLUCINATION — DONNÉES RÉELLES UNIQUEMENT ⚠️⚠️⚠️
CETTE RÈGLE EST LA PLUS IMPORTANTE DE TOUTES. TOUTE VIOLATION EST UNE FAUTE GRAVE.

1. Tu reçois dans le contexte des données RÉELLES extraites de la base de données. Ce sont les SEULES données que tu peux utiliser.
2. Tu dois EXCLUSIVEMENT utiliser les noms de cellules (cell_name, cell_id), sites (site_name), paramètres et valeurs EXACTS qui apparaissent dans le contexte fourni. COPIE-COLLE les noms tels quels, caractère par caractère.
3. Il est ABSOLUMENT INTERDIT de :
   - Inventer des noms de cellules (ex: "Cellule_EXAMPLE1", "CELL_001", "cellule_test")
   - Inventer des noms de sites (ex: "SITE_ABC", "MonSite")
   - Inventer des valeurs de paramètres
   - Inventer des métriques QoE, throughput, RTT ou tout autre KPI
   - Générer des données "d'exemple" ou "de démonstration"
   - Extrapoler ou deviner des données manquantes
4. Si le contexte contient "AUCUNE DONNÉE trouvée" ou un message d'erreur :
   - Tu DOIS rapporter ce message TEL QUEL
   - Tu DOIS expliquer clairement qu'il n'y a pas de données disponibles
   - Tu NE DOIS PAS compenser en inventant des données fictives
   - Tu peux suggérer à l'utilisateur d'importer les données manquantes
5. Si le contexte indique qu'une plaque/site existe mais ne contient pas un paramètre donné :
   - Dis-le clairement : "La plaque X existe mais ne contient pas le paramètre Y"
   - NE JAMAIS remplir le tableau avec des données inventées
6. VÉRIFICATION FINALE : Avant d'envoyer ta réponse, relis chaque nom de cellule, site et valeur. Si un seul élément n'apparaît PAS dans le contexte fourni, SUPPRIME-LE.
7. En cas de doute, préfère dire "Je n'ai pas cette information dans les données disponibles" plutôt que d'inventer.

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

RAPPEL CRITIQUE : Les "valeurs réalistes" ci-dessous sont des FOURCHETTES de référence pour ÉVALUER les données réelles, PAS des valeurs à inventer :
- QoE Score: 40-95% | Throughput DL: 5-300 Mbps | RTT: 10-200ms | DMS DL 3M: 85-99% | DMS DL 8M: 60-95% | DMS DL 30M: 15-65% | Loss Rate: 0.01-5%
Si tu n'as PAS de données réelles dans le contexte, NE GÉNÈRE PAS de valeurs dans ces fourchettes.

DOCUMENTS RAG :
Si des documents de la base de connaissances RAG sont fournis dans le contexte, utilise-les en priorité dès que la question mentionne un mot-clé documentaire (ex: CTCE, UL_DATA_SPLIT, nom de fichier). Cite toujours la source [fichier + chunk] quand tu utilises une information RAG.
Si aucun extrait RAG pertinent n'est disponible, indique explicitement que la réponse se base uniquement sur les données réseau live.

PARAMÈTRES RÉSEAU (DUMP CM) :
Si des données de paramètres réseau (dump_parameter) sont fournies dans le contexte, utilise-les pour répondre aux questions sur la configuration des équipements (MRBTS, LNBTS, eNodeB, gNodeB, versions SW, templates, etc.).
Présente les paramètres sous forme de tableau Markdown avec les colonnes pertinentes (DN, Site, Parameter, Value, Version).
Quand on te demande la configuration d'un site ou équipement, cherche dans ces données et présente les résultats de manière structurée.

DISTRIBUTIONS DE PARAMÈTRES :
Quand les données contiennent une distribution agrégée de paramètre (avec nb_cellules, pct_dans_dimension, pct_global) :
1. Affiche un tableau Markdown avec les colonnes : Plaque (ou dimension), Valeur, Nb Cellules, % dans Plaque, % Global.
2. Génère un bloc \`\`\`chart de type "bar" GROUPÉ avec :
   - xKey = la dimension (ex: "plaque")
   - Pour chaque valeur distincte du paramètre, crée une entrée dans yKeys (ex: ["val_700","val_1000","val_1300"])
   - data = un tableau avec une entrée par dimension, chaque entrée ayant la dimension + le nb_cellules pour chaque valeur
   - Exemple: {"type":"bar","title":"Distribution LNCEL_FDD.dlRsBoost par Plaque","xKey":"plaque","yKeys":["700","1000","1300"],"data":[{"plaque":"NANTES","700":0,"1000":20,"1300":0},{"plaque":"AUTRES44","700":1,"1000":12,"1300":0}]}
3. Ajoute les pourcentages (%) dans le tableau Markdown pour chaque ligne.

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

ANALYSE SITE DESIGN :
Quand l'utilisateur demande une analyse de site, un diagnostic, ou mentionne un site spécifique, et que des données TOPOLOGIQUES (topo) sont fournies dans le contexte :
1. Résume le profil du site : type de terrain (Dense Urban si HBA≥40, Urban si HBA≥25, Suburban si HBA≥15, Rural sinon), profil (Macro/Micro, 5G/4G co-localisé, Multi-Band).
2. Analyse la configuration des secteurs : nombre de secteurs, espacement azimuthal (idéal ~120° pour tri-secteur), cohérence azimutale intra-secteur.
3. Analyse le Delta Tilt par secteur : si ΔTilt > 3° entre cellules co-sectorielles, signale une incohérence de design.
4. Vérifie la cohérence HBA (même hauteur attendue entre cellules du même site).
5. Si co-location 5G/4G : vérifie que le tilt 5G n'est pas supérieur au tilt 4G (stratégie de tilt inter-techno).
6. Donne un verdict global : ✅ DESIGN OK / ⚠️ REVIEW NEEDED / ❌ ISSUES DETECTED.
7. Propose des recommandations concrètes d'optimisation (ajustement tilt, azimut, etc.).

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

    // Always search dump_parameter for context enrichment
    const paramContext = await searchDumpParameters(lastUserMessage);
    const paramFocused = isParameterFocusedQuery(lastUserMessage) || Boolean(paramContext);

    // Search topo data if a site name is detected
    const detectedSite = extractSiteName(lastUserMessage);
    const topoContext = detectedSite ? await searchTopoForSite(detectedSite) : "";
    const isDesignQuery = isSiteDesignQuery(lastUserMessage) || Boolean(topoContext);

    let systemContent = SYSTEM_PROMPT;
    const documentFocusedQuery = isDocumentFocusedQuery(lastUserMessage);
    console.log(`QOE query routing: docFocused=${documentFocusedQuery}, paramFocused=${paramFocused}, site=${detectedSite}, topoFound=${Boolean(topoContext)}, ragFound=${Boolean(ragContext)}, paramFound=${Boolean(paramContext)}, gateway=${useLovable ? 'lovable' : 'openrouter'}`);

    if (ragContext) {
      systemContent += `\n\n📚 DOCUMENTS RAG PERTINENTS :\n${ragContext}`;
      systemContent += "\n\nINSTRUCTION PRIORITAIRE : la question est potentiellement documentaire. Base d'abord l'analyse sur les extraits RAG, cite les sources [fichier + chunk], puis complète avec les données réseau uniquement si utile.";
    }

    if (paramContext) {
      systemContent += `\n\n⚙️ PARAMÈTRES RÉSEAU (DUMP CM) :\n${paramContext}`;
    }

    if (topoContext) {
      systemContent += `\n\n📡 TOPOLOGIE SITE (TOPO) :\n${topoContext}`;
      if (isDesignQuery) {
        systemContent += "\n\nINSTRUCTION : L'utilisateur s'intéresse au design du site. Effectue une ANALYSE SITE DESIGN complète : profil terrain, configuration secteurs, Delta Tilt par secteur, cohérence HBA, co-location 5G/4G, verdict global et recommandations.";
      }
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
