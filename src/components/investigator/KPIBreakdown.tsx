import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import { fetchExplain } from '../kpi-monitor/api/kpiMonitorApi';
import { getApiUrl, getApiHeaders, logBackendRequest } from '@/lib/apiConfig';
import { buildTimeline, formatAxisLabel } from './timeUtils';
import { DataPoint, Granularity, Jalon } from './types';
import { normalizeTimestamp } from './timeUtils';
import { fetchCounterTimeSeriesFallback } from './investigatorApi';
import {
  Layers, Calculator, Eye, EyeOff, Info, ChevronDown,
  Database, GitBranch, Cpu, TrendingUp, Filter, Sigma, Divide,
  BarChart3, Table2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ──────────────────── Types ──────────────────── */

interface Props {
  selectedKpis: string[];
  layout: 1 | 2 | 3 | 4;
  dateFrom?: string;
  dateTo?: string;
  granularity?: Granularity;
  filters?: { dimension: string; values: string[] }[];
  splitBy?: string;
  /** Per-KPI split dimension map (kept for compatibility, ignored by Breakdown). */
  splitByPerKpi?: Record<string, string>;
  timeSeriesData?: DataPoint[];
  jalons?: Jalon[];
}

interface ExplainCounterRecord {
  name?: unknown;
  counter_name?: unknown;
  counter_id?: unknown;
  counter?: unknown;
  tag?: unknown;
  role?: unknown;
  description?: unknown;
  unit?: unknown;
  source?: unknown;
  vendor?: unknown;
  aggregation?: unknown;
}

interface KpiExplain {
  kpi_key: string;
  display_name: string;
  description: string;
  category: string;
  unit: string;
  formula_type: string;
  numerator: string;
  denominator: string;
  counters?: Array<string | ExplainCounterRecord>;
  techno: string;
  vendor: string;
}

interface CounterInfo {
  name: string;
  tag: 'NUM' | 'DEN';
  description?: string;
  unit?: string;
  source?: string;
  aggregation?: string;
}

interface CounterTsPoint {
  ts: string;
  counter: string;
  value: number;
  ne?: string;
  dimension_key?: string;
}

interface CounterSeriesPoint {
  timestamp?: string;
  kpi?: string;
  counter?: string;
  counter_id?: string;
  counter_name?: string;
  kpi_key?: string;
  value?: number | null;
  splitValue?: string;
  networkElement?: string;
}

const NUM_COLORS = ['#22c55e', '#16a34a', '#4ade80', '#86efac', '#15803d'];
const DEN_COLORS = ['#3b82f6', '#2563eb', '#60a5fa', '#93c5fd', '#1d4ed8'];

/** Palette used when a split dimension is active — one color per dim value. */
const SPLIT_COLORS = [
  '#6366f1', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#d946ef',
  '#eab308', '#0ea5e9',
];

/** Maximum number of dimension values kept when splitting (rest bucketed as "other"). */
const SPLIT_TOP_N = 10;

/** PM dimension types forwarded as `dimension_filter` in the counters/timeseries request. */

/** Build ECharts markLine config from jalons for a given set of timestamps */
function jalonMarkLine(timestamps: string[], jalons: Jalon[], granularity: Granularity) {
  if (!jalons || jalons.length === 0) return undefined;
  const data = jalons.map(j => {
    const normDate = normalizeTimestamp(j.date, granularity);
    let xVal = normDate;
    if (!timestamps.includes(normDate) && timestamps.length > 0) {
      const jTime = new Date(j.date).getTime();
      let closest = timestamps[0];
      let closestDiff = Math.abs(new Date(closest).getTime() - jTime);
      for (const ts of timestamps) {
        const diff = Math.abs(new Date(ts).getTime() - jTime);
        if (diff < closestDiff) { closest = ts; closestDiff = diff; }
      }
      xVal = closest;
    }
    return {
      xAxis: xVal,
      label: { show: true, formatter: j.label, fontSize: 9, fontWeight: 'bold' as const, color: j.color, position: 'insideEndTop' as const },
      lineStyle: { color: j.color, width: 2, type: 'dashed' as const },
    };
  });
  return { silent: true, symbol: 'none', data };
}
const PM_DIM_TYPES = new Set(['PMQAP', 'FLEX', 'NEIGHBOR', 'RANSHARE', 'SLICE', '5QI', 'TRANSPORT', 'CA_REL']);

const cleanCounterName = (value: unknown): string => {
  const name = String(value || '').trim();
  if (!name) return '';
  return name.split('@')[0].trim();
};

const extractCounters = (formula: string): string[] => {
  if (!formula) return [];
  const counters = new Set<string>();
  const quotedPattern = /[`{]([A-Za-z0-9_]+)(?:@[^`}]*)?[`}]|\b(pm[A-Za-z][A-Za-z0-9_]+)\b/g;
  let match: RegExpExecArray | null;
  while ((match = quotedPattern.exec(formula)) !== null) {
    const name = cleanCounterName(match[1] || match[2]);
    if (name) counters.add(name);
  }
  return [...counters];
};

const matchesKpiSeries = (seriesKpi: string, kpiId: string): boolean =>
  seriesKpi === kpiId || seriesKpi.startsWith(`${kpiId}@`);

const textValue = (value: unknown): string => typeof value === 'string' ? value : '';

const normalizeExplainCounters = (explain: KpiExplain): CounterInfo[] => {
  const rawCounters = Array.isArray(explain.counters) ? explain.counters : [];
  const normalized = rawCounters.map((raw): CounterInfo | null => {
    if (typeof raw === 'string') {
      const name = cleanCounterName(raw);
      return name ? { name, tag: 'NUM', source: explain.vendor, aggregation: 'SUM' } : null;
    }
    if (!raw || typeof raw !== 'object') return null;
    const name = cleanCounterName(
      raw.name ||
      raw.counter_name ||
      raw.counter_id ||
      raw.counter
    );
    if (!name) return null;
    const rawTag = String(raw.tag || raw.role || '').toUpperCase();
    const tag: 'NUM' | 'DEN' = rawTag === 'DEN' || rawTag === 'DENOMINATOR' ? 'DEN' : 'NUM';
    return {
      name,
      tag,
      description: textValue(raw.description),
      unit: textValue(raw.unit),
      source: textValue(raw.source) || textValue(raw.vendor) || explain.vendor,
      aggregation: textValue(raw.aggregation) || 'SUM',
    };
  }).filter((counter): counter is CounterInfo => Boolean(counter));

  return normalized.filter((counter, index, arr) =>
    arr.findIndex((item) => item.name === counter.name && item.tag === counter.tag) === index
  );
};

const splitFieldFor = (splitBy?: string): string | undefined => {
  const normalized = (splitBy || '').replace('PM_DIM:', '').toUpperCase();
  if (normalized === 'CELL') return 'cell_name';
  if (normalized === 'SITE') return 'site_name';
  return undefined;
};

const splitRequestValue = (splitBy?: string): string | undefined => {
  if (!splitBy || splitBy === 'None') return undefined;
  return splitFieldFor(splitBy) ? splitBy : splitBy.startsWith('PM_DIM:') ? splitBy : `PM_DIM:${splitBy}`;
};

const toDateOnly = (value: string): string => (value || '').split('T')[0];

const parseConstantDenominator = (value?: string): number | null => {
  const cleaned = String(value || '').trim().replace(/[(),\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};

const asFiniteNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const formatMetricValue = (value: number | null | undefined, unit?: string): string => {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 10 ? 2 : 3;
  const formatted = value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
  return unit ? `${formatted} ${unit}` : formatted;
};

const splitElementOf = (point: DataPoint): string =>
  String(point.splitValue || point.networkElement || 'Aggregated').trim() || 'Aggregated';

const normalizeKpiExplain = (payload: unknown, kpiId: string): KpiExplain => {
  const data = asRecord(payload);
  return {
    kpi_key: textValue(data.kpi_key) || kpiId,
    display_name: textValue(data.display_name) || kpiId,
    description: textValue(data.description),
    category: textValue(data.category),
    unit: textValue(data.unit),
    formula_type: textValue(data.formula_type) || 'ratio',
    numerator: textValue(data.numerator) || textValue(data.formula_num) || textValue(data.formula),
    denominator: textValue(data.denominator) || textValue(data.formula_den),
    counters: Array.isArray(data.counters) ? data.counters as Array<string | ExplainCounterRecord> : [],
    techno: textValue(data.techno),
    vendor: textValue(data.vendor),
  };
};

/* ──────────────────── Sub-components ──────────────────── */

const FormulaPanel: React.FC<{
  explain: KpiExplain | null;
  numCounters: CounterInfo[];
  denCounters: CounterInfo[];
  hoveredCounter: string | null;
  onHoverCounter: (name: string | null) => void;
  hiddenCounters: Set<string>;
  onToggleCounter: (name: string) => void;
  splitBy?: string;
  splitElements?: string[];
  selectedElements?: Set<string>;
  onToggleElement?: (el: string) => void;
  onSelectAllElements?: () => void;
  onDeselectAllElements?: () => void;
  elementColorMap?: Map<string, string>;
  /**
   * When true, suppress the Calculation / Numerator / Denominator
   * blocks. The caller (multi-vendor mode) renders its own per-vendor
   * formula card below — duplicating that here would mix counters
   * across vendors in confusing chip rows. Header + Elements selector
   * stay visible because they are still needed.
   */
  compact?: boolean;
}> = ({ explain, numCounters, denCounters, hoveredCounter, onHoverCounter, hiddenCounters, onToggleCounter, splitBy, splitElements, selectedElements, onToggleElement, onSelectAllElements, onDeselectAllElements, elementColorMap, compact }) => {
  const [showSplitElements, setShowSplitElements] = useState(false);

  if (!explain) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-6 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading formula...</div>
      </div>
    );
  }

  const renderCounterChip = (c: CounterInfo, idx: number) => {
    const isNum = c.tag === 'NUM';
    const colors = isNum ? NUM_COLORS : DEN_COLORS;
    const color = colors[idx % colors.length];
    const isHovered = hoveredCounter === c.name;
    const isHidden = hiddenCounters.has(c.name);

    return (
      <button
        key={c.name}
        onMouseEnter={() => onHoverCounter(c.name)}
        onMouseLeave={() => onHoverCounter(null)}
        onClick={() => onToggleCounter(c.name)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border cursor-pointer',
          isHovered ? 'ring-2 ring-primary/40 shadow-md scale-[1.02]' : '',
          isHidden
            ? 'opacity-40 bg-muted/20 border-border/20 text-muted-foreground line-through'
            : isNum
              ? 'bg-green-500/10 border-green-500/30 text-green-700 hover:bg-green-500/20'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-700 hover:bg-blue-500/20'
        )}
      >
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0 transition-opacity"
          style={{ backgroundColor: color, opacity: isHidden ? 0.3 : 1 }}
        />
        <span className="font-mono truncate max-w-[180px]">{c.name}</span>
        {isHidden ? <EyeOff className="w-3 h-3 ml-1 opacity-50" /> : <Eye className="w-3 h-3 ml-1 opacity-30" />}
      </button>
    );
  };

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/30 bg-muted/10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Calculator className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-foreground tracking-tight">{explain.display_name}</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{explain.description}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {[
              { label: explain.formula_type, color: 'bg-primary/10 text-primary border-primary/30' },
              { label: explain.unit || 'ratio', color: 'bg-muted/60 text-muted-foreground border-border/30' },
              { label: explain.techno, color: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
              ...(splitBy && splitBy !== 'None'
                ? [{ label: `SPLIT: ${splitBy}`, color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30' }]
                : []),
            ].filter(t => t.label).map(t => (
              <span key={t.label} className={cn('px-2 py-0.5 rounded-md text-[9px] font-bold border', t.color)}>
                {t.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Split Element Filter */}
      {splitElements && splitElements.length > 0 && selectedElements && (
        <div className="px-6 py-2.5 border-b border-border/30 bg-muted/5 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 mr-1">
            <Filter className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Elements</span>
            <span className="text-[9px] text-muted-foreground">
              ({selectedElements.size}/{splitElements.length})
            </span>
          </div>
          <button
            onClick={() => selectedElements.size === splitElements.length ? onDeselectAllElements?.() : onSelectAllElements?.()}
            className="px-2 py-0.5 rounded text-[9px] font-bold border border-border/40 text-muted-foreground hover:bg-muted/30 transition-colors"
          >
            {selectedElements.size === splitElements.length ? 'Deselect All' : 'Select All'}
          </button>
          {splitElements.length > 30 && (
            <button
              onClick={() => setShowSplitElements(v => !v)}
              className="px-2 py-0.5 rounded text-[9px] font-bold border border-border/40 text-muted-foreground hover:bg-muted/30 transition-colors"
            >
              {showSplitElements ? 'Hide list' : `Show ${splitElements.length} sites`}
            </button>
          )}
          {(splitElements.length <= 30 || showSplitElements) && splitElements.map((el, idx) => {
            const isSelected = selectedElements.has(el);
            const color = elementColorMap?.get(el) || SPLIT_COLORS[idx % SPLIT_COLORS.length];
            return (
              <button
                key={el}
                onClick={() => onToggleElement?.(el)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer',
                  isSelected
                    ? 'border-indigo-500/40 bg-indigo-500/10 text-foreground shadow-sm'
                    : 'border-border/30 bg-muted/10 text-muted-foreground opacity-50 line-through'
                )}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: color, opacity: isSelected ? 1 : 0.3 }}
                />
                {el}
              </button>
            );
          })}
        </div>
      )}

      {!compact && (
      <div className="p-5 space-y-5">
        {/* CALCULATION FORMULA — teal gradient hero */}
        <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-teal-700 px-6 py-5 text-white shadow-[0_10px_30px_rgba(13,148,136,0.25)]">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-50">Calculation formula</p>
          <p className="mt-3 break-words font-mono text-base font-medium leading-relaxed text-white whitespace-pre-wrap">
            {explain.numerator && explain.denominator && explain.denominator.trim() !== '1'
              ? `(${explain.numerator}) / (${explain.denominator})`
              : explain.numerator || explain.denominator || 'No formula available'}
          </p>
        </div>

        {/* NUMERATOR / DENOMINATOR dark code blocks */}
        <div className="grid gap-5 xl:grid-cols-2">
          {/* Numerator */}
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-[0_10px_30px_rgba(2,6,23,0.25)]">
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="flex items-center gap-2 text-[13px] font-extrabold uppercase text-[#F8FAFC]" style={{ letterSpacing: '2px' }}>
                <Sigma className="w-4 h-4 text-emerald-300" strokeWidth={2.5} />
                Numerator
              </span>
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">
                Expression
              </span>
            </div>
            <pre className="block min-h-[140px] w-full overflow-auto bg-slate-950 px-5 py-4 font-mono text-sm leading-6 text-emerald-200 whitespace-pre-wrap break-all">
              {explain.numerator || '—'}
            </pre>
            {numCounters.length > 0 && (
              <div className="flex flex-wrap gap-2 px-5 pb-5 pt-1">
                {numCounters.map((c, i) => renderCounterChip(c, i))}
              </div>
            )}
          </div>

          {/* Denominator */}
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-[0_10px_30px_rgba(2,6,23,0.25)]">
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="flex items-center gap-2 text-[13px] font-extrabold uppercase text-[#F8FAFC]" style={{ letterSpacing: '2px' }}>
                <Divide className="w-4 h-4 text-sky-300" strokeWidth={2.5} />
                Denominator
              </span>
              <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">
                Expression
              </span>
            </div>
            <pre className="block min-h-[140px] w-full overflow-auto bg-slate-950 px-5 py-4 font-mono text-sm leading-6 text-sky-200 whitespace-pre-wrap break-all">
              {explain.denominator || '—'}
            </pre>
            {denCounters.length > 0 && (
              <div className="flex flex-wrap gap-2 px-5 pb-5 pt-1">
                {denCounters.map((c, i) => renderCounterChip(c, i))}
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

const CounterDefinitionPanel: React.FC<{
  counters: CounterInfo[];
  hoveredCounter: string | null;
  onHoverCounter: (name: string | null) => void;
}> = ({ counters, hoveredCounter, onHoverCounter }) => {
  const [expanded, setExpanded] = useState(false);
  if (counters.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3 flex items-center justify-between bg-muted/10 border-b border-border/30 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">Counter Definitions</span>
          <span className="text-[10px] text-muted-foreground">({counters.length})</span>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {counters.map(c => {
            const isNum = c.tag === 'NUM';
            const isHovered = hoveredCounter === c.name;
            return (
              <div
                key={c.name}
                onMouseEnter={() => onHoverCounter(c.name)}
                onMouseLeave={() => onHoverCounter(null)}
                className={cn(
                  'rounded-lg border p-3.5 transition-all',
                  isHovered ? 'ring-2 ring-primary/30 shadow-md border-primary/40' : 'border-border/30 hover:border-border/60'
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn('px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider', isNum ? 'bg-green-500/15 text-green-600' : 'bg-blue-500/15 text-blue-500')}>{c.tag}</span>
                  <span className="text-[11px] font-bold text-foreground font-mono truncate">{c.name}</span>
                </div>
                <div className="space-y-1.5 text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <Info className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">{c.description || 'No description'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground"><Cpu className="w-3 h-3 inline mr-1" />{c.source || 'PM'}</span>
                    <span className="text-muted-foreground"><GitBranch className="w-3 h-3 inline mr-1" />{c.aggregation || 'SUM'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const KpiSummaryPanel: React.FC<{
  kpiId: string;
  explain: KpiExplain | null;
  points: DataPoint[];
  selectedElements: Set<string> | null;
  splitActive: boolean;
}> = ({ kpiId, explain, points, selectedElements, splitActive }) => {
  const scopedPoints = useMemo(() => {
    const base = points
      .filter(d => matchesKpiSeries(d.kpi, kpiId))
      .map(d => ({ ...d, value: asFiniteNumber(d.value) }))
      .filter((d): d is DataPoint & { value: number } => d.value != null);
    if (!splitActive || !selectedElements) return base;
    return base.filter(d => selectedElements.has(splitElementOf(d)));
  }, [points, kpiId, selectedElements, splitActive]);

  const stats = useMemo(() => {
    if (scopedPoints.length === 0) {
      return { avg: null, min: null, max: null, latest: null, count: 0, elements: 0 };
    }
    const values = scopedPoints.map(p => p.value);
    const sortedByTime = [...scopedPoints].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    return {
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      latest: sortedByTime[sortedByTime.length - 1]?.value ?? null,
      count: values.length,
      elements: new Set(scopedPoints.map(splitElementOf)).size,
    };
  }, [scopedPoints]);

  const unit = explain?.unit || '';
  const cards = [
    { label: 'Average', value: formatMetricValue(stats.avg, unit) },
    { label: 'Latest', value: formatMetricValue(stats.latest, unit) },
    { label: 'Min / Max', value: `${formatMetricValue(stats.min, unit)} / ${formatMetricValue(stats.max, unit)}` },
    { label: 'Samples', value: stats.count.toLocaleString(), hint: splitActive ? `${stats.elements} elements` : undefined },
  ];

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border/30 bg-muted/10 flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">KPI Summary</span>
        <span className="text-[10px] text-muted-foreground truncate">{explain?.display_name || kpiId}</span>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 p-4">
        {cards.map(card => (
          <div key={card.label} className="rounded-lg border border-border/30 bg-muted/5 px-3 py-2.5 min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{card.label}</div>
            <div className="mt-1 text-sm font-black text-foreground truncate">{card.value}</div>
            {card.hint && <div className="mt-0.5 text-[9px] text-muted-foreground">{card.hint}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

const KpiContributionPanel: React.FC<{
  kpiId: string;
  explain: KpiExplain | null;
  points: DataPoint[];
  selectedElements: Set<string> | null;
  splitActive: boolean;
  elementColorMap: Map<string, string>;
}> = ({ kpiId, explain, points, selectedElements, splitActive, elementColorMap }) => {
  const rows = useMemo(() => {
    if (!splitActive) return [];
    const grouped = new Map<string, { total: number; absTotal: number; count: number; latestTs: string; latest: number | null }>();
    for (const point of points) {
      if (!matchesKpiSeries(point.kpi, kpiId)) continue;
      const value = asFiniteNumber(point.value);
      if (value == null) continue;
      const element = splitElementOf(point);
      if (selectedElements && !selectedElements.has(element)) continue;
      const current = grouped.get(element) || { total: 0, absTotal: 0, count: 0, latestTs: '', latest: null };
      current.total += value;
      current.absTotal += Math.abs(value);
      current.count += 1;
      if (String(point.timestamp) >= current.latestTs) {
        current.latestTs = String(point.timestamp);
        current.latest = value;
      }
      grouped.set(element, current);
    }
    const denominator = [...grouped.values()].reduce((sum, item) => sum + item.absTotal, 0) || 1;
    return [...grouped.entries()]
      .map(([name, item]) => ({
        name,
        avg: item.total / item.count,
        latest: item.latest,
        count: item.count,
        share: item.absTotal / denominator,
      }))
      .sort((a, b) => b.share - a.share)
      .slice(0, 12);
  }, [points, kpiId, selectedElements, splitActive]);

  if (!splitActive || rows.length === 0) return null;
  const unit = explain?.unit || '';

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border/30 bg-muted/10 flex items-center gap-2">
        <Table2 className="w-4 h-4 text-primary" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">Element Contribution</span>
        <span className="text-[10px] text-muted-foreground">Top {rows.length} by absolute KPI contribution</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border/30 text-[9px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 font-bold">Element</th>
              <th className="px-4 py-2 font-bold text-right">Share</th>
              <th className="px-4 py-2 font-bold text-right">Average</th>
              <th className="px-4 py-2 font-bold text-right">Latest</th>
              <th className="px-4 py-2 font-bold text-right">Samples</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const color = elementColorMap.get(row.name) || SPLIT_COLORS[idx % SPLIT_COLORS.length];
              return (
                <tr key={row.name} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2 min-w-[220px]">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="font-mono text-[11px] font-bold text-foreground truncate">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-2 min-w-[120px] justify-end">
                      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(2, row.share * 100)}%`, backgroundColor: color }} />
                      </div>
                      <span className="text-[11px] font-bold text-foreground">{(row.share * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-[11px] font-medium text-foreground">{formatMetricValue(row.avg, unit)}</td>
                  <td className="px-4 py-2 text-right text-[11px] font-medium text-foreground">{formatMetricValue(row.latest, unit)}</td>
                  <td className="px-4 py-2 text-right text-[11px] text-muted-foreground">{row.count.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ──────────────────── Single KPI Tab Content ──────────────────── */

/** Fully isolated breakdown for a single KPI – own state, own fetch */
const SingleKpiBreakdown: React.FC<{
  kpiId: string;
  dateFrom: string;
  dateTo: string;
  granularity: Granularity;
  filters: { dimension: string; values: string[] }[];
  splitBy?: string;
  timeSeriesData?: DataPoint[];
  jalons?: Jalon[];
}> = ({ kpiId, dateFrom, dateTo, granularity, filters, splitBy, timeSeriesData, jalons = [] }) => {
  const [explain, setExplain] = useState<KpiExplain | null>(null);
  const [counterInfos, setCounterInfos] = useState<CounterInfo[]>([]);
  const [counterTsData, setCounterTsData] = useState<CounterTsPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [counterFallbackUnfiltered, setCounterFallbackUnfiltered] = useState(false);
  const [hoveredCounter, setHoveredCounter] = useState<string | null>(null);
  const [hiddenCounters, setHiddenCounters] = useState<Set<string>>(new Set());
  const [selectedElements, setSelectedElements] = useState<Set<string> | null>(null); // null = all selected

  // Fetch explain
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const explainUrl = getApiUrl(`pm/kpi/explain/${encodeURIComponent(kpiId)}`);
        logBackendRequest('KPI Breakdown (explain)', 'GET', explainUrl);
        const res = await fetch(explainUrl, { headers: getApiHeaders() });
        if (res.ok) {
          const data: unknown = await res.json();
          const normalized = normalizeKpiExplain(data, kpiId);
          if (!cancelled && !asRecord(data).error && (normalized.numerator || normalized.counters.length > 0)) {
            setExplain(normalized);
            return;
          }
        }
        // Fallback
        const fallback: unknown = await fetchExplain(kpiId);
        if (!cancelled) {
          setExplain(normalizeKpiExplain(fallback, kpiId));
        }
      } catch {
        try {
          const fallback: unknown = await fetchExplain(kpiId);
          if (!cancelled) {
            setExplain(normalizeKpiExplain(fallback, kpiId));
          }
        } catch {
          if (!cancelled) setExplain(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [kpiId]);

  // ── Vendor scoping ──────────────────────────────────────────────
  // `allVendors` = vendors that have an active formula in the explain
  // response. `vendorList` = the subset still visible to the user after
  // CONSTRUCTEUR Element toggles. `isMultiVendor` is decided on
  // vendorList so that filtering down to a single vendor switches the
  // panel back to counter-timeseries mode (formula + fetch counters).
  const allVendors = useMemo<string[]>(() => {
    const raw = (explain?.vendor || '').split(',').map(s => s.trim()).filter(Boolean);
    return Array.from(new Set(raw));
  }, [explain]);

  const vendorList = useMemo<string[]>(() => {
    if (allVendors.length === 0) return [];
    let scope = allVendors;

    // Global VENDOR filter wins first — when the user has set
    // VENDOR=Nokia (or VENDOR=Nokia,Ericsson) in the page filter bar,
    // only show formulas for those vendors regardless of split.
    const globalVendorFilter = (filters || []).find(
      (f) => (f?.dimension || '').toUpperCase() === 'VENDOR'
    );
    if (globalVendorFilter && globalVendorFilter.values?.length) {
      const allowed = new Set(
        globalVendorFilter.values.map((v) => String(v).trim().toUpperCase())
      );
      const intersected = scope.filter((v) => allowed.has(v.toUpperCase()));
      if (intersected.length > 0) scope = intersected;
    }

    // Split CONSTRUCTEUR/VENDOR Elements selection narrows further.
    const splitNorm = (splitBy || '').replace('PM_DIM:', '').toUpperCase();
    const isConstructeurSplit = splitNorm === 'CONSTRUCTEUR' || splitNorm === 'VENDOR';
    if (isConstructeurSplit && selectedElements) {
      const selectedUpper = new Set(
        Array.from(selectedElements).map((el) => String(el).trim().toUpperCase())
      );
      const filtered = scope.filter((v) => selectedUpper.has(v.toUpperCase()));
      if (filtered.length > 0) scope = filtered;
    }

    return scope;
  }, [allVendors, splitBy, selectedElements, filters]);

  const isMultiVendor = vendorList.length > 1;

  // Extract counter infos from explain
  // Re-runs when the active vendor subset changes (split-element toggles)
  // so the counter timeseries panel only fetches counters belonging to
  // the vendors currently visible. Without this, deselecting ERICSSON
  // would still try to fetch Ericsson `pmErabEstabSucc...` counters
  // alongside Nokia ones.
  useEffect(() => {
    if (!explain) { setCounterInfos([]); return; }
    const allowedUpper = new Set(vendorList.map(v => v.toUpperCase()));
    const filterByVendor = <T extends { source?: string }>(items: T[]): T[] => {
      if (allowedUpper.size === 0) return items;
      return items.filter(c => {
        const src = (c.source || '').toUpperCase();
        return !src || allowedUpper.has(src);
      });
    };
    const explainedCounters = filterByVendor(normalizeExplainCounters(explain));
    if (explainedCounters.length > 0) {
      setCounterInfos(explainedCounters);
      setHiddenCounters(new Set());
      return;
    }
    const formulaNumCounters = extractCounters(explain.numerator);
    const formulaDenCounters = extractCounters(explain.denominator);
    const formulaCounters = [...new Set([...formulaNumCounters, ...formulaDenCounters])];
    const fallbackCounters = Array.isArray(explain.counters)
      ? explain.counters.map(cleanCounterName).filter(Boolean)
      : [];
    const resolvedCounters = formulaCounters.length > 0 ? formulaCounters : fallbackCounters;

    const numSource = formulaNumCounters.length > 0 ? formulaNumCounters : resolvedCounters;
    const denSource = formulaDenCounters.length > 0 ? formulaDenCounters : [];

    const numC = numSource.map(name => ({
      name, tag: 'NUM' as const, source: explain.vendor, aggregation: 'SUM',
    }));
    const denC = denSource.map(name => ({
      name, tag: 'DEN' as const, source: explain.vendor, aggregation: 'SUM',
    }));
    const merged = filterByVendor([...numC, ...denC]).filter((counter, index, arr) =>
      arr.findIndex((item) => item.name === counter.name && item.tag === counter.tag) === index
    );
    setCounterInfos(merged);
    setHiddenCounters(new Set());
  }, [explain, vendorList.join(',')]);

  const splitActive = !!(splitBy && splitBy !== 'None');

  const counterFetchRange = useMemo(() => {
    const kpiDates = (timeSeriesData || [])
      .filter(d => matchesKpiSeries(d.kpi, kpiId) && d.timestamp)
      .map(d => toDateOnly(d.timestamp))
      .filter(Boolean)
      .sort();

    if (kpiDates.length === 0) {
      return { from: dateFrom, to: dateTo };
    }

    const selectedFrom = toDateOnly(dateFrom);
    const selectedTo = toDateOnly(dateTo);
    const firstKpiDate = kpiDates[0];
    const lastKpiDate = kpiDates[kpiDates.length - 1];

    return {
      from: selectedFrom && firstKpiDate < selectedFrom ? selectedFrom : firstKpiDate,
      to: selectedTo && lastKpiDate > selectedTo ? selectedTo : lastKpiDate,
    };
  }, [timeSeriesData, kpiId, dateFrom, dateTo]);

  // Extract unique split element names from KPI timeSeriesData and counter data
  const splitElements = useMemo(() => {
    if (!splitActive) return [];
    const elements = new Set<string>();
    // From KPI timeseries data
    if (timeSeriesData) {
      for (const d of timeSeriesData) {
        if (matchesKpiSeries(d.kpi, kpiId)) {
          const el = d.splitValue || d.networkElement;
          if (el && el !== 'Aggregated') elements.add(el);
        }
      }
    }
    // From counter timeseries data
    for (const d of counterTsData) {
      if (d.dimension_key) elements.add(d.dimension_key);
    }
    return [...elements].sort();
  }, [splitActive, timeSeriesData, kpiId, counterTsData]);

  // Initialize selectedElements when splitElements change
  useEffect(() => {
    if (splitElements.length > 0) {
      setSelectedElements(new Set(splitElements));
    } else {
      setSelectedElements(null);
    }
  }, [splitElements.join(',')]);

  const toggleElement = useCallback((el: string) => {
    setSelectedElements(prev => {
      if (!prev) return prev;
      const next = new Set(prev);
      if (next.has(el)) next.delete(el); else next.add(el);
      return next;
    });
  }, []);

  const selectAllElements = useCallback(() => setSelectedElements(new Set(splitElements)), [splitElements]);
  const deselectAllElements = useCallback(() => setSelectedElements(new Set()), []);

  /** Single source of truth: element → color, indexed by splitElements order. */
  const elementColorMap = useMemo(() => {
    const map = new Map<string, string>();
    splitElements.forEach((el, idx) => {
      map.set(el, SPLIT_COLORS[idx % SPLIT_COLORS.length]);
    });
    return map;
  }, [splitElements]);

  const counterSplitByField = useMemo(() => splitFieldFor(splitBy), [splitBy]);
  const counterSplitValue = useMemo(() => splitRequestValue(splitBy), [splitBy]);

  // (Multi-vendor block moved above the counter useEffect so that
  // hooks can depend on vendorList without TDZ.)

  // Fetch counter timeseries (skipped in multi-vendor mode)
  useEffect(() => {
    if (isMultiVendor) {
      setCounterTsData([]);
      setCounterFallbackUnfiltered(false);
      setLoading(false);
      return;
    }
    const names = counterInfos.map(c => c.name);
    if (names.length === 0) {
      setCounterTsData([]);
      setCounterFallbackUnfiltered(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const normalizeCounterPoints = (data: CounterSeriesPoint[]): CounterTsPoint[] =>
      data.map((point) => ({
        ts: point.timestamp || '',
        counter: cleanCounterName(point.kpi || point.counter_id || point.counter_name || point.counter || point.kpi_key),
        value: point.value ?? 0,
        dimension_key: point.splitValue || point.networkElement,
      })).filter(point => point.ts && point.counter);

    fetchCounterTimeSeriesFallback(names, counterFetchRange.from, counterFetchRange.to, granularity, counterSplitValue, filters, counterSplitByField)
      .then(async ({ data, isUnfiltered }) => {
        if (ctrl.signal.aborted) return;
        let norm = normalizeCounterPoints(data as CounterSeriesPoint[]);
        let usedUnfiltered = isUnfiltered;

        if (norm.length === 0 && filters.some(filter => filter.values?.length > 0)) {
          const retry = await fetchCounterTimeSeriesFallback(names, counterFetchRange.from, counterFetchRange.to, granularity, counterSplitValue, [], counterSplitByField);
          if (ctrl.signal.aborted) return;
          const retryNorm = normalizeCounterPoints(retry.data as CounterSeriesPoint[]);
          if (retryNorm.length > 0) {
            norm = retryNorm;
            usedUnfiltered = true;
          }
        }

        setCounterTsData(norm);
        setCounterFallbackUnfiltered(usedUnfiltered);
        setLoading(false);
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setCounterTsData([]);
        setCounterFallbackUnfiltered(false);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [counterInfos.map(c => c.name).join(','), counterFetchRange.from, counterFetchRange.to, granularity, JSON.stringify(filters), counterSplitValue, counterSplitByField]);

  const toggleCounter = useCallback((name: string) => {
    setHiddenCounters(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  const neValue = useMemo(() => {
    for (const f of filters) {
      const dim = (f.dimension || '').toUpperCase();
      if ((dim === 'CELL' || dim === 'SITE') && f.values?.length === 1) return f.values[0];
    }
    return undefined;
  }, [filters]);

  const numCounterNames = useMemo(() => counterInfos.filter(c => c.tag === 'NUM').map(c => c.name), [counterInfos]);
  const denCounterNames = useMemo(() => counterInfos.filter(c => c.tag === 'DEN').map(c => c.name), [counterInfos]);
  const constantDenominator = useMemo(() => parseConstantDenominator(explain?.denominator), [explain?.denominator]);

  const derivedCounterTsData = useMemo((): CounterTsPoint[] => {
    if (counterTsData.length > 0 || !constantDenominator || !timeSeriesData?.length) return [];

    const byTimestamp = new Map<string, number>();
    for (const d of timeSeriesData) {
      if (!matchesKpiSeries(d.kpi, kpiId) || !d.timestamp || d.value == null) continue;
      const ts = normalizeTimestamp(d.timestamp, granularity);
      byTimestamp.set(ts, (byTimestamp.get(ts) || 0) + (Number(d.value) * constantDenominator));
    }

    return [...byTimestamp.entries()].map(([ts, value]) => ({
      ts,
      counter: 'NUM aggregate (from KPI)',
      value,
    }));
  }, [counterTsData.length, constantDenominator, timeSeriesData, kpiId, granularity]);

  const chartOption = useMemo(() => {
    if (counterInfos.length === 0 && derivedCounterTsData.length === 0) return null;
    const effectiveCounterInfos = derivedCounterTsData.length > 0
      ? [{ name: 'NUM aggregate (from KPI)', tag: 'NUM' as const, source: 'KPI Engine', aggregation: 'DERIVED' }]
      : counterInfos;
    const effectiveCounterTsData = derivedCounterTsData.length > 0 ? derivedCounterTsData : counterTsData;
    const visibleCounters = effectiveCounterInfos.filter(c => !hiddenCounters.has(c.name));
    const counterSplitActive = splitActive && effectiveCounterTsData.some(point => Boolean(point.dimension_key));
    const apiTimestamps = [...new Set(effectiveCounterTsData.map(d => d.ts))].sort();
    const timeline = buildTimeline(dateFrom, dateTo, granularity);
    const timestampSet = new Set(timeline);
    for (const ts of apiTimestamps) timestampSet.add(ts);
    const timestamps = [...timestampSet].sort();

    // Top-N dimension values (by total value across all counters) when split is active
    let topDimValues: string[] = [];
    let otherDimValues = new Set<string>();
    if (counterSplitActive) {
      const totals = new Map<string, number>();
      for (const p of effectiveCounterTsData) {
        const dv = p.dimension_key || '—';
        totals.set(dv, (totals.get(dv) || 0) + (p.value || 0));
      }
      const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
      const allDimValues = sorted.slice(0, SPLIT_TOP_N).map(([k]) => k);
      // Filter by selectedElements if set
      topDimValues = selectedElements ? allDimValues.filter(dv => selectedElements.has(dv)) : allDimValues;
      otherDimValues = new Set(sorted.slice(SPLIT_TOP_N).map(([k]) => k));
      if (topDimValues.length === 0 && selectedElements && selectedElements.size > 0) {
        topDimValues = [...selectedElements].slice(0, SPLIT_TOP_N);
      }
      if (topDimValues.length === 0 && splitElements.length > 0) {
        topDimValues = splitElements.slice(0, SPLIT_TOP_N);
      }
    }

    type SeriesSpec = {
      counter: CounterInfo;
      dimValue?: string;     // undefined means no split
      isOther?: boolean;     // bucketed "other"
      color: string;
      label: string;
    };

    const specs: SeriesSpec[] = [];
    if (counterSplitActive) {
      visibleCounters.forEach(counter => {
        topDimValues.forEach((dv, dvIdx) => {
          specs.push({
            counter,
            dimValue: dv,
            color: elementColorMap.get(dv) || SPLIT_COLORS[dvIdx % SPLIT_COLORS.length],
            label: `[${counter.tag}] ${counter.name} · ${dv}`,
          });
        });
        if (otherDimValues.size > 0) {
          specs.push({
            counter,
            isOther: true,
            color: '#94a3b8',
            label: `[${counter.tag}] ${counter.name} · other (${otherDimValues.size})`,
          });
        }
      });
    } else {

      visibleCounters.forEach(counter => {
        const isNum = counter.tag === 'NUM';
        const tagCounters = isNum ? numCounterNames : denCounterNames;
        const tagIdx = tagCounters.indexOf(counter.name);
        const colors = isNum ? NUM_COLORS : DEN_COLORS;
        specs.push({
          counter,
          color: colors[tagIdx % colors.length],
          label: `[${counter.tag}] ${counter.name}`,
        });
      });
    }

    // Pre-index data by (counter, dimValue) for fast lookup
    const indexed = new Map<string, Map<string, number>>();
    for (const p of effectiveCounterTsData) {
      const dv = counterSplitActive ? (otherDimValues.has(p.dimension_key || '—') ? '__OTHER__' : (p.dimension_key || '—')) : '__ALL__';
      const key = `${p.counter}||${dv}`;
      if (!indexed.has(key)) indexed.set(key, new Map());
      const tsMap = indexed.get(key)!;
      tsMap.set(p.ts, (tsMap.get(p.ts) || 0) + (p.value || 0));
    }

    const series = specs.map(spec => {
      const isNum = spec.counter.tag === 'NUM';
      const isHovered = hoveredCounter === spec.counter.name;
      const dvKey = counterSplitActive ? (spec.isOther ? '__OTHER__' : (spec.dimValue || '—')) : '__ALL__';
      const tsMap = indexed.get(`${spec.counter.name}||${dvKey}`) || new Map<string, number>();

      return {
        name: spec.label,
        type: 'line' as const,
        smooth: true,
        connectNulls: true,
        data: timestamps.map(ts => tsMap.has(ts) ? tsMap.get(ts)! : null),
        symbol: isHovered ? 'circle' : 'none',
        symbolSize: isHovered ? 8 : 0,
        lineStyle: { width: isHovered ? 4 : 2.5, color: spec.color, type: isNum ? 'solid' as const : 'dashed' as const },
        itemStyle: { color: spec.color },
        emphasis: { focus: 'series' as const, lineStyle: { width: 4 } },
        z: isHovered ? 10 : 1,
        yAxisIndex: isNum ? 0 : 1,
      };
    });

    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: { top: 40, right: 70, bottom: 80, left: 70, containLabel: false },
      dataZoom: [
        { type: 'inside' as const, xAxisIndex: 0, filterMode: 'none' as const, zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: true },
        {
          type: 'slider' as const, xAxisIndex: 0, height: 18, bottom: 38,
          filterMode: 'none' as const,
          borderColor: 'rgba(128,128,128,0.2)',
          backgroundColor: 'rgba(128,128,128,0.06)',
          fillerColor: 'rgba(99,102,241,0.12)',
          handleSize: '120%',
          handleStyle: { color: '#6366f1', borderColor: '#6366f1', borderWidth: 1 },
          textStyle: { fontSize: 9, color: '#a1a1aa' },
          brushSelect: false,
        },
      ],
      legend: {
        show: true, bottom: 4, icon: 'roundRect',
        itemWidth: 18, itemHeight: 4, itemGap: 16,
        type: 'scroll', pageIconSize: 10,
        textStyle: { fontSize: 10, fontWeight: 600, color: '#4b5563' },
        tooltip: { show: true },
      },
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: 'rgba(15,23,42,0.96)',
        borderColor: 'rgba(255,255,255,0.06)',
        borderRadius: 10,
        padding: [10, 14],
        textStyle: { color: '#f1f5f9', fontSize: 11, fontWeight: 500 },
        axisPointer: { type: 'line' as const, lineStyle: { color: 'rgba(99,102,241,0.25)', width: 1, type: 'dashed' as const } },
      },
      xAxis: {
        type: 'category' as const,
        data: timestamps,
        axisLabel: { formatter: (v: string) => formatAxisLabel(v, granularity), fontSize: 10, color: '#6b7280', margin: 14 },
        axisLine: { lineStyle: { color: 'rgba(0,0,0,0.08)' } },
        axisTick: { show: true, length: 3, lineStyle: { color: 'rgba(0,0,0,0.08)' } },
      },
      yAxis: [
        {
          type: 'value' as const, name: 'NUM',
          nameTextStyle: { fontSize: 9, color: '#22c55e', fontWeight: 700, padding: [0, 0, 0, 4] },
          axisLabel: { fontSize: 9, color: '#22c55e', formatter: (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : String(Math.round(v)) },
          splitLine: { show: true, lineStyle: { color: 'rgba(34,197,94,0.08)', type: 'dashed' as const } },
          axisLine: { show: true, lineStyle: { color: 'rgba(34,197,94,0.3)' } },
        },
        {
          type: 'value' as const, name: 'DEN',
          nameTextStyle: { fontSize: 9, color: '#3b82f6', fontWeight: 700, padding: [0, 4, 0, 0] },
          axisLabel: { fontSize: 9, color: '#3b82f6', formatter: (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : String(Math.round(v)) },
          splitLine: { show: false },
          axisLine: { show: true, lineStyle: { color: 'rgba(59,130,246,0.3)' } },
        },
      ],
      series: series.map((s, i) => i === 0 ? { ...s, markLine: jalonMarkLine(timestamps, jalons, granularity) } : s),
    };
  }, [counterTsData, derivedCounterTsData, counterInfos, hiddenCounters, hoveredCounter, granularity, numCounterNames, denCounterNames, splitActive, selectedElements, splitElements, elementColorMap, jalons, dateFrom, dateTo]);

  const numInfos = counterInfos.filter(c => c.tag === 'NUM');
  const denInfos = counterInfos.filter(c => c.tag === 'DEN');

  return (
    <div className="space-y-4">
      <KpiSummaryPanel
        kpiId={kpiId}
        explain={explain}
        points={timeSeriesData || []}
        selectedElements={selectedElements}
        splitActive={splitActive}
      />

      <KpiContributionPanel
        kpiId={kpiId}
        explain={explain}
        points={timeSeriesData || []}
        selectedElements={selectedElements}
        splitActive={splitActive}
        elementColorMap={elementColorMap}
      />

      <FormulaPanel
        explain={explain}
        numCounters={numInfos}
        denCounters={denInfos}
        hoveredCounter={hoveredCounter}
        onHoverCounter={setHoveredCounter}
        hiddenCounters={hiddenCounters}
        onToggleCounter={toggleCounter}
        splitBy={splitBy}
        splitElements={splitElements}
        selectedElements={selectedElements || undefined}
        onToggleElement={toggleElement}
        onSelectAllElements={selectAllElements}
        onDeselectAllElements={deselectAllElements}
        elementColorMap={elementColorMap}
        compact={isMultiVendor}
      />

      {isMultiVendor ? (
        /* Multi-vendor mode: just display the per-vendor formula text. The
           counter timeseries chart is intentionally hidden — Nokia and
           Ericsson counters are numerically incomparable so plotting both
           on the same axis is misleading. The user filters down to a
           single vendor to get the counter chart back. */
        <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border/30 bg-muted/10 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
              Formulas per vendor
            </span>
            <span className="text-[10px] text-muted-foreground ml-1">
              {vendorList.length === allVendors.length
                ? `${allVendors.length} vendors involved — filter to one (global VENDOR filter) to see counter timeseries`
                : `${vendorList.length} of ${allVendors.length} vendors selected via split elements`}
            </span>
          </div>
          <div className="p-5 space-y-6">
            {vendorList.map((v) => {
              const num = (explain?.numerator || '')
                .split(';')
                .map(s => s.trim())
                .find(s => s.startsWith(`[${v}]`)) || '';
              const den = (explain?.denominator || '')
                .split(';')
                .map(s => s.trim())
                .find(s => s.startsWith(`[${v}]`)) || '';
              const stripPrefix = (s: string) => s.replace(/^\[[^\]]+\]\s*/, '');
              const numClean = stripPrefix(num);
              const denClean = stripPrefix(den);
              const calc = numClean && denClean && denClean.trim() !== '1'
                ? `(${numClean}) / (${denClean})`
                : numClean || denClean || 'No formula available';
              return (
                <div key={v} className="space-y-4">
                  {/* Vendor badge */}
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-emerald-700">
                      {v}
                    </span>
                  </div>

                  {/* Calculation formula — teal hero */}
                  <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-teal-700 px-6 py-5 text-white shadow-[0_10px_30px_rgba(13,148,136,0.25)]">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-50">Calculation formula</p>
                    <p className="mt-3 break-words font-mono text-base font-medium leading-relaxed text-white whitespace-pre-wrap">
                      {calc}
                    </p>
                  </div>

                  {/* Numerator / Denominator dark code blocks */}
                  <div className="grid gap-5 xl:grid-cols-2">
                    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-[0_10px_30px_rgba(2,6,23,0.25)]">
                      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <span className="flex items-center gap-2 text-[13px] font-extrabold uppercase text-[#F8FAFC]" style={{ letterSpacing: '2px' }}>
                          <Sigma className="w-4 h-4 text-emerald-300" strokeWidth={2.5} />
                          Numerator
                        </span>
                        <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">
                          Expression
                        </span>
                      </div>
                      <pre className="block min-h-[120px] w-full overflow-auto bg-slate-950 px-5 py-4 font-mono text-sm leading-6 text-emerald-200 whitespace-pre-wrap break-all">
                        {numClean || '—'}
                      </pre>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-[0_10px_30px_rgba(2,6,23,0.25)]">
                      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <span className="flex items-center gap-2 text-[13px] font-extrabold uppercase text-[#F8FAFC]" style={{ letterSpacing: '2px' }}>
                          <Divide className="w-4 h-4 text-sky-300" strokeWidth={2.5} />
                          Denominator
                        </span>
                        <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">
                          Expression
                        </span>
                      </div>
                      <pre className="block min-h-[120px] w-full overflow-auto bg-slate-950 px-5 py-4 font-mono text-sm leading-6 text-sky-200 whitespace-pre-wrap break-all">
                        {denClean || '—'}
                      </pre>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
      <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border/30 bg-muted/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">Counter Timeseries</span>
            <span className="text-[10px] text-muted-foreground ml-1">
              {counterInfos.filter(c => !hiddenCounters.has(c.name)).length}/{counterInfos.length} visible
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[9px]">
              <span className="w-5 h-[2px] bg-green-500 rounded" />
              <span className="text-muted-foreground font-medium">NUM (left axis)</span>
            </div>
            <div className="flex items-center gap-1.5 text-[9px]">
              <span className="w-5 h-[2px] bg-blue-500 rounded" style={{ borderTop: '2px dashed' }} />
              <span className="text-muted-foreground font-medium">DEN (right axis)</span>
            </div>
          </div>
        </div>
        <div className="p-4" style={{ backgroundColor: '#ffffff' }}>
          {loading ? (
            <div className="flex items-center justify-center h-[320px] text-muted-foreground text-sm">Loading counters...</div>
          ) : chartOption ? (
            <div className="relative">
              {counterFallbackUnfiltered && counterTsData.length > 0 && (
                <div className="absolute left-4 top-3 z-10 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-medium text-sky-800 shadow-sm">
                  No filtered counter rows matched; showing aggregate raw counters.
                </div>
              )}
              {counterTsData.length === 0 && derivedCounterTsData.length > 0 ? (
                <div className="absolute left-4 top-3 z-10 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-medium text-sky-800 shadow-sm">
                  Raw counter detail unavailable; showing NUM aggregate derived from KPI.
                </div>
              ) : counterTsData.length === 0 && (
                <div className="absolute left-4 top-3 z-10 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-medium text-amber-800 shadow-sm">
                  Empty raw counter series for this period and filters.
                </div>
              )}
              <ReactECharts option={chartOption} notMerge style={{ height: 340 }} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[260px] text-muted-foreground gap-2">
              <Layers className="w-10 h-10 opacity-20" />
              <span className="text-sm font-medium">
                No counters defined for this KPI
              </span>
              <span className="text-[10px]">
                The KPI formula did not expose any counters in the explain response.
              </span>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Counter definition panel hidden in multi-vendor mode — counters
          are mixed across vendors and the per-vendor formula block above
          already conveys the relevant info. */}
      {!isMultiVendor && (
        <CounterDefinitionPanel
          counters={counterInfos}
          hoveredCounter={hoveredCounter}
          onHoverCounter={setHoveredCounter}
        />
      )}
    </div>
  );
};

/* ──────────────────── Main Component (Tab container) ──────────────────── */

const KPIBreakdown: React.FC<Props> = ({
  selectedKpis,
  layout,
  dateFrom = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
  dateTo = new Date().toISOString().split('T')[0],
  granularity = '1d',
  filters = [],
  splitBy,
  splitByPerKpi,
  timeSeriesData,
  jalons = [],
}) => {
  const uniqueKpiIds = useMemo(() => [...new Set(selectedKpis.filter(Boolean))], [selectedKpis]);
  const [activeKpiTab, setActiveKpiTab] = useState(uniqueKpiIds[0] || '');

  const getEffectiveSplit = useCallback((kpiId: string) => {
    const perKpi = splitByPerKpi?.[kpiId];
    if (perKpi && perKpi !== 'None') return perKpi;
    return splitBy && splitBy !== 'None' ? splitBy : undefined;
  }, [splitBy, splitByPerKpi]);

  // Sync active tab when KPI list changes
  useEffect(() => {
    if (uniqueKpiIds.length > 0 && !uniqueKpiIds.includes(activeKpiTab)) {
      setActiveKpiTab(uniqueKpiIds[0]);
    }
  }, [uniqueKpiIds, activeKpiTab]);

  if (uniqueKpiIds.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-8 flex flex-col items-center justify-center text-muted-foreground gap-2">
        <Layers className="w-10 h-10 opacity-20" />
        <span className="text-sm font-medium">No KPI selected</span>
        <span className="text-[10px]">Select KPIs in the graph to see breakdown</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {uniqueKpiIds.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin p-1 bg-muted/30 rounded-xl border border-border/30">
          {uniqueKpiIds.map(kpiId => (
            <button
              key={kpiId}
              onClick={() => setActiveKpiTab(kpiId)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap shrink-0',
                activeKpiTab === kpiId
                  ? 'bg-card text-foreground shadow-sm border border-border/50'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              )}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              {kpiId}
            </button>
          ))}
        </div>
      )}

      {/* Active KPI content */}
      {activeKpiTab && uniqueKpiIds.includes(activeKpiTab) && (
        <SingleKpiBreakdown
          key={activeKpiTab}
          kpiId={activeKpiTab}
          dateFrom={dateFrom}
          dateTo={dateTo}
          granularity={granularity}
          filters={filters}
          splitBy={getEffectiveSplit(activeKpiTab)}
          timeSeriesData={timeSeriesData}
          jalons={jalons}
        />
      )}
    </div>
  );
};

export default KPIBreakdown;
