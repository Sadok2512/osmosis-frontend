import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Type, Palette,
} from 'lucide-react';
import { DynWidget, ChartWidgetConfig, DEFAULT_HERO_CONFIG, DEFAULT_STAT_CONFIG, DEFAULT_DIVIDER_CONFIG, MapFilterChip, MapWidgetConfig } from '../types';
import PAEChart from './PAEChart';
import PAMapWidget from './PAMapWidget';
import PATableWidget from './PATableWidget';
import PAHeroWidget from './PAHeroWidget';
import PAStatWidget from './PAStatWidget';
import PADividerWidget from './PADividerWidget';
import { useTimeseriesQuery, TimeseriesRequest, MonitorFilter } from '@/components/kpi-monitor/api/kpiMonitorApi';
import { selectToolbarSnapshot, usePAGlobalToolbar } from '../stores/paGlobalToolbarStore';
import { toBackendDimension, toBackendGranularity } from '../lib/monitorDimensions';
import { buildAdvancedTimeFramePayload } from '../lib/advancedTimeFrame';

interface Props {
  widget: DynWidget;
  editable?: boolean;
  onChange?: (patch: Partial<DynWidget>) => void;
}

/**
 * Renders a single widget body. Container (size, drag handles) is
 * managed by the grid layout in EditorView/ViewerView.
 */
export default function WidgetRenderer({ widget: w, editable = false, onChange }: Props) {
  if (w.kind === 'chart') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-2 widget-drag-handle cursor-move">
          <h3 className="text-sm font-black text-on-surface font-headline">{w.title ?? 'Chart'}</h3>
        </div>
        <div className="flex-1 min-h-0">
          <ChartWidgetBody widget={w} />
        </div>
      </div>
    );
  }
  if (w.kind === 'map') {
    return <MapWidgetBody widget={w} />;
  }
  if (w.kind === 'table') {
    return (
      <div className="h-full flex flex-col">
        <div className="widget-drag-handle cursor-move mb-2">
          <h3 className="text-sm font-black text-on-surface font-headline">{w.title ?? 'Table'}</h3>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <PATableWidget height="100%" widget={w} />
        </div>
      </div>
    );
  }
  if (w.kind === 'text') {
    return <TextWidgetBody widget={w} editable={editable} onChange={onChange} />;
  }
  if (w.kind === 'image') {
    return <ImageWidgetBody widget={w} editable={editable} onChange={onChange} />;
  }
  if (w.kind === 'hero') {
    return (
      <div className="h-full flex flex-col">
        <div className="widget-drag-handle cursor-move h-3 -mt-1" />
        <div className="flex-1 min-h-0">
          <PAHeroWidget widget={w} />
        </div>
      </div>
    );
  }
  if (w.kind === 'stat') {
    return (
      <div className="h-full relative">
        <div className="widget-drag-handle cursor-move absolute inset-x-0 top-0 h-4 z-10" />
        <PAStatWidget widget={w} />
      </div>
    );
  }
  if (w.kind === 'divider') {
    return (
      <div className="h-full relative">
        <div className="widget-drag-handle cursor-move absolute inset-0 z-0" />
        <div className="relative z-10 pointer-events-none">
          <PADividerWidget widget={w} />
        </div>
      </div>
    );
  }
  // kpi
  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-start mb-6 widget-drag-handle cursor-move">
        <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{w.title ?? 'KPI'}</h3>
        <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-sm shadow-primary/40" />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-black font-headline tracking-tighter text-on-surface">94.6%</span>
        <span className="text-xs font-bold text-emerald-600">+1.2%</span>
      </div>
    </div>
  );
}

