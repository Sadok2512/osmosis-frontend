import { useState, useMemo } from 'react';
import { X, Plus, Trash2, Eye, EyeOff, GripVertical, ChevronDown, ChevronRight, Database, Palette, Flag, Filter, Calendar, Clock, Loader2 } from 'lucide-react';
import {
  DynWidget, ChartWidgetConfig, ChartMetric, ChartJalon, ChartThreshold,
  DEFAULT_CHART_CONFIG, ChartGranularity, ChartType,
  LineStyle, AxisSide, FillStyle, BackgroundStyle, LegendPosition,
} from '../types';
import { cn } from '@/lib/utils';
import { useKpiCatalog, useFilterCatalog } from '@/components/kpi-monitor/api/kpiMonitorApi';

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
const FALLBACK_TF_DIMENSIONS = ['Plaque', 'DOR', 'DR', 'Vendor', 'Bande', 'Techno', 'Site', 'Cell', 'PCI', 'ECI'];



const COLOR_PALETTE = ['#00685f', '#6bd8cb', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#10b981', '#ec4899'];

export default function ChartSettingsPanel({ widget, onChange, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('data');
  const config: ChartWidgetConfig = widget.config ?? DEFAULT_CHART_CONFIG;

  // ── Live backend catalogs (KPIs + filter dimensions) ───────────────
  const { data: kpiCatalog, isLoading: kpisLoading } = useKpiCatalog();
  const { data: filterCatalog, isLoading: filtersLoading } = useFilterCatalog();

  const kpiOptions = useMemo(() => {
    if (!kpiCatalog || kpiCatalog.length === 0) return FALLBACK_KPI_OPTIONS;
    return kpiCatalog
      .filter(k => k.is_active !== false)
      .map(k => ({ key: k.kpi_key, label: k.display_name || k.kpi_key, unit: k.unit || '' }));
  }, [kpiCatalog]);

  const dimensionOptions = useMemo(() => {
    if (!filterCatalog || filterCatalog.length === 0) return FALLBACK_TF_DIMENSIONS;
    return filterCatalog
      .filter(f => f.is_active !== false)
      .map(f => f.display_name || f.dimension_key);
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


  const updateMetric = (id: string, patch: Partial<ChartMetric>) => {
    setMetrics(config.metrics.map(m => m.id === id ? { ...m, ...patch } : m));
  };
  const removeMetric = (id: string) => setMetrics(config.metrics.filter(m => m.id !== id));

  const widgetLabel = `CHART · ${widget.id.slice(0, 18)}`;

  const resetSettings = () => {
    onChange({ config: { ...DEFAULT_CHART_CONFIG } });
    setTab('data');
  };

  return (
    <div className="h-80 bg-white border-t border-outline-variant/20 shadow-2xl relative z-40 shrink-0">
      {/* Header — identical to Table-style panel */}
      <div className="px-8 py-3 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">Widget Settings</span>
          <div className="h-4 w-px bg-outline-variant" />
          <h4 className="font-headline font-bold text-on-surface text-sm">{widgetLabel}</h4>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resetSettings}
            className="px-4 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            Reset
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
      <div className="flex h-full pb-10">
        <aside className="w-48 border-r border-outline-variant/10 p-4 shrink-0 space-y-1">
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

        <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
          <div className="max-w-4xl">
            {tab === 'data' && (
              <DataSourceTab
                config={config}
                patchData={patchData}
                addMetric={addMetric}
                updateMetric={updateMetric}
                removeMetric={removeMetric}
                title={widget.title ?? ''}
                onTitleChange={(t) => onChange({ title: t })}
                kpiOptions={kpiOptions}
                kpisLoading={kpisLoading}
                dimensionOptions={dimensionOptions}
                filtersLoading={filtersLoading}
              />
            )}
            {tab === 'appearance' && (
              <StyleTab
                style={config.style}
                patchStyle={patchStyle}
                title={widget.title ?? ''}
                onTitleChange={(t) => onChange({ title: t })}
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
  config, patchData, addMetric, updateMetric, removeMetric, title, onTitleChange,
}: {
  config: ChartWidgetConfig;
  patchData: (p: Partial<ChartWidgetConfig['data']>) => void;
  addMetric: () => void;
  updateMetric: (id: string, patch: Partial<ChartMetric>) => void;
  removeMetric: (id: string) => void;
  title: string;
  onTitleChange: (t: string) => void;
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
          updateMetric={updateMetric}
          removeMetric={removeMetric}
        />
      )}
      {sub === 'time' && (
        <DataTab
          data={config.data}
          patchData={patchData}
          title={title}
          onTitleChange={onTitleChange}
        />
      )}
    </div>
  );
}

/* ---------------- Sub-section: Time & Filters ---------------- */

function DataTab({
  data, patchData, title, onTitleChange,
}: {
  data: ChartWidgetConfig['data'];
  patchData: (p: Partial<ChartWidgetConfig['data']>) => void;
  title: string;
  onTitleChange: (t: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Section title="Time & Filters">
        <TimeFiltersToolbar />
      </Section>
    </div>
  );
}

/* ---------------- Time & Filters Toolbar (embedded in panel) ---------------- */

const TF_TECHS: { id: string; label: string; bg: string; text: string }[] = [
  { id: '2g', label: '2G', bg: 'bg-violet-500', text: 'text-white' },
  { id: '3g', label: '3G', bg: 'bg-amber-400', text: 'text-amber-950' },
  { id: '4g', label: '4G', bg: 'bg-orange-500', text: 'text-white' },
  { id: '5g', label: '5G', bg: 'bg-emerald-500', text: 'text-white' },
];

const TF_DIMENSIONS = ['Plaque', 'DOR', 'DR', 'Vendor', 'Bande', 'Techno', 'Site', 'Cell', 'PCI', 'ECI'];

interface TFFilter { id: string; dimension: string; value: string; }

function TFPill({ icon, children, className }: { icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      'flex items-center gap-2 h-9 px-3 rounded-full bg-white border border-outline-variant/30 shadow-[0_1px_2px_rgba(0,0,0,0.04)] text-xs font-bold text-on-surface',
      className,
    )}>
      {icon}
      {children}
    </div>
  );
}

function TimeFiltersToolbar() {
  const [filters, setFilters] = useState<TFFilter[]>([
    { id: 'f-1', dimension: 'Plaque', value: 'NANTES' },
  ]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftDim, setDraftDim] = useState('');
  const [draftVal, setDraftVal] = useState('');

  const removeFilter = (id: string) => setFilters(prev => prev.filter(f => f.id !== id));
  const clearFilters = () => setFilters([]);
  const addFilter = () => {
    if (!draftDim || !draftVal.trim()) return;
    setFilters(prev => [...prev, { id: `f-${Date.now()}`, dimension: draftDim, value: draftVal.trim() }]);
    setDraftDim('');
    setDraftVal('');
    setPickerOpen(false);
  };

  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/40 overflow-visible">
      {/* Scope / date row */}
      <div className="px-4 py-3 flex flex-wrap items-center gap-2.5 border-b border-outline-variant/10">
        <TFPill icon={<Filter className="w-3.5 h-3.5 text-on-surface-variant" />}>
          <span className="text-on-surface-variant uppercase tracking-wide text-[11px]">Périmètre</span>
          <div className="flex items-center gap-1 ml-1">
            {TF_TECHS.map(t => (
              <span key={t.id} className={cn('px-1.5 h-5 inline-flex items-center justify-center rounded-md text-[10px] font-black tracking-wide', t.bg, t.text)}>
                {t.label}
              </span>
            ))}
          </div>
          <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-black">4</span>
        </TFPill>

        <TFPill icon={<Calendar className="w-3.5 h-3.5 text-on-surface-variant" />}>
          <span>13/04/2026</span>
          <span className="text-on-surface-variant/60 font-medium">00:00</span>
        </TFPill>

        <span className="text-on-surface-variant/60 font-bold">—</span>

        <TFPill icon={<Calendar className="w-3.5 h-3.5 text-on-surface-variant" />}>
          <span>15/04/2026</span>
          <span className="text-on-surface-variant/60 font-medium">00:00</span>
        </TFPill>

        <TFPill icon={<Clock className="w-3.5 h-3.5 text-on-surface-variant" />}>
          <span className="text-on-surface-variant uppercase tracking-wide text-[11px]">Période</span>
          <span className="font-black">3j</span>
          <ChevronDown className="w-3 h-3 text-on-surface-variant" />
        </TFPill>

        <TFPill>
          <span className="text-emerald-600 uppercase tracking-wide text-[11px]">Grain :</span>
          <span className="text-emerald-700 font-black">15 min</span>
          <ChevronDown className="w-3 h-3 text-emerald-600" />
        </TFPill>

        <TFPill icon={<Flag className="w-3.5 h-3.5 text-rose-500" />}>
          <span className="text-on-surface-variant uppercase tracking-wide text-[11px]">Jalons</span>
          <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-black">2</span>
        </TFPill>

        <div className="ml-auto">
          <button
            type="button"
            className="h-9 px-6 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest shadow-[0_4px_14px_rgba(16,185,129,0.35)] active:scale-95 transition-all"
          >
            Appliquer
          </button>
        </div>
      </div>

      {/* Filters row */}
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600 mr-1">
          <Filter className="w-3.5 h-3.5" />
          <span>Filtres</span>
        </div>

        {filters.map(f => (
          <div
            key={f.id}
            className="group flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-full bg-amber-100 border border-amber-200 text-[11px] font-bold text-amber-900"
          >
            <span className="opacity-70">{f.dimension}:</span>
            <span>{f.value}</span>
            <button
              onClick={() => removeFilter(f.id)}
              className="w-5 h-5 rounded-full hover:bg-amber-200/80 flex items-center justify-center text-amber-700"
              aria-label={`Remove ${f.dimension} filter`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen(o => !o)}
            className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-white border border-dashed border-outline-variant/60 text-[11px] font-bold text-on-surface-variant hover:border-primary hover:text-primary transition-colors"
          >
            <Plus className="w-3 h-3" />
            <span>Ajouter filtre</span>
          </button>

          {pickerOpen && (
            <div className="absolute z-50 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-outline-variant/20 p-3 space-y-2">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Dimension</label>
                <select
                  value={draftDim}
                  onChange={(e) => setDraftDim(e.target.value)}
                  className="mt-1 w-full h-8 px-2 rounded-lg border border-outline-variant/30 bg-white text-xs font-bold text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="">Choisir…</option>
                  {TF_DIMENSIONS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Valeur</label>
                <input
                  value={draftVal}
                  onChange={(e) => setDraftVal(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addFilter()}
                  placeholder="Ex. NANTES"
                  className="mt-1 w-full h-8 px-2 rounded-lg border border-outline-variant/30 bg-white text-xs font-bold text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="h-7 px-3 rounded-lg text-[11px] font-bold text-on-surface-variant hover:bg-surface-container-low"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={addFilter}
                  disabled={!draftDim || !draftVal.trim()}
                  className="h-7 px-3 rounded-lg bg-primary text-on-primary text-[11px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90"
                >
                  Ajouter
                </button>
              </div>
            </div>
          )}
        </div>

        {filters.length > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 h-7 px-2 text-[11px] font-bold text-on-surface-variant hover:text-error transition-colors"
          >
            <X className="w-3 h-3" />
            <span>Effacer filtres</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- Section: Metrics (inside Data Source tab) ---------------- */

function MetricsTab({
  metrics, addMetric, updateMetric, removeMetric,
}: {
  metrics: ChartMetric[];
  addMetric: () => void;
  updateMetric: (id: string, patch: Partial<ChartMetric>) => void;
  removeMetric: (id: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant">
          Metrics · {metrics.length}
        </h4>
        <button
          onClick={() => {
            addMetric();
            setTimeout(() => {
              const last = document.querySelector<HTMLDivElement>('[data-kpi-card]:last-of-type');
              last?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 50);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" /> Add KPI
        </button>
      </div>

      <div className="space-y-2">
        {metrics.map((m) => {
          const expanded = expandedId === m.id;
          const kpiLabel = KPI_OPTIONS.find(o => o.key === m.kpiKey)?.label ?? m.kpiKey;
          return (
            <div
              key={m.id}
              data-kpi-card
              className={cn(
                'group border rounded-xl bg-white transition-all',
                expanded
                  ? 'border-primary/40 shadow-md'
                  : 'border-outline-variant/20 hover:border-outline-variant/50 hover:shadow-sm'
              )}
            >
              <button
                onClick={() => setExpandedId(expanded ? null : m.id)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
              >
                <GripVertical className="w-3.5 h-3.5 text-on-surface-variant/40 shrink-0 cursor-grab" />
                {expanded
                  ? <ChevronDown className="w-3.5 h-3.5 text-primary shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-on-surface-variant/60 shrink-0" />
                }
                <span
                  className="w-3 h-3 rounded-full ring-2 ring-white shadow-sm shrink-0"
                  style={{ background: m.color }}
                />
                <span className="font-bold text-sm text-on-surface truncate flex-1">
                  {m.alias || kpiLabel}
                </span>
                <span className="hidden sm:inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded-md">
                  {m.axis}
                </span>
                <span className="hidden md:inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded-md capitalize">
                  {m.lineStyle}
                </span>
                <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); updateMetric(m.id, { visible: !m.visible }); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); updateMetric(m.id, { visible: !m.visible }); } }}
                    className="p-1.5 hover:bg-surface-container-high rounded-md transition-colors cursor-pointer"
                    aria-label="Toggle visibility"
                  >
                    {m.visible ? <Eye className="w-3.5 h-3.5 text-on-surface-variant" /> : <EyeOff className="w-3.5 h-3.5 text-on-surface-variant/40" />}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); removeMetric(m.id); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); removeMetric(m.id); } }}
                    className="p-1.5 hover:bg-error/10 rounded-md transition-colors cursor-pointer"
                    aria-label="Remove metric"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-error" />
                  </span>
                </div>
              </button>

              {expanded && (
                <div className="px-4 pb-4 pt-1 border-t border-outline-variant/15 space-y-4 animate-in fade-in slide-in-from-top-1 duration-150">
                  <Field label="KPI">
                    <select
                      value={m.kpiKey}
                      onChange={(e) => {
                        const opt = KPI_OPTIONS.find(o => o.key === e.target.value);
                        updateMetric(m.id, { kpiKey: e.target.value, alias: opt?.label, unit: opt?.unit });
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-white text-sm font-bold text-on-surface"
                    >
                      {KPI_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Alias">
                      <input
                        value={m.alias ?? ''}
                        onChange={(e) => updateMetric(m.id, { alias: e.target.value })}
                        placeholder="Display name"
                        className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-white text-sm"
                      />
                    </Field>
                    <Field label="Unit">
                      <input
                        value={m.unit ?? ''}
                        onChange={(e) => updateMetric(m.id, { unit: e.target.value })}
                        placeholder="auto"
                        className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-white text-sm"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Axis">
                      <div className="flex border border-outline-variant/30 rounded-lg overflow-hidden">
                        {(['left', 'right'] as AxisSide[]).map(side => (
                          <button
                            key={side}
                            onClick={() => updateMetric(m.id, { axis: side })}
                            className={cn(
                              'flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors',
                              m.axis === side ? 'bg-primary text-on-primary' : 'bg-white text-on-surface-variant hover:bg-surface-container-low'
                            )}
                          >
                            {side}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label="Line style">
                      <select
                        value={m.lineStyle}
                        onChange={(e) => updateMetric(m.id, { lineStyle: e.target.value as LineStyle })}
                        className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-white text-sm"
                      >
                        <option value="solid">Solid</option>
                        <option value="dashed">Dashed</option>
                      </select>
                    </Field>
                  </div>

                  <Field label="Color">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg ring-2 ring-white shadow-md shrink-0"
                        style={{ background: m.color }}
                      />
                      <div className="flex flex-wrap gap-1.5 flex-1">
                        {COLOR_PALETTE.map(c => (
                          <button
                            key={c}
                            onClick={() => updateMetric(m.id, { color: c })}
                            className={cn(
                              'w-6 h-6 rounded-full transition-all hover:scale-110',
                              m.color === c ? 'ring-2 ring-on-surface ring-offset-2' : 'ring-1 ring-outline-variant/30'
                            )}
                            style={{ background: c }}
                            aria-label={`Color ${c}`}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5 border border-outline-variant/30 rounded-lg px-2 py-1.5 bg-white shrink-0">
                        <input
                          type="color"
                          value={m.color}
                          onChange={(e) => updateMetric(m.id, { color: e.target.value })}
                          className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                        />
                        <input
                          value={m.color}
                          onChange={(e) => updateMetric(m.id, { color: e.target.value })}
                          className="w-20 text-[11px] font-mono text-on-surface bg-transparent outline-none uppercase"
                        />
                      </div>
                    </div>
                  </Field>
                </div>
              )}
            </div>
          );
        })}

        {metrics.length === 0 && (
          <div className="border border-dashed border-outline-variant/30 rounded-xl py-12 flex flex-col items-center gap-3">
            <p className="text-xs text-on-surface-variant">No metrics yet</p>
            <button
              onClick={addMetric}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-bold hover:bg-primary/90"
            >
              <Plus className="w-3.5 h-3.5" /> Add your first KPI
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Tab: Appearance ---------------- */

function StyleTab({
  style, patchStyle, title, onTitleChange,
}: {
  style: ChartWidgetConfig['style'];
  patchStyle: (p: Partial<ChartWidgetConfig['style']>) => void;
  title: string;
  onTitleChange: (t: string) => void;
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
            <div key={j.id} className="flex items-center gap-2 p-2.5 border border-outline-variant/20 rounded-xl bg-white">
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
            <div key={t.id} className="flex items-center gap-2 p-2.5 border border-outline-variant/20 rounded-xl bg-white">
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
