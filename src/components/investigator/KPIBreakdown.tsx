import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import { fetchExplain } from '../kpi-monitor/api/kpiMonitorApi';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { formatAxisLabel } from './timeUtils';
import { DataPoint, Granularity } from './types';
import {
  Layers, Calculator, Eye, EyeOff, Info, ChevronDown,
  Database, GitBranch, Cpu, TrendingUp, SplitSquareVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

/* ──────────────────── Types ──────────────────── */

interface Props {
  selectedKpis: string[];
  layout: 1 | 2 | 4;
  dateFrom?: string;
  dateTo?: string;
  granularity?: Granularity;
  filters?: { dimension: string; values: string[] }[];
  splitBy?: string;
  /** Per-KPI split dimension map (takes precedence over `splitBy`). */
  splitByPerKpi?: Record<string, string>;
  timeSeriesData?: DataPoint[];
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

/* ──────────────────── Constants ──────────────────── */

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
const PM_DIM_TYPES = new Set(['PMQAP', 'FLEX', 'NEIGHBOR', 'RANSHARE', 'SLICE', '5QI', 'TRANSPORT', 'CA_REL']);

const extractCounters = (formula: string): string[] => {
  if (!formula) return [];
  const matches = formula.match(/[`{]([A-Za-z0-9_]+)[}`]/g) || [];
  return [...new Set(matches.map(m => m.replace(/[`{}]/g, '')))];
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
}> = ({ explain, numCounters, denCounters, hoveredCounter, onHoverCounter, hiddenCounters, onToggleCounter, splitBy }) => {
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
          <div className="flex items-center gap-2 shrink-0">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-border/30">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-green-500/15 text-green-600 border border-green-500/30 tracking-wider">NUM</span>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Numerator</span>
          </div>
          <code className="block text-[11px] text-foreground font-mono leading-relaxed break-all bg-muted/20 rounded-lg p-3 border border-border/20">
            {explain.numerator || '—'}
          </code>
          {numCounters.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {numCounters.map((c, i) => renderCounterChip(c, i))}
            </div>
          )}
        </div>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-blue-500/15 text-blue-500 border border-blue-500/30 tracking-wider">DEN</span>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Denominator</span>
          </div>
          <code className="block text-[11px] text-foreground font-mono leading-relaxed break-all bg-muted/20 rounded-lg p-3 border border-border/20">
            {explain.denominator || '—'}
          </code>
          {denCounters.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {denCounters.map((c, i) => renderCounterChip(c, i))}
            </div>
          )}
        </div>
      </div>
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
}> = ({ kpiId, dateFrom, dateTo, granularity, filters, splitBy, timeSeriesData }) => {
  const [explain, setExplain] = useState<KpiExplain | null>(null);
  const [counterInfos, setCounterInfos] = useState<CounterInfo[]>([]);
  const [counterTsData, setCounterTsData] = useState<CounterTsPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredCounter, setHoveredCounter] = useState<string | null>(null);
  const [hiddenCounters, setHiddenCounters] = useState<Set<string>>(new Set());

  // Fetch explain
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(getApiUrl(`pm/kpi/explain/${encodeURIComponent(kpiId)}`), { headers: getApiHeaders() });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data && !data.error && data.numerator) {
            setExplain({
              kpi_key: data.kpi_key,
              display_name: data.display_name,
              description: data.description || '',
              category: data.category || '',
              unit: data.unit || '',
              formula_type: data.formula_type || 'ratio',
              numerator: data.numerator,
              denominator: data.denominator,
              techno: data.techno || '',
              vendor: data.vendor || '',
            });
            return;
          }
        }
        // Fallback
        const fallback: any = await fetchExplain(kpiId);
        if (!cancelled) setExplain(fallback);
      } catch {
        try {
          const fallback: any = await fetchExplain(kpiId);
          if (!cancelled) setExplain(fallback);
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [kpiId]);

  // Extract counter infos from explain
  useEffect(() => {
    if (!explain) { setCounterInfos([]); return; }
    const numC = extractCounters(explain.numerator).map(name => ({
      name, tag: 'NUM' as const, source: explain.vendor, aggregation: 'SUM',
    }));
    const denC = extractCounters(explain.denominator).map(name => ({
      name, tag: 'DEN' as const, source: explain.vendor, aggregation: 'SUM',
    }));
    setCounterInfos([...numC, ...denC]);
    setHiddenCounters(new Set());
  }, [explain]);

  const splitActive = !!(splitBy && splitBy !== 'None');

  // Fetch counter timeseries
  useEffect(() => {
    const names = counterInfos.map(c => c.name);
    if (names.length === 0) { setCounterTsData([]); return; }
    setLoading(true);
    const body: any = { counter_names: names, date_from: dateFrom, date_to: dateTo, granularity };

    // Always use split_by_dimension for any split type — the PM counters backend
    // returns dimension_key for all split modes (CELL, SITE, PMQAP, etc.).
    let suppressCellFilter = false;
    if (splitActive) {
      body.split_by_dimension = true;
      const sb = (splitBy || '').toUpperCase();
      if (sb === 'CELL') {
        suppressCellFilter = true;              // don't restrict to a single cell when splitting
      }
    }

    const dimFilterValues: string[] = [];
    for (const f of filters) {
      const dim = (f.dimension || '').toUpperCase();
      if (dim === 'SITE' && f.values?.length) body.site_name = f.values.length === 1 ? f.values[0] : f.values;
      else if (dim === 'CELL' && f.values?.length && !suppressCellFilter) body.cell_name = f.values.length === 1 ? f.values[0] : f.values;
      else if (PM_DIM_TYPES.has(dim) && f.values?.length) dimFilterValues.push(...f.values);
    }
    if (dimFilterValues.length > 0) body.dimension_filter = dimFilterValues;

    const ctrl = new AbortController();
    fetch(getApiUrl('pm/counters/timeseries'), {
      method: 'POST', headers: getApiHeaders(), body: JSON.stringify(body), signal: ctrl.signal,
    })
      .then(r => r.ok ? r.json() : { series: [] })
      .then(data => {
        const raw = data.series || data.data || [];
        const norm: CounterTsPoint[] = raw.map((s: any) => ({
          ts: s.ts || s.timestamp || s.date,
          counter: s.counter_id || s.counter_name || s.counter || '',
          value: s.value ?? s.kpi_value ?? s.val ?? 0,
          dimension_key: s.dimension_key || s.split_field || s.split_value
            || s.ne_name || s.site_name || s.split_field_value || undefined,
        }));
        setCounterTsData(norm);
        setLoading(false);
      })
      .catch(() => { setCounterTsData([]); setLoading(false); });
    return () => ctrl.abort();
  }, [counterInfos, dateFrom, dateTo, granularity, filters, splitActive, splitBy]);

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

  const chartOption = useMemo(() => {
    if (counterTsData.length === 0) return null;
    const visibleCounters = counterInfos.filter(c => !hiddenCounters.has(c.name));
    const timestamps = [...new Set(counterTsData.map(d => d.ts))].sort();

    // Top-N dimension values (by total value across all counters) when split is active
    let topDimValues: string[] = [];
    let otherDimValues = new Set<string>();
    if (splitActive) {
      const totals = new Map<string, number>();
      for (const p of counterTsData) {
        const dv = p.dimension_key || '—';
        totals.set(dv, (totals.get(dv) || 0) + (p.value || 0));
      }
      const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
      topDimValues = sorted.slice(0, SPLIT_TOP_N).map(([k]) => k);
      otherDimValues = new Set(sorted.slice(SPLIT_TOP_N).map(([k]) => k));
    }

    type SeriesSpec = {
      counter: CounterInfo;
      dimValue?: string;     // undefined means no split
      isOther?: boolean;     // bucketed "other"
      color: string;
      label: string;
    };

    const specs: SeriesSpec[] = [];
    if (splitActive) {
      visibleCounters.forEach(counter => {
        topDimValues.forEach((dv, dvIdx) => {
          specs.push({
            counter,
            dimValue: dv,
            color: SPLIT_COLORS[dvIdx % SPLIT_COLORS.length],
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
    for (const p of counterTsData) {
      const dv = splitActive ? (otherDimValues.has(p.dimension_key || '—') ? '__OTHER__' : (p.dimension_key || '—')) : '__ALL__';
      const key = `${p.counter}||${dv}`;
      if (!indexed.has(key)) indexed.set(key, new Map());
      const tsMap = indexed.get(key)!;
      tsMap.set(p.ts, (tsMap.get(p.ts) || 0) + (p.value || 0));
    }

    const series = specs.map(spec => {
      const isNum = spec.counter.tag === 'NUM';
      const isHovered = hoveredCounter === spec.counter.name;
      const dvKey = splitActive ? (spec.isOther ? '__OTHER__' : (spec.dimValue || '—')) : '__ALL__';
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
        { type: 'inside' as const, xAxisIndex: 0, filterMode: 'none' as const },
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
        type: 'scroll' as any, pageIconSize: 10,
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
      series,
    };
  }, [counterTsData, counterInfos, hiddenCounters, hoveredCounter, granularity, numCounterNames, denCounterNames, splitActive]);

  const numInfos = counterInfos.filter(c => c.tag === 'NUM');
  const denInfos = counterInfos.filter(c => c.tag === 'DEN');

  /* ── KPI Timeseries by Cell chart (uses timeSeriesData from KPI Engine) ── */
  const kpiSplitChart = useMemo(() => {
    if (!splitActive || !timeSeriesData || timeSeriesData.length === 0) return null;

    // Filter data for this KPI
    const kpiData = timeSeriesData.filter(d => d.kpi === kpiId);
    if (kpiData.length === 0) return null;

    // Group by splitValue (cell name)
    const cellMap = new Map<string, Map<string, number>>();
    const timestamps = new Set<string>();
    for (const d of kpiData) {
      const cell = d.splitValue || d.networkElement || 'Aggregated';
      timestamps.add(d.timestamp);
      if (!cellMap.has(cell)) cellMap.set(cell, new Map());
      cellMap.get(cell)!.set(d.timestamp, d.value);
    }

    if (cellMap.size <= 1 && cellMap.has('Aggregated')) return null; // No real split

    const sortedTs = [...timestamps].sort();
    const cells = [...cellMap.keys()].sort();

    const series = cells.map((cell, idx) => {
      const tsMap = cellMap.get(cell)!;
      return {
        name: cell,
        type: 'line' as const,
        smooth: true,
        connectNulls: true,
        data: sortedTs.map(ts => tsMap.has(ts) ? tsMap.get(ts)! : null),
        symbol: 'none',
        lineStyle: { width: 2.5, color: SPLIT_COLORS[idx % SPLIT_COLORS.length] },
        itemStyle: { color: SPLIT_COLORS[idx % SPLIT_COLORS.length] },
        emphasis: { focus: 'series' as const, lineStyle: { width: 4 } },
      };
    });

    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: { top: 40, right: 50, bottom: 60, left: 70, containLabel: false },
      legend: {
        show: true, bottom: 4, icon: 'roundRect', type: 'plain' as any,
        itemWidth: 18, itemHeight: 4, itemGap: 14,
        textStyle: { fontSize: 10, fontWeight: 600, color: '#4b5563' },
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
        data: sortedTs,
        axisLabel: { formatter: (v: string) => formatAxisLabel(v, granularity), fontSize: 10, color: '#6b7280', margin: 14 },
        axisLine: { lineStyle: { color: 'rgba(0,0,0,0.08)' } },
        axisTick: { show: true, length: 3, lineStyle: { color: 'rgba(0,0,0,0.08)' } },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { fontSize: 9, color: '#6366f1', formatter: (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : v >= 100 ? String(Math.round(v)) : v.toFixed(2) },
        splitLine: { show: true, lineStyle: { color: 'rgba(99,102,241,0.08)', type: 'dashed' as const } },
        axisLine: { show: true, lineStyle: { color: 'rgba(99,102,241,0.3)' } },
      },
      series,
    };
  }, [splitActive, timeSeriesData, kpiId, granularity]);

  return (
    <div className="space-y-4">
      <FormulaPanel
        explain={explain}
        numCounters={numInfos}
        denCounters={denInfos}
        hoveredCounter={hoveredCounter}
        onHoverCounter={setHoveredCounter}
        hiddenCounters={hiddenCounters}
        onToggleCounter={toggleCounter}
        splitBy={splitBy}
      />

      {/* KPI Timeseries by Cell */}
      {kpiSplitChart && (
        <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border/30 bg-muted/10 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
              KPI by {splitBy || 'Cell'}
            </span>
            <span className="text-[10px] text-muted-foreground ml-1">
              {kpiId}
            </span>
          </div>
          <div className="p-4" style={{ backgroundColor: '#ffffff' }}>
            <ReactECharts option={kpiSplitChart} notMerge style={{ height: 300 }} />
          </div>
        </div>
      )}

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
            <ReactECharts option={chartOption} notMerge style={{ height: 340 }} />
          ) : (
            <div className="flex flex-col items-center justify-center h-[260px] text-muted-foreground gap-2">
              <Layers className="w-10 h-10 opacity-20" />
              <span className="text-sm font-medium">No counter data available</span>
              <span className="text-[10px]">Select a KPI with defined counters to see the breakdown</span>
            </div>
          )}
        </div>
      </div>

      <CounterDefinitionPanel
        counters={counterInfos}
        hoveredCounter={hoveredCounter}
        onHoverCounter={setHoveredCounter}
      />
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
}) => {
  const uniqueKpiIds = useMemo(() => [...new Set(selectedKpis.filter(Boolean))], [selectedKpis]);
  const [activeKpiTab, setActiveKpiTab] = useState(uniqueKpiIds[0] || '');

  // Resolve split dimension for the active KPI: per-KPI map takes precedence over slot-level splitBy.
  const effectiveSplitBy = useMemo(() => {
    const perKpi = splitByPerKpi?.[activeKpiTab];
    if (perKpi && perKpi !== 'None') return perKpi;
    if (splitBy && splitBy !== 'None') return splitBy;
    return undefined;
  }, [splitByPerKpi, activeKpiTab, splitBy]);

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
      {/* KPI Tabs */}
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

      {/* Active KPI content – only render the active tab (lazy) */}
      {activeKpiTab && uniqueKpiIds.includes(activeKpiTab) && (
        <SingleKpiBreakdown
          key={activeKpiTab}
          kpiId={activeKpiTab}
          dateFrom={dateFrom}
          dateTo={dateTo}
          granularity={granularity}
          filters={filters}
          splitBy={effectiveSplitBy}
          timeSeriesData={timeSeriesData}
        />
      )}
    </div>
  );
};

export default KPIBreakdown;
