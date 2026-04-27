import { useEffect, useState, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { DynWidget, DEFAULT_STAT_CONFIG, StatKpiItem } from '../types';
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

interface KpiResult {
  value: number | null;
  loading: boolean;
  error: 'no_data' | 'unavailable' | null;
}

/**
 * Multi-KPI Stat Card. Renders one big number when a single KPI is selected,
 * or a responsive grid when multiple KPIs are configured.
 */
export default function PAStatWidget({ widget }: Props) {
  const cfg = widget.statConfig ?? DEFAULT_STAT_CONFIG;
  const accent = cfg.accentColor || 'hsl(var(--primary))';
  const global = usePAGlobalToolbar();
  const [periodLabel, setPeriodLabel] = useState<string>('');
  const [results, setResults] = useState<Record<string, KpiResult>>({});

  // Resolve list of KPIs: prefer cfg.kpis (multi); fall back to legacy single key.
  const chartCfgKpi = widget.appliedConfig?.metrics?.[0]?.kpiKey
    ?? widget.config?.metrics?.[0]?.kpiKey;
  const kpiItems: StatKpiItem[] = useMemo(() => {
    if (Array.isArray(cfg.kpis) && cfg.kpis.length > 0) {
      return cfg.kpis.filter(k => !!k.kpiKey);
    }
    const legacy = chartCfgKpi || cfg.kpiKey;
    return legacy ? [{ kpiKey: legacy, label: cfg.label, unit: cfg.unit }] : [];
  }, [cfg.kpis, cfg.kpiKey, cfg.label, cfg.unit, chartCfgKpi]);

  const hasKpis = kpiItems.length > 0;
  const widgetRev = widget.appliedRev ?? 0;
  const hasBeenApplied = widgetRev > 0 || global.appliedRev > 0;

  const { data: kpiCatalog } = useKpiCatalog();

  // Frozen snapshot — applied state.
  const snap = global.applied;
  const gFrom = snap?.from ?? global.from;
  const gTo = snap?.to ?? global.to;
  const gTechnos = snap?.technos ?? global.technos;
  const gFilters = snap?.filters ?? global.filters;
  const gAdvancedTimeFrame = snap?.advancedTimeFrame ?? global.advancedTimeFrame;

  const widgetCfg = widget.appliedConfig ?? widget.config;
  const inheritsTime = widgetCfg?.data?.timeRange?.inherit !== false
                       && widgetCfg?.data?.inheritFromDashboard !== false;
  const inheritsScope = widgetCfg?.data?.inheritFromDashboard !== false;
  const effFrom = inheritsTime ? gFrom : (widgetCfg?.data?.timeRange?.from ?? gFrom);
  const effTo = inheritsTime ? gTo : (widgetCfg?.data?.timeRange?.to ?? gTo);
  const effFilters = inheritsScope ? gFilters : (widgetCfg?.data?.filters ?? gFilters);
  const effTechnos = inheritsScope ? gTechnos : (widgetCfg?.data?.technos ?? gTechnos);

  const appliedSig = snap
    ? `${snap.from}|${snap.to}|${snap.grain}|${JSON.stringify(snap.advancedTimeFrame)}|${snap.technos.join(',')}|${snap.filters.map(f => `${f.dimension}=${f.value}`).join(';')}`
    : '';
  const kpiKeysSig = kpiItems.map(k => k.kpiKey).join('|');

  useEffect(() => {
    if (!hasKpis || !hasBeenApplied) return;
    let cancelled = false;

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

    const dateFrom = normalizeBackendDateTime(effFrom);
    const dateTo = normalizeBackendDateTime(effTo);
    setPeriodLabel(`${dateFrom.split('T')[0] ?? ''} → ${dateTo.split('T')[0] ?? ''}`);

    // Mark all KPIs as loading
    setResults(prev => {
      const next: Record<string, KpiResult> = {};
      kpiItems.forEach(k => { next[k.kpiKey] = { value: null, loading: true, error: null }; });
      return next;
    });

    // Fetch each KPI sequentially-batched (single request per KPI).
    kpiItems.forEach((item) => {
      const meta = (kpiCatalog || []).find(k => k.kpi_key === item.kpiKey);
      const aggMode: 'avg' | 'sum' = meta?.formula_type === 'volume' ? 'sum' : 'avg';
      const selections: TimeseriesSelection[] = [{ kpi_key: item.kpiKey }];

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
          if ((resp as any)?.unavailable || (resp as any)?.error) {
            setResults(prev => ({ ...prev, [item.kpiKey]: { value: null, loading: false, error: 'unavailable' } }));
            return;
          }
          const points = Array.isArray(resp?.series) ? resp.series : [];
          const values = points.map(p => Number(p.value)).filter(v => Number.isFinite(v));
          if (values.length === 0) {
            setResults(prev => ({ ...prev, [item.kpiKey]: { value: null, loading: false, error: 'no_data' } }));
            return;
          }
          const aggregated = aggMode === 'sum'
            ? values.reduce((a, b) => a + b, 0)
            : values.reduce((a, b) => a + b, 0) / values.length;
          setResults(prev => ({ ...prev, [item.kpiKey]: { value: aggregated, loading: false, error: null } }));
        })
        .catch(() => {
          if (cancelled) return;
          setResults(prev => ({ ...prev, [item.kpiKey]: { value: null, loading: false, error: 'unavailable' } }));
        });
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasKpis, hasBeenApplied, kpiKeysSig, widgetRev, global.appliedRev, appliedSig, effFrom, effTo]);

  const themeClasses =
    cfg.theme === 'dark'
      ? 'bg-zinc-900 text-white border-white/10'
      : cfg.theme === 'glass'
      ? 'bg-white/60 backdrop-blur-xl text-on-surface border-white/40'
      : 'bg-white text-on-surface border-outline-variant/20';

  const isMulti = kpiItems.length > 1;
  const anyLoading = Object.values(results).some(r => r?.loading);

  return (
    <div
      className={`h-full w-full rounded-2xl border ${themeClasses} p-6 flex flex-col relative overflow-hidden shadow-sm`}
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

      {anyLoading && (
        <div className="absolute top-3 right-3">
          <Loader2 className="w-4 h-4 animate-spin opacity-50" />
        </div>
      )}

      {/* Optional global label above the grid for multi mode */}
      {isMulti && cfg.label && (
        <span
          className="text-[10px] font-black uppercase tracking-[0.25em] mb-3 opacity-70"
          style={{ color: cfg.theme === 'dark' ? accent : undefined }}
        >
          {cfg.label}
        </span>
      )}

      {!hasKpis && (
        <div className="flex-1 flex flex-col justify-center">
          <span className="text-[10px] font-black uppercase tracking-[0.25em] mb-3 opacity-70">
            Select a KPI
          </span>
          <span className="text-5xl font-black font-headline tracking-tighter leading-none opacity-30">—</span>
          <span className="text-[9px] text-on-surface-variant/50 mt-2">
            Pick one or more KPIs in settings to load backend values
          </span>
        </div>
      )}

      {hasKpis && !isMulti && (() => {
        // Single KPI — preserve original big-number layout
        const item = kpiItems[0];
        const r = results[item.kpiKey];
        const display = r?.value != null ? formatStat(r.value, item.unit || cfg.unit) : '—';
        return (
          <div className="flex-1 flex flex-col justify-center">
            <span
              className="text-[10px] font-black uppercase tracking-[0.25em] mb-3 opacity-70"
              style={{ color: cfg.theme === 'dark' ? accent : undefined }}
            >
              {item.label || cfg.label || item.kpiKey}
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black font-headline tracking-tighter leading-none">{display}</span>
              {(item.unit || cfg.unit) && r?.value != null && (
                <span className="text-base font-medium opacity-60">{item.unit || cfg.unit}</span>
              )}
            </div>
            {r?.value == null && !r?.loading && hasBeenApplied && r?.error === 'unavailable' && (
              <span className="text-[9px] text-destructive/80 mt-2">Backend unavailable</span>
            )}
            {r?.value == null && !r?.loading && hasBeenApplied && r?.error === 'no_data' && (
              <span className="text-[9px] text-on-surface-variant/50 mt-2">No data for this period</span>
            )}
            {!hasBeenApplied && (
              <span className="text-[9px] text-on-surface-variant/50 mt-2">Click Apply to load</span>
            )}
            {periodLabel && r?.value != null && (
              <span className="text-[9px] text-on-surface-variant/60 mt-2">
                Period aggregate · {periodLabel}
              </span>
            )}
          </div>
        );
      })()}

      {hasKpis && isMulti && (
        <div className="flex-1 flex flex-col">
          <div
            className="grid gap-3 flex-1"
            style={{
              gridTemplateColumns: `repeat(${Math.min(kpiItems.length, kpiItems.length <= 2 ? 2 : kpiItems.length <= 4 ? 2 : 3)}, minmax(0, 1fr))`,
            }}
          >
            {kpiItems.map((item) => {
              const r = results[item.kpiKey];
              const itemAccent = item.accentColor || accent;
              const display = r?.value != null ? formatStat(r.value, item.unit) : '—';
              const meta = (kpiCatalog || []).find(k => k.kpi_key === item.kpiKey);
              const itemLabel = item.label || meta?.display_name || item.kpiKey;
              const itemUnit = item.unit || meta?.unit || '';
              return (
                <div
                  key={item.kpiKey}
                  className={`rounded-xl p-3 flex flex-col justify-between border ${
                    cfg.theme === 'dark'
                      ? 'bg-white/5 border-white/10'
                      : cfg.theme === 'glass'
                      ? 'bg-white/40 border-white/30'
                      : 'bg-surface-container-low/50 border-outline-variant/15'
                  }`}
                  style={{ borderLeft: `2px solid ${itemAccent}` }}
                >
                  <span
                    className="text-[9px] font-black uppercase tracking-[0.18em] opacity-70 truncate"
                    style={{ color: cfg.theme === 'dark' ? itemAccent : undefined }}
                    title={itemLabel}
                  >
                    {itemLabel}
                  </span>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-headline tracking-tight leading-none">
                      {display}
                    </span>
                    {itemUnit && r?.value != null && (
                      <span className="text-[10px] font-medium opacity-60">{itemUnit}</span>
                    )}
                  </div>
                  {r?.value == null && !r?.loading && hasBeenApplied && (
                    <span className="text-[8px] opacity-50 mt-1">
                      {r?.error === 'unavailable' ? 'Unavailable' : 'No data'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {!hasBeenApplied && (
            <span className="text-[9px] text-on-surface-variant/50 mt-3">Click Apply to load</span>
          )}
          {periodLabel && hasBeenApplied && (
            <span className="text-[9px] text-on-surface-variant/60 mt-2">
              Period aggregate · {periodLabel}
            </span>
          )}
        </div>
      )}

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
