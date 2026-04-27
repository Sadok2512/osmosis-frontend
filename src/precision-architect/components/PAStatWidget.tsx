import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { DynWidget, DEFAULT_STAT_CONFIG } from '../types';
import { usePAGlobalToolbar } from '../stores/paGlobalToolbarStore';
import {
  fetchTimeseries,
  MonitorFilter,
  TimeseriesSelection,
  useKpiCatalog,
} from '@/components/kpi-monitor/api/kpiMonitorApi';
import { toBackendDimension } from '../lib/monitorDimensions';
import { buildAdvancedTimeFramePayload } from '../lib/advancedTimeFrame';

interface Props {
  widget: DynWidget;
}

function normalizeBackendDateTime(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(raw)) return raw.slice(0, 19);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 19);
}

/**
 * KPI Stat Card: fetches one backend summary value for the selected Reference Period.
 * No granularity is sent for STAT/KPI widgets.
 */
export default function PAStatWidget({ widget }: Props) {
  const cfg = widget.statConfig ?? DEFAULT_STAT_CONFIG;
  const accent = cfg.accentColor || 'hsl(var(--primary))';
  const global = usePAGlobalToolbar();
  const [computedValue, setComputedValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [periodLabel, setPeriodLabel] = useState<string>('');

  // KPI key sourced from the Chart-shaped widget.config (set by EditorView
  // when the Stat widget is created). Falls back to legacy statConfig.kpiKey
  // for widgets saved before the migration.
  const chartCfgKpi = widget.appliedConfig?.metrics?.[0]?.kpiKey
    ?? widget.config?.metrics?.[0]?.kpiKey;
  const effectiveKpiKey = chartCfgKpi || cfg.kpiKey;
  const hasKpi = !!effectiveKpiKey;
  const widgetRev = widget.appliedRev ?? 0;
  const hasBeenApplied = widgetRev > 0 || global.appliedRev > 0;

  // KPI metadata: drives aggregation strategy (avg for ratio/%, sum for volume).
  const { data: kpiCatalog } = useKpiCatalog();
  const kpiMeta = (kpiCatalog || []).find(k => k.kpi_key === effectiveKpiKey);
  const aggMode: 'avg' | 'sum' =
    kpiMeta?.formula_type === 'volume' ? 'sum' : 'avg';

  // Distinguish "endpoint missing/error" from "no data for period" so the
  // UX can hint the user about the right next step.
  const [errorKind, setErrorKind] = useState<null | 'no_data' | 'unavailable'>(null);

  // Read the FROZEN snapshot taken at the last global Apply click.
  // Editing the toolbar (date, period, filters) updates the live store
  // but NOT this snapshot, so the widget will not refetch until the user
  // explicitly clicks "Apply to Dashboard" or "Apply to Widget".
  const snap = global.applied;
  const gFrom = snap?.from ?? global.from;
  const gTo = snap?.to ?? global.to;
  const gTechnos = snap?.technos ?? global.technos;
  const gFilters = snap?.filters ?? global.filters;
  const gAdvancedTimeFrame = snap?.advancedTimeFrame ?? global.advancedTimeFrame;

  // Per-widget overrides (Chart-shape config). When the Stat widget is set
  // to "override" (inheritFromDashboard=false), use its own time/filters/
  // technos. Otherwise inherit the global frozen snapshot — same rule as
  // Graph widgets, so Stat values match the parent KPI graph 1:1.
  const widgetCfg = widget.appliedConfig ?? widget.config;
  const inheritsTime = widgetCfg?.data?.timeRange?.inherit !== false
                       && widgetCfg?.data?.inheritFromDashboard !== false;
  const inheritsScope = widgetCfg?.data?.inheritFromDashboard !== false;
  const effFrom = inheritsTime ? gFrom : (widgetCfg?.data?.timeRange?.from ?? gFrom);
  const effTo = inheritsTime ? gTo : (widgetCfg?.data?.timeRange?.to ?? gTo);
  const effFilters = inheritsScope ? gFilters : (widgetCfg?.data?.filters ?? gFilters);
  const effTechnos = inheritsScope ? gTechnos : (widgetCfg?.data?.technos ?? gTechnos);

  // Stable signature of the frozen snapshot — recomputed only at Apply time.
  const appliedSig = snap
    ? `${snap.from}|${snap.to}|${snap.grain}|${JSON.stringify(snap.advancedTimeFrame)}|${snap.technos.join(',')}|${snap.filters.map(f => `${f.dimension}=${f.value}`).join(';')}`
    : '';

  // Fetch KPI value from backend — aggregate over full period
  useEffect(() => {
    if (!hasKpi || !hasBeenApplied) return;
    let cancelled = false;

    // Build filters from effective filters (per-widget override OR global snapshot).
    const byDim = new Map<string, string[]>();
    effFilters.forEach(f => {
      const dim = toBackendDimension(f.dimension);
      const arr = byDim.get(dim) ?? [];
      if (!arr.includes(f.value)) arr.push(f.value);
      byDim.set(dim, arr);
    });
    const filters: MonitorFilter[] = Array.from(byDim.entries()).map(([dimension, values]) => ({
      dimension, op: 'IN' as const, values,
    }));
    const ALL_TECHS = new Set(['2g', '3g', '4g', '5g']);
    const selected = (effTechnos || []).map(t => t.toLowerCase());
    const allSelected = selected.length >= 4 && selected.every(t => ALL_TECHS.has(t));
    if (selected.length > 0 && !allSelected) {
      filters.push({ dimension: toBackendDimension('Techno'), op: 'IN', values: selected.map(t => t.toUpperCase()) });
    }

    setLoading(true);
    setErrorKind(null);
    const dateFrom = normalizeBackendDateTime(effFrom);
    const dateTo = normalizeBackendDateTime(effTo);
    setPeriodLabel(`${dateFrom.split('T')[0] ?? ''} → ${dateTo.split('T')[0] ?? ''}`);

    // Backend `/monitor/query/summary` is NOT deployed (returns 404 via proxy).
    // We hit the working `/monitor/query/timeseries` endpoint at `day` grain
    // and aggregate client-side: avg for ratios/%, sum for volumes.
    const selections: TimeseriesSelection[] = [{ kpi_key: effectiveKpiKey! }];
    fetchTimeseries({
      date_from: dateFrom,
      date_to: dateTo,
      granularity: 'day',
      filters,
      selections,
      split_by: null,
      top_n: 1,
      advancedTimeFrame: buildAdvancedTimeFramePayload(gAdvancedTimeFrame),
    })
      .then(resp => {
        if (cancelled) return;
        // Proxy fallback contract: { unavailable: true, ... }
        if ((resp as any)?.unavailable) {
          setComputedValue(null);
          setErrorKind('unavailable');
          return;
        }
        if ((resp as any)?.error) {
          setComputedValue(null);
          setErrorKind('unavailable');
          return;
        }
        const points = Array.isArray(resp?.series) ? resp.series : [];
        const values = points
          .map(p => Number(p.value))
          .filter(v => Number.isFinite(v));
        if (values.length === 0) {
          setComputedValue(null);
          setErrorKind('no_data');
          return;
        }
        const aggregated = aggMode === 'sum'
          ? values.reduce((a, b) => a + b, 0)
          : values.reduce((a, b) => a + b, 0) / values.length;
        setComputedValue(aggregated);
      })
      .catch(() => {
        if (!cancelled) {
          setComputedValue(null);
          setErrorKind('unavailable');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // IMPORTANT: deps must NOT include live global.from/to/technos/filters,
    // otherwise editing the toolbar would trigger a refetch before Apply.
    // appliedSig changes only when the user clicks Apply (snapshot bumped).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasKpi, hasBeenApplied, effectiveKpiKey, widgetRev, global.appliedRev, appliedSig, effFrom, effTo, aggMode]);

  // Display value: backend-computed only (no manual mock fallback)
  const displayValue = hasKpi && computedValue != null
    ? formatStat(computedValue, cfg.unit)
    : '—';

  const themeClasses =
    cfg.theme === 'dark'
      ? 'bg-zinc-900 text-white border-white/10'
      : cfg.theme === 'glass'
      ? 'bg-white/60 backdrop-blur-xl text-on-surface border-white/40'
      : 'bg-white text-on-surface border-outline-variant/20';

  return (
    <div
      className={`h-full w-full rounded-2xl border ${themeClasses} p-6 flex flex-col justify-center relative overflow-hidden shadow-sm`}
    >
      {cfg.showPulse && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
          />
          <span className="text-[9px] font-black uppercase tracking-widest opacity-70">Live</span>
        </div>
      )}

      {loading && (
        <div className="absolute top-3 right-3">
          <Loader2 className="w-4 h-4 animate-spin opacity-50" />
        </div>
      )}

      <span
        className="text-[10px] font-black uppercase tracking-[0.25em] mb-3 opacity-70"
        style={{ color: cfg.theme === 'dark' ? accent : undefined }}
      >
        {cfg.label || effectiveKpiKey || 'Select a KPI'}
      </span>

      <div className="flex items-baseline gap-2">
        <span className="text-5xl font-black font-headline tracking-tighter leading-none">
          {displayValue}
        </span>
        {cfg.unit && hasKpi && computedValue != null && (
          <span className="text-base font-medium opacity-60">{cfg.unit}</span>
        )}
      </div>

      {!hasKpi && (
        <span className="text-[9px] text-on-surface-variant/50 mt-2">
          Pick a KPI in settings to load a backend value
        </span>
      )}
      {hasKpi && computedValue == null && !loading && hasBeenApplied && errorKind === 'unavailable' && (
        <span className="text-[9px] text-destructive/80 mt-2">Backend unavailable</span>
      )}
      {hasKpi && computedValue == null && !loading && hasBeenApplied && errorKind !== 'unavailable' && (
        <span className="text-[9px] text-on-surface-variant/50 mt-2">No data for this period</span>
      )}
      {hasKpi && !hasBeenApplied && !loading && (
        <span className="text-[9px] text-on-surface-variant/50 mt-2">Click Apply to load</span>
      )}
      {hasKpi && periodLabel && computedValue != null && (
        <span className="text-[9px] text-on-surface-variant/60 mt-2">
          Period aggregate · {periodLabel}
        </span>
      )}

      {/* subtle accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
    </div>
  );
}

function formatStat(value: number, unit?: string): string {
  if (unit === '%') return value.toFixed(2);
  if (unit === 'Mbps' || unit === 'kbps') return value.toFixed(2);
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  if (Math.abs(value) < 0.01 && value !== 0) return value.toExponential(2);
  return value.toFixed(2);
}
