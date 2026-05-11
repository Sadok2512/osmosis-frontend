import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart2, Search, ChevronLeft, ChevronRight, Plus, X, Palette, Settings2, Loader2, Radio, ChevronDown, Check, Map as MapIcon } from 'lucide-react';
import { getVpsProxyUrl, getVpsProxyHeaders } from '@/lib/apiConfig';
import { topoApi } from '@/lib/localDb';
// ProgressiveFilterBuilder import removed 2026-05-07 — Topology Search
// now uses the row-based builder in step 2 (per UX spec).

// ── Types ──
export type ViewType = 'kpi_overlay' | 'topology_search' | 'parameter' | 'coverage';
export type AnalysisLevel = 'site' | 'cell' | 'band';

/** Row-based Topology Search payload — matches the spec the user
 *  defined for "Nouvelle vue → Topology Search". `field` is a code
 *  from public.dimension_definitions (PCI, TAC_4G, CONSTRUCTEUR, …);
 *  `operator` defaults to IN. Filters combine with `logic` between
 *  rows. The osmosis-parser :8000 endpoint /api/v1/topo/sites accepts
 *  this payload as the `topo_search={JSON}` query param (extension
 *  added 2026-05-07). */
export type TopoSearchOperator = 'IN' | 'NOT_IN' | '=' | '!=';
export interface TopoSearchFilter {
  field: string;
  operator: TopoSearchOperator;
  values: string[];
}
export interface TopoSearchPayload {
  logic: 'OR' | 'AND';
  filters: TopoSearchFilter[];
}

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
  // KPI Overlay
  technology?: '4G' | '5G';
  level?: AnalysisLevel;
  kpis?: KpiOverlayItem[];
  dateFrom?: string;
  dateTo?: string;
  // Topology Search
  /** Topology Search row-builder payload (replaces the previous
   *  ProgressiveFilterBuilder DashboardSiteFilters shape on 2026-05-07
   *  per UX spec — multi-value comma-separated input, OR/AND logic
   *  between rows). */
  topoSearch?: TopoSearchPayload;
  // Parameter
  paramFilters?: Record<string, string>;
  // Visual Coverage (replaces the previous RSRP "Coverage Prediction").
  // Pure-topology Voronoi dominance polygons; the only knob is the
  // max-radius cap that prevents large gaps at the bbox edge from
  // generating unrealistic tiles.
  coverageMaxRadiusM?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: ViewConfig) => void;
  saving?: boolean;
  availableKpis?: { key: string; label: string; famille?: string; techno?: string; threshold_warning?: number | null; threshold_critical?: number | null }[];
}

const DEFAULT_THRESHOLDS: KpiThreshold[] = [
  { min: 0, max: 10, color: '#ef4444' },
  { min: 10, max: 50, color: '#f59e0b' },
  { min: 50, max: 100, color: '#22c55e' },
];

// TOPO_FILTER_KEYS removed 2026-05-07 — Topology Search now uses
// ProgressiveFilterBuilder over the 46-dim catalog (see step-2 block below).

const PARAM_FILTER_KEYS = [
  { key: 'parameter', label: 'Paramètre' },
  { key: 'site_name', label: 'Site' },
  { key: 'cell_name', label: 'Cellule' },
  { key: 'bande', label: 'Bande' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'value', label: 'Valeur' },
];

/** Lazy multiselect / text-input fallback for one Topology Search row.
 *
 * Behavior (per UX request 2026-05-07):
 *   * No field selected → disabled placeholder.
 *   * Field selected, values loading → "Chargement…" disabled input.
 *   * Field selected, values loaded with N entries:
 *       - 0 < N ≤ 20  → checkbox multiselect (no search bar — list short).
 *       - N > 20      → checkbox multiselect with search bar.
 *   * Field selected but values list errors / is empty → fall back to
 *     comma-separated text input (the original 2026-05-07 spec UX),
 *     so unmapped or unpopulated dims (PCI/NR_ARFCN/BSCID etc.) still
 *     work via free-text entry.
 *
 * The multiselect path writes to `values: string[]` directly. The text
 * fallback writes to `valuesText: string`. Save logic prefers `values`
 * when non-empty, else parses `valuesText`. */
// Parse a row's free-text value field into a clean string[] — split on
// commas, trim each entry, drop empties. "150, 200, 320" → ["150","200","320"].
// Module-scope so TopoRowValueInput (defined below) and the modal body
// (defined further down) share one canonical implementation.
const parseValuesText = (text: string): string[] =>
  text.split(',').map(s => s.trim()).filter(Boolean);

type ValueValidation = 'checking' | 'valid' | 'invalid';

