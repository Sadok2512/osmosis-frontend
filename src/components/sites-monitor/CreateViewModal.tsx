import { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, Search, Filter as FilterIcon, Check, Loader2 } from 'lucide-react';
import { fetchFilterCatalog, fetchDimensionValues, type MonitorFilterDef } from '@/components/kpi-monitor/api/kpiMonitorApi';

// ── Public types (kept compatible with SitesMonitor.tsx consumer) ──
export type ViewType = 'kpi_overlay' | 'topology_search' | 'parameter';
export type AnalysisLevel = 'site' | 'cell' | 'band';

export interface KpiThreshold {
  min: number;
  max: number;
  color: string;
}

export interface KpiOverlayItem {
  kpiKey: string;
  label: string;
  thresholds: KpiThreshold[];
}

export interface ViewConfig {
  name: string;
  type: ViewType;
  technology?: '4G' | '5G';
  level?: AnalysisLevel;
  kpis?: KpiOverlayItem[];
  /** Selected filter values (joined as comma-separated for backwards compat with siteMatchesViewConditions) */
  topoFilters?: Record<string, string>;
  paramFilters?: Record<string, string>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: ViewConfig) => void;
  saving?: boolean;
  /** Kept for API compatibility — unused in the new minimal UI */
  availableKpis?: { key: string; label: string; famille?: string; techno?: string; threshold_warning?: number | null; threshold_critical?: number | null }[];
}

// ── Fallback filter catalog (used if VPS catalog unavailable) ──
const FALLBACK_FILTERS: MonitorFilterDef[] = [
  { dimension_key: 'BCLUSTER', display_name: 'BCluster', multi_select: true, searchable: true, depends_on: [], is_active: true },
  { dimension_key: 'DOR', display_name: 'DOR', multi_select: true, searchable: true, depends_on: [], is_active: true },
  { dimension_key: 'DR', display_name: 'DR', multi_select: true, searchable: true, depends_on: [], is_active: true },
  { dimension_key: 'PLAQUE', display_name: 'Plaque', multi_select: true, searchable: true, depends_on: [], is_active: true },
  { dimension_key: 'VENDOR', display_name: 'Constructeur', multi_select: true, searchable: true, depends_on: [], is_active: true },
  { dimension_key: 'TECHNO', display_name: 'Techno', multi_select: true, searchable: true, depends_on: [], is_active: true },
  { dimension_key: 'BAND', display_name: 'Bande', multi_select: true, searchable: true, depends_on: [], is_active: true },
  { dimension_key: 'ZONE_ARCEP', display_name: 'Zone ARCEP', multi_select: true, searchable: true, depends_on: [], is_active: true },
];

interface PickedFilter {
  key: string;
  label: string;
  values: string[];
}

