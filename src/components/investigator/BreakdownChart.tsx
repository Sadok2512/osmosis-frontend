import React, { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { generateTimeSlots, mergeTimeSlots } from '@/lib/timeSlots';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { fetchExplain } from '@/components/kpi-monitor/api/kpiMonitorApi';
import { formatAxisLabel } from './timeUtils';
import { Granularity } from './types';
import { Layers } from 'lucide-react';
import {
  PH_COLORS,
  phTooltip,
  phXAxis,
  phYAxis,
  phAnimation,
} from './paramHubChartStyle';

// Teal palette (forced) — slight tonal variations so multiple counters remain distinguishable
const SERIES_COLORS = [
  '#0E7C66', '#14B8A6', '#2DD4BF', '#0F766E', '#0891B2',
  '#0D9488', '#115E59', '#5EEAD4', '#06B6D4', '#0E7490',
];

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
    const dataTs = [...new Set(tsData.map(d => d.ts))].sort();
    const timestamps = dateFrom && dateTo
      ? mergeTimeSlots(generateTimeSlots(dateFrom, dateTo, granularity), dataTs)
      : dataTs;

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
        ...phAnimation,
        backgroundColor: '#ffffff',
        grid: { top: 28, right: 28, bottom: legendRows + 30, left: 62, containLabel: false },
        dataZoom: [
          { type: 'inside' as const, xAxisIndex: 0, filterMode: 'none' as const, zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: true },
          {
            type: 'slider' as const, xAxisIndex: 0, height: 18,
            bottom: legendRows - 8, filterMode: 'none' as const,
            borderColor: 'rgba(14,124,102,0.18)',
            backgroundColor: 'rgba(14,124,102,0.04)',
            fillerColor: 'rgba(20,184,166,0.18)',
            handleSize: '120%',
            handleStyle: { color: PH_COLORS.tealDark, borderColor: PH_COLORS.tealDark, borderWidth: 1 },
            textStyle: { fontSize: 9, color: PH_COLORS.labelSubtle },
            brushSelect: false,
          },
        ],
        legend: {
          show: true, bottom: 4, icon: 'roundRect',
          itemWidth: 16, itemHeight: 4, itemGap: 14,
          type: 'scroll' as any, pageIconSize: 10,
          textStyle: { fontSize: 10, fontWeight: 500, color: PH_COLORS.labelMuted, fontFamily: 'Inter, system-ui, sans-serif' },
          tooltip: { show: true },
        },
        tooltip: phTooltip(),
        xAxis: {
          type: 'category' as const,
          data: timestamps,
          ...phXAxis({
            axisLabel: {
              formatter: (v: string) => formatAxisLabel(v, granularity),
              fontSize: 11, color: PH_COLORS.labelMuted, margin: 14, lineHeight: 16, fontFamily: 'Inter, system-ui, sans-serif',
            },
          }),
        },
        yAxis: {
          type: 'value' as const,
          ...phYAxis({
            axisLabel: {
              fontSize: 11, color: PH_COLORS.labelSubtle, fontFamily: 'Inter, system-ui, sans-serif',
              formatter: (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : v.toFixed(1),
            },
            splitLine: showGrid
              ? { lineStyle: { color: PH_COLORS.splitLine, type: 'solid' as const } }
              : { show: false },
          }),
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
