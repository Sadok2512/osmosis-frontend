import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check, AlertCircle, Loader2, Play, BarChart3, Code2 } from 'lucide-react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import type { KpiCatalogEntry } from './kpiCatalogTypes';
import KpiFxAdvancedMode from './KpiFxAdvancedMode';

interface KpiCreateWizardProps {
  onSubmit: (data: Record<string, any>) => Promise<void> | void;
  onClose: () => void;
  initialData?: KpiCatalogEntry | null;
  mode?: 'create' | 'edit';
}

const STEPS = ['General Info', 'Formula', 'Numerator', 'Denominator', 'Test KPI', 'Review'];

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

/**
 * Dark-themed formula editor — same visual language as the read-only
 * "Calculation Formula" preview block. Renders a free-form expression
 * (e.g. `m55125c09514 + m55125c09515` or simply `1`).
 */
const FormulaEditor: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}> = ({ label, value, onChange, placeholder, hint }) => {
  // Highlight tokens that look like counter names (alphanumeric identifiers)
  const tokens = value.split(/(\W+)/);
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
        <span>{label}</span>
        <span className="text-[9px] normal-case tracking-normal text-muted-foreground/70">free expression</span>
      </label>
      <div className="mt-1 rounded-xl bg-slate-900 border border-slate-700/60 shadow-inner overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-slate-700/60 bg-slate-900/80">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400/70"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70"></span>
          <span className="ml-2 text-[10px] font-mono text-slate-400">formula.expr</span>
        </div>
        <div className="relative">
          <pre aria-hidden className="absolute inset-0 px-4 py-3 m-0 font-mono text-[13px] leading-6 text-slate-200 whitespace-pre-wrap break-words pointer-events-none overflow-auto">
            {tokens.length === 0 || value.trim() === '' ? (
              <span className="text-slate-500">{placeholder}</span>
            ) : (
              tokens.map((tok, i) => {
                if (/^\s+$/.test(tok)) return tok;
                if (/^[+\-*/()]+$/.test(tok)) return <span key={i} className="text-amber-300">{tok}</span>;
                if (/^\d+(\.\d+)?$/.test(tok)) return <span key={i} className="text-sky-300">{tok}</span>;
                if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(tok)) return <span key={i} className="text-emerald-300">{tok}</span>;
                return tok;
              })
            )}
            {/* trailing newline so caret line aligns */}
            {'\n'}
          </pre>
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            spellCheck={false}
            className="relative w-full min-h-[112px] px-4 py-3 bg-transparent font-mono text-[13px] leading-6 text-transparent caret-emerald-300 placeholder:text-slate-500/0 focus:outline-none resize-y"
          />
        </div>
      </div>
      {hint && <p className="mt-1.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
};

