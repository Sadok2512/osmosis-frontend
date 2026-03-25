import React from 'react';
import ReactECharts from 'echarts-for-react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { BarChart3, Plus, X, RefreshCw, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import CounterSelectorModal from './CounterSelectorModal';

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

const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#ef4444','#84cc16','#6366f1','#14b8a6',
                '#f97316','#a855f7','#22d3ee','#4ade80','#fbbf24','#fb7185'];

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
  const [selectorOpen, setSelectorOpen] = React.useState(false);

  // Load catalog
  React.useEffect(() => {
    fetchCounterCatalog().then(setCatalog);
  }, []);

  // Fetch timeseries when selection changes
  React.useEffect(() => {
    if (selectedCounters.length === 0) { setTsData([]); return; }
    setLoading(true);
    fetchCounterTimeseries(selectedCounters, dateFrom, dateTo).then(data => {
      setTsData(data);
      setLoading(false);
    });
  }, [selectedCounters.join(','), dateFrom, dateTo]);

  const removeCounter = (name: string) => {
    setSelectedCounters(prev => prev.filter(c => c !== name));
  };

  // Build chart
  const counters = [...new Set(tsData.map(d => d.counter))];
  const timestamps = [...new Set(tsData.map(d => d.ts))].sort();

  const chartOption = tsData.length > 0 ? {
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: 'rgba(255,255,255,0.08)',
      textStyle: { color: '#f8fafc', fontSize: 10 },
      formatter: (params: any[]) => {
        let html = `<div style="font-size:10px;font-weight:700;margin-bottom:4px">${params[0]?.axisValue}</div>`;
        params.forEach((p: any) => {
          const v = typeof p.value === 'number' ? (p.value >= 1e6 ? (p.value/1e6).toFixed(2)+'M' : p.value >= 1e3 ? (p.value/1e3).toFixed(1)+'K' : p.value.toFixed(0)) : '—';
          html += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:8px;height:8px;border-radius:50%;background:${p.color}"></span><span style="flex:1">${p.seriesName}</span><span style="font-weight:700;font-family:monospace">${v}</span></div>`;
        });
        return html;
      },
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
      axisLabel: {
        color: '#6b7280', fontSize: 9,
        formatter: (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : v.toString()
      },
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
      areaStyle: {
        color: {
          type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: COLORS[i % COLORS.length] + '25' },
            { offset: 1, color: COLORS[i % COLORS.length] + '05' },
          ],
        },
      },
    })),
  } : null;

  return (
    <section className="space-y-4">
      {/* Selected counter pills + Add button */}
      <div className="flex items-center gap-2 flex-wrap">
        {selectedCounters.map((name, i) => {
          const def = catalog.find(c => c.counter_name === name);
          return (
            <div key={name} className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg text-[10px] font-bold border border-border/50 bg-card shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="font-mono">{name}</span>
              {def && <span className="text-[8px] text-muted-foreground font-normal px-1 py-0.5 rounded bg-muted">{def.family}</span>}
              <button onClick={() => removeCounter(name)} className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
        <button
          onClick={() => setSelectorOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-dashed border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> Add Counter
        </button>
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
        selectedKeys={selectedCounters}
        onConfirm={setSelectedCounters}
      />
    </section>
  );
};

export default CounterGraphSection;
