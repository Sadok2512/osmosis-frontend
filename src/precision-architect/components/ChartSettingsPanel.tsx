import { useState } from 'react';
import { X, Plus, Trash2, Eye, EyeOff, GripVertical, ChevronDown, ChevronRight } from 'lucide-react';
import {
  DynWidget, ChartWidgetConfig, ChartMetric,
  DEFAULT_CHART_CONFIG, ChartGranularity, ChartType,
  LineStyle, AxisSide, FillStyle, BackgroundStyle, LegendPosition,
} from '../types';
import { cn } from '@/lib/utils';

interface Props {
  widget: DynWidget;
  onChange: (patch: Partial<DynWidget>) => void;
  onClose: () => void;
}

type Tab = 'data' | 'metrics' | 'style';

const KPI_OPTIONS = [
  { key: 'qoe_index', label: 'QoE Index', unit: '%' },
  { key: 'debit_dl', label: 'Débit DL', unit: 'Mbps' },
  { key: 'debit_ul', label: 'Débit UL', unit: 'Mbps' },
  { key: 'rtt_data_avg', label: 'RTT Data Avg', unit: 'ms' },
  { key: 'rtt_setup_avg', label: 'RTT Setup Avg', unit: 'ms' },
  { key: 'session_dcr', label: 'DCR', unit: '%' },
  { key: 'session_dur_moy', label: 'Session Duration', unit: 's' },
  { key: 'tcp_retr_rate_dl', label: 'TCP Retr DL', unit: '%' },
  { key: 'instability_rate', label: 'Instability Rate', unit: '%' },
];

const FILTER_DIMS = [
  { key: 'plaque' as const, label: 'Plaque', options: ['Nord', 'Sud', 'Est', 'Ouest', 'IDF'] },
  { key: 'region' as const, label: 'Region', options: ['Hauts-de-France', 'PACA', 'Auvergne', 'Bretagne'] },
  { key: 'vendor' as const, label: 'Vendor', options: ['Ericsson', 'Nokia', 'Huawei'] },
  { key: 'site' as const, label: 'Site', options: [] },
];

