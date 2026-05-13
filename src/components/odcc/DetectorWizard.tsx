import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Gauge,
  Info,
  Layers,
  Mail,
  Play,
  Plus,
  Radar,
  Save,
  Search,
  ShieldCheck,
  Sliders,
  Tag,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchDetectorDimensionValues,
  fetchDetectorDimensions,
  fetchDetectorHolidays,
  fetchDetectorKpis,
  fetchKpiTables,
  fetchScopeCounts,
} from './detectorBuilderApi';
import type { KpiTableOption, ScopeCounts } from './detectorBuilderApi';
import type { DimensionOption, KpiOption, ScopeFilter } from './detectorBuilderTypes';

// ---------- Types kept loose to plug into existing OdccDetectorConsole draft ----------
type DraftLike = {
  name: string;
  description: string;
  enabled: boolean;
  scopeFilters: ScopeFilter[];
  criteriaConfig: {
    logic: 'AND' | 'OR';
    conditions: Array<{
      id: string;
      type: 'kpi' | 'dimension';
      field: string;
      aggregation?: 'avg' | 'min' | 'max' | 'sum' | 'count';
      operator: '<' | '<=' | '>' | '>=' | '=' | '!=' | 'exists';
      value: string;
      unit?: string;
    }>;
  };
  timeConfig: {
    range: '24h' | 'custom';
    customStart: string | null;
    customEnd: string | null;
    excludeTimeSlots: boolean;
    excludedSlots: Array<{ id: string; start: string; end: string }>;
    excludeWeekends: boolean;
    excludeHolidays: boolean;
  };
  output: { storeResults: boolean; allowExport: boolean; allowParameterApply: boolean; parameterSetId: string | null };
  scheduleFrequency: '15m' | '30m' | '1h' | 'daily';
} & Record<string, any>;

interface Props {
  draft: DraftLike;
  setDraft: (d: any) => void;
  editing: boolean;
  onSaveDraft: () => void;
  onSaveEnable: () => void;
  onRunTest: () => void;
  onValidate: () => void;
}

const STEPS = [
  { id: 'info', label: 'Information', icon: Info },
  { id: 'population', label: 'Population', icon: Filter },
  { id: 'type', label: 'Detector Type', icon: Layers },
  { id: 'conditions', label: 'Conditions', icon: Sliders },
  { id: 'occurrence', label: 'Occurrence', icon: Activity },
  { id: 'time', label: 'Time Exclusions', icon: Clock },
  { id: 'output', label: 'Output', icon: Bell },
  { id: 'validate', label: 'Validation', icon: ShieldCheck },
] as const;

type StepId = typeof STEPS[number]['id'];

const SEVERITY = ['warning', 'minor', 'major', 'critical'] as const;
type Severity = typeof SEVERITY[number];

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;

