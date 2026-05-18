import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Plus, Trash2, ChevronDown, ChevronRight, Check,
  Filter, Eye, Palette, MapPin, Layers, Sun, Moon,
  Map as MapIconLucide, Satellite, Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { subscribeMapSitesCache, getMapSitesDistinct } from './PAMapWidget';
import { ensureFilterLoaded, getFilterValues, dimToKey, subscribe as subscribeCacheUpdates } from '@/stores/investigatorFilterCache';
import { useKpiCatalog } from '@/components/kpi-monitor/api/kpiMonitorApi';
import {
  DynWidget,
  MapWidgetConfig,
  MapFilterChip,
  MapDisplayMode,
  MapTheme,
  MapType,
  DEFAULT_MAP_CONFIG,
} from '../types';
import { toast } from 'sonner';

interface Props {
  widget: DynWidget;
  onChange: (patch: Partial<DynWidget>) => void;
  onClose: () => void;
}

const FILTER_DIMENSIONS: { key: string; label: string; sample: string[] }[] = [
  { key: 'VENDOR', label: 'Vendor', sample: [] },
  { key: 'DOR', label: 'DOR', sample: [] },
  { key: 'PLAQUE', label: 'Plaque', sample: [] },
  { key: 'BANDE', label: 'Bande', sample: [] },
  { key: 'TECHNO', label: 'Techno', sample: [] },
  { key: 'SITE', label: 'Site', sample: [] },
  { key: 'CELL', label: 'Cell', sample: [] },
  { key: 'CLUSTER_B', label: 'Cluster_B', sample: [] },
  { key: 'ARCEP', label: 'Zone ARCEP', sample: [] },
];

type MapTab = 'data' | 'display' | 'appearance';

