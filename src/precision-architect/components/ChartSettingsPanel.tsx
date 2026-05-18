import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Eye, EyeOff, GripVertical, ChevronDown, ChevronRight, Database, Palette, Flag, Filter, Calendar, Clock, Loader2, Search, Check, Cpu } from 'lucide-react';
import {
  DynWidget, ChartWidgetConfig, ChartMetric, ChartJalon, ChartThreshold,
  DEFAULT_CHART_CONFIG, ChartType, TechnoId, PeriodPreset, GrainOption, ChartFilterChip,
  LineStyle, AxisSide, FillStyle, BackgroundStyle, LegendPosition,
} from '../types';
import { cn } from '@/lib/utils';
import { useKpiCatalog, useFilterCatalog } from '@/components/kpi-monitor/api/kpiMonitorApi';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import DateRangePopover from './DateRangePopover';
import KpiSelectorModal from '@/components/kpi-monitor/KpiSelectorModal';
import CounterSelectorModal from '@/components/investigator/CounterSelectorModal';
import { KpiCatalogEntry } from '@/components/kpi-monitor/types';
import { getApiUrl, getApiHeaders, fetchVpsWithRetry } from '@/lib/apiConfig';
import PAFilterChips from './PAFilterChips';
import { usePAGlobalToolbar } from '../stores/paGlobalToolbarStore';
import ColorSwatchPalette from './ColorSwatchPalette';
import { formatLocalDateTimeInput } from '../lib/localDateTime';

interface Props {
  widget: DynWidget;
  onChange: (patch: Partial<DynWidget>) => void;
  onClose: () => void;
}

type Tab = 'data' | 'appearance' | 'jalons';

// Fallback KPI list (used only when backend catalog is unreachable)
const FALLBACK_KPI_OPTIONS = [
  { key: 'qoe_index', label: 'QoE Index', unit: '%' },
  { key: 'debit_dl', label: 'Débit DL', unit: 'Mbps' },
  { key: 'debit_ul', label: 'Débit UL', unit: 'Mbps' },
  { key: 'rtt_data_avg', label: 'RTT Data Avg', unit: 'ms' },
  { key: 'rtt_setup_avg', label: 'RTT Setup Avg', unit: 'ms' },
  { key: 'session_dcr', label: 'DCR', unit: '%' },
  { key: 'session_dur_moy', label: 'Session Duration', unit: 's' },
  { key: 'tcp_retr_rate_dl', label: 'TCP Retr DL', unit: '%' },
  { key: 'instability_rate', label: 'Instability Rate', unit: '%' },
];

// Fallback dimensions (used only if backend filter catalog is unreachable)
const FALLBACK_TF_DIMENSIONS = ['Cluster', 'DOR', 'DR', 'Vendor', 'Bande', 'Technology', 'Site', 'Cell', 'PCI', 'ECI', 'Zone ARCEP'];