const COLOR_PALETTE = ['#00685f', '#6bd8cb', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#10b981', '#ec4899'];

export default function ChartSettingsPanel({ widget, onChange, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('data');
  const config: ChartWidgetConfig = widget.config ?? DEFAULT_CHART_CONFIG;

  const patchConfig = (patch: Partial<ChartWidgetConfig>) => {
    onChange({ config: { ...config, ...patch } });
  };
  const patchData = (patch: Partial<ChartWidgetConfig['data']>) =>
    patchConfig({ data: { ...config.data, ...patch } });
  const patchStyle = (patch: Partial<ChartWidgetConfig['style']>) =>
    patchConfig({ style: { ...config.style, ...patch } });
  const setMetrics = (metrics: ChartMetric[]) => patchConfig({ metrics });

  const addMetric = () => {
    const m: ChartMetric = {
      id: `m-${Date.now()}`,
      kpiKey: KPI_OPTIONS[0].key,
      alias: KPI_OPTIONS[0].label,
      unit: KPI_OPTIONS[0].unit,
      axis: 'left',
      color: COLOR_PALETTE[config.metrics.length % COLOR_PALETTE.length],
      lineStyle: 'solid',
      visible: true,
    };
    setMetrics([...config.metrics, m]);
  };

  const updateMetric = (id: string, patch: Partial<ChartMetric>) => {
    setMetrics(config.metrics.map(m => m.id === id ? { ...m, ...patch } : m));
  };
  const removeMetric = (id: string) => setMetrics(config.metrics.filter(m => m.id !== id));

  return (
    <div className="fixed bottom-0 left-64 right-0 h-[260px] bg-white border-t border-outline-variant/20 shadow-2xl z-[60] flex flex-col">
      {/* Header with horizontal tabs */}
      <div className="px-4 py-1.5 border-b border-outline-variant/15 flex items-center justify-between bg-surface-container-low shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-primary leading-none">Chart Settings</p>
            <h3 className="text-xs font-bold text-on-surface truncate max-w-[220px]">{widget.title ?? 'Untitled chart'}</h3>
          </div>
          <div className="h-5 w-px bg-outline-variant/30" />
          <div className="flex items-center gap-0.5">
            {(['data', 'metrics', 'style'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest transition-all',
                  tab === t
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-container-high'
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-surface-container-high rounded-md transition-colors" aria-label="Close">
          <X className="w-3.5 h-3.5 text-on-surface-variant" />
        </button>
      </div>

      {/* Body: 2-column scrolling content for the bottom panel */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3">
        <div className="max-w-5xl mx-auto">
          {tab === 'data' && (
            <DataTab
              data={config.data}
              patchData={patchData}
              onTitleChange={(t) => onChange({ title: t })}
              title={widget.title ?? ''}
            />
          )}
          {tab === 'metrics' && (
            <MetricsTab
              metrics={config.metrics}
              addMetric={addMetric}
              updateMetric={updateMetric}
              removeMetric={removeMetric}
            />
          )}
          {tab === 'style' && (
            <StyleTab style={config.style} patchStyle={patchStyle} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Tab: Data ---------------- */

function DataTab({
  data, patchData, title, onTitleChange,
}: {
  data: ChartWidgetConfig['data'];
  patchData: (p: Partial<ChartWidgetConfig['data']>) => void;
  title: string;
  onTitleChange: (t: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Field label="Widget title">
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="My chart"
          className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-white text-sm text-on-surface focus:outline-none focus:border-primary"
        />
      </Field>

      <Section title="Network Elements">
        <ToggleRow
          label="Inherit from dashboard"
          checked={data.inheritFromDashboard}
          onChange={(v) => patchData({ inheritFromDashboard: v })}
        />
        <div className={cn('space-y-3 mt-3', data.inheritFromDashboard && 'opacity-40 pointer-events-none')}>
          {FILTER_DIMS.map(dim => (
            <Field key={dim.key} label={dim.label}>
              <MultiTagInput
                placeholder={dim.options.length ? `Select ${dim.label.toLowerCase()}…` : `Type ${dim.label.toLowerCase()} and press Enter`}
                suggestions={dim.options}
                values={data.filters[dim.key] ?? []}
                onChange={(vals) => patchData({ filters: { ...data.filters, [dim.key]: vals } })}
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Time Range">
        <ToggleRow
          label="Inherit from dashboard"
          checked={data.timeRange.inherit}
          onChange={(v) => patchData({ timeRange: { ...data.timeRange, inherit: v } })}
        />
        <div className={cn('space-y-3 mt-3', data.timeRange.inherit && 'opacity-40 pointer-events-none')}>
          <Field label="Preset">
            <div className="flex gap-2">
              {(['24h', '7d', '30d'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => patchData({ timeRange: { ...data.timeRange, preset: p } })}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors',
                    data.timeRange.preset === p
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-white border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'
                  )}
                >
                  Last {p}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="From">
              <input
                type="date"
                value={data.timeRange.from ?? ''}
                onChange={(e) => patchData({ timeRange: { ...data.timeRange, from: e.target.value, preset: undefined } })}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-white text-sm"
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                value={data.timeRange.to ?? ''}
                onChange={(e) => patchData({ timeRange: { ...data.timeRange, to: e.target.value, preset: undefined } })}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-white text-sm"
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Granularity">
        <div className="flex flex-wrap gap-2">
          {(['auto', '5min', '15min', '1h', '1d'] as ChartGranularity[]).map(g => (
            <button
              key={g}
              onClick={() => patchData({ granularity: g })}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors',
                data.granularity === g
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-white border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ---------------- Tab: Metrics ---------------- */

function MetricsTab({
  metrics, addMetric, updateMetric, removeMetric,
}: {
  metrics: ChartMetric[];
  addMetric: () => void;
  updateMetric: (id: string, patch: Partial<ChartMetric>) => void;
  removeMetric: (id: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      {/* Sticky header row */}
      <div className="flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-sm py-1 z-10">
        <p className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
          {metrics.length} metric{metrics.length > 1 ? 's' : ''}
        </p>
        <button
          onClick={() => {
            addMetric();
            // auto-expand the new one
            setTimeout(() => {
              const last = document.querySelector<HTMLDivElement>('[data-kpi-card]:last-of-type');
              last?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 50);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" /> Add KPI
        </button>
      </div>

      {/* KPI cards list */}
      <div className="space-y-2">
        {metrics.map((m) => {
          const expanded = expandedId === m.id;
          const kpiLabel = KPI_OPTIONS.find(o => o.key === m.kpiKey)?.label ?? m.kpiKey;
          return (
            <div
              key={m.id}
              data-kpi-card
              className={cn(
                'group border rounded-xl bg-white transition-all',
                expanded
                  ? 'border-primary/40 shadow-md'
                  : 'border-outline-variant/20 hover:border-outline-variant/50 hover:shadow-sm'
              )}
            >
              {/* === COLLAPSED ROW === */}
              <button
                onClick={() => setExpandedId(expanded ? null : m.id)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
              >
                <GripVertical className="w-3.5 h-3.5 text-on-surface-variant/40 shrink-0 cursor-grab" />
                {expanded
                  ? <ChevronDown className="w-3.5 h-3.5 text-primary shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-on-surface-variant/60 shrink-0" />
                }

                {/* color dot */}
                <span
                  className="w-3 h-3 rounded-full ring-2 ring-white shadow-sm shrink-0"
                  style={{ background: m.color }}
                />

                {/* name */}
                <span className="font-bold text-sm text-on-surface truncate flex-1">
                  {m.alias || kpiLabel}
                </span>

                {/* meta chips */}
                <span className="hidden sm:inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded-md">
                  {m.axis}
                </span>
                <span className="hidden md:inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded-md capitalize">
                  {m.lineStyle}
                </span>

                {/* hover actions */}
                <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); updateMetric(m.id, { visible: !m.visible }); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); updateMetric(m.id, { visible: !m.visible }); } }}
                    className="p-1.5 hover:bg-surface-container-high rounded-md transition-colors cursor-pointer"
                    aria-label="Toggle visibility"
                  >
                    {m.visible ? <Eye className="w-3.5 h-3.5 text-on-surface-variant" /> : <EyeOff className="w-3.5 h-3.5 text-on-surface-variant/40" />}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); removeMetric(m.id); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); removeMetric(m.id); } }}
                    className="p-1.5 hover:bg-error/10 rounded-md transition-colors cursor-pointer"
                    aria-label="Remove metric"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-error" />
                  </span>
                </div>
              </button>

              {/* === EXPANDED EDITOR === */}
              {expanded && (
                <div className="px-4 pb-4 pt-1 border-t border-outline-variant/15 space-y-4 animate-in fade-in slide-in-from-top-1 duration-150">
                  {/* KPI selector */}
                  <Field label="KPI">
                    <select
                      value={m.kpiKey}
                      onChange={(e) => {
                        const opt = KPI_OPTIONS.find(o => o.key === e.target.value);
                        updateMetric(m.id, { kpiKey: e.target.value, alias: opt?.label, unit: opt?.unit });
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-white text-sm font-bold text-on-surface"
                    >
                      {KPI_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                  </Field>

                  {/* Alias + Unit */}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Alias">
                      <input
                        value={m.alias ?? ''}
                        onChange={(e) => updateMetric(m.id, { alias: e.target.value })}
                        placeholder="Display name"
                        className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-white text-sm"
                      />
                    </Field>
                    <Field label="Unit">
                      <input
                        value={m.unit ?? ''}
                        onChange={(e) => updateMetric(m.id, { unit: e.target.value })}
                        placeholder="auto"
                        className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-white text-sm"
                      />
                    </Field>
                  </div>

                  {/* Axis + Style row */}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Axis">
                      <div className="flex border border-outline-variant/30 rounded-lg overflow-hidden">
                        {(['left', 'right'] as AxisSide[]).map(side => (
                          <button
                            key={side}
                            onClick={() => updateMetric(m.id, { axis: side })}
                            className={cn(
                              'flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors',
                              m.axis === side ? 'bg-primary text-on-primary' : 'bg-white text-on-surface-variant hover:bg-surface-container-low'
                            )}
                          >
                            {side}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label="Line style">
                      <select
                        value={m.lineStyle}
                        onChange={(e) => updateMetric(m.id, { lineStyle: e.target.value as LineStyle })}
                        className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-white text-sm"
                      >
                        <option value="solid">Solid</option>
                        <option value="dashed">Dashed</option>
                      </select>
                    </Field>
                  </div>

                  {/* Color picker - improved */}
                  <Field label="Color">
                    <div className="flex items-center gap-3">
                      {/* big preview */}
                      <div
                        className="w-10 h-10 rounded-lg ring-2 ring-white shadow-md shrink-0"
                        style={{ background: m.color }}
                      />
                      {/* palette */}
                      <div className="flex flex-wrap gap-1.5 flex-1">
                        {COLOR_PALETTE.map(c => (
                          <button
                            key={c}
                            onClick={() => updateMetric(m.id, { color: c })}
                            className={cn(
                              'w-6 h-6 rounded-full transition-all hover:scale-110',
                              m.color === c ? 'ring-2 ring-on-surface ring-offset-2' : 'ring-1 ring-outline-variant/30'
                            )}
                            style={{ background: c }}
                            aria-label={`Color ${c}`}
                          />
                        ))}
                      </div>
                      {/* hex input */}
                      <div className="flex items-center gap-1.5 border border-outline-variant/30 rounded-lg px-2 py-1.5 bg-white shrink-0">
                        <input
                          type="color"
                          value={m.color}
                          onChange={(e) => updateMetric(m.id, { color: e.target.value })}
                          className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                        />
                        <input
                          value={m.color}
                          onChange={(e) => updateMetric(m.id, { color: e.target.value })}
                          className="w-20 text-[11px] font-mono text-on-surface bg-transparent outline-none uppercase"
                        />
                      </div>
                    </div>
                  </Field>
                </div>
              )}
            </div>
          );
        })}

        {metrics.length === 0 && (
          <div className="border border-dashed border-outline-variant/30 rounded-xl py-12 flex flex-col items-center gap-3">
            <p className="text-xs text-on-surface-variant">No metrics yet</p>
            <button
              onClick={addMetric}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-bold hover:bg-primary/90"
            >
              <Plus className="w-3.5 h-3.5" /> Add your first KPI
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Tab: Style ---------------- */

function StyleTab({
  style, patchStyle,
}: {
  style: ChartWidgetConfig['style'];
  patchStyle: (p: Partial<ChartWidgetConfig['style']>) => void;
}) {
  return (
    <div className="space-y-4">
      <Section title="Chart type">
        <div className="grid grid-cols-3 gap-2">
          {(['line', 'area', 'bar'] as ChartType[]).map(t => (
            <button
              key={t}
              onClick={() => patchStyle({ chartType: t })}
              className={cn(
                'py-2 rounded-lg text-xs font-bold border capitalize transition-colors',
                style.chartType === t
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-white border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Lines">
        <Field label={`Thickness · ${style.lineThickness}px`}>
          <input
            type="range" min={1} max={5} step={0.5}
            value={style.lineThickness}
            onChange={(e) => patchStyle({ lineThickness: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </Field>
        <ToggleRow
          label="Smooth lines"
          checked={style.smooth}
          onChange={(v) => patchStyle({ smooth: v })}
        />
      </Section>

      <Section title="Fill">
        <div className="grid grid-cols-3 gap-2">
          {(['none', 'gradient', 'solid'] as FillStyle[]).map(f => (
            <button
              key={f}
              onClick={() => patchStyle({ fill: f })}
              className={cn(
                'py-2 rounded-lg text-xs font-bold border capitalize transition-colors',
                style.fill === f
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-white border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <Field label={`Opacity · ${style.opacity}%`}>
            <input
              type="range" min={0} max={100} step={5}
              value={style.opacity}
              onChange={(e) => patchStyle({ opacity: Number(e.target.value) })}
              className="w-full accent-primary"
              disabled={style.fill === 'none'}
            />
          </Field>
        </div>
      </Section>

      <Section title="Background">
        <div className="grid grid-cols-3 gap-2">
          {(['transparent', 'light', 'dark'] as BackgroundStyle[]).map(b => (
            <button
              key={b}
              onClick={() => patchStyle({ background: b })}
              className={cn(
                'py-2 rounded-lg text-xs font-bold border capitalize transition-colors',
                style.background === b
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-white border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'
              )}
            >
              {b}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Grid & Legend">
        <ToggleRow
          label="Show grid"
          checked={style.grid}
          onChange={(v) => patchStyle({ grid: v })}
        />
        <Field label="Legend position">
          <div className="grid grid-cols-3 gap-2">
            {(['top', 'bottom', 'right'] as LegendPosition[]).map(p => (
              <button
                key={p}
                onClick={() => patchStyle({ legend: { ...style.legend, position: p } })}
                className={cn(
                  'py-1.5 rounded-lg text-xs font-bold border capitalize transition-colors',
                  style.legend.position === p
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-white border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </Field>
        <ToggleRow
          label="Show values in legend"
          checked={style.legend.showValues}
          onChange={(v) => patchStyle({ legend: { ...style.legend, showValues: v } })}
        />
      </Section>
    </div>
  );
}

/* ---------------- Helpers ---------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-on-surface-variant">{label}</label>
      {children}
    </div>
  );
}

function ToggleRow({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between py-1.5 px-2.5 rounded-md bg-white border border-outline-variant/20 hover:border-outline-variant/40 transition-colors"
      type="button"
    >
      <span className="text-[11px] font-bold text-on-surface">{label}</span>
      <span
        className={cn(
          'w-8 h-4 rounded-full relative transition-colors shrink-0',
          checked ? 'bg-primary' : 'bg-outline-variant/40'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform',
            checked ? 'translate-x-[17px]' : 'translate-x-0.5'
          )}
        />
      </span>
    </button>
  );
}

function MultiTagInput({
  values, onChange, suggestions, placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const add = (v: string) => {
    const t = v.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setDraft('');
  };
  const remove = (v: string) => onChange(values.filter(x => x !== v));
  const filtered = suggestions.filter(s => !values.includes(s) && s.toLowerCase().includes(draft.toLowerCase()));

  return (
    <div className="border border-outline-variant/30 rounded-lg bg-white p-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map(v => (
          <span key={v} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-bold">
            {v}
            <button onClick={() => remove(v)} className="hover:bg-primary/20 rounded p-0.5" aria-label={`Remove ${v}`}>
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } }}
          placeholder={values.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[80px] text-xs bg-transparent outline-none"
        />
      </div>
      {draft && filtered.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1.5 border-t border-outline-variant/20">
          {filtered.slice(0, 6).map(s => (
            <button
              key={s}
              onClick={() => add(s)}
              className="px-2 py-0.5 rounded-md text-[11px] font-bold text-on-surface-variant bg-surface-container-low hover:bg-primary/10 hover:text-primary transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
