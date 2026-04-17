import React, { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { fetchExplain } from '@/components/kpi-monitor/api/kpiMonitorApi';
import { formatAxisLabel } from './timeUtils';
import { Granularity } from './types';
import { Layers } from 'lucide-react';

const SERIES_COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#84cc16','#ef4444','#6366f1','#14b8a6'];

/** Extract counter names from a formula string like `counter_a` + `counter_b` */
const extractCounters = (formula: string): string[] => {
  if (!formula) return [];
  const matches = formula.match(/`([^`]+)`/g) || [];
  return matches.map(m => m.replace(/`/g, ''));
};

interface BreakdownChartProps {
  kpiIds: string[];
  dateFrom: string;
  dateTo: string;
  granularity: Granularity;
  filters?: { dimension: string; values: string[] }[];
  siteName?: string | null;
  smooth: boolean;
  showSymbols: boolean;
  showGrid: boolean;
  lineWidth: number;
  height?: number;
}

const BreakdownChart: React.FC<BreakdownChartProps> = ({
  kpiIds, dateFrom, dateTo, granularity, filters, siteName,
  smooth, showSymbols, showGrid, lineWidth, height = 280,
}) => {
  const [counterNames, setCounterNames] = useState<string[]>([]);
  const [tsData, setTsData] = useState<{ ts: string; counter: string; value: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [explainLabels, setExplainLabels] = useState<Record<string, { tag: string }>>({});

  // Step 1: Fetch explain for each KPI sequentially to extract counter names
  useEffect(() => {
    if (kpiIds.length === 0) return;
    const allCounters: string[] = [];
    const labels: Record<string, { tag: string }> = {};
    
    (async () => {
      for (const kpiId of kpiIds) {
        try {
          const ex: any = await fetchExplain(kpiId);
          const numCounters = extractCounters(ex?.numerator || '');
          const denCounters = extractCounters(ex?.denominator || '');
          numCounters.forEach(c => { labels[c] = { tag: 'NUM' }; });
          denCounters.forEach(c => { labels[c] = { tag: 'DEN' }; });
          allCounters.push(...numCounters, ...denCounters);
        } catch {}
      }
      const unique = [...new Set(allCounters)];
      setCounterNames(unique);
      setExplainLabels(labels);
    })();
  }, [kpiIds]);

  // Step 2: Fetch counter timeseries with same filters
  useEffect(() => {
    if (counterNames.length === 0) { setTsData([]); return; }
    setLoading(true);
    const body: any = {
      counter_names: counterNames,
      date_from: dateFrom,
      date_to: dateTo,
      granularity,
    };
    if (siteName) body.site_name = siteName;
    if (filters) {
      for (const f of filters) {
        const dim = (f.dimension || '').toUpperCase();
        if (dim === 'SITE' && f.values?.length) body.site_name = f.values[0];
        else if (dim === 'CELL' && f.values?.length) body.cell_name = f.values[0];
      }
    }

    fetch(getApiUrl('pm/counters/timeseries'), {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(body),
    })
      .then(r => r.ok ? r.json() : { series: [] })
      .then(data => {
        const raw = data.series || data.data || [];
        const normalized = raw.flatMap((s: any) => {
          const ts = s.ts || s.timestamp || s.date;
          const counterId = s.counter_id || s.counter_name || '';
          if (counterId) {
            return [{ ts, counter: counterId, value: s.value ?? s.kpi_value ?? s.val ?? 0 }];
          }
          return counterNames
            .filter((name) => Object.prototype.hasOwnProperty.call(s, name))
            .map((name) => ({ ts, counter: name, value: s[name] ?? 0 }));
        });
        setTsData(normalized);
        setLoading(false);
      })
      .catch(() => { setTsData([]); setLoading(false); });
  }, [counterNames.join(','), dateFrom, dateTo, granularity, siteName, JSON.stringify(filters)]);

  const { option, hasData } = useMemo(() => {
    if (tsData.length === 0) return { option: null, hasData: false };

    const counters = [...new Set(tsData.map(d => d.counter))];
    const timestamps = [...new Set(tsData.map(d => d.ts))].sort();

    const series = counters.map((counter, i) => {
      const color = SERIES_COLORS[i % SERIES_COLORS.length];
      const tag = explainLabels[counter]?.tag;
      const label = tag ? `[${tag}] ${counter}` : counter;
      return {
        name: label,
        type: 'line' as const,
        smooth,
        connectNulls: true,
        data: timestamps.map(ts => {
          const p = tsData.find(d => d.ts === ts && d.counter === counter);
          return p ? p.value : null;
        }),
        symbol: showSymbols ? 'circle' : 'none',
        symbolSize: showSymbols ? 5 : 0,
        lineStyle: { width: lineWidth, color },
        itemStyle: { color },
        emphasis: {
          focus: 'series' as const,
          lineStyle: { width: lineWidth + 1.5 },
        },
      };
    });

    const legendRows = counters.length > 4 ? 70 : counters.length > 2 ? 58 : 46;

    return {
      hasData: true,
      option: {
        animation: false,
        backgroundColor: '#ffffff',
        grid: { top: 28, right: 28, bottom: legendRows + 30, left: 62, containLabel: false },
        dataZoom: [
          { type: 'inside' as const, xAxisIndex: 0, filterMode: 'none' as const, zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: true },
          {
            type: 'slider' as const, xAxisIndex: 0, height: 18,
            bottom: legendRows - 8, filterMode: 'none' as const,
            borderColor: 'rgba(128,128,128,0.2)',
            backgroundColor: 'rgba(128,128,128,0.06)',
            fillerColor: 'rgba(99,102,241,0.15)',
            handleSize: '120%',
            handleStyle: { color: '#6366f1', borderColor: '#6366f1', borderWidth: 1 },
            textStyle: { fontSize: 9, color: '#a1a1aa' },
            brushSelect: false,
          },
        ],
        legend: {
          show: true, bottom: 4, icon: 'roundRect',
          itemWidth: 16, itemHeight: 4, itemGap: 14,
          type: 'scroll' as any, pageIconSize: 10,
          textStyle: { fontSize: 10, fontWeight: 500, color: '#4b5563' },
          tooltip: { show: true },
        },
        tooltip: {
          trigger: 'axis' as const,
          backgroundColor: 'rgba(15,23,42,0.96)',
          borderColor: 'rgba(255,255,255,0.06)',
          borderRadius: 8,
          padding: [8, 12],
          textStyle: { color: '#f1f5f9', fontSize: 11 },
          axisPointer: { type: 'line' as const, lineStyle: { color: 'rgba(99,102,241,0.25)', width: 1, type: 'dashed' as const } },
        },
        xAxis: {
          type: 'category' as const,
          data: timestamps,
          axisLabel: {
            formatter: (v: string) => formatAxisLabel(v, granularity),
            fontSize: 11, color: '#6b7280', margin: 16, lineHeight: 16,
          },
          axisLine: { lineStyle: { color: 'rgba(0,0,0,0.08)' } },
          axisTick: { show: true, length: 4, lineStyle: { color: 'rgba(0,0,0,0.08)' } },
        },
        yAxis: {
          type: 'value' as const,
          axisLabel: { fontSize: 9, color: '#a1a1aa', formatter: (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : v.toFixed(1) },
          splitLine: { show: showGrid, lineStyle: { color: 'rgba(148,163,184,0.35)', type: 'dashed' as const } },
          axisLine: { show: false },
          axisTick: { show: false },
        },
        series,
      },
    };
  }, [tsData, explainLabels, smooth, showSymbols, showGrid, lineWidth, granularity]);

  if (loading) {
    return (
      <div className="mt-3 rounded-lg border border-border/40 bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-4 h-4 text-primary" />
          <span className="text-[11px] font-bold text-foreground">KPI Breakdown</span>
        </div>
        <div className="flex items-center justify-center h-32 text-muted-foreground text-[10px]">
          Chargement des compteurs...
        </div>
      </div>
    );
  }

  if (!hasData || !option) {
    return (
      <div className="mt-3 rounded-lg border border-border/40 bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-4 h-4 text-primary" />
          <span className="text-[11px] font-bold text-foreground">KPI Breakdown</span>
        </div>
        <div className="flex items-center justify-center h-20 text-muted-foreground text-[10px]">
          Aucun compteur trouvé pour ce KPI
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-border/40 bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Layers className="w-4 h-4 text-primary" />
        <span className="text-[11px] font-bold text-foreground">KPI Breakdown</span>
        <span className="text-[9px] text-muted-foreground ml-auto">{counterNames.length} compteurs</span>
      </div>
      <ReactECharts option={option} notMerge style={{ height }} />
    </div>
  );
};

export default BreakdownChart;
