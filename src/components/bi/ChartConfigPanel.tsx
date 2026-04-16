import React, { useState, useEffect, useMemo } from 'react';
import { Switch } from '@/components/ui/switch';
import {
  X, Plus, Trash2, ChevronDown, ChevronRight, TrendingUp, BarChart3, AreaChart,
  ScatterChart, Layers, Columns3, PieChart, Hash, Paintbrush, Database, Check,
  Grid3X3, Calendar, Filter, GitBranch, Settings2, Palette,
  Zap, ArrowRight, BarChart2, Clock, Eye, CircleDot, Type, LayoutGrid, Search, RotateCcw
} from 'lucide-react';
import {
  ChartConfig, YMetricConfig, XAxisConfig, FilterConfig,
  BI_DIMENSIONS, BI_KPIS, BI_KPI_CATALOG, CHART_COLORS, BIDimension, BIKPI,
  Aggregation, ChartType, Granularity, AxisSide, LineStyle, getKpiDisplayName
} from './biTypes';
import BIKpiSelectorModal from './BIKpiSelectorModal';
import { getDimensionValues } from './mockBIData';
import { useCSVData } from './CSVDataStore';
import { biQueryApi } from '@/lib/localDb';
import { fetchKpiCatalogFromDB } from '@/components/kpi-monitor/kpiCatalog';

interface Props {
  config: ChartConfig;
  onChange: (config: ChartConfig) => void;
  onClose: () => void;
}

const AGGREGATIONS: Aggregation[] = ['AVG', 'SUM', 'MAX', 'MIN', 'P50', 'P95'];
const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: 'hour', label: 'Heure' },
  { key: 'day', label: 'Jour' },
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
];
const LINE_STYLES: LineStyle[] = ['solid', 'dashed', 'dotted'];

const SIMPLE_PALETTE = [
  '#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#EC4899', '#14B8A6', '#F97316', '#6366F1',
  '#84CC16', '#E11D48',
];

const BG_PALETTE = [
  'transparent', '#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0',
  '#0f172a', '#1e293b', '#1a1a2e', '#fef9ef', '#f0fdf4',
  '#eff6ff', '#fdf2f8',
];

const TEXT_COLOR_PALETTE = [
  '', '#0f172a', '#1e293b', '#334155', '#64748b',
  '#ffffff', '#e2e8f0', '#2563EB', '#10B981', '#EF4444',
  '#F59E0B', '#8B5CF6',
];

const CHART_TYPE_OPTIONS: { type: ChartType; icon: React.ReactNode; label: string }[] = [
  { type: 'line', icon: <TrendingUp className="w-4 h-4" />, label: 'Ligne' },
  { type: 'line_dot', icon: <CircleDot className="w-4 h-4" />, label: 'Ligne•Pt' },
  { type: 'bar', icon: <BarChart3 className="w-4 h-4" />, label: 'Barres' },
  { type: 'area', icon: <AreaChart className="w-4 h-4" />, label: 'Aire' },
  { type: 'scatter', icon: <ScatterChart className="w-4 h-4" />, label: 'Scatter' },
  { type: 'stacked_bar', icon: <Layers className="w-4 h-4" />, label: 'Empilé' },
  { type: 'grouped_bar', icon: <Columns3 className="w-4 h-4" />, label: 'Superposé' },
  { type: 'heatmap', icon: <Grid3X3 className="w-4 h-4" />, label: 'Heatmap' },
  { type: 'pie', icon: <PieChart className="w-4 h-4" />, label: 'Pie' },
  { type: 'kpi_card', icon: <Hash className="w-4 h-4" />, label: 'KPI' },
];

