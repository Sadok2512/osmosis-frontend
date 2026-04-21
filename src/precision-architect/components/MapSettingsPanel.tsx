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
                    {chipValues.length > 0 ? (
                      <MapFilterMultiSelect
                        values={chipValues}
                        selected={f.values}
                        onToggle={(val) => toggleFilterValue(f.id, val)}
                        label={dim?.label ?? f.dimension}
                      />
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


/* ── Multi-select filter with inline button chips ── */
function MapFilterMultiSelect({ values, selected, onToggle, label }: {
  values: string[];
  selected: string[];
  onToggle: (val: string) => void;
  label: string;
}) {
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const INITIAL_LIMIT = 24;

  const filtered = search
    ? values.filter(v => v.toLowerCase().includes(search.toLowerCase()))
    : values;
  const visible = showAll || search ? filtered : filtered.slice(0, INITIAL_LIMIT);
  const hiddenCount = filtered.length - visible.length;

  const allSelected = selected.length > 0 && selected.length === values.length;

  return (
    <div className="space-y-2">
      {/* Search + bulk actions */}
      {values.length > 8 && (
        <div className="flex items-center gap-1.5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${label}...`}
            className="flex-1 px-2 py-1 rounded-md border border-outline-variant/30 bg-white text-[11px] outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            onClick={() => {
              if (allSelected) {
                selected.forEach((v) => onToggle(v));
              } else {
                values.filter((v) => !selected.includes(v)).forEach((v) => onToggle(v));
              }
            }}
            className="px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-colors whitespace-nowrap"
          >
            {allSelected ? 'Clear' : 'All'}
          </button>
        </div>
      )}

      {/* Inline button chips */}
      <div className="flex flex-wrap gap-1.5">
        {visible.length === 0 && (
          <p className="text-[10px] text-on-surface-variant/60 italic py-1">No match</p>
        )}
        {visible.map((val) => {
          const active = selected.includes(val);
          return (
            <button
              key={val}
              onClick={() => onToggle(val)}
              className={cn(
                'px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all',
                active
                  ? 'bg-primary text-on-primary border-primary shadow-sm'
                  : 'bg-white text-on-surface border-outline-variant/40 hover:border-primary/50 hover:text-primary'
              )}
            >
              {val}
            </button>
          );
        })}
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(true)}
            className="px-2.5 py-1 rounded-full text-[10px] font-bold border border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors"
          >
            +{hiddenCount} more
          </button>
        )}
        {showAll && filtered.length > INITIAL_LIMIT && !search && (
          <button
            onClick={() => setShowAll(false)}
            className="px-2.5 py-1 rounded-full text-[10px] font-bold border border-dashed border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            Show less
          </button>
        )}
      </div>

      {/* Footer count */}
      {selected.length > 0 && (
        <div className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/70">
          {selected.length} / {values.length} selected
        </div>
      )}
    </div>
  );
}
