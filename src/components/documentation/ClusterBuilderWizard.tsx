import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, ChevronRight, ChevronLeft, Check, Plus, Trash2, AlertCircle, Loader2, Globe, Lock, Layers, Sliders, FileCheck2, Eye } from 'lucide-react';
import { TOPOLOGY_DIMENSIONS, PARAMETER_OPTIONS, OPERATOR_OPTIONS, fetchParameterOptions } from './filterTypes';
import type { ParameterCondition, FilterVisibility } from './filterTypes';
import { loadFilterCache, resolveAvailableValues, type ActiveFilter } from '@/config/filterDimensions';
import { countMatching, searchParameters, getParameterValues, type MatchingCount } from '@/services/filterService';
import TopologyConditionCard, { type TopologyConditionState, type InputMode } from './cluster-builder/TopologyConditionCard';
import ScopeSummaryBar from './cluster-builder/ScopeSummaryBar';
import ClusterPreviewTable from './cluster-builder/ClusterPreviewTable';
import ParameterSearchSelect from './cluster-builder/ParameterSearchSelect';

interface ClusterBuilderWizardProps {
  onSubmit: (data: any) => void;
  onClose: () => void;
  initialData?: any;
  editMode?: boolean;
}

const STEPS = [
  { id: 'general', label: 'General', icon: <Sliders className="w-3 h-3" /> },
  { id: 'topology', label: 'Topology Scope', icon: <Layers className="w-3 h-3" /> },
  { id: 'parameters', label: 'Parameters', icon: <FileCheck2 className="w-3 h-3" /> },
  { id: 'review', label: 'Review', icon: <Eye className="w-3 h-3" /> },
];

const FIELD_OPTIONS = TOPOLOGY_DIMENSIONS.map(d => ({ key: d.key, label: d.label }));

// Map wizard dimension keys to filterDimensions keys
const WIZARD_TO_DIM: Record<string, string> = {
  vendor: 'vendor',
  dor: 'dor',
  cluster: 'cluster',
  plaque: 'cluster',
  band: 'bande',
};