export default function MapSettingsPanel({ widget, onChange, onClose }: Props) {
  const cfg: MapWidgetConfig = widget.mapConfig ?? DEFAULT_MAP_CONFIG;
  const widgetLabel = `MAP · ${(widget.title && widget.title.trim()) || 'Untitled'}`;

  const [tab, setTab] = useState<MapTab>('data');
  // Re-render when backend filter cache loads values
  const [, setCacheTick] = useState(0);
  useEffect(() => {
    // Preload common filter dimensions
    ['PLAQUE', 'DOR', 'VENDOR', 'BANDE', 'TECHNO', 'CLUSTER_B', 'ARCEP'].forEach(d => {
      try { ensureFilterLoaded(d); } catch {}
    });
    const unsub = subscribeCacheUpdates(() => setCacheTick(t => t + 1));
    return unsub;
  }, []);
  // Re-render whenever the shared sites cache fills/changes so dynamic filter chips appear.
  useEffect(() => subscribeMapSitesCache(() => setCacheTick((t) => t + 1)), []);

  const update = (patch: Partial<MapWidgetConfig>) => {
    onChange({ mapConfig: { ...cfg, ...patch } });
  };

  const addFilter = (dimension: string) => {
    if (cfg.filters.some((f) => f.dimension === dimension)) {
      toast.info(`Filter "${dimension}" already added`);
      return;
    }
    const newFilter: MapFilterChip = {
      id: `flt-${Date.now()}`,
      dimension,
      values: [],
    };
    update({ filters: [...cfg.filters, newFilter] });
  };

  const removeFilter = (id: string) => {
    update({ filters: cfg.filters.filter((f) => f.id !== id) });
  };

  const toggleFilterValue = (id: string, value: string) => {
    update({
      filters: cfg.filters.map((f) => {
        if (f.id !== id) return f;
        const has = f.values.includes(value);
        return { ...f, values: has ? f.values.filter((v) => v !== value) : [...f.values, value] };
      }),
    });
  };

  const applyToWidget = (saveSnapshot: boolean) => {
    const snapshot = structuredClone(cfg);
    const next: Partial<DynWidget> = {
      mapConfig: snapshot,
      appliedMapConfig: snapshot,
      appliedRev: (widget.appliedRev ?? 0) + 1,
    };
    onChange(next);
    toast.success(saveSnapshot ? 'Map saved' : 'Applied to widget');
  };

  const reset = () => {
    onChange({ mapConfig: { ...DEFAULT_MAP_CONFIG } });
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
          <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-black uppercase tracking-widest border border-primary/20">
            Widget scope
          </span>
          <button
            onClick={reset}
            className="px-4 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            Reset
          </button>
          <button
            onClick={() => applyToWidget(false)}
            className="px-4 py-1.5 rounded-lg bg-white border border-primary/40 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/5 transition-colors"
            title="Apply changes only to this map widget"
          >
            Apply to Widget
          </button>
          <button
            onClick={() => applyToWidget(true)}
            className="px-4 py-1.5 rounded-lg bg-primary text-on-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 transition-colors shadow-sm"
            title="Save and apply"
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

      {/* Body: left sidebar tabs + content (mirrors ChartSettingsPanel) */}
      <div className="flex flex-1 min-h-0">
        <aside className="w-48 border-r border-outline-variant/10 p-4 shrink-0 space-y-1 bg-white">
          {([
            { key: 'data', label: 'Data Source', icon: Filter },
            { key: 'display', label: 'Display', icon: Eye },
            { key: 'appearance', label: 'Appearance', icon: Palette },
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
          <div className="max-w-3xl space-y-4">
            {tab === 'data' && (
              <>
                <ToggleRow
                  label="Inherit from Dashboard"
                  value={cfg.inheritFromDashboard}
                  onChange={(v) => update({ inheritFromDashboard: v })}
                />

                <div className="space-y-2">
                  <Label>Active Filters</Label>
                  <div className="flex flex-wrap items-center gap-2 px-2 py-2 rounded-lg border border-outline-variant/20 bg-surface-container-low/40">
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600 mr-1">
                      <Filter className="w-3.5 h-3.5" />
                      <span>Filtres</span>
                    </div>

                    {cfg.filters.map((f) => {
                      const dim = FILTER_DIMENSIONS.find((d) => d.key === f.dimension);
                      // Merge: backend investigator cache (complete) + map cache (live)
                      const cacheKey = dimToKey(f.dimension) || f.dimension.toUpperCase();
                      const cached = getFilterValues(cacheKey);
                      const backendValues = cached?.values ?? [];
                      const liveValues = getMapSitesDistinct(f.dimension);
                      // Use backend values (more complete), fallback to map cache
                      const chipValues = backendValues.length > 0 ? backendValues : liveValues.length > 0 ? liveValues : (dim?.sample ?? []);
                      return (
                        <MapDimensionChip
                          key={f.id}
                          label={dim?.label ?? f.dimension}
                          values={chipValues}
                          selected={f.values}
                          onApply={(vals) => {
                            update({
                              filters: cfg.filters.map((x) => (x.id === f.id ? { ...x, values: vals } : x)),
                            });
                          }}
                          onRemove={() => removeFilter(f.id)}
                        />
                      );
                    })}

                    <AddFilterDropdown
                      onAdd={addFilter}
                      existing={cfg.filters.map((f) => f.dimension)}
                    />

                    {cfg.filters.length > 0 && (
                      <button
                        type="button"
                        onClick={() => update({ filters: [] })}
                        className="flex items-center gap-1 h-7 px-2 text-[11px] font-bold text-on-surface-variant hover:text-error transition-colors"
                      >
                        <X className="w-3 h-3" />
                        <span>Effacer</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {tab === 'display' && (
              <>
                <Field label="Display mode">
                  <Segment<MapDisplayMode>
                    value={cfg.displayMode}
                    onChange={(v) => update({ displayMode: v })}
                    options={[
                      { value: 'sites', label: 'Sites', icon: <MapPin className="w-3 h-3" /> },
                      { value: 'cells', label: 'Cells', icon: <Layers className="w-3 h-3" /> },
                    ]}
                  />
                </Field>

                <KpiSelectorField
                  cfg={cfg}
                  update={update}
                />

                <ToggleRow
                  label="Show sectors / beams"
                  value={cfg.showSectors}
                  onChange={(v) => update({ showSectors: v })}
                />
                <ToggleRow
                  label="Show labels"
                  value={cfg.showLabels}
                  onChange={(v) => update({ showLabels: v })}
                />
                <ToggleRow
                  label="Show lines / connections"
                  value={cfg.showLines}
                  onChange={(v) => update({ showLines: v })}
                />
                <ToggleRow
                  label="Heatmap mode"
                  value={cfg.heatmap}
                  onChange={(v) => update({ heatmap: v })}
                />
              </>
            )}

            {tab === 'appearance' && (
              <>
                <Field label="Map theme">
                  <Segment<MapTheme>
                    value={cfg.theme}
                    onChange={(v) => update({ theme: v })}
                    options={[
                      { value: 'light', label: 'Light', icon: <Sun className="w-3 h-3" /> },
                      { value: 'dark', label: 'Dark', icon: <Moon className="w-3 h-3" /> },
                      { value: 'transparent', label: 'Transparent', icon: <Square className="w-3 h-3" /> },
                    ]}
                  />
                </Field>

                <Field label="Map type">
                  <Segment<MapType>
                    value={cfg.mapType}
                    onChange={(v) => update({ mapType: v })}
                    options={[
                      { value: 'street', label: 'Street', icon: <MapIconLucide className="w-3 h-3" /> },
                      { value: 'satellite', label: 'Satellite', icon: <Satellite className="w-3 h-3" /> },
                    ]}
                  />
                </Field>

                <ToggleRow
                  label="KPI overlay"
                  value={cfg.kpiOverlay}
                  onChange={(v) => update({ kpiOverlay: v })}
                />
                <ToggleRow
                  label="Show legend"
                  value={cfg.showLegend}
                  onChange={(v) => update({ showLegend: v })}
                />

                <Field label="Default site color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={cfg.defaultColor || '#10b981'}
                      onChange={(e) => update({ defaultColor: e.target.value })}
                      className="w-9 h-9 rounded-lg border border-outline-variant/30 cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={cfg.defaultColor || ''}
                      placeholder="auto (theme)"
                      onChange={(e) => update({ defaultColor: e.target.value })}
                      className="flex-1 px-3 py-2 rounded-lg border border-outline-variant/30 text-xs font-mono focus:outline-none focus:border-primary"
                    />
                    {cfg.defaultColor && (
                      <button
                        onClick={() => update({ defaultColor: '' })}
                        className="text-[10px] font-bold text-on-surface-variant hover:text-error transition-colors px-2"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </Field>

              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Subcomponents ── */
function ColorPickerRow({ value, fallback, onChange }: { value: string; fallback: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value || fallback}
        onChange={(e) => onChange(e.target.value)}
        className="w-9 h-9 rounded-lg border border-outline-variant/30 cursor-pointer bg-transparent"
      />
      <input
        type="text"
        value={value || ''}
        placeholder={fallback}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 px-3 py-2 rounded-lg border border-outline-variant/30 text-xs font-mono focus:outline-none focus:border-primary"
      />
    </div>
  );
}

function Accordion({
  title, icon, open, onToggle, children,
}: {
  title: string; icon: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <section className="border border-outline-variant/15 rounded-xl bg-white overflow-hidden h-fit">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-container-low transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-primary">{icon}</span>
          <span className="text-xs font-black uppercase tracking-widest text-on-surface">{title}</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-on-surface-variant" /> : <ChevronRight className="w-4 h-4 text-on-surface-variant" />}
      </button>
      {open && <div className="px-4 pb-4 pt-2 space-y-3 border-t border-outline-variant/10">{children}</div>}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/70">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-surface-container-low transition-colors"
    >
      <span className="text-xs font-bold text-on-surface">{label}</span>
      <div className={cn('w-9 h-5 rounded-full p-0.5 transition-colors shrink-0', value ? 'bg-primary' : 'bg-outline-variant/40')}>
        <div className={cn('w-4 h-4 bg-white rounded-full shadow-sm transition-transform', value && 'translate-x-4')} />
      </div>
    </button>
  );
}

function Segment<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <div className="grid gap-1 p-1 bg-surface-container-low rounded-lg" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest py-2 rounded-md transition-all',
            value === o.value ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AddFilterDropdown({ onAdd, existing }: { onAdd: (key: string) => void; existing: string[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number; width: number } | null>(null);
  const available = FILTER_DIMENSIONS.filter((d) => !existing.includes(d.key));

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setCoords({ left: r.left, top: r.top, width: r.width });
      setSearch('');
      setPicked([]);
    }
    setOpen((o) => !o);
  };

  const togglePick = (key: string) => {
    setPicked((p) => p.includes(key) ? p.filter((k) => k !== key) : [...p, key]);
  };

  const handleConfirm = () => {
    picked.forEach((k) => onAdd(k));
    setOpen(false);
  };

  const handleReset = () => {
    setPicked([]);
    setSearch('');
  };

  if (available.length === 0) {
    return (
      <p className="text-[11px] text-on-surface-variant/60 italic text-center py-2">All filters added.</p>
    );
  }

  const filteredDims = available.filter((d) =>
    d.label.toLowerCase().includes(search.toLowerCase()) ||
    d.key.toLowerCase().includes(search.toLowerCase())
  );

  const PANEL_WIDTH = 280;
  const PANEL_MAX_HEIGHT = 380;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleToggle}
        className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-dashed border-primary/40 text-primary text-[11px] font-black uppercase tracking-widest hover:bg-primary/5 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Ajouter filtre
      </button>
      {open && coords && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            className="fixed bg-white border border-outline-variant/20 rounded-xl shadow-2xl z-[61] flex flex-col overflow-hidden"
            style={{
              left: coords.left,
              top: coords.top - 8,
              width: PANEL_WIDTH,
              maxHeight: PANEL_MAX_HEIGHT,
              transform: 'translateY(-100%)',
            }}
          >
            {/* Header */}
            <div className="px-3 pt-3 pb-2 border-b border-outline-variant/10">
              <div className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/70 mb-2">
                Sélectionner — Dimensions
              </div>
              <div className="relative">
                <Filter className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-full pl-7 pr-2 py-1.5 text-[11px] rounded-full border border-outline-variant/30 bg-surface-container-low/50 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>

            {/* Options */}
            <div className="flex-1 overflow-y-auto py-1">
              {filteredDims.length === 0 && (
                <p className="text-[11px] text-on-surface-variant/60 italic text-center py-3">Aucun résultat</p>
              )}
              {filteredDims.map((d) => {
                const isPicked = picked.includes(d.key);
                return (
                  <button
                    key={d.key}
                    onClick={() => togglePick(d.key)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-on-surface hover:bg-primary/5 transition-colors text-left"
                  >
                    <span
                      className={cn(
                        'w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all',
                        isPicked ? 'border-primary bg-primary' : 'border-outline-variant/50 bg-white'
                      )}
                    >
                      {isPicked && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="truncate">{d.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-outline-variant/10 bg-surface-container-low/40">
              <button
                onClick={handleReset}
                className="text-[11px] font-bold text-on-surface-variant hover:text-on-surface transition-colors"
              >
                Reset
              </button>
              <button
                onClick={handleConfirm}
                disabled={picked.length === 0}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors',
                  picked.length === 0
                    ? 'bg-surface-container-high text-on-surface-variant/50 cursor-not-allowed'
                    : 'bg-primary text-on-primary hover:bg-primary/90 shadow-sm'
                )}
              >
                ✓ Confirm{picked.length > 0 ? ` (${picked.length})` : ''}
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}


/* ── Compact dimension chip with multi-value popover (Investigator-style) ── */
function MapDimensionChip({ label, values, selected, onApply, onRemove }: {
  label: string;
  values: string[];
  selected: string[];
  onApply: (next: string[]) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');

  useEffect(() => {
    if (open) {
      setPending([...selected]);
      setFreeText(values.length === 0 ? selected.join(', ') : '');
      setSearch('');
    }
  }, [open]);

  const filtered = search
    ? values.filter((v) => v.toLowerCase().includes(search.toLowerCase()))
    : values;

  const togglePending = (val: string) => {
    setPending((prev) => prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]);
  };

  const handleConfirm = () => {
    if (values.length === 0) {
      const vals = freeText.split(',').map((v) => v.trim()).filter(Boolean);
      onApply(vals);
    } else {
      onApply(pending);
    }
    setOpen(false);
  };

  const displayText =
    selected.length === 0 ? 'Tous'
    : selected.length === 1 ? selected[0]
    : `${selected.length} sélectionnés`;

  const active = selected.length > 0;

  return (
    <div className="flex items-center">
      <Popover open={open} onOpenChange={(v) => { if (!v) setSearch(''); setOpen(v); }}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-l-full text-[11px] font-bold border border-r-0 transition-all cursor-pointer',
              active
                ? 'bg-primary/10 text-primary border-primary/40'
                : 'bg-white text-on-surface-variant border-outline-variant/40 hover:border-primary/50 hover:text-primary'
            )}
          >
            <span className="opacity-70 font-normal">{label}:</span>
            <span className="font-bold truncate max-w-[140px]">{displayText}</span>
            <ChevronDown className={cn('w-3 h-3 opacity-50 transition-transform', open && 'rotate-180')} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0 rounded-xl shadow-xl border border-border/60 overflow-hidden z-[10000]" align="start" sideOffset={4}>
          <div className="px-3 py-2.5 border-b border-border/30 bg-muted/30">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sélectionner — {label}</h4>
          </div>

          {values.length === 0 ? (
            <div className="p-3 space-y-2">
              <p className="text-[10px] text-muted-foreground">Aucune valeur live — entrez manuellement (séparées par virgule).</p>
              <input
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder={`ex: ${label} A, ${label} B`}
                className="w-full px-2 py-1.5 text-xs rounded-md border border-border/50 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                autoFocus
              />
            </div>
          ) : (
            <>
              <div className="p-2.5">
                <div className="relative">
                  <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher..."
                    className="w-full pl-7 pr-3 py-2 rounded-full border border-border/50 bg-background text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                    autoFocus
                  />
                </div>
              </div>

              <div className="max-h-[240px] overflow-y-auto px-1.5 pb-1">
                {filtered.length === 0 && (
                  <div className="px-3 py-6 text-[10px] text-muted-foreground text-center">Aucun résultat</div>
                )}
                {filtered.slice(0, 200).map((val) => {
                  const isChecked = pending.includes(val);
                  return (
                    <button
                      key={val}
                      onClick={() => togglePending(val)}
                      className={cn(
                        'w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2',
                        isChecked ? 'text-primary bg-primary/5' : 'text-foreground hover:bg-muted/40'
                      )}
                    >
                      <span className={cn(
                        'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all',
                        isChecked ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60 bg-background'
                      )}>
                        {isChecked && <Check className="w-3 h-3" />}
                      </span>
                      <span className="flex-1 truncate">{val}</span>
                    </button>
                  );
                })}
                {filtered.length > 200 && (
                  <div className="px-3 py-2 text-[9px] text-muted-foreground text-center italic">
                    +{filtered.length - 200} résultats — affinez la recherche
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex items-center justify-between px-3 py-2 border-t border-border/40 bg-muted/20">
            <button
              onClick={() => { setPending([]); setFreeText(''); }}
              className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset
            </button>
            <button
              onClick={handleConfirm}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
            >
              <Check className="w-3 h-3" /> Appliquer
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <button
        onClick={onRemove}
        className="h-7 w-7 inline-flex items-center justify-center rounded-r-full border border-l-0 border-outline-variant/40 bg-white hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors"
        aria-label={`Remove ${label} filter`}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function KpiSelectorField({
  cfg,
  update,
}: {
  cfg: MapWidgetConfig;
  update: (patch: Partial<MapWidgetConfig>) => void;
}) {
  const { data: kpiCatalog } = useKpiCatalog();
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = (search || cfg.kpiKey || '').toLowerCase();
    return (kpiCatalog || []).filter(
      (k) => !q || k.kpi_key.toLowerCase().includes(q) || (k.display_name || '').toLowerCase().includes(q),
    ).slice(0, 30);
  }, [kpiCatalog, search, cfg.kpiKey]);

  const select = (k: { kpi_key: string; display_name?: string; unit?: string }) => {
    update({
      kpiKey: k.kpi_key,
      kpiDisplayName: k.display_name || k.kpi_key,
      kpiUnit: k.unit || '',
    });
    setSearch('');
  };

  return (
    <Field label="KPI driving the colour scale">
      <div className="space-y-1">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={search || cfg.kpiKey || ''}
            placeholder="Search a KPI (e.g. ERAB_SR)..."
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearch(cfg.kpiKey || '')}
            className="flex-1 px-3 py-2 rounded-lg border border-outline-variant/30 text-sm font-mono focus:outline-none focus:border-primary"
          />
          {cfg.kpiKey && (
            <button
              type="button"
              onClick={() => update({ kpiKey: '', kpiDisplayName: '', kpiUnit: '' })}
              className="text-[10px] font-bold text-on-surface-variant hover:text-error transition-colors px-2"
            >
              Clear
            </button>
          )}
        </div>
        {cfg.kpiDisplayName && (
          <p className="text-[10px] text-on-surface-variant/70">
            Selected: <span className="font-bold text-on-surface">{cfg.kpiDisplayName}</span>
            {cfg.kpiUnit && <span className="ml-1 opacity-60">({cfg.kpiUnit})</span>}
          </p>
        )}
        {search && filtered.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-outline-variant/20 bg-white shadow-lg">
            {filtered.map((k) => (
              <button
                key={k.kpi_key}
                type="button"
                onClick={() => select(k)}
                className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-primary/5 transition-colors"
              >
                <span className="font-bold">{k.display_name || k.kpi_key}</span>
                {k.unit && <span className="ml-1 text-on-surface-variant/50">({k.unit})</span>}
              </button>
            ))}
          </div>
        )}
        <p className="text-[10px] text-on-surface-variant/50">
          Sites are coloured by this KPI's score against the thresholds in the Appearance tab.
        </p>
      </div>
    </Field>
  );
}