const KpiCreateWizard: React.FC<KpiCreateWizardProps> = ({ onSubmit, onClose, initialData, mode = 'create' }) => {
  const isEdit = mode === 'edit';
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Advanced FX mode — toggle dans le header. State complet du JSON
  // editor délégué à <KpiFxAdvancedMode> pour ne pas re-render le
  // wizard à chaque keystroke (cf. KpiFxAdvancedMode.tsx).
  const [editorMode, setEditorMode] = useState<'simple' | 'advanced'>('simple');

  // Step 1 — General
  const [code, setCode] = useState(initialData?.kpi_code || '');
  const [name, setName] = useState(initialData?.display_name || '');
  const [desc, setDesc] = useState(initialData?.description || '');
  const [tech, setTech] = useState<string>(initialData?.technology || 'LTE');
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

  // Test KPI
  const [testRunning, setTestRunning] = useState(false);
  const [testResults, setTestResults] = useState<any[]>([]);
  const [testError, setTestError] = useState('');
  const [testDateFrom, setTestDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [testDateTo, setTestDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const runTest = async () => {
    if (!numCounters.trim()) { setTestError('No numerator counters defined'); return; }
    setTestRunning(true);
    setTestError('');
    setTestResults([]);
    try {
      // The user now writes the expression directly in the formula editor.
      // Accept either a free expression (e.g. `m551 + m552`) or a legacy
      // comma-separated counter list — auto-detect by looking for operators.
      const isExpr = /[+\-*/()]/.test(numCounters);
      const numExpr = isExpr
        ? numCounters.trim()
        : numCounters.split(',').map(c => '`' + c.trim() + '`').filter(Boolean).join('+');
      const denTrim = denCounters.trim();
      const denExpr = !denTrim
        ? '1'
        : /[+\-*/()]/.test(denTrim)
          ? denTrim
          : denTrim.split(',').map(c => '`' + c.trim() + '`').filter(Boolean).join('+');
      const res = await fetch(getApiUrl('pm/kpi/compute'), {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          kpi_code: code || '_test_kpi_',
          date_from: testDateFrom,
          date_to: testDateTo,
          granularity: '1d',
          vendor: vendor !== 'ALL' ? vendor : undefined,
          _inline_numerator: numExpr,
          _inline_denominator: denExpr,
          _inline_formula_type: formulaType,
        }),
      });
      if (!res.ok) { setTestError(`HTTP ${res.status}`); return; }
      const data = await res.json();
      if (data.error && (!data.series || data.series.length === 0)) {
        setTestError(data.error);
      } else {
        setTestResults(data.series || []);
      }
    } catch (err: any) {
      setTestError(err.message || 'Test failed');
    } finally {
      setTestRunning(false);
    }
  };


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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4 rounded-2xl bg-card border border-border shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-base font-bold text-foreground">{isEdit ? 'Edit KPI' : 'Create New KPI'}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {editorMode === 'advanced'
                ? 'Advanced (FX) — declarative JSON formula'
                : `Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Mode toggle — only visible on create (not edit) */}
            {!isEdit && (
              <div className="flex items-center gap-0 rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setEditorMode('simple')}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    editorMode === 'simple' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'
                  }`}
                  title="6-step guided wizard"
                >Simple</button>
                <button
                  onClick={() => setEditorMode('advanced')}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1 ${
                    editorMode === 'advanced' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'
                  }`}
                  title="JSON formula_fx — Busy Hour, Rolling, Spatial, …"
                ><Code2 className="w-3 h-3" /> Advanced (FX)</button>
              </div>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Step Indicator (simple mode only) */}
        {editorMode === 'simple' && (
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
        )}

        {/* Content — Advanced FX mode (state owned by KpiFxAdvancedMode) */}
        {editorMode === 'advanced' && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <InputField label="KPI Code" value={code} onChange={setCode} placeholder="FX_BUSY_HOUR_DROP_RATE_4G" required mono />
              <InputField label="Display Name" value={name} onChange={setName} placeholder="Busy Hour Drop Rate 4G" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <SelectField label="Vendor" value={vendor} onChange={setVendor} options={['ALL', 'Nokia', 'Ericsson', 'Huawei', 'Samsung']} />
              <SelectField label="Technology" value={tech} onChange={setTech} options={['ALL', 'LTE', 'NR']} />
              <SelectField label="Category" value={category} onChange={setCategory} options={['Accessibility', 'Retainability', 'Throughput', 'Traffic', 'Mobility', 'Radio Quality', 'VoLTE', 'Latency', 'Integrity', 'Other']} />
            </div>
            <KpiFxAdvancedMode
              getMeta={() => ({
                kpi_code: code, nom_ihm: name, famille: category, unites: unit,
                vendor, techno: tech,
              })}
              onCreated={() => { /* operator can close manually after seeing result panel */ }}
            />
          </div>
        )}

        {/* Content — Simple 6-step wizard */}
        {editorMode === 'simple' && (
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
              <FormulaEditor
                label="Numerator Expression"
                value={numCounters}
                onChange={setNumCounters}
                placeholder="m55125c09514 + m55125c09515"
                hint="Write the expression freely. Counter names supported. Example: m55125c09514 + m55125c09515"
              />
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
              <FormulaEditor
                label="Denominator Expression"
                value={denCounters}
                onChange={setDenCounters}
                placeholder="m55125c09520  (or simply: 1)"
                hint="Use '1' for raw sum/counter formulas. Example: m55125c09520 + m55125c09521"
              />
              <div className="grid grid-cols-2 gap-4">
                <SelectField label="Source" value={denSource} onChange={setDenSource} options={['OSS PM', 'OSS CM', 'NMS', 'Probes', 'External']} />
                <SelectField label="Granularity" value={denGran} onChange={setDenGran} options={['15min', '1hour', 'daily', 'weekly']} />
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-bold text-foreground">Test Formula</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Run a quick test to verify your KPI formula returns data. Uses <strong className="text-foreground">ClickHouse PM data</strong>.
                </p>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">From</label>
                    <input type="date" value={testDateFrom} onChange={e => setTestDateFrom(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-background text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">To</label>
                    <input type="date" value={testDateTo} onChange={e => setTestDateTo(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-background text-sm" />
                  </div>
                  <div className="flex items-end">
                    <button onClick={runTest} disabled={testRunning || !numCounters.trim()}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-opacity">
                      {testRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      {testRunning ? 'Testing…' : 'Run Test'}
                    </button>
                  </div>
                </div>
                <div className="space-y-2 mt-2">
                  <div className="rounded-lg bg-slate-900 border border-slate-700/60 px-3 py-2 font-mono text-[11px] leading-5 text-slate-200">
                    <span className="text-amber-300 mr-2">NUM</span>
                    <span className="text-emerald-300 break-words">{numCounters || '(empty)'}</span>
                  </div>
                  <div className="rounded-lg bg-slate-900 border border-slate-700/60 px-3 py-2 font-mono text-[11px] leading-5 text-slate-200">
                    <span className="text-amber-300 mr-2">DEN</span>
                    <span className="text-emerald-300 break-words">{denCounters || '1'}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">Formula type: <span className="font-mono font-bold text-foreground">{formulaType}</span></div>
                </div>
              </div>
              {testError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/8 p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{testError}</p>
                </div>
              )}
              {testResults.length > 0 && (
                <div>
                  {(() => {
                    const vals = testResults
                      .map((r: any) => Number(r.kpi_value))
                      .filter((v: number) => Number.isFinite(v));
                    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                    const min = vals.length ? Math.min(...vals) : 0;
                    const max = vals.length ? Math.max(...vals) : 0;
                    return (
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">Points</p>
                          <p className="text-base font-black font-mono text-emerald-700">{testResults.length}</p>
                        </div>
                        <div className="rounded-lg bg-primary/10 border border-primary/30 px-3 py-2">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-primary">Average</p>
                          <p className="text-base font-black font-mono text-primary">{avg.toFixed(3)}{unit}</p>
                        </div>
                        <div className="rounded-lg bg-sky-500/10 border border-sky-500/30 px-3 py-2">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-sky-700">Min</p>
                          <p className="text-base font-black font-mono text-sky-700">{min.toFixed(3)}</p>
                        </div>
                        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-amber-700">Max</p>
                          <p className="text-base font-black font-mono text-amber-700">{max.toFixed(3)}</p>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-foreground">{testResults.length} data points returned</span>
                    <span className="text-[10px] text-emerald-600 font-bold">✓ Formula works</span>
                  </div>
                  <div className="rounded-xl border border-border overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead className="bg-muted/40 sticky top-0">
                        <tr>
                          <th className="py-1.5 px-2 text-left font-semibold text-muted-foreground">Timestamp</th>
                          <th className="py-1.5 px-2 text-left font-semibold text-muted-foreground">Site</th>
                          <th className="py-1.5 px-2 text-right font-semibold text-muted-foreground">Value</th>
                          <th className="py-1.5 px-2 text-left font-semibold text-muted-foreground">Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {testResults.slice(0, 20).map((r, i) => (
                          <tr key={i} className="border-t border-border/30">
                            <td className="py-1 px-2 text-muted-foreground">{r.ts || '—'}</td>
                            <td className="py-1 px-2 text-foreground">{r.site_name || r.cell_name || '—'}</td>
                            <td className="py-1 px-2 text-right font-mono font-semibold text-foreground">{typeof r.kpi_value === 'number' ? r.kpi_value.toFixed(4) : r.kpi_value ?? '—'}</td>
                            <td className="py-1 px-2 text-muted-foreground">{unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {testResults.length > 20 && (
                    <p className="text-[10px] text-muted-foreground mt-1">Showing first 20 of {testResults.length} results</p>
                  )}
                </div>
              )}
              {!testRunning && testResults.length === 0 && !testError && (
                <p className="text-xs text-muted-foreground text-center py-4">Click "Run Test" to verify the formula returns data.</p>
              )}
            </>
          )}

          {step === 5 && (
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
        )}

        {/* Footer — simple mode keeps wizard nav, advanced uses inline Create button */}
        {editorMode === 'simple' && (
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
        )}
      </div>
    </div>
  );
};

export default KpiCreateWizard;
