import type {
  AgentResponse,
  AgentName,
  KPI,
  Visualization,
  StatusType,
  TableData,
  Insight,
  Anomaly,
} from "../lib/types";
import { parseVisualizationBlocks } from "@/components/otarie/chat-visualizations/parseVisualizationBlocks";
import type { ChartBlock } from "@/components/otarie/chat-visualizations/InlineChart";
import type { KPIBlock } from "@/components/otarie/chat-visualizations/InlineKPICards";

const KIT_AGENTS: ReadonlySet<AgentName> = new Set([
  "OSMOSIS", "RCAI", "OPTIMUS", "AEGIS", "EXA", "ECHO",
  "PULSE", "TRACE", "SENTINEL", "TOPO", "PARMY", "ANALYTIC",
]);

const STATUS_MAP: Record<string, StatusType> = {
  excellent: "success",
  good: "success",
  warning: "warning",
  critical: "danger",
};

const PALETTE = [
  "#0F6E56", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#10B981",
  "#EC4899", "#06B6D4", "#F97316", "#6366F1", "#14B8A6", "#84CC16",
];

function mapStatus(s?: string): StatusType {
  if (!s) return "neutral";
  return STATUS_MAP[s.toLowerCase()] ?? "neutral";
}

function normalizeAgent(raw: string | undefined): AgentName {
  const up = (raw || "").toUpperCase();
  if (KIT_AGENTS.has(up as AgentName)) return up as AgentName;
  if (up === "DIAGNOSE" || up === "ANOMALY") return "RCAI";
  if (up === "OPTIMIZE") return "OPTIMUS";
  if (up === "INSIGHT") return "ECHO";
  return "OSMOSIS";
}

function kpiBlockToKpis(block: KPIBlock): KPI[] {
  if (!block.cards || !Array.isArray(block.cards)) return [];
  return block.cards.map(c => ({
    label: c.label,
    value: c.unit ? `${c.value}${c.unit}` : c.value,
    trend: (c.trend as KPI["trend"]) ?? null,
    trend_value: c.delta,
    status: mapStatus(c.status),
  }));
}

function chartBlockToViz(block: ChartBlock): Visualization | null {
  if (!block.xKey || !Array.isArray(block.yKeys) || !Array.isArray(block.data)) return null;
  const xData = block.data.map(row => String(row[block.xKey] ?? ""));
  const series = block.yKeys.map((yk, i) => ({
    name: yk,
    color: (block.colors && block.colors[i]) || PALETTE[i % PALETTE.length],
    data: block.data.map(row => {
      const v = row[yk];
      const n = typeof v === "number" ? v : parseFloat(String(v));
      return Number.isFinite(n) ? n : 0;
    }),
  }));
  let type: Visualization["type"] = "grouped_bar";
  if (block.type === "stacked_bar") type = "stacked_bar";
  else if (block.type === "line") type = "line";
  else if (block.type === "area") type = "area";
  else if (block.type === "pie") type = "pie";
  else if (block.type === "scatter") type = "scatter";
  return {
    type,
    title: block.title || "Chart",
    x_axis: { label: block.xKey, data: xData },
    y_axis: { label: block.yKeys.join(" / "), unit: "" },
    series,
  };
}

/** Best-effort markdown-table extraction (first GFM table). */
function extractFirstTable(markdown: string): { table: TableData | null; rest: string } {
  const lines = markdown.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].trim().startsWith("|") && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      start = i;
      break;
    }
  }
  if (start < 0) return { table: null, rest: markdown };

  let end = start + 2;
  while (end < lines.length && lines[end].trim().startsWith("|")) end++;

  const headerLine = lines[start];
  const dataLines = lines.slice(start + 2, end);
  const headers = headerLine.split("|").slice(1, -1).map(c => c.trim()).filter(Boolean);
  if (headers.length === 0 || dataLines.length === 0) return { table: null, rest: markdown };

  const columns: TableData["columns"] = headers.map(h => ({
    key: h.toLowerCase().replace(/\s+/g, "_"),
    label: h,
    type: "text",
    sortable: true,
  }));
  const rows = dataLines
    .map(line => line.split("|").slice(1, -1).map(c => c.trim()))
    .filter(arr => arr.length === headers.length)
    .map(arr => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        const k = h.toLowerCase().replace(/\s+/g, "_");
        const raw = arr[i];
        const num = parseFloat(raw.replace(/[%°,]/g, "").replace(/\s/g, ""));
        obj[k] = Number.isFinite(num) && /^-?\d/.test(raw) ? num : raw;
      });
      return obj;
    });

  for (const col of columns) {
    const values = rows.map(r => r[col.key]);
    if (values.length && values.every(v => typeof v === "number")) col.type = "number";
  }

  const rest = [...lines.slice(0, start), ...lines.slice(end)].join("\n");
  return {
    table: { title: "Détails", columns, rows, features: ["sort", "search"], page_size: 25 },
    rest,
  };
}

