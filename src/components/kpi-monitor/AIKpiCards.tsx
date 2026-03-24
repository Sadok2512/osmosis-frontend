import React from 'react';
import { BarChart3, Layers } from 'lucide-react';

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

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + 'k';
  if (Math.abs(v) < 1) return v.toFixed(4);
  return v.toFixed(2);
}

export const KpiSummaryCards: React.FC<{ summaries: KpiSummary[] }> = ({ summaries }) => (
  <div className="my-3 space-y-2">
    <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase tracking-wider">
      <BarChart3 className="w-3 h-3" />
      Résumé KPI
    </div>
    <div className="grid grid-cols-1 gap-2">
      {summaries.map((s, i) => {
        const range = (s.max ?? 0) - (s.min ?? 0);
        const avgPos = range > 0 ? (((s.avg ?? 0) - (s.min ?? 0)) / range) * 100 : 50;
        return (
          <div key={i} className="rounded-xl border border-border/60 bg-gradient-to-br from-card to-muted/20 p-3 space-y-2">
            <span className="text-[10px] font-bold text-foreground truncate block" title={s.kpiKey}>
              {s.kpiKey.replace(/_/g, ' ')}
            </span>
            <div className="text-center">
              <span className="text-xl font-black text-foreground tabular-nums">{fmt(s.avg)}</span>
            </div>
            <div className="space-y-1">
              <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary/30 to-primary/60 rounded-full" style={{ width: `${avgPos}%` }} />
                <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary border-2 border-card shadow-sm" style={{ left: `calc(${avgPos}% - 5px)` }} />
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground tabular-nums">
                <span>min {fmt(s.min)}</span>
                <span>max {fmt(s.max)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

export const SplitSectionCards: React.FC<{ dimension: string; entries: SplitEntry[] }> = ({ dimension, entries }) => {
  const maxVal = Math.max(...entries.map(e => e.avg));
  return (
    <div className="my-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase tracking-wider">
        <Layers className="w-3 h-3" />
        Split par {dimension}
      </div>
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/30">
        {entries.map((entry, i) => {
          const pct = maxVal > 0 ? (entry.avg / maxVal) * 100 : 0;
          return (
            <div key={i} className="relative px-3 py-2.5 flex items-center gap-3 hover:bg-muted/30 transition-colors">
              <div className="absolute inset-y-0 left-0 bg-primary/[0.04]" style={{ width: `${pct}%` }} />
              <span className={`relative z-10 w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black shrink-0 ${
                i === 0 ? 'bg-primary/15 text-primary' : i < 3 ? 'bg-muted text-foreground' : 'bg-muted/50 text-muted-foreground'
              }`}>{i + 1}</span>
              <span className="relative z-10 flex-1 text-[11px] font-semibold text-foreground truncate">{entry.label}</span>
              <span className="relative z-10 text-[11px] font-black text-foreground tabular-nums">{fmt(entry.avg)}</span>
              {entry.count != null && <span className="relative z-10 text-[9px] text-muted-foreground">({entry.count}pts)</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};