/* ---------- Inline editable Text widget ---------- */
function TextWidgetBody({ widget: w, editable, onChange }: Props) {
  const [title, setTitle] = useState(w.title ?? 'Text');
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalUpdate = useRef(false);

  useEffect(() => { setTitle(w.title ?? 'Text'); }, [w.title]);

  // Sync external body changes into the contentEditable without disrupting caret
  useEffect(() => {
    if (!editorRef.current) return;
    if (isInternalUpdate.current) { isInternalUpdate.current = false; return; }
    const incoming = w.body ?? '';
    if (editorRef.current.innerHTML !== incoming) {
      editorRef.current.innerHTML = incoming;
    }
  }, [w.body]);

  const placeholder = 'Click here to add notes, commentary or a narrative for this report section.';

  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    if (editorRef.current) {
      isInternalUpdate.current = true;
      onChange?.({ body: editorRef.current.innerHTML });
    }
  };

  const handleInput = () => {
    if (!editorRef.current) return;
    isInternalUpdate.current = true;
    onChange?.({ body: editorRef.current.innerHTML });
  };

  const FONT_SIZES = [
    { label: 'Small', value: '2' },
    { label: 'Normal', value: '3' },
    { label: 'Large', value: '5' },
    { label: 'XL', value: '6' },
    { label: 'Heading', value: '7' },
  ];

  const COLORS = ['#0f172a', '#475569', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777'];

  const btn = "h-7 w-7 flex items-center justify-center rounded hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors";

  return (
    <div className="h-full flex flex-col">
      <div className="widget-drag-handle cursor-move mb-2">
        {editable ? (
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); onChange?.({ title: e.target.value }); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full bg-transparent border-none outline-none text-sm font-black text-on-surface font-headline focus:bg-surface-container-low rounded px-1 -mx-1"
            placeholder="Title"
          />
        ) : (
          <h3 className="text-sm font-black text-on-surface font-headline">{w.title ?? 'Text'}</h3>
        )}
      </div>

      {editable && (
        <div
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
          className="flex flex-wrap items-center gap-0.5 mb-2 p-1 rounded-lg bg-surface-container-low border border-outline-variant/20"
        >
          <select
            onChange={(e) => exec('fontSize', e.target.value)}
            defaultValue="3"
            className="h-7 px-1.5 text-[11px] font-bold rounded bg-transparent hover:bg-surface-container-high text-on-surface-variant outline-none cursor-pointer"
            title="Font size"
          >
            {FONT_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div className="w-px h-5 bg-outline-variant/40 mx-1" />
          <button onClick={() => exec('bold')} className={btn} title="Bold"><Bold className="w-3.5 h-3.5" /></button>
          <button onClick={() => exec('italic')} className={btn} title="Italic"><Italic className="w-3.5 h-3.5" /></button>
          <button onClick={() => exec('underline')} className={btn} title="Underline"><Underline className="w-3.5 h-3.5" /></button>
          <div className="w-px h-5 bg-outline-variant/40 mx-1" />
          <button onClick={() => exec('justifyLeft')} className={btn} title="Align left"><AlignLeft className="w-3.5 h-3.5" /></button>
          <button onClick={() => exec('justifyCenter')} className={btn} title="Align center"><AlignCenter className="w-3.5 h-3.5" /></button>
          <button onClick={() => exec('justifyRight')} className={btn} title="Align right"><AlignRight className="w-3.5 h-3.5" /></button>
          <div className="w-px h-5 bg-outline-variant/40 mx-1" />
          <button onClick={() => exec('insertUnorderedList')} className={btn} title="Bullet list"><List className="w-3.5 h-3.5" /></button>
          <button onClick={() => exec('insertOrderedList')} className={btn} title="Numbered list"><ListOrdered className="w-3.5 h-3.5" /></button>
          <div className="w-px h-5 bg-outline-variant/40 mx-1" />
          <div className="relative group/color">
            <button className={btn} title="Text color"><Palette className="w-3.5 h-3.5" /></button>
            <div className="absolute top-full left-0 mt-1 hidden group-hover/color:flex flex-wrap gap-1 p-2 bg-white rounded-lg shadow-xl border border-outline-variant/20 z-50 w-32">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => exec('foreColor', c)}
                  className="w-5 h-5 rounded-full border border-outline-variant/30 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>
          <label className={btn + " cursor-pointer relative"} title="Custom color">
            <Type className="w-3.5 h-3.5" />
            <input
              type="color"
              onChange={(e) => exec('foreColor', e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        </div>
      )}

      {editable ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onMouseDown={(e) => e.stopPropagation()}
          data-placeholder={placeholder}
          className="flex-1 min-h-0 w-full overflow-auto bg-transparent border border-transparent hover:border-outline-variant/30 focus:border-primary/40 focus:bg-surface-container-low rounded-lg p-2 text-sm text-on-surface leading-relaxed outline-none transition-colors empty:before:content-[attr(data-placeholder)] empty:before:text-on-surface-variant empty:before:opacity-60"
        />
      ) : (
        <div
          className="flex-1 min-h-0 overflow-auto text-sm text-on-surface leading-relaxed p-2"
          dangerouslySetInnerHTML={{ __html: w.body || `<span class="opacity-60">${placeholder}</span>` }}
        />
      )}
    </div>
  );
}

