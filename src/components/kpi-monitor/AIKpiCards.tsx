import React from 'react';
import { BarChart3, Layers, ArrowDown, ArrowUp, TrendingDown, TrendingUp } from 'lucide-react';

interface KpiSummary {
  kpiKey: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  state?: string;
}

interface SplitEntry {
  label: string;
  avg: number;
  count?: number;
}

export interface ParsedKpiBlock {
  type: 'kpi_summary' | 'split_section' | 'markdown';
  summaries?: KpiSummary[];
  splitDimension?: string;
  splitEntries?: SplitEntry[];
  content?: string;
}

export function parseKpiBlocks(text: string): ParsedKpiBlock[] {
  const blocks: ParsedKpiBlock[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Detect KPI summary: "• kpi_key: avg=X | min=Y | max=Z"
    if (/[•\-\*]\s*\*{0,2}[\w]+\*{0,2}\s*:\s*avg\s*=/.test(line)) {
      const summaries: KpiSummary[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/[•\-\*]\s*\*{0,2}([\w]+)\*{0,2}\s*:\s*avg\s*=\s*([\d.]+)\s*\|\s*min\s*=\s*([\d.]+)\s*\|\s*max\s*=\s*([\d.]+)/);
        if (!m) break;
        summaries.push({ kpiKey: m[1], avg: parseFloat(m[2]), min: parseFloat(m[3]), max: parseFloat(m[4]) });
        i++;
      }
      if (summaries.length > 0) { blocks.push({ type: 'kpi_summary', summaries }); continue; }
    }

    // Detect split section: "Split par DOR"
    const splitMatch = line.match(/(?:📊|📈|🔍)?\s*\**Split\s+par\s+([\w\s]+?)\**/i);
    if (splitMatch) {
      const dimension = splitMatch[1].trim();
      i++;
      const entries: SplitEntry[] = [];
      while (i < lines.length) {
        const em = lines[i].match(/[•\-\*]\s*\*{0,2}(.+?)\*{0,2}\s*:\s*avg\s*=\s*([\d.]+)(?:\s*\((\d+)\s*points?\))?/);
        if (!em) break;
        entries.push({ label: em[1].trim(), avg: parseFloat(em[2]), count: em[3] ? parseInt(em[3]) : undefined });
        i++;
      }
      if (entries.length > 0) { blocks.push({ type: 'split_section', splitDimension: dimension, splitEntries: entries }); continue; }
    }

    // Markdown accumulation
    const last = blocks[blocks.length - 1];
    if (last?.type === 'markdown') { last.content += '\n' + line; }
    else { blocks.push({ type: 'markdown', content: line }); }
    i++;
  }
  return blocks;
}

function fmtNumber(v: number | null | undefined): string {
  if (v == null) return '—';
  if (Math.abs(v) >= 1_000_000) return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(v / 1_000)) + 'k';
  if (Math.abs(v) >= 1_000) return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(v));
  if (Math.abs(v) < 0.01) return v.toFixed(4);
  if (Math.abs(v) < 1) return v.toFixed(3);
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(v);
}

