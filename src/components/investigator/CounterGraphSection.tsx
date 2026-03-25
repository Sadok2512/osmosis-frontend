import React from 'react';
import ReactECharts from 'echarts-for-react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { BarChart3, Plus, X, RefreshCw, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CounterDef {
  counter_name: string;
  family: string;
  count: number;
}

interface CounterPoint {
  ts: string;
  counter: string;
  value: number;
}

const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#ef4444','#84cc16','#6366f1','#14b8a6'];

async function fetchCounterCatalog(): Promise<CounterDef[]> {
  try {
    const res = await fetch(getApiUrl('pm/counters/catalog'), { headers: getApiHeaders() });
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

async function fetchCounterTimeseries(counterNames: string[], dateFrom: string, dateTo: string, granularity: string = '1d'): Promise<CounterPoint[]> {
  try {
    const res = await fetch(getApiUrl('pm/counters/timeseries'), {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ counter_names: counterNames, date_from: dateFrom, date_to: dateTo, granularity }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.series || [];
  } catch { return []; }
}

interface Props {
  dateFrom: string;
  dateTo: string;
}

const CounterGraphSection: React.FC<Props> = ({ dateFrom, dateTo }) => {
  const [catalog, setCatalog] = React.useState<CounterDef[]>([]);
  const [selectedCounters, setSelectedCounters] = React.useState<string[]>([]);
  const [tsData, setTsData] = React.useState<CounterPoint[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [showSelector, setShowSelector] = React.useState(false);
  const [search, setSearch] = React.useState('');

  // Load catalog
  React.useEffect(() => {
    fetchCounterCatalog().then(setCatalog);
  }, []);

  // Auto-select first 3 counters
  React.useEffect(() => {
    if (catalog.length > 0 && selectedCounters.length === 0) {
      setSelectedCounters(catalog.slice(0, 3).map(c => c.counter_name));
    }
  }, [catalog]);

  // Fetch timeseries when selection changes
  React.useEffect(() => {
    if (selectedCounters.length === 0) { setTsData([]); return; }
    setLoading(true);
    fetchCounterTimeseries(selectedCounters, dateFrom, dateTo).then(data => {
      setTsData(data);
      setLoading(false);
    });
  }, [selectedCounters.join(','), dateFrom, dateTo]);

  const addCounter = (name: string) => {
    if (!selectedCounters.includes(name)) {
      setSelectedCounters(prev => [...prev, name]);
    }
    setShowSelector(false);
    setSearch('');
  };

  const removeCounter = (name: string) => {
    setSelectedCounters(prev => prev.filter(c => c !== name));
  };

  // Group by family for selector
  const grouped = catalog.reduce<Record<string, CounterDef[]>>((acc, c) => {
    if (!acc[c.family]) acc[c.family] = [];
    acc[c.family].push(c);
    return acc;
  }, {});

  const filtered = search
    ? catalog.filter(c => c.counter_name.toLowerCase().includes(search.toLowerCase()) || c.family.toLowerCase().includes(search.toLowerCase()))
    : [];

  // Build chart
  const counters = [...new Set(tsData.map(d => d.counter))];
  const timestamps = [...new Set(tsData.map(d => d.ts))].sort();

  const chartOption = {
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: 'rgba(255,255,255,0.08)',
      textStyle: { color: '#f8fafc', fontSize: 10 },
    },
    legend: {
      bottom: 0,
      textStyle: { color: '#9ca3af', fontSize: 9 },
      data: counters,
    },
    grid: { left: 60, right: 20, top: 10, bottom: 40 },
    xAxis: {
      type: 'category' as const,
      data: timestamps.map(t => t.slice(0, 10)),
      axisLabel: { color: '#6b7280', fontSize: 9 },
      axisLine: { lineStyle: { color: '#374151' } },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: '#6b7280', fontSize: 9, formatter: (v: number) => v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(1)+'K' : v.toString() },
      splitLine: { lineStyle: { color: 'rgba(55,65,81,0.3)' } },
    },
    series: counters.map((counter, i) => ({
      name: counter,
      type: 'line' as const,
      smooth: true,
      data: timestamps.map(ts => {
        const point = tsData.find(d => d.ts === ts && d.counter === counter);
        return point ? point.value : 0;
      }),
      lineStyle: { width: 2, color: COLORS[i % COLORS.length] },
      itemStyle: { color: COLORS[i % COLORS.length] },
      symbolSize: 4,
      areaStyle: { color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: COLORS[i % COLORS.length] + '25' }, { offset: 1, color: COLORS[i % COLORS.length] + '05' }] } },
    })),
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-emerald-500/10 rounded-lg">
            <BarChart3 className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-foreground uppercase tracking-tight">PM Counter Analysis</h2>
            <p className="text-[10px] text-muted-foreground">Raw performance counters — {catalog.length} available</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSelector(!showSelector)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-all"
          >
            <Plus className="w-3 h-3" /> Add Counter
          </button>
        </div>
      </div>

      {/* Selected counter pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {selectedCounters.map((name, i) => {
          const def = catalog.find(c => c.counter_name === name);
          return (
            <span key={name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-border/40 bg-card">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="font-mono">{name}</span>
              {def && <span className="text-muted-foreground font-normal">({def.family})</span>}
              <button onClick={() => removeCounter(name)} className="hover:text-destructive ml-0.5"><X className="w-3 h-3" /></button>
            </span>
          );
        })}
        {selectedCounters.length === 0 && (
          <span className="text-[10px] text-muted-foreground">No counters selected — click "Add Counter"</span>
        )}
      </div>

      {/* Counter Selector dropdown */}
      {showSelector && (
        <div className="rounded-xl border border-border bg-card shadow-lg p-3 max-h-[300px] overflow-y-auto">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search counters..."
              className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-background text-foreground text-[11px]"
            />
          </div>
          {search ? (
            <div className="space-y-0.5">
              {filtered.slice(0, 20).map(c => (
                <button
                  key={c.counter_name}
                  onClick={() => addCounter(c.counter_name)}
                  disabled={selectedCounters.includes(c.counter_name)}
                  className={cn(
                    'w-full text-left px-2 py-1.5 rounded-md text-[10px] hover:bg-muted/50 flex items-center justify-between',
                    selectedCounters.includes(c.counter_name) && 'opacity-40'
                  )}
                >
                  <span className="font-mono font-bold">{c.counter_name}</span>
                  <span className="text-muted-foreground">{c.family}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(grouped).map(([family, counters]) => (
                <div key={family}>
                  <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-1">{family}</div>
                  <div className="space-y-0.5">
                    {counters.map(c => (
                      <button
                        key={c.counter_name}
                        onClick={() => addCounter(c.counter_name)}
                        disabled={selectedCounters.includes(c.counter_name)}
                        className={cn(
                          'w-full text-left px-2 py-1 rounded-md text-[10px] hover:bg-muted/50 font-mono',
                          selectedCounters.includes(c.counter_name) && 'opacity-40'
                        )}
                      >
                        {c.counter_name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Counter Chart */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-xs gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading counter data...
        </div>
      ) : tsData.length > 0 ? (
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <ReactECharts option={chartOption} style={{ height: 280 }} />
        </div>
      ) : selectedCounters.length > 0 ? (
        <div className="rounded-xl border border-border/60 bg-card p-8 text-center text-xs text-muted-foreground">
          No counter data available for the selected date range
        </div>
      ) : null}
    </section>
  );
};

export default CounterGraphSection;