/* ---------- Inline editable Image widget ---------- */
function ImageWidgetBody({ widget: w, editable, onChange }: Props) {
  const [title, setTitle] = useState(w.title ?? 'Image');
  const [url, setUrl] = useState(w.imageUrl ?? '');
  const [showUrlInput, setShowUrlInput] = useState(!w.imageUrl);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTitle(w.title ?? 'Image'); }, [w.title]);
  useEffect(() => { setUrl(w.imageUrl ?? ''); setShowUrlInput(!w.imageUrl); }, [w.imageUrl]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setUrl(dataUrl);
      setShowUrlInput(false);
      onChange?.({ imageUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="widget-drag-handle cursor-move mb-2 flex items-center gap-2">
        {editable ? (
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); onChange?.({ title: e.target.value }); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex-1 bg-transparent border-none outline-none text-sm font-black text-on-surface font-headline focus:bg-surface-container-low rounded px-1 -mx-1"
            placeholder="Title"
          />
        ) : (
          <h3 className="text-sm font-black text-on-surface font-headline">{w.title ?? 'Image'}</h3>
        )}
        {editable && w.imageUrl && (
          <button
            onClick={() => setShowUrlInput(s => !s)}
            onMouseDown={(e) => e.stopPropagation()}
            className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
          >
            Change
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 rounded-xl overflow-hidden bg-surface-container-low border border-outline-variant/20 flex items-center justify-center relative">
        {url ? (
          <img src={url} alt={w.caption ?? w.title ?? 'Widget image'} className="w-full h-full object-contain" />
        ) : (
          <div className="text-xs font-bold uppercase tracking-widest text-on-surface-variant text-center px-4">
            {editable ? 'Paste a URL or upload a file below' : 'No image'}
          </div>
        )}
      </div>

      {editable && showUrlInput && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="mt-2 flex items-center gap-2"
        >
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => onChange?.({ imageUrl: url })}
            onKeyDown={(e) => { if (e.key === 'Enter') { onChange?.({ imageUrl: url }); setShowUrlInput(false); } }}
            placeholder="https://… or click upload"
            className="flex-1 px-3 py-1.5 rounded-lg border border-outline-variant/30 bg-white text-xs text-on-surface outline-none focus:border-primary/40"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary-container transition-colors"
          >
            Upload
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Map widget (responds to local + global Apply) ---------- */
function MapWidgetBody({ widget: w }: { widget: DynWidget }) {
  const global = usePAGlobalToolbar();
  // STRICT Apply contract — map only fetches sites once the user clicked Apply
  // (per-widget OR global). Before that, show a placeholder instead of auto-loading.
  const widgetRev = w.appliedRev ?? 0;
  const hasBeenApplied = widgetRev > 0 || global.appliedRev > 0;
  const toolbar = selectToolbarSnapshot(global);
  const rawMapCfg = hasBeenApplied
    ? (w.appliedMapConfig ?? w.mapConfig)
    : undefined;
  const mapCfg = useMemo<MapWidgetConfig | undefined>(() => {
    if (!rawMapCfg) return undefined;
    if (rawMapCfg.inheritFromDashboard === false) return rawMapCfg;
    return {
      ...rawMapCfg,
      filters: mergeMapFilters(
        mapToolbarFiltersFromSnapshot(toolbar.technos, toolbar.filters),
        rawMapCfg.filters,
      ),
    };
  }, [rawMapCfg, toolbar]);
  const mode = mapCfg?.displayMode ?? 'sites';
  // Force remount when either local or global Apply is bumped, so PAMapWidget
  // picks up the freshest config (theme, mapType, filters, layers).
  const renderKey = `${w.id}-${widgetRev}-${global.appliedRev}`;
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 widget-drag-handle cursor-move">
        <h3 className="text-sm font-black text-on-surface font-headline">{w.title ?? 'Map'}</h3>
        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          {mode === 'cells' ? 'Cells view' : 'Sites view'}
        </span>
      </div>
      <div className="flex-1 min-h-0">
        {hasBeenApplied && mapCfg ? (
          <PAMapWidget key={renderKey} height="100%" config={mapCfg} />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-muted/20 rounded-lg border border-dashed border-outline-variant/40">
            <div className="text-center px-4">
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Map not loaded</p>
              <p className="text-[11px] text-on-surface-variant/70">Click <span className="font-semibold">Apply to Widget</span> or <span className="font-semibold">Apply to Dashboard</span> to load sites.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function normalizeMapDimension(dimension: string): string {
  const normalized = toBackendDimension(dimension);
  if (normalized === 'RAT') return 'TECHNO';
  if (normalized === 'VENDOR') return 'VENDOR';
  if (normalized === 'DOR') return 'DOR';
  if (normalized === 'CELL') return 'CELL';
  if (normalized === 'SITE') return 'SITE';
  if (normalized === 'ZONE_ARCEP') return 'ARCEP';
  if (normalized === 'BAND') return 'BANDE';
  if (normalized === 'CLUSTER') return 'PLAQUE';
  return normalized.toUpperCase();
}

function mapToolbarFiltersFromSnapshot(technos: string[], filters: { dimension: string; value: string }[]): MapFilterChip[] {
  const grouped = new Map<string, Set<string>>();
  for (const filter of filters) {
    const dimension = normalizeMapDimension(filter.dimension);
    const values = grouped.get(dimension) ?? new Set<string>();
    values.add(filter.value);
    grouped.set(dimension, values);
  }

  const normalizedTechnos = technos.map((tech) => tech.toUpperCase());
  const allTechsSelected = normalizedTechnos.length >= 4
    && ['2G', '3G', '4G', '5G'].every((tech) => normalizedTechnos.includes(tech));
  if (normalizedTechnos.length > 0 && !allTechsSelected) {
    const values = grouped.get('TECHNO') ?? new Set<string>();
    normalizedTechnos.forEach((tech) => values.add(tech));
    grouped.set('TECHNO', values);
  }

  return Array.from(grouped.entries()).map(([dimension, values], index) => ({
    id: `toolbar-${dimension}-${index}`,
    dimension,
    values: Array.from(values),
  }));
}

function mergeMapFilters(base: MapFilterChip[], overrides: MapFilterChip[]): MapFilterChip[] {
  const merged = new Map<string, MapFilterChip>();

  for (const filter of base) {
    merged.set(normalizeMapDimension(filter.dimension), {
      ...filter,
      dimension: normalizeMapDimension(filter.dimension),
      values: Array.from(new Set(filter.values)),
    });
  }

  for (const filter of overrides) {
    const dimension = normalizeMapDimension(filter.dimension);
    const uniqueValues = Array.from(new Set(filter.values));
    const existing = merged.get(dimension);
    if (!existing || existing.values.length === 0) {
      merged.set(dimension, { ...filter, dimension, values: uniqueValues });
      continue;
    }
    if (uniqueValues.length === 0) continue;
    const nextValues = existing.values.filter((value) => uniqueValues.includes(value));
    merged.set(dimension, {
      ...filter,
      dimension,
      values: nextValues.length > 0 ? nextValues : ['__PA_NO_MATCH__'],
    });
  }

  return Array.from(merged.values());
}

/* ---------- Chart widget with backend integration ---------- */
/**
 * Builds a TimeseriesRequest mirroring the Investigator flow:
 *   1. Date normalization: 15min/1h grains MUST send YYYY-MM-DDTHH:mm:00 (with seconds).
 *   2. Granularity mapping: monitor API expects 5min / 15min / 1h / 1d (no 30min).
 *   3. Filter chips grouped per-dimension into IN clauses.
 *   4. Gated by `appliedRev` — no request fires before the user clicks Appliquer
 *      (project rule: apply-only-backend-execution).
 */
function ChartWidgetBody({ widget: w }: { widget: DynWidget }) {
  // STRICT Apply contract (project rule: apply-only-backend-execution):
  //   – Live `w.config` is for the editor only and MUST NOT drive any fetch.
  //   – Backend requests use exclusively the FROZEN `w.appliedConfig` snapshot,
  //     written by either:
  //       • per-widget "Apply to Widget" (ChartSettingsPanel)         → bumps w.appliedRev
  //       • global "Apply to Dashboard" (PAToolbar)                   → snapshots config→appliedConfig + bumps w.appliedRev
  //   – As long as no Apply has ever run, `w.appliedConfig` is undefined and
  //     no request fires (nothing to render).
  const globalStore = usePAGlobalToolbar();
  const widgetAppliedRev = w.appliedRev ?? 0;
  const rawCfg: ChartWidgetConfig | undefined = (widgetAppliedRev > 0 || globalStore.appliedRev > 0)
    ? (w.appliedConfig as ChartWidgetConfig | undefined)
    : undefined;
  // Ensure cfg has required structure (metrics + data with defaults)
  const cfg: ChartWidgetConfig | undefined = rawCfg && rawCfg.metrics?.length
    ? {
        ...rawCfg,
        data: rawCfg.data ?? {
          inheritFromDashboard: true,
          technos: [],
          filters: [],
          timeRange: { inherit: true, preset: '7j', from: '', to: '' },
          granularity: '1d',
        },
      }
    : undefined;
  const hasMetrics = !!cfg && cfg.metrics.some((metric) => metric.visible !== false);
  const global = globalStore;

  // Resolve effective time/filter source: global if widget inherits, else per-widget config.
  const inheritsTime = cfg?.data.timeRange?.inherit !== false; // default true
  const inheritsScope = cfg?.data.inheritFromDashboard !== false; // default true

  // Effective apply rev: respond to BOTH widget-level and global-level Apply clicks.
  // Global Apply triggers ALL widgets that have KPIs configured (even if never individually applied).
  const hasAnyApply = widgetAppliedRev > 0 || global.appliedRev > 0;
  const effectiveAppliedRev = (inheritsTime || inheritsScope)
    ? widgetAppliedRev + global.appliedRev
    : widgetAppliedRev;
  const hasBeenApplied = hasAnyApply;

  // Debug: trace gating decisions
  useEffect(() => {
    console.log('[PA Chart] gate', {
      widgetId: w.id,
      widgetAppliedRev,
      globalAppliedRev: global.appliedRev,
      effectiveAppliedRev,
      hasMetrics,
      hasBeenApplied,
      hasAppliedConfig: !!w.appliedConfig,
      cfgMetrics: cfg?.metrics?.length ?? 0,
    });
  }, [widgetAppliedRev, global.appliedRev, effectiveAppliedRev, hasMetrics, hasBeenApplied, cfg, w.id, w.appliedConfig]);



  // Read the FROZEN snapshot taken at the last global Apply click. Editing the
  // toolbar (period, grain, filters) updates the live store but NOT this snapshot,
  // so widgets that inherit will not refetch until the user clicks Apply again.
  const globalSnap = global.applied;
  const gFrom = globalSnap?.from ?? global.from;
  const gTo = globalSnap?.to ?? global.to;
  const gGrain = globalSnap?.grain ?? global.grain;
  const gAdvancedTimeFrame = globalSnap?.advancedTimeFrame ?? global.advancedTimeFrame;
  const gTechnos = globalSnap?.technos ?? global.technos;
  const gFilters = globalSnap?.filters ?? global.filters;

  const request: TimeseriesRequest | null = useMemo(() => {
    if (!cfg || !hasMetrics || !hasBeenApplied) return null;

    // Pick effective values from FROZEN global snapshot OR per-widget overrides
    const eff = {
      from: inheritsTime ? gFrom : cfg.data.timeRange.from,
      to: inheritsTime ? gTo : cfg.data.timeRange.to,
      granularity: inheritsTime ? gGrain : cfg.data.granularity,
      advancedTimeFrame: inheritsTime ? gAdvancedTimeFrame : { mode: 'NONE' as const },
      technos: inheritsScope ? gTechnos : cfg.data.technos,
      filters: inheritsScope ? gFilters : cfg.data.filters,
    };

    // ── 1. Filters (chip[] → IN clauses, dimension normalized to backend keys) ──
    // Use toBackendDimension() — never .toUpperCase() blindly. UI labels like
    // "Techno", "Constructeur", "Région" must map to RAT, Vendor, DOR.
    const byDim = new Map<string, string[]>();
    eff.filters.forEach(f => {
      const dim = toBackendDimension(f.dimension);
      const arr = byDim.get(dim) ?? [];
      if (!arr.includes(f.value)) arr.push(f.value);
      byDim.set(dim, arr);
    });
    const filters: MonitorFilter[] = Array.from(byDim.entries()).map(([dimension, values]) => ({
      dimension,
      op: 'IN' as const,
      values,
    }));

    // ── 2. Technology perimeter chips (4G/5G…) → RAT filter, only if not "all selected" ──
    const ALL_TECHS = new Set(['2g', '3g', '4g', '5g']);
    const selectedTechs = (eff.technos || []).map(t => t.toLowerCase());
    const allSelected = selectedTechs.length >= 4 && selectedTechs.every(t => ALL_TECHS.has(t));
    if (selectedTechs.length > 0 && !allSelected) {
      filters.push({
        dimension: toBackendDimension('Techno'), // → 'RAT'
        op: 'IN',
        values: selectedTechs.map(t => t.toUpperCase()),
      });
    }

    // ── 3. Granularity normalization (15min → 15m, etc.) ──
    const granularity = toBackendGranularity(eff.granularity);

    // ── 4. Date normalization ──
    const normalizeDate = (raw: string): string => {
      if (!raw) return raw;
      if (granularity === '1d') return raw.split('T')[0];
      if (/T\d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
      if (/T\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;
      if (!raw.includes('T')) return `${raw}T00:00:00`;
      return raw;
    };

    // Per-metric split (mirrors the table widget). The first visible metric
    // with a non-null splitBy drives split_by for the whole request — the
    // backend supports a single split dimension per call.
    const visibleMetrics = cfg.metrics.filter(m => m.visible !== false);
    const rawSplitBy = visibleMetrics.find(m => m.splitBy && m.splitBy !== '__none__')?.splitBy ?? null;
    const effectiveSplitBy = rawSplitBy ? toBackendDimension(rawSplitBy) : null;

    return {
      date_from: normalizeDate(eff.from),
      date_to: normalizeDate(eff.to),
      granularity,
      filters,
      selections: visibleMetrics.map(m => ({
        kpi_key: m.kpiKey,
      })),
      split_by: effectiveSplitBy,
      top_n: 10,
      advancedTimeFrame: buildAdvancedTimeFramePayload(eff.advancedTimeFrame),
      _rev: effectiveAppliedRev,
    } as TimeseriesRequest & { _rev: number };
  }, [
    cfg,
    hasMetrics,
    hasBeenApplied,
    inheritsTime,
    inheritsScope,
    gFrom,
    gTo,
    gGrain,
    gAdvancedTimeFrame,
    gTechnos,
    gFilters,
    effectiveAppliedRev,
  ]);

  useEffect(() => {
    if (request) {
      console.log('[PA Chart] ▶ POST /monitor/query/timeseries', request);
    }
  }, [request]);

  const { data: tsResp, isFetching, error } = useTimeseriesQuery(request);

  useEffect(() => {
    if (tsResp) {
      console.log('[PA Chart] ◀ response', {
        points: tsResp.series?.length ?? 0,
        meta: tsResp.meta,
      });
    }
    if (error) console.warn('[PA Chart] ✖ error', error);
  }, [tsResp, error]);

  // When split_by is active, expand each metric into one virtual series per
  // split_value (e.g. one line per BAND). The expanded metrics share the
  // parent's style but get a distinct color from a deterministic palette and
  // a "<alias> · <split_value>" label, plus a stable derived id used as the
  // seriesByMetric key.
  const SPLIT_PALETTE = [
    '#00685f', '#6bd8cb', '#f59e0b', '#ef4444', '#8b5cf6',
    '#3b82f6', '#10b981', '#ec4899', '#14b8a6', '#f97316',
    '#6366f1', '#84cc16',
  ];

  const { seriesByMetric, xAxisLabels, expandedMetrics } = useMemo(() => {
    const empty = {
      seriesByMetric: {} as Record<string, { time: string; value: number }[]>,
      xAxisLabels: [] as string[],
      expandedMetrics: cfg?.metrics ?? [],
    };
    if (!tsResp || !cfg || !tsResp.series || tsResp.series.length === 0) return empty;

    const tsSet = new Set<string>();
    tsResp.series.forEach(p => tsSet.add(p.ts));
    const labels = Array.from(tsSet).sort();

    const out: Record<string, { time: string; value: number }[]> = {};
    const expanded: typeof cfg.metrics = [];

    cfg.metrics.forEach(m => {
      const points = tsResp.series.filter(p => p.kpi_key === m.kpiKey);
      const splitActive = !!m.splitBy && m.splitBy !== '__none__';
      console.log('[PA Chart Split]', { kpi: m.kpiKey, splitBy: m.splitBy, splitActive, points: points.length, splits: [...new Set(points.map(p => p.split_value).filter(Boolean))] });

      if (!splitActive) {
        const byTs = new Map(points.map(p => [p.ts, p.value]));
        out[m.id] = labels.map(t => ({ time: shortLabel(t), value: byTs.get(t) ?? 0 }));
        expanded.push(m);
        return;
      }

      // Group points by split_value
      const bySplit = new Map<string, typeof points>();
      points.forEach(p => {
        const sv = p.split_value || '∅';
        if (!bySplit.has(sv)) bySplit.set(sv, []);
        bySplit.get(sv)!.push(p);
      });

      // Stable order: alphabetical
      const splitValues = Array.from(bySplit.keys()).sort();

      splitValues.forEach((sv, idx) => {
        const seriesId = `${m.id}::${sv}`;
        const seriesPts = bySplit.get(sv)!;
        const byTs = new Map(seriesPts.map(p => [p.ts, p.value]));
        out[seriesId] = labels.map(t => ({ time: shortLabel(t), value: byTs.get(t) ?? 0 }));
        expanded.push({
          ...m,
          id: seriesId,
          alias: `${m.alias || m.kpiKey} · ${sv}`,
          color: SPLIT_PALETTE[idx % SPLIT_PALETTE.length],
        });
      });
    });

    return {
      seriesByMetric: out,
      xAxisLabels: labels.map(shortLabel),
      expandedMetrics: expanded,
    };
  }, [tsResp, cfg]);

  // Build the config passed to PAEChart with potentially expanded metrics.
  //
  // VISUAL-ONLY OVERLAY (apply-only contract — render-only options bypass Apply):
  //   Chart-type / per-metric graphType / smoothing / fill / line width /
  //   stacked / legend etc. are PURELY VISUAL. They must update the preview
  //   instantly without triggering a re-fetch. Since the data layer (request
  //   payload) only depends on `appliedConfig`, we safely overlay the live
  //   `w.config` STYLE block + per-metric VISUAL fields on top of the applied
  //   snapshot used for rendering. Data-related fields (kpiKey, splitBy,
  //   filters, time range, granularity) keep coming from `appliedConfig`.
  const liveCfg = w.config as ChartWidgetConfig | undefined;
  const renderCfg = useMemo(() => {
    if (!cfg) return cfg;
    const base = expandedMetrics === cfg.metrics ? cfg : { ...cfg, metrics: expandedMetrics };
    if (!liveCfg) return base;

    // Merge live STYLE (chartType, stacked, smooth, legend, background, etc.)
    const mergedStyle = { ...base.style, ...liveCfg.style };

    // Merge live per-metric VISUAL fields keyed by kpiKey (handles split-expanded
    // ids like "<id>::<splitValue>" by matching on kpiKey).
    const VISUAL_KEYS: (keyof typeof base.metrics[number])[] = [
      'graphType', 'color', 'lineWidth', 'lineStyle', 'fillStyle',
      'showSymbol', 'symbolSize', 'smooth', 'opacity', 'visible', 'alias',
    ] as any;
    const liveByKpi = new Map<string, any>();
    liveCfg.metrics?.forEach(m => {
      if (m.kpiKey && !liveByKpi.has(m.kpiKey)) liveByKpi.set(m.kpiKey, m);
    });
    const mergedMetrics = base.metrics.map(m => {
      const live = liveByKpi.get((m as any).kpiKey);
      if (!live) return m;
      const overlay: any = {};
      VISUAL_KEYS.forEach(k => {
        if (live[k] !== undefined) overlay[k] = live[k];
      });
      // Preserve split-expanded color (assigned per split_value) — only
      // adopt live color when the metric is NOT a split-expanded one.
      const isSplitExpanded = typeof (m as any).id === 'string' && (m as any).id.includes('::');
      if (isSplitExpanded) delete overlay.color;
      return { ...m, ...overlay };
    });

    return { ...base, style: mergedStyle, metrics: mergedMetrics };
  }, [cfg, expandedMetrics, liveCfg]);

  // Distinguish backend error vs empty perimeter
  const backendError = (() => {
    if (error) return (error as any)?.message || 'Erreur backend';
    const metaErr = (tsResp as any)?.meta?.error;
    if (metaErr && typeof metaErr === 'string') return metaErr;
    return null;
  })();
  const hasNoData = !isFetching && !backendError && hasBeenApplied && tsResp && (!tsResp.series || tsResp.series.length === 0);

  return (
    <div className="relative w-full h-full">
      <PAEChart
        variant="editor"
        height="100%"
        config={renderCfg}
        appliedRev={effectiveAppliedRev}
        seriesByMetric={seriesByMetric}
        xAxisLabels={xAxisLabels.length > 0 ? xAxisLabels : undefined}
        loading={isFetching}
        hasExistingData={!!tsResp}
      />
      {backendError && !isFetching && (
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
          <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-4 py-3 max-w-md text-center pointer-events-auto">
            <div className="text-xs font-bold uppercase tracking-wider mb-1">⚠ Erreur backend</div>
            <div className="text-xs opacity-80 break-words">{backendError}</div>
            <div className="text-[10px] opacity-60 mt-1">Réessayez dans 30 s (cold-start probable)</div>
          </div>
        </div>
      )}
    </div>
  );
}

function shortLabel(ts: string): string {
  // "2026-04-13T12:30:00" → "04-13 12:30"; "2026-04-13" → "04-13"
  const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return ts;
  const [, , mo, d, hh, mm] = m;
  return hh ? `${mo}-${d} ${hh}:${mm}` : `${mo}-${d}`;
}
