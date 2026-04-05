import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check, AlertCircle, Loader2 } from 'lucide-react';
import type { KpiCatalogEntry } from './kpiCatalogTypes';

interface KpiCreateWizardProps {
  onSubmit: (data: Record<string, any>) => Promise<void> | void;
  onClose: () => void;
  initialData?: KpiCatalogEntry | null;
  mode?: 'create' | 'edit';
}

const STEPS = ['General Info', 'Formula', 'Numerator', 'Denominator', 'Review'];

const InputField: React.FC<{
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; textarea?: boolean; mono?: boolean;
}> = ({ label, value, onChange, placeholder, required, textarea, mono }) => (
  <div>
    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      {label} {required && <span className="text-destructive">*</span>}
    </label>
    {textarea ? (
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full mt-1 px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none h-20 ${mono ? 'font-mono' : ''}`}
      />
    ) : (
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 ${mono ? 'font-mono' : ''}`}
      />
    )}
  </div>
);

const SelectField: React.FC<{
  label: string; value: string; onChange: (v: string) => void; options: string[];
}> = ({ label, value, onChange, options }) => (
  <div>
    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</label>
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer"
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const KpiCreateWizard: React.FC<KpiCreateWizardProps> = ({ onSubmit, onClose, initialData, mode = 'create' }) => {
  const isEdit = mode === 'edit';
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 — General
  const [code, setCode] = useState(initialData?.kpi_code || '');
  const [name, setName] = useState(initialData?.display_name || '');
  const [desc, setDesc] = useState(initialData?.description || '');
  const [tech, setTech] = useState(initialData?.technology || 'LTE');
  const [vendor, setVendor] = useState(initialData?.vendor || 'Nokia');
  const [category, setCategory] = useState(initialData?.category || 'Accessibility');
  const [unit, setUnit] = useState(initialData?.unit || '%');
  const [scope, setScope] = useState(initialData?.scope || 'Cell');

  // Step 2 — Formula
  const [formula, setFormula] = useState(initialData?.formula || '');
  const [formulaType, setFormulaType] = useState(initialData?.formula_type || 'ratio');

  // Step 3 — Numerator
  const [numName, setNumName] = useState(initialData?.numerator?.name || '');
  const [numDesc, setNumDesc] = useState(initialData?.numerator?.description || '');
  const [numCounters, setNumCounters] = useState(initialData?.numerator?.counters?.map(c => c.name).join(', ') || '');
  const [numSource, setNumSource] = useState(initialData?.numerator?.source || 'OSS PM');
  const [numGran, setNumGran] = useState(initialData?.numerator?.granularity || '15min');

  // Step 4 — Denominator
  const [denName, setDenName] = useState(initialData?.denominator?.name || '');
  const [denDesc, setDenDesc] = useState(initialData?.denominator?.description || '');
  const [denCounters, setDenCounters] = useState(initialData?.denominator?.counters?.map(c => c.name).join(', ') || '');
  const [denSource, setDenSource] = useState(initialData?.denominator?.source || 'OSS PM');
  const [denGran, setDenGran] = useState(initialData?.denominator?.granularity || '15min');

  // Thresholds
  const [thresholdGreen, setThresholdGreen] = useState(initialData?.thresholds?.green?.toString() || '');
  const [thresholdOrange, setThresholdOrange] = useState(initialData?.thresholds?.orange?.toString() || '');

  const canNext = () => {
    if (step === 0) return code.trim() && name.trim();
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit({
        kpi_code: code, nom_ihm: name, definition_courte: desc,
        techno: tech, vendor, famille: category, unites: unit, scope,
        formula, formula_type: formulaType,
        numerateur: numCounters, numerator_name: numName, numerator_desc: numDesc,
        num_source: numSource, num_granularity: numGran,
        denominateur: denCounters, denominator_name: denName, denominator_desc: denDesc,
        den_source: denSource, den_granularity: denGran,
        seuil_vert: thresholdGreen ? parseFloat(thresholdGreen) : null,
        seuil_orange: thresholdOrange ? parseFloat(thresholdOrange) : null,
        status: isEdit ? (initialData?.status || 'draft') : 'draft',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const ReviewRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="flex justify-between items-start py-1.5 border-b border-border/30">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs text-foreground text-right ml-4">{value || '—'}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl mx-4 rounded-2xl bg-card border border-border shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-base font-bold text-foreground">{isEdit ? 'Edit KPI' : 'Create New KPI'}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="shrink-0 px-6 py-3 border-b border-border/50 flex items-center gap-1">
          {STEPS.map((s, i) => (
            <React.Fragment key={i}>
              <button
                onClick={() => i <= step && setStep(i)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                  i === step ? 'bg-primary text-primary-foreground' :
                  i < step ? 'bg-primary/10 text-primary cursor-pointer' :
                  'bg-muted text-muted-foreground'
                }`}
              >
                {i < step ? <Check className="w-3 h-3" /> : <span className="w-3 text-center">{i + 1}</span>}
                <span className="hidden sm:inline">{s}</span>
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground/40" />}
            </React.Fragment>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {step === 0 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <InputField label="KPI Code" value={code} onChange={setCode} placeholder="e.g. rrc_setup_sr" required mono />
                <InputField label="Display Name" value={name} onChange={setName} placeholder="e.g. RRC Setup Success Rate" required />
              </div>
              <InputField label="Description" value={desc} onChange={setDesc} placeholder="Brief description of this KPI" textarea />
              <div className="grid grid-cols-2 gap-4">
                <SelectField label="Technology" value={tech} onChange={setTech} options={['LTE', 'NR', 'ALL']} />
                <SelectField label="Vendor" value={vendor} onChange={setVendor} options={['Nokia', 'Ericsson', 'Huawei', 'ALL']} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <SelectField label="Category" value={category} onChange={setCategory} options={['Accessibility', 'Retainability', 'Throughput', 'Traffic', 'Mobility', 'Radio Quality', 'VoLTE', 'Latency', 'Integrity', 'Other']} />
                <InputField label="Unit" value={unit} onChange={setUnit} placeholder="%, Mbps, ms" />
                <SelectField label="Scope" value={scope} onChange={setScope} options={['Cell', 'Site', 'Cluster', 'Network']} />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <InputField label="Formula" value={formula} onChange={setFormula} placeholder="e.g. SUM(pmRrcConnEstabSucc) / SUM(pmRrcConnEstabAtt) x 100" textarea mono />
              <SelectField label="Formula Type" value={formulaType} onChange={setFormulaType} options={['ratio', 'sum', 'average', 'max', 'min', 'composite']} />
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Green Threshold" value={thresholdGreen} onChange={setThresholdGreen} placeholder="e.g. 99.5" />
                <InputField label="Orange Threshold" value={thresholdOrange} onChange={setThresholdOrange} placeholder="e.g. 98.0" />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <InputField label="Numerator Name" value={numName} onChange={setNumName} placeholder="e.g. RRC Setup Successes" />
              <InputField label="Description" value={numDesc} onChange={setNumDesc} placeholder="What the numerator represents" textarea />
              <InputField label="Counters (comma-separated)" value={numCounters} onChange={setNumCounters} placeholder="pmRrcConnEstabSucc, pmRrcConnEstabSuccMos" mono />
              <div className="grid grid-cols-2 gap-4">
                <SelectField label="Source" value={numSource} onChange={setNumSource} options={['OSS PM', 'OSS CM', 'NMS', 'Probes', 'External']} />
                <SelectField label="Granularity" value={numGran} onChange={setNumGran} options={['15min', '1hour', 'daily', 'weekly']} />
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <InputField label="Denominator Name" value={denName} onChange={setDenName} placeholder="e.g. RRC Setup Attempts" />
              <InputField label="Description" value={denDesc} onChange={setDenDesc} placeholder="What the denominator represents" textarea />
              <InputField label="Counters (comma-separated)" value={denCounters} onChange={setDenCounters} placeholder="pmRrcConnEstabAtt" mono />
              <div className="grid grid-cols-2 gap-4">
                <SelectField label="Source" value={denSource} onChange={setDenSource} options={['OSS PM', 'OSS CM', 'NMS', 'Probes', 'External']} />
                <SelectField label="Granularity" value={denGran} onChange={setDenGran} options={['15min', '1hour', 'daily', 'weekly']} />
              </div>
            </>
          )}

          {step === 4 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-medium text-amber-600">Review all details before submitting</span>
              </div>
              <ReviewRow label="Code" value={code} />
              <ReviewRow label="Name" value={name} />
              <ReviewRow label="Description" value={desc} />
              <ReviewRow label="Technology" value={tech} />
              <ReviewRow label="Vendor" value={vendor} />
              <ReviewRow label="Category" value={category} />
              <ReviewRow label="Unit" value={unit} />
              <ReviewRow label="Scope" value={scope} />
              <ReviewRow label="Formula" value={formula} />
              <ReviewRow label="Formula Type" value={formulaType} />
              <ReviewRow label="Green Threshold" value={thresholdGreen || '—'} />
              <ReviewRow label="Orange Threshold" value={thresholdOrange || '—'} />
              <ReviewRow label="Numerator" value={`${numName} — ${numCounters}`} />
              <ReviewRow label="Denominator" value={`${denName} — ${denCounters}`} />
              <div className="mt-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs text-amber-700">
                  {isEdit
                    ? 'The KPI will be updated with the values above.'
                    : <>This KPI will be created with <strong>Draft</strong> status. Submit for validation after creation.</>
                  }
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-border">
          <button
            onClick={() => step > 0 ? setStep(step - 1) : onClose()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
            disabled={submitting}
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canNext()}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!code.trim() || !name.trim() || submitting}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              ) : (
                <><Check className="w-4 h-4" /> {isEdit ? 'Save Changes' : 'Submit for Validation'}</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default KpiCreateWizard;
