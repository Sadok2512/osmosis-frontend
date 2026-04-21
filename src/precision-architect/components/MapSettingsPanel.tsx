import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Plus, Trash2, ChevronDown, ChevronRight,
  Filter, Eye, Palette, MapPin, Layers, Sun, Moon,
  Map as MapIconLucide, Satellite,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { subscribeMapSitesCache, getMapSitesDistinct } from './PAMapWidget';
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
];

export default function MapSettingsPanel({ widget, onChange, onClose }: Props) {
  const cfg: MapWidgetConfig = widget.mapConfig ?? DEFAULT_MAP_CONFIG;
  const widgetLabel = `MAP · ${(widget.title && widget.title.trim()) || 'Untitled'}`;

  const [openSections, setOpenSections] = useState({ data: true, display: true, appearance: true });
  // Re-render whenever the shared sites cache fills/changes so dynamic filter chips appear.
  const [, setCacheTick] = useState(0);
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
    const next: Partial<DynWidget> = {
      mapConfig: { ...cfg },
      appliedMapConfig: { ...cfg },
      appliedRev: (widget.appliedRev ?? 0) + 1,
    };
    onChange(next);
    toast.success(saveSnapshot ? 'Map saved' : 'Applied to widget');
  };

  const reset = () => {
    onChange({ mapConfig: { ...DEFAULT_MAP_CONFIG } });
  };

  return (
    <div className="h-[clamp(14rem,38vh,28rem)] bg-white border-t border-outline-variant/20 shadow-2xl relative z-40 shrink-0 flex flex-col">
      {/* Header */}
      <div className="px-8 py-3 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low shrink-0">
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

      {/* Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ── A. Data Source ── */}
          <Accordion
            title="Data Source"
            icon={<Filter className="w-4 h-4" />}
            open={openSections.data}
            onToggle={() => setOpenSections((s) => ({ ...s, data: !s.data }))}
          >
            <ToggleRow
              label="Inherit from Dashboard"
              value={cfg.inheritFromDashboard}
              onChange={(v) => update({ inheritFromDashboard: v })}
            />

            <div className="space-y-2">
              <Label>Active Filters</Label>
              {cfg.filters.length === 0 && (
                <p className="text-[11px] text-on-surface-variant/70 italic">No filters yet — add one below.</p>
              )}
              {cfg.filters.map((f) => {
                const dim = FILTER_DIMENSIONS.find((d) => d.key === f.dimension);
                // Always prefer real distinct values from currently-loaded sites.
                const liveValues = getMapSitesDistinct(f.dimension);
                // For free-text dims (SITE/CELL) we still fall back to a text input when no live values exist.
                const chipValues = liveValues.length > 0 ? liveValues : (dim?.sample ?? []);
                // Cap the visible chip count to keep the UI readable; user can search via text input fallback.
                const MAX_CHIPS = 60;
                const visibleChips = chipValues.slice(0, MAX_CHIPS);
                return (
                  <div key={f.id} className="border border-outline-variant/20 rounded-lg p-2 bg-surface-container-low/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                        {dim?.label ?? f.dimension}
                        {liveValues.length > 0 && (
                          <span className="ml-1.5 text-on-surface-variant/60 font-bold normal-case tracking-normal">
                            · {liveValues.length} live
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => removeFilter(f.id)}
                        className="p-1 text-on-surface-variant hover:text-error hover:bg-error/10 rounded transition-colors"
                        aria-label="Remove filter"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    {visibleChips.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {visibleChips.map((val) => {
                          const active = f.values.includes(val);
                          return (
                            <button
                              key={val}
                              onClick={() => toggleFilterValue(f.id, val)}
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors',
                                active
                                  ? 'bg-primary text-on-primary border-primary'
                                  : 'bg-white text-on-surface-variant border-outline-variant/30 hover:border-primary/40'
                              )}
                            >
                              {val}
                            </button>
                          );
                        })}
                        {chipValues.length > MAX_CHIPS && (
                          <span className="text-[10px] text-on-surface-variant/60 px-1">
                            +{chipValues.length - MAX_CHIPS} more…
                          </span>
                        )}
                      </div>
                    ) : (
                      <input
                        type="text"
                        placeholder={`Enter ${dim?.label ?? f.dimension} (comma separated)`}
                        defaultValue={f.values.join(', ')}
                        onBlur={(e) => {
                          const vals = e.target.value
                            .split(',')
                            .map((v) => v.trim())
                            .filter(Boolean);
                          update({
                            filters: cfg.filters.map((x) => (x.id === f.id ? { ...x, values: vals } : x)),
                          });
                        }}
                        className="w-full px-2 py-1 text-[11px] rounded border border-outline-variant/30 focus:outline-none focus:border-primary"
                      />
                    )}
                  </div>
                );
              })}

              <AddFilterDropdown
                onAdd={addFilter}
                existing={cfg.filters.map((f) => f.dimension)}
              />
            </div>
          </Accordion>

          {/* ── B. Display Mode ── */}
          <Accordion
            title="Display"
            icon={<Eye className="w-4 h-4" />}
            open={openSections.display}
            onToggle={() => setOpenSections((s) => ({ ...s, display: !s.display }))}
          >
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
          </Accordion>

          {/* ── C. Appearance ── */}
          <Accordion
            title="Appearance"
            icon={<Palette className="w-4 h-4" />}
            open={openSections.appearance}
            onToggle={() => setOpenSections((s) => ({ ...s, appearance: !s.appearance }))}
          >
            <Field label="Map theme">
              <Segment<MapTheme>
                value={cfg.theme}
                onChange={(v) => update({ theme: v })}
                options={[
                  { value: 'light', label: 'Light', icon: <Sun className="w-3 h-3" /> },
                  { value: 'dark', label: 'Dark', icon: <Moon className="w-3 h-3" /> },
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
          </Accordion>
        </div>
      </div>
    </div>
  );
}

/* ── Subcomponents ── */
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
  const btnRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number; width: number } | null>(null);
  const available = FILTER_DIMENSIONS.filter((d) => !existing.includes(d.key));

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      // Position dropdown ABOVE the button, anchored to its top edge.
      setCoords({ left: r.left, top: r.top, width: r.width });
    }
    setOpen((o) => !o);
  };

  if (available.length === 0) {
    return (
      <p className="text-[11px] text-on-surface-variant/60 italic text-center py-2">All filters added.</p>
    );
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleToggle}
        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border-2 border-dashed border-primary/30 text-primary text-[11px] font-black uppercase tracking-widest hover:bg-primary/5 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Filter
      </button>
      {open && coords && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            className="fixed bg-white border border-outline-variant/20 rounded-lg shadow-xl z-[61] py-1 max-h-64 overflow-y-auto"
            style={{
              left: coords.left,
              top: coords.top - 8,
              width: coords.width,
              transform: 'translateY(-100%)',
            }}
          >
            {available.map((d) => (
              <button
                key={d.key}
                onClick={() => { onAdd(d.key); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs font-bold text-on-surface hover:bg-primary/5 hover:text-primary transition-colors"
              >
                {d.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
