import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Plus, X, Search, ChevronDown, Check, Filter, Save, Trash2 } from 'lucide-react';
import { getBackendFilterValues } from '@/config/filterDimensions';

// ── Types ──
export interface ViewFilterCondition {
  id: string;
  dimension: string;
  operator: '=' | 'IN' | 'NOT_IN' | '>' | '>=' | '<' | '<=';
  values: string[];
}

export interface ViewFilterSet {
  conditions: ViewFilterCondition[];
  logic: 'AND';
}

// ── All filter dimensions ──
export interface FilterDimDef {
  key: string;
  label: string;
  icon: string;
  type: 'enum' | 'numeric' | 'text';
  /** If true, values are extracted from sites rather than static list */
  dynamic?: boolean;
}

export const VIEW_FILTER_DIMENSIONS: FilterDimDef[] = [
  { key: 'site_name', label: 'Site', icon: '🏗️', type: 'text' },
  { key: 'nom_cellule', label: 'Cellule', icon: '📶', type: 'text' },
  { key: 'pci', label: 'PCI', icon: '🔢', type: 'numeric' },
  { key: 'eci', label: 'ECI', icon: '🆔', type: 'numeric' },
  { key: 'bande', label: 'Bande', icon: '📡', type: 'enum' },
  { key: 'techno', label: 'Techno', icon: '⚡', type: 'enum' },
  { key: 'constructeur', label: 'Vendor', icon: '🏭', type: 'enum' },
  { key: 'dor', label: 'DOR', icon: '🏢', type: 'enum' },
  { key: 'plaque', label: 'Plaque', icon: '🗺️', type: 'enum' },
  // cluster_b = user-saved clusters (network_filters). Added 2026-05-06.
  { key: 'cluster_b', label: 'Cluster_B', icon: '🧩', type: 'enum', dynamic: true },
  { key: 'zone_arcep', label: 'Zone ARCEP', icon: '📋', type: 'enum' },
  { key: 'region', label: 'Région', icon: '📍', type: 'text' },
  { key: 'code_nidt', label: 'Code NIDT', icon: '🆔', type: 'text' },
  { key: 'etat_cellule', label: 'État Cellule', icon: '🔋', type: 'enum' },
  { key: 'essentiel', label: 'Essentiel', icon: '⭐', type: 'enum' },
  { key: 'tilt', label: 'Tilt', icon: '📐', type: 'numeric' },
  { key: 'azimut', label: 'Azimut', icon: '🧭', type: 'numeric' },
  { key: 'hba', label: 'HBA', icon: '📏', type: 'numeric' },
];

const ENUM_OPERATORS = [
  { key: 'IN', label: '=', desc: 'Inclut' },
  { key: 'NOT_IN', label: '≠', desc: 'Exclut' },
] as const;

const NUMERIC_OPERATORS = [
  { key: '=', label: '=', desc: 'Égal' },
  { key: '>', label: '>', desc: 'Supérieur' },
  { key: '>=', label: '≥', desc: 'Sup. ou égal' },
  { key: '<', label: '<', desc: 'Inférieur' },
  { key: '<=', label: '≤', desc: 'Inf. ou égal' },
] as const;

// ── Fuzzy match helper ──
function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  // Simple fuzzy: all chars in order
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

// ── Props ──
interface ViewFilterBuilderProps {
  /** Initial conditions (uncontrolled). Ignored when `value` is provided. */
  initialConditions?: ViewFilterCondition[];
  /** Controlled value — when provided, parent owns the conditions state. */
  value?: ViewFilterCondition[];
  /** Called on every conditions change (controlled mode + uncontrolled syncing). */
  onChange?: (conditions: ViewFilterCondition[]) => void;
  /** Known values per dimension from backend filter defs */
  backendFilterDefs?: { id: string; label: string; values: string[] }[];
  /** Display mode. `embedded` hides the view name input and save/cancel actions. */
  mode?: 'standalone' | 'embedded';
  /** View name (standalone only) */
  viewName?: string;
  onViewNameChange?: (name: string) => void;
  /** Save callback (standalone only) */
  onSave?: (conditions: ViewFilterCondition[]) => void;
  /** Cancel callback (standalone only) */
  onCancel?: () => void;
  /** Is saving */
  saving?: boolean;
  /** Force-hide the view name input even in standalone mode. */
  hideViewName?: boolean;
  /** Force-hide the save/cancel action row. */
  hideSaveAction?: boolean;
}

