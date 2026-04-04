import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check, Plus, Trash2, AlertCircle } from 'lucide-react';
import { TOPOLOGY_DIMENSIONS, PARAMETER_OPTIONS, OPERATOR_OPTIONS } from './filterTypes';
import type { TopologyCondition, ParameterCondition } from './filterTypes';
import BulkListInput from './BulkListInput';

interface CreateFilterWizardProps {
  onSubmit: (data: any) => void;
  onClose: () => void;
  initialData?: any;
  editMode?: boolean;
}

const STEPS = ['General Info', 'Topology', 'Parameters', 'Logic', 'Review'];

const CreateFilterWizard: React.FC<CreateFilterWizardProps> = ({ onSubmit, onClose, initialData, editMode }) => {
  const [step, setStep] = useState(0);

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
    setParamConditions(prev => [...prev, { id: `p-${Date.now()}`, parameter: PARAMETER_OPTIONS[0], operator: '>', value: '' }]);
  };

  const updateParam = (id: string, field: keyof ParameterCondition, value: string) => {
    setParamConditions(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const removeParam = (id: string) => {
    setParamConditions(prev => prev.filter(p => p.id !== id));
  };

  const topoCount = Object.values(topoConditions).filter(v => v.length > 0).length;
  const totalConditions = topoCount + paramConditions.length;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-3xl mx-4 rounded-2xl bg-card border border-border shadow-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
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
              {TOPOLOGY_DIMENSIONS.map(dim => (
                <div key={dim.key} className="rounded-xl border border-border/50 bg-muted/10 p-4">
                  {dim.bulkSupport ? (
                    <BulkListInput
                      label={dim.label}
                      values={topoConditions[dim.key] || []}
                      onChange={vals => setTopoValues(dim.key, vals)}
                      placeholder={`Enter ${dim.label.toLowerCase()}…`}
                    />
                  ) : (
                    <>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{dim.label}</label>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {dim.options.map(opt => {
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
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Step 3: Parameters */}
          {step === 2 && (
            <div className="space-y-3">
              {paramConditions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No parameter conditions yet</p>
                  <p className="text-xs mt-1">Add conditions to filter by KPI values</p>
                </div>
              )}
              {paramConditions.map(cond => (
                <div key={cond.id} className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/10 p-3">
                  <select value={cond.parameter} onChange={e => updateParam(cond.id, 'parameter', e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer">
                    {PARAMETER_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select value={cond.operator} onChange={e => updateParam(cond.id, 'operator', e.target.value)}
                    className="w-20 px-2 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer text-center">
                    {OPERATOR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input value={cond.value} onChange={e => updateParam(cond.id, 'value', e.target.value)} placeholder="Value"
                    className="w-24 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  {cond.operator === 'BETWEEN' && (
                    <input value={cond.value2 || ''} onChange={e => updateParam(cond.id, 'value2' as any, e.target.value)} placeholder="Max"
                      className="w-24 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  )}
                  <button onClick={() => removeParam(cond.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button onClick={addParamCondition}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors w-full justify-center">
                <Plus className="w-4 h-4" /> Add Parameter Condition
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