const TRANSITION_PREFIX = /^(je vais|voici|voilà|voila|let me|i'?ll|i will|sure[,!]?|d'accord|ok[,!]?\s|alors[,!]?\s|maintenant)/i;
const DECORATIVE_LINE = /^[#=*\-_•—]+\s*$/;

function deriveTLDRAndInsights(markdown: string): { headline: string; insights: Insight[] } {
  const cleaned = markdown.replace(/```[\s\S]*?```/g, "").trim();
  if (!cleaned) return { headline: "Réponse de l'agent", insights: [] };

  const lines = cleaned.split("\n").map(l => l.trim()).filter(Boolean);

  let headline = "Réponse de l'agent";
  for (const line of lines) {
    if (DECORATIVE_LINE.test(line)) continue;
    const stripped = line.replace(/^#+\s*/, "").replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*/u, "").trim();
    if (!stripped) continue;
    if (TRANSITION_PREFIX.test(stripped)) continue;
    headline = stripped.slice(0, 200);
    break;
  }
  if (headline === "Réponse de l'agent") {
    const firstReal = lines.find(l => !DECORATIVE_LINE.test(l));
    if (firstReal) headline = firstReal.replace(/^#+\s*/, "").slice(0, 200);
  }

  const insights: Insight[] = [];
  for (const line of lines.slice(0, 16)) {
    if (line === headline) continue;
    const m = line.match(/^[-*•]\s+(.+)/) || line.match(/^\d+[.)]\s+(.+)/);
    if (m) insights.push({ text: m[1].slice(0, 280) });
    else if (line.length > 20 && line.length < 240 && !TRANSITION_PREFIX.test(line) && /[a-zà-ÿ]/i.test(line) && !line.startsWith("#")) {
      insights.push({ text: line });
    }
    if (insights.length >= 6) break;
  }
  return { headline, insights };
}

/**
 * Parse the existing AI streaming output (markdown + fenced viz blocks)
 * into the osmosis-ui-kit AgentResponse schema.
 */
export function parseToAgentResponse(
  rawContent: string,
  agentName?: string,
  meta?: { duration_ms?: number; source?: string },
): AgentResponse {
  const blocks = parseVisualizationBlocks(rawContent);
  const kpis: KPI[] = [];
  const visualizations: Visualization[] = [];
  const structuredInsights: Insight[] = [];
  let markdown = "";

  for (const b of blocks) {
    if (b.type === "kpi") {
      kpis.push(...kpiBlockToKpis(b.config as KPIBlock));
    } else if (b.type === "chart") {
      const v = chartBlockToViz(b.config as ChartBlock);
      if (v) visualizations.push(v);
    } else if (b.type === "insights") {
      const cfg = (b as { type: "insights"; config: unknown }).config;
      if (cfg && typeof cfg === "object") {
        structuredInsights.push(cfg as unknown as Insight);
      }
    } else if (b.type === "markdown") {
      markdown += (markdown ? "\n\n" : "") + (b as { type: "markdown"; content: string }).content;
    }
    // map / worst_cells blocks: ignored at the adapter layer; AIAssistantPage
    // renders them with dedicated components above the kit response.
  }

  const { table, rest } = extractFirstTable(markdown);
  const { headline, insights } = deriveTLDRAndInsights(rest);

  // Anomaly detection — only danger-status KPIs or explicit "Anomalies" sections.
  const anomalies: Anomaly[] = [];
  for (const k of kpis) {
    if (k.status === "danger") {
      anomalies.push({
        severity: "danger",
        entity: k.label,
        description: `${k.label}: ${k.value}`,
      });
    }
  }
  const anomalyHeader = rest.match(/(?:^|\n)#{1,4}\s*(?:⚠️\s*)?(?:Anomali[eé]s?|Issues?|Alertes?)\s*(?:\(\d+\))?\s*\n+([^\n#][^\n]{0,300})/i);
  if (anomalyHeader && anomalyHeader[1]) {
    anomalies.push({
      severity: "warning",
      entity: "Anomalies détectées",
      description: anomalyHeader[1].trim(),
    });
  }

  return {
    agent: normalizeAgent(agentName),
    query_meta: {
      duration_ms: meta?.duration_ms ?? 0,
      source: meta?.source ?? "live-stream",
      confidence: 0.95,
    },
    tldr: {
      headline,
      highlights: kpis.length > 0
        ? kpis.slice(0, 3).map(k => ({ label: `${k.label}: ${k.value}`, type: k.status }))
        : [],
    },
    kpis,
    visualizations: visualizations.length ? visualizations : undefined,
    table: table || undefined,
    anomalies: anomalies.length ? anomalies : undefined,
    insights: structuredInsights.length
      ? structuredInsights
      : (insights.length ? insights : undefined),
  };
}

export default parseToAgentResponse;