export const ViewFilterBuilder: React.FC<ViewFilterBuilderProps> = ({
  initialConditions = [],
  value,
  onChange,
  backendFilterDefs = [],
  mode = 'standalone',
  viewName,
  onViewNameChange,
  onSave,
  onCancel,
  saving,
  hideViewName,
  hideSaveAction,
}) => {
  const isControlled = Array.isArray(value);
  const [internalConditions, setInternalConditions] = useState<ViewFilterCondition[]>(initialConditions);
  const conditions = isControlled ? (value as ViewFilterCondition[]) : internalConditions;
  const setConditions = (updater: ViewFilterCondition[] | ((prev: ViewFilterCondition[]) => ViewFilterCondition[])) => {
    const next = typeof updater === 'function'
      ? (updater as (p: ViewFilterCondition[]) => ViewFilterCondition[])(conditions)
      : updater;
    if (!isControlled) setInternalConditions(next);
    onChange?.(next);
  };
  const showViewName = !hideViewName && mode !== 'embedded';
  const showSaveAction = !hideSaveAction && mode !== 'embedded';
  const [showDimPicker, setShowDimPicker] = useState(false);
  const [dimSearch, setDimSearch] = useState('');
  const [editingConditionId, setEditingConditionId] = useState<string | null>(null);

  // Merged dimension values (backend cache → prop → static fallback)
  const getDimensionValues = useCallback((dimKey: string): string[] => {
    // 1. Global backend cache (from /topo/filters)
    const cached = getBackendFilterValues(dimKey);
    if (cached && cached.length > 0) return cached;
    // 2. Props from parent
    const backendDef = backendFilterDefs.find(d => d.id === dimKey);
    if (backendDef && backendDef.values.length > 0) return backendDef.values;
    // 3. Static fallbacks
    const STATIC: Record<string, string[]> = {
      constructeur: ['Nokia', 'Nokia_NR', 'Ericsson', 'Huawei', 'Samsung', 'Alcatel'],
      bande: ['LTE700', 'LTE800', 'LTE1800', 'LTE2100', 'LTE2600', 'LTE900', 'NR_700', 'NR_2100', 'NR_3500', 'NR_1800', 'NR_1400', 'NR_2600'],
      techno: ['4G', '5G', 'LTE', 'NR'],
      zone_arcep: ['ZTD', 'ZMD', 'ZPD'],
      etat_cellule: ['Active', 'Inactive', 'Maintenance'],
      essentiel: ['Oui', 'Non'],
      dor: ['UPR Sud-Ouest', 'UPR Ile-De-France', 'UPR Nord-Est', 'UPR Ouest', 'UPR Sud-Est'],
    };
    return STATIC[dimKey] || [];
  }, [backendFilterDefs]);

  const addCondition = (dimKey: string) => {
    const dim = VIEW_FILTER_DIMENSIONS.find(d => d.key === dimKey);
    if (!dim) return;
    const defaultOp = dim.type === 'numeric' ? '=' : 'IN';
    const cond: ViewFilterCondition = {
      id: crypto.randomUUID(),
      dimension: dimKey,
      operator: defaultOp as any,
      values: [],
    };
    setConditions(prev => [...prev, cond]);
    setShowDimPicker(false);
    setDimSearch('');
    setEditingConditionId(cond.id);
  };

  const removeCondition = (id: string) => {
    setConditions(prev => prev.filter(c => c.id !== id));
    if (editingConditionId === id) setEditingConditionId(null);
  };

  const updateCondition = (id: string, updates: Partial<ViewFilterCondition>) => {
    setConditions(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const filteredDims = useMemo(() => {
    const usedKeys = new Set(conditions.map(c => c.dimension));
    return VIEW_FILTER_DIMENSIONS.filter(d => {
      if (usedKeys.has(d.key)) return false;
      if (!dimSearch) return true;
      return fuzzyMatch(d.label, dimSearch) || fuzzyMatch(d.key, dimSearch);
    });
  }, [dimSearch, conditions]);

  const hasConditions = conditions.length > 0;

  return (
    <div className="space-y-3">
      {/* View name input */}
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={viewName}
          onChange={e => onViewNameChange(e.target.value)}
          placeholder="Nom de la vue..."
          className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-[12px] font-semibold text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
        />
      </div>

      {/* Active conditions */}
      {conditions.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Filter size={10} className="text-primary" />
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Conditions ({conditions.length})</span>
          </div>
          {conditions.map((cond, idx) => {
            const dim = VIEW_FILTER_DIMENSIONS.find(d => d.key === cond.dimension);
            const isEditing = editingConditionId === cond.id;
            return (
              <React.Fragment key={cond.id}>
                {idx > 0 && (
                  <div className="flex items-center justify-center">
                    <span className="text-[8px] font-black text-primary/60 bg-primary/5 px-2 py-0.5 rounded-full uppercase tracking-widest">AND</span>
                  </div>
                )}
                <ConditionRow
                  condition={cond}
                  dim={dim!}
                  isEditing={isEditing}
                  onToggleEdit={() => setEditingConditionId(isEditing ? null : cond.id)}
                  onUpdate={(updates) => updateCondition(cond.id, updates)}
                  onRemove={() => removeCondition(cond.id)}
                  availableValues={getDimensionValues(cond.dimension)}
                />
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Add condition button / dimension picker */}
      {showDimPicker ? (
        <div className="border border-primary/20 rounded-xl bg-card overflow-hidden shadow-lg">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/30">
            <Search size={12} className="text-muted-foreground" />
            <input
              autoFocus
              value={dimSearch}
              onChange={e => setDimSearch(e.target.value)}
              placeholder="Rechercher une dimension..."
              className="flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground/50"
            />
            <button onClick={() => { setShowDimPicker(false); setDimSearch(''); }} className="p-0.5 rounded hover:bg-muted text-muted-foreground">
              <X size={12} />
            </button>
          </div>
          <div className="max-h-[220px] overflow-y-auto py-1">
            {filteredDims.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/50 text-center py-4 italic">Aucune dimension disponible</p>
            ) : (
              filteredDims.map(dim => (
                <button
                  key={dim.key}
                  onClick={() => addCondition(dim.key)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all group"
                >
                  <span className="text-sm shrink-0">{dim.icon}</span>
                  <span className="flex-1 text-left font-semibold">{dim.label}</span>
                  <span className="text-[8px] font-mono text-muted-foreground/30 group-hover:text-muted-foreground/60">{dim.type}</span>
                  <Plus size={10} className="text-muted-foreground/20 group-hover:text-primary shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowDimPicker(true)}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10 text-[10px] font-bold text-primary/80 hover:text-primary transition-all"
        >
          <Plus size={11} />
          Ajouter une condition
        </button>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onSave(conditions)}
          disabled={saving || !viewName.trim()}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          {saving ? (
            <div className="w-3 h-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          ) : (
            <Save size={12} />
          )}
          Sauvegarder la vue
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-foreground border border-border hover:border-primary/30 transition-all"
        >
          Annuler
        </button>
      </div>
    </div>
  );
};

// ── Condition Row ──
interface ConditionRowProps {
  condition: ViewFilterCondition;
  dim: FilterDimDef;
  isEditing: boolean;
  onToggleEdit: () => void;
  onUpdate: (updates: Partial<ViewFilterCondition>) => void;
  onRemove: () => void;
  availableValues: string[];
}

const ConditionRow: React.FC<ConditionRowProps> = ({
  condition,
  dim,
  isEditing,
  onToggleEdit,
  onUpdate,
  onRemove,
  availableValues,
}) => {
  const [valueSearch, setValueSearch] = useState('');
  const [showValues, setShowValues] = useState(false);
  const [textInput, setTextInput] = useState(condition.values.join(', '));
  const isEnum = dim.type === 'enum';
  const isNumeric = dim.type === 'numeric';
  const operators = isNumeric ? NUMERIC_OPERATORS : ENUM_OPERATORS;

  const filteredValues = useMemo(() => {
    if (!availableValues.length) return [];
    return availableValues.filter(v => fuzzyMatch(v, valueSearch));
  }, [availableValues, valueSearch]);

  const toggleValue = (val: string) => {
    const current = condition.values;
    const next = current.includes(val) ? current.filter(v => v !== val) : [...current, val];
    onUpdate({ values: next });
  };

  const handleTextConfirm = () => {
    const vals = textInput.split(',').map(v => v.trim()).filter(Boolean);
    onUpdate({ values: vals });
  };

  // Summary text
  const summaryText = condition.values.length === 0
    ? 'Non défini'
    : condition.values.length <= 2
      ? condition.values.join(', ')
      : `${condition.values.length} valeurs`;

  const opLabel = operators.find(o => o.key === condition.operator)?.label || condition.operator;

  return (
    <div className={`rounded-lg border transition-all ${isEditing ? 'border-primary/30 bg-primary/[0.02] shadow-sm' : 'border-border/50 bg-card hover:border-border'}`}>
      {/* Collapsed summary row */}
      <div
        className="flex items-center gap-2 px-2.5 py-2 cursor-pointer"
        onClick={onToggleEdit}
      >
        <span className="text-sm shrink-0">{dim.icon}</span>
        <span className="text-[10px] font-bold text-foreground">{dim.label}</span>
        <span className="text-[10px] font-black text-primary">{opLabel}</span>
        <span className={`text-[10px] font-medium flex-1 truncate ${condition.values.length > 0 ? 'text-foreground' : 'text-muted-foreground/50 italic'}`}>
          {summaryText}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
        >
          <X size={10} />
        </button>
      </div>

      {/* Expanded editor */}
      {isEditing && (
        <div className="px-2.5 pb-2.5 pt-0.5 space-y-2 border-t border-border/30">
          {/* Operator selector */}
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest w-14 shrink-0">Opérateur</span>
            <div className="flex gap-1">
              {operators.map(op => (
                <button
                  key={op.key}
                  onClick={() => onUpdate({ operator: op.key as any })}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all border ${
                    condition.operator === op.key
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-card border-border/30 text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>

          {/* Value picker */}
          {(isEnum && availableValues.length > 0) ? (
            <div>
              {/* Search within values */}
              <div className="flex items-center gap-2 bg-muted/50 border border-border/40 rounded-lg px-2.5 py-1.5 mb-1.5">
                <Search size={10} className="text-muted-foreground shrink-0" />
                <input
                  value={valueSearch}
                  onChange={e => setValueSearch(e.target.value)}
                  placeholder={`Rechercher ${dim.label}...`}
                  className="flex-1 bg-transparent text-[10px] text-foreground outline-none placeholder:text-muted-foreground/40"
                />
                {valueSearch && (
                  <button onClick={() => setValueSearch('')} className="p-0.5 rounded hover:bg-muted text-muted-foreground">
                    <X size={9} />
                  </button>
                )}
              </div>
              {/* Selected chips */}
              {condition.values.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {condition.values.map(v => (
                    <span key={v} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-[8px] font-bold text-primary border border-primary/15">
                      {v}
                      <button onClick={() => toggleValue(v)} className="hover:text-destructive">
                        <X size={8} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {/* Value list */}
              <div className="max-h-[140px] overflow-y-auto space-y-0.5 rounded-lg border border-border/30 bg-background/50 p-0.5">
                {filteredValues.length === 0 ? (
                  <p className="text-[9px] text-muted-foreground/50 text-center py-3 italic">Aucun résultat pour "{valueSearch}"</p>
                ) : (
                  filteredValues.map(val => {
                    const selected = condition.values.includes(val);
                    return (
                      <button
                        key={val}
                        onClick={() => toggleValue(val)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[10px] transition-colors ${
                          selected ? 'bg-primary/8 text-foreground' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                          selected ? 'bg-primary border-primary' : 'border-border'
                        }`}>
                          {selected && <Check size={8} className="text-primary-foreground" />}
                        </div>
                        <span className="truncate font-medium">{val}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* Text / numeric free input */
            <div className="flex items-center gap-2">
              <input
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onBlur={handleTextConfirm}
                onKeyDown={e => { if (e.key === 'Enter') handleTextConfirm(); }}
                placeholder={isNumeric ? 'Entrez une valeur...' : 'Entrez des valeurs (séparées par ,)'}
                type={isNumeric ? 'number' : 'text'}
                className="flex-1 bg-muted/50 border border-border/40 rounded-lg px-2.5 py-1.5 text-[11px] text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/10 transition-all placeholder:text-muted-foreground/40"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Helpers to convert ViewFilterCondition[] to DashboardSiteFilters ──
export function conditionsToSiteFilters(conditions: ViewFilterCondition[]): Record<string, any> {
  const filters: Record<string, any> = {};
  for (const cond of conditions) {
    if (cond.values.length === 0) continue;
    const dim = VIEW_FILTER_DIMENSIONS.find(d => d.key === cond.dimension);
    if (!dim) continue;
    if (dim.type === 'numeric') {
      // Store as manual filter
      filters[`manual_${cond.dimension}`] = cond.values[0];
      filters[`manual_${cond.dimension}_op`] = cond.operator;
    } else {
      // cluster_b (saved clusters) and cluster (plaques) share the same
      // backend QS param `cluster=` — merge values so downstream consumers
      // that read filters.cluster pick both up.
      const targetKey = cond.dimension === 'cluster_b' ? 'cluster' : cond.dimension;
      const existing = Array.isArray(filters[targetKey]) ? filters[targetKey] : [];
      filters[targetKey] = Array.from(new Set([...existing, ...cond.values]));
      if (cond.operator === 'NOT_IN') {
        filters[`${targetKey}_op`] = 'NOT_IN';
      }
    }
  }
  return filters;
}

export function siteFiltersToConditions(filters: Record<string, any>): ViewFilterCondition[] {
  const conditions: ViewFilterCondition[] = [];
  const processedKeys = new Set<string>();

  for (const [key, val] of Object.entries(filters)) {
    if (!val || key.endsWith('_op') || processedKeys.has(key)) continue;

    if (key.startsWith('manual_') && !key.endsWith('_op')) {
      const dimKey = key.replace('manual_', '');
      const op = filters[`${key}_op`] || '=';
      conditions.push({
        id: crypto.randomUUID(),
        dimension: dimKey,
        operator: op,
        values: [String(val)],
      });
      processedKeys.add(key);
    } else if (Array.isArray(val) && val.length > 0) {
      const op = filters[`${key}_op`] === 'NOT_IN' ? 'NOT_IN' : 'IN';
      conditions.push({
        id: crypto.randomUUID(),
        dimension: key,
        operator: op as any,
        values: val,
      });
      processedKeys.add(key);
    }
  }
  return conditions;
}

export default ViewFilterBuilder;