const COLOR_PALETTE = ['#00685f', '#6bd8cb', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#10b981', '#ec4899'];

// Mirrors the table widget — same backend dimensions accepted by /monitor/query/timeseries.
const SPLIT_OPTIONS = ['CELL', 'SITE', 'CLUSTER', 'DOR', 'DR', 'VENDOR', 'BANDE', 'TECHNOLOGY', '__none__'];

export default function ChartSettingsPanel({ widget, onChange, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('data');
  const config: ChartWidgetConfig = widget.config ?? DEFAULT_CHART_CONFIG;

  // Dirty detection: the editor draft (`config`) is "dirty" when it differs
  // from the last applied snapshot (`appliedConfig`). Until the user clicks
  // Apply, NOTHING in the rendered chart or the backend changes.
  const appliedSnapshot = (widget.appliedConfig as ChartWidgetConfig | undefined) ?? null;
  const isDirty = useMemo(() => {
    if (!appliedSnapshot) return (config.metrics?.length ?? 0) > 0;
    try { return JSON.stringify(config) !== JSON.stringify(appliedSnapshot); }
    catch { return true; }
  }, [config, appliedSnapshot]);

  const commitAppliedConfig = (closeAfter = false) => {
    onChange({
      config,
      appliedConfig: structuredClone(config),
      appliedRev: (widget.appliedRev ?? 0) + 1,
    });
    if (closeAfter) onClose();
  };

  // "Revert" rolls the draft back to the last applied snapshot — purely local,
  // no backend call.
  const revertDraft = () => {
    if (appliedSnapshot) onChange({ config: structuredClone(appliedSnapshot) });
  };

  // ── Live backend catalogs (KPIs + filter dimensions) ───────────────
  const { data: kpiCatalog, isLoading: kpisLoading } = useKpiCatalog();
  const { data: filterCatalog, isLoading: filtersLoading } = useFilterCatalog();

  const kpiOptions = useMemo(() => {
    if (!kpiCatalog || kpiCatalog.length === 0) return FALLBACK_KPI_OPTIONS;
    return kpiCatalog
      .filter(k => k.is_active !== false)
      .map(k => ({ key: k.kpi_key, label: k.display_name || k.kpi_key, unit: k.unit || '' }));
  }, [kpiCatalog]);

  // ── Map MonitorKpiCatalogEntry → KpiCatalogEntry (shape expected by KpiSelectorModal)
  const kpiCatalogForSelector: KpiCatalogEntry[] = useMemo(() => {
    if (!kpiCatalog || kpiCatalog.length === 0) return [];
    return kpiCatalog.filter(k => k.is_active !== false).map((k: any) => ({
      kpi_id: k.kpi_key,
      kpi_key: k.kpi_key,
      display_name: k.display_name || k.kpi_key,
      description: k.description || '',
      techno_scope: 'both' as const,
      unit: k.unit || '',
      value_type: (k.value_type || 'gauge') as any,
      default_agg: 'avg' as const,
      allowed_aggs: ['avg' as const],
      is_map_supported: false,
      category: k.category || 'Other',
      color: '#3b82f6',
      vendor: k.vendor || '',
      techno: k.techno || '',
      is_normalized: k.is_normalized ?? false,
      dimension_type: k.dimension_type || null,
      dimension_prefix: (k as any).dimension_prefix || null,
      supported_levels: k.supported_levels || [],
      // 2026-05-09 — preserve canonical name + raw formulas so the
      // KpiSelectorModal can group multivendor variants under
      // kpi_code_normalized AND show per-vendor formulas in the
      // info popover. Without these fields the selector falls back
      // to verbose Vendor__&_* names and the formula drawer is empty.
      kpi_code_normalized: (k as any).kpi_code_normalized || '',
      numerator: (k as any).numerator ?? (k as any).numerateur ?? '',
      denominator: (k as any).denominator ?? (k as any).denominateur ?? '',
    } as any));
  }, [kpiCatalog]);

  // ── Counter catalog (loaded once from backend; used by CounterSelectorModal)
  const [counterCatalog, setCounterCatalog] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    fetchVpsWithRetry(getApiUrl('pm/counters/catalog?limit=25000'), { headers: getApiHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (alive) setCounterCatalog(Array.isArray(d) ? d : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const dimensionOptions = useMemo(() => {
    if (!filterCatalog || filterCatalog.length === 0) return FALLBACK_TF_DIMENSIONS;
    const fromBackend = filterCatalog
      .filter(f => (f as any).is_active !== false)
      .map(f => f.display_name || f.dimension_key);
    if (!fromBackend.some(d => d.toLowerCase() === 'vendor')) {
      fromBackend.push('Vendor');
    }
    return fromBackend;
  }, [filterCatalog]);

  // Template-section categories + rats — drive grouped picker + techno-aware hiding.
  const filterCategoriesMap = useMemo(() => {
    const cats: Record<string, string> = {};
    if (filterCatalog) {
      for (const f of filterCatalog) {
        const name = f.display_name || f.dimension_key;
        const cat = (f as any).category;
        if (name && cat) cats[name] = cat;
      }
    }
    return cats;
  }, [filterCatalog]);
  const filterRatsMap = useMemo(() => {
    const rats: Record<string, string> = {};
    if (filterCatalog) {
      for (const f of filterCatalog) {
        const name = f.display_name || f.dimension_key;
        const rat = (f as any).rat;
        if (name && rat) rats[name] = rat;
      }
    }
    return rats;
  }, [filterCatalog]);

  const patchConfig = (patch: Partial<ChartWidgetConfig>) => {
    onChange({ config: { ...config, ...patch } });
  };
  const patchData = (patch: Partial<ChartWidgetConfig['data']>) =>
    patchConfig({ data: { ...config.data, ...patch } });
  const patchStyle = (patch: Partial<ChartWidgetConfig['style']>) =>
    patchConfig({ style: { ...config.style, ...patch } });
  const setMetrics = (metrics: ChartMetric[]) => patchConfig({ metrics });

  const addMetric = () => {
    const first = kpiOptions[0] ?? FALLBACK_KPI_OPTIONS[0];
    const m: ChartMetric = {
      id: `m-${Date.now()}`,
      kpiKey: first.key,
      alias: first.label,
      unit: first.unit,
      axis: 'left',
      color: COLOR_PALETTE[config.metrics.length % COLOR_PALETTE.length],
      lineStyle: 'solid',
      visible: true,
    };
    setMetrics([...config.metrics, m]);
  };

  const addMetricsFromKeys = (keys: string[]) => {
    const existing = new Set(config.metrics.map(m => m.kpiKey));
    const toAdd = keys.filter(k => !existing.has(k));
    if (toAdd.length === 0) return;
    const newMetrics: ChartMetric[] = toAdd.map((key, idx) => {
      const opt = kpiOptions.find(o => o.key === key);
      return {
        id: `m-${Date.now()}-${idx}`,
        kpiKey: key,
        alias: opt?.label ?? key,
        unit: opt?.unit ?? '',
        axis: 'left',
        color: COLOR_PALETTE[(config.metrics.length + idx) % COLOR_PALETTE.length],
        lineStyle: 'solid',
        visible: true,
      };
    });
    setMetrics([...config.metrics, ...newMetrics]);
  };

  const addCountersFromKeys = (counterNames: string[]) => {
    const existing = new Set(config.metrics.map(m => m.kpiKey));
    const toAdd = counterNames.filter(k => !existing.has(k));
    if (toAdd.length === 0) return;
    const newMetrics: ChartMetric[] = toAdd.map((name, idx) => {
      const c = counterCatalog.find((x: any) => x.counter_name === name);
      return {
        id: `c-${Date.now()}-${idx}`,
        kpiKey: name,
        alias: c?.display_name || name,
        unit: '',
        axis: 'left',
        color: COLOR_PALETTE[(config.metrics.length + idx) % COLOR_PALETTE.length],
        lineStyle: 'solid',
        visible: true,
      };
    });
    setMetrics([...config.metrics, ...newMetrics]);
  };


  const updateMetric = (id: string, patch: Partial<ChartMetric>) => {
    // STRICT apply-only contract: every editor mutation stays in the DRAFT
    // (`config`) only. The applied snapshot (`appliedConfig`) is the single
    // source of truth that drives the rendered chart and any backend fetch,
    // and it must NEVER be touched outside an explicit Apply click.
    setMetrics(config.metrics.map(m => m.id === id ? { ...m, ...patch } : m));
  };
  const removeMetric = (id: string) => setMetrics(config.metrics.filter(m => m.id !== id));

  const widgetLabel = `${(widget.kind || 'CHART').toUpperCase()} · ${(widget.title && widget.title.trim()) || 'Untitled'}`;

  const resetSettings = () => {
    onChange({ config: { ...DEFAULT_CHART_CONFIG } });
    setTab('data');
  };

  return (
    <div className="h-[280px] max-h-[30vh] w-full bg-white border border-[hsl(165,12%,91%)] rounded-xl shadow-[0_4px_12px_rgba(15,23,42,0.06)] relative z-40 shrink-0 flex flex-col">
      {/* Header — sticky */}
      <div className="px-4 h-12 border-b border-[hsl(165,12%,93%)] flex items-center justify-between bg-white shrink-0 sticky top-0 z-10 rounded-t-xl">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">Widget Settings</span>
          <div className="h-4 w-px bg-outline-variant" />
          <h4 className="font-headline font-bold text-on-surface text-sm">{widgetLabel}</h4>
        </div>
        <div className="flex gap-2 items-center">
          {isDirty ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 text-[9px] font-black uppercase tracking-widest border border-amber-500/30">
              ● Unsaved changes
            </span>
          ) : (
            <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 text-[9px] font-black uppercase tracking-widest border border-emerald-500/20">
              ✓ Synced
            </span>
          )}
          <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-black uppercase tracking-widest border border-primary/20">
            Widget scope
          </span>
          <button
            onClick={revertDraft}
            disabled={!isDirty || !appliedSnapshot}
            className="px-3 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Discard draft changes and revert to the last applied state"
          >
            Revert
          </button>
          <button
            onClick={resetSettings}
            className="px-3 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            Reset
          </button>
          <button
            onClick={() => commitAppliedConfig(false)}
            className="px-4 py-1.5 rounded-lg bg-white border border-primary/40 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/5 transition-colors"
            title="Apply changes only to this selected widget (does not refresh the dashboard)"
          >
            Apply to Widget
          </button>
          <button
            onClick={() => commitAppliedConfig(true)}
            disabled={!isDirty}
            className="px-4 py-1.5 rounded-lg bg-primary text-on-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary"
            title="Save and apply changes to this widget"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="p-1 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body: left sidebar tabs + content */}
      <div className="flex flex-1 min-h-0">
        <aside className="w-48 border-r border-outline-variant/10 p-4 shrink-0 space-y-1 overflow-y-auto">
          {([
            { key: 'data', label: 'Data Source', icon: Database },
            { key: 'appearance', label: 'Appearance', icon: Palette },
            { key: 'jalons', label: 'Jalons & Seuils', icon: Flag },
          ] as const).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2',
                  tab === t.key ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-low'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </aside>

        <div className="flex-1 min-w-0 p-6 pb-10 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <div className="w-full min-w-0 space-y-5">
            {tab === 'data' && (
              <DataSourceTab
                config={config}
                patchData={patchData}
                addMetric={addMetric}
                addMetricsFromKeys={addMetricsFromKeys}
                addCountersFromKeys={addCountersFromKeys}
                updateMetric={updateMetric}
                removeMetric={removeMetric}
                title={widget.title ?? ''}
                onTitleChange={(t) => onChange({ title: t })}
                kpiOptions={kpiOptions}
                kpisLoading={kpisLoading}
                kpiCatalogForSelector={kpiCatalogForSelector}
                counterCatalog={counterCatalog}
                dimensionOptions={dimensionOptions}
                filtersLoading={filtersLoading}
                onApply={() => commitAppliedConfig(false)}
                isStat={widget.kind === 'stat'}
                filterCategoriesMap={filterCategoriesMap}
                filterRatsMap={filterRatsMap}
              />
            )}
            {tab === 'appearance' && (
              <StyleTab
                style={config.style}
                patchStyle={patchStyle}
                title={widget.title ?? ''}
                onTitleChange={(t) => onChange({ title: t })}
                transparentBg={!!widget.transparentBg}
                onTransparentBgChange={(v) => onChange({ transparentBg: v })}
              />
            )}
            {tab === 'jalons' && (
              <JalonsTab
                jalons={config.jalons ?? []}
                thresholds={config.thresholds ?? []}
                onJalonsChange={(j) => patchConfig({ jalons: j })}
                onThresholdsChange={(th) => patchConfig({ thresholds: th })}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Tab: Data Source (split in 2 sub-sections) ---------------- */

function DataSourceTab({
  config, patchData, addMetric, addMetricsFromKeys, addCountersFromKeys, updateMetric, removeMetric, title, onTitleChange,
  kpiOptions, kpisLoading, kpiCatalogForSelector, counterCatalog, dimensionOptions, filtersLoading, onApply, isStat,
  filterCategoriesMap, filterRatsMap,
}: {
  config: ChartWidgetConfig;
  patchData: (p: Partial<ChartWidgetConfig['data']>) => void;
  addMetric: () => void;
  addMetricsFromKeys: (keys: string[]) => void;
  addCountersFromKeys: (keys: string[]) => void;
  updateMetric: (id: string, patch: Partial<ChartMetric>) => void;
  removeMetric: (id: string) => void;
  title: string;
  onTitleChange: (t: string) => void;
  kpiOptions: { key: string; label: string; unit: string }[];
  kpisLoading: boolean;
  kpiCatalogForSelector: KpiCatalogEntry[];
  counterCatalog: any[];
  dimensionOptions: string[];
  filtersLoading: boolean;
  onApply: () => void;
  isStat?: boolean;
  filterCategoriesMap: Record<string, string>;
  filterRatsMap: Record<string, string>;
}) {
  const [sub, setSub] = useState<'kpi' | 'time'>('kpi');
  return (
    <div className="space-y-5">
      {/* Sub-section switcher */}
      <div className="inline-flex p-1 bg-surface-container-low rounded-xl border border-outline-variant/20">
        {([
          { key: 'kpi' as const, label: 'KPI Metrics', count: config.metrics.length },
          { key: 'time' as const, label: 'Time & Filters' },
        ]).map((s) => (
          <button
            key={s.key}
            onClick={() => setSub(s.key)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2',
              sub === s.key
                ? 'bg-white text-primary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            )}
          >
            {s.label}
            {'count' in s && s.count !== undefined && (
              <span className={cn(
                'px-1.5 py-0.5 rounded-md text-[9px] font-black',
                sub === s.key ? 'bg-primary/10 text-primary' : 'bg-outline-variant/20 text-on-surface-variant'
              )}>{s.count}</span>
            )}
          </button>
        ))}
      </div>

      {sub === 'kpi' && (
        <MetricsTab
          metrics={config.metrics}
          addMetric={addMetric}
          addMetricsFromKeys={addMetricsFromKeys}
          addCountersFromKeys={addCountersFromKeys}
          updateMetric={updateMetric}
          removeMetric={removeMetric}
          kpiOptions={kpiOptions}
          kpisLoading={kpisLoading}
          kpiCatalogForSelector={kpiCatalogForSelector}
          counterCatalog={counterCatalog}
        />
      )}
      {sub === 'time' && (
        <DataTab
          data={config.data}
          patchData={patchData}
          title={title}
          onTitleChange={onTitleChange}
          dimensionOptions={dimensionOptions}
          filtersLoading={filtersLoading}
          onApply={onApply}
          isStat={isStat}
          filterCategoriesMap={filterCategoriesMap}
          filterRatsMap={filterRatsMap}
        />
      )}
    </div>
  );
}

/* ---------------- Sub-section: Time & Filters ---------------- */

function DataTab({
  data, patchData, title, onTitleChange, dimensionOptions, filtersLoading, onApply, isStat,
  filterCategoriesMap, filterRatsMap,
}: {
  data: ChartWidgetConfig['data'];
  patchData: (p: Partial<ChartWidgetConfig['data']>) => void;
  title: string;
  onTitleChange: (t: string) => void;
  dimensionOptions: string[];
  filtersLoading: boolean;
  onApply: () => void;
  isStat?: boolean;
  filterCategoriesMap: Record<string, string>;
  filterRatsMap: Record<string, string>;
}) {
  // Default: inherit from the report-level top toolbar.
  const inherits = data.timeRange?.inherit !== false && data.inheritFromDashboard !== false;

  // IMPORTANT: zustand's useSyncExternalStore loops infinitely if the selector
  // returns a fresh object each call ("Maximum update depth exceeded" when
  // clicking Override on a Stat widget — same flaw exists for Chart widgets
  // but only manifests once the Time & Filters tab is opened). Use primitive
  // selectors instead.
  const liveTechnos = usePAGlobalToolbar((s) => s.technos);
  const liveFrom    = usePAGlobalToolbar((s) => s.from);
  const liveTo      = usePAGlobalToolbar((s) => s.to);
  const livePreset  = usePAGlobalToolbar((s) => s.preset);
  const liveGrain   = usePAGlobalToolbar((s) => s.grain);
  const liveFilters = usePAGlobalToolbar((s) => s.filters);
  const applied     = usePAGlobalToolbar((s) => s.applied);
  const toolbar = useMemo(() => ({
    technos: applied?.technos ?? liveTechnos,
    from:    applied?.from    ?? liveFrom,
    to:      applied?.to      ?? liveTo,
    preset:  applied?.preset  ?? livePreset,
    grain:   applied?.grain   ?? liveGrain,
    filters: applied?.filters ?? liveFilters,
  }), [applied, liveTechnos, liveFrom, liveTo, livePreset, liveGrain, liveFilters]);

  const enableOverride = () => {
    patchData({
      inheritFromDashboard: false,
      technos: structuredClone(toolbar.technos),
      filters: structuredClone(toolbar.filters),
      granularity: toolbar.grain,
      timeRange: {
        inherit: false,
        preset: toolbar.preset,
        from: toolbar.from,
        to: toolbar.to,
      },
    });
  };

  const restoreInheritance = () => {
    patchData({
      inheritFromDashboard: true,
      timeRange: { ...data.timeRange, inherit: true },
    });
  };

  return (
    <div className="space-y-4">
      <Section title="Time & Filters">
        {inherits ? (
          <InheritedFromToolbarCard onOverride={enableOverride} isStat={isStat} />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5">
              <div className="flex items-center gap-2 text-[11px] font-bold text-amber-900">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-black">!</span>
                <span>Override actif — ce widget ignore la barre du rapport.</span>
              </div>
              <button
                type="button"
                onClick={restoreInheritance}
                className="text-[10px] font-black uppercase tracking-widest text-amber-900 hover:underline"
              >
                Revenir à l'héritage
              </button>
            </div>
            <TimeFiltersToolbar
              data={data}
              patchData={patchData}
              dimensionOptions={dimensionOptions}
              filtersLoading={filtersLoading}
              onApply={onApply}
              isStat={isStat}
              filterCategoriesMap={filterCategoriesMap}
              filterRatsMap={filterRatsMap}
            />
          </div>
        )}
      </Section>
    </div>
  );
}

/* ---------------- Inherited-from-toolbar summary card ---------------- */

function InheritedFromToolbarCard({ onOverride, isStat }: { onOverride: () => void; isStat?: boolean }) {
  // Read the APPLIED snapshot — widgets inherit from the snapshot frozen at
  // the last "Apply" click on the global toolbar, never from the draft.
  // Falls back to live values when the user has never clicked Apply yet.
  const liveTechnos = usePAGlobalToolbar((s) => s.technos);
  const liveFrom = usePAGlobalToolbar((s) => s.from);
  const liveTo = usePAGlobalToolbar((s) => s.to);
  const livePreset = usePAGlobalToolbar((s) => s.preset);
  const liveGrain = usePAGlobalToolbar((s) => s.grain);
  const liveFilters = usePAGlobalToolbar((s) => s.filters);
  const liveVendors = usePAGlobalToolbar((s) => s.vendors);
  const applied = usePAGlobalToolbar((s) => s.applied);

  const technos = applied?.technos ?? liveTechnos;
  const from = applied?.from ?? liveFrom;
  const to = applied?.to ?? liveTo;
  const preset = applied?.preset ?? livePreset;
  const grain = applied?.grain ?? liveGrain;
  const vendors = applied?.vendors ?? liveVendors;
  const baseFilters = applied?.filters ?? liveFilters;
  // `applied.filters` already contains synthetic Vendor chips (injected by the
  // store's apply()). Avoid duplicating them; only add vendors when previewing
  // the live draft (no Apply yet).
  const alreadyHasVendor = baseFilters.some((f) => (f.dimension || '').toLowerCase() === 'vendor');
  const filters: ChartFilterChip[] = alreadyHasVendor || vendors.length === 0
    ? baseFilters
    : [
        ...baseFilters,
        ...vendors.map((v) => ({ id: `pa-toolbar-vendor-${v}`, dimension: 'Vendor', value: v })),
      ];

  const fmt = (iso: string) => {
    if (!iso) return '—';
    const [d, t = '00:00'] = iso.split('T');
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y} ${t.slice(0, 5)}`;
  };

  return (
    <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/[0.03] p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Filter className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h5 className="text-sm font-black text-on-surface font-headline">Hérite du rapport</h5>
            <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug max-w-md">
              Ce widget utilise automatiquement la <strong>barre Time &amp; Filters</strong> en haut du rapport.
              Cliquez sur <em>Override</em> pour personnaliser uniquement ce graphique.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOverride}
          className="shrink-0 h-8 px-3 rounded-full bg-white border border-primary/40 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/5 transition-colors"
        >
          Override
        </button>
      </div>

      {/* Live read-only summary of inherited values */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-1 pt-2 border-t border-primary/10">
        {!isStat && (
          <SummaryRow label="Périmètre" value={
            technos.length === 0
              ? <span className="italic text-on-surface-variant/70">aucune techno</span>
              : <span className="flex flex-wrap gap-1">{technos.map(t => (
                  <span key={t} className="px-1.5 h-5 inline-flex items-center justify-center rounded-md text-[10px] font-black tracking-wide bg-primary/15 text-primary">{t.toUpperCase()}</span>
                ))}</span>
          } />
        )}
        {!isStat && (
          <SummaryRow label="Période" value={`${preset.toUpperCase()} · ${grain}`} />
        )}
        <SummaryRow label="Du" value={fmt(from)} />
        <SummaryRow label="Au" value={fmt(to)} />
        <div className="col-span-2">
          <SummaryRow label="Filtres" value={
            filters.length === 0
              ? <span className="italic text-on-surface-variant/70">aucun filtre</span>
              : <span className="flex flex-wrap gap-1">{filters.map(f => (
                  <span key={f.id} className="px-2 h-5 inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold">{f.dimension}: {f.value}</span>
                ))}</span>
          } />
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/70 w-20 shrink-0">{label}</span>
      <span className="font-bold text-on-surface">{value}</span>
    </div>
  );
}



/* ---------------- Time & Filters Toolbar (embedded in panel) ---------------- */

const TF_TECHS: { id: TechnoId; label: string; bg: string; text: string }[] = [
  { id: '2g', label: '2G', bg: 'bg-violet-500', text: 'text-white' },
  { id: '3g', label: '3G', bg: 'bg-amber-400', text: 'text-amber-950' },
  { id: '4g', label: '4G', bg: 'bg-orange-500', text: 'text-white' },
  { id: '5g', label: '5G', bg: 'bg-emerald-500', text: 'text-white' },
];

const TF_PERIODS: { id: PeriodPreset; label: string; days?: number }[] = [
  { id: '1j', label: '1 jour', days: 1 },
  { id: '3j', label: '3 jours', days: 3 },
  { id: '7j', label: '7 jours', days: 7 },
  { id: '14j', label: '14 jours', days: 14 },
  { id: '30j', label: '30 jours', days: 30 },
  { id: 'custom', label: 'Personnalisé' },
];

const TF_GRAINS: { id: GrainOption; label: string }[] = [
  { id: '5min', label: '5 min' },
  { id: '15min', label: '15 min' },
  { id: '30min', label: '30 min' },
  { id: '1h', label: '1 h' },
  { id: '1d', label: '1 j' },
];

function TFPill({
  icon, children, className, onClick, as = 'div',
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  as?: 'div' | 'button';
}) {
  const Comp: any = as;
  return (
    <Comp
      onClick={onClick}
      type={as === 'button' ? 'button' : undefined}
      className={cn(
        'flex items-center gap-2 h-9 px-3 rounded-full bg-white border border-outline-variant/30 shadow-[0_1px_2px_rgba(0,0,0,0.04)] text-xs font-bold text-on-surface',
        as === 'button' && 'hover:border-primary hover:text-primary cursor-pointer transition-colors',
        className,
      )}
    >
      {icon}
      {children}
    </Comp>
  );
}

function formatDateDisplay(iso: string): { date: string; time: string } {
  if (!iso) return { date: '—', time: '' };
  const [d, t = '00:00'] = iso.split('T');
  const [y, m, day] = d.split('-');
  return { date: `${day}/${m}/${y}`, time: t.slice(0, 5) };
}

function TimeFiltersToolbar({
  data, patchData, dimensionOptions, filtersLoading, onApply, isStat,
  filterCategoriesMap, filterRatsMap,
}: {
  data: ChartWidgetConfig['data'];
  patchData: (p: Partial<ChartWidgetConfig['data']>) => void;
  dimensionOptions: string[];
  filtersLoading: boolean;
  onApply: () => void;
  isStat?: boolean;
  filterCategoriesMap: Record<string, string>;
  filterRatsMap: Record<string, string>;
}) {
  const technos = data.technos ?? [];
  const filters = data.filters ?? [];
  const tr = data.timeRange;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftDim, setDraftDim] = useState('');
  const [draftVal, setDraftVal] = useState('');

  const toggleTechno = (id: TechnoId) => {
    const next = technos.includes(id) ? technos.filter(t => t !== id) : [...technos, id];
    patchData({ technos: next });
  };

  const setPreset = (preset: PeriodPreset) => {
    const cfg = TF_PERIODS.find(p => p.id === preset);
    if (preset !== 'custom' && cfg?.days) {
      const to = new Date(tr.to || new Date().toISOString());
      const from = new Date(to.getTime() - cfg.days * 86400000);
      patchData({
        timeRange: {
          ...tr,
          preset,
          from: formatLocalDateTimeInput(from),
          to: formatLocalDateTimeInput(to),
        },
      });
    } else {
      patchData({ timeRange: { ...tr, preset } });
    }
  };

  const setFromDate = (v: string) => patchData({ timeRange: { ...tr, from: v, preset: 'custom' } });
  const setToDate = (v: string) => patchData({ timeRange: { ...tr, to: v, preset: 'custom' } });
  const setGrain = (g: GrainOption) => patchData({ granularity: g });

  const removeFilter = (id: string) =>
    patchData({ filters: filters.filter(f => f.id !== id) });
  const clearFilters = () => patchData({ filters: [] });
  const addFilter = () => {
    if (!draftDim || !draftVal.trim()) return;
    const next: ChartFilterChip[] = [
      ...filters,
      { id: `f-${Date.now()}`, dimension: draftDim, value: draftVal.trim() },
    ];
    patchData({ filters: next });
    setDraftDim('');
    setDraftVal('');
    setPickerOpen(false);
  };

  const fromDisp = formatDateDisplay(tr.from);
  const toDisp = formatDateDisplay(tr.to);
  const periodLabel = TF_PERIODS.find(p => p.id === tr.preset)?.label.replace(' jour', 'j').replace(' jours', 'j').replace('Personnalisé', 'Custom') ?? '—';
  const grainLabel = TF_GRAINS.find(g => g.id === data.granularity)?.label ?? data.granularity;

  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/40 overflow-visible">
      {/* Scope / date row */}
      <div className="px-4 py-3 flex flex-wrap items-center gap-2.5 border-b border-outline-variant/10">
        {/* Périmètre — interactive techno toggles (hidden for STAT widgets) */}
        {!isStat && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 h-9 px-3 rounded-full bg-white border border-outline-variant/30 shadow-[0_1px_2px_rgba(0,0,0,0.04)] text-xs font-bold text-on-surface hover:border-primary hover:text-primary transition-colors"
            >
              <Filter className="w-3.5 h-3.5 text-on-surface-variant" />
              <span className="text-on-surface-variant uppercase tracking-wide text-[11px]">Périmètre</span>
              <div className="flex items-center gap-1 ml-1">
                {TF_TECHS.filter(t => technos.includes(t.id)).map(t => (
                  <span key={t.id} className={cn('px-1.5 h-5 inline-flex items-center justify-center rounded-md text-[10px] font-black tracking-wide', t.bg, t.text)}>
                    {t.label}
                  </span>
                ))}
                {technos.length === 0 && (
                  <span className="text-[10px] italic text-on-surface-variant">aucune</span>
                )}
              </div>
              <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-black">{technos.length}</span>
              <ChevronDown className="w-3 h-3 text-on-surface-variant" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant px-2 py-1.5">Sélectionner technologies</p>
            <div className="space-y-0.5">
              {TF_TECHS.map(t => {
                const active = technos.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTechno(t.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-bold transition-colors',
                      active ? 'bg-primary/10 text-primary' : 'text-on-surface hover:bg-surface-container-low'
                    )}
                  >
                    <span className={cn('w-4 h-4 rounded border-2 flex items-center justify-center shrink-0', active ? 'border-primary bg-primary' : 'border-outline-variant/40 bg-white')}>
                      {active && <Check className="w-3 h-3 text-on-primary" />}
                    </span>
                    <span className={cn('px-1.5 h-5 inline-flex items-center justify-center rounded-md text-[10px] font-black tracking-wide', t.bg, t.text)}>
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
        )}

        {/* Date range — unified Investigator-style dual calendar */}
        <DateRangePopover
          from={tr.from}
          to={tr.to}
          onChange={(f, t) => patchData({ timeRange: { ...tr, from: f, to: t, preset: 'custom' } })}
        />

        {/* Période preset */}
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="flex items-center gap-2 h-9 px-3 rounded-full bg-white border border-outline-variant/30 shadow-[0_1px_2px_rgba(0,0,0,0.04)] text-xs font-bold text-on-surface hover:border-primary hover:text-primary transition-colors">
              <Clock className="w-3.5 h-3.5 text-on-surface-variant" />
              <span className="text-on-surface-variant uppercase tracking-wide text-[11px]">Période</span>
              <span className="font-black">{periodLabel}</span>
              <ChevronDown className="w-3 h-3 text-on-surface-variant" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1" align="start">
            {TF_PERIODS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors',
                  tr.preset === p.id ? 'bg-primary/10 text-primary' : 'text-on-surface hover:bg-surface-container-low'
                )}
              >
                {p.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Grain (hidden for STAT widgets) */}
        {!isStat && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="flex items-center gap-2 h-9 px-3 rounded-full bg-white border border-outline-variant/30 shadow-[0_1px_2px_rgba(0,0,0,0.04)] text-xs font-bold text-on-surface hover:border-primary transition-colors">
              <span className="text-emerald-600 uppercase tracking-wide text-[11px]">Grain :</span>
              <span className="text-emerald-700 font-black">{grainLabel}</span>
              <ChevronDown className="w-3 h-3 text-emerald-600" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-36 p-1" align="start">
            {TF_GRAINS.map(g => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGrain(g.id)}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors',
                  data.granularity === g.id ? 'bg-emerald-50 text-emerald-700' : 'text-on-surface hover:bg-surface-container-low'
                )}
              >
                {g.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
        )}

        <TFPill icon={<Flag className="w-3.5 h-3.5 text-rose-500" />}>
          <span className="text-on-surface-variant uppercase tracking-wide text-[11px]">Jalons</span>
          <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-black">2</span>
        </TFPill>

        <div className="ml-auto">
          <button
            type="button"
            onClick={onApply}
            className="h-9 px-6 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest shadow-[0_4px_14px_rgba(16,185,129,0.35)] active:scale-95 transition-all"
          >
            Appliquer
          </button>
        </div>
      </div>

      {/* Filters row — Investigator-style multi-value chips */}
      <PAFilterChips
        filters={filters}
        onChange={(next) => patchData({ filters: next })}
        filterDimensions={dimensionOptions}
        filtersLoading={filtersLoading}
        filterCategories={filterCategoriesMap}
        filterRats={filterRatsMap}
      />
    </div>
  );
}

/* ---------------- Live mini-preview for a single metric ---------------- */

function MetricPreview({ metric }: { metric: ChartMetric }) {
  // Generate a simple, deterministic wave so the preview stays stable across renders.
  const points = useMemo(() => {
    const n = 24;
    const arr: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const y = 22 + Math.sin(t * Math.PI * 2.2) * 10 + Math.cos(t * 6) * 3;
      arr.push({ x: t * 100, y });
    }
    return arr;
  }, []);

  const path = useMemo(() => {
    if (metric.smooth) {
      // Cubic smoothing (Catmull-Rom-ish)
      const d: string[] = [`M ${points[0].x} ${points[0].y}`];
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] ?? points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] ?? p2;
        const c1x = p1.x + (p2.x - p0.x) / 6;
        const c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6;
        const c2y = p2.y - (p3.y - p1.y) / 6;
        d.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`);
      }
      return d.join(' ');
    }
    return points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
  }, [points, metric.smooth]);

  const dasharray =
    metric.lineStyle === 'dashed' ? '4 3' :
    metric.lineStyle === 'dotted' ? '1 3' :
    undefined;

  const fillPath = `${path} L 100 50 L 0 50 Z`;

  return (
    <div className="rounded-xl border border-outline-variant/20 bg-white p-2 flex flex-col gap-1.5">
      <div className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/70">Preview</div>
      <svg viewBox="0 0 100 50" preserveAspectRatio="none" className="w-full h-16 rounded-lg bg-surface-container-low/40">
        {metric.fillArea && (
          <path d={fillPath} fill={metric.color} opacity={0.18} />
        )}
        <path
          d={path}
          fill="none"
          stroke={metric.color}
          strokeWidth={metric.lineWidth ?? 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dasharray}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex items-center justify-between text-[9px] font-bold text-on-surface-variant/70">
        <span className="truncate">{metric.alias || metric.kpiKey}</span>
        <span className="uppercase tracking-wider">{metric.axis}</span>
      </div>
    </div>
  );
}

/* ---------------- Section: Metrics (inside Data Source tab) ---------------- */

function MetricsTab({
  metrics, addMetric, addMetricsFromKeys, addCountersFromKeys, updateMetric, removeMetric,
  kpiOptions, kpisLoading, kpiCatalogForSelector, counterCatalog,
}: {
  metrics: ChartMetric[];
  addMetric: () => void;
  addMetricsFromKeys: (keys: string[]) => void;
  addCountersFromKeys: (keys: string[]) => void;
  updateMetric: (id: string, patch: Partial<ChartMetric>) => void;
  removeMetric: (id: string) => void;
  kpiOptions: { key: string; label: string; unit: string }[];
  kpisLoading: boolean;
  kpiCatalogForSelector: KpiCatalogEntry[];
  counterCatalog: any[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [kpiPickerOpen, setKpiPickerOpen] = useState(false);
  const [counterPickerOpen, setCounterPickerOpen] = useState(false);

  // Perimeter from the global toolbar (applied snapshot wins, live fallback) —
  // drives the perimeter-aware filtering in CounterSelectorModal.
  const liveTechnos = usePAGlobalToolbar((s) => s.technos);
  const liveVendors = usePAGlobalToolbar((s) => s.vendors);
  const applied = usePAGlobalToolbar((s) => s.applied);
  const perimeterTechnos = applied?.technos ?? liveTechnos ?? [];
  const perimeterVendors = applied?.vendors ?? liveVendors ?? [];

  const selectedKeys = useMemo(() => metrics.map(m => m.kpiKey), [metrics]);
  const counterKeys = useMemo(() => new Set(counterCatalog.map((c: any) => c.counter_name)), [counterCatalog]);
  const selectedKpiKeys = useMemo(() => selectedKeys.filter(k => !counterKeys.has(k)), [selectedKeys, counterKeys]);
  const selectedCounterKeys = useMemo(() => selectedKeys.filter(k => counterKeys.has(k)), [selectedKeys, counterKeys]);

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-2 min-w-0">
          <span className="truncate">Metrics · {metrics.length}</span>
          {kpisLoading && <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />}
          {!kpisLoading && kpiCatalogForSelector.length > 0 && (
            <span className="text-[8px] font-bold text-primary/70 normal-case tracking-wide truncate">
              · {kpiCatalogForSelector.length} KPIs · {counterCatalog.length} compteurs
            </span>
          )}
        </h4>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setCounterPickerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-emerald-500/40 text-emerald-600 text-xs font-bold hover:bg-emerald-500/10 transition-colors whitespace-nowrap"
          >
            <Cpu className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Add</span> Counter
          </button>
          <button
            onClick={() => setKpiPickerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Add</span> KPI
          </button>
        </div>
      </div>

      {createPortal(
        <KpiSelectorModal
          open={kpiPickerOpen}
          onClose={() => setKpiPickerOpen(false)}
          catalog={kpiCatalogForSelector}
          selectedKeys={selectedKpiKeys}
          onConfirm={(keys) => {
            const existing = new Set(selectedKeys);
            const toAdd = keys.filter(k => !existing.has(k));
            if (toAdd.length > 0) addMetricsFromKeys(toAdd);
            setKpiPickerOpen(false);
          }}
        />,
        document.body
      )}

      <CounterSelectorModal
        open={counterPickerOpen}
        onClose={() => setCounterPickerOpen(false)}
        catalog={counterCatalog}
        selectedKeys={selectedCounterKeys}
        onConfirm={(keys) => {
          const existing = new Set(selectedKeys);
          const toAdd = keys.filter(k => !existing.has(k));
          if (toAdd.length > 0) addCountersFromKeys(toAdd);
          setCounterPickerOpen(false);
        }}
        perimeterVendor={perimeterVendors.length === 1 ? perimeterVendors[0] : perimeterVendors}
        perimeterTechno={perimeterTechnos.length === 1 ? perimeterTechnos[0] : perimeterTechnos}
      />

      {/* Selected KPI list — always visible below Add area */}
      <div className="space-y-2">
        {metrics.length > 0 && (
          <div className="flex items-center justify-between px-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/70">
              Selected · {metrics.length}
            </span>
            <span className="text-[9px] font-bold text-on-surface-variant/50">
              Click Edit to customize
            </span>
          </div>
        )}

        {metrics.map((m) => {
          const expanded = expandedId === m.id;
          const kpiLabel = kpiOptions.find(o => o.key === m.kpiKey)?.label ?? m.kpiKey;
          const isCounter = counterKeys.has(m.kpiKey);
          return (
            <div
              key={m.id}
              data-kpi-card
              className={cn(
                'group border rounded-xl bg-white transition-all min-w-0 overflow-hidden',
                expanded
                  ? 'border-primary/50 shadow-md ring-1 ring-primary/20'
                  : 'border-outline-variant/25 hover:border-primary/30 hover:shadow-sm'
              )}
            >
              {/* Always-visible row: name + actions on row 1, badges on row 2 (wrap on narrow) */}
              <div className="px-3 py-2.5 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <GripVertical className="w-3.5 h-3.5 text-on-surface-variant/30 shrink-0 cursor-grab" />

                  {/* Color indicator */}
                  <span
                    className="w-3.5 h-3.5 rounded-full ring-2 ring-white shadow-sm shrink-0"
                    style={{ background: m.color }}
                    aria-label="Color indicator"
                  />

                  {/* KPI name + counter tag (truncates) */}
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="font-bold text-sm text-on-surface truncate" title={m.alias || kpiLabel}>
                      {m.alias || kpiLabel}
                    </span>
                    {isCounter && (
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 shrink-0">
                        Counter
                      </span>
                    )}
                  </div>

                  {/* Right-side actions cluster (always reachable) */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Inline Axis side toggle (Left / Right) — pure display, no backend impact */}
                    <div className="flex items-center rounded-md border border-outline-variant/40 bg-white overflow-hidden">
                      {(['left', 'right'] as const).map((side) => {
                        const active = (m.axis ?? 'left') === side;
                        return (
                          <button
                            key={side}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); updateMetric(m.id, { axis: side }); }}
                            className={cn(
                              'px-1.5 py-1 text-[9px] font-black uppercase tracking-wider transition-colors',
                              active
                                ? 'bg-primary text-on-primary'
                                : 'text-on-surface-variant hover:bg-surface-container-low'
                            )}
                            title={`Plot on ${side} Y axis`}
                            aria-label={`Use ${side} axis`}
                            aria-pressed={active}
                          >
                            {side === 'left' ? 'L' : 'R'}
                          </button>
                        );
                      })}
                    </div>

                    {/* Inline Split By — always visible so users can split without expanding the card */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border transition-colors',
                            m.splitBy && m.splitBy !== '__none__'
                              ? 'bg-violet-500/10 text-violet-700 border-violet-500/30'
                              : 'bg-white text-on-surface-variant border-outline-variant/40 hover:border-violet-400/40 hover:text-violet-700'
                          )}
                          title="Split this KPI into one series per dimension value"
                        >
                          <span>Split: {m.splitBy && m.splitBy !== '__none__' ? m.splitBy : 'None'}</span>
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-44 p-1" align="end">
                        {SPLIT_OPTIONS.map(opt => {
                          const v = opt === '__none__' ? null : opt;
                          const label = opt === '__none__' ? 'None (aggregate)' : opt;
                          const active = (m.splitBy ?? null) === v;
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); updateMetric(m.id, { splitBy: v }); }}
                              className={cn(
                                'w-full text-left px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors',
                                active ? 'bg-violet-500/10 text-violet-700' : 'text-on-surface hover:bg-surface-container-low'
                              )}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </PopoverContent>
                    </Popover>

                    <button
                      onClick={() => updateMetric(m.id, { visible: !m.visible })}
                      className="p-1.5 hover:bg-surface-container-high rounded-md transition-colors"
                      aria-label="Toggle visibility"
                      title={m.visible ? 'Hide' : 'Show'}
                    >
                      {m.visible
                        ? <Eye className="w-3.5 h-3.5 text-on-surface-variant" />
                        : <EyeOff className="w-3.5 h-3.5 text-on-surface-variant/40" />}
                    </button>

                    <button
                      onClick={() => setExpandedId(expanded ? null : m.id)}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-colors',
                        expanded
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface-container-low text-on-surface hover:bg-primary/10 hover:text-primary'
                      )}
                      aria-label="Edit metric"
                    >
                      {expanded
                        ? <ChevronDown className="w-3 h-3" />
                        : <ChevronRight className="w-3 h-3" />}
                      Edit
                    </button>

                    <button
                      onClick={() => removeMetric(m.id)}
                      className="p-1.5 hover:bg-error/10 rounded-md transition-colors"
                      aria-label="Remove metric"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-error" />
                    </button>
                  </div>
                </div>

                {/* Badge row — wraps cleanly on narrow widths instead of overflowing */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-7">
                  <span
                    className={cn(
                      'inline-flex items-center text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded',
                      m.axis === 'left'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-amber-500/10 text-amber-700'
                    )}
                    title={`Axis: ${m.axis}`}
                  >
                    Axis: {m.axis}
                  </span>
                  <span
                    className="inline-flex items-center text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant"
                    title={`Type: ${m.graphType ?? 'line'}`}
                  >
                    {m.graphType ?? 'line'}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant"
                    title={`Style: ${m.lineStyle}`}
                  >
                    <span
                      className={cn(
                        'w-3 h-0.5 rounded-full',
                        m.lineStyle === 'dashed' ? 'border-t-2 border-dashed border-on-surface-variant bg-transparent h-0' : 'bg-on-surface-variant'
                      )}
                    />
                    {m.lineStyle}
                  </span>
                  {m.splitBy && m.splitBy !== '__none__' && (
                    <span
                      className="inline-flex items-center text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-700"
                      title={`Split by ${m.splitBy} — one series per value`}
                    >
                      Split: {m.splitBy}
                    </span>
                  )}
                </div>
              </div>

              {expanded && (
                <div className="px-4 pb-4 pt-3 border-t border-outline-variant/15 animate-in fade-in slide-in-from-top-1 duration-150">
                  {/* Top: live preview + KPI info */}
                  <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-3 mb-3">
                    <MetricPreview metric={m} />
                    <div className="space-y-2">
                      <Field label={`KPI ${kpiOptions.length > 0 ? `· ${kpiOptions.length}` : ''}`}>
                        <KpiCombobox
                          value={m.kpiKey}
                          options={kpiOptions}
                          loading={kpisLoading}
                          onSelect={(opt) => updateMetric(m.id, { kpiKey: opt.key, alias: opt.label, unit: opt.unit })}
                        />
                      </Field>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Alias">
                          <input
                            value={m.alias ?? ''}
                            onChange={(e) => updateMetric(m.id, { alias: e.target.value })}
                            placeholder="Display name"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-outline-variant/30 bg-white text-xs"
                          />
                        </Field>
                        <Field label="Unit">
                          <input
                            value={m.unit ?? ''}
                            onChange={(e) => updateMetric(m.id, { unit: e.target.value })}
                            placeholder="auto"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-outline-variant/30 bg-white text-xs"
                          />
                        </Field>
                      </div>
                    </div>
                  </div>

                  {/* Section: Style */}
                  <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/40 p-3 mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Style</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateMetric(m.id, {
                            color: COLOR_PALETTE[0],
                            lineStyle: 'solid',
                            lineWidth: 2,
                            smooth: false,
                            fillArea: false,
                          });
                        }}
                        className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
                        title="Reset style"
                      >
                        Reset style
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Field label="Color">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className="w-9 h-9 rounded-lg ring-2 ring-white shadow-md shrink-0"
                            style={{ background: m.color }}
                            title={m.color}
                          />
                          <label
                            className="flex-1 flex items-center gap-1.5 border border-outline-variant/30 rounded-lg px-2 py-1.5 bg-white cursor-pointer hover:border-primary/40 transition-colors"
                            title="Pick a custom color"
                          >
                            <Palette className="w-3.5 h-3.5 text-on-surface-variant" />
                            <input
                              type="color"
                              value={m.color}
                              onChange={(e) => updateMetric(m.id, { color: e.target.value })}
                              className="sr-only"
                            />
                            <input
                              type="text"
                              value={m.color}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) updateMetric(m.id, { color: v });
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 text-[11px] font-mono text-on-surface bg-transparent outline-none uppercase"
                            />
                          </label>
                        </div>
                        <div className="grid grid-cols-8 gap-1.5">
                          {COLOR_PALETTE.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                updateMetric(m.id, { color: c });
                              }}
                              className={cn(
                                'aspect-square rounded-md transition-all hover:scale-110 cursor-pointer',
                                m.color === c
                                  ? 'ring-2 ring-on-surface ring-offset-1 scale-105'
                                  : 'ring-1 ring-outline-variant/30'
                              )}
                              style={{ background: c }}
                              aria-label={`Color ${c}`}
                              title={c}
                            />
                          ))}
                        </div>
                      </Field>

                      <div className="space-y-2">
                        <Field label="Line style">
                          <div className="flex border border-outline-variant/30 rounded-lg overflow-hidden bg-white">
                            {(['solid', 'dashed', 'dotted'] as LineStyle[]).map(style => {
                              const active = m.lineStyle === style;
                              return (
                                <button
                                  key={style}
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); updateMetric(m.id, { lineStyle: style }); }}
                                  title={style}
                                  className={cn(
                                    'flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors',
                                    active ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-low'
                                  )}
                                >
                                  <span
                                    className={cn(
                                      'inline-block w-6',
                                      style === 'solid' && 'border-t-2 border-current',
                                      style === 'dashed' && 'border-t-2 border-dashed border-current',
                                      style === 'dotted' && 'border-t-2 border-dotted border-current',
                                    )}
                                  />
                                  {style}
                                </button>
                              );
                            })}
                          </div>
                        </Field>

                        <Field label={`Thickness · ${m.lineWidth ?? 2}px`}>
                          <input
                            type="range"
                            min={1}
                            max={4}
                            step={1}
                            value={m.lineWidth ?? 2}
                            onChange={(e) => updateMetric(m.id, { lineWidth: Number(e.target.value) })}
                            className="w-full accent-primary"
                          />
                        </Field>
                      </div>
                    </div>
                  </div>

                  {/* Section: Axis & Display */}
                  <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/40 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">Axis & Display</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                      <Field label="Axis">
                        <div className="flex border border-outline-variant/30 rounded-lg overflow-hidden bg-white">
                          {(['left', 'right'] as AxisSide[]).map(side => (
                            <button
                              key={side}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); updateMetric(m.id, { axis: side }); }}
                              className={cn(
                                'flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors',
                                m.axis === side ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-low'
                              )}
                            >
                              {side}
                            </button>
                          ))}
                        </div>
                      </Field>

                      <Field label="Type">
                        <div className="grid grid-cols-3 gap-1 border border-outline-variant/30 rounded-lg p-1 bg-white">
                          {([
                            { v: 'line',        l: 'Line' },
                            { v: 'area',        l: 'Area' },
                            { v: 'bar',         l: 'Bar' },
                            { v: 'stackedBar',  l: 'Stack Bar' },
                            { v: 'stackedArea', l: 'Stack Area' },
                            { v: 'stepLine',    l: 'Step' },
                          ] as { v: ChartType; l: string }[]).map(({ v, l }) => {
                            const active = (m.graphType ?? 'line') === v;
                            return (
                              <button
                                key={v}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateMetric(m.id, { graphType: v }); }}
                                className={cn(
                                  'py-1.5 px-1 text-[9px] font-bold uppercase tracking-wider rounded-md transition-colors',
                                  active ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-low'
                                )}
                              >
                                {l}
                              </button>
                            );
                          })}
                        </div>
                      </Field>

                      <Field label="Smoothing">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); updateMetric(m.id, { smooth: !m.smooth }); }}
                          className={cn(
                            'w-full py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-colors',
                            m.smooth
                              ? 'bg-primary text-on-primary border-primary'
                              : 'bg-white text-on-surface-variant border-outline-variant/30 hover:border-primary/30'
                          )}
                        >
                          {m.smooth ? 'On' : 'Off'}
                        </button>
                      </Field>

                      <Field label="Fill area">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); updateMetric(m.id, { fillArea: !m.fillArea }); }}
                          className={cn(
                            'w-full py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-colors',
                            m.fillArea
                              ? 'bg-primary text-on-primary border-primary'
                              : 'bg-white text-on-surface-variant border-outline-variant/30 hover:border-primary/30'
                          )}
                        >
                          {m.fillArea ? 'On' : 'Off'}
                        </button>
                      </Field>

                      <Field label="Split by">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="w-full flex items-center justify-between gap-1 py-2 px-2.5 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-outline-variant/30 bg-white text-on-surface hover:border-primary/30 transition-colors"
                              title="Split this KPI into one series per dimension value"
                            >
                              <span className="truncate">{m.splitBy && m.splitBy !== '__none__' ? m.splitBy : 'None'}</span>
                              <ChevronDown className="w-3 h-3 shrink-0" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-40 p-1" align="end">
                            {SPLIT_OPTIONS.map(opt => {
                              const v = opt === '__none__' ? null : opt;
                              const label = opt === '__none__' ? 'None (aggregate)' : opt;
                              const active = (m.splitBy ?? null) === v;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); updateMetric(m.id, { splitBy: v }); }}
                                  className={cn(
                                    'w-full text-left px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors',
                                    active ? 'bg-primary/10 text-primary' : 'text-on-surface hover:bg-surface-container-low'
                                  )}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </PopoverContent>
                        </Popover>
                      </Field>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {metrics.length === 0 && (
          <div className="border border-dashed border-outline-variant/30 rounded-xl py-12 flex flex-col items-center gap-3">
            <p className="text-xs text-on-surface-variant">No metrics yet</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCounterPickerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-emerald-500/40 text-emerald-600 text-xs font-bold hover:bg-emerald-500/10"
              >
                <Cpu className="w-3.5 h-3.5" /> Add Counter
              </button>
              <button
                onClick={() => setKpiPickerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-bold hover:bg-primary/90"
              >
                <Plus className="w-3.5 h-3.5" /> Add your first KPI
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Tab: Appearance ---------------- */

function StyleTab({
  style, patchStyle, title, onTitleChange, transparentBg, onTransparentBgChange,
}: {
  style: ChartWidgetConfig['style'];
  patchStyle: (p: Partial<ChartWidgetConfig['style']>) => void;
  title: string;
  onTitleChange: (t: string) => void;
  transparentBg: boolean;
  onTransparentBgChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-6">
      <Section title="Widget Header">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="e.g. Throughput DL — Last 24h"
            className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-white text-sm text-on-surface focus:outline-none focus:border-primary"
          />
        </Field>
      </Section>
      <Section title="Chart type">
        <div className="grid grid-cols-3 gap-2">
          {(['line', 'area', 'bar'] as ChartType[]).map(t => (
            <button
              key={t}
              onClick={() => patchStyle({ chartType: t })}
              className={cn(
                'py-2 rounded-lg text-xs font-bold border capitalize transition-colors',
                style.chartType === t
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-white border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'
              )}
            >
              {t}
            </button>
          ))}
        </div>
        {/* Stacked toggle — only meaningful for bar / area. Lines stay overlaid trends. */}
        {(style.chartType === 'bar' || style.chartType === 'area') && (
          <div className="mt-3">
            <ToggleRow
              label={style.chartType === 'bar' ? 'Stacked bars (cumulative)' : 'Stacked area (cumulative)'}
              checked={!!style.stacked}
              onChange={(v) => patchStyle({ stacked: v })}
            />
            <p className="mt-1 text-[10px] text-on-surface-variant leading-snug">
              {style.stacked
                ? 'Series are stacked to show total contribution. Best when units are comparable.'
                : 'Series are drawn side-by-side / overlaid. Switch on for cumulative views.'}
            </p>
          </div>
        )}
      </Section>

      <Section title="Lines">
        <Field label={`Thickness · ${style.lineThickness}px`}>
          <input
            type="range" min={1} max={5} step={0.5}
            value={style.lineThickness}
            onChange={(e) => patchStyle({ lineThickness: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </Field>
        <ToggleRow
          label="Smooth lines"
          checked={style.smooth}
          onChange={(v) => patchStyle({ smooth: v })}
        />
      </Section>

      <Section title="Fill">
        <div className="grid grid-cols-3 gap-2">
          {(['none', 'gradient', 'solid'] as FillStyle[]).map(f => (
            <button
              key={f}
              onClick={() => patchStyle({ fill: f })}
              className={cn(
                'py-2 rounded-lg text-xs font-bold border capitalize transition-colors',
                style.fill === f
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-white border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <Field label={`Opacity · ${style.opacity}%`}>
            <input
              type="range" min={0} max={100} step={5}
              value={style.opacity}
              onChange={(e) => patchStyle({ opacity: Number(e.target.value) })}
              className="w-full accent-primary"
              disabled={style.fill === 'none'}
            />
          </Field>
        </div>
      </Section>

      <Section title="Background">
        <div className="grid grid-cols-3 gap-2">
          {(['transparent', 'light', 'dark'] as BackgroundStyle[]).map(b => (
            <button
              key={b}
              onClick={() => patchStyle({ background: b })}
              className={cn(
                'py-2 rounded-lg text-xs font-bold border capitalize transition-colors',
                style.background === b
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-white border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'
              )}
            >
              {b}
            </button>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-outline-variant/20">
          <Field label="Card background">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onTransparentBgChange(false)}
                className={cn(
                  'py-2.5 rounded-lg text-xs font-bold border transition-colors',
                  !transparentBg ? 'bg-primary text-on-primary border-primary' : 'bg-white border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'
                )}
              >
                ◆ Card BG
              </button>
              <button
                onClick={() => onTransparentBgChange(true)}
                className={cn(
                  'py-2.5 rounded-lg text-xs font-bold border transition-colors',
                  transparentBg ? 'bg-primary text-on-primary border-primary' : 'bg-white border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'
                )}
              >
                ◇ Transparent
              </button>
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Grid & Legend">
        <ToggleRow
          label="Show grid"
          checked={style.grid}
          onChange={(v) => patchStyle({ grid: v })}
        />
        <Field label="Legend position">
          <div className="grid grid-cols-3 gap-2">
            {(['top', 'bottom', 'right'] as LegendPosition[]).map(p => (
              <button
                key={p}
                onClick={() => patchStyle({ legend: { ...style.legend, position: p } })}
                className={cn(
                  'py-1.5 rounded-lg text-xs font-bold border capitalize transition-colors',
                  style.legend.position === p
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-white border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </Field>
        <ToggleRow
          label="Show values in legend"
          checked={style.legend.showValues}
          onChange={(v) => patchStyle({ legend: { ...style.legend, showValues: v } })}
        />
      </Section>
    </div>
  );
}

/* ---------------- Tab: Jalons & Seuils ---------------- */

const JALON_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ec4899'];

function JalonsTab({
  jalons, thresholds, onJalonsChange, onThresholdsChange,
}: {
  jalons: ChartJalon[];
  thresholds: ChartThreshold[];
  onJalonsChange: (j: ChartJalon[]) => void;
  onThresholdsChange: (t: ChartThreshold[]) => void;
}) {
  const addJalon = () => {
    const j: ChartJalon = {
      id: `j-${Date.now()}`,
      label: `Jalon ${jalons.length + 1}`,
      date: new Date().toISOString().slice(0, 10),
      color: JALON_COLORS[jalons.length % JALON_COLORS.length],
    };
    onJalonsChange([...jalons, j]);
  };
  const updateJalon = (id: string, patch: Partial<ChartJalon>) =>
    onJalonsChange(jalons.map(j => j.id === id ? { ...j, ...patch } : j));
  const removeJalon = (id: string) => onJalonsChange(jalons.filter(j => j.id !== id));

  const addThreshold = () => {
    const t: ChartThreshold = {
      id: `t-${Date.now()}`,
      label: `Seuil ${thresholds.length + 1}`,
      value: 0,
      axis: 'left',
      color: JALON_COLORS[thresholds.length % JALON_COLORS.length],
      lineStyle: 'dashed',
    };
    onThresholdsChange([...thresholds, t]);
  };
  const updateThreshold = (id: string, patch: Partial<ChartThreshold>) =>
    onThresholdsChange(thresholds.map(t => t.id === id ? { ...t, ...patch } : t));
  const removeThreshold = (id: string) => onThresholdsChange(thresholds.filter(t => t.id !== id));

  return (
    <div className="space-y-6">
      {/* ── Jalons (X-axis annotations) ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant">
              Jalons · {jalons.length}
            </h4>
            <p className="text-[11px] text-on-surface-variant/70 mt-0.5">
              Marqueurs verticaux sur l'axe temporel (events, déploiements, incidents).
            </p>
          </div>
          <button
            onClick={addJalon}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Add Jalon
          </button>
        </div>

        <div className="space-y-2">
          {jalons.map(j => (
            <div key={j.id} className="p-2.5 border border-outline-variant/20 rounded-xl bg-white space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={j.color}
                  onChange={(e) => updateJalon(j.id, { color: e.target.value })}
                  className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0 shrink-0"
                />
                <input
                  value={j.label}
                  onChange={(e) => updateJalon(j.id, { label: e.target.value })}
                  placeholder="Label"
                  className="flex-1 px-2.5 py-1.5 rounded-md border border-outline-variant/30 bg-white text-xs font-semibold text-on-surface"
                />
                <input
                  type="date"
                  value={j.date}
                  onChange={(e) => updateJalon(j.id, { date: e.target.value })}
                  className="px-2.5 py-1.5 rounded-md border border-outline-variant/30 bg-white text-xs"
                />
                <button
                  onClick={() => removeJalon(j.id)}
                  className="p-1.5 hover:bg-error/10 rounded-md transition-colors"
                  aria-label="Remove jalon"
                >
                  <Trash2 className="w-3.5 h-3.5 text-error" />
                </button>
              </div>
              <ColorSwatchPalette value={j.color} onChange={(c) => updateJalon(j.id, { color: c })} compact />
            </div>
          ))}
          {jalons.length === 0 && (
            <div className="border border-dashed border-outline-variant/30 rounded-xl py-8 text-center">
              <p className="text-xs text-on-surface-variant">Aucun jalon défini</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Seuils Y (horizontal thresholds) ── */}
      <div className="space-y-3 pt-4 border-t border-outline-variant/15">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant">
              Seuils Y · {thresholds.length}
            </h4>
            <p className="text-[11px] text-on-surface-variant/70 mt-0.5">
              Lignes horizontales de seuil sur l'axe Y (objectifs, KPI cibles, alertes).
            </p>
          </div>
          <button
            onClick={addThreshold}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Add Seuil Y
          </button>
        </div>

        <div className="space-y-2">
          {thresholds.map(t => (
            <div key={t.id} className="p-2.5 border border-outline-variant/20 rounded-xl bg-white space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={t.color}
                  onChange={(e) => updateThreshold(t.id, { color: e.target.value })}
                  className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0 shrink-0"
                />
                <input
                  value={t.label}
                  onChange={(e) => updateThreshold(t.id, { label: e.target.value })}
                  placeholder="Label"
                  className="flex-1 px-2.5 py-1.5 rounded-md border border-outline-variant/30 bg-white text-xs font-semibold text-on-surface"
                />
                <input
                  type="number"
                  value={t.value}
                  onChange={(e) => updateThreshold(t.id, { value: Number(e.target.value) })}
                  placeholder="Value"
                  className="w-24 px-2.5 py-1.5 rounded-md border border-outline-variant/30 bg-white text-xs"
                />
                <select
                  value={t.axis}
                  onChange={(e) => updateThreshold(t.id, { axis: e.target.value as AxisSide })}
                  className="px-2 py-1.5 rounded-md border border-outline-variant/30 bg-white text-xs font-bold uppercase"
                >
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
                <select
                  value={t.lineStyle}
                  onChange={(e) => updateThreshold(t.id, { lineStyle: e.target.value as LineStyle })}
                  className="px-2 py-1.5 rounded-md border border-outline-variant/30 bg-white text-xs"
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                </select>
                <button
                  onClick={() => removeThreshold(t.id)}
                  className="p-1.5 hover:bg-error/10 rounded-md transition-colors"
                  aria-label="Remove threshold"
                >
                  <Trash2 className="w-3.5 h-3.5 text-error" />
                </button>
              </div>
              <ColorSwatchPalette value={t.color} onChange={(c) => updateThreshold(t.id, { color: c })} compact />
            </div>
          ))}
          {thresholds.length === 0 && (
            <div className="border border-dashed border-outline-variant/30 rounded-xl py-8 text-center">
              <p className="text-xs text-on-surface-variant">Aucun seuil défini</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Helpers ---------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-on-surface-variant">{label}</label>
      {children}
    </div>
  );
}

function ToggleRow({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between py-1.5 px-2.5 rounded-md bg-white border border-outline-variant/20 hover:border-outline-variant/40 transition-colors"
      type="button"
    >
      <span className="text-[11px] font-bold text-on-surface">{label}</span>
      <span
        className={cn(
          'w-8 h-4 rounded-full relative transition-colors shrink-0',
          checked ? 'bg-primary' : 'bg-outline-variant/40'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform',
            checked ? 'translate-x-[17px]' : 'translate-x-0.5'
          )}
        />
      </span>
    </button>
  );
}

function MultiTagInput({
  values, onChange, suggestions, placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const add = (v: string) => {
    const t = v.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setDraft('');
  };
  const remove = (v: string) => onChange(values.filter(x => x !== v));
  const filtered = suggestions.filter(s => !values.includes(s) && s.toLowerCase().includes(draft.toLowerCase()));

  return (
    <div className="border border-outline-variant/30 rounded-lg bg-white p-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map(v => (
          <span key={v} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-bold">
            {v}
            <button onClick={() => remove(v)} className="hover:bg-primary/20 rounded p-0.5" aria-label={`Remove ${v}`}>
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } }}
          placeholder={values.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[80px] text-xs bg-transparent outline-none"
        />
      </div>
      {draft && filtered.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1.5 border-t border-outline-variant/20">
          {filtered.slice(0, 6).map(s => (
            <button
              key={s}
              onClick={() => add(s)}
              className="px-2 py-0.5 rounded-md text-[11px] font-bold text-on-surface-variant bg-surface-container-low hover:bg-primary/10 hover:text-primary transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- KPI Combobox (searchable, virtual-friendly) ---------------- */

function KpiCombobox({
  value, options, loading, onSelect,
}: {
  value: string;
  options: { key: string; label: string; unit: string }[];
  loading: boolean;
  onSelect: (opt: { key: string; label: string; unit: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.key === value);
  const displayLabel = current?.label ?? value ?? 'Sélectionner un KPI…';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-outline-variant/30 bg-white text-sm font-bold text-on-surface hover:border-primary/40 transition-colors"
        >
          <span className="flex items-center gap-2 truncate">
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />}
            <span className="truncate">{displayLabel}</span>
            {current?.unit && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant bg-surface-container-low px-1.5 py-0.5 rounded">
                {current.unit}
              </span>
            )}
          </span>
          <ChevronDown className="w-4 h-4 text-on-surface-variant shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command shouldFilter>
          <CommandInput placeholder={`Rechercher parmi ${options.length} KPIs…`} />
          <CommandList className="max-h-80">
            <CommandEmpty>Aucun KPI trouvé.</CommandEmpty>
            <CommandGroup>
              {options.slice(0, 500).map(o => (
                <CommandItem
                  key={o.key}
                  value={`${o.label} ${o.key}`}
                  onSelect={() => { onSelect(o); setOpen(false); }}
                  className="flex items-center gap-2"
                >
                  <Check className={cn('w-3.5 h-3.5', o.key === value ? 'opacity-100 text-primary' : 'opacity-0')} />
                  <span className="flex-1 truncate text-xs font-bold">{o.label}</span>
                  {o.unit && (
                    <span className="text-[9px] font-bold uppercase text-on-surface-variant bg-surface-container-low px-1.5 py-0.5 rounded">
                      {o.unit}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            {options.length > 500 && (
              <div className="px-3 py-2 text-[10px] text-on-surface-variant border-t border-outline-variant/15">
                Affichage des 500 premiers résultats — affinez la recherche pour voir les autres ({options.length} au total).
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
