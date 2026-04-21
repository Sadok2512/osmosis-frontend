import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { DynWidget, DEFAULT_STAT_CONFIG } from '../types';
import { usePAGlobalToolbar } from '../stores/paGlobalToolbarStore';
import { fetchTimeseries, MonitorFilter } from '@/components/kpi-monitor/api/kpiMonitorApi';
import { toBackendDimension } from '../lib/monitorDimensions';

interface Props {
  widget: DynWidget;
}

/**
 * KPI Stat Card — fetches a single KPI aggregated over the full period.
 * No granularity — computes one value (avg/sum/min/max) across all data points.
 */
export default function PAStatWidget({ widget }: Props) {
  const cfg = widget.statConfig ?? DEFAULT_STAT_CONFIG;
  const accent = cfg.accentColor || 'hsl(var(--primary))';
  const global = usePAGlobalToolbar();
  const [computedValue, setComputedValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const hasKpi = !!cfg.kpiKey;
  const widgetRev = widget.appliedRev ?? 0;
  const hasBeenApplied = widgetRev > 0 || global.appliedRev > 0;

  // Fetch KPI value from backend — aggregate over full period
  useEffect(() => {
    if (!hasKpi || !hasBeenApplied) return;
    let cancelled = false;

    const snap = global.applied;
    const gFrom = snap?.from ?? global.from;
    const gTo = snap?.to ?? global.to;
    const gTechnos = snap?.technos ?? global.technos;
    const gFilters = snap?.filters ?? global.filters;

    // Build filters
    const byDim = new Map<string, string[]>();
    gFilters.forEach(f => {
      const dim = toBackendDimension(f.dimension);
      const arr = byDim.get(dim) ?? [];
      if (!arr.includes(f.value)) arr.push(f.value);
      byDim.set(dim, arr);
    });
    const filters: MonitorFilter[] = Array.from(byDim.entries()).map(([dimension, values]) => ({
      dimension, op: 'IN' as const, values,
    }));
    const ALL_TECHS = new Set(['2g', '3g', '4g', '5g']);
    const selected = (gTechnos || []).map(t => t.toLowerCase());
    const allSelected = selected.length >= 4 && selected.every(t => ALL_TECHS.has(t));
    if (selected.length > 0 && !allSelected) {
      filters.push({ dimension: toBackendDimension('Techno'), op: 'IN', values: selected.map(t => t.toUpperCase()) });
    }

    setLoading(true);
    fetchTimeseries({
      date_from: gFrom.split('T')[0],
      date_to: gTo.split('T')[0],
      granularity: '1d',
      filters,
      selections: [{ kpi_key: cfg.kpiKey! }],
      split_by: null,
      top_n: 1,
    })
      .then(resp => {
        if (cancelled) return;
        const values = (resp.series || [])
          .map(p => p.value)
          .filter((v): v is number => v != null && Number.isFinite(v));
        if (values.length === 0) {
          setComputedValue(null);
          return;
        }
        const agg = cfg.aggregation || 'avg';
        let result: number;
        if (agg === 'sum') result = values.reduce((a, b) => a + b, 0);
        else if (agg === 'min') result = Math.min(...values);
        else if (agg === 'max') result = Math.max(...values);
        else if (agg === 'last') result = values[values.length - 1];
        else result = values.reduce((a, b) => a + b, 0) / values.length;
        setComputedValue(result);
      })
      .catch(() => { if (!cancelled) setComputedValue(null); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [hasKpi, hasBeenApplied, cfg.kpiKey, cfg.aggregation, widgetRev, global.appliedRev,
      global.from, global.to, global.technos, global.filters, global.applied]);

  // Display value: backend-computed or manual
  const displayValue = hasKpi && computedValue != null
    ? formatStat(computedValue, cfg.unit)
    : cfg.value || '—';

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
        {cfg.label || cfg.kpiKey || 'Label'}
      </span>

      <div className="flex items-baseline gap-2">
        <span className="text-5xl font-black font-headline tracking-tighter leading-none">
          {displayValue}
        </span>
        {cfg.unit && (
          <span className="text-base font-medium opacity-60">{cfg.unit}</span>
        )}
      </div>

      {hasKpi && computedValue == null && !loading && hasBeenApplied && (
        <span className="text-[9px] text-on-surface-variant/50 mt-2">No data for this period</span>
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
