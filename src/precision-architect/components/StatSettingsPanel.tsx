import { useEffect, useMemo, useState } from 'react';
import { X, Type as TypeIcon, Palette, Database, Plus, Trash2 } from 'lucide-react';
import {
  DynWidget,
  StatWidgetConfig,
  StatTheme,
  StatKpiItem,
  DEFAULT_STAT_CONFIG,
} from '../types';
import { cn } from '@/lib/utils';
import ColorSwatchPalette from './ColorSwatchPalette';
import { useKpiCatalog } from '@/components/kpi-monitor/api/kpiMonitorApi';
import { DEFAULT_REFERENCE_PERIODS, listReferencePeriods } from '../lib/referencePeriods';

interface Props {
  widget: DynWidget;
  onChange: (patch: Partial<DynWidget>) => void;
  onClose: () => void;
}

type Tab = 'content' | 'appearance';

/**
 * Stat (KPI Card) settings panel — UI mirrored from ChartSettingsPanel:
 * header with Widget Settings badge + Reset / Apply / Save / Close buttons,
 * left sidebar with tab navigation (Content, Appearance).
 */
export default function StatSettingsPanel({ widget, onChange, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('content');
  const cfg: StatWidgetConfig = widget.statConfig ?? DEFAULT_STAT_CONFIG;
  const widgetLabel = `STAT · ${((widget as any).title && (widget as any).title.trim()) || cfg.label || 'Untitled'}`;
  const { data: kpiCatalog } = useKpiCatalog();
  const [kpiSearch, setKpiSearch] = useState('');
  const [referencePeriods, setReferencePeriods] = useState(DEFAULT_REFERENCE_PERIODS);

  useEffect(() => {
    let alive = true;
    listReferencePeriods().then(periods => { if (alive) setReferencePeriods(periods); });
    return () => { alive = false; };
  }, []);

  const filteredKpis = useMemo(() => {
    const q = (kpiSearch || '').toLowerCase();
    return (kpiCatalog || []).filter(k =>
      !q || k.kpi_key.toLowerCase().includes(q) || (k.display_name || '').toLowerCase().includes(q)
    ).slice(0, 30);
  }, [kpiCatalog, kpiSearch]);

  const update = (patch: Partial<StatWidgetConfig>) => {
    onChange({ statConfig: { ...cfg, ...patch } });
  };

  const reset = () => onChange({ statConfig: { ...DEFAULT_STAT_CONFIG } });
  const apply = () => {
    // Stat widget renders live — Apply just bumps appliedRev for parity with Chart UI.
    onChange({ appliedRev: (widget.appliedRev ?? 0) + 1 });
  };
  const save = () => { apply(); onClose(); };

  return (
    <div className="h-[clamp(22rem,60vh,44rem)] w-full max-w-[1100px] mx-auto bg-white border border-outline-variant/20 rounded-t-2xl shadow-2xl relative z-40 shrink-0 flex flex-col">
      {/* ── Header (sticky) ── */}
      <div className="px-8 py-3 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low shrink-0 sticky top-0 z-10 rounded-t-2xl">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">Widget Settings</span>
          <div className="h-4 w-px bg-outline-variant" />
          <h4 className="font-headline font-bold text-on-surface text-sm">{widgetLabel}</h4>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={reset}
            className="px-4 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            Reset
          </button>
          <button
            onClick={apply}
            className="px-4 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/15 transition-colors"
          >
            Apply
          </button>
          <button
            onClick={save}
            className="px-4 py-1.5 rounded-lg bg-primary text-on-primary border border-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 transition-colors"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="p-1 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Body : sidebar + tab content ── */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar tabs (mirrors ChartSettingsPanel) */}
        <aside className="w-48 border-r border-outline-variant/10 p-4 shrink-0 space-y-1 bg-white">
          {[
            { key: 'content' as const, label: 'Content', icon: TypeIcon },
            { key: 'appearance' as const, label: 'Appearance', icon: Palette },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all',
                tab === t.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}

          {/* Card background toggle pinned at bottom of sidebar (parity with Chart) */}
          <div className="pt-3 mt-3 border-t border-outline-variant/10">
            <div className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant px-1 mb-1.5">
              Surface
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => onChange({ transparentBg: false })}
                className={cn(
                  'py-1.5 rounded-md text-[10px] font-bold border transition-colors',
                  !widget.transparentBg
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-white border-outline-variant/30 text-on-surface-variant'
                )}
              >
                Card
              </button>
              <button
                onClick={() => onChange({ transparentBg: true })}
                className={cn(
                  'py-1.5 rounded-md text-[10px] font-bold border transition-colors',
                  widget.transparentBg
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-white border-outline-variant/30 text-on-surface-variant'
                )}
              >
                Transp.
              </button>
            </div>
          </div>
        </aside>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          <div className="max-w-3xl mx-auto space-y-6">
            {tab === 'content' && (
              <>
                <Section icon={<Database className="w-4 h-4" />} title="KPI Sources">
                  {/* Resolve current list (migrate legacy single key into items array on first edit). */}
                  {(() => {
                    const items: StatKpiItem[] = (cfg.kpis && cfg.kpis.length > 0)
                      ? cfg.kpis
                      : (cfg.kpiKey ? [{ kpiKey: cfg.kpiKey, label: cfg.label, unit: cfg.unit }] : []);

                    const setItems = (next: StatKpiItem[]) => {
                      // Mirror first item back to legacy fields so existing renderers stay in sync.
                      update({
                        kpis: next,
                        kpiKey: next[0]?.kpiKey || '',
                      });
                    };
                    const addItem = (k: StatKpiItem) => setItems([...items, k]);
                    const removeAt = (idx: number) => setItems(items.filter((_, i) => i !== idx));
                    const patchAt = (idx: number, patch: Partial<StatKpiItem>) =>
                      setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

                    return (
                      <>
                        {/* Existing KPI rows */}
                        <div className="space-y-2">
                          {items.map((item, idx) => {
                            const meta = (kpiCatalog || []).find(k => k.kpi_key === item.kpiKey);
                            return (
                              <div
                                key={`${item.kpiKey}-${idx}`}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-outline-variant/20 bg-surface-container-low/40"
                              >
                                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant w-6">
                                  #{idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-bold truncate">
                                    {item.label || meta?.display_name || item.kpiKey}
                                  </div>
                                  <div className="text-[10px] font-mono text-on-surface-variant/60 truncate">
                                    {item.kpiKey}{(item.unit || meta?.unit) && ` · ${item.unit || meta?.unit}`}
                                  </div>
                                </div>
                                <input
                                  type="text"
                                  value={item.label ?? ''}
                                  onChange={(e) => patchAt(idx, { label: e.target.value })}
                                  placeholder="Label override"
                                  className="w-32 px-2 py-1 rounded border border-outline-variant/30 text-[11px] focus:outline-none focus:border-primary"
                                />
                                <input
                                  type="text"
                                  value={item.unit ?? ''}
                                  onChange={(e) => patchAt(idx, { unit: e.target.value })}
                                  placeholder="Unit"
                                  className="w-16 px-2 py-1 rounded border border-outline-variant/30 text-[11px] focus:outline-none focus:border-primary"
                                />
                                <input
                                  type="color"
                                  value={item.accentColor || '#00685f'}
                                  onChange={(e) => patchAt(idx, { accentColor: e.target.value })}
                                  className="w-7 h-7 rounded border border-outline-variant/30 cursor-pointer bg-transparent"
                                  title="Accent color"
                                />
                                <button
                                  onClick={() => removeAt(idx)}
                                  className="p-1.5 rounded hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors"
                                  aria-label="Remove KPI"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                          {items.length === 0 && (
                            <p className="text-[11px] text-on-surface-variant/60 italic">
                              No KPI selected yet. Search and add one below.
                            </p>
                          )}
                        </div>

                        {/* Add new KPI */}
                        <Field label={`Add KPI ${items.length > 0 ? `(${items.length} selected)` : ''}`}>
                          <div className="space-y-1">
                            <input
                              type="text"
                              value={kpiSearch}
                              onChange={(e) => setKpiSearch(e.target.value)}
                              placeholder="Search KPI to add (e.g. DL_VOLUME)..."
                              className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 text-sm font-mono focus:outline-none focus:border-primary"
                            />
                            {kpiSearch && filteredKpis.length > 0 && (
                              <div className="max-h-44 overflow-y-auto rounded-lg border border-outline-variant/20 bg-white shadow-lg">
                                {filteredKpis.map(k => {
                                  const already = items.some(it => it.kpiKey === k.kpi_key);
                                  return (
                                    <button
                                      key={k.kpi_key}
                                      disabled={already}
                                      onClick={() => {
                                        addItem({
                                          kpiKey: k.kpi_key,
                                          label: k.display_name || k.kpi_key,
                                          unit: k.unit || '',
                                        });
                                        setKpiSearch('');
                                      }}
                                      className={cn(
                                        'w-full text-left px-3 py-1.5 text-[11px] flex items-center justify-between transition-colors',
                                        already
                                          ? 'opacity-40 cursor-not-allowed'
                                          : 'hover:bg-primary/5'
                                      )}
                                    >
                                      <span>
                                        <span className="font-bold">{k.display_name || k.kpi_key}</span>
                                        {k.unit && <span className="ml-1 text-on-surface-variant/50">({k.unit})</span>}
                                      </span>
                                      {already ? (
                                        <span className="text-[9px] uppercase font-bold text-on-surface-variant/60">Added</span>
                                      ) : (
                                        <Plus className="w-3 h-3 text-primary" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </Field>
                      </>
                    );
                  })()}

                  <Field label="Reference Period">
                    <select
                      value={cfg.referencePeriodId || referencePeriods.find(p => p.isDefault)?.id || referencePeriods[0]?.id || 'last_7_days'}
                      onChange={(e) => update({ referencePeriodId: e.target.value })}
                      className="w-full max-w-sm px-3 py-2 rounded-lg border border-outline-variant/30 text-sm font-bold bg-white focus:outline-none focus:border-primary"
                    >
                      {referencePeriods.map(period => (
                        <option key={period.id} value={period.id}>{period.name}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-[10px] text-on-surface-variant/60">
                      All KPIs in this card share the same period (period-based aggregate, no time buckets).
                    </p>
                  </Field>
                </Section>

                <Section icon={<TypeIcon className="w-4 h-4" />} title="Content">
                <Field label="Label">
                  <input
                    type="text"
                    value={cfg.label}
                    placeholder="PEAK RATE"
                    onChange={(e) => update({ label: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 text-sm focus:outline-none focus:border-primary"
                  />
                </Field>
                <div className="grid grid-cols-[1fr_120px] gap-4">
                  <Field label="Value">
                    <input
                      type="text"
                      value={cfg.value}
                      placeholder="1.42"
                      onChange={(e) => update({ value: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 text-sm font-black focus:outline-none focus:border-primary"
                    />
                  </Field>
                  <Field label="Unit">
                    <input
                      type="text"
                      value={cfg.unit}
                      placeholder="Tb/s"
                      onChange={(e) => update({ unit: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 text-sm focus:outline-none focus:border-primary"
                    />
                  </Field>
                </div>
                </Section>
              </>
            )}

            {tab === 'appearance' && (
              <Section icon={<Palette className="w-4 h-4" />} title="Appearance">
                <Field label="Theme">
                  <SegmentControl
                    value={cfg.theme}
                    options={[
                      { value: 'light' as StatTheme, label: 'Light' },
                      { value: 'dark' as StatTheme, label: 'Dark' },
                      { value: 'glass' as StatTheme, label: 'Glass' },
                    ]}
                    onChange={(theme) => update({ theme })}
                  />
                </Field>
                <Field label="Accent color">
                  <ColorPicker value={cfg.accentColor || ''} onChange={(c) => update({ accentColor: c })} />
                </Field>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfg.showPulse}
                    onChange={(e) => update({ showPulse: e.target.checked })}
                    className="rounded border-outline-variant/40"
                  />
                  <span className="text-xs font-bold text-on-surface">Show pulse "Live" indicator</span>
                </label>
              </Section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----- Reusable form primitives (kept local to mirror ChartSettingsPanel style) ----- */
function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-primary">{icon}</span>}
        <h5 className="text-[10px] font-black uppercase tracking-widest text-on-surface">{title}</h5>
        <div className="flex-1 h-px bg-outline-variant/20" />
      </div>
      <div className="space-y-3 pl-1">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function SegmentControl<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex bg-surface-container-low rounded-lg p-0.5 border border-outline-variant/20">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all',
            value === opt.value ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || '#00685f'}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded-lg border border-outline-variant/30 cursor-pointer bg-transparent"
        />
        <input
          type="text"
          value={value}
          placeholder="auto (theme)"
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg border border-outline-variant/30 text-xs font-mono focus:outline-none focus:border-primary"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="text-[10px] font-bold text-on-surface-variant hover:text-error transition-colors px-2"
          >
            Clear
          </button>
        )}
      </div>
      <ColorSwatchPalette value={value} onChange={onChange} />
    </div>
  );
}