const ClusterBuilderWizard: React.FC<ClusterBuilderWizardProps> = ({ onSubmit, onClose, initialData, editMode }) => {
  const [step, setStep] = useState(0);
  const [paramOptions, setParamOptions] = useState<string[]>(PARAMETER_OPTIONS);
  const [filtersReady, setFiltersReady] = useState(false);

  useEffect(() => { fetchParameterOptions().then(setParamOptions); }, []);
  useEffect(() => { loadFilterCache().then(() => setFiltersReady(true)).catch(() => setFiltersReady(true)); }, []);

  // ── Step 1: General ──
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [status, setStatus] = useState<'draft' | 'active'>(initialData?.status || 'draft');
  const [visibility, setVisibility] = useState<FilterVisibility>(initialData?.visibility || 'public');

  // ── Step 2: Topology conditions (cards) ──
  const [topoConditions, setTopoConditions] = useState<TopologyConditionState[]>(() => {
    if (initialData?.topology && initialData.topology.length > 0) {
      return initialData.topology.map((t: any, i: number) => ({
        id: `tc-${i}-${Date.now()}`,
        field: t.dimension,
        operator: (t.operator?.toUpperCase() === 'NOT_IN' || t.operator === 'not_in') ? 'NOT IN' : 'IN',
        inputMode: 'search' as InputMode,
        values: t.values || [],
      }));
    }
    return [];
  });

  // ── Step 3: Parameters ──
  const [paramConditions, setParamConditions] = useState<ParameterCondition[]>(initialData?.parameters || []);

  // ── Step 4: Logic ──
  const [logic, setLogic] = useState<'AND' | 'OR'>(initialData?.logic || 'AND');

  // ── Cascade resolution helper ──
  const activeFilters: ActiveFilter[] = useMemo(() =>
    topoConditions
      .filter(c => c.values.length > 0 && c.operator === 'IN')
      .map(c => ({
        id: c.id,
        dimension: WIZARD_TO_DIM[c.field] || c.field,
        op: 'IN' as const,
        values: c.values,
      })),
  [topoConditions]);

  const getValuesForField = useCallback((field: string): string[] => {
    const dim = TOPOLOGY_DIMENSIONS.find(d => d.key === field);
    if (dim?.bulkSupport) return []; // free-form fields like cells/sites/PCI
    const dimKey = WIZARD_TO_DIM[field] || field;
    const dynamic = resolveAvailableValues(dimKey, activeFilters.filter(a => a.dimension !== dimKey));
    return dynamic.length > 0 ? dynamic : (dim?.options || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilters, filtersReady]);

  // ── Live scope counting ──
  const [matchingCount, setMatchingCount] = useState<MatchingCount | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [countError, setCountError] = useState(false);
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (countTimer.current) clearTimeout(countTimer.current);
    const topology = topoConditions
      .filter(c => c.values.length > 0)
      .map(c => ({
        dimension: c.field,
        operator: c.operator === 'NOT IN' ? 'not_in' : 'in',
        values: c.values,
      }));
    if (topology.length === 0) {
      setMatchingCount(null);
      return;
    }
    setCountLoading(true);
    setCountError(false);
    countTimer.current = setTimeout(() => {
      countMatching(topology)
        .then((r) => { setMatchingCount(r); setCountError(false); })
        .catch(() => { setMatchingCount(null); setCountError(true); })
        .finally(() => setCountLoading(false));
    }, 600);
    return () => { if (countTimer.current) clearTimeout(countTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(topoConditions.map(c => ({ f: c.field, o: c.operator, v: c.values })))]);

  // ── Topology mutators ──
  const addCondition = () => {
    setTopoConditions(prev => [...prev, {
      id: `tc-${Date.now()}`,
      field: FIELD_OPTIONS[0].key,
      operator: 'IN',
      inputMode: 'search',
      values: [],
    }]);
  };
  const updateCondition = (id: string, next: TopologyConditionState) => {
    setTopoConditions(prev => prev.map(c => c.id === id ? next : c));
  };
  const removeCondition = (id: string) => {
    setTopoConditions(prev => prev.filter(c => c.id !== id));
  };

  // ── Param mutators ──
  const addParamCondition = () => {
    setParamValidation({ status: 'idle' });
    setParamConditions(prev => [...prev, { id: `p-${Date.now()}`, parameter: '', operator: '>', value: '' }]);
  };
  const updateParam = (id: string, field: keyof ParameterCondition, value: string) => {
    setParamValidation({ status: 'idle' });
    setParamConditions(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };
  const removeParam = (id: string) => {
    setParamValidation({ status: 'idle' });
    setParamConditions(prev => prev.filter(p => p.id !== id));
  };

  // ── Step 3 — explicit Validate & Calculate (no auto-fire, per Apply-only rule) ──
  type ParamValidation =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ok'; cells: number; sites: number }
    | { status: 'error'; message: string }
    | { status: 'invalid'; message: string };
  const [paramValidation, setParamValidation] = useState<ParamValidation>({ status: 'idle' });

  // ── Available values per parameter (fetched on parameter selection) ──
  const [paramValueCache, setParamValueCache] = useState<Record<string, { value: string; count: number }[]>>({});
  const [paramValueLoading, setParamValueLoading] = useState<Record<string, boolean>>({});
  const paramValueCacheRef = useRef(paramValueCache);
  paramValueCacheRef.current = paramValueCache;
  const fetchParamValues = useCallback(async (parameter: string) => {
    if (!parameter || paramValueCacheRef.current[parameter]) return;
    setParamValueLoading(prev => ({ ...prev, [parameter]: true }));
    try {
      const result = await getParameterValues(parameter);
      setParamValueCache(prev => ({ ...prev, [parameter]: result.values || [] }));
    } catch {
      setParamValueCache(prev => ({ ...prev, [parameter]: [] }));
    }
    setParamValueLoading(prev => ({ ...prev, [parameter]: false }));
  }, []);

  // Auto-fetch values when parameters step is reached or conditions change
  useEffect(() => {
    if (step === 2) {
      paramConditions.forEach(c => {
        if (c.parameter && !paramValueCacheRef.current[c.parameter]) {
          fetchParamValues(c.parameter);
        }
      });
    }
  }, [step, paramConditions.length, fetchParamValues]);

  type ValidateResult = { ok: true; payload: any[] } | { ok: false; message: string };
  const validateParamConditions = (): ValidateResult => {
    for (const c of paramConditions) {
      if (!c.parameter) return { ok: false, message: 'Each condition requires a parameter.' };
      if (!c.operator) return { ok: false, message: 'Each condition requires an operator.' };
      if (c.value === '' || c.value == null) return { ok: false, message: `Missing value for "${c.parameter}".` };
      if (c.operator === 'BETWEEN' && (!c.value2 || c.value2 === '')) {
        return { ok: false, message: `BETWEEN requires a max value for "${c.parameter}".` };
      }
    }
    return {
      ok: true,
      payload: paramConditions.map(c => ({
        parameter: c.parameter,
        operator: c.operator,
        value: c.value,
        ...(c.operator === 'BETWEEN' ? { value2: c.value2 } : {}),
      })),
    };
  };

  const runParamValidation = async () => {
    const v = validateParamConditions();
    if (v.ok === false) {
      setParamValidation({ status: 'invalid', message: v.message });
      return;
    }
    const topology = topoConditions
      .filter(c => c.values.length > 0)
      .map(c => ({ dimension: c.field, operator: c.operator === 'NOT IN' ? 'not_in' : 'in', values: c.values }));
    setParamValidation({ status: 'loading' });
    try {
      const r = await countMatching(topology, v.payload);
      setParamValidation({ status: 'ok', cells: r.cells, sites: r.sites });
    } catch (e: any) {
      setParamValidation({ status: 'error', message: e?.message || 'Calculation failed' });
    }
  };

  const topoCount = topoConditions.filter(c => c.values.length > 0).length;
  const totalConditions = topoCount + paramConditions.length;

  // ── Validation ──
  const canProceed = (s: number): boolean => {
    if (s === 0) return name.trim().length > 0;
    if (s === 1) return topoCount > 0 && (countError || matchingCount == null || matchingCount.cells > 0);
    if (s === 2) {
      // Parameters step is OPTIONAL (reverted 2026-05-06 after the
      // "mandatory" tighten-up). User decided clusters can be defined
      // by topology only. If any condition IS added, it still must
      // validate successfully with cells > 0 — partial / unvalidated
      // conditions stay blocking.
      if (paramConditions.length === 0) return true;
      return paramValidation.status === 'ok' && paramValidation.cells > 0;
    }
    return true;
  };

  const [submitting, setSubmitting] = useState(false);
  const handleSubmit = () => {
    if (submitting) return;
    setSubmitting(true);
    const topology = topoConditions
      .filter(c => c.values.length > 0)
      .map(c => ({
        dimension: c.field,
        operator: c.operator === 'NOT IN' ? 'not_in' : 'in',
        values: c.values,
      }));
    try {
      onSubmit({ name, description, status, visibility, topology, parameters: paramConditions, logic });
    } catch (e) {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-4xl mx-4 rounded-2xl bg-card border border-border shadow-2xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-base font-bold text-foreground">{editMode ? 'Edit Cluster' : 'Create New Cluster'}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Step {step + 1} of {STEPS.length}: {STEPS[step].label}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="shrink-0 px-6 py-3 border-b border-border/50 flex items-center gap-1 overflow-x-auto">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <button
                onClick={() => i <= step && setStep(i)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${
                  i === step ? 'bg-primary text-primary-foreground' :
                  i < step ? 'bg-primary/10 text-primary cursor-pointer hover:bg-primary/20' : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < step ? <Check className="w-3 h-3" /> : s.icon}
                <span>{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />}
            </React.Fragment>
          ))}
        </div>

        {/* Content — fixed min-height so the modal keeps a consistent size across all steps */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-h-[480px]">
          {/* ─── Step 1: General ─── */}
          {step === 0 && (
            <>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Cluster Name <span className="text-destructive">*</span>
                </label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Nokia LTE North Region"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Brief description of this cluster's purpose"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none h-20"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</label>
                  <div className="mt-2 flex gap-2">
                    {(['draft', 'active'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setStatus(s)}
                        className={`flex-1 px-4 py-2 rounded-xl text-sm font-bold transition-all capitalize ${
                          status === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Visibility</label>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => setVisibility('public')}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        visibility === 'public' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" /> Public
                    </button>
                    <button
                      onClick={() => setVisibility('private')}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        visibility === 'private' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" /> Private
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ─── Step 2: Topology Scope ─── */}
          {step === 1 && (
            <div className="space-y-4">
              <ScopeSummaryBar
                conditionCount={topoCount}
                loading={countLoading}
                cells={matchingCount?.cells}
                sites={matchingCount?.sites}
                error={countError}
              />

              {!filtersReady && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading filter options from backend…</span>
                </div>
              )}

              {topoConditions.length === 0 && (
                <div className="text-center py-8 px-4 rounded-xl border-2 border-dashed border-border bg-muted/20">
                  <Layers className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm font-semibold text-foreground">No topology filters yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Define your population by adding one or more topology conditions</p>
                </div>
              )}

              {topoConditions.map(cond => (
                <TopologyConditionCard
                  key={cond.id}
                  condition={cond}
                  fieldOptions={FIELD_OPTIONS}
                  getValuesForField={getValuesForField}
                  onChange={next => updateCondition(cond.id, next)}
                  onRemove={() => removeCondition(cond.id)}
                />
              ))}

              <button
                onClick={addCondition}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border-2 border-dashed border-border text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Topology Filter
              </button>
            </div>
          )}

          {/* ─── Step 3: Parameters ─── */}
          {step === 2 && (
            <div className="space-y-3">
              {/* Scope reminder */}
              {matchingCount && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-xs">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  <span className="text-muted-foreground">Applying parameters on:</span>
                  <strong className="text-primary">{matchingCount.cells.toLocaleString('fr-FR')} cells</strong>
                  <span className="text-muted-foreground/40">·</span>
                  <strong className="text-primary">{matchingCount.sites.toLocaleString('fr-FR')} sites</strong>
                </div>
              )}

              {paramConditions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No parameter conditions yet</p>
                  <p className="text-xs mt-1">Add KPI/parameter thresholds (optional)</p>
                </div>
              )}

              {paramConditions.map(cond => (
                <div key={cond.id} className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <ParameterSearchSelect
                    value={cond.parameter}
                    options={paramOptions}
                    onChange={(v) => {
                      updateParam(cond.id, 'parameter', v);
                      if (v) fetchParamValues(v);
                    }}
                    asyncSearch={async (q) => {
                      try {
                        const r = await searchParameters(q, 50);
                        return r.parameters || [];
                      } catch {
                        return [];
                      }
                    }}
                  />
                  <select
                    value={cond.operator}
                    onChange={e => updateParam(cond.id, 'operator', e.target.value)}
                    className="w-20 px-2 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 text-center"
                  >
                    {OPERATOR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {/* Value input with available values dropdown */}
                  <div className="relative flex-1 min-w-[120px]">
                    <input
                      value={cond.value}
                      onChange={e => updateParam(cond.id, 'value', e.target.value)}
                      onFocus={() => { if (cond.parameter) fetchParamValues(cond.parameter); }}
                      placeholder="Value"
                      list={`param-values-${cond.id}`}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {cond.parameter && paramValueCache[cond.parameter] && (
                      <datalist id={`param-values-${cond.id}`}>
                        {paramValueCache[cond.parameter].map(v => (
                          <option key={v.value} value={v.value}>{v.value} ({v.count})</option>
                        ))}
                      </datalist>
                    )}
                    {paramValueLoading[cond.parameter] && (
                      <Loader2 className="absolute right-2 top-2.5 w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {cond.operator === 'BETWEEN' && (
                    <div className="relative min-w-[100px]">
                      <input
                        value={cond.value2 || ''}
                        onChange={e => updateParam(cond.id, 'value2' as any, e.target.value)}
                        placeholder="Max"
                        list={`param-values2-${cond.id}`}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      {cond.parameter && paramValueCache[cond.parameter] && (
                        <datalist id={`param-values2-${cond.id}`}>
                          {paramValueCache[cond.parameter].map(v => (
                            <option key={v.value} value={v.value}>{v.value}</option>
                          ))}
                        </datalist>
                      )}
                    </div>
                  )}
                  <button onClick={() => removeParam(cond.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* Available values for selected parameter */}
                {cond.parameter && paramValueCache[cond.parameter] && paramValueCache[cond.parameter].length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1 border-t border-border/30">
                    <span className="text-[9px] font-bold uppercase text-muted-foreground mr-1 self-center">Values:</span>
                    {paramValueCache[cond.parameter].slice(0, 15).map(v => (
                      <button
                        key={v.value}
                        onClick={() => updateParam(cond.id, 'value', v.value)}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors ${
                          cond.value === v.value
                            ? 'bg-primary/20 text-primary font-semibold'
                            : 'bg-muted hover:bg-primary/10 hover:text-primary text-muted-foreground'
                        }`}
                      >
                        {v.value} <span className="opacity-50">({v.count})</span>
                      </button>
                    ))}
                    {paramValueCache[cond.parameter].length > 15 && (
                      <span className="text-[9px] text-muted-foreground self-center">+{paramValueCache[cond.parameter].length - 15} more</span>
                    )}
                  </div>
                )}
                {cond.parameter && paramValueLoading[cond.parameter] && (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" /> Loading values...
                  </div>
                )}
                </div>
              ))}
              <button
                onClick={addParamCondition}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors w-full justify-center"
              >
                <Plus className="w-4 h-4" /> Add Parameter Condition
              </button>

              {/* ── Validate & Calculate ── */}
              {paramConditions.length > 0 && (
                <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs">
                      <p className="font-bold text-foreground">Validate parameter conditions</p>
                      <p className="text-muted-foreground mt-0.5">
                        Click to recalculate matching cells & sites with these parameter filters applied.
                      </p>
                    </div>
                    <button
                      onClick={runParamValidation}
                      disabled={paramValidation.status === 'loading'}
                      className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {paramValidation.status === 'loading' ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculating…</>
                      ) : (
                        <><Check className="w-3.5 h-3.5" /> Validate & Calculate</>
                      )}
                    </button>
                  </div>

                  {paramValidation.status === 'ok' && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-xs">
                      <Check className="w-3.5 h-3.5 text-primary" />
                      <span className="text-muted-foreground">After parameter filtering:</span>
                      <strong className="text-primary">{paramValidation.cells.toLocaleString('fr-FR')} cells</strong>
                      <span className="text-muted-foreground/40">·</span>
                      <strong className="text-primary">{paramValidation.sites.toLocaleString('fr-FR')} sites</strong>
                      {matchingCount && (
                        <span className="ml-auto text-muted-foreground italic">
                          (from {matchingCount.cells.toLocaleString('fr-FR')} cells in scope)
                        </span>
                      )}
                    </div>
                  )}

                  {paramValidation.status === 'invalid' && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border text-xs text-foreground">
                      <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
                      {paramValidation.message}
                    </div>
                  )}

                  {paramValidation.status === 'error' && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {paramValidation.message}
                    </div>
                  )}

                  {paramValidation.status === 'idle' && (
                    <p className="text-[11px] text-muted-foreground italic">
                      You must validate before proceeding to the next step.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── Step 4: Review ─── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-xl bg-muted/20 border border-border/50 p-4 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">General</h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><span className="text-muted-foreground">Name: </span><strong className="text-foreground">{name}</strong></div>
                  <div><span className="text-muted-foreground">Status: </span><strong className="capitalize text-foreground">{status}</strong></div>
                  <div><span className="text-muted-foreground">Visibility: </span><strong className="capitalize text-foreground">{visibility}</strong></div>
                </div>
                {description && <p className="text-xs text-muted-foreground italic pt-2 border-t border-border/30">{description}</p>}
              </div>

              {topoConditions.length > 0 && (
                <div className="rounded-xl bg-muted/20 border border-border/50 p-4 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Topology ({topoConditions.length})</h4>
                  {topoConditions.map(c => (
                    <div key={c.id} className="flex items-start gap-2 text-xs py-1 border-b border-border/30 last:border-0">
                      <span className="font-semibold text-foreground capitalize w-20">{c.field}</span>
                      <span className="text-muted-foreground font-mono">{c.operator}</span>
                      <div className="flex flex-wrap gap-1 flex-1 justify-end">
                        {c.values.slice(0, 5).map(v => (
                          <span key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{v}</span>
                        ))}
                        {c.values.length > 5 && <span className="text-[10px] text-muted-foreground self-center">+{c.values.length - 5}</span>}
                      </div>
                    </div>
                  ))}
                  {matchingCount && (
                    <div className="pt-2 mt-2 border-t border-border/30 text-xs">
                      <span className="text-muted-foreground">Resolved scope: </span>
                      <strong className="text-primary">{matchingCount.cells.toLocaleString('fr-FR')} cells</strong>
                      <span className="text-muted-foreground/40 mx-1">·</span>
                      <strong className="text-primary">{matchingCount.sites.toLocaleString('fr-FR')} sites</strong>
                    </div>
                  )}
                </div>
              )}

              {paramConditions.length > 0 && (
                <div className="rounded-xl bg-muted/20 border border-border/50 p-4 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Parameters ({paramConditions.length})</h4>
                  {paramConditions.map(p => (
                    <div key={p.id} className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0 text-xs">
                      <span className="font-semibold text-foreground">{p.parameter}</span>
                      <span className="font-mono text-muted-foreground">{p.operator}</span>
                      <span className="font-mono text-primary font-bold">{p.value}{p.value2 ? ` — ${p.value2}` : ''}</span>
                    </div>
                  ))}
                  {paramValidation.status === 'ok' && (
                    <div className="pt-2 mt-2 border-t border-border/30 text-xs">
                      <span className="text-muted-foreground">After parameters: </span>
                      <strong className="text-primary">{paramValidation.cells.toLocaleString('fr-FR')} cells</strong>
                      <span className="text-muted-foreground/40 mx-1">·</span>
                      <strong className="text-primary">{paramValidation.sites.toLocaleString('fr-FR')} sites</strong>
                    </div>
                  )}
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                Total conditions: <strong className="text-foreground">{totalConditions}</strong>
              </div>

              {/* Preview Results */}
              <ClusterPreviewTable
                topoConditions={topoConditions}
                paramConditions={paramConditions.length > 0 && paramValidation.status === 'ok'
                  ? paramConditions.map(c => ({ parameter: c.parameter, operator: c.operator, value: c.value, value2: c.value2 }))
                  : undefined}
                totalMatched={paramValidation.status === 'ok' ? paramValidation.sites : matchingCount?.sites}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-border">
          <button
            onClick={() => step > 0 ? setStep(step - 1) : onClose()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> {step === 0 ? 'Cancel' : 'Back'}
          </button>
          <div className="flex gap-2">
            {step === STEPS.length - 1 && (
              <button
                onClick={() => { setStatus('draft'); handleSubmit(); }}
                className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Save as Draft
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed(step)}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-opacity"
                title={step === 1 && topoCount === 0 ? 'Add at least one topology filter' : step === 1 && matchingCount?.cells === 0 ? 'Scope is empty — revise filters' : ''}
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!name.trim()}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                <Check className="w-4 h-4" /> {editMode ? 'Update Cluster' : 'Save Cluster'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClusterBuilderWizard;
