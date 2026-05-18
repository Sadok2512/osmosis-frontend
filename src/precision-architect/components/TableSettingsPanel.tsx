import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Plus, Trash2, Eye, EyeOff, GripVertical, ChevronDown, ChevronRight,
  Database, Palette, Flag, Filter, Clock, Loader2, Check, Cpu,
} from 'lucide-react';
import {
  DynWidget, TableWidgetConfig, TableColumn, DEFAULT_TABLE_CONFIG,
  ChartFilterChip, TechnoId, PeriodPreset, GrainOption,
} from '../types';
import { cn } from '@/lib/utils';
import { useKpiCatalog, useFilterCatalog } from '@/components/kpi-monitor/api/kpiMonitorApi';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import KpiSelectorModal from '@/components/kpi-monitor/KpiSelectorModal';
import CounterSelectorModal from '@/components/investigator/CounterSelectorModal';
import { KpiCatalogEntry } from '@/components/kpi-monitor/types';
import { getApiUrl, getApiHeaders, fetchVpsWithRetry } from '@/lib/apiConfig';
import DateRangePopover from './DateRangePopover';
import PAFilterChips from './PAFilterChips';
import { usePAGlobalToolbar } from '../stores/paGlobalToolbarStore';
import { formatLocalDateTimeInput } from '../lib/localDateTime';

interface Props {
  widget: DynWidget;
  onChange: (patch: Partial<DynWidget>) => void;
  onClose: () => void;
}

type Tab = 'data' | 'appearance' | 'jalons';

