import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Type, Palette,
} from 'lucide-react';
import { DynWidget, ChartWidgetConfig } from '../types';
import PAEChart from './PAEChart';
import PAMapWidget from './PAMapWidget';
import PATableWidget from './PATableWidget';
import { useTimeseriesQuery, TimeseriesRequest, MonitorFilter } from '@/components/kpi-monitor/api/kpiMonitorApi';
import { usePAGlobalToolbar } from '../stores/paGlobalToolbarStore';

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
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-2 widget-drag-handle cursor-move">
          <h3 className="text-sm font-black text-on-surface font-headline">{w.title ?? 'Map'}</h3>
          <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Geo sites</span>
        </div>
        <div className="flex-1 min-h-0">
          <PAMapWidget height="100%" />
        </div>
      </div>
    );
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
  const cfg: ChartWidgetConfig | undefined = (w.appliedRev ?? 0) > 0
    ? (w.appliedConfig ?? w.config)
    : w.config;
  const hasMetrics = !!cfg && cfg.metrics.some((metric) => metric.visible !== false);

  // Global report-level toolbar (top of editor) — inherited by default.
  const global = usePAGlobalToolbar();

  // Resolve effective time/filter source: global if widget inherits, else per-widget config.
  const inheritsTime = cfg?.data.timeRange?.inherit !== false; // default true
  const inheritsScope = cfg?.data.inheritFromDashboard !== false; // default true

  // Apply trigger: if inheriting, react to the global Apply; else to the widget's own Apply.
  const effectiveAppliedRev = inheritsTime || inheritsScope
    ? Math.max(w.appliedRev ?? 0, global.appliedRev)
    : (w.appliedRev ?? 0);
  const hasBeenApplied = effectiveAppliedRev > 0;

  const request: TimeseriesRequest | null = useMemo(() => {
    if (!cfg || !hasMetrics || !hasBeenApplied) return null;

    // Pick effective values from global toolbar OR per-widget overrides
    const eff = {
      from: inheritsTime ? global.from : cfg.data.timeRange.from,
      to: inheritsTime ? global.to : cfg.data.timeRange.to,
      granularity: inheritsTime ? global.grain : cfg.data.granularity,
      technos: inheritsScope ? global.technos : cfg.data.technos,
      filters: inheritsScope ? global.filters : cfg.data.filters,
    };

    // ── 1. Filters (chip[] → IN clauses, dimension uppercased like Investigator) ──
    const byDim = new Map<string, string[]>();
    eff.filters.forEach(f => {
      const dim = f.dimension.toUpperCase();
      const arr = byDim.get(dim) ?? [];
      if (!arr.includes(f.value)) arr.push(f.value);
      byDim.set(dim, arr);
    });
    const filters: MonitorFilter[] = Array.from(byDim.entries()).map(([dimension, values]) => ({
      dimension,
      op: 'IN' as const,
      values,
    }));

    // ── 2. Technology perimeter chips (4G/5G…) → TECHNOLOGY filter, but only if not "all selected" ──
    const ALL_TECHS = new Set(['2g', '3g', '4g', '5g']);
    const selectedTechs = (eff.technos || []).map(t => t.toLowerCase());
    const allSelected = selectedTechs.length >= 4 && selectedTechs.every(t => ALL_TECHS.has(t));
    if (selectedTechs.length > 0 && !allSelected) {
      filters.push({
        dimension: 'TECHNOLOGY',
        op: 'IN',
        values: selectedTechs.map(t => t.toUpperCase()),
      });
    }

    // ── 3. Granularity normalization ──
    const grainMap: Record<string, string> = {
      'auto': '1h', '5min': '5min', '15min': '15min', '30min': '15min', '1h': '1h', '1d': '1d',
    };
    const granularity = grainMap[eff.granularity] ?? '1h';

    // ── 4. Date normalization ──
    const normalizeDate = (raw: string): string => {
      if (!raw) return raw;
      if (granularity === '1d') return raw.split('T')[0];
      if (/T\d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
      if (/T\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;
      if (!raw.includes('T')) return `${raw}T00:00:00`;
      return raw;
    };

    return {
      date_from: normalizeDate(eff.from),
      date_to: normalizeDate(eff.to),
      granularity,
      filters,
      selections: cfg.metrics.filter(m => m.visible !== false).map(m => ({
        kpi_key: m.kpiKey,
        axis: m.axis,
      })),
      split_by: null,
      top_n: 10,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveAppliedRev]);

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

  const { seriesByMetric, xAxisLabels } = useMemo(() => {
    const empty = { seriesByMetric: {} as Record<string, { time: string; value: number }[]>, xAxisLabels: [] as string[] };
    if (!tsResp || !cfg || !tsResp.series || tsResp.series.length === 0) return empty;

    const tsSet = new Set<string>();
    tsResp.series.forEach(p => tsSet.add(p.ts));
    const labels = Array.from(tsSet).sort();

    const out: Record<string, { time: string; value: number }[]> = {};
    cfg.metrics.forEach(m => {
      const points = tsResp.series.filter(p => p.kpi_key === m.kpiKey);
      const byTs = new Map(points.map(p => [p.ts, p.value]));
      out[m.id] = labels.map(t => ({ time: shortLabel(t), value: byTs.get(t) ?? 0 }));
    });
    return { seriesByMetric: out, xAxisLabels: labels.map(shortLabel) };
  }, [tsResp, cfg]);

  return (
    <PAEChart
      variant="editor"
      height="100%"
      config={cfg}
      appliedRev={effectiveAppliedRev}
      seriesByMetric={seriesByMetric}
      xAxisLabels={xAxisLabels.length > 0 ? xAxisLabels : undefined}
      loading={isFetching}
    />
  );
}

function shortLabel(ts: string): string {
  // "2026-04-13T12:30:00" → "04-13 12:30"; "2026-04-13" → "04-13"
  const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return ts;
  const [, , mo, d, hh, mm] = m;
  return hh ? `${mo}-${d} ${hh}:${mm}` : `${mo}-${d}`;
}
