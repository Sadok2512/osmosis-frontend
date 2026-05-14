/**
 * TopoSearchBuilder — embeddable Topology Search row-builder.
 *
 * Shares the exact same UI as the standalone Topology Search step inside
 * CreateViewModal (OR/AND toggle + row list of [dim selector] [value
 * multiselect/text fallback] [×] + "+ Ajouter un filtre"). Used by the
 * Create Dashboard modal so dashboard filtering uses the same experience
 * as creating a Topology Search view.
 *
 * Controlled API:
 *   <TopoSearchBuilder value={payload} onChange={setPayload} />
 *
 * The DimFieldSelect / TopoRowValueInput pieces are copied from
 * CreateViewModal so we can refactor either side without coupling them.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Plus, X, Loader2, ChevronDown, Check, Radio, Antenna } from 'lucide-react';
import { topoApi } from '@/lib/localDb';
import { supabase } from '@/integrations/supabase/client';
import type { TopoSearchPayload, TopoSearchOperator, TopoSearchFilter } from './CreateViewModal';

// Map Topology Search dimension keys → Supabase `topo` columns (lowercase keys)
const TOPO_DIM_TO_COL: Record<string, string> = {
  plaque: 'plaque', plaque_site: 'plaque', plaque_cellule: 'plaque',
  dor: 'dor', region: 'region', zone_arcep: 'zone_arcep',
  techno: 'techno', bande: 'bande',
  constructeur: 'constructeur', vendor: 'constructeur',
  nom_site: 'nom_site', site_name: 'nom_site',
  nom_cellule: 'nom_cellule', cell_name: 'nom_cellule',
  code_nidt: 'code_nidt', etat_cellule: 'etat_cellule',
  hebergeur_leader: 'hebergeur_leader', essentiel: 'essentiel',
  pci: 'pci', tac: 'tac', lac: 'lac', azimut: 'azimut',
};

const TopoCountBadge: React.FC<{ payload: TopoSearchPayload | null }> = ({ payload }) => {
  const [state, setState] = useState<{ loading: boolean; sites: number; cells: number; truncated: boolean; error?: string }>({
    loading: false, sites: 0, cells: 0, truncated: false,
  });
  const payloadKey = useMemo(() => JSON.stringify(payload || null), [payload]);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      if (cancelled) return;
      setState(s => ({ ...s, loading: true, error: undefined }));
      try {
        // No filters → count whole topo
        const filters = payload?.filters?.filter(f => f.values.length > 0) || [];
        const logic = payload?.logic || 'AND';

        // Build a base query that returns minimal columns; cap to 50k rows for safety
        const LIMIT = 50000;
        let q: any = supabase.from('topo').select('nom_site,nom_cellule', { count: 'exact' }).limit(LIMIT);

        if (filters.length > 0) {
          if (logic === 'AND') {
            for (const f of filters) {
              const col = TOPO_DIM_TO_COL[f.field.toLowerCase()];
              if (!col) continue;
              q = q.in(col, f.values);
            }
          } else {
            // OR: build a single .or() expression
            const parts: string[] = [];
            for (const f of filters) {
              const col = TOPO_DIM_TO_COL[f.field.toLowerCase()];
              if (!col) continue;
              const escaped = f.values.map(v => `"${String(v).replace(/"/g, '\\"')}"`).join(',');
              parts.push(`${col}.in.(${escaped})`);
            }
            if (parts.length > 0) q = q.or(parts.join(','));
          }
        }

        const { data, count, error } = await q;
        if (cancelled) return;
        if (error) {
          setState({ loading: false, sites: 0, cells: 0, truncated: false, error: error.message });
          return;
        }
        const rows = (data || []) as Array<{ nom_site: string | null; nom_cellule: string | null }>;
        const siteSet = new Set<string>();
        for (const r of rows) if (r.nom_site) siteSet.add(r.nom_site);
        const cellsTotal = typeof count === 'number' ? count : rows.length;
        setState({
          loading: false,
          sites: siteSet.size,
          cells: cellsTotal,
          truncated: cellsTotal > rows.length, // sites count is from sampled rows only
        });
      } catch (e: any) {
        if (cancelled) return;
        setState({ loading: false, sites: 0, cells: 0, truncated: false, error: e?.message || 'erreur' });
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [payloadKey]);

  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Périmètre courant
      </span>
      <div className="flex items-center gap-3">
        {state.loading ? (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 size={11} className="animate-spin" /> Calcul…
          </span>
        ) : state.error ? (
          <span className="text-[10px] text-destructive">{state.error}</span>
        ) : (
          <>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
              <Radio size={12} className="text-primary" />
              {state.sites.toLocaleString('fr-FR')}{state.truncated ? '+' : ''} sites
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
              <Antenna size={12} className="text-primary" />
              {state.cells.toLocaleString('fr-FR')} cellules
            </span>
          </>
        )}
      </div>
    </div>
  );
};

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

  useEffect(() => {
    if (!field) {
      setAvailable([]); setLoading(false); setErrored(false);
      return;
    }
    let cancelled = false;
    setLoading(true); setErrored(false);
    topoApi.filterValues(field)
      .then(vals => { if (!cancelled) { setAvailable(vals); setLoading(false); } })
      .catch(() => { if (!cancelled) { setAvailable([]); setErrored(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [field]);

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
        } catch { return [v, 'invalid'] as const; }
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
          const icon = s === 'valid' ? <Check size={9} /> : s === 'invalid' ? <X size={9} /> : <Loader2 size={9} className="animate-spin" />;
          return (
            <span key={v} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-medium ${cls}`}>
              {icon}<span className="font-mono">{v}</span>
            </span>
          );
        })}
      </div>
    );
  };

  if (!field) {
    return <Input disabled placeholder="Sélectionnez d'abord un type de filtre" className="text-xs h-8" />;
  }
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 h-8 rounded-md border border-input bg-muted/30 text-[10px] text-muted-foreground">
        <Loader2 size={11} className="animate-spin" /> Chargement des valeurs…
      </div>
    );
  }
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

  const useSearch = available.length > 20;
  const filtered = useSearch && search.trim()
    ? available.filter(v => v.toLowerCase().includes(search.toLowerCase()))
    : available;
  const toggle = (val: string) => {
    onValuesChange(values.includes(val) ? values.filter(v => v !== val) : [...values, val]);
  };
  const applyPaste = () => {
    const pasted = parseValuesText(pasteText);
    if (pasted.length === 0) return;
    const lookup = new Map<string, string>(available.map(v => [v.toLowerCase(), v]));
    const next = new Set(values);
    for (const v of pasted) next.add(lookup.get(v.toLowerCase()) || v);
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
            : values.length <= 3 ? values.join(', ') : `${values.length} valeurs sélectionnées`}
        </span>
        <ChevronDown size={12} className={`text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-[200] bg-popover rounded-lg border border-border shadow-2xl overflow-hidden">
          {useSearch && (
            <div className="px-2 pt-2 pb-1.5">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 border border-border">
                <Search size={11} className="text-muted-foreground shrink-0" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
                  className="flex-1 bg-transparent text-[10px] text-foreground placeholder:text-muted-foreground/50 outline-none" autoFocus />
              </div>
            </div>
          )}
          <div className="px-2 pt-1.5 pb-1.5">
            <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-muted/30 border ${pasteText.trim() ? 'border-primary/40' : 'border-border'}`}>
              <Plus size={11} className="text-muted-foreground shrink-0" />
              <input
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyPaste(); } }}
                placeholder="Ou collez : 150, 200, 320"
                className="flex-1 bg-transparent text-[10px] text-foreground placeholder:text-muted-foreground/50 outline-none font-mono"
              />
              {pasteText.trim() && (
                <button type="button" onClick={applyPaste}
                  className="text-[9px] font-bold text-primary px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 transition-colors shrink-0">
                  Ajouter
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-border/40">
            <button type="button" onClick={() => onValuesChange([...filtered])} className="text-[9px] font-semibold text-primary hover:underline">
              Tout sélectionner
            </button>
            <span className="text-muted-foreground/40">·</span>
            <button type="button" onClick={() => onValuesChange([])} className="text-[9px] font-semibold text-destructive hover:underline">
              Effacer
            </button>
            <span className="ml-auto text-[9px] text-muted-foreground/60">{values.length}/{available.length}</span>
          </div>
          <div className="max-h-[220px] overflow-y-auto py-0.5">
            {filtered.length === 0 ? (
              <p className="text-[9px] text-muted-foreground/60 text-center py-3 italic">Aucun résultat</p>
            ) : (
              filtered.map(val => {
                const isSelected = values.includes(val);
                return (
                  <button type="button" key={val} onClick={() => toggle(val)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[10px] transition-colors ${
                      isSelected ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}>
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-primary border-primary' : 'border-border'}`}>
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

const DimFieldSelect: React.FC<{
  value: string;
  options: { id: string; label: string; category?: string }[];
  onChange: (id: string) => void;
  disabled?: boolean;
  hasError?: boolean;
}> = ({ value, options, onChange, disabled, hasError }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q) || (o.category || '').toLowerCase().includes(q));
  }, [options, search]);
  const selected = options.find(o => o.id === value);
  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 px-3 h-8 rounded-md border bg-background text-left transition-all ${
          open ? 'border-primary ring-2 ring-primary/15' : hasError ? 'border-destructive' : selected ? 'border-primary/40' : 'border-input'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <span className={`flex-1 truncate text-xs ${selected ? 'text-foreground' : 'text-muted-foreground/70'}`}>
          {selected ? (
            <><span className="font-semibold">{selected.label}</span>
            {selected.category && <span className="ml-2 text-[9px] text-muted-foreground/60">{selected.category}</span>}</>
          ) : 'Sélectionner un filtre'}
        </span>
        <ChevronDown size={12} className={`text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-1 z-[200] bg-popover rounded-lg border border-border shadow-2xl overflow-hidden">
          <div className="px-2 pt-2 pb-1.5">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 border border-border">
              <Search size={11} className="text-muted-foreground shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un filtre…"
                className="flex-1 bg-transparent text-[10px] text-foreground placeholder:text-muted-foreground/50 outline-none" autoFocus />
            </div>
          </div>
          <div className="max-h-[260px] overflow-y-auto py-0.5">
            {filtered.length === 0 ? (
              <p className="text-[9px] text-muted-foreground/60 text-center py-3 italic">Aucun résultat</p>
            ) : (
              filtered.map(opt => {
                const isSel = opt.id === value;
                return (
                  <button type="button" key={opt.id}
                    onClick={() => { onChange(opt.id); setOpen(false); setSearch(''); }}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-[10px] transition-colors ${
                      isSel ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}>
                    <span className="font-semibold uppercase tracking-wider truncate">{opt.label}</span>
                    {opt.category && <span className="text-[9px] text-muted-foreground/60 shrink-0 normal-case">{opt.category}</span>}
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

type Row = {
  id: string;
  field: string;
  operator: TopoSearchOperator;
  values: string[];
  valuesText: string;
};
const newRow = (): Row => ({
  id: typeof crypto !== 'undefined' ? crypto.randomUUID() : String(Math.random()),
  field: '', operator: 'IN', values: [], valuesText: '',
});
const rowValues = (r: Row): string[] => r.values.length > 0 ? r.values : parseValuesText(r.valuesText);

const payloadToRows = (p?: TopoSearchPayload | null): Row[] => {
  if (!p || !p.filters || p.filters.length === 0) return [newRow()];
  return p.filters.map(f => ({
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : String(Math.random()),
    field: f.field,
    operator: f.operator,
    values: f.values,
    valuesText: '',
  }));
};

export interface TopoSearchBuilderProps {
  value?: TopoSearchPayload | null;
  onChange: (payload: TopoSearchPayload | null) => void;
}

export const TopoSearchBuilder: React.FC<TopoSearchBuilderProps> = ({ value, onChange }) => {
  const [logic, setLogic] = useState<'OR' | 'AND'>(value?.logic || 'OR');
  const [rows, setRows] = useState<Row[]>(() => payloadToRows(value));
  const [topoCatalog, setTopoCatalog] = useState<{ id: string; label: string; values: string[]; category?: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    topoApi.filterCatalog()
      .then(d => { if (!cancelled) setTopoCatalog(d.filters || []); })
      .catch(err => console.warn('[TopoSearchBuilder] filterCatalog failed', err));
    return () => { cancelled = true; };
  }, []);

  // Emit to parent on every change.
  useEffect(() => {
    const filters: TopoSearchFilter[] = [];
    for (const r of rows) {
      const field = r.field.trim();
      if (!field) continue;
      const vals = rowValues(r);
      if (vals.length === 0) continue;
      filters.push({ field, operator: r.operator, values: vals });
    }
    onChange(filters.length > 0 ? { logic, filters } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, logic]);

  return (
    <div className="space-y-4">
      {/* Logic toggle */}
      <div>
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Logique entre filtres</label>
        <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
          {(['OR', 'AND'] as const).map(opt => (
            <button key={opt} type="button" onClick={() => setLogic(opt)}
              className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
                logic === opt ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {opt === 'OR' ? 'OU / OR' : 'ET / AND'}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
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
          {rows.map((row, idx) => {
            const effectiveCount = rowValues(row).length;
            const fieldMissing = !row.field.trim();
            const valuesMissing = !!row.field.trim() && effectiveCount === 0;
            return (
              <React.Fragment key={row.id}>
                {idx > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[9px] font-bold text-primary/70 uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/5 border border-primary/20">
                      {logic === 'OR' ? 'OU / OR' : 'ET / AND'}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <div className="w-52 shrink-0">
                    <DimFieldSelect
                      value={row.field}
                      options={topoCatalog}
                      onChange={val => setRows(prev => prev.map(r => r.id === row.id ? { ...r, field: val, values: [], valuesText: '' } : r))}
                      disabled={topoCatalog.length === 0}
                      hasError={fieldMissing && (row.valuesText.trim().length > 0 || row.values.length > 0)}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <TopoRowValueInput
                      field={row.field}
                      values={row.values}
                      valuesText={row.valuesText}
                      onValuesChange={vals => setRows(prev => prev.map(r => r.id === row.id ? { ...r, values: vals, valuesText: '' } : r))}
                      onValuesTextChange={txt => setRows(prev => prev.map(r => r.id === row.id ? { ...r, valuesText: txt, values: [] } : r))}
                      hasError={valuesMissing}
                    />
                    {effectiveCount > 0 && (
                      <span className="text-[9px] text-muted-foreground/60 mt-0.5 block">
                        {effectiveCount} valeur{effectiveCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setRows(prev => prev.length === 1 ? [newRow()] : prev.filter(r => r.id !== row.id))}
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

        <button
          type="button"
          onClick={() => setRows(prev => [...prev, newRow()])}
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border text-[11px] font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
        >
          <Plus size={12} />
          Ajouter un filtre
        </button>

        <TopoCountBadge payload={value || null} />
      </div>
    </div>
  );
};

export default TopoSearchBuilder;
