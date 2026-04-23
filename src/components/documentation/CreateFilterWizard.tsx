import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronRight, ChevronLeft, Check, Plus, Trash2, AlertCircle, Loader2, Radio } from 'lucide-react';
import { TOPOLOGY_DIMENSIONS, OPERATOR_OPTIONS } from './filterTypes';
import type { TopologyCondition, ParameterCondition } from './filterTypes';
import BulkListInput from './BulkListInput';
import { loadFilterCache, resolveAvailableValues, type ActiveFilter } from '@/config/filterDimensions';
import { countMatching, searchParameters, getParameterValues, type MatchingCount } from '@/services/filterService';

interface CreateFilterWizardProps {
  onSubmit: (data: any) => void;
  onClose: () => void;
  initialData?: any;
  editMode?: boolean;
}

const STEPS = ['General Info', 'Topology', 'Parameters', 'Logic', 'Review'];

const CreateFilterWizard: React.FC<CreateFilterWizardProps> = ({ onSubmit, onClose, initialData, editMode }) => {
  const [step, setStep] = useState(0);
  const [filtersReady, setFiltersReady] = useState(false);

  useEffect(() => { loadFilterCache().then(() => setFiltersReady(true)).catch(() => setFiltersReady(true)); }, []);

  // Step 1
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [status, setStatus] = useState(initialData?.status || 'draft');

  // Step 2 — Topology
  const [topoConditions, setTopoConditions] = useState<Record<string, string[]>>(
    () => {
      const init: Record<string, string[]> = {};
      if (initialData?.topology) {
        initialData.topology.forEach((t: TopologyCondition) => { init[t.dimension] = [...t.values]; });
      }
      return init;
    }
  );

  // Step 3 — Parameters
  const [paramConditions, setParamConditions] = useState<ParameterCondition[]>(
    initialData?.parameters || []
  );

  // Step 4 — Logic
  const [logic, setLogic] = useState<'AND' | 'OR'>(initialData?.logic || 'AND');

  const setTopoValues = (dim: string, values: string[]) => {
    setTopoConditions(prev => ({ ...prev, [dim]: values }));
  };

  const toggleTopoOption = (dim: string, value: string) => {
    setTopoConditions(prev => {
      const current = prev[dim] || [];
      return { ...prev, [dim]: current.includes(value) ? current.filter(v => v !== value) : [...current, value] };
    });
  };

  const addParamCondition = () => {
    setParamConditions(prev => [...prev, { id: `p-${Date.now()}`, parameter: '', operator: '=', value: '' }]);
  };

  // Parameter search state per condition
  const [paramSearches, setParamSearches] = useState<Record<string, { q: string; results: string[]; loading: boolean; open: boolean }>>({});
  const paramSearchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Parameter existing values (loaded when a parameter is selected)
  const [paramExistingValues, setParamExistingValues] = useState<Record<string, { values: { value: string; count: number }[]; loading: boolean }>>({});

  const searchParam = (condId: string, q: string) => {
    setParamSearches(prev => ({ ...prev, [condId]: { q, results: prev[condId]?.results || [], loading: true, open: true } }));
    if (paramSearchTimers.current[condId]) clearTimeout(paramSearchTimers.current[condId]);
    paramSearchTimers.current[condId] = setTimeout(() => {
      searchParameters(q, 20)
        .then(res => setParamSearches(prev => ({ ...prev, [condId]: { ...prev[condId], results: res.parameters, loading: false } })))
        .catch(() => setParamSearches(prev => ({ ...prev, [condId]: { ...prev[condId], results: [], loading: false } })));
    }, 300);
  };

  const selectParam = (condId: string, param: string) => {
    updateParam(condId, 'parameter', param);
    setParamSearches(prev => ({ ...prev, [condId]: { ...prev[condId], open: false, q: param } }));
    // Load existing values for this parameter
    setParamExistingValues(prev => ({ ...prev, [condId]: { values: [], loading: true } }));
    getParameterValues(param)
      .then(res => setParamExistingValues(prev => ({ ...prev, [condId]: { values: res.values || [], loading: false } })))
      .catch(() => setParamExistingValues(prev => ({ ...prev, [condId]: { values: [], loading: false } })));
  };

  const updateParam = (id: string, field: keyof ParameterCondition, value: string) => {
    setParamConditions(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const removeParam = (id: string) => {
    setParamConditions(prev => prev.filter(p => p.id !== id));
  };

  // Build active filters for cascade resolution
  const activeFilters: ActiveFilter[] = Object.entries(topoConditions)
    .filter(([, v]) => v.length > 0)
    .map(([dim, vals]) => ({ id: dim, dimension: dim, op: 'IN' as const, values: vals }));

  // Map wizard dimension keys to filterDimensions keys
  const WIZARD_TO_DIM: Record<string, string> = {
    vendor: 'constructeur',
    dor: 'dor',
    plaque: 'plaque',
    band: 'bande',
  };

  const getDynamicOptions = useCallback((wizardKey: string): string[] => {
    const dimKey = WIZARD_TO_DIM[wizardKey] || wizardKey;
    return resolveAvailableValues(dimKey, activeFilters);
  }, [activeFilters, filtersReady]);

  const topoCount = Object.values(topoConditions).filter(v => v.length > 0).length;
  const totalConditions = topoCount + paramConditions.length;

  // Live matching count — debounced API call when topo conditions change
  const [matchingCount, setMatchingCount] = useState<MatchingCount | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Include parameter conditions with valid parameter+value in count
  const validParamConditions = paramConditions.filter(p => p.parameter && p.value);

  useEffect(() => {
    if (countTimer.current) clearTimeout(countTimer.current);
    const topology = Object.entries(topoConditions)
      .filter(([, v]) => v.length > 0)
      .map(([dimension, values]) => ({ dimension, operator: 'in', values }));
    if (topology.length === 0 && validParamConditions.length === 0) {
      setMatchingCount(null);
      return;
    }
    setCountLoading(true);
    countTimer.current = setTimeout(() => {
      countMatching(topology, validParamConditions)
        .then(setMatchingCount)
        .catch(() => setMatchingCount(null))
        .finally(() => setCountLoading(false));
    }, 600);
    return () => { if (countTimer.current) clearTimeout(countTimer.current); };
  }, [topoConditions, paramConditions]);

  const canNext = () => {
    if (step === 0) return name.trim().length > 0;
    return true;
  };

  const handleSubmit = () => {
    const topology = Object.entries(topoConditions)
      .filter(([, v]) => v.length > 0)
      .map(([dimension, values]) => ({ dimension, operator: 'in' as const, values }));
    onSubmit({ name, description, status, topology, parameters: paramConditions, logic });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-3xl mx-4 rounded-2xl bg-card border border-border shadow-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-base font-bold text-foreground">{editMode ? 'Edit Filter' : 'Create New Filter'}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        {/* Step Indicator */}
        <div className="shrink-0 px-6 py-3 border-b border-border/50 flex items-center gap-1">
          {STEPS.map((s, i) => (
            <React.Fragment key={i}>
              <button onClick={() => i <= step && setStep(i)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                  i === step ? 'bg-primary text-primary-foreground' :
                  i < step ? 'bg-primary/10 text-primary cursor-pointer' : 'bg-muted text-muted-foreground'
                }`}>
                {i < step ? <Check className="w-3 h-3" /> : <span className="w-3 text-center">{i + 1}</span>}
                <span className="hidden sm:inline">{s}</span>
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground/40" />}
            </React.Fragment>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Step 1: General */}
          {step === 0 && (
            <>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Filter Name <span className="text-destructive">*</span></label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Nokia LTE North Region"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of this filter's purpose"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none h-20" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</label>
                <div className="mt-2 flex gap-2">
                  {(['draft', 'active'] as const).map(s => (
                    <button key={s} onClick={() => setStatus(s)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${status === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                      {s === 'draft' ? 'Draft' : 'Active'}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Step 2: Topology */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Live matching count */}
              {topoCount > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/20 bg-primary/5">
                  <Radio className="w-4 h-4 text-primary" />
                  {countLoading ? (
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" /> Counting…
                    </span>
                  ) : matchingCount ? (
                    <span className="text-xs text-foreground">
                      <span className="font-bold text-primary">{matchingCount.cells.toLocaleString('fr-FR')}</span> cells
                      <span className="mx-1.5 text-muted-foreground">·</span>
                      <span className="font-bold text-primary">{matchingCount.sites.toLocaleString('fr-FR')}</span> sites match
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Select topology filters to see matching count</span>
                  )}
                </div>
              )}
              {!filtersReady && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading filter options from backend…</span>
                </div>
              )}
              {TOPOLOGY_DIMENSIONS.map(dim => {
                const dynamicOpts = dim.bulkSupport ? [] : getDynamicOptions(dim.key);
                const options = dynamicOpts.length > 0 ? dynamicOpts : dim.options;
                return (
                  <div key={dim.key} className="rounded-xl border border-border/50 bg-muted/10 p-4">
                    {dim.bulkSupport ? (
                      <BulkListInput
                        label={dim.label}
                        values={topoConditions[dim.key] || []}
                        onChange={vals => setTopoValues(dim.key, vals)}
                        placeholder={`Enter ${dim.label.toLowerCase()}…`}
                        dimensionKey={dim.key}
                      />
                    ) : (
                      <>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {dim.label}
                          <span className="ml-2 text-[9px] font-normal text-muted-foreground/60">({options.length})</span>
                        </label>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {options.map(opt => {
                            const selected = (topoConditions[dim.key] || []).includes(opt);
                            return (
                              <button key={opt} onClick={() => toggleTopoOption(dim.key, opt)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                  selected ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}>
                                {opt}
                              </button>
                            );
                          })}
                          {options.length === 0 && (
                            <span className="text-xs text-muted-foreground/60 italic">No options available</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Step 3: CM Parameters */}
          {step === 2 && (
            <div className="space-y-3">
              {paramConditions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No parameter conditions yet</p>
                  <p className="text-xs mt-1">Add conditions to filter by CM parameters from Nokia/Ericsson dump</p>
                  <p className="text-[10px] mt-0.5 text-muted-foreground/60">e.g. LNCEL.pMax &gt; 460, LNCEL.a3Offset = 3</p>
                </div>
              )}
              {paramConditions.map(cond => {
                const ps = paramSearches[cond.id] || { q: cond.parameter, results: [], loading: false, open: false };
                return (
                  <div key={cond.id} className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      {/* Parameter search input */}
                      <div className="flex-1 relative">
                        <input
                          value={ps.open ? ps.q : cond.parameter}
                          onChange={e => searchParam(cond.id, e.target.value)}
                          onFocus={() => { if (cond.parameter) searchParam(cond.id, cond.parameter); }}
                          placeholder="Search parameter… (e.g. LNCEL.pMax)"
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground font-mono placeholder:text-muted-foreground placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        {ps.loading && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                        {ps.open && (
                          <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                            {ps.results.length === 0 && !ps.loading ? (
                              <div className="px-3 py-3 text-xs text-muted-foreground">
                                {ps.q.length < 2 ? 'Type at least 2 characters…' : `No parameters matching "${ps.q}"`}
                              </div>
                            ) : (
                              ps.results.map(p => (
                                <button key={p} onClick={() => selectParam(cond.id, p)}
                                  className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors hover:bg-muted ${p === cond.parameter ? 'bg-primary/10 text-primary' : 'text-foreground'}`}>
                                  {p}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      {/* Operator */}
                      <select value={cond.operator} onChange={e => updateParam(cond.id, 'operator', e.target.value)}
                        className="w-20 px-2 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer text-center">
                        {OPERATOR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      {/* Value */}
                      <input value={cond.value} onChange={e => updateParam(cond.id, 'value', e.target.value)} placeholder="Value"
                        className="w-28 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      {cond.operator === 'BETWEEN' && (
                        <input value={cond.value2 || ''} onChange={e => updateParam(cond.id, 'value2' as any, e.target.value)} placeholder="Max"
                          className="w-28 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      )}
                      <button onClick={() => removeParam(cond.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {cond.parameter && (
                      <div className="text-[10px] text-muted-foreground pl-1">
                        <span className="font-mono text-primary">{cond.parameter}</span>
                        {cond.value && <> <span className="font-mono">{cond.operator}</span> <span className="font-mono font-bold">{cond.value}{cond.value2 ? ` — ${cond.value2}` : ''}</span></>}
                      </div>
                    )}
                    {/* Existing values for selected parameter */}
                    {cond.parameter && paramExistingValues[cond.id] && (
                      <div className="mt-1 pl-1">
                        {paramExistingValues[cond.id].loading ? (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Loader2 className="w-3 h-3 animate-spin" /> Loading values…
                          </div>
                        ) : paramExistingValues[cond.id].values.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {paramExistingValues[cond.id].values.slice(0, 10).map(v => (
                              <button
                                key={v.value}
                                type="button"
                                onClick={() => updateParam(cond.id, 'value', v.value)}
                                className={`px-2 py-0.5 rounded-md text-[10px] font-mono transition-colors border ${
                                  cond.value === v.value
                                    ? 'bg-primary/15 text-primary border-primary/30 font-bold'
                                    : 'bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/60 hover:text-foreground'
                                }`}
                                title={`${v.count.toLocaleString()} cells`}
                              >
                                {v.value} <span className="opacity-50">({v.count.toLocaleString()})</span>
                              </button>
                            ))}
                            {paramExistingValues[cond.id].values.length > 10 && (
                              <span className="text-[9px] text-muted-foreground self-center">+{paramExistingValues[cond.id].values.length - 10} more</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/60">No values found</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <button onClick={addParamCondition}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors w-full justify-center">
                <Plus className="w-4 h-4" /> Add CM Parameter Condition
              </button>
            </div>
          )}

          {/* Step 4: Logic */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Condition Logic</label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">Choose how conditions are combined</p>
                <div className="flex gap-3">
                  {(['AND', 'OR'] as const).map(l => (
                    <button key={l} onClick={() => setLogic(l)}
                      className={`flex-1 py-4 rounded-xl text-sm font-bold transition-all border-2 ${
                        logic === l ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:border-primary/30'
                      }`}>
                      <span className="text-lg">{l}</span>
                      <p className="text-[10px] mt-1 font-normal opacity-70">
                        {l === 'AND' ? 'All conditions must match' : 'Any condition can match'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {totalConditions > 0 && (
                <div className="rounded-xl bg-muted/30 border border-border/50 p-4">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Condition Preview</label>
                  <div className="space-y-1.5">
                    {Object.entries(topoConditions).filter(([, v]) => v.length > 0).map(([dim, vals], i) => (
                      <div key={dim} className="flex items-center gap-2 text-xs">
                        {i > 0 && <span className="text-[10px] font-bold text-primary px-1.5 py-0.5 rounded bg-primary/10">{logic}</span>}
                        <span className="font-semibold text-foreground capitalize">{dim}</span>
                        <span className="text-muted-foreground">IN</span>
                        <span className="font-mono text-primary">[{vals.slice(0, 3).join(', ')}{vals.length > 3 ? ` +${vals.length - 3}` : ''}]</span>
                      </div>
                    ))}
                    {paramConditions.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-2 text-xs">
                        {(i > 0 || topoCount > 0) && <span className="text-[10px] font-bold text-primary px-1.5 py-0.5 rounded bg-primary/10">{logic}</span>}
                        <span className="font-semibold text-foreground">{p.parameter}</span>
                        <span className="text-muted-foreground">{p.operator}</span>
                        <span className="font-mono text-primary">{p.value}{p.value2 ? ` — ${p.value2}` : ''}</span>
                      </div>
                    ))}
                  </div>

                  {/* Matching count in preview */}
                  {topoCount > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/30 flex items-center gap-2">
                      <Radio className="w-3.5 h-3.5 text-primary" />
                      {countLoading ? (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 animate-spin" /> Counting…
                        </span>
                      ) : matchingCount ? (
                        <span className="text-[11px] text-foreground">
                          Matching: <span className="font-bold text-primary">{matchingCount.cells.toLocaleString('fr-FR')}</span> cells
                          <span className="mx-1 text-muted-foreground">·</span>
                          <span className="font-bold text-primary">{matchingCount.sites.toLocaleString('fr-FR')}</span> sites
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 5: Review */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-medium text-amber-600">Review all details before saving</span>
              </div>

              <div className="rounded-xl bg-muted/20 border border-border/50 p-4 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">General</h4>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Name</span>
                  <span className="text-xs text-foreground">{name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Description</span>
                  <span className="text-xs text-foreground text-right max-w-xs truncate">{description || '—'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Status</span>
                  <span className="text-xs text-foreground capitalize">{status}</span>
                </div>
              </div>

              {topoCount > 0 && (
                <div className="rounded-xl bg-muted/20 border border-border/50 p-4 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Topology ({topoCount} conditions)</h4>
                  {Object.entries(topoConditions).filter(([, v]) => v.length > 0).map(([dim, vals]) => (
                    <div key={dim} className="flex items-start justify-between py-1 border-b border-border/30 last:border-0">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase capitalize">{dim}</span>
                      <div className="flex flex-wrap gap-1 justify-end max-w-xs">
                        {vals.slice(0, 5).map(v => (
                          <span key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{v}</span>
                        ))}
                        {vals.length > 5 && <span className="text-[9px] text-muted-foreground">+{vals.length - 5} more</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {paramConditions.length > 0 && (
                <div className="rounded-xl bg-muted/20 border border-border/50 p-4 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Parameters ({paramConditions.length} conditions)</h4>
                  {paramConditions.map(p => (
                    <div key={p.id} className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0 text-xs">
                      <span className="font-semibold text-foreground">{p.parameter}</span>
                      <span className="font-mono text-muted-foreground">{p.operator}</span>
                      <span className="font-mono text-primary font-bold">{p.value}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl bg-muted/20 border border-border/50 p-4">
                <div className="flex justify-between">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Logic</span>
                  <span className="text-xs font-bold text-primary">{logic}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Total Conditions</span>
                  <span className="text-xs font-bold text-foreground">{totalConditions}</span>
                </div>
                {matchingCount && (
                  <div className="flex justify-between mt-1 pt-1 border-t border-border/30">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Matching</span>
                    <span className="text-xs font-bold text-primary">
                      {matchingCount.cells.toLocaleString('fr-FR')} cells · {matchingCount.sites.toLocaleString('fr-FR')} sites
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-border">
          <button onClick={() => step > 0 ? setStep(step - 1) : onClose()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <ChevronLeft className="w-4 h-4" /> {step === 0 ? 'Cancel' : 'Back'}
          </button>
          <div className="flex gap-2">
            {step === STEPS.length - 1 && (
              <button onClick={() => { setStatus('draft'); handleSubmit(); }}
                className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                Save as Draft
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button onClick={() => setStep(step + 1)} disabled={!canNext()}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-opacity">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={!name.trim()}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-opacity">
                <Check className="w-4 h-4" /> {editMode ? 'Update Filter' : 'Save Filter'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateFilterWizard;
