import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check, AlertCircle } from 'lucide-react';

interface KpiCreateWizardProps {
  onSubmit: (data: Record<string, any>) => void;
  onClose: () => void;
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

const KpiCreateWizard: React.FC<KpiCreateWizardProps> = ({ onSubmit, onClose }) => {
  const [step, setStep] = useState(0);

  // Step 1 — General
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [tech, setTech] = useState('LTE');
  const [vendor, setVendor] = useState('Nokia');
  const [category, setCategory] = useState('Accessibility');
  const [unit, setUnit] = useState('%');
  const [scope, setScope] = useState('Cell');

  // Step 2 — Formula
  const [formula, setFormula] = useState('');
  const [formulaType, setFormulaType] = useState('ratio');

  // Step 3 — Numerator
  const [numName, setNumName] = useState('');
  const [numDesc, setNumDesc] = useState('');
  const [numCounters, setNumCounters] = useState('');
  const [numSource, setNumSource] = useState('OSS PM');
  const [numGran, setNumGran] = useState('15min');

  // Step 4 — Denominator
  const [denName, setDenName] = useState('');
  const [denDesc, setDenDesc] = useState('');
  const [denCounters, setDenCounters] = useState('');
  const [denSource, setDenSource] = useState('OSS PM');
  const [denGran, setDenGran] = useState('15min');

  const canNext = () => {
    if (step === 0) return code.trim() && name.trim();
    return true;
  };

  const handleSubmit = () => {
    onSubmit({
      kpi_code: code, nom_ihm: name, definition_courte: desc,
      techno: tech, vendor, famille: category, unites: unit, scope,
      formula, formula_type: formulaType,
      numerateur: numCounters, numerator_name: numName, numerator_desc: numDesc,
      num_source: numSource, num_granularity: numGran,
      denominateur: denCounters, denominator_name: denName, denominator_desc: denDesc,
      den_source: denSource, den_granularity: denGran,
      status: 'draft',
    });
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
            <h3 className="text-base font-bold text-foreground">Create New KPI</h3>
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
              <InputField label="Formula" value={formula} onChange={setFormula} placeholder="e.g. SUM(pmRrcConnEstabSucc) / SUM(pmRrcConnEstabAtt) × 100" textarea mono />
              <SelectField label="Formula Type" value={formulaType} onChange={setFormulaType} options={['ratio', 'sum', 'average', 'max', 'min', 'composite']} />
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
              <ReviewRow label="Numerator" value={`${numName} — ${numCounters}`} />
              <ReviewRow label="Denominator" value={`${denName} — ${denCounters}`} />
              <div className="mt-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs text-amber-700">This KPI will be created with <strong>Draft</strong> status. Submit for validation after creation.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-border">
          <button
            onClick={() => step > 0 ? setStep(step - 1) : onClose()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
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
              disabled={!code.trim() || !name.trim()}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              <Check className="w-4 h-4" /> Submit for Validation
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default KpiCreateWizard;