const TopoRowValueInput: React.FC<{
  field: string;
  values: string[];
  valuesText: string;
  onValuesChange: (values: string[]) => void;
  onValuesTextChange: (text: string) => void;
  hasError?: boolean;
}> = ({ field, values, valuesText, onValuesChange, onValuesTextChange, hasError }) => {
  const [available, setAvailable] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [validations, setValidations] = useState<Record<string, ValueValidation>>({});
  const ref = useRef<HTMLDivElement>(null);

  // Outside-click close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Fetch this dim's distinct values when the field changes
  useEffect(() => {
    if (!field) {
      setAvailable([]);
      setLoading(false);
      setErrored(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    topoApi.filterValues(field)
      .then(vals => {
        if (cancelled) return;
        setAvailable(vals);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setAvailable([]);
        setErrored(true);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [field]);

  // ── Per-typed-value backend validation (text-input fallback only) ──
  // When the dim's distinct list isn't loadable, the row falls back to
  // free-text entry. We then ping the backend with `?dimension=&search=v`
  // for each typed value (debounced) and tag it ✓ valid / ✗ invalid.
  // For PCI today the column is empty in topo_data, so every value
  // honestly tags as ✗ — it's not a UI bug, the underlying data is
  // missing (parser-mapping issue).
  const inTextMode = !!field && !loading && (errored || available.length === 0);
  const parsedValues = useMemo(() => parseValuesText(valuesText), [valuesText]);
  const parsedKey = parsedValues.join('|');
  useEffect(() => {
    if (!inTextMode || !field || parsedValues.length === 0) {
      setValidations({});
      return;
    }
    let cancelled = false;
    const debounce = setTimeout(async () => {
      if (cancelled) return;
      // Mark unknown ones as 'checking'; preserve already-resolved verdicts
      // until the new verdict lands so the UI doesn't flicker on every keystroke.
      setValidations(prev => {
        const next: Record<string, ValueValidation> = {};
        for (const v of parsedValues) {
          next[v] = prev[v] === 'valid' || prev[v] === 'invalid' ? prev[v] : 'checking';
        }
        return next;
      });
      const results = await Promise.all(parsedValues.map(async v => {
        try {
          const matches = await topoApi.filterValues(field, undefined, { search: v, limit: 10 });
          const exists = matches.some(m => String(m).toLowerCase() === v.toLowerCase());
          return [v, exists ? 'valid' : 'invalid'] as const;
        } catch {
          return [v, 'invalid'] as const;
        }
      }));
      if (cancelled) return;
      setValidations(Object.fromEntries(results) as Record<string, ValueValidation>);
    }, 500);
    return () => { cancelled = true; clearTimeout(debounce); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedKey, field, inTextMode]);

  const renderValidationBadges = () => {
    if (!inTextMode || parsedValues.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {parsedValues.map(v => {
          const s = validations[v];
          const cls = s === 'valid'
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : s === 'invalid'
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : 'border-border bg-muted/30 text-muted-foreground';
          const icon = s === 'valid'
            ? <Check size={9} />
            : s === 'invalid'
              ? <X size={9} />
              : <Loader2 size={9} className="animate-spin" />;
          return (
            <span
              key={v}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-medium ${cls}`}
              title={
                s === 'valid' ? `Existe dans ${field}` :
                s === 'invalid' ? `Introuvable dans ${field}` :
                `Vérification…`
              }
            >
              {icon}
              <span className="font-mono">{v}</span>
            </span>
          );
        })}
      </div>
    );
  };

  // No field selected — disabled placeholder
  if (!field) {
    return (
      <Input
        disabled
        placeholder="Sélectionnez d'abord un type de filtre"
        className="text-xs h-8"
      />
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 h-8 rounded-md border border-input bg-muted/30 text-[10px] text-muted-foreground">
        <Loader2 size={11} className="animate-spin" /> Chargement des valeurs…
      </div>
    );
  }

  // Failed/empty → text input fallback (comma-separated entry).
  // This preserves the original UX spec for dims whose distinct list
  // is unavailable (e.g. PCI/BSCID columns currently unpopulated).
  if (errored || available.length === 0) {
    return (
      <div>
        <Input
          value={valuesText}
          onChange={e => onValuesTextChange(e.target.value)}
          placeholder="Valeur… (séparées par virgules : 150, 200, 320)"
          className={`text-xs h-8 ${hasError ? 'border-destructive' : ''}`}
        />
        {renderValidationBadges()}
      </div>
    );
  }

  // Multiselect mode. Search bar appears when list > 20 (per user request).
  const useSearch = available.length > 20;
  const filtered = useSearch && search.trim()
    ? available.filter(v => v.toLowerCase().includes(search.toLowerCase()))
    : available;
  const toggle = (val: string) => {
    onValuesChange(values.includes(val) ? values.filter(v => v !== val) : [...values, val]);
  };

  /** Comma-separated paste mode inside the multiselect dropdown.
   *  The user can paste "150, 200, 320" to add several values at once
   *  instead of scrolling through 957 PCIs. Each parsed value is matched
   *  case-insensitively against `available`; matched values get the
   *  canonical case from the catalog, unmatched values are still added
   *  (the user knows their topology better than the dim's distinct list,
   *  and the backend will validate at query time). */
  const applyPaste = () => {
    const pasted = parseValuesText(pasteText);
    if (pasted.length === 0) return;
    const lookup = new Map<string, string>(available.map(v => [v.toLowerCase(), v]));
    const next = new Set(values);
    for (const v of pasted) {
      next.add(lookup.get(v.toLowerCase()) || v);
    }
    onValuesChange(Array.from(next));
    setPasteText('');
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 px-3 h-8 rounded-md border bg-background text-left transition-all ${
          open ? 'border-primary ring-2 ring-primary/15' : hasError ? 'border-destructive' : values.length > 0 ? 'border-primary/40' : 'border-input'
        }`}
      >
        <span className={`flex-1 truncate text-xs ${values.length > 0 ? 'text-foreground' : 'text-muted-foreground/70'}`}>
          {values.length === 0
            ? `Sélectionner une ou plusieurs valeurs (${available.length})`
            : values.length <= 3
              ? values.join(', ')
              : `${values.length} valeurs sélectionnées`}
        </span>
        <ChevronDown size={12} className={`text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-[200] bg-popover rounded-lg border border-border shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
          {useSearch && (
            <div className="px-2 pt-2 pb-1.5">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 border border-border">
                <Search size={11} className="text-muted-foreground shrink-0" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher…"
                  className="flex-1 bg-transparent text-[10px] text-foreground placeholder:text-muted-foreground/50 outline-none"
                  autoFocus
                />
              </div>
            </div>
          )}
          {/* Paste mode: comma-separated bulk insert. Faster than scrolling
              through 957 PCIs to find the 3 you want. Enter or click Ajouter
              to apply; values matched against the catalog get canonical case,
              unmatched values are kept verbatim. */}
          <div className="px-2 pt-1.5 pb-1.5">
            <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-muted/30 border ${pasteText.trim() ? 'border-primary/40' : 'border-border'}`}>
              <Plus size={11} className="text-muted-foreground shrink-0" />
              <input
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyPaste();
                  }
                }}
                placeholder="Ou collez : 150, 200, 320"
                className="flex-1 bg-transparent text-[10px] text-foreground placeholder:text-muted-foreground/50 outline-none font-mono"
              />
              {pasteText.trim() && (
                <button
                  type="button"
                  onClick={applyPaste}
                  className="text-[9px] font-bold text-primary px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 transition-colors shrink-0"
                  title="Ajouter ces valeurs"
                >
                  Ajouter
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-border/40">
            <button
              type="button"
              onClick={() => onValuesChange([...filtered])}
              className="text-[9px] font-semibold text-primary hover:underline"
            >
              Tout sélectionner
            </button>
            <span className="text-muted-foreground/40">·</span>
            <button
              type="button"
              onClick={() => onValuesChange([])}
              className="text-[9px] font-semibold text-destructive hover:underline"
            >
              Effacer
            </button>
            <span className="ml-auto text-[9px] text-muted-foreground/60">
              {values.length}/{available.length}
            </span>
          </div>
          <div className="max-h-[220px] overflow-y-auto py-0.5">
            {filtered.length === 0 ? (
              <p className="text-[9px] text-muted-foreground/60 text-center py-3 italic">Aucun résultat</p>
            ) : (
              filtered.map(val => {
                const isSelected = values.includes(val);
                return (
                  <button
                    type="button"
                    key={val}
                    onClick={() => toggle(val)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[10px] transition-colors ${
                      isSelected ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-primary border-primary' : 'border-border'
                    }`}>
                      {isSelected && <Check size={9} className="text-primary-foreground" />}
                    </div>
                    <span className="truncate font-medium">{val}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/** Searchable single-select for the Topology Search row's dim chooser.
 *  shadcn's <Select> doesn't have a built-in search box, and 46 dims is
 *  enough that scrolling becomes friction — this gives the user the
 *  same "Rechercher…" affordance as the value multiselect below. */
const DimFieldSelect: React.FC<{
  value: string;
  options: { id: string; label: string; category?: string }[];
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  hasError?: boolean;
}> = ({ value, options, onChange, disabled, placeholder, hasError }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(o =>
      o.label.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q) ||
      (o.category || '').toLowerCase().includes(q)
    );
  }, [options, search]);

  const selected = options.find(o => o.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 px-3 h-8 rounded-md border bg-background text-left transition-all ${
          open ? 'border-primary ring-2 ring-primary/15' : hasError ? 'border-destructive' : selected ? 'border-primary/40' : 'border-input'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className={`flex-1 truncate text-xs ${selected ? 'text-foreground' : 'text-muted-foreground/70'}`}>
          {selected ? (
            <>
              <span className="font-semibold">{selected.label}</span>
              {selected.category && <span className="ml-2 text-[9px] text-muted-foreground/60">{selected.category}</span>}
            </>
          ) : (placeholder || 'Sélectionner un filtre')}
        </span>
        <ChevronDown size={12} className={`text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-1 z-[200] bg-popover rounded-lg border border-border shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="px-2 pt-2 pb-1.5">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 border border-border">
              <Search size={11} className="text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un filtre…"
                className="flex-1 bg-transparent text-[10px] text-foreground placeholder:text-muted-foreground/50 outline-none"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[260px] overflow-y-auto py-0.5">
            {filtered.length === 0 ? (
              <p className="text-[9px] text-muted-foreground/60 text-center py-3 italic">Aucun résultat</p>
            ) : (
              filtered.map(opt => {
                const isSel = opt.id === value;
                return (
                  <button
                    type="button"
                    key={opt.id}
                    onClick={() => { onChange(opt.id); setOpen(false); setSearch(''); }}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-[10px] transition-colors ${
                      isSel ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    <span className="font-semibold uppercase tracking-wider truncate">{opt.label}</span>
                    {opt.category && (
                      <span className="text-[9px] text-muted-foreground/60 shrink-0 normal-case">{opt.category}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const CreateViewModal = React.forwardRef<HTMLDivElement, Props>(function CreateViewModal(
  { open, onOpenChange, onSave, saving, availableKpis = [] }: Props,
  ref,
) {
  const [step, setStep] = useState<1 | 2>(1);
  const [viewType, setViewType] = useState<ViewType | null>(null);
  const [name, setName] = useState('');

  // KPI Overlay state
  const [technology, setTechnology] = useState<'4G' | '5G'>('4G');
  const [level, setLevel] = useState<AnalysisLevel>('cell');
  const [selectedKpis, setSelectedKpis] = useState<KpiOverlayItem[]>([]);
  const [kpiSearch, setKpiSearch] = useState('');

  // Topology Search state — row-based builder per 2026-05-07 spec.
  // Each row carries the dim code (`field`), an operator (default IN),
  // and TWO value-storage fields:
  //   * `values: string[]`     — populated when the multiselect mode renders
  //                              (dims whose distinct value list loads with N>0).
  //   * `valuesText: string`   — comma-separated text input fallback
  //                              (when the dim's value list errors or is empty).
  // Save prefers `values` when non-empty; otherwise parses `valuesText`.
  type TopoSearchRow = {
    id: string;
    field: string;
    operator: TopoSearchOperator;
    values: string[];
    valuesText: string;
  };
  const newTopoSearchRow = (): TopoSearchRow => ({
    id: (typeof crypto !== 'undefined' ? crypto.randomUUID() : String(Math.random())),
    field: '',
    operator: 'IN',
    values: [],
    valuesText: '',
  });
  const [topoSearchLogic, setTopoSearchLogic] = useState<'OR' | 'AND'>('OR');
  const [topoSearchRows, setTopoSearchRows] = useState<TopoSearchRow[]>(() => [newTopoSearchRow()]);

  /** Resolve a row to its effective values list (multiselect first, then
   *  comma-parsed text). Used by validation and save. */
  const rowValues = (r: TopoSearchRow): string[] =>
    r.values.length > 0 ? r.values : parseValuesText(r.valuesText);
  const [topoCatalog, setTopoCatalog] = useState<{ id: string; label: string; values: string[]; category?: string; rat?: string }[]>([]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    topoApi.filterCatalog()
      .then(d => { if (!cancelled) setTopoCatalog(d.filters || []); })
      .catch(err => console.warn('[CreateViewModal] filterCatalog failed', err));
    return () => { cancelled = true; };
  }, [open]);

  // KPI date range
  const [kpiDateFrom, setKpiDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [kpiDateTo, setKpiDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Parameter state
  const [paramFilters, setParamFilters] = useState<Record<string, string>>({});
  const [activeParamKeys, setActiveParamKeys] = useState<string[]>(['parameter']);
  const [paramSearchQuery, setParamSearchQuery] = useState('');
  const [paramSearchResults, setParamSearchResults] = useState<string[]>([]);
  const [paramSearchLoading, setParamSearchLoading] = useState(false);
  const [paramListOpen, setParamListOpen] = useState(false);

  // Debounced parameter search from backend
  useEffect(() => {
    if (!paramSearchQuery || paramSearchQuery.length < 2) {
      setParamSearchResults([]);
      return;
    }
    setParamSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const url = getVpsProxyUrl('parser', `/api/v1/topo/param-list?search=${encodeURIComponent(paramSearchQuery)}&object_type=CELL&limit=50`);
        const resp = await fetch(url, { headers: getVpsProxyHeaders() });
        if (resp.ok) {
          const data = await resp.json();
          const items = Array.isArray(data) ? data : [];
          setParamSearchResults(items.map((v: any) => typeof v === 'string' ? v : v.name || v.value || '').filter(Boolean));
        }
      } catch { setParamSearchResults([]); }
      finally { setParamSearchLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [paramSearchQuery]);

  // Reset when closing
  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setStep(1);
      setViewType(null);
      setName('');
      setTechnology('4G');
      setLevel('cell');
      setSelectedKpis([]);
      setKpiSearch('');
      setTopoSearchLogic('OR');
      setTopoSearchRows([newTopoSearchRow()]);
      setParamFilters({});
      setActiveParamKeys(['parameter']);
      setCoverageMaxRadiusM(1500);
    }
    onOpenChange(o);
  };

  // Filtered KPIs by techno
  const filteredKpis = useMemo(() => {
    const technoLower = technology.toLowerCase();
    let kpis = availableKpis.filter(k =>
      !k.techno || k.techno.toLowerCase() === technoLower || k.techno.toLowerCase() === 'all'
    );
    if (kpiSearch.trim()) {
      const q = kpiSearch.toLowerCase();
      kpis = kpis.filter(k => k.label.toLowerCase().includes(q) || k.key.toLowerCase().includes(q));
    }
    return kpis;
  }, [availableKpis, technology, kpiSearch]);

  // Group by famille
  const groupedKpis = useMemo(() => {
    const groups: Record<string, typeof filteredKpis> = {};
    for (const k of filteredKpis) {
      const g = k.famille || 'Autres';
      if (!groups[g]) groups[g] = [];
      groups[g].push(k);
    }
    return groups;
  }, [filteredKpis]);

  const addKpi = (kpi: typeof availableKpis[0]) => {
    if (selectedKpis.find(s => s.kpiKey === kpi.key)) return;
    const thresholds: KpiThreshold[] = kpi.threshold_warning != null && kpi.threshold_critical != null
      ? [
          { min: 0, max: kpi.threshold_critical, color: '#ef4444' },
          { min: kpi.threshold_critical, max: kpi.threshold_warning, color: '#f59e0b' },
          { min: kpi.threshold_warning, max: 100, color: '#22c55e' },
        ]
      : [...DEFAULT_THRESHOLDS];
    setSelectedKpis(prev => [...prev, { kpiKey: kpi.key, label: kpi.label, thresholds }]);
  };

  const removeKpi = (key: string) => {
    setSelectedKpis(prev => prev.filter(k => k.kpiKey !== key));
  };

  const updateThreshold = (kpiKey: string, idx: number, field: 'min' | 'max' | 'color', value: string | number) => {
    setSelectedKpis(prev => prev.map(k => {
      if (k.kpiKey !== kpiKey) return k;
      const thresholds = k.thresholds.map((t, i) => i === idx ? { ...t, [field]: value } : t);
      return { ...k, thresholds };
    }));
  };

  const effectiveName = name.trim() || (
    viewType === 'kpi_overlay'
      ? `KPI ${technology} – ${selectedKpis.map(k => k.label).join(', ') || 'Overlay'}`
      : viewType === 'parameter'
        ? `Param – ${paramFilters['parameter'] || 'Search'}`
        : viewType === 'coverage'
          ? `Visual Coverage`
          : `Topo Search`
  );

  // Visual Coverage tuning — only the max-radius cap; everything else is
  // pure-topology Voronoi. Default 1500 m matches the backend default.
  const [coverageMaxRadiusM, setCoverageMaxRadiusM] = useState<number>(1500);

  // Validation per spec: "Empêcher la création si un filtre n'a pas de
  // type ou pas de valeur." Every non-empty row must have BOTH a field
  // AND at least one effective value (multiselect OR parsed text).
  const topoSearchValid = useMemo(() => {
    const filledRows = topoSearchRows.filter(r => r.field.trim() || r.valuesText.trim() || r.values.length > 0);
    if (filledRows.length === 0) return false;
    for (const r of filledRows) {
      if (!r.field.trim()) return false;
      if (rowValues(r).length === 0) return false;
    }
    return true;
  }, [topoSearchRows]);

  const isValid = (
    (viewType === 'kpi_overlay' && selectedKpis.length > 0) ||
    (viewType === 'topology_search' && topoSearchValid) ||
    (viewType === 'parameter' && Boolean(paramFilters.parameter?.trim())) ||
    // Visual Coverage: no required field — the layer renders from
    // ref_cell_daily geometry alone. Just need the radius cap to be
    // a positive number within the backend bounds.
    (viewType === 'coverage' && coverageMaxRadiusM >= 50 && coverageMaxRadiusM <= 20000)
  );

  const handleSave = () => {
    if (!viewType || !isValid) return;
    const config: ViewConfig = { name: effectiveName, type: viewType };
    if (viewType === 'kpi_overlay') {
      config.technology = technology;
      config.level = level;
      config.kpis = selectedKpis;
      config.dateFrom = kpiDateFrom;
      config.dateTo = kpiDateTo;
    } else if (viewType === 'topology_search') {
      // Build TopoSearchPayload from the rows: keep only complete rows
      // (field + ≥1 value via either multiselect or text input).
      const filters: TopoSearchFilter[] = [];
      for (const r of topoSearchRows) {
        const field = r.field.trim();
        if (!field) continue;
        const values = rowValues(r);
        if (values.length === 0) continue;
        filters.push({ field, operator: r.operator, values });
      }
      if (filters.length > 0) {
        config.topoSearch = { logic: topoSearchLogic, filters };
      }
    } else if (viewType === 'parameter') {
      config.paramFilters = Object.fromEntries(
        Object.entries(paramFilters).filter(([, v]) => v.trim())
      );
    } else if (viewType === 'coverage') {
      // Visual Coverage — only carries the max-radius cap. The layer
      // ON/OFF state is wired by the consumer (handleCreateViewFromModal)
      // which flips settings.showVisualCoverage on save.
      config.coverageMaxRadiusM = coverageMaxRadiusM;
    }
    onSave(config);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={ref}
        // Width sized 1.5× the prior max-w-xl (576px) per UX request
        // 2026-05-07 — gives the row builder more room to breathe so
        // the dim selector + multiselect dropdown don't fight for px.
        className="sm:max-w-[864px] max-h-[88vh] overflow-y-auto p-0"
      >
        {/* Progress bar */}
        <div className="flex items-center gap-0 px-6 pt-5 pb-0">
          <div className={`flex-1 h-1 rounded-full transition-colors ${step >= 1 ? 'bg-primary' : 'bg-muted'}`} />
          <div className="w-1" />
          <div className={`flex-1 h-1 rounded-full transition-colors ${step >= 2 ? 'bg-primary' : 'bg-muted'}`} />
        </div>

        <div className="px-6 pb-6 pt-3">
          {/* ── STEP 1: Type Selection ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-black tracking-tight">Nouvelle vue</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Choisissez le type de vue à créer</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* KPI Overlay */}
                <button
                  onClick={() => setViewType('kpi_overlay')}
                  className={`group relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all ${
                    viewType === 'kpi_overlay'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                    viewType === 'kpi_overlay' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground group-hover:text-primary'
                  }`}>
                    <BarChart2 size={24} />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold">KPI Overlay</div>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                      Performances réseau sur la carte avec codes couleur
                    </p>
                  </div>
                  {viewType === 'kpi_overlay' && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <span className="text-[10px] font-bold">✓</span>
                    </div>
                  )}
                </button>

                {/* Topology Search */}
                <button
                  onClick={() => setViewType('topology_search')}
                  className={`group relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all ${
                    viewType === 'topology_search'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                    viewType === 'topology_search' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground group-hover:text-primary'
                  }`}>
                    <Search size={24} />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold">Topology Search</div>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                      Recherchez des éléments spécifiques de la topologie
                    </p>
                  </div>
                  {viewType === 'topology_search' && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <span className="text-[10px] font-bold">✓</span>
                    </div>
                  )}
                </button>

                {/* Parameter */}
                <button
                  onClick={() => setViewType('parameter')}
                  className={`group relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all ${
                    viewType === 'parameter'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                    viewType === 'parameter' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground group-hover:text-primary'
                  }`}>
                    <Settings2 size={24} />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold">Parameter</div>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                      Recherchez et filtrez les paramètres CM du réseau
                    </p>
                  </div>
                  {viewType === 'parameter' && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <span className="text-[10px] font-bold">✓</span>
                    </div>
                  )}
                </button>

                {/* Visual Coverage — pure-topology Voronoi dominance.
                    Replaces the prior RSRP "Coverage Prediction" tile per
                    UX request 2026-05-11 (no real RF propagation, KPI
                    visualization only). */}
                <button
                  onClick={() => setViewType('coverage')}
                  className={`group relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all ${
                    viewType === 'coverage'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                    viewType === 'coverage' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground group-hover:text-primary'
                  }`}>
                    <MapIcon size={24} />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold">Visual Coverage</div>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                      Dominance des cellules par tessellation Voronoï (sans RF)
                    </p>
                  </div>
                  {viewType === 'coverage' && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <span className="text-[10px] font-bold">✓</span>
                    </div>
                  )}
                </button>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => setStep(2)}
                  disabled={!viewType}
                  className="gap-1.5"
                >
                  Continuer
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 2: KPI Overlay ── */}
          {step === 2 && viewType === 'kpi_overlay' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setStep(1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <ChevronLeft size={16} className="text-muted-foreground" />
                </button>
                <div>
                  <h2 className="text-base font-black tracking-tight flex items-center gap-2">
                    <BarChart2 size={16} className="text-primary" /> KPI Overlay
                  </h2>
                  <p className="text-[10px] text-muted-foreground">Configurez l'overlay de performance réseau</p>
                </div>
              </div>

              {/* View name */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Nom de la vue *</label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Performance 4G Sud-Ouest"
                  className="text-sm"
                />
              </div>

              {/* Technology + Level */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Technologie *</label>
                  <div className="flex gap-1">
                    {(['4G', '5G'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => { setTechnology(t); setSelectedKpis([]); }}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                          technology === t
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Niveau d'analyse *</label>
                  <Select value={level} onValueChange={v => setLevel(v as AnalysisLevel)}>
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="site">Site</SelectItem>
                      <SelectItem value="cell">Cellule</SelectItem>
                      <SelectItem value="band">Bande</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Date Range */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Période d'analyse *</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-muted-foreground">Date début</label>
                    <Input type="date" value={kpiDateFrom} onChange={e => setKpiDateFrom(e.target.value)} className="text-xs h-9" />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">Date fin</label>
                    <Input type="date" value={kpiDateTo} onChange={e => setKpiDateTo(e.target.value)} className="text-xs h-9" />
                  </div>
                </div>
              </div>

              {/* KPI Selection */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">KPIs sélectionnés ({selectedKpis.length})</label>
                {selectedKpis.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedKpis.map(k => (
                      <Badge key={k.kpiKey} variant="default" className="gap-1 text-[10px] pr-1">
                        {k.label}
                        <button onClick={() => removeKpi(k.kpiKey)} className="hover:text-destructive ml-0.5">
                          <X size={10} />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <Input
                  placeholder="Rechercher un KPI..."
                  value={kpiSearch}
                  onChange={e => setKpiSearch(e.target.value)}
                  className="text-xs h-8 mb-1"
                />
                <div className="max-h-36 overflow-y-auto border border-border rounded-lg">
                  {Object.entries(groupedKpis).map(([famille, kpis]) => (
                    <div key={famille}>
                      <div className="px-2 py-1 bg-muted/50 text-[9px] font-bold text-muted-foreground uppercase tracking-wider sticky top-0">{famille}</div>
                      {kpis.map(k => {
                        const isSelected = selectedKpis.some(s => s.kpiKey === k.key);
                        return (
                          <button
                            key={k.key}
                            onClick={() => isSelected ? removeKpi(k.key) : addKpi(k)}
                            className={`w-full text-left px-2 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                              isSelected ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted/50'
                            }`}
                          >
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                              isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
                            }`}>
                              {isSelected && <span className="text-[8px] font-bold">✓</span>}
                            </div>
                            <span className="truncate">{k.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {Object.keys(groupedKpis).length === 0 && (
                    <div className="p-4 text-center text-xs text-muted-foreground">Aucun KPI disponible pour {technology}</div>
                  )}
                </div>
              </div>

              {/* Threshold config for selected KPIs */}
              {selectedKpis.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    <Palette size={10} className="inline mr-1" />
                    Seuils et couleurs
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedKpis.map(kpi => (
                      <div key={kpi.kpiKey} className="border border-border rounded-lg p-2.5">
                        <div className="text-[10px] font-bold text-foreground mb-1.5">{kpi.label}</div>
                        {/* Gradient preview */}
                        <div className="h-2 rounded-full mb-2 flex overflow-hidden">
                          {kpi.thresholds.map((t, i) => (
                            <div key={i} style={{ backgroundColor: t.color, flex: (t.max - t.min) || 1 }} />
                          ))}
                        </div>
                        <div className="space-y-1">
                          {kpi.thresholds.map((t, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <input
                                type="color"
                                value={t.color}
                                onChange={e => updateThreshold(kpi.kpiKey, i, 'color', e.target.value)}
                                className="w-5 h-5 rounded border-0 cursor-pointer p-0"
                              />
                              <Input
                                type="number"
                                value={t.min}
                                onChange={e => updateThreshold(kpi.kpiKey, i, 'min', parseFloat(e.target.value) || 0)}
                                className="w-16 h-6 text-[10px] px-1.5"
                                placeholder="Min"
                              />
                              <span className="text-[9px] text-muted-foreground">→</span>
                              <Input
                                type="number"
                                value={t.max}
                                onChange={e => updateThreshold(kpi.kpiKey, i, 'max', parseFloat(e.target.value) || 0)}
                                className="w-16 h-6 text-[10px] px-1.5"
                                placeholder="Max"
                              />
                              {kpi.thresholds.length > 1 && (
                                <button
                                  onClick={() => setSelectedKpis(prev => prev.map(k =>
                                    k.kpiKey === kpi.kpiKey ? { ...k, thresholds: k.thresholds.filter((_, j) => j !== i) } : k
                                  ))}
                                  className="p-0.5 hover:text-destructive text-muted-foreground"
                                >
                                  <X size={10} />
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            onClick={() => setSelectedKpis(prev => prev.map(k =>
                              k.kpiKey === kpi.kpiKey
                                ? { ...k, thresholds: [...k.thresholds, { min: k.thresholds[k.thresholds.length - 1]?.max || 0, max: 100, color: '#3b82f6' }] }
                                : k
                            ))}
                            className="text-[9px] text-primary font-bold flex items-center gap-0.5 hover:underline"
                          >
                            <Plus size={9} /> Ajouter un seuil
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  <ChevronLeft size={14} className="mr-1" /> Retour
                </Button>
                <Button onClick={handleSave} disabled={!isValid || saving} className="flex-1">
                  {saving ? 'Création...' : 'Créer la vue'}
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Topology Search ── */}
          {step === 2 && viewType === 'topology_search' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setStep(1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <ChevronLeft size={16} className="text-muted-foreground" />
                </button>
                <div>
                  <h2 className="text-base font-black tracking-tight flex items-center gap-2">
                    <Search size={16} className="text-primary" /> Topology Search
                  </h2>
                  <p className="text-[10px] text-muted-foreground">Recherchez des éléments correspondant à au moins un des filtres (OU) ou à tous (ET).</p>
                </div>
              </div>

              {/* View name */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Nom de la vue *</label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Recherche PCI 150-200"
                  className="text-sm"
                />
              </div>

              {/* Logic toggle (OR is the spec default — "OU/OR"). */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Logique entre filtres</label>
                <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
                  {(['OR', 'AND'] as const).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setTopoSearchLogic(opt)}
                      className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        topoSearchLogic === opt ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {opt === 'OR' ? 'OU / OR' : 'ET / AND'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filters block: rows of [dim dropdown] [comma-separated values] [×]. */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Filtres topologiques</label>
                  {topoCatalog.length === 0 && (
                    <span className="flex items-center gap-1 text-[9px] text-muted-foreground/70">
                      <Loader2 size={10} className="animate-spin" /> Chargement…
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {topoSearchRows.map((row, idx) => {
                    const effectiveCount = rowValues(row).length;
                    const fieldMissing = !row.field.trim();
                    const valuesMissing = !!row.field.trim() && effectiveCount === 0;
                    return (
                      <React.Fragment key={row.id}>
                        {idx > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-px bg-border" />
                            <span className="text-[9px] font-bold text-primary/70 uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/5 border border-primary/20">
                              {topoSearchLogic === 'OR' ? 'OU / OR' : 'ET / AND'}
                            </span>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                        )}
                        <div className="flex items-start gap-2">
                          {/* Dim type selector with built-in search */}
                          <div className="w-52 shrink-0">
                            <DimFieldSelect
                              value={row.field}
                              options={topoCatalog}
                              onChange={val => setTopoSearchRows(prev => prev.map(r => r.id === row.id ? { ...r, field: val, values: [], valuesText: '' } : r))}
                              disabled={topoCatalog.length === 0}
                              hasError={fieldMissing && (row.valuesText.trim().length > 0 || row.values.length > 0)}
                            />
                          </div>
                          {/* Lazy multiselect (preferred) with text-input fallback */}
                          <div className="flex-1 min-w-0">
                            <TopoRowValueInput
                              field={row.field}
                              values={row.values}
                              valuesText={row.valuesText}
                              onValuesChange={vals => setTopoSearchRows(prev => prev.map(r => r.id === row.id ? { ...r, values: vals, valuesText: '' } : r))}
                              onValuesTextChange={txt => setTopoSearchRows(prev => prev.map(r => r.id === row.id ? { ...r, valuesText: txt, values: [] } : r))}
                              hasError={valuesMissing}
                            />
                            {effectiveCount > 0 && (
                              <span className="text-[9px] text-muted-foreground/60 mt-0.5 block">
                                {effectiveCount} valeur{effectiveCount > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          {/* Delete row */}
                          <button
                            type="button"
                            onClick={() => setTopoSearchRows(prev => prev.length === 1 ? [newTopoSearchRow()] : prev.filter(r => r.id !== row.id))}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors h-8 shrink-0"
                            aria-label="Supprimer ce filtre"
                            title="Supprimer ce filtre"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* + Ajouter un filtre */}
                <button
                  type="button"
                  onClick={() => setTopoSearchRows(prev => [...prev, newTopoSearchRow()])}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border text-[11px] font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
                >
                  <Plus size={12} />
                  Ajouter un filtre
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  <ChevronLeft size={14} className="mr-1" /> Retour
                </Button>
                <Button onClick={handleSave} disabled={!isValid || !name.trim() || saving} className="flex-1">
                  {saving ? 'Création...' : 'Créer la vue'}
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Parameter ── */}
          {step === 2 && viewType === 'parameter' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setStep(1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <ChevronLeft size={16} className="text-muted-foreground" />
                </button>
                <div>
                  <h2 className="text-base font-black tracking-tight flex items-center gap-2">
                    <Settings2 size={16} className="text-primary" /> Parameter
                  </h2>
                  <p className="text-[10px] text-muted-foreground">Filtrez et affichez les paramètres CM du réseau</p>
                </div>
              </div>

              {/* View name */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Nom de la vue *</label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Param maxTxPower Band 700"
                  className="text-sm"
                />
              </div>

              {/* Param filters */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Filtres paramètres</label>
                <div className="space-y-2">
                  {activeParamKeys.map(key => {
                    const def = PARAM_FILTER_KEYS.find(t => t.key === key);
                    const isParamKey = key === 'parameter';
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-foreground w-24 shrink-0">{def?.label || key}</span>
                        {isParamKey ? (
                          <div className="flex-1 relative">
                            <div className="flex items-center gap-1">
                              <Input
                                value={paramFilters[key] || paramSearchQuery}
                                onChange={e => {
                                  const v = e.target.value;
                                  setParamSearchQuery(v);
                                  setParamFilters(prev => ({ ...prev, [key]: v }));
                                  setParamListOpen(true);
                                }}
                                onFocus={() => { if (paramSearchQuery.length >= 2) setParamListOpen(true); }}
                                placeholder="Tapez pour rechercher (ex: pMax, LNCEL)..."
                                className="text-xs h-8 flex-1 font-mono"
                              />
                              {paramSearchLoading && <Loader2 size={14} className="animate-spin text-muted-foreground shrink-0" />}
                            </div>
                            {paramListOpen && paramSearchResults.length > 0 && (
                              <div className="absolute z-50 top-9 left-0 right-0 bg-popover border border-border rounded-lg shadow-xl max-h-52 overflow-y-auto">
                                {paramSearchResults.map(p => (
                                  <button
                                    key={p}
                                    onClick={() => {
                                      setParamFilters(prev => ({ ...prev, parameter: p }));
                                      setParamSearchQuery(p);
                                      setParamListOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-accent transition-colors ${
                                      paramFilters.parameter === p ? 'bg-primary/10 text-primary font-bold' : 'text-foreground'
                                    }`}
                                  >
                                    {p}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <Input
                            value={paramFilters[key] || ''}
                            onChange={e => setParamFilters(prev => ({ ...prev, [key]: e.target.value }))}
                            placeholder={`Valeur ${def?.label || key}...`}
                            className="text-xs h-8 flex-1"
                          />
                        )}
                        <button
                          onClick={() => {
                            setActiveParamKeys(prev => prev.filter(k => k !== key));
                            setParamFilters(prev => { const n = { ...prev }; delete n[key]; return n; });
                            if (isParamKey) { setParamSearchQuery(''); setParamSearchResults([]); }
                          }}
                          className="p-1 hover:text-destructive text-muted-foreground"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Add filter */}
                {PARAM_FILTER_KEYS.filter(t => !activeParamKeys.includes(t.key)).length > 0 && (
                  <Select
                    onValueChange={key => setActiveParamKeys(prev => [...prev, key])}
                  >
                    <SelectTrigger className="text-xs h-8 mt-2 w-48">
                      <SelectValue placeholder="+ Ajouter un filtre" />
                    </SelectTrigger>
                    <SelectContent>
                      {PARAM_FILTER_KEYS
                        .filter(t => !activeParamKeys.includes(t.key))
                        .map(t => (
                          <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  <ChevronLeft size={14} className="mr-1" /> Retour
                </Button>
                <Button onClick={handleSave} disabled={!isValid || saving} className="flex-1">
                  {saving ? 'Création...' : 'Créer la vue'}
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Visual Coverage ── (replaces the old RSRP form) */}
          {step === 2 && viewType === 'coverage' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setStep(1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <ChevronLeft size={16} className="text-muted-foreground" />
                </button>
                <div>
                  <h2 className="text-base font-black tracking-tight flex items-center gap-2">
                    <MapIcon size={16} className="text-primary" /> Visual Coverage
                  </h2>
                  <p className="text-[10px] text-muted-foreground">Dominance visuelle des cellules par tessellation Voronoï</p>
                </div>
              </div>

              {/* View name */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Nom de la vue</label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Visual Coverage Reims Centre"
                  className="text-sm"
                />
              </div>

              {/* Max radius cap */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Rayon max par cellule (m)
                  <span className="ml-2 text-muted-foreground/70 font-mono">{coverageMaxRadiusM}</span>
                </label>
                <input
                  type="range"
                  min={200}
                  max={5000}
                  step={100}
                  value={coverageMaxRadiusM}
                  onChange={e => setCoverageMaxRadiusM(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                  <span>200 m</span>
                  <span>1500 m</span>
                  <span>5000 m</span>
                </div>
              </div>

              {/* Explanation card — matches the in-map one so the operator
                  reads the same disclaimer at creation time. */}
              <div className="text-[10px] text-muted-foreground bg-muted/30 rounded-lg p-3 border border-border/50 leading-relaxed">
                <div className="font-bold text-foreground mb-1">À propos de Visual Coverage</div>
                Couche de dominance approchée générée à partir des positions
                cellulaires et de leurs voisines (clipping Voronoï + secteur
                azimutal). Utilisée pour la visualisation KPI uniquement —
                ne représente <b>pas</b> la propagation RF réelle (pas de
                terrain, de clutter ni de RSRP).
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  <ChevronLeft size={14} className="mr-1" /> Retour
                </Button>
                <Button onClick={handleSave} disabled={!isValid || saving} className="flex-1">
                  {saving ? 'Création...' : 'Créer la vue'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});