function getSeverityColor(rank: number, total: number): { bg: string; text: string; dot: string } {
  const pct = total <= 1 ? 0 : rank / (total - 1);
  if (pct <= 0.2) return { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500' };
  if (pct <= 0.5) return { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-500' };
  if (pct <= 0.8) return { bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-500' };
  return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' };
}

/* ─── KPI Summary Cards ─── */
export const KpiSummaryCards: React.FC<{ summaries: KpiSummary[] }> = ({ summaries }) => (
  <div className="my-3 space-y-2.5">
    <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase tracking-wider">
      <BarChart3 className="w-3.5 h-3.5" />
      Résumé KPI
    </div>
    <div className="grid grid-cols-1 gap-2.5">
      {summaries.map((s, i) => {
        const range = (s.max ?? 0) - (s.min ?? 0);
        const avgPos = range > 0 ? (((s.avg ?? 0) - (s.min ?? 0)) / range) * 100 : 50;
        return (
          <div key={i} className="rounded-xl border border-border/60 bg-gradient-to-br from-card to-muted/20 p-3.5 space-y-3">
            {/* KPI Name */}
            <span className="text-[11px] font-bold text-primary/80 uppercase tracking-wide block" title={s.kpiKey}>
              {s.kpiKey.replace(/_/g, ' ')}
            </span>

            {/* AVG / MIN / MAX structured layout */}
            <div className="grid grid-cols-3 gap-2">
              {/* AVG – dominant */}
              <div className="col-span-1 flex flex-col items-center rounded-lg bg-primary/[0.07] py-2 px-1">
                <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">AVG</span>
                <span className="text-lg font-black text-foreground tabular-nums leading-tight">{fmtNumber(s.avg)}</span>
              </div>
              {/* MIN */}
              <div className="col-span-1 flex flex-col items-center rounded-lg bg-muted/40 py-2 px-1">
                <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">MIN</span>
                <span className="text-sm font-bold text-muted-foreground tabular-nums leading-tight">{fmtNumber(s.min)}</span>
              </div>
              {/* MAX */}
              <div className="col-span-1 flex flex-col items-center rounded-lg bg-muted/40 py-2 px-1">
                <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">MAX</span>
                <span className="text-sm font-bold text-muted-foreground tabular-nums leading-tight">{fmtNumber(s.max)}</span>
              </div>
            </div>

            {/* Range bar */}
            <div className="space-y-1">
              <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary/30 to-primary/60 rounded-full"
                  style={{ width: `${avgPos}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary border-2 border-card shadow-sm"
                  style={{ left: `calc(${avgPos}% - 5px)` }}
                />
              </div>
              <div className="flex justify-between text-[8px] text-muted-foreground/60 tabular-nums">
                <span>{fmtNumber(s.min)}</span>
                <span>{fmtNumber(s.max)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

/* ─── Split Section Cards ─── */
export const SplitSectionCards: React.FC<{ dimension: string; entries: SplitEntry[] }> = ({ dimension, entries }) => {
  const maxVal = Math.max(...entries.map(e => e.avg));
  const isSortedDesc = entries.every((e, i) => i === 0 || e.avg <= entries[i - 1].avg);
  const isSortedAsc = entries.every((e, i) => i === 0 || e.avg >= entries[i - 1].avg);

  return (
    <div className="my-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase tracking-wider">
          <Layers className="w-3.5 h-3.5" />
          Split par {dimension}
        </div>
        {(isSortedDesc || isSortedAsc) && (
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground/70 font-medium">
            {isSortedDesc ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
            <span>trié par avg {isSortedDesc ? '↓' : '↑'}</span>
          </div>
        )}
      </div>

      {/* Entries */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        {entries.map((entry, i) => {
          const pct = maxVal > 0 ? (entry.avg / maxVal) * 100 : 0;
          const severity = getSeverityColor(i, entries.length);
          return (
            <div
              key={i}
              className={`relative flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30 ${
                i > 0 ? 'border-t border-border/20' : ''
              }`}
            >
              {/* Background bar */}
              <div className="absolute inset-y-0 left-0 bg-primary/[0.03]" style={{ width: `${pct}%` }} />

              {/* Rank badge with severity color */}
              <span className={`relative z-10 w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${severity.bg} ${severity.text}`}>
                #{i + 1}
              </span>

              {/* Severity dot */}
              <span className={`relative z-10 w-2 h-2 rounded-full shrink-0 ${severity.dot}`} />

              {/* Label */}
              <span className="relative z-10 flex-1 text-[11px] font-semibold text-foreground truncate" title={entry.label}>
                {entry.label}
              </span>

              {/* Value */}
              <span className="relative z-10 text-[12px] font-black text-foreground tabular-nums">
                {fmtNumber(entry.avg)}
              </span>

              {/* Count */}
              {entry.count != null && (
                <span className="relative z-10 text-[9px] text-muted-foreground/60 font-medium">
                  ({entry.count} pts)
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
