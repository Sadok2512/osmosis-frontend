import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { generateTimeSlots, mergeTimeSlots } from '@/lib/timeSlots';
import { getApiUrl, getApiHeaders, fetchVpsWithRetry } from '@/lib/apiConfig';
import { BarChart3, Plus, X, RefreshCw, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import CounterSelectorModal from './CounterSelectorModal';
import { useInvestigatorStore } from '@/stores/investigatorStore';
import { normalizeGranularity } from './types';
import {
  PA_PALETTE,
  paLegend,
  paEstimateLegendRows,
  paTooltip,
  paXAxis,
  paYAxis,
  paGrid,
  paLineSeries,
  paShortenLabel,
} from './paChartStyle';

interface CounterDef {
  counter_name: string;
  display_name: string;
  family: string;
  vendor: string;
  techno: string;
  object_type: string;
  object_type_normalized?: string;
  dimension_type?: string | null;
  dimension_prefix?: string | null;
  is_in_kpi?: boolean;
  kpi_usage_count?: number;
  count: number;
}

interface CounterPoint {
  ts: string;
  counter: string;
  value: number;
}

// PA palette — diverse colors so each counter is immediately distinguishable
const COLORS = PA_PALETTE;


async function fetchCounterCatalog(): Promise<CounterDef[]> {
  try {
    const res = await fetchVpsWithRetry(getApiUrl('pm/counters/catalog'), { headers: getApiHeaders() });
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

async function fetchCounterTimeseries(counterNames: string[], dateFrom: string, dateTo: string, granularity: string = '1d', splitByDimension: boolean = false): Promise<CounterPoint[]> {
  try {
    const res = await fetch(getApiUrl('pm/counters/timeseries'), {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ counter_names: counterNames, date_from: dateFrom, date_to: dateTo, granularity, split_by_dimension: splitByDimension }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.series || [];
  } catch { return []; }
}

const DIMENSIONAL_TYPES = ['CELL_PMQAP', 'CELL_NEIGHBOR', 'CELL_CA_REL'];

interface Props {
  dateFrom: string;
  dateTo: string;
}

const DIMENSION_LABELS: Record<string, string> = {
  PMQAP: 'QCI Profile (PMQAP)',
  NEIGHBOR: 'Neighbor Cell',
  CA_REL: 'CA Relation',
  RANSHARE: 'RAN Sharing (PLMN)',
  SLICE: 'Network Slice (NSSAI)',
  '5QI': '5QI Slice (NR)',
  TRANSPORT: 'Transport Link',
  FLEX: 'Flex Counter',
};

const CounterGraphSection: React.FC<Props> = ({ dateFrom, dateTo }) => {
  const globalGran = useInvestigatorStore(s => normalizeGranularity(s.state.granularity));
  const perimeterVendor = useInvestigatorStore(s => s.state.filters?.['Vendor'] || []);
  const perimeterTechno = useInvestigatorStore(s => s.state.filters?.['Technology'] || []);
  const [catalog, setCatalog] = React.useState<CounterDef[]>([]);
  const [selectedCounters, setSelectedCounters] = React.useState<CounterDef[]>([]);
  const [tsData, setTsData] = React.useState<CounterPoint[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectorOpen, setSelectorOpen] = React.useState(false);
  const [splitByDimension, setSplitByDimension] = React.useState<string>(''); // '' = no split, or dimension_type like 'PMQAP'
  const [dimensionFilter, setDimensionFilter] = React.useState<string[]>([]);
  const [dimensionValues, setDimensionValues] = React.useState<{ value: string; label: string }[]>([]);
  const [loadingDimValues, setLoadingDimValues] = React.useState(false);

  // Detect if selected counters have dimensions
  const selectedDimensions = useMemo(() => {
    const dims = new Set<string>();
    for (const c of selectedCounters) {
      if (c.dimension_type) dims.add(c.dimension_type);
    }
    return dims;
  }, [selectedCounters]);

  const hasDimensionalCounters = selectedDimensions.size > 0;
  const primaryDimension = hasDimensionalCounters ? Array.from(selectedDimensions)[0] : null;
  const primaryPrefix = primaryDimension ? selectedCounters.find(c => c.dimension_type === primaryDimension)?.dimension_prefix || '' : '';

  // Load catalog
  React.useEffect(() => {
    fetchCounterCatalog().then(setCatalog);
  }, []);

  // Reset dimension filter and load values when dimension type changes
  React.useEffect(() => {
    setDimensionFilter([]);
    setDimensionValues([]);
    if (!primaryDimension) return;
    setLoadingDimValues(true);
    fetch(getApiUrl(`pm/counters/dimension-values?dimension_type=${primaryDimension}&limit=50`), { headers: getApiHeaders() })
      .then(r => r.ok ? r.json() : { labeled_values: [] })
      .then(data => { setDimensionValues(data.labeled_values || (data.values || []).map((v: string) => ({ value: v, label: v }))); setLoadingDimValues(false); })
      .catch(() => setLoadingDimValues(false));
  }, [primaryDimension]);

  // Fetch timeseries when selection changes
  React.useEffect(() => {
    if (selectedCounters.length === 0) { setTsData([]); return; }
    setLoading(true);
    const body: any = {
      counter_names: selectedCounters.map(c => c.counter_name),
      date_from: dateFrom,
      date_to: dateTo,
      granularity: globalGran,
      split_by_dimension: !!splitByDimension,
    };
    if (dimensionFilter.length > 0) body.dimension_filter = dimensionFilter;

    fetch(getApiUrl('pm/counters/timeseries'), {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(body),
    }).then(r => r.ok ? r.json() : { series: [] }).then(data => {
      setTsData(data.series || []);
      setLoading(false);
    }).catch(() => { setTsData([]); setLoading(false); });
  }, [selectedCounters.map(c => c.counter_name).join(','), dateFrom, dateTo, globalGran, splitByDimension, dimensionFilter.join(',')]);

  const removeCounter = (name: string) => {
    setSelectedCounters(prev => prev.filter(c => c.counter_name !== name));
  };

  // Build name lookup: counter_name (ID) → display_name
  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of selectedCounters) {
      if (c.display_name && c.display_name !== c.counter_name) m.set(c.counter_name, c.display_name);
    }
    return m;
  }, [selectedCounters]);
  const displayName = (id: string) => nameMap.get(id) || id;

  // Build chart
  const counters = [...new Set(tsData.map(d => d.counter))];
  const dataTs = [...new Set(tsData.map(d => d.ts))].sort();
  const timestamps = dateFrom && dateTo
    ? mergeTimeSlots(generateTimeSlots(dateFrom, dateTo, globalGran), dataTs)
    : dataTs;

  const chartOption = useMemo(() => {
    if (tsData.length === 0) return null;
    const legendLabels = counters.map((c) => displayName(c));
    const legendRows = paEstimateLegendRows(legendLabels);
    const unitByName = new Map<string, string>();
    legendLabels.forEach((n) => unitByName.set(n, ''));
    return {
      animationDuration: 900,
      animationEasing: 'cubicOut' as const,
      backgroundColor: 'transparent',
      grid: paGrid({
        legendRows,
        legendPos: 'bottom',
        hasRightAxis: false,
        hasBarSeries: false,
        showLegend: legendLabels.length > 0,
      }),
      legend: paLegend({ show: legendLabels.length > 0, data: legendLabels, position: 'bottom' }),
      tooltip: paTooltip({ unitByName }),
      xAxis: paXAxis({
        data: timestamps.map((t) => t.slice(0, 10)),
        boundaryGap: false,
      }),
      yAxis: [
        paYAxis({
          position: 'left',
          isDualAxis: false,
          showGrid: true,
        }),
      ],
      series: counters.map((counter, i) => {
        const color = COLORS[i % COLORS.length];
        const data = timestamps.map((ts) => {
          const point = tsData.find(
            (d) => d.ts === ts && (d.counter === counter || (d as any).counter_id === counter)
          );
          return point ? point.value : null;
        });
        return paLineSeries({
          name: displayName(counter),
          color,
          data,
          smooth: true,
          showArea: true,
          lineWidth: 2.5,
        });
      }),
    };
  }, [tsData, counters, timestamps]);


  return (
    <section className="space-y-4">
      {/* Selected counter pills + Add button */}
      <div className="flex items-center gap-2 flex-wrap">
        {selectedCounters.map((c, i) => (
            <div key={c.counter_name} className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg text-[10px] font-bold border border-border/50 bg-card shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span>{c.display_name && c.display_name !== c.counter_name ? c.display_name : c.counter_name}</span>
              {c.dimension_type && <span className="text-[8px] text-amber-600 font-normal px-1 py-0.5 rounded bg-amber-500/10">{c.dimension_type}</span>}
              <span className="text-[8px] text-muted-foreground font-normal px-1 py-0.5 rounded bg-muted">{c.family}</span>
              <button onClick={() => removeCounter(c.counter_name)} className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </div>
        ))}
        <button
          onClick={() => setSelectorOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-dashed border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> Add Counter
        </button>
        {hasDimensionalCounters && (
          <>
            <select
              value={splitByDimension}
              onChange={e => setSplitByDimension(e.target.value)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all",
                splitByDimension
                  ? "bg-orange-500/15 text-orange-500 border border-orange-500/30"
                  : "border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/30"
              )}
            >
              <option value="">No Split</option>
              {Array.from(selectedDimensions).map(d => (
                <option key={d} value={d}>{DIMENSION_LABELS[d] || d}</option>
              ))}
            </select>
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <span className="text-[9px] font-bold text-amber-600 whitespace-nowrap">{DIMENSION_LABELS[primaryDimension!] || primaryDimension}</span>
              <div className="relative">
                <div className="px-1.5 py-0.5 text-[10px] rounded border border-border bg-background min-w-[180px] max-w-[280px] max-h-[120px] overflow-y-auto">
                  {dimensionValues.length === 0 && <span className="text-muted-foreground">No dimensions</span>}
                  {dimensionValues.map(v => (
                    <label key={v.value} className="flex items-center gap-1.5 py-0.5 cursor-pointer hover:bg-muted/30 px-1 rounded">
                      <input
                        type="checkbox"
                        checked={dimensionFilter.includes(v.value)}
                        onChange={() => setDimensionFilter(prev =>
                          prev.includes(v.value) ? prev.filter(x => x !== v.value) : [...prev, v.value]
                        )}
                        className="w-3 h-3 rounded"
                      />
                      <span className="truncate">{v.label}</span>
                    </label>
                  ))}
                </div>
                {dimensionFilter.length > 0 && (
                  <button onClick={() => setDimensionFilter([])} className="absolute top-0 right-0 p-0.5 text-[8px] text-muted-foreground hover:text-destructive">
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
              {loadingDimValues && <span className="text-[9px] text-muted-foreground animate-pulse">...</span>}
            </div>
          </>
        )}
        {selectedCounters.length === 0 && (
          <span className="text-[10px] text-muted-foreground ml-1">Select counters to visualize raw PM data</span>
        )}
      </div>

      {/* Counter Chart */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-xs gap-2 rounded-xl border border-border/60 bg-card">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading counter data...
        </div>
      ) : chartOption ? (
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <ReactECharts option={chartOption} style={{ height: 300 }} />
        </div>
      ) : selectedCounters.length > 0 ? (
        <div className="rounded-xl border border-border/60 bg-card p-8 text-center text-xs text-muted-foreground">
          No counter data available for the selected date range
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 bg-card/50 p-10 text-center">
          <Cpu className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-xs text-muted-foreground font-medium">Click <strong>"Add Counter"</strong> to select PM counters and view timeseries</p>
          <p className="text-[10px] text-muted-foreground mt-1">{catalog.length} counters available</p>
        </div>
      )}

      {/* Counter Selector Modal */}
      <CounterSelectorModal
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        catalog={catalog}
        selectedKeys={selectedCounters.map(c => c.counter_name)}
        onConfirm={(keys: string[]) => {
          const resolved = keys.map(k => catalog.find(c => c.counter_name === k)).filter((c): c is CounterDef => !!c);
          setSelectedCounters(resolved);
        }}
        perimeterVendor={perimeterVendor}
        perimeterTechno={perimeterTechno}
      />
    </section>
  );
};

export default CounterGraphSection;