const FALLBACK_KPI_OPTIONS = [
  { key: 'qoe_index', label: 'QoE Index', unit: '%' },
  { key: 'debit_dl', label: 'Débit DL', unit: 'Mbps' },
  { key: 'debit_ul', label: 'Débit UL', unit: 'Mbps' },
  { key: 'rtt_data_avg', label: 'RTT Data Avg', unit: 'ms' },
];
const FALLBACK_DIMENSIONS = ['Cluster', 'DOR', 'DR', 'Vendor', 'Bande', 'Technology', 'Site', 'Cell'];
const SPLIT_OPTIONS = ['CELL', 'SITE', 'CLUSTER', 'DOR', 'DR', 'VENDOR', 'BANDE', 'TECHNOLOGY', '__none__'];
const TOP_N_OPTIONS = [10, 25, 50, 100, 250, 500];
const COLOR_PALETTE = ['#00685f', '#6bd8cb', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#10b981', '#ec4899'];

export default function TableSettingsPanel({ widget, onChange, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('data');
  const config: TableWidgetConfig = widget.tableConfig ?? DEFAULT_TABLE_CONFIG;
  const configRef = useRef<TableWidgetConfig>(structuredClone(config));

  useEffect(() => {
    configRef.current = structuredClone(widget.tableConfig ?? DEFAULT_TABLE_CONFIG);
  }, [widget.id, widget.tableConfig]);

  const emitConfig = (nextConfig: TableWidgetConfig) => {
    configRef.current = structuredClone(nextConfig);
    onChange({ tableConfig: nextConfig });
  };

  const commit = (closeAfter = false) => {
    const nextConfig = structuredClone(configRef.current);
    onChange({
      tableConfig: nextConfig,
      appliedTableConfig: structuredClone(nextConfig),
      appliedRev: (widget.appliedRev ?? 0) + 1,
    });
    if (closeAfter) onClose();
  };

  const { data: kpiCatalog, isLoading: kpisLoading } = useKpiCatalog();
  const { data: filterCatalog, isLoading: filtersLoading } = useFilterCatalog();

  const kpiOptions = useMemo(() => {
    if (!kpiCatalog || kpiCatalog.length === 0) return FALLBACK_KPI_OPTIONS;
    return kpiCatalog
      .filter(k => k.is_active !== false)
      .map(k => ({ key: k.kpi_key, label: k.display_name || k.kpi_key, unit: k.unit || '' }));
  }, [kpiCatalog]);

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
      // Mirror of ChartSettingsPanel — without these the selector
      // can't group by canonical name or show per-vendor formulas.
      vendor: k.vendor || '',
      techno: k.techno || '',
      is_normalized: k.is_normalized ?? false,
      dimension_type: k.dimension_type || null,
      dimension_prefix: (k as any).dimension_prefix || null,
      supported_levels: k.supported_levels || [],
      kpi_code_normalized: (k as any).kpi_code_normalized || '',
      numerator: (k as any).numerator ?? (k as any).numerateur ?? '',
      denominator: (k as any).denominator ?? (k as any).denominateur ?? '',
    } as any));
  }, [kpiCatalog]);

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
    if (!filterCatalog || filterCatalog.length === 0) return FALLBACK_DIMENSIONS;
    const fromBackend = filterCatalog
      .filter(f => (f as any).is_active !== false)
      .map(f => f.display_name || f.dimension_key);
    if (!fromBackend.some(d => d.toLowerCase() === 'vendor')) fromBackend.push('Vendor');
    return fromBackend;
  }, [filterCatalog]);

  const patch = (p: Partial<TableWidgetConfig>) => {
    const nextConfig = { ...configRef.current, ...p };
    emitConfig(nextConfig);
  };
  const patchData = (p: Partial<TableWidgetConfig['data']>) => {
    const nextConfig = {
      ...configRef.current,
      data: { ...configRef.current.data, ...p },
    };
    emitConfig(nextConfig);
  };
  const setColumns = (cols: TableColumn[]) => {
    const nextConfig = { ...configRef.current, columns: cols };
    emitConfig(nextConfig);
  };

  const addColumnsFromKeys = (keys: string[]) => {
    const current = configRef.current;
    const existing = new Set(current.columns.map(c => c.kpiKey));
    const toAdd = keys.filter(k => !existing.has(k));
    if (toAdd.length === 0) return;
    const next: TableColumn[] = toAdd.map((key, idx) => {
      const k = kpiCatalog?.find(x => x.kpi_key === key);
      return {
        id: `col-${Date.now()}-${idx}`,
        source: 'kpi',
        kpiKey: key,
        alias: k?.display_name || key,
        unit: k?.unit || '',
        visible: true,
      };
    });
    setColumns([...current.columns, ...next]);
  };

  const addCountersFromKeys = (counterNames: string[]) => {
    const current = configRef.current;
    const existing = new Set(current.columns.map(c => c.kpiKey));
    const toAdd = counterNames.filter(k => !existing.has(k));
    if (toAdd.length === 0) return;
    const next: TableColumn[] = toAdd.map((name, idx) => {
      const c = counterCatalog.find((x: any) => x.counter_name === name);
      return {
        id: `cnt-${Date.now()}-${idx}`,
        source: 'counter',
        kpiKey: name,
        alias: c?.display_name || name,
        unit: '',
        visible: true,
      };
    });
    setColumns([...current.columns, ...next]);
  };

  const updateColumn = (id: string, p: Partial<TableColumn>) =>
    setColumns(configRef.current.columns.map(c => c.id === id ? { ...c, ...p } : c));
  const removeColumn = (id: string) => setColumns(configRef.current.columns.filter(c => c.id !== id));

  const reset = () => {
    const nextConfig = structuredClone(DEFAULT_TABLE_CONFIG);
    emitConfig(nextConfig);
    setTab('data');
  };

  const widgetLabel = `TABLE · ${(widget.title && widget.title.trim()) || 'Untitled'}`;

  return (
    <div className="h-[280px] max-h-[30vh] w-full bg-white border border-[hsl(165,12%,91%)] rounded-xl shadow-[0_4px_12px_rgba(15,23,42,0.06)] relative z-40 shrink-0 flex flex-col">
      {/* Header — sticky */}
      <div className="px-8 py-3 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low shrink-0 sticky top-0 z-10 rounded-t-2xl">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">Widget Settings</span>
          <div className="h-4 w-px bg-outline-variant" />
          <h4 className="font-headline font-bold text-on-surface text-sm">{widgetLabel}</h4>
        </div>
        <div className="flex gap-2 items-center">
          <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-black uppercase tracking-widest border border-primary/20">
            Widget scope
          </span>
          <button onClick={reset} className="px-4 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-colors">Reset</button>
          <button onClick={() => commit(false)} className="px-4 py-1.5 rounded-lg bg-white border border-primary/40 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/5 transition-colors" title="Apply changes only to this selected widget">Apply to Widget</button>
          <button onClick={() => commit(true)} className="px-4 py-1.5 rounded-lg bg-primary text-on-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 transition-colors shadow-sm" title="Save and apply changes">Save</button>
          <button onClick={onClose} className="p-1 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors" aria-label="Close settings">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body: sidebar tabs + content */}
      <div className="flex flex-1 min-h-0">
        <aside className="w-48 border-r border-outline-variant/10 p-4 shrink-0 space-y-1 overflow-y-auto">
          {([
            { key: 'data' as const, label: 'Data Source', icon: Database },
            { key: 'appearance' as const, label: 'Appearance', icon: Palette },
            { key: 'jalons' as const, label: 'Jalons & Seuils', icon: Flag },
          ]).map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} className={cn(
                'w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2',
                tab === t.key ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-low'
              )}>
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </aside>

        <div className="flex-1 min-w-0 p-6 pb-10 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <div className="max-w-4xl min-w-0">
            {tab === 'data' && (
              <DataSourceTab
                config={config}
                patch={patch}
                patchData={patchData}
                addColumnsFromKeys={addColumnsFromKeys}
                addCountersFromKeys={addCountersFromKeys}
                updateColumn={updateColumn}
                removeColumn={removeColumn}
                kpiOptions={kpiOptions}
                kpisLoading={kpisLoading}
                kpiCatalogForSelector={kpiCatalogForSelector}
                counterCatalog={counterCatalog}
                dimensionOptions={dimensionOptions}
                filtersLoading={filtersLoading}
                onApply={() => commit(false)}
              />
            )}
            {tab === 'appearance' && (
              <AppearanceTab
                title={widget.title ?? ''}
                onTitleChange={(t) => onChange({ title: t })}
                transparentBg={!!widget.transparentBg}
                onTransparentBgChange={(v) => onChange({ transparentBg: v })}
              />
            )}
            {tab === 'jalons' && (
              <div className="rounded-xl border-2 border-dashed border-outline-variant/40 p-8 text-center">
                <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Jalons &amp; Seuils</p>
                <p className="text-[11px] text-on-surface-variant max-w-md mx-auto">
                  Les jalons et seuils ne s'appliquent pas aux tableaux. Ajoutez-les sur un widget Chart pour mettre en évidence des dates clés ou des seuils KPI.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────── Data Source tab (sub-tabs: KPI Metrics / Time & Filters) ───────────────────── */

function DataSourceTab({
  config, patch, patchData, addColumnsFromKeys, addCountersFromKeys, updateColumn, removeColumn,
  kpiOptions, kpisLoading, kpiCatalogForSelector, counterCatalog, dimensionOptions, filtersLoading, onApply,
}: {
  config: TableWidgetConfig;
  patch: (p: Partial<TableWidgetConfig>) => void;
  patchData: (p: Partial<TableWidgetConfig['data']>) => void;
  addColumnsFromKeys: (keys: string[]) => void;
  addCountersFromKeys: (keys: string[]) => void;
  updateColumn: (id: string, p: Partial<TableColumn>) => void;
  removeColumn: (id: string) => void;
  kpiOptions: { key: string; label: string; unit: string }[];
  kpisLoading: boolean;
  kpiCatalogForSelector: KpiCatalogEntry[];
  counterCatalog: any[];
  dimensionOptions: string[];
  filtersLoading: boolean;
  onApply: () => void;
}) {
  const [sub, setSub] = useState<'kpi' | 'time'>('kpi');

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="inline-flex p-1 bg-surface-container-low rounded-xl border border-outline-variant/20">
        {([
          { key: 'kpi' as const, label: 'KPI Metrics', count: config.columns.length },
          { key: 'time' as const, label: 'Time & Filters' },
        ]).map((s) => (
          <button
            key={s.key}
            onClick={() => setSub(s.key)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2',
              sub === s.key ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
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
        <ColumnsTab
          config={config}
          patch={patch}
          columns={config.columns}
          addColumnsFromKeys={addColumnsFromKeys}
          addCountersFromKeys={addCountersFromKeys}
          updateColumn={updateColumn}
          removeColumn={removeColumn}
          kpiOptions={kpiOptions}
          kpisLoading={kpisLoading}
          kpiCatalogForSelector={kpiCatalogForSelector}
          counterCatalog={counterCatalog}
        />
      )}
      {sub === 'time' && (
        <TimeFiltersSection
          data={config.data}
          patchData={patchData}
          dimensionOptions={dimensionOptions}
          filtersLoading={filtersLoading}
          onApply={onApply}
        />
      )}
    </div>
  );
}

/* ───────────────────── KPI Metrics (mirrors ChartSettingsPanel.MetricsTab) ───────────────────── */

function ColumnsTab({
  config, patch, columns, addColumnsFromKeys, addCountersFromKeys, updateColumn, removeColumn,
  kpiOptions, kpisLoading, kpiCatalogForSelector, counterCatalog,
}: {
  config: TableWidgetConfig;
  patch: (p: Partial<TableWidgetConfig>) => void;
  columns: TableColumn[];
  addColumnsFromKeys: (keys: string[]) => void;
  addCountersFromKeys: (keys: string[]) => void;
  updateColumn: (id: string, p: Partial<TableColumn>) => void;
  removeColumn: (id: string) => void;
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

  const selectedKeys = useMemo(() => columns.map(c => c.kpiKey), [columns]);
  const counterKeys = useMemo(() => new Set(counterCatalog.map((c: any) => c.counter_name)), [counterCatalog]);
  const selectedKpiKeys = useMemo(() => selectedKeys.filter(k => !counterKeys.has(k)), [selectedKeys, counterKeys]);
  const selectedCounterKeys = useMemo(() => selectedKeys.filter(k => counterKeys.has(k)), [selectedKeys, counterKeys]);

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-2 min-w-0">
          <span className="truncate">Metrics · {columns.length}</span>
          {kpisLoading && <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />}
          {!kpisLoading && kpiCatalogForSelector.length > 0 && (
            <span className="text-[8px] font-bold text-primary/70 normal-case tracking-wide truncate">
              · {kpiCatalogForSelector.length} KPIs · {counterCatalog.length} compteurs
            </span>
          )}
        </h4>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <TopNPicker value={config.topN} onChange={(v) => patch({ topN: v })} />
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
            if (toAdd.length > 0) addColumnsFromKeys(toAdd);
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

      <div className="space-y-2">
        {columns.length > 0 && (
          <div className="flex items-center justify-between px-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/70">
              Selected · {columns.length}
            </span>
            <span className="text-[9px] font-bold text-on-surface-variant/50">
              Click Edit to customize
            </span>
          </div>
        )}

        {columns.map((c, idx) => {
          const expanded = expandedId === c.id;
          const kpiLabel = kpiOptions.find(o => o.key === c.kpiKey)?.label ?? c.kpiKey;
          const isCounter = counterKeys.has(c.kpiKey);
          const color = COLOR_PALETTE[idx % COLOR_PALETTE.length];
          return (
            <div
              key={c.id}
              className={cn(
                'group border rounded-xl bg-white transition-all min-w-0 overflow-hidden',
                expanded ? 'border-primary/50 shadow-md ring-1 ring-primary/20' : 'border-outline-variant/25 hover:border-primary/30 hover:shadow-sm'
              )}
            >
              {/* Row */}
              <div className="px-3 py-2.5 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <GripVertical className="w-3.5 h-3.5 text-on-surface-variant/30 shrink-0 cursor-grab" />

                  <span
                    className="w-3.5 h-3.5 rounded-full ring-2 ring-white shadow-sm shrink-0"
                    style={{ background: color }}
                    aria-label="Color indicator"
                  />

                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="font-bold text-sm text-on-surface truncate" title={c.alias || kpiLabel}>
                      {c.alias || kpiLabel}
                    </span>
                    {isCounter && (
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 shrink-0">
                        Counter
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => updateColumn(c.id, { visible: !c.visible })}
                      className="p-1.5 hover:bg-surface-container-high rounded-md transition-colors"
                      title={c.visible ? 'Hide' : 'Show'}
                    >
                      {c.visible
                        ? <Eye className="w-3.5 h-3.5 text-on-surface-variant" />
                        : <EyeOff className="w-3.5 h-3.5 text-on-surface-variant/40" />}
                    </button>

                    <button
                      onClick={() => setExpandedId(expanded ? null : c.id)}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-colors',
                        expanded ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface hover:bg-primary/10 hover:text-primary'
                      )}
                    >
                      {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      Edit
                    </button>

                    <button
                      onClick={() => removeColumn(c.id)}
                      className="p-1.5 hover:bg-error/10 rounded-md transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-error" />
                    </button>
                  </div>
                </div>

                {/* Badges wrap below name on narrow widths */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-7">
                  <span
                    className="inline-flex items-center text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                    title="Column"
                  >
                    COL
                  </span>
                  <span
                    className="inline-flex items-center text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant"
                    title="Numeric value"
                  >
                    num
                  </span>
                  <span
                    className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant"
                    title="Format"
                  >
                    <span className="w-3 h-0.5 rounded-full bg-on-surface-variant" />
                    auto
                  </span>
                </div>
              </div>

              {/* Expanded editor */}
              {expanded && (
                <div className="px-4 pb-4 pt-3 border-t border-outline-variant/15 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="KPI key">
                      <input
                        value={c.kpiKey}
                        readOnly
                        className="w-full px-2.5 py-1.5 rounded-lg border border-outline-variant/30 bg-surface-container-low text-xs font-mono text-on-surface-variant"
                      />
                    </Field>
                    <Field label="Alias">
                      <input
                        value={c.alias ?? ''}
                        onChange={(e) => updateColumn(c.id, { alias: e.target.value })}
                        placeholder="Display name"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-outline-variant/30 bg-white text-xs"
                      />
                    </Field>
                    <Field label="Unit">
                      <input
                        value={c.unit ?? ''}
                        onChange={(e) => updateColumn(c.id, { unit: e.target.value })}
                        placeholder="auto"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-outline-variant/30 bg-white text-xs"
                      />
                    </Field>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/70">Split by</span>
                    <SplitByPicker
                      value={c.splitBy ?? null}
                      onChange={(v) => updateColumn(c.id, { splitBy: v })}
                    />
                    <span className="text-[10px] text-on-surface-variant/60">
                      {c.splitBy ? `One row per ${c.splitBy}` : 'Aggregate (single row)'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {columns.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-outline-variant/40 p-8 text-center">
            <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">No columns yet</p>
            <p className="text-[11px] text-on-surface-variant">Click "Add KPI" or "Add Counter" to populate the table.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────── Time & Filters (mirrors Chart's DataTab) ───────────────────── */

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

function TimeFiltersSection({
  data, patchData, dimensionOptions, filtersLoading, onApply,
}: {
  data: TableWidgetConfig['data'];
  patchData: (p: Partial<TableWidgetConfig['data']>) => void;
  dimensionOptions: string[];
  filtersLoading: boolean;
  onApply: () => void;
}) {
  const inherits = data.timeRange?.inherit !== false && data.inheritFromDashboard !== false;
  // Select primitives individually to avoid creating a new object reference on every render
  // (which would cause an infinite re-render loop with zustand's default Object.is equality).
  const applied = usePAGlobalToolbar((s) => s.applied);
  const sTechnos = usePAGlobalToolbar((s) => s.technos);
  const sFrom = usePAGlobalToolbar((s) => s.from);
  const sTo = usePAGlobalToolbar((s) => s.to);
  const sPreset = usePAGlobalToolbar((s) => s.preset);
  const sGrain = usePAGlobalToolbar((s) => s.grain);
  const sFilters = usePAGlobalToolbar((s) => s.filters);
  const toolbar = applied
    ? {
        technos: applied.technos,
        from: applied.from,
        to: applied.to,
        preset: applied.preset,
        grain: applied.grain,
        filters: applied.filters,
      }
    : {
        technos: sTechnos,
        from: sFrom,
        to: sTo,
        preset: sPreset,
        grain: sGrain,
        filters: sFilters,
      };

  if (inherits) {
    return (
      <InheritedFromToolbarCard
        onOverride={() => patchData({
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
        })}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5">
        <div className="flex items-center gap-2 text-[11px] font-bold text-amber-900">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-black">!</span>
          <span>Override actif — ce widget ignore la barre du rapport.</span>
        </div>
        <button
          type="button"
          onClick={() => patchData({ inheritFromDashboard: true, timeRange: { ...data.timeRange, inherit: true } })}
          className="text-[10px] font-black uppercase tracking-widest text-amber-900 hover:underline"
        >
          Revenir à l'héritage
        </button>
      </div>
      <TimeFiltersToolbar data={data} patchData={patchData} dimensionOptions={dimensionOptions} filtersLoading={filtersLoading} onApply={onApply} />
    </div>
  );
}

function InheritedFromToolbarCard({ onOverride }: { onOverride: () => void }) {
  // Read the APPLIED snapshot — widgets inherit from the snapshot frozen at
  // the last "Apply" click on the global toolbar, never from the draft.
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
  // `applied.filters` already contains synthetic Vendor chips injected by the
  // store's apply() (so all consumers stay coherent). When falling back to the
  // live draft (no Apply yet) we inject vendors here for the preview only.
  const baseFilters = applied?.filters ?? liveFilters;
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
              Cliquez sur <em>Override</em> pour personnaliser uniquement ce tableau.
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

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-1 pt-2 border-t border-primary/10">
        <SummaryRow label="Périmètre" value={
          technos.length === 0
            ? <span className="italic text-on-surface-variant/70">aucune techno</span>
            : <span className="flex flex-wrap gap-1">{technos.map(t => (
                <span key={t} className="px-1.5 h-5 inline-flex items-center justify-center rounded-md text-[10px] font-black tracking-wide bg-primary/15 text-primary">{t.toUpperCase()}</span>
              ))}</span>
        } />
        <SummaryRow label="Période" value={`${preset.toUpperCase()} · ${grain}`} />
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

function TimeFiltersToolbar({
  data, patchData, dimensionOptions, filtersLoading, onApply,
}: {
  data: TableWidgetConfig['data'];
  patchData: (p: Partial<TableWidgetConfig['data']>) => void;
  dimensionOptions: string[];
  filtersLoading: boolean;
  onApply: () => void;
}) {
  const technos = data.technos ?? [];
  const filters = data.filters ?? [];
  const tr = data.timeRange;

  const toggleTechno = (id: TechnoId) => {
    const next = technos.includes(id) ? technos.filter(t => t !== id) : [...technos, id];
    patchData({ technos: next });
  };
  const setPreset = (preset: PeriodPreset) => {
    const cfg = TF_PERIODS.find(p => p.id === preset);
    if (preset !== 'custom' && cfg?.days) {
      const to = new Date(tr.to || new Date().toISOString());
      const from = new Date(to.getTime() - cfg.days * 86400000);
      patchData({ timeRange: { ...tr, preset, from: formatLocalDateTimeInput(from), to: formatLocalDateTimeInput(to) } });
    } else {
      patchData({ timeRange: { ...tr, preset } });
    }
  };
  const setGrain = (g: GrainOption) => patchData({ granularity: g });

  const periodLabel = TF_PERIODS.find(p => p.id === tr.preset)?.label.replace(' jour', 'j').replace(' jours', 'j').replace('Personnalisé', 'Custom') ?? '—';
  const grainLabel = TF_GRAINS.find(g => g.id === data.granularity)?.label ?? data.granularity;

  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/40 overflow-visible">
      <div className="px-4 py-3 flex flex-wrap items-center gap-2.5 border-b border-outline-variant/10">
        {/* Périmètre (techno) retiré — le widget Table utilise toujours le périmètre global du rapport. */}

        <DateRangePopover
          from={tr.from}
          to={tr.to}
          onChange={(f, t) => patchData({ timeRange: { ...tr, from: f, to: t, preset: 'custom' } })}
        />

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
              <button key={p.id} type="button" onClick={() => setPreset(p.id)} className={cn(
                'w-full text-left px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors',
                tr.preset === p.id ? 'bg-primary/10 text-primary' : 'text-on-surface hover:bg-surface-container-low'
              )}>{p.label}</button>
            ))}
          </PopoverContent>
        </Popover>

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
              <button key={g.id} type="button" onClick={() => setGrain(g.id)} className={cn(
                'w-full text-left px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors',
                data.granularity === g.id ? 'bg-emerald-50 text-emerald-700' : 'text-on-surface hover:bg-surface-container-low'
              )}>{g.label}</button>
            ))}
          </PopoverContent>
        </Popover>

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

      <PAFilterChips
        filters={filters}
        onChange={(next) => patchData({ filters: next })}
        filterDimensions={dimensionOptions}
        filtersLoading={filtersLoading}
      />
    </div>
  );
}

/* ───────────────────── Appearance Tab ───────────────────── */

function AppearanceTab({
  title, onTitleChange, transparentBg, onTransparentBgChange,
}: {
  title: string;
  onTitleChange: (t: string) => void;
  transparentBg: boolean;
  onTransparentBgChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">Widget title</label>
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled table"
          className="w-full max-w-md h-9 px-3 rounded-lg bg-white border border-outline-variant/30 text-sm font-bold text-on-surface focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      <div className="rounded-xl border border-outline-variant/20 p-4 bg-surface-container-low/30">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/70 mb-2">Card Background</p>
        <div className="grid grid-cols-2 gap-2 max-w-xs">
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
      </div>
    </div>
  );
}

/* ───────────────────── Helpers ───────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-[9px] font-black uppercase tracking-widest text-on-surface-variant/70">{label}</label>
      {children}
    </div>
  );
}

function SplitByPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const display = value || 'Aggregate';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-2 h-8 px-3 rounded-full bg-white border border-outline-variant/30 text-[11px] font-bold text-on-surface hover:border-primary transition-colors">
          <span className="text-on-surface-variant uppercase tracking-wide text-[10px]">Split:</span>
          <span className="font-black">{display}</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="end">
        {SPLIT_OPTIONS.map(opt => {
          const v = opt === '__none__' ? null : opt;
          const label = opt === '__none__' ? 'Aggregate (no split)' : opt;
          return (
            <button key={opt} type="button" onClick={() => onChange(v)} className={cn(
              'w-full text-left px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors',
              value === v ? 'bg-primary/10 text-primary' : 'text-on-surface hover:bg-surface-container-low'
            )}>{label}</button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

function TopNPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-2 h-8 px-3 rounded-full bg-white border border-outline-variant/30 text-[11px] font-bold text-on-surface hover:border-primary transition-colors">
          <span className="text-on-surface-variant uppercase tracking-wide text-[10px]">Top N:</span>
          <span className="font-black">{value}</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-32 p-1" align="end">
        {TOP_N_OPTIONS.map(n => (
          <button key={n} type="button" onClick={() => onChange(n)} className={cn(
            'w-full text-left px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors',
            value === n ? 'bg-primary/10 text-primary' : 'text-on-surface hover:bg-surface-container-low'
          )}>{n}</button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