export function CreateViewModal({ open, onOpenChange, onSave, saving }: Props) {
  const [name, setName] = useState('');
  const [catalog, setCatalog] = useState<MonitorFilterDef[]>(FALLBACK_FILTERS);
  const [picked, setPicked] = useState<PickedFilter[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setName('');
      setPicked([]);
      setPickerOpen(false);
      setPickerSearch('');
    }
  }, [open]);

  // Load filter catalog from Investigator backend (with graceful fallback)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchFilterCatalog();
        if (cancelled) return;
        const active = (list || []).filter(f => f.is_active !== false);
        // Always ensure BCluster is offered
        if (!active.find(f => f.dimension_key === 'BCLUSTER')) {
          active.unshift({ dimension_key: 'BCLUSTER', display_name: 'BCluster', multi_select: true, searchable: true, depends_on: [], is_active: true });
        }
        if (active.length > 0) setCatalog(active);
      } catch {
        /* keep fallback */
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [pickerOpen]);

  const availableForPicker = useMemo(() => {
    const taken = new Set(picked.map(p => p.key));
    const q = pickerSearch.trim().toLowerCase();
    return catalog
      .filter(f => !taken.has(f.dimension_key))
      .filter(f => !q || f.display_name.toLowerCase().includes(q) || f.dimension_key.toLowerCase().includes(q));
  }, [catalog, picked, pickerSearch]);

  const addFilter = (def: MonitorFilterDef) => {
    setPicked(prev => [...prev, { key: def.dimension_key, label: def.display_name, values: [] }]);
    setPickerOpen(false);
    setPickerSearch('');
  };

  const removeFilter = (key: string) => setPicked(prev => prev.filter(p => p.key !== key));
  const setFilterValues = (key: string, values: string[]) =>
    setPicked(prev => prev.map(p => p.key === key ? { ...p, values } : p));

  const isValid = name.trim().length > 0 && picked.length > 0 && picked.every(p => p.values.length > 0);

  const handleCreate = () => {
    if (!isValid) return;
    const topoFilters: Record<string, string> = {};
    for (const p of picked) {
      // Lowercase the key to match siteMatchesViewConditions consumer convention
      topoFilters[p.key.toLowerCase()] = p.values.join(',');
    }
    onSave({
      name: name.trim(),
      type: 'topology_search',
      topoFilters,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden border border-border/60 shadow-2xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border/60">
          <h2 className="text-lg font-bold tracking-tight text-foreground">Créer un dashboard</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Nommez votre dashboard et ajoutez les filtres souhaités
          </p>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Nom du dashboard
            </label>
            <Input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Performance NANTES — 4G"
              className="h-10 text-sm rounded-lg"
            />
          </div>

          {/* Filters section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FilterIcon className="w-3 h-3" />
                Filtres
                {picked.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold">
                    {picked.length}
                  </span>
                )}
              </label>
            </div>

            {/* Picked filter cards */}
            <div className="space-y-2">
              {picked.map(p => (
                <FilterCard
                  key={p.key}
                  filter={p}
                  onChange={(values) => setFilterValues(p.key, values)}
                  onRemove={() => removeFilter(p.key)}
                />
              ))}

              {picked.length === 0 && (
                <div className="rounded-xl border border-dashed border-border/80 bg-muted/30 px-4 py-6 text-center">
                  <p className="text-xs text-muted-foreground">
                    Aucun filtre. Ajoutez-en un ci-dessous.
                  </p>
                </div>
              )}
            </div>

            {/* Add filter button + dropdown */}
            <div className="relative" ref={pickerRef}>
              <button
                type="button"
                onClick={() => setPickerOpen(o => !o)}
                disabled={availableForPicker.length === 0 && !pickerSearch}
                className="w-full mt-1 flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-dashed border-border hover:border-primary hover:bg-primary/5 hover:text-primary text-xs font-semibold text-muted-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter un filtre
              </button>

              {pickerOpen && (
                <div className="absolute z-50 left-0 right-0 mt-1.5 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden">
                  <div className="p-2 border-b border-border/60">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        autoFocus
                        value={pickerSearch}
                        onChange={e => setPickerSearch(e.target.value)}
                        placeholder="Rechercher un filtre..."
                        className="w-full h-8 pl-8 pr-2 rounded-md bg-background border border-border text-xs focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="max-h-56 overflow-y-auto py-1">
                    {availableForPicker.length === 0 && (
                      <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                        Aucun filtre disponible
                      </div>
                    )}
                    {availableForPicker.map(f => (
                      <button
                        key={f.dimension_key}
                        type="button"
                        onClick={() => addFilter(f)}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors flex items-center gap-2"
                      >
                        <FilterIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{f.display_name}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground/70 font-mono">
                          {f.dimension_key}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/60 bg-muted/30 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="h-9">
            Annuler
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!isValid || saving}
            className="h-9 min-w-[110px]"
          >
            {saving ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Création…</>
            ) : (
              'Créer'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Sub-component: one filter card with multi-select chip input ── */

function FilterCard({
  filter,
  onChange,
  onRemove,
}: {
  filter: PickedFilter;
  onChange: (values: string[]) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Lazy-load values from backend on first open
  useEffect(() => {
    if (!open || options !== null) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetchDimensionValues(filter.key);
        if (!cancelled) setOptions(res?.values || []);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, filter.key, options]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = options ?? [];
    if (!q) return list.slice(0, 200);
    return list.filter(v => v.toLowerCase().includes(q)).slice(0, 200);
  }, [options, search]);

  const toggle = (v: string) => {
    const has = filter.values.includes(v);
    onChange(has ? filter.values.filter(x => x !== v) : [...filter.values, v]);
  };

  const addCustom = () => {
    const v = search.trim();
    if (!v) return;
    if (!filter.values.includes(v)) onChange([...filter.values, v]);
    setSearch('');
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-muted/20">
        <FilterIcon className="w-3 h-3 text-primary shrink-0" />
        <span className="text-xs font-bold text-foreground">{filter.label}</span>
        {filter.values.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold">
            {filter.values.length}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="ml-auto text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          {open ? 'Masquer' : 'Modifier'}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          aria-label={`Retirer ${filter.label}`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Selected value chips */}
      {filter.values.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 py-2">
          {filter.values.map(v => (
            <span
              key={v}
              className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold"
            >
              {v}
              <button
                type="button"
                onClick={() => toggle(v)}
                className="w-4 h-4 rounded-full hover:bg-primary/20 flex items-center justify-center"
                aria-label={`Retirer ${v}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Value picker */}
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
              placeholder={`Rechercher ${filter.label.toLowerCase()}...`}
              className="w-full h-8 pl-8 pr-2 rounded-md bg-background border border-border text-xs focus:outline-none focus:border-primary"
            />
          </div>

          <div className="max-h-40 overflow-y-auto rounded-md border border-border/60 bg-background">
            {loading && (
              <div className="px-3 py-4 text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Chargement…
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">
                {search ? (
                  <>
                    Aucun résultat.{' '}
                    <button onClick={addCustom} className="text-primary font-semibold hover:underline">
                      Ajouter "{search}"
                    </button>
                  </>
                ) : (
                  'Aucune valeur disponible'
                )}
              </div>
            )}
            {!loading && filtered.map(v => {
              const selected = filter.values.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggle(v)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-muted transition-colors"
                >
                  <span className={
                    'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ' +
                    (selected ? 'bg-primary border-primary text-primary-foreground' : 'border-input bg-background')
                  }>
                    {selected && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                  </span>
                  <span className="truncate">{v}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
