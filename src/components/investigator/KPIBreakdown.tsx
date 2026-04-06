import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import { fetchExplain } from '../kpi-monitor/api/kpiMonitorApi';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { formatAxisLabel } from './timeUtils';
import { DataPoint, Granularity } from './types';
import {
  Layers, Calculator, Table2, Download, Eye, EyeOff, Info,
  ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Database, GitBranch, Cpu, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ──────────────────── Types ──────────────────── */

interface Props {
  selectedKpis: string[];
  layout: 1 | 2 | 4;
  dateFrom?: string;
  dateTo?: string;
  granularity?: Granularity;
  filters?: { dimension: string; values: string[] }[];
  splitBy?: string;
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
}

/* ──────────────────── Constants ──────────────────── */

const NUM_COLORS = ['#22c55e', '#16a34a', '#4ade80', '#86efac', '#15803d'];
const DEN_COLORS = ['#3b82f6', '#2563eb', '#60a5fa', '#93c5fd', '#1d4ed8'];
const ALL_COLORS = [...NUM_COLORS, ...DEN_COLORS, '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899'];

const extractCounters = (formula: string): string[] => {
  if (!formula) return [];
  // Match both backtick `M8009C6` and curly-brace {M8009C6} formats
  const matches = formula.match(/[`{]([A-Za-z0-9_]+)[}`]/g) || [];
  return [...new Set(matches.map(m => m.replace(/[`{}]/g, '')))];
};

/* ──────────────────── Sub-components ──────────────────── */

/** Formula display panel */
const FormulaPanel: React.FC<{
  explain: KpiExplain | null;
  numCounters: CounterInfo[];
  denCounters: CounterInfo[];
  hoveredCounter: string | null;
  onHoverCounter: (name: string | null) => void;
  hiddenCounters: Set<string>;
  onToggleCounter: (name: string) => void;
}> = ({ explain, numCounters, denCounters, hoveredCounter, onHoverCounter, hiddenCounters, onToggleCounter }) => {
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
      {/* KPI Header */}
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
            ].filter(t => t.label).map(t => (
              <span key={t.label} className={cn('px-2 py-0.5 rounded-md text-[9px] font-bold border', t.color)}>
                {t.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Formula */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-border/30">
        {/* Numerator */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-green-500/15 text-green-600 border border-green-500/30 tracking-wider">
              NUM
            </span>
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

        {/* Denominator */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-blue-500/15 text-blue-500 border border-blue-500/30 tracking-wider">
              DEN
            </span>
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

/** Counter definition info cards */
const CounterDefinitionPanel: React.FC<{
  counters: CounterInfo[];
  hoveredCounter: string | null;
  onHoverCounter: (name: string | null) => void;
}> = ({ counters, hoveredCounter, onHoverCounter }) => {
  const [expanded, setExpanded] = useState(true);

  if (counters.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3 flex items-center justify-between bg-muted/10 border-b border-border/30 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            Counter Definitions
          </span>
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
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider',
                    isNum ? 'bg-green-500/15 text-green-600' : 'bg-blue-500/15 text-blue-500'
                  )}>
                    {c.tag}
                  </span>
                  <span className="text-[11px] font-bold text-foreground font-mono truncate">{c.name}</span>
                </div>
                <div className="space-y-1.5 text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <Info className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">{c.description || 'No description'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">
                      <Cpu className="w-3 h-3 inline mr-1" />
                      {c.source || 'PM'}
                    </span>
                    <span className="text-muted-foreground">
                      <GitBranch className="w-3 h-3 inline mr-1" />
                      {c.aggregation || 'SUM'}
                    </span>
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

/* ──────────────────── Main Component ──────────────────── */

const KPIBreakdown: React.FC<Props> = ({
  selectedKpis,
  layout,
  dateFrom = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
  dateTo = new Date().toISOString().split('T')[0],
  granularity = '1d',
  filters = [],
  splitBy,
  timeSeriesData = [],
}) => {
  const uniqueKpiIds = useMemo(() => [...new Set(selectedKpis.filter(Boolean))], [selectedKpis]);
  const activeKpiId = uniqueKpiIds[0] || '';

  // State
  const [explainData, setExplainData] = useState<Record<string, KpiExplain>>({});
  const [counterInfos, setCounterInfos] = useState<CounterInfo[]>([]);
  const [counterTsData, setCounterTsData] = useState<CounterTsPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredCounter, setHoveredCounter] = useState<string | null>(null);
  const [hiddenCounters, setHiddenCounters] = useState<Set<string>>(new Set());
  const [selectedKpiTab, setSelectedKpiTab] = useState(activeKpiId);
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(0);

  // Sync selected tab
  useEffect(() => {
    if (uniqueKpiIds.length > 0 && !uniqueKpiIds.includes(selectedKpiTab)) {
      setSelectedKpiTab(uniqueKpiIds[0]);
    }
  }, [uniqueKpiIds, selectedKpiTab]);

  // Fetch explain data for all KPIs (use parser endpoint, fallback to KPI Engine)
  useEffect(() => {
    uniqueKpiIds.forEach(kpiId => {
      if (explainData[kpiId]) return;
      // Try parser /pm/kpi/explain first (has formula from kpi_definition)
      fetch(getApiUrl(`pm/kpi/explain/${encodeURIComponent(kpiId)}`), { headers: getApiHeaders() })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && !data.error && data.numerator) {
            // Map parser response to KpiExplain format
            setExplainData(prev => ({
              ...prev,
              [kpiId]: {
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
              },
            }));
            // Also set counter infos directly from backend response
            if (data.counters?.length > 0) {
              setCounterInfos(data.counters.map((c: any) => ({
                name: c.name,
                tag: c.tag as 'NUM' | 'DEN',
                description: c.description,
                source: c.source,
                aggregation: c.aggregation,
              })));
            }
            return;
          }
          // Fallback to KPI Engine
          return fetchExplain(kpiId).then((fallback: any) => {
            setExplainData(prev => ({ ...prev, [kpiId]: fallback }));
          });
        })
        .catch(() => {
          // Final fallback
          fetchExplain(kpiId).then((data: any) => {
            setExplainData(prev => ({ ...prev, [kpiId]: data }));
          }).catch(() => {});
        });
    });
  }, [uniqueKpiIds]);

  // Extract counter infos from the selected KPI explain
  const currentExplain = explainData[selectedKpiTab];
  useEffect(() => {
    if (!currentExplain) { setCounterInfos([]); return; }
    const numCounters = extractCounters(currentExplain.numerator).map(name => ({
      name, tag: 'NUM' as const, source: currentExplain.vendor, aggregation: 'SUM',
    }));
    const denCounters = extractCounters(currentExplain.denominator).map(name => ({
      name, tag: 'DEN' as const, source: currentExplain.vendor, aggregation: 'SUM',
    }));
    setCounterInfos([...numCounters, ...denCounters]);
    setHiddenCounters(new Set());
  }, [currentExplain]);

  // Fetch counter timeseries
  useEffect(() => {
    const names = counterInfos.map(c => c.name);
    if (names.length === 0) { setCounterTsData([]); return; }
    setLoading(true);

    const body: any = {
      counter_names: names,
      date_from: dateFrom,
      date_to: dateTo,
      granularity,
    };
    for (const f of filters) {
      const dim = (f.dimension || '').toUpperCase();
      if (dim === 'SITE' && f.values?.length) body.site_name = f.values[0];
      else if (dim === 'CELL' && f.values?.length) body.cell_name = f.values[0];
    }

    fetch(getApiUrl('pm/counters/timeseries'), {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(body),
    })
      .then(r => r.ok ? r.json() : { series: [] })
      .then(data => { setCounterTsData(data.series || []); setLoading(false); })
      .catch(() => { setCounterTsData([]); setLoading(false); });
  }, [counterInfos, dateFrom, dateTo, granularity, filters]);

  // Toggle counter visibility
  const toggleCounter = useCallback((name: string) => {
    setHiddenCounters(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // Derive NE from filters
  const neValue = useMemo(() => {
    for (const f of filters) {
      const dim = (f.dimension || '').toUpperCase();
      if ((dim === 'CELL' || dim === 'SITE') && f.values?.length === 1) return f.values[0];
    }
    return undefined;
  }, [filters]);

  // ──── Chart ────
  const numCounterNames = useMemo(() => counterInfos.filter(c => c.tag === 'NUM').map(c => c.name), [counterInfos]);
  const denCounterNames = useMemo(() => counterInfos.filter(c => c.tag === 'DEN').map(c => c.name), [counterInfos]);

  const chartOption = useMemo(() => {
    if (counterTsData.length === 0) return null;

    const visibleCounters = counterInfos.filter(c => !hiddenCounters.has(c.name));
    const timestamps = [...new Set(counterTsData.map(d => d.ts))].sort();

    const series = visibleCounters.map((counter, i) => {
      const isNum = counter.tag === 'NUM';
      const tagCounters = isNum ? numCounterNames : denCounterNames;
      const tagIdx = tagCounters.indexOf(counter.name);
      const colors = isNum ? NUM_COLORS : DEN_COLORS;
      const color = colors[tagIdx % colors.length];
      const isHovered = hoveredCounter === counter.name;

      return {
        name: `[${counter.tag}] ${counter.name}`,
        type: 'line' as const,
        smooth: true,
        connectNulls: true,
        data: timestamps.map(ts => {
          const p = counterTsData.find(d => d.ts === ts && d.counter === counter.name);
          return p ? p.value : null;
        }),
        symbol: isHovered ? 'circle' : 'none',
        symbolSize: isHovered ? 8 : 0,
        lineStyle: {
          width: isHovered ? 4 : 2.5,
          color,
          type: isNum ? 'solid' as const : 'dashed' as const,
        },
        itemStyle: { color },
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
        axisLabel: {
          formatter: (v: string) => formatAxisLabel(v, granularity),
          fontSize: 10, color: '#6b7280', margin: 14,
        },
        axisLine: { lineStyle: { color: 'rgba(0,0,0,0.08)' } },
        axisTick: { show: true, length: 3, lineStyle: { color: 'rgba(0,0,0,0.08)' } },
      },
      yAxis: [
        {
          type: 'value' as const,
          name: 'NUM',
          nameTextStyle: { fontSize: 9, color: '#22c55e', fontWeight: 700, padding: [0, 0, 0, 4] },
          axisLabel: { fontSize: 9, color: '#22c55e', formatter: (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : String(Math.round(v)) },
          splitLine: { show: true, lineStyle: { color: 'rgba(34,197,94,0.08)', type: 'dashed' as const } },
          axisLine: { show: true, lineStyle: { color: 'rgba(34,197,94,0.3)' } },
        },
        {
          type: 'value' as const,
          name: 'DEN',
          nameTextStyle: { fontSize: 9, color: '#3b82f6', fontWeight: 700, padding: [0, 4, 0, 0] },
          axisLabel: { fontSize: 9, color: '#3b82f6', formatter: (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : String(Math.round(v)) },
          splitLine: { show: false },
          axisLine: { show: true, lineStyle: { color: 'rgba(59,130,246,0.3)' } },
        },
      ],
      series,
    };
  }, [counterTsData, counterInfos, hiddenCounters, hoveredCounter, granularity, numCounterNames, denCounterNames]);

  // ──── Table data ────
  const tableRows = useMemo(() => {
    const rows: { ts: string; ne: string; counter: string; tag: string; value: number }[] = [];
    const tagMap = new Map(counterInfos.map(c => [c.name, c.tag]));

    for (const d of counterTsData) {
      if (hiddenCounters.has(d.counter)) continue;
      rows.push({
        ts: d.ts,
        ne: d.ne || neValue || 'N/A',
        counter: d.counter,
        tag: tagMap.get(d.counter) || '—',
        value: d.value,
      });
    }
    rows.sort((a, b) => a.ts.localeCompare(b.ts) || a.counter.localeCompare(b.counter));
    return rows;
  }, [counterTsData, counterInfos, hiddenCounters, neValue]);

  const totalPages = Math.max(1, Math.ceil(tableRows.length / pageSize));
  const pageRows = tableRows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  // CSV export
  const downloadCSV = useCallback(() => {
    const header = 'Timestamp,NE,Counter,Type,Value';
    const lines = tableRows.map(r =>
      `${r.ts},${r.ne},"${r.counter}",${r.tag},${r.value}`
    );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `breakdown_${selectedKpiTab}_counters.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [tableRows, selectedKpiTab]);

  const numInfos = counterInfos.filter(c => c.tag === 'NUM');
  const denInfos = counterInfos.filter(c => c.tag === 'DEN');

  /* ──────────────────── Render ──────────────────── */

  return (
    <div className="space-y-4">
      {/* KPI selector tabs (when multiple KPIs) */}
      {uniqueKpiIds.length > 1 && (
        <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-xl border border-border/30">
          {uniqueKpiIds.map((kpiId, i) => {
            const ex = explainData[kpiId];
            return (
              <button
                key={kpiId}
                onClick={() => { setSelectedKpiTab(kpiId); setCurrentPage(0); }}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold transition-all',
                  selectedKpiTab === kpiId
                    ? 'bg-card text-foreground shadow-sm border border-border/50'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                )}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                {ex?.display_name || kpiId}
              </button>
            );
          })}
        </div>
      )}

      {/* ═══ Zone 1: Formula Panel ═══ */}
      <FormulaPanel
        explain={currentExplain || null}
        numCounters={numInfos}
        denCounters={denInfos}
        hoveredCounter={hoveredCounter}
        onHoverCounter={setHoveredCounter}
        hiddenCounters={hiddenCounters}
        onToggleCounter={toggleCounter}
      />

      {/* ═══ Zone 2: Counters Graph ═══ */}
      <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border/30 bg-muted/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
              Counter Timeseries
            </span>
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
            <div className="flex items-center justify-center h-[320px] text-muted-foreground text-sm">
              Loading counters...
            </div>
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

      {/* ═══ Zone 3: Counter Definitions ═══ */}
      <CounterDefinitionPanel
        counters={counterInfos}
        hoveredCounter={hoveredCounter}
        onHoverCounter={setHoveredCounter}
      />

      {/* ═══ Zone 4: Raw Data Table ═══ */}
      <div className="rounded-xl border border-border/40 bg-card overflow-hidden flex flex-col">
        {/* Table header toolbar */}
        <div className="px-5 py-3 border-b border-border/30 bg-muted/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Table2 className="w-4 h-4 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">Raw Counter Data</span>
            <span className="text-[10px] text-muted-foreground">{tableRows.length} rows</span>
          </div>
          <button
            onClick={downloadCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1" style={{ maxHeight: 420 }}>
          <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0 z-20">
              <tr className="bg-muted/60 backdrop-blur-sm">
                <th className="text-left py-3 px-4 font-bold text-muted-foreground uppercase tracking-wider border-b-2 border-r border-border/30 whitespace-nowrap">
                  Timestamp
                </th>
                <th className="text-left py-3 px-4 font-bold text-primary uppercase tracking-wider border-b-2 border-r border-border/30 whitespace-nowrap sticky left-0 bg-muted/90 z-30 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                  Network Element
                </th>
                <th className="text-left py-3 px-4 font-bold text-muted-foreground uppercase tracking-wider border-b-2 border-r border-border/30 whitespace-nowrap">
                  Counter Name
                </th>
                <th className="text-center py-3 px-4 font-bold text-muted-foreground uppercase tracking-wider border-b-2 border-r border-border/30 whitespace-nowrap w-[60px]">
                  Type
                </th>
                <th className="text-right py-3 px-4 font-bold text-muted-foreground uppercase tracking-wider border-b-2 border-border/30 whitespace-nowrap">
                  Value
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/10">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    No data available
                  </td>
                </tr>
              ) : (
                pageRows.map((row, idx) => {
                  const isNum = row.tag === 'NUM';
                  return (
                    <tr
                      key={`${row.ts}-${row.counter}-${idx}`}
                      className={cn(
                        'hover:bg-primary/[0.04] transition-colors',
                        idx % 2 !== 0 && 'bg-muted/[0.04]'
                      )}
                    >
                      <td className="py-2.5 px-4 tabular-nums text-muted-foreground whitespace-nowrap">
                        {row.ts}
                      </td>
                      <td className={cn(
                        'py-2.5 px-4 font-semibold text-primary whitespace-nowrap sticky left-0 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]',
                        idx % 2 !== 0 ? 'bg-muted/[0.04]' : 'bg-card'
                      )}>
                        {row.ne}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-foreground truncate max-w-[250px]" title={row.counter}>
                        {row.counter}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider',
                          isNum
                            ? 'bg-green-500/15 text-green-600 border border-green-500/20'
                            : 'bg-blue-500/15 text-blue-500 border border-blue-500/20'
                        )}>
                          {row.tag}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-foreground whitespace-nowrap">
                        {row.value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="h-10 border-t border-border/30 flex items-center justify-between px-4 bg-muted/10 shrink-0">
          <div className="flex items-center gap-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
            <span>
              {tableRows.length > 0
                ? `Showing ${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, tableRows.length)} of ${tableRows.length.toLocaleString()}`
                : 'No data'}
            </span>
            <div className="relative group">
              <button className="flex items-center gap-1 hover:text-primary transition-colors">
                <span>Items: {pageSize}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              <div className="absolute bottom-full left-0 mb-1 hidden group-hover:flex flex-col bg-card border border-border rounded-lg shadow-lg py-1 z-30">
                {[25, 50, 100, 200].map(n => (
                  <button
                    key={n}
                    onClick={() => { setPageSize(n); setCurrentPage(0); }}
                    className={cn(
                      'px-4 py-1.5 text-[10px] font-bold text-left hover:bg-muted/50 transition-colors',
                      pageSize === n ? 'text-primary' : 'text-foreground'
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(0)}
              disabled={currentPage === 0}
              className="p-1 hover:bg-muted rounded disabled:opacity-30 transition-colors"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="p-1 hover:bg-muted rounded disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center px-2">
              <span className="text-[10px] font-bold bg-primary text-primary-foreground w-6 h-6 flex items-center justify-center rounded">
                {currentPage + 1}
              </span>
              <span className="text-[10px] text-muted-foreground ml-1">/ {totalPages}</span>
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="p-1 hover:bg-muted rounded disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages - 1)}
              disabled={currentPage >= totalPages - 1}
              className="p-1 hover:bg-muted rounded disabled:opacity-30 transition-colors"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KPIBreakdown;