export default function DetectorWizard({ draft, setDraft, editing, onSaveDraft, onSaveEnable, onRunTest, onValidate }: Props) {
  const [step, setStep] = useState<StepId>('info');
  const [kpis, setKpis] = useState<KpiOption[]>([]);
  const [kpisLoading, setKpisLoading] = useState(false);
  const [kpiTables, setKpiTables] = useState<KpiTableOption[]>([]);
  // kpiTableId rides on draft so it persists across save; default = 15m (id=1).
  const kpiTableId: number = Number(draft.kpiTableId ?? 1) || 1;
  const selectedTable = useMemo(
    () => kpiTables.find(t => t.id === kpiTableId),
    [kpiTables, kpiTableId],
  );
  const [dimensions, setDimensions] = useState<DimensionOption[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Local-only fields not persisted in the existing Detector type
  const [detectorKind, setDetectorKind] = useState<'PM' | 'FM'>('PM');
  const [defaultSeverity, setDefaultSeverity] = useState<Severity>('major');
  const [tags, setTags] = useState<string[]>([]);
  const [owner, setOwner] = useState<string>('');
  const [occurrenceCount, setOccurrenceCount] = useState<number>(1);
  const [occurrenceWindow, setOccurrenceWindow] = useState<'1h' | '24h' | '7d'>('24h');
  const [consecutive, setConsecutive] = useState(false);
  const [channels, setChannels] = useState<{ email: boolean; teams: boolean; slack: boolean; webhook: boolean }>({ email: false, teams: false, slack: false, webhook: false });

  const patch = (p: Partial<DraftLike>) => setDraft({ ...draft, ...p, updatedAt: new Date().toISOString() });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      fetchKpiTables(),
      fetchDetectorDimensions(),
      fetchDetectorHolidays(),
    ]).then(results => {
      if (cancelled) return;
      const [t, d, h] = results;
      if (t.status === 'fulfilled') setKpiTables(t.value);
      if (d.status === 'fulfilled') setDimensions(d.value);
      if (h.status === 'fulfilled') setHolidays(h.value);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Reload KPIs whenever the selected table changes. The picker drives the
  // KPI list — anything that isn't precomputed in the chosen table is out.
  useEffect(() => {
    let cancelled = false;
    const table = kpiTables.find(t => t.id === kpiTableId)?.table_name;
    if (!table) return;
    setKpisLoading(true);
    fetchDetectorKpis(table)
      .then(list => { if (!cancelled) setKpis(list); })
      .finally(() => { if (!cancelled) setKpisLoading(false); });
    return () => { cancelled = true; };
  }, [kpiTableId, kpiTables]);

  const stepIndex = STEPS.findIndex(s => s.id === step);
  const goNext = () => { if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1].id); };
  const goPrev = () => { if (stepIndex > 0) setStep(STEPS[stepIndex - 1].id); };

  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!draft.name.trim()) errors.push('Detector name is required.');
    if (!draft.scopeFilters.length || draft.scopeFilters.every(f => !f.values.length)) errors.push('Add at least one population filter with values.');
    if (!draft.criteriaConfig.conditions.length) errors.push('Add at least one condition.');
    draft.criteriaConfig.conditions.forEach((c, i) => {
      if (!c.field) errors.push(`Condition ${i + 1}: select a ${detectorKind === 'PM' ? 'KPI' : 'event'}.`);
      if (c.operator !== 'exists' && c.value === '') errors.push(`Condition ${i + 1}: threshold required.`);
    });
    return { valid: errors.length === 0, errors };
  }, [draft, detectorKind]);

  // Build a clean preview payload matching the spec
  const previewPayload = useMemo(() => ({
    name: draft.name,
    type: detectorKind,
    severity: defaultSeverity,
    tags,
    owner,
    scope: { filters: draft.scopeFilters.map(f => ({ dimension: f.dimension, values: f.values })) },
    conditions: draft.criteriaConfig.conditions.map(c => ({
      kpi: c.field,
      operator: c.operator,
      value: Number.isFinite(Number(c.value)) ? Number(c.value) : c.value,
    })),
    occurrence: {
      frequency: draft.scheduleFrequency,
      count: occurrenceCount,
      window: occurrenceWindow,
      consecutive,
    },
    timeExclusions: {
      excludeWeekends: draft.timeConfig.excludeWeekends,
      excludeHolidays: draft.timeConfig.excludeHolidays,
      excludedSlots: draft.timeConfig.excludedSlots.map(s => ({ start: s.start, end: s.end })),
    },
    notifications: Object.entries(channels).filter(([, v]) => v).map(([k]) => k),
  }), [draft, detectorKind, defaultSeverity, tags, owner, occurrenceCount, occurrenceWindow, consecutive, channels]);

  return (
    <div className="font-sans text-slate-900" style={{ fontFamily: 'Inter, system-ui, sans-serif', WebkitFontSmoothing: 'antialiased' as any }}>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium text-slate-500">ODCC · Detectors / {editing ? 'Edit' : 'Create'}</p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-slate-900">{draft.name || 'Untitled detector'}</h1>
        </div>
        <div className="flex items-center gap-2">
          <SoftButton onClick={onSaveDraft} icon={<Save className="h-3.5 w-3.5" />}>Save draft</SoftButton>
          <SoftButton onClick={onRunTest} icon={<Play className="h-3.5 w-3.5" />}>Run test</SoftButton>
          <PrimaryButton onClick={onSaveEnable} icon={<ShieldCheck className="h-3.5 w-3.5" />} disabled={!validation.valid}>Save & enable</PrimaryButton>
        </div>
      </div>

      {/* Stepper */}
      <div className="mb-6 rounded-xl border border-slate-200/70 bg-white p-2 shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = s.id === step;
            const done = i < stepIndex;
            return (
              <button
                key={s.id}
                onClick={() => setStep(s.id)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition',
                  active ? 'bg-teal-50 text-teal-700' : done ? 'text-slate-700 hover:bg-slate-50' : 'text-slate-500 hover:bg-slate-50'
                )}
              >
                <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold',
                  active ? 'bg-teal-600 text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        {/* Main content */}
        <div className="rounded-xl border border-slate-200/70 bg-white p-6 shadow-sm">
          {step === 'info' && (
            <Section title="Detector Information" subtitle="Identify your detector for the team.">
              <div className="grid gap-4 md:grid-cols-2">
                <Input label="Detector name" value={draft.name} onChange={v => patch({ name: v })} placeholder="4G Nantes Availability Detector" />
                <Input label="Owner / team" value={owner} onChange={setOwner} placeholder="NOC France" />
              </div>
              <Textarea label="Description" value={draft.description} onChange={v => patch({ description: v })} placeholder="What does this detector watch?" />
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Default severity</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {SEVERITY.map(s => (
                      <button key={s} onClick={() => setDefaultSeverity(s)}
                        className={cn('rounded-full px-3 py-1.5 text-[12px] font-medium capitalize transition',
                          defaultSeverity === s ? severityActiveClass(s) : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Tags</Label>
                  <TagInput tags={tags} onChange={setTags} />
                </div>
              </div>
              <ToggleRow checked={draft.enabled} onChange={v => patch({ enabled: v })} label="Enabled" hint="Detector will start running once saved." />
            </Section>
          )}

          {step === 'population' && (
            <Section title="Detection Zone" subtitle="Pick the detection level, then narrow the population with one or more filters.">
              <DetectionLevelPicker
                value={(draft as any).scopeLevel || 'CELL'}
                onChange={(v) => patch({ scopeLevel: v } as any)}
              />
              <PopulationBuilder
                dimensions={dimensions}
                loading={loading}
                filters={draft.scopeFilters}
                onChange={f => patch({ scopeFilters: f })}
              />
            </Section>
          )}

          {step === 'type' && (
            <Section title="Detector Type" subtitle="Choose what this detector watches.">
              <div className="grid gap-4 md:grid-cols-2">
                <TypeCard
                  active={detectorKind === 'PM'}
                  onClick={() => setDetectorKind('PM')}
                  icon={<Gauge className="h-5 w-5" />}
                  title="PM Detector"
                  subtitle="Performance KPI degradation"
                  desc="Watch a KPI threshold (availability, drop rate, throughput…)"
                />
                <TypeCard
                  active={detectorKind === 'FM'}
                  onClick={() => setDetectorKind('FM')}
                  icon={<AlertTriangle className="h-5 w-5" />}
                  title="FM Detector"
                  subtitle="Fault / alarm occurrence"
                  desc="Trigger on alarm types, severities and occurrence counts."
                />
              </div>
            </Section>
          )}

          {step === 'conditions' && (
            <Section title={detectorKind === 'PM' ? 'KPI Conditions' : 'Alarm Conditions'} subtitle="Pick the KPI table (granularity), then add one or more threshold conditions.">
              {detectorKind === 'PM' && (
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/40 p-3">
                  <Label>KPI table (granularity)</Label>
                  <div className="mt-2 inline-flex flex-wrap gap-1.5">
                    {kpiTables.length === 0 ? (
                      <span className="text-[12px] text-slate-400">Loading tables…</span>
                    ) : kpiTables.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => patch({ kpiTableId: t.id })}
                        className={cn(
                          'rounded-md border px-3 py-1.5 text-[12px] font-medium transition',
                          t.id === kpiTableId
                            ? 'border-teal-500 bg-teal-50 text-teal-700'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50/40',
                        )}
                      >
                        {t.label}
                        <span className="ml-1.5 font-mono text-[10px] text-slate-400">{t.table_name}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {kpisLoading
                      ? 'Loading KPIs for this table…'
                      : selectedTable
                        ? `${kpis.length} KPI${kpis.length === 1 ? '' : 's'} precomputed in ${selectedTable.table_name}.`
                        : 'Pick a table to see available KPIs.'}
                  </p>
                </div>
              )}
              <ConditionsBuilder
                kind={detectorKind}
                kpis={kpis}
                config={draft.criteriaConfig}
                onChange={c => patch({ criteriaConfig: c })}
              />
            </Section>
          )}

          {step === 'occurrence' && (
            <Section title="Occurrence Rules" subtitle="When does an anomaly become a valid detection?">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Frequency</Label>
                  <SegmentedSelect
                    value={draft.scheduleFrequency}
                    options={[
                      { value: '15m', label: 'Realtime / 15m' },
                      { value: '30m', label: '30m' },
                      { value: '1h', label: 'Hourly' },
                      { value: 'daily', label: 'Daily' },
                    ]}
                    onChange={v => patch({ scheduleFrequency: v as any })}
                  />
                </div>
                <div>
                  <Label>Time window</Label>
                  <SegmentedSelect
                    value={occurrenceWindow}
                    options={[{ value: '1h', label: '1h' }, { value: '24h', label: '24h' }, { value: '7d', label: '7 days' }]}
                    onChange={v => setOccurrenceWindow(v as any)}
                  />
                </div>
                <div>
                  <Label>Occurrence count</Label>
                  <input type="number" min={1} value={occurrenceCount} onChange={e => setOccurrenceCount(Math.max(1, Number(e.target.value)))} className={inputClass} />
                </div>
                <div className="flex items-end">
                  <ToggleRow checked={consecutive} onChange={setConsecutive} label="Consecutive degradations" hint="Require triggers to happen back-to-back" />
                </div>
              </div>
              <div className="rounded-lg border border-teal-100 bg-teal-50/60 px-4 py-3 text-[13px] text-teal-800">
                Trigger if anomaly occurs <b>{occurrenceCount}</b>{consecutive ? ' consecutive' : ''} time{occurrenceCount > 1 ? 's' : ''} during <b>{occurrenceWindow}</b>.
              </div>
            </Section>
          )}

          {step === 'time' && (
            <Section title="Time Exclusions" subtitle="Periods where detection should not run.">
              <div className="grid gap-3 md:grid-cols-2">
                <ToggleRow checked={draft.timeConfig.excludeWeekends} onChange={v => patch({ timeConfig: { ...draft.timeConfig, excludeWeekends: v } })} label="Exclude weekends" />
                <ToggleRow checked={draft.timeConfig.excludeHolidays} onChange={v => patch({ timeConfig: { ...draft.timeConfig, excludeHolidays: v } })} label="Exclude holidays" hint={loading ? 'Loading…' : `${holidays.length} holidays loaded`} />
                <ToggleRow checked={draft.timeConfig.excludeTimeSlots} onChange={v => patch({ timeConfig: { ...draft.timeConfig, excludeTimeSlots: v } })} label="Exclude time slots" />
              </div>
              {draft.timeConfig.excludeTimeSlots && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[12px] font-medium text-slate-600">Excluded time ranges</span>
                    <button onClick={() => patch({ timeConfig: { ...draft.timeConfig, excludedSlots: [...draft.timeConfig.excludedSlots, { id: uid('slot'), start: '00:00', end: '06:00' }] } })}
                      className="inline-flex items-center gap-1 rounded-md bg-teal-600 px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-teal-700">
                      <Plus className="h-3.5 w-3.5" /> Add range
                    </button>
                  </div>
                  <div className="space-y-2">
                    {draft.timeConfig.excludedSlots.map(slot => (
                      <div key={slot.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <input type="time" value={slot.start} onChange={e => patch({ timeConfig: { ...draft.timeConfig, excludedSlots: draft.timeConfig.excludedSlots.map(s => s.id === slot.id ? { ...s, start: e.target.value } : s) } })} className={inputClass} />
                        <input type="time" value={slot.end} onChange={e => patch({ timeConfig: { ...draft.timeConfig, excludedSlots: draft.timeConfig.excludedSlots.map(s => s.id === slot.id ? { ...s, end: e.target.value } : s) } })} className={inputClass} />
                        <button onClick={() => patch({ timeConfig: { ...draft.timeConfig, excludedSlots: draft.timeConfig.excludedSlots.filter(s => s.id !== slot.id) } })} className="rounded-md border border-slate-200 p-2 text-slate-500 hover:border-red-200 hover:text-red-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {!draft.timeConfig.excludedSlots.length && <p className="text-[12px] text-slate-400">No excluded slot yet.</p>}
                  </div>
                </div>
              )}
            </Section>
          )}

          {step === 'output' && (
            <Section title="Output & Alerting" subtitle="Where do detections go and how are they delivered?">
              <div className="grid gap-3 md:grid-cols-2">
                <ToggleRow checked={draft.output.storeResults} onChange={v => patch({ output: { ...draft.output, storeResults: v } })} label="Store detection results" />
                <ToggleRow checked={draft.output.allowExport} onChange={v => patch({ output: { ...draft.output, allowExport: v } })} label="Allow export" />
                <ToggleRow checked={draft.output.allowParameterApply} onChange={v => patch({ output: { ...draft.output, allowParameterApply: v } })} label="Create alert automatically" />
              </div>
              <div>
                <Label>Notification channels</Label>
                <div className="mt-2 grid gap-2 md:grid-cols-4">
                  <ChannelChip active={channels.email} onClick={() => setChannels({ ...channels, email: !channels.email })} icon={<Mail className="h-3.5 w-3.5" />} label="Email" />
                  <ChannelChip active={channels.teams} onClick={() => setChannels({ ...channels, teams: !channels.teams })} icon={<Bell className="h-3.5 w-3.5" />} label="Teams" />
                  <ChannelChip active={channels.slack} onClick={() => setChannels({ ...channels, slack: !channels.slack })} icon={<Bell className="h-3.5 w-3.5" />} label="Slack" />
                  <ChannelChip active={channels.webhook} onClick={() => setChannels({ ...channels, webhook: !channels.webhook })} icon={<Webhook className="h-3.5 w-3.5" />} label="Webhook" />
                </div>
              </div>
            </Section>
          )}

          {step === 'validate' && (
            <Section title="Validation & Test" subtitle="Review the detector and run it against a sample.">
              {validation.valid ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
                  <Check className="mr-2 inline h-4 w-4" /> Detector configuration is valid.
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
                  <AlertTriangle className="mr-2 inline h-4 w-4" />
                  <ul className="ml-6 list-disc">
                    {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <SoftButton onClick={onValidate} icon={<ShieldCheck className="h-3.5 w-3.5" />}>Validate detector</SoftButton>
                <SoftButton onClick={onRunTest} icon={<Play className="h-3.5 w-3.5" />}>Run test</SoftButton>
                <SoftButton onClick={onSaveDraft} icon={<Save className="h-3.5 w-3.5" />}>Save draft</SoftButton>
                <PrimaryButton onClick={onSaveEnable} icon={<ShieldCheck className="h-3.5 w-3.5" />} disabled={!validation.valid}>Save & enable</PrimaryButton>
              </div>
              <div>
                <Label>Configuration preview</Label>
                <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-700">
{JSON.stringify(previewPayload, null, 2)}
                </pre>
              </div>
            </Section>
          )}

          {/* Footer nav */}
          <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-4">
            <button onClick={goPrev} disabled={stepIndex === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </button>
            <span className="text-[12px] text-slate-500">Step {stepIndex + 1} of {STEPS.length}</span>
            <button onClick={goNext} disabled={stepIndex === STEPS.length - 1}
              className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40">
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Right summary */}
        <aside className="space-y-4">
          <SummaryCard title="Summary">
            <SumRow label="Type" value={<Badge tone={detectorKind === 'PM' ? 'teal' : 'amber'}>{detectorKind}</Badge>} />
            <SumRow label="Severity" value={<Badge tone={severityToTone(defaultSeverity)}>{defaultSeverity}</Badge>} />
            <SumRow label="Filters" value={`${draft.scopeFilters.length} dimension${draft.scopeFilters.length === 1 ? '' : 's'}`} />
            <SumRow label="Conditions" value={`${draft.criteriaConfig.conditions.length}`} />
            <SumRow label="Frequency" value={draft.scheduleFrequency} />
            <SumRow label="Window" value={`${occurrenceCount}× / ${occurrenceWindow}`} />
            <SumRow label="Notifications" value={Object.values(channels).filter(Boolean).length || '—'} />
          </SummaryCard>
          <SummaryCard title="Tips">
            <p className="text-[12px] leading-relaxed text-slate-600">
              Build narrow populations first (e.g. <em>Plaque = NANTES, Techno = 4G</em>), then attach simple conditions like <em>availability &lt; 98</em>.
            </p>
          </SummaryCard>
        </aside>
      </div>
    </div>
  );
}

// ============== Sub-components ==============

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[16px] font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/** Detection-level picker — at what NE granularity does the detector emit
 *  a finding? The CH KPI tables are computed per CELL, so SECTOR/SITE/PLAQUE/
 *  DOR aggregate cells up. Stored on draft.scopeLevel and shipped to the
 *  backend in extra_config.scope_level (already wired in detectorBuilderApi). */
const DETECTION_LEVELS: Array<{
  key: 'PLAQUE' | 'DOR' | 'SITE' | 'SECTOR' | 'CELL';
  label: string;
  hint:  string;
}> = [
  { key: 'PLAQUE', label: 'Plaque', hint: 'Aggregate per plaque (broadest)' },
  { key: 'DOR',    label: 'DOR',    hint: 'Aggregate per DOR / UPR'        },
  { key: 'SITE',   label: 'Site',   hint: 'Aggregate per site'             },
  { key: 'SECTOR', label: 'Sector', hint: 'Aggregate per sector'           },
  { key: 'CELL',   label: 'Cell',   hint: 'One finding per cell (finest)'  },
];

function DetectionLevelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: 'PLAQUE' | 'DOR' | 'SITE' | 'SECTOR' | 'CELL') => void;
}) {
  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-700">Detection level</p>
          <p className="mt-0.5 text-[12px] text-slate-500">In which NE level should anomalies be reported?</p>
        </div>
        <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-medium text-teal-700 ring-1 ring-inset ring-teal-100">
          {value || 'CELL'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {DETECTION_LEVELS.map((lvl) => {
          const active = (value || 'CELL') === lvl.key;
          return (
            <button
              key={lvl.key}
              type="button"
              onClick={() => onChange(lvl.key)}
              className={cn(
                'group flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition shadow-sm',
                active
                  ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-500/15'
                  : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/40',
              )}
            >
              <span className={cn(
                'text-[12px] font-semibold',
                active ? 'text-teal-700' : 'text-slate-700',
              )}>
                {lvl.label}
              </span>
              <span className={cn(
                'mt-0.5 text-[11px] leading-tight',
                active ? 'text-teal-600/80' : 'text-slate-400',
              )}>
                {lvl.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PopulationBuilder({ dimensions, loading, filters, onChange }: {
  dimensions: DimensionOption[];
  loading: boolean;
  filters: ScopeFilter[];
  onChange: (f: ScopeFilter[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [valuesCache, setValuesCache] = useState<Record<string, string[]>>({});
  const [valuesLoading, setValuesLoading] = useState<string | null>(null);
  const [counts, setCounts] = useState<ScopeCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(false);
  const used = new Set(filters.map(f => f.dimension));
  const available = dimensions.filter(d => !used.has(d.key));

  // Live scope-count badge: re-query whenever the filter set changes, with
  // a 300ms debounce so we don't hammer the backend while the user is
  // still picking pills. Empty set → skip (no "full network" preview).
  const filtersKey = useMemo(
    () => JSON.stringify(filters.map(f => ({ d: f.dimension, v: [...f.values].sort() }))),
    [filters],
  );
  useEffect(() => {
    const parsed = JSON.parse(filtersKey) as Array<{ d: string; v: string[] }>;
    const nonEmpty = parsed.filter(f => f.v.length > 0);
    if (nonEmpty.length === 0) {
      setCounts(null);
      setCountsLoading(false);
      return;
    }
    setCountsLoading(true);
    const handle = window.setTimeout(() => {
      fetchScopeCounts(parsed.map(f => ({ dimension: f.d, values: f.v })))
        .then(c => setCounts(c))
        .finally(() => setCountsLoading(false));
    }, 300);
    return () => { window.clearTimeout(handle); setCountsLoading(false); };
  }, [filtersKey]);

  const ensureValuesLoaded = (key: string) => {
    if (valuesCache[key] || valuesLoading === key) return;
    setValuesLoading(key);
    fetchDetectorDimensionValues(key)
      .then(v => setValuesCache(p => ({ ...p, [key]: v })))
      .finally(() => setValuesLoading(null));
  };

  const addDimension = (key: string) => {
    onChange([...filters, { dimension: key, values: [] }]);
    setAdding(false);
    ensureValuesLoaded(key);
  };
  const updateValues = (dim: string, values: string[]) => onChange(filters.map(f => f.dimension === dim ? { ...f, values } : f));
  const removeFilter = (dim: string) => onChange(filters.filter(f => f.dimension !== dim));

  return (
    <div className="space-y-3">
      {/* Live scope-count badge — appears as soon as any filter has values */}
      {(counts || countsLoading) && (
        <div className="flex items-center justify-between rounded-xl border border-teal-100 bg-gradient-to-r from-teal-50/80 to-white px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white text-teal-600 shadow-sm ring-1 ring-teal-100">
              <Filter className="h-3.5 w-3.5" />
            </span>
            <div className="leading-tight">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">Scope preview</p>
              {countsLoading ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-slate-500">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" />
                  Counting matching sites & cells…
                </p>
              ) : counts ? (
                <p className="mt-0.5 text-[13px] text-slate-700">
                  <span className="font-semibold text-slate-900">{counts.sites.toLocaleString()}</span> site{counts.sites === 1 ? '' : 's'}
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="font-semibold text-slate-900">{counts.cells.toLocaleString()}</span> cell{counts.cells === 1 ? '' : 's'}
                  <span className="ml-2 text-[11px] text-slate-400">in scope</span>
                </p>
              ) : null}
            </div>
          </div>
          {counts && counts.cells === 0 && (
            <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-100">
              Empty population
            </span>
          )}
        </div>
      )}

      {filters.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-10 text-center">
          <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-teal-50 text-teal-600">
            <Filter className="h-4 w-4" />
          </div>
          <p className="text-[13px] font-semibold text-slate-700">No filter yet</p>
          <p className="mt-1 text-[12px] text-slate-500">Add at least one dimension to define the population.</p>
        </div>
      )}

      {filters.map(filter => {
        const dim = dimensions.find(d => d.key === filter.dimension);
        const values = valuesCache[filter.dimension] || [];
        const isLoading = valuesLoading === filter.dimension;
        return (
          <div
            key={filter.dimension}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                  <Tag className="h-3.5 w-3.5" />
                </span>
                <div className="leading-tight">
                  <p className="text-[13px] font-semibold text-slate-800">{dim?.label || filter.dimension}</p>
                  <p className="text-[11px] text-slate-400">
                    {filter.values.length === 0
                      ? 'Any value'
                      : `${filter.values.length} value${filter.values.length === 1 ? '' : 's'} selected`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeFilter(filter.dimension)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                aria-label="Remove filter"
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </button>
            </div>
            <MultiSelectCombobox
              options={values}
              loading={isLoading}
              selected={filter.values}
              placeholder={`Search ${dim?.label?.toLowerCase() || filter.dimension.toLowerCase()}…`}
              onChange={vals => updateValues(filter.dimension, vals)}
              onLoadOptions={() => ensureValuesLoaded(filter.dimension)}
            />
          </div>
        );
      })}

      {adding ? (
        <div className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm">
          <Label>Pick a dimension</Label>
          <div className="mt-3 flex flex-wrap gap-2">
            {available.map(d => (
              <button
                key={d.key}
                type="button"
                onClick={() => addDimension(d.key)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
              >
                <Plus className="h-3 w-3 text-slate-400" />
                {d.label}
              </button>
            ))}
            {!available.length && <span className="text-[12px] text-slate-400">All dimensions added.</span>}
          </div>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="mt-4 text-[12px] font-medium text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={loading || available.length === 0}
          className="group inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-2.5 text-[13px] font-medium text-slate-600 shadow-sm transition hover:border-teal-400 hover:bg-teal-50/40 hover:text-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-slate-500 transition group-hover:bg-teal-100 group-hover:text-teal-600">
            <Plus className="h-3 w-3" />
          </span>
          Add filter
        </button>
      )}
    </div>
  );
}

/**
 * Multi-select combobox — single-input UX for filter values.
 *
 * Notion/Linear/Datadog flavor: selected values appear inline as removable
 * teal pills, with a "+N more" collapse past 5 chips. The dropdown is a
 * floating panel with a header counter, an "Add all matching" shortcut,
 * and a scrollable list capped to MAX_VISIBLE so the user is never asked
 * to scroll through hundreds of entries — searching narrows the set.
 */
function MultiSelectCombobox({
  options,
  loading,
  selected,
  placeholder,
  onChange,
  onLoadOptions,
}: {
  options: string[];
  loading: boolean;
  selected: string[];
  placeholder?: string;
  onChange: (vs: string[]) => void;
  onLoadOptions: () => void;
}) {
  const COLLAPSE_AT = 5;
  const MAX_VISIBLE = 80;

  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [showAllChips, setShowAllChips] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQ('');
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setQ(''); } };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const matching = options
    .filter(o => !selected.includes(o))
    .filter(o => !q || o.toLowerCase().includes(q.toLowerCase()));
  const visibleOptions = matching.slice(0, MAX_VISIBLE);

  const visibleChips = showAllChips || selected.length <= COLLAPSE_AT
    ? selected
    : selected.slice(0, COLLAPSE_AT);
  const hiddenCount = selected.length - visibleChips.length;

  const removeOne = (v: string) => {
    const next = selected.filter(x => x !== v);
    onChange(next);
    if (next.length <= COLLAPSE_AT) setShowAllChips(false);
  };
  const addOne = (v: string) => {
    if (selected.includes(v)) return;
    onChange([...selected, v]);
    setQ('');
    inputRef.current?.focus();
  };
  const addAllMatching = () => {
    onChange(Array.from(new Set([...selected, ...matching])));
    setQ('');
    setOpen(false);
  };
  const clearAll = () => { onChange([]); setShowAllChips(false); };

  const openIfClosed = () => {
    if (!open) { setOpen(true); onLoadOptions(); }
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Combobox shell */}
      <div
        onClick={openIfClosed}
        className={cn(
          'flex flex-wrap items-center gap-1.5 rounded-xl border bg-white px-2.5 py-2 shadow-sm transition cursor-text',
          open
            ? 'border-teal-400 ring-2 ring-teal-500/15'
            : 'border-slate-200 hover:border-slate-300',
        )}
      >
        {visibleChips.map(v => (
          <span
            key={v}
            className="group/chip inline-flex max-w-full items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-[12px] font-medium text-teal-700 ring-1 ring-inset ring-teal-100"
          >
            <span className="truncate">{v}</span>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); removeOne(v); }}
              className="-mr-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-teal-600/70 transition hover:bg-teal-100 hover:text-teal-700"
              aria-label={`Remove ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setShowAllChips(true); }}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-200"
          >
            +{hiddenCount} more
          </button>
        )}

        {showAllChips && selected.length > COLLAPSE_AT && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setShowAllChips(false); }}
            className="rounded-full px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:text-slate-700"
          >
            Collapse
          </button>
        )}

        <input
          ref={inputRef}
          value={q}
          onChange={e => { setQ(e.target.value); if (!open) { setOpen(true); onLoadOptions(); } }}
          onFocus={() => { setOpen(true); onLoadOptions(); }}
          onKeyDown={e => {
            if (e.key === 'Enter' && q.trim()) {
              e.preventDefault();
              addOne(q.trim());
            } else if (e.key === 'Backspace' && !q && selected.length) {
              removeOne(selected[selected.length - 1]);
            }
          }}
          placeholder={selected.length ? '' : (placeholder || 'Search a value…')}
          className="min-w-[120px] flex-1 bg-transparent py-0.5 text-[13px] text-slate-900 placeholder:text-slate-400 outline-none"
        />

        {selected.length > 0 && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); clearAll(); }}
            className="ml-auto inline-flex items-center rounded-md p-1 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
            aria-label="Clear all"
            title="Clear all selected"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronDown className={cn(
          'h-4 w-4 shrink-0 text-slate-400 transition-transform',
          open && 'rotate-180 text-teal-500',
        )} />
      </div>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-slate-900/5">
          {loading ? (
            <p className="flex items-center gap-2 px-3 py-3 text-[12px] text-slate-500">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-teal-400" />
              Loading values…
            </p>
          ) : matching.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-slate-500">
              {q
                ? <>No backend value matches <span className="font-medium text-slate-700">"{q}"</span>. Press <kbd className="rounded bg-slate-100 px-1 text-[10px] text-slate-600">Enter</kbd> to add it as a custom value.</>
                : 'All values selected.'}
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3 py-1.5">
                <span className="text-[11px] font-medium text-slate-500">
                  {q
                    ? `${matching.length} match${matching.length === 1 ? '' : 'es'}${matching.length > visibleOptions.length ? ` · showing ${visibleOptions.length}` : ''}`
                    : `${matching.length} value${matching.length === 1 ? '' : 's'} available`}
                </span>
                {matching.length > 1 && (
                  <button
                    type="button"
                    onClick={addAllMatching}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-teal-700 transition hover:bg-teal-50 hover:text-teal-800"
                  >
                    <Plus className="h-3 w-3" />
                    Add all {matching.length}
                  </button>
                )}
              </div>
              <ul className="max-h-64 overflow-auto py-1">
                {visibleOptions.map(o => (
                  <li key={o}>
                    <button
                      type="button"
                      onClick={() => addOne(o)}
                      className="group flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] text-slate-700 transition hover:bg-teal-50/70 hover:text-teal-700"
                    >
                      <span className="truncate">{o}</span>
                      <Plus className="h-3 w-3 shrink-0 text-slate-300 transition group-hover:text-teal-600" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ConditionsBuilder({ kind, kpis, config, onChange }: {
  kind: 'PM' | 'FM';
  kpis: KpiOption[];
  config: DraftLike['criteriaConfig'];
  onChange: (c: DraftLike['criteriaConfig']) => void;
}) {
  const operators: Array<DraftLike['criteriaConfig']['conditions'][number]['operator']> = ['<', '<=', '>', '>=', '=', '!='];
  const addCondition = () => onChange({ ...config, conditions: [...config.conditions, { id: uid('cond'), type: 'kpi', field: '', operator: '<', value: '' }] });
  const removeCondition = (id: string) => onChange({ ...config, conditions: config.conditions.filter(c => c.id !== id) });
  const patchCondition = (id: string, patch: Partial<DraftLike['criteriaConfig']['conditions'][number]>) =>
    onChange({ ...config, conditions: config.conditions.map(c => c.id === id ? { ...c, ...patch } : c) });

  return (
    <div className="space-y-4">
      {config.conditions.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-slate-500">Combine with</span>
          <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
            {(['AND', 'OR'] as const).map(op => (
              <button key={op} onClick={() => onChange({ ...config, logic: op })}
                className={cn('rounded px-3 py-1 text-[12px] font-semibold', config.logic === op ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-50')}>
                {op}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {config.conditions.map((c, idx) => (
          <div key={c.id} className="grid items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[1fr_120px_1fr_auto]">
            <KpiPicker
              value={c.field}
              kpis={kpis}
              placeholder={kind === 'PM' ? 'Search KPI…' : 'Search alarm / event…'}
              onChange={v => patchCondition(c.id, { field: v })}
            />
            <select value={c.operator} onChange={e => patchCondition(c.id, { operator: e.target.value as any })} className={inputClass}>
              {operators.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
            <input value={c.value} onChange={e => patchCondition(c.id, { value: e.target.value })} placeholder="Threshold" className={inputClass} />
            <button onClick={() => removeCondition(c.id)} disabled={config.conditions.length === 1}
              className="rounded-md border border-slate-200 p-2 text-slate-500 hover:border-red-200 hover:text-red-600 disabled:opacity-30">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button onClick={addCondition} className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 hover:border-teal-400 hover:text-teal-700">
        <Plus className="h-3.5 w-3.5" /> Add condition
      </button>
    </div>
  );
}

function KpiPicker({ value, kpis, placeholder, onChange }: { value: string; kpis: KpiOption[]; placeholder: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const selected = kpis.find(k => k.key === value);
  const filtered = kpis.filter(k => `${k.label} ${k.key}`.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        value={open ? q : selected?.label || value}
        onFocus={() => { setOpen(true); setQ(''); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => { setOpen(true); setQ(e.target.value); }}
        placeholder={placeholder}
        className={cn(inputClass, 'pl-9')}
      />
      {open && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {filtered.length ? filtered.map(k => (
            <button key={k.key} onMouseDown={e => e.preventDefault()} onClick={() => { onChange(k.key); setOpen(false); }}
              className={cn('flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-teal-50',
                k.key === value && 'bg-teal-50 text-teal-700')}>
              <span className="font-medium text-slate-800">{k.label}</span>
              <span className="font-mono text-[10px] text-slate-400">{k.key}</span>
            </button>
          )) : <p className="px-2.5 py-2 text-[12px] text-slate-400">No match</p>}
        </div>
      )}
    </div>
  );
}

// ============== Tiny UI primitives ==============

const inputClass = 'flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20';

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[12px] font-medium text-slate-600">{children}</label>;
}
function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div><Label>{label}</Label><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cn(inputClass, 'mt-1')} /></div>;
}
function Textarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div><Label>{label}</Label><textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} className={cn(inputClass, 'mt-1 h-auto py-2 leading-relaxed')} /></div>;
}
function ToggleRow({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button onClick={() => onChange(!checked)}
      className={cn('flex w-full items-center justify-between rounded-lg border p-3 text-left transition',
        checked ? 'border-teal-200 bg-teal-50/60' : 'border-slate-200 bg-white hover:bg-slate-50')}>
      <div>
        <p className="text-[13px] font-medium text-slate-800">{label}</p>
        {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
      </div>
      <span className={cn('h-5 w-9 rounded-full p-0.5 transition', checked ? 'bg-teal-600' : 'bg-slate-300')}>
        <span className={cn('block h-4 w-4 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
      </span>
    </button>
  );
}
function SegmentedSelect({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="mt-1 inline-flex flex-wrap rounded-md border border-slate-200 bg-white p-0.5">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cn('rounded px-3 py-1.5 text-[12px] font-medium', value === o.value ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-50')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
function TypeCard({ active, onClick, icon, title, subtitle, desc }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; subtitle: string; desc: string }) {
  return (
    <button onClick={onClick}
      className={cn('flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition',
        active ? 'border-teal-400 bg-teal-50/60 ring-2 ring-teal-500/20' : 'border-slate-200 bg-white hover:border-slate-300')}>
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-lg', active ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600')}>{icon}</span>
      <div>
        <p className="text-[15px] font-semibold text-slate-900">{title}</p>
        <p className="text-[12px] font-medium text-slate-500">{subtitle}</p>
      </div>
      <p className="text-[12px] leading-relaxed text-slate-600">{desc}</p>
    </button>
  );
}
function ChannelChip({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={cn('inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[12px] font-medium transition',
        active ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
      {icon} {label}
    </button>
  );
}
function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [v, setV] = useState('');
  return (
    <div className={cn(inputClass, 'mt-1 flex h-auto min-h-9 flex-wrap items-center gap-1.5 py-1.5')}>
      {tags.map(t => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
          {t}<button onClick={() => onChange(tags.filter(x => x !== t))}><X className="h-3 w-3" /></button>
        </span>
      ))}
      <input value={v} onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && v.trim()) { onChange([...tags, v.trim()]); setV(''); } }}
        placeholder={tags.length ? '' : 'Add tag…'}
        className="flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-slate-400" />
    </div>
  );
}
function SoftButton({ children, onClick, icon }: { children: React.ReactNode; onClick: () => void; icon?: React.ReactNode }) {
  return <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50">{icon}{children}</button>;
}
function PrimaryButton({ children, onClick, icon, disabled }: { children: React.ReactNode; onClick: () => void; icon?: React.ReactNode; disabled?: boolean }) {
  return <button disabled={disabled} onClick={onClick} className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50">{icon}{children}</button>;
}
function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function SumRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between text-[13px]"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-800">{value}</span></div>;
}
function Badge({ children, tone }: { children: React.ReactNode; tone: 'teal' | 'amber' | 'red' | 'slate' | 'orange' }) {
  const tones: Record<string, string> = {
    teal: 'bg-teal-50 text-teal-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    orange: 'bg-orange-50 text-orange-700',
    slate: 'bg-slate-100 text-slate-700',
  };
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize', tones[tone])}>{children}</span>;
}

function severityActiveClass(s: Severity): string {
  return s === 'critical' ? 'bg-red-50 text-red-700 border border-red-200'
    : s === 'major' ? 'bg-orange-50 text-orange-700 border border-orange-200'
      : s === 'minor' ? 'bg-amber-50 text-amber-700 border border-amber-200'
        : 'bg-slate-100 text-slate-700 border border-slate-200';
}
function severityToTone(s: Severity): 'teal' | 'amber' | 'red' | 'slate' | 'orange' {
  return s === 'critical' ? 'red' : s === 'major' ? 'orange' : s === 'minor' ? 'amber' : 'slate';
}