const DATE_PRESETS = [
  { label: '24h', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
];

const normalizeTechValue = (value: string): string | null => {
  const normalized = value.trim().toUpperCase();
  if (normalized.includes('5G') || normalized === 'NR') return '5G';
  if (normalized.includes('4G') || normalized === 'LTE') return '4G';
  if (normalized.includes('3G') || normalized === 'UMTS') return '3G';
  if (normalized.includes('2G') || normalized === 'GSM') return '2G';
  if (normalized.includes('WIFI')) return 'WIFI';
  return null;
};

const matchesScopedTech = (
  kpiKey: string,
  selectedTechs: Set<string>,
  kpiScopeByKey: Map<string, string>
) => {
  if (selectedTechs.size === 0) return true;

  const scopedTech = kpiScopeByKey.get(kpiKey);
  if (scopedTech === '4G' || scopedTech === '5G') return selectedTechs.has(scopedTech);
  if (scopedTech === 'both') return true;

  const normalizedKey = kpiKey.toUpperCase();
  const is5gSpecific = normalizedKey.includes('5G');
  const is4gSpecific = normalizedKey.includes('4G');
  const is3g2gSpecific = normalizedKey.includes('3G2G');
  const isWifiSpecific = normalizedKey.includes('WIFI');

  if (!is5gSpecific && !is4gSpecific && !is3g2gSpecific && !isWifiSpecific) return true;
  if (is5gSpecific) return selectedTechs.has('5G');
  if (is4gSpecific) return selectedTechs.has('4G');
  if (is3g2gSpecific) return selectedTechs.has('3G') || selectedTechs.has('2G');
  if (isWifiSpecific) return selectedTechs.has('WIFI');
  return true;
};

/* ─── FilterValuePicker ─── */
const FilterValuePicker: React.FC<{
  dimension: string;
  selected: string[];
  onChange: (vals: string[]) => void;
}> = ({ dimension, selected, onChange }) => {
  const [values, setValues] = useState<string[]>(getDimensionValues(dimension));
  useEffect(() => {
    let cancelled = false;
    biQueryApi.distinct(dimension).then(res => {
      if (!cancelled && Array.isArray(res) && res.length > 0) setValues(res);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [dimension]);
  return (
    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
      {values.map(val => (
        <button
          key={val}
          onClick={() => {
            const vals = selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val];
            onChange(vals);
          }}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all duration-150 ${
            selected.includes(val)
              ? 'bg-primary/10 text-primary border-primary/30'
              : 'bg-background text-muted-foreground border-border/50 hover:border-primary/30 hover:bg-muted/40'
          }`}
        >
          {val}
        </button>
      ))}
    </div>
  );
};

const ColorDot: React.FC<{ color: string; selected: boolean; onClick: () => void; size?: number }> = ({
  color, selected, onClick, size = 18
}) => (
  <button
    onClick={onClick}
    className={`rounded-full border-2 transition-all duration-150 hover:scale-110 ${
      selected
        ? 'border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.2)] scale-110'
        : 'border-transparent hover:border-primary/30'
    }`}
    style={{
      width: size, height: size,
      background: color === 'transparent'
        ? 'repeating-conic-gradient(hsl(var(--muted)) 0% 25%, transparent 0% 50%) 50% / 8px 8px'
        : color,
    }}
    title={color === 'transparent' ? 'Transparent' : color}
  />
);

/* ─── Main Panel ─── */
const ChartConfigPanel: React.FC<Props> = ({ config, onChange, onClose }) => {
  const { datasets } = useCSVData();

  const [draft, setDraft] = useState<ChartConfig>(() => JSON.parse(JSON.stringify(config)));
  const [dirty, setDirty] = useState(false);
  const [availableDateRange, setAvailableDateRange] = useState<{ min_date: string | null; max_date: string | null }>({ min_date: null, max_date: null });
  const [kpiScopes, setKpiScopes] = useState<Array<{ kpi_key: string; techno_scope: string }>>([]);
  const [kpiModalOpen, setKpiModalOpen] = useState(false);
  const [kpiModalTarget, setKpiModalTarget] = useState<{ type: 'metric'; index: number } | { type: 'xAxis' } | { type: 'sizeBy' } | null>(null);
  const [expandedMetrics, setExpandedMetrics] = useState<Set<number>>(new Set());
  const toggleMetricExpand = (idx: number) => setExpandedMetrics(prev => {
    const next = new Set(prev);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    return next;
  });

  // Collapsible sections
  const [kpiOpen, setKpiOpen] = useState(true);
  const [axeOpen, setAxeOpen] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [aggOpen, setAggOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);

  // Auto-detect available date range from local DB
  useEffect(() => {
    biQueryApi.dateRange().then(range => {
      setAvailableDateRange(range);
      if (range.min_date && range.max_date) {
        const currentStart = draft.xAxis.dateStart || '';
        const currentEnd = draft.xAxis.dateEnd || '';
        const dataStart = range.min_date;
        const dataEnd = range.max_date;
        if (!currentStart || !currentEnd || currentStart === '2026-02-01' || currentEnd === '2026-02-15' ||
            currentStart > dataEnd || currentEnd < dataStart) {
          const start = new Date(dataEnd);
          start.setDate(start.getDate() - 14);
          const autoStart = start.toISOString().split('T')[0] < dataStart ? dataStart : start.toISOString().split('T')[0];
          setDraft(prev => ({
            ...prev,
            xAxis: { ...prev.xAxis, dateStart: autoStart, dateEnd: dataEnd }
          }));
          setDirty(true);
        }
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchKpiCatalogFromDB()
      .then((entries) => {
        if (cancelled) return;
        setKpiScopes(
          entries.map((entry) => ({
            kpi_key: entry.kpi_key,
            techno_scope: entry.techno_scope,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setKpiScopes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setDraft(JSON.parse(JSON.stringify(config)));
    setDirty(false);
  }, [config.id]);

  const availableKpiKeys = useMemo(() => {
    const ratFilter = draft.filters.find(f => f.dimension === 'RAT' && f.values.length > 0);
    if (!ratFilter) return undefined;

    const selectedTechs = new Set(
      ratFilter.values
        .map(normalizeTechValue)
        .filter((value): value is string => Boolean(value))
    );

    if (selectedTechs.size === 0) return undefined;

    const kpiScopeByKey = new Map(kpiScopes.map(entry => [entry.kpi_key, entry.techno_scope]));
    return BI_KPI_CATALOG
      .filter(kpi => matchesScopedTech(kpi.key, selectedTechs, kpiScopeByKey))
      .map(kpi => kpi.key);
  }, [draft.filters, kpiScopes]);

  const update = (partial: Partial<ChartConfig>) => {
    setDraft(prev => ({ ...prev, ...partial }));
    setDirty(true);
  };
  const updateX = (partial: Partial<XAxisConfig>) => update({ xAxis: { ...draft.xAxis, ...partial } });

  const updateMetric = (idx: number, partial: Partial<YMetricConfig>) => {
    const metrics = [...draft.yMetrics];
    metrics[idx] = { ...metrics[idx], ...partial };
    update({ yMetrics: metrics });
  };

  const addMetric = () => {
    const used = draft.yMetrics.map(m => m.kpi);
    const next = BI_KPIS.find(k => !used.includes(k)) || BI_KPIS[0];
    update({
      yMetrics: [...draft.yMetrics, {
        kpi: next, aggregation: 'AVG', axis: 'left',
        chartType: 'line', color: CHART_COLORS[draft.yMetrics.length % CHART_COLORS.length],
        showMovingAvg: false, smoothCurve: true,
      }]
    });
  };

  const removeMetric = (idx: number) => {
    update({ yMetrics: draft.yMetrics.filter((_, i) => i !== idx) });
  };

  const addFilter = () => {
    const used = draft.filters.map(f => f.dimension);
    const next = BI_DIMENSIONS.find(d => !used.includes(d)) || BI_DIMENSIONS[0];
    update({ filters: [...draft.filters, { dimension: next, values: [] }] });
  };

  const updateFilter = (idx: number, partial: Partial<FilterConfig>) => {
    const filters = [...draft.filters];
    filters[idx] = { ...filters[idx], ...partial };
    update({ filters });
  };

  const removeFilter = (idx: number) => {
    update({ filters: draft.filters.filter((_, i) => i !== idx) });
  };

  const handleApply = () => {
    onChange(draft);
    setDirty(false);
  };

  const applyDatePreset = (days: number) => {
    const endDate = availableDateRange.max_date ? new Date(availableDateRange.max_date) : new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);
    const minDate = availableDateRange.min_date;
    const startStr = minDate && startDate.toISOString().split('T')[0] < minDate ? minDate : startDate.toISOString().split('T')[0];
    updateX({
      dateStart: startStr,
      dateEnd: endDate.toISOString().split('T')[0],
    });
  };

  return (
    <>
      <div className="w-[360px] h-full bg-background border-l border-border/40 flex flex-col overflow-hidden">

        {/* ─── Header ─── */}
        <div className="px-5 py-4 border-b border-border/40 bg-card/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <BarChart2 className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <input
                  value={draft.title}
                  onChange={e => update({ title: e.target.value })}
                  className="w-full bg-transparent text-[15px] font-bold text-foreground outline-none border-b border-transparent focus:border-primary/40 transition-all placeholder:text-muted-foreground/40 truncate"
                  placeholder="Chart title…"
                />
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted/60 text-muted-foreground" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ─── Content ─── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* ── KPI SELECTION ── */}
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
            <button onClick={() => setKpiOpen(!kpiOpen)} className="w-full text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 hover:text-foreground transition-colors">
              {kpiOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <Check className="w-3.5 h-3.5" /> KPIs sélectionnés
              <span className="ml-auto text-[9px] font-medium text-muted-foreground">{draft.yMetrics.length}</span>
            </button>
            {kpiOpen && (<>
              <button
                onClick={() => { setKpiModalTarget({ type: 'metric', index: -1 }); setKpiModalOpen(true); }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <Plus className="w-4 h-4 text-primary" />
                  </div>
                  <div className="text-left min-w-0">
                    <div className="text-[11px] font-semibold text-primary">Sélectionner des KPIs</div>
                    <div className="text-[9px] text-muted-foreground">{draft.yMetrics.length} KPI(s) actif(s)</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-primary/60 group-hover:translate-x-0.5 transition-transform" />
              </button>

              {/* Metric cards */}
              {draft.yMetrics.length > 0 && (
                <div className="space-y-2 pt-1">
                  {draft.yMetrics.map((m, i) => {
                    const isExpanded = expandedMetrics.has(i);
                    return (
                      <div key={i} className="rounded-lg border border-border/40 bg-card/40 overflow-hidden transition-all duration-200 hover:border-border/70">
                        <div className="flex items-stretch">
                          <div className="w-1 rounded-l-lg shrink-0" style={{ background: m.color }} />
                          <div className="flex-1 px-3 py-2 space-y-0">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => { setKpiModalTarget({ type: 'metric', index: i }); setKpiModalOpen(true); }}
                                className="flex-1 text-left text-[11px] font-bold text-foreground truncate hover:text-primary transition-colors cursor-pointer"
                              >
                                {getKpiDisplayName(m.kpi)}
                              </button>
                              <button onClick={() => updateMetric(i, { visible: m.visible === false ? true : false })}
                                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-all"
                                title={m.visible === false ? 'Show' : 'Hide'}>
                                <Eye className={`w-3 h-3 ${m.visible === false ? 'opacity-30' : ''}`} />
                              </button>
                              <button onClick={() => toggleMetricExpand(i)}
                                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-all">
                                <Settings2 className="w-3 h-3" />
                              </button>
                              <button onClick={() => removeMetric(i)}
                                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>

                            {/* Collapsible metric settings */}
                            <div className={`transition-all duration-200 ease-out ${isExpanded ? 'max-h-[800px] opacity-100 mt-2.5' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                              <div className="space-y-3 pb-1">
                                {/* Chart Type */}
                                <div className="space-y-1.5">
                                  <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Type</span>
                                  <div className="grid grid-cols-3 gap-1">
                                    {CHART_TYPE_OPTIONS.map(opt => (
                                      <button key={opt.type} onClick={() => updateMetric(i, { chartType: opt.type })}
                                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] font-medium transition-all ${
                                          m.chartType === opt.type
                                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                            : 'bg-background text-muted-foreground border-border/40 hover:border-primary/30 hover:bg-muted/30'
                                        }`}>
                                        {opt.icon}{opt.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                {/* Axis + Toggles */}
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Axe</span>
                                    <div className="flex gap-1">
                                      {(['left', 'right'] as const).map(side => (
                                        <button key={side} onClick={() => updateMetric(i, { axis: side })}
                                          className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                                            m.axis === side ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
                                          }`}>
                                          {side === 'left' ? 'Gauche' : 'Droite'}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="space-y-1.5">
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                      <Switch checked={m.smoothCurve} onCheckedChange={v => updateMetric(i, { smoothCurve: v })} className="scale-[0.7] origin-left" />
                                      <span className="text-[10px] text-muted-foreground">Lissé</span>
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                      <Switch checked={m.showMovingAvg} onCheckedChange={v => updateMetric(i, { showMovingAvg: v })} className="scale-[0.7] origin-left" />
                                      <span className="text-[10px] text-muted-foreground">Moy. mobile</span>
                                    </label>
                                  </div>
                                </div>
                                {/* Color */}
                                <div className="space-y-1">
                                  <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Couleur</span>
                                  <div className="flex gap-1.5 flex-wrap">
                                    {SIMPLE_PALETTE.map(c => (
                                      <ColorDot key={c} color={c} selected={m.color === c} onClick={() => updateMetric(i, { color: c })} size={16} />
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>)}
          </div>

          {/* ── AXE X ── */}
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
            <button onClick={() => setAxeOpen(!axeOpen)} className="w-full text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 hover:text-foreground transition-colors">
              {axeOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <LayoutGrid className="w-3.5 h-3.5" /> Axe X
              <span className="ml-auto text-[9px] font-medium text-muted-foreground">
                {(draft.xAxis.type || 'date') === 'date' ? 'Date' : draft.dimension1 || 'Dimension'}
              </span>
            </button>
            {axeOpen && (<>
              {/* Date / Dimension toggle */}
              <div className="flex gap-1">
                <button onClick={() => updateX({ type: 'date' })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                    (draft.xAxis.type || 'date') === 'date' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}>
                  <Calendar className="w-3.5 h-3.5" /> Date
                </button>
                <button onClick={() => updateX({ type: 'dimension' })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                    draft.xAxis.type === 'dimension' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}>
                  <LayoutGrid className="w-3.5 h-3.5" /> Dimension
                </button>
              </div>

              {/* Dimension selector */}
              {draft.xAxis.type === 'dimension' && (
                <select value={draft.dimension1 || ''} onChange={e => update({ dimension1: e.target.value as any })}
                  className="text-[11px] bg-background border border-border rounded-lg px-2.5 py-2 text-foreground outline-none w-full focus:ring-1 focus:ring-primary">
                  <option value="">Sélectionner…</option>
                  {BI_DIMENSIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              )}

              {/* Date range + granularity */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-[9px] text-muted-foreground mb-0.5 block">Début</label>
                    <input type="date" value={draft.xAxis.dateStart || ''} onChange={e => updateX({ dateStart: e.target.value })}
                      className="text-[11px] bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground outline-none w-full focus:ring-1 focus:ring-primary" />
                  </div>
                  <span className="text-muted-foreground mt-3">→</span>
                  <div className="flex-1">
                    <label className="text-[9px] text-muted-foreground mb-0.5 block">Fin</label>
                    <input type="date" value={draft.xAxis.dateEnd || ''} onChange={e => updateX({ dateEnd: e.target.value })}
                      className="text-[11px] bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground outline-none w-full focus:ring-1 focus:ring-primary" />
                  </div>
                </div>
                {/* Granularity */}
                <div>
                  <label className="text-[9px] text-muted-foreground mb-1 block">Granularité</label>
                  <div className="flex gap-1">
                    {GRANULARITIES.map(g => (
                      <button key={g.key}
                        onClick={() => updateX({ granularity: g.key })}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-colors ${
                          (draft.xAxis.granularity || 'day') === g.key
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}>
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>)}
          </div>

          {/* ── FILTERS ── */}
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <button onClick={() => setFilterOpen(!filterOpen)} className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 hover:text-foreground transition-colors">
                {filterOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <Filter className="w-3.5 h-3.5" /> Filtres
              </button>
              <button onClick={addFilter}
                className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-semibold">
                <Plus className="w-3 h-3" /> Ajouter
              </button>
            </div>
            {filterOpen && (
              <div className="space-y-2">
                {draft.filters.map((f, i) => (
                  <div key={i} className="rounded-lg border border-border/40 bg-muted/10 p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <select value={f.dimension} onChange={e => updateFilter(i, { dimension: e.target.value as BIDimension, values: [] })}
                        className="flex-1 text-[10px] bg-background border border-border rounded-lg px-2 py-1.5 text-foreground outline-none focus:ring-1 focus:ring-primary">
                        {BI_DIMENSIONS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <button onClick={() => removeFilter(i)}
                        className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <FilterValuePicker dimension={f.dimension} selected={f.values} onChange={vals => updateFilter(i, { values: vals })} />
                  </div>
                ))}
                {draft.filters.length === 0 && (
                  <div className="text-[10px] text-muted-foreground italic py-2 text-center">Aucun filtre appliqué</div>
                )}
              </div>
            )}
            {!filterOpen && draft.filters.length === 0 && (
              <div className="text-[10px] text-muted-foreground italic text-center">Aucun filtre appliqué</div>
            )}
          </div>

          {/* ── AFFICHAGE ── */}
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
            <button onClick={() => setDisplayOpen(!displayOpen)} className="w-full text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 hover:text-foreground transition-colors">
              {displayOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <Settings2 className="w-3.5 h-3.5" /> Affichage
            </button>
            {displayOpen && (
              <div className="space-y-2.5">
                {/* Legend */}
                <label className="flex items-center justify-between text-[11px] text-foreground cursor-pointer">
                  <span>Légende</span>
                  <input type="checkbox" checked={draft.advanced.showLegend} onChange={e => update({ advanced: { ...draft.advanced, showLegend: e.target.checked } })} className="rounded w-3.5 h-3.5 accent-primary" />
                </label>
                {draft.advanced.showLegend && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Position</span>
                    <div className="flex gap-1">
                      {(['bottom', 'top', 'left', 'right'] as const).map(pos => (
                        <button key={pos} onClick={() => update({ advanced: { ...draft.advanced, legendPosition: pos } })}
                          className={`px-2 py-0.5 rounded text-[9px] font-medium capitalize transition-all ${
                            (draft.advanced.legendPosition || 'bottom') === pos
                              ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}>{pos}</button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Grid */}
                <label className="flex items-center justify-between text-[11px] text-foreground cursor-pointer">
                  <span>Grille</span>
                  <input type="checkbox" checked={draft.advanced.showGrid !== false} onChange={e => update({ advanced: { ...draft.advanced, showGrid: e.target.checked } })} className="rounded w-3.5 h-3.5 accent-primary" />
                </label>
                {/* Background */}
                <div className="space-y-1">
                  <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Fond</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {BG_PALETTE.map(c => (
                      <ColorDot key={c} color={c} size={16}
                        selected={(draft.advanced.backgroundColor || 'transparent') === c}
                        onClick={() => update({ advanced: { ...draft.advanced, backgroundColor: c } })} />
                    ))}
                  </div>
                </div>
                {/* Header Text Color */}
                <div className="space-y-1">
                  <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Couleur texte</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {TEXT_COLOR_PALETTE.map(c => (
                      <ColorDot key={c || 'default'} color={c || 'currentColor'} size={16}
                        selected={(draft.advanced.headerTextColor || '') === c}
                        onClick={() => update({ advanced: { ...draft.advanced, headerTextColor: c } })} />
                    ))}
                  </div>
                </div>
                {/* Y Axis Range */}
                <div className="space-y-1">
                  <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Axe Y</span>
                  <div className="flex gap-1">
                    {(['auto', 'fixed'] as const).map(mode => (
                      <button key={mode} onClick={() => update({ advanced: { ...draft.advanced, yAxisMode: mode } })}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                          (draft.advanced.yAxisMode || 'auto') === mode
                            ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}>{mode === 'auto' ? 'Auto' : 'Fixe'}</button>
                    ))}
                  </div>
                  {(draft.advanced.yAxisMode || 'auto') === 'fixed' && (
                    <div className="flex gap-2 mt-1">
                      <div className="flex-1">
                        <label className="text-[9px] text-muted-foreground mb-0.5 block">Min</label>
                        <input type="number" value={draft.advanced.yAxisMin ?? ''} onChange={e => update({ advanced: { ...draft.advanced, yAxisMin: e.target.value === '' ? null : Number(e.target.value) } })}
                          className="w-full px-2 py-1 rounded-md bg-background border border-border text-foreground text-[11px]" placeholder="0" />
                      </div>
                      <div className="flex-1">
                        <label className="text-[9px] text-muted-foreground mb-0.5 block">Max</label>
                        <input type="number" value={draft.advanced.yAxisMax ?? ''} onChange={e => update({ advanced: { ...draft.advanced, yAxisMax: e.target.value === '' ? null : Number(e.target.value) } })}
                          className="w-full px-2 py-1 rounded-md bg-background border border-border text-foreground text-[11px]" placeholder="100" />
                      </div>
                    </div>
                  )}
                </div>
                {/* Data Mode */}
                <div className="space-y-1">
                  <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Mode</span>
                  <div className="flex gap-1">
                    {[{ value: 'data', label: 'Data' }, { value: 'voix', label: 'Voix' }].map(opt => (
                      <button key={opt.value} onClick={() => update({ dataMode: opt.value as 'data' | 'voix' })}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-colors ${
                          (draft.dataMode || 'data') === opt.value
                            ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}>{opt.label}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── AGGREGATION ── */}
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
            <button onClick={() => setAggOpen(!aggOpen)} className="w-full text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 hover:text-foreground transition-colors">
              {aggOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <GitBranch className="w-3.5 h-3.5" /> Agrégation
            </button>
            {aggOpen && (
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] text-muted-foreground mb-0.5 block font-bold uppercase tracking-wider">Agrégation</label>
                  <select value={draft.groupBy[0] || ''} onChange={e => update({ groupBy: e.target.value ? [e.target.value as BIDimension] : [] })}
                    className="text-[11px] bg-background border border-border rounded-lg px-2.5 py-2 text-foreground outline-none w-full focus:ring-1 focus:ring-primary">
                    <option value="">Aucune</option>
                    {BI_DIMENSIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground mb-0.5 block font-bold uppercase tracking-wider">Couleur par</label>
                  <select value={draft.colorBy || ''} onChange={e => update({ colorBy: e.target.value ? e.target.value as BIDimension : undefined })}
                    className="text-[11px] bg-background border border-border rounded-lg px-2.5 py-2 text-foreground outline-none w-full focus:ring-1 focus:ring-primary">
                    <option value="">Aucune</option>
                    {BI_DIMENSIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground mb-0.5 block font-bold uppercase tracking-wider">Taille par</label>
                  <select value={draft.sizeBy || ''} onChange={e => update({ sizeBy: e.target.value ? e.target.value as BIDimension : undefined })}
                    className="text-[11px] bg-background border border-border rounded-lg px-2.5 py-2 text-foreground outline-none w-full focus:ring-1 focus:ring-primary">
                    <option value="">Aucune</option>
                    {BI_DIMENSIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* ── DATA SOURCE (CSV) ── */}
          {datasets.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
              <button onClick={() => {}} className="w-full text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 hover:text-foreground transition-colors">
                <Database className="w-3.5 h-3.5" /> Source de données
              </button>
              <div className="flex gap-1">
                {[
                  { type: 'mock' as const, label: 'Simulé', icon: <Zap className="w-3.5 h-3.5" /> },
                  { type: 'csv' as const, label: 'CSV', icon: <Database className="w-3.5 h-3.5" /> },
                ].map(src => (
                  <button key={src.type}
                    onClick={() => update({ dataSource: { type: src.type, ...(src.type === 'csv' ? { csvDatasetId: datasets[0]?.id } : {}) } })}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-all ${
                      ((!draft.dataSource || draft.dataSource.type === 'mock') && src.type === 'mock') ||
                      (draft.dataSource?.type === 'csv' && src.type === 'csv')
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background text-muted-foreground border-border/60 hover:border-primary/40'
                    }`}>
                    {src.icon} {src.label}
                  </button>
                ))}
              </div>
              {draft.dataSource?.type === 'csv' && (() => {
                const ds = datasets.find(d => d.id === draft.dataSource?.csvDatasetId);
                if (!ds) return null;
                return (
                  <div className="space-y-2">
                    <select value={draft.dataSource.csvDatasetId || ''} onChange={e => update({ dataSource: { ...draft.dataSource!, csvDatasetId: e.target.value } })}
                      className="text-[11px] bg-background border border-border rounded-lg px-2.5 py-2 text-foreground outline-none w-full focus:ring-1 focus:ring-primary">
                      {datasets.map(d => <option key={d.id} value={d.id}>{d.id}</option>)}
                    </select>
                    <div>
                      <label className="text-[9px] text-muted-foreground mb-0.5 block font-bold uppercase tracking-wider">Colonne X</label>
                      <select value={draft.dataSource?.xColumn || ds.columns[0]} onChange={e => update({ dataSource: { ...draft.dataSource!, xColumn: e.target.value } })}
                        className="text-[11px] bg-background border border-border rounded-lg px-2.5 py-2 text-foreground outline-none w-full focus:ring-1 focus:ring-primary">
                        {ds.columns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground mb-0.5 block font-bold uppercase tracking-wider">Colonnes Y</label>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {ds.columns.filter(c => c !== (draft.dataSource?.xColumn || ds.columns[0])).map(col => {
                          const selected = draft.dataSource?.yColumns?.includes(col);
                          return (
                            <button key={col} onClick={() => {
                              const current = draft.dataSource?.yColumns || [];
                              const next = selected ? current.filter(c => c !== col) : [...current, col];
                              update({ dataSource: { ...draft.dataSource!, yColumns: next } });
                            }}
                              className={`px-2 py-1 rounded-md text-[10px] font-medium border transition-all ${
                                selected ? 'bg-primary/10 text-primary border-primary/30' : 'bg-background text-muted-foreground border-border/50 hover:border-primary/30'
                              }`}>{col}</button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* ─── Apply Button ─── */}
        <div className="px-5 py-4 border-t border-border/40 bg-card/50">
          <button
            onClick={handleApply}
            disabled={!dirty}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold transition-all ${
              dirty
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md'
                : 'bg-muted/50 text-muted-foreground cursor-not-allowed'
            }`}
          >
            <Check className="w-4 h-4" />
            {dirty ? 'Enregistrer' : 'À jour'}
          </button>
        </div>
      </div>

      {/* KPI Selector Modal */}
      <BIKpiSelectorModal
        open={kpiModalOpen}
        onClose={() => { setKpiModalOpen(false); setKpiModalTarget(null); }}
        availableKeys={availableKpiKeys}
        selectedKeys={
          kpiModalTarget?.type === 'metric'
            ? draft.yMetrics.map(m => m.kpi)
            : kpiModalTarget?.type === 'xAxis'
              ? [draft.xAxis.value].filter(Boolean)
              : kpiModalTarget?.type === 'sizeBy'
                ? []
                : []
        }
        single={kpiModalTarget?.type !== 'metric' || (kpiModalTarget?.type === 'metric' && kpiModalTarget.index >= 0)}
        onConfirm={(keys) => {
          if (!kpiModalTarget) return;
          if (kpiModalTarget.type === 'metric') {
            if (kpiModalTarget.index >= 0 && keys.length === 1) {
              const metrics = [...draft.yMetrics];
              metrics[kpiModalTarget.index] = {
                ...metrics[kpiModalTarget.index],
                kpi: keys[0] as BIKPI,
              };
              update({ yMetrics: metrics });
            } else {
              const existingMap = new Map(draft.yMetrics.map(m => [m.kpi, m]));
              const newMetrics: YMetricConfig[] = keys.map((key, idx) => {
                const existing = existingMap.get(key as BIKPI);
                if (existing) return existing;
                return {
                  kpi: key as BIKPI,
                  aggregation: 'AVG' as Aggregation,
                  axis: 'left' as AxisSide,
                  chartType: 'line' as ChartType,
                  color: CHART_COLORS[idx % CHART_COLORS.length],
                  showMovingAvg: false,
                  smoothCurve: true,
                };
              });
              update({ yMetrics: newMetrics });
            }
          } else if (kpiModalTarget.type === 'xAxis') {
            updateX({ value: keys[0] });
          } else if (kpiModalTarget.type === 'sizeBy') {
            // no-op
          }
        }}
      />
    </>
  );
};

export default ChartConfigPanel;
