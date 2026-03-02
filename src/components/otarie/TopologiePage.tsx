import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { dumpParameterApi } from '@/lib/localDb';
import { supabase } from '@/integrations/supabase/client';
import { getApiUrl, getPreferredDataSource, setPreferredDataSource } from '@/lib/apiConfig';
import {
  Search, Filter, Download, Loader2, ChevronDown, Wifi, WifiOff, Database,
  Layers, FileSpreadsheet, Check, X, AlertCircle, ChevronLeft, ChevronRight, RotateCcw,
  BarChart3, AlignStartVertical, ArrowUpDown, Eye, EyeOff
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import ReactEChartsCore from 'echarts-for-react';
import * as echarts from 'echarts/core';
import { BarChart as EBarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([EBarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const CHART_COLORS = [
  'hsl(210, 80%, 55%)', 'hsl(25, 95%, 53%)', 'hsl(160, 84%, 39%)', 'hsl(262, 83%, 58%)',
  'hsl(330, 81%, 60%)', 'hsl(187, 92%, 39%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)',
  'hsl(120, 60%, 45%)', 'hsl(280, 60%, 50%)', 'hsl(45, 90%, 50%)', 'hsl(200, 70%, 50%)',
];

interface DumpRow {
  id: number;
  site_name: string | null;
  cell_name: string | null;
  parameter: string;
  value: string | null;
  plaque: string | null;
  dor: string | null;
  vendor: string | null;
  bande: string | null;
  dr: string | null;
  ur: string | null;
}

type AggregatorKey = 'vendor' | 'dor' | 'plaque' | 'ur' | 'value';
type ColorByKey = 'ne_aggregation' | 'value';
type ChartMode = 'stacked' | 'grouped';

// ─── Compact Multi-select filter ───
const MultiSelectFilter: React.FC<{
  label: string;
  selected: string[];
  options: string[];
  onChange: (v: string[]) => void;
  maxChips?: number;
}> = ({ label, selected, options, onChange, maxChips = 2 }) => {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    if (!search) return options;
    const s = search.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(s));
  }, [options, search]);

  const toggle = (val: string) => {
    if (selected.includes(val)) onChange(selected.filter(v => v !== val));
    else onChange([...selected, val]);
  };

  const displayChips = selected.slice(0, maxChips);
  const overflow = selected.length - maxChips;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground leading-none">{label}</label>
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1.5 flex-wrap min-h-[32px] px-2.5 py-1 text-xs rounded-md border border-input bg-background hover:bg-accent/50 transition-colors text-left min-w-[120px]">
            {selected.length === 0 ? (
              <span className="text-muted-foreground text-xs">Tous</span>
            ) : (
              <>
                {displayChips.map(v => (
                  <span key={v} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-medium max-w-[90px] truncate">
                    {v}
                    <X className="w-3 h-3 cursor-pointer opacity-60 hover:opacity-100 shrink-0" onClick={(e) => { e.stopPropagation(); toggle(v); }} />
                  </span>
                ))}
                {overflow > 0 && <span className="text-[11px] text-muted-foreground">+{overflow}</span>}
              </>
            )}
            <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-50 ml-auto" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-0" align="start">
          <div className="flex items-center border-b border-border px-2.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input className="flex h-8 w-full bg-transparent px-2 py-1 text-xs outline-none placeholder:text-muted-foreground" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          </div>
          {selected.length > 0 && (
            <button onClick={() => onChange([])} className="w-full px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground text-left border-b border-border hover:bg-muted/50">
              Tout désélectionner
            </button>
          )}
          <div className="max-h-[200px] overflow-auto p-1">
            {filtered.length === 0 ? (
              <div className="py-3 text-center text-xs text-muted-foreground">Aucun résultat</div>
            ) : filtered.map(opt => (
              <button key={opt} onClick={() => toggle(opt)}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-sm hover:bg-accent transition-colors">
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${selected.includes(opt) ? 'bg-primary border-primary' : 'border-input'}`}>
                  {selected.includes(opt) && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </div>
                <span className="truncate">{opt}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

// ─── Segmented control ───
const SegmentedControl: React.FC<{
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <div className="flex items-center gap-2">
    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{label}</span>
    <div className="flex rounded-md border border-input overflow-hidden">
      {options.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          className={`px-3 py-1 text-xs font-medium transition-colors ${value === opt.value ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

const TopologiePage: React.FC = () => {
  const [mainTab, setMainTab] = useState('param_distribution');
  const [cnxStatus, setCnxStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [cnxMessage, setCnxMessage] = useState('');
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  const [dataSource, setDataSource] = useState<'local' | 'cloud'>(getPreferredDataSource());
  const shouldUseLocal = dataSource === 'local';
  const [chartMode, setChartMode] = useState<ChartMode>('stacked');
  const [showLabels, setShowLabels] = useState(true);

  // ─── Available filter options ───
  const [availableParams, setAvailableParams] = useState<string[]>([]);
  const [availableVendors, setAvailableVendors] = useState<string[]>([]);
  const [availableDors, setAvailableDors] = useState<string[]>([]);
  const [availablePlaques, setAvailablePlaques] = useState<string[]>([]);
  const [availableSites, setAvailableSites] = useState<string[]>([]);
  const [availableCells, setAvailableCells] = useState<string[]>([]);
  const [availableUrs, setAvailableUrs] = useState<string[]>([]);
  const [filtersLoading, setFiltersLoading] = useState(false);

  // ─── PD pending vs applied ───
  const [pdPendingParams, setPdPendingParams] = useState<string[]>([]);
  const [pdPendingVendor, setPdPendingVendor] = useState<string[]>([]);
  const [pdPendingDor, setPdPendingDor] = useState<string[]>([]);
  const [pdPendingPlaque, setPdPendingPlaque] = useState<string[]>([]);
  const [pdPendingAggregator, setPdPendingAggregator] = useState<AggregatorKey>('vendor');
  const [pdPendingColorBy, setPdPendingColorBy] = useState<ColorByKey>('value');

  const [pdAppliedParams, setPdAppliedParams] = useState<string[]>([]);
  const [pdAppliedVendor, setPdAppliedVendor] = useState<string[]>([]);
  const [pdAppliedDor, setPdAppliedDor] = useState<string[]>([]);
  const [pdAppliedPlaque, setPdAppliedPlaque] = useState<string[]>([]);
  const [pdAppliedAggregator, setPdAppliedAggregator] = useState<AggregatorKey>('vendor');
  const [pdAppliedColorBy, setPdAppliedColorBy] = useState<ColorByKey>('value');
  const [pdData, setPdData] = useState<DumpRow[]>([]);
  const [pdLoading, setPdLoading] = useState(false);
  const [pdConfirmed, setPdConfirmed] = useState(false);

  // ─── RAW pending vs applied ───
  const [rawPendingVendor, setRawPendingVendor] = useState<string[]>([]);
  const [rawPendingDor, setRawPendingDor] = useState<string[]>([]);
  const [rawPendingPlaque, setRawPendingPlaque] = useState<string[]>([]);
  const [rawPendingSite, setRawPendingSite] = useState<string[]>([]);
  const [rawPendingCell, setRawPendingCell] = useState<string[]>([]);

  const [rawAppliedVendor, setRawAppliedVendor] = useState<string[]>([]);
  const [rawAppliedDor, setRawAppliedDor] = useState<string[]>([]);
  const [rawAppliedPlaque, setRawAppliedPlaque] = useState<string[]>([]);
  const [rawAppliedSite, setRawAppliedSite] = useState<string[]>([]);
  const [rawAppliedCell, setRawAppliedCell] = useState<string[]>([]);
  const [rawData, setRawData] = useState<DumpRow[]>([]);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawConfirmed, setRawConfirmed] = useState(false);
  const [rawPage, setRawPage] = useState(1);
  const [rawSearch, setRawSearch] = useState('');
  const [rawSortCol, setRawSortCol] = useState<string>('site_name');
  const [rawSortDir, setRawSortDir] = useState<'asc' | 'desc'>('asc');
  const RAW_PAGE_SIZE = 50;

  // ─── Table sort for distribution ───
  const [distSortCol, setDistSortCol] = useState<string>('total');
  const [distSortDir, setDistSortDir] = useState<'asc' | 'desc'>('desc');

  // ─── Dirty detection ───
  const pdDirty = useMemo(() => {
    return JSON.stringify({ p: pdPendingParams, v: pdPendingVendor, d: pdPendingDor, pl: pdPendingPlaque, a: pdPendingAggregator, c: pdPendingColorBy }) !==
      JSON.stringify({ p: pdAppliedParams, v: pdAppliedVendor, d: pdAppliedDor, pl: pdAppliedPlaque, a: pdAppliedAggregator, c: pdAppliedColorBy });
  }, [pdPendingParams, pdPendingVendor, pdPendingDor, pdPendingPlaque, pdPendingAggregator, pdPendingColorBy, pdAppliedParams, pdAppliedVendor, pdAppliedDor, pdAppliedPlaque, pdAppliedAggregator, pdAppliedColorBy]);

  const rawDirty = useMemo(() => {
    return JSON.stringify({ v: rawPendingVendor, d: rawPendingDor, pl: rawPendingPlaque, s: rawPendingSite, c: rawPendingCell }) !==
      JSON.stringify({ v: rawAppliedVendor, d: rawAppliedDor, pl: rawAppliedPlaque, s: rawAppliedSite, c: rawAppliedCell });
  }, [rawPendingVendor, rawPendingDor, rawPendingPlaque, rawPendingSite, rawPendingCell, rawAppliedVendor, rawAppliedDor, rawAppliedPlaque, rawAppliedSite, rawAppliedCell]);

  const switchDataSource = (next: 'local' | 'cloud') => { setDataSource(next); setPreferredDataSource(next); };

  // ─── Data helpers ───
  const fetchDistinctCloud = async (col: string): Promise<string[]> => {
    try {
      const { data: rows, error } = await (supabase as any).from('parameter_dump').select(col).limit(10000);
      if (error) throw error;
      return [...new Set((rows || []).map((r: any) => r[col]).filter(Boolean))].sort() as string[];
    } catch { return []; }
  };

  const fetchRowsCloud = async (filters: Record<string, string | string[]>, cols: string, limit = 5000): Promise<any[]> => {
    try {
      let query = (supabase as any).from('parameter_dump').select(cols).limit(limit);
      Object.entries(filters).forEach(([k, v]) => {
        if (Array.isArray(v) && v.length > 0) query = query.in(k, v);
        else if (typeof v === 'string') query = query.eq(k, v);
      });
      const { data: rows, error } = await query;
      if (error) throw error;
      return rows || [];
    } catch { return []; }
  };

  const fetchDistinctLocal = async (col: string) => {
    try {
      const rows = await dumpParameterApi.distinct(col);
      return [...new Set((rows || []).map((r: any) => r[col]).filter(Boolean))].sort() as string[];
    } catch { return []; }
  };

  const fetchRowsLocal = async (filters: Record<string, string | string[]>, cols: string, limit = 5000) => {
    try { return await dumpParameterApi.query(filters as any, cols, limit); } catch { return []; }
  };

  const fetchDistinct = shouldUseLocal ? fetchDistinctLocal : fetchDistinctCloud;
  const fetchRows = shouldUseLocal ? fetchRowsLocal : fetchRowsCloud;

  useEffect(() => {
    if (!shouldUseLocal) { setBackendReachable(null); return; }
    const probe = async () => {
      try {
        const resp = await fetch(`${import.meta.env.VITE_LOCAL_API || 'http://localhost:3001'}/api/health`, { signal: AbortSignal.timeout(3000) });
        setBackendReachable(resp.ok);
      } catch { setBackendReachable(false); }
    };
    probe();
  }, [shouldUseLocal]);

  useEffect(() => {
    if (shouldUseLocal && backendReachable === false) return;
    setFiltersLoading(true);
    const load = async () => {
      const [p, v, d, pl, s, c, u] = await Promise.all([
        fetchDistinct('parameter'), fetchDistinct('vendor'), fetchDistinct('dor'),
        fetchDistinct('plaque'), fetchDistinct('site_name'), fetchDistinct('cell_name'), fetchDistinct('ur'),
      ]);
      setAvailableParams(p); setAvailableVendors(v); setAvailableDors(d);
      setAvailablePlaques(pl); setAvailableSites(s); setAvailableCells(c); setAvailableUrs(u);
      setFiltersLoading(false);
    };
    load();
  }, [backendReachable, dataSource]);

  // ─── PD Confirm ───
  const pdConfirm = useCallback(async () => {
    if (pdPendingParams.length === 0) return;
    setPdAppliedParams([...pdPendingParams]); setPdAppliedVendor([...pdPendingVendor]);
    setPdAppliedDor([...pdPendingDor]); setPdAppliedPlaque([...pdPendingPlaque]);
    setPdAppliedAggregator(pdPendingAggregator); setPdAppliedColorBy(pdPendingColorBy);
    setPdLoading(true); setPdConfirmed(true);

    const filters: Record<string, string | string[]> = {};
    if (pdPendingParams.length > 0) filters.parameter = pdPendingParams;
    if (pdPendingVendor.length > 0) filters.vendor = pdPendingVendor;
    if (pdPendingDor.length > 0) filters.dor = pdPendingDor;
    if (pdPendingPlaque.length > 0) filters.plaque = pdPendingPlaque;

    const rows = await fetchRows(filters, 'id, site_name, cell_name, parameter, value, plaque, ur, vendor, bande, dr, dor');
    setPdData(rows || []); setPdLoading(false);
  }, [pdPendingParams, pdPendingVendor, pdPendingDor, pdPendingPlaque, pdPendingAggregator, pdPendingColorBy, fetchRows]);

  const pdReset = () => {
    setPdPendingParams([]); setPdPendingVendor([]); setPdPendingDor([]); setPdPendingPlaque([]);
    setPdPendingAggregator('vendor'); setPdPendingColorBy('value');
    setPdAppliedParams([]); setPdAppliedVendor([]); setPdAppliedDor([]); setPdAppliedPlaque([]);
    setPdAppliedAggregator('vendor'); setPdAppliedColorBy('value');
    setPdData([]); setPdConfirmed(false);
  };

  // ─── Raw Confirm ───
  const rawConfirm = useCallback(async () => {
    setRawAppliedVendor([...rawPendingVendor]); setRawAppliedDor([...rawPendingDor]);
    setRawAppliedPlaque([...rawPendingPlaque]); setRawAppliedSite([...rawPendingSite]);
    setRawAppliedCell([...rawPendingCell]);
    setRawLoading(true); setRawConfirmed(true); setRawPage(1);

    const filters: Record<string, string | string[]> = {};
    if (rawPendingVendor.length > 0) filters.vendor = rawPendingVendor;
    if (rawPendingDor.length > 0) filters.dor = rawPendingDor;
    if (rawPendingPlaque.length > 0) filters.plaque = rawPendingPlaque;
    if (rawPendingSite.length > 0) filters.site_name = rawPendingSite;
    if (rawPendingCell.length > 0) filters.cell_name = rawPendingCell;

    const rows = await fetchRows(filters, 'id, site_name, cell_name, parameter, value, plaque, ur, vendor, bande, dr, dor');
    setRawData(rows || []); setRawLoading(false);
  }, [rawPendingVendor, rawPendingDor, rawPendingPlaque, rawPendingSite, rawPendingCell, fetchRows]);

  const rawReset = () => {
    setRawPendingVendor([]); setRawPendingDor([]); setRawPendingPlaque([]);
    setRawPendingSite([]); setRawPendingCell([]);
    setRawAppliedVendor([]); setRawAppliedDor([]); setRawAppliedPlaque([]);
    setRawAppliedSite([]); setRawAppliedCell([]);
    setRawData([]); setRawConfirmed(false); setRawPage(1);
  };

  // ─── PD Chart data ───
  const aggregator = pdAppliedAggregator;
  const colorBy = pdAppliedColorBy;

  const allValues = useMemo(() => [...new Set(pdData.map(r => r.value || 'N/A'))].sort(), [pdData]);
  const allAggKeys = useMemo(() => [...new Set(pdData.map(r => (r as any)[aggregator] || 'N/A'))].sort(), [pdData, aggregator]);

  const chartData = useMemo(() => {
    if (pdData.length === 0) return [];
    if (colorBy === 'value') {
      const map: Record<string, Record<string, number>> = {};
      pdData.forEach(r => {
        const key = (r as any)[aggregator] || 'N/A';
        const val = r.value || 'N/A';
        if (!map[key]) map[key] = {};
        map[key][val] = (map[key][val] || 0) + 1;
      });
      return Object.entries(map).map(([key, vals]) => {
        const total = Object.values(vals).reduce((a, b) => a + b, 0);
        return { _key: key, total, ...vals, _details: Object.entries(vals).map(([v, c]) => ({ value: v, count: c, pct: ((c / total) * 100).toFixed(1) })) };
      }).sort((a, b) => b.total - a.total);
    } else {
      const map: Record<string, Record<string, number>> = {};
      pdData.forEach(r => {
        const val = r.value || 'N/A';
        const key = (r as any)[aggregator] || 'N/A';
        if (!map[val]) map[val] = {};
        map[val][key] = (map[val][key] || 0) + 1;
      });
      return Object.entries(map).map(([val, keys]) => {
        const total = Object.values(keys).reduce((a, b) => a + b, 0);
        return { _key: val, total, ...keys, _details: Object.entries(keys).map(([k, c]) => ({ value: k, count: c, pct: ((c / total) * 100).toFixed(1) })) };
      }).sort((a, b) => b.total - a.total);
    }
  }, [pdData, aggregator, colorBy]);

  const stackKeys = colorBy === 'value' ? allValues : allAggKeys;

  const globalDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    pdData.forEach(r => { const val = r.value || 'N/A'; map[val] = (map[val] || 0) + 1; });
    const total = pdData.length;
    return Object.entries(map).map(([value, count]) => ({
      value, count, pct: total > 0 ? ((count / total) * 100).toFixed(1) : '0'
    })).sort((a, b) => b.count - a.count);
  }, [pdData]);

  // ─── Dynamic chart sizing ───
  const catCount = chartData.length;
  const chartHeight = catCount <= 4 ? 220 : catCount <= 10 ? 280 : 340;
  const chartWidth = Math.min(1100, Math.max(520, catCount * 140 + 160));
  const xRotate = catCount > 6 ? 35 : 0;

  // ─── ECharts options ───
  const echartsOption = useMemo(() => {
    if (chartData.length === 0) return {};
    const categories = chartData.map(d => d._key);
    const series = stackKeys.map((key, i) => ({
      name: key,
      type: 'bar' as const,
      stack: chartMode === 'stacked' ? 'total' : undefined,
      barMaxWidth: 32,
      itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] },
      label: {
        show: showLabels,
        position: (chartMode === 'stacked' ? 'inside' : 'top') as 'inside' | 'top',
        fontSize: 10,
        color: chartMode === 'stacked' ? '#fff' : undefined,
        formatter: (p: any) => (p.value && p.value > 0 ? Math.round(p.value) : ''),
      },
      data: chartData.map(d => (d as any)[key] || 0),
    }));

    // In stacked mode, add a transparent "total" series on top for total labels
    if (chartMode === 'stacked') {
      const totals = chartData.map(d => d.total);
      series.push({
        name: '__total__',
        type: 'bar',
        stack: 'total',
        barMaxWidth: 32,
        itemStyle: { color: 'transparent' },
        label: {
          show: showLabels,
          position: 'top',
          fontSize: 10,
          color: undefined,
          formatter: (p: any) => {
            const t = totals[p.dataIndex];
            return t > 0 ? `Σ${t}` : '';
          },
        },
        data: chartData.map(() => 0),
      } as any);
    }

    return {
      grid: { left: 40, right: 20, top: 40, bottom: xRotate > 0 ? 60 : 30, containLabel: true },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: { rotate: xRotate, fontSize: 10, interval: 0 },
        axisTick: { show: true, alignWithLabel: true },
        axisLine: { lineStyle: { color: 'hsl(var(--border))' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 10 },
        splitLine: { show: true, lineStyle: { color: 'hsl(var(--border))', opacity: 0.5 } },
        axisTick: { show: true },
        axisLine: { show: true, lineStyle: { color: 'hsl(var(--border))' } },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        textStyle: { fontSize: 11 },
        formatter: (params: any[]) => {
          const filtered = params.filter((p: any) => p.seriesName !== '__total__');
          if (!filtered.length) return '';
          let html = `<strong>${filtered[0].axisValue}</strong><br/>`;
          let total = 0;
          filtered.forEach((p: any) => {
            if (p.value > 0) {
              html += `${p.marker} ${p.seriesName}: <strong>${p.value}</strong><br/>`;
              total += p.value;
            }
          });
          if (chartMode === 'stacked' && filtered.length > 1) {
            html += `<br/><strong>Total: ${total}</strong>`;
          }
          return html;
        },
      },
      legend: {
        show: true,
        top: 4,
        right: 10,
        textStyle: { fontSize: 10 },
        itemWidth: 12,
        itemHeight: 8,
        data: stackKeys,
      },
      series,
    };
  }, [chartData, stackKeys, chartMode, showLabels, xRotate]);

  // ─── Distribution table with explicit value columns ───
  const distTableColumns = useMemo(() => {
    if (chartData.length === 0) return { valueKeys: [] as string[] };
    const valueKeys = [...new Set(chartData.flatMap(r => r._details.map((d: any) => d.value)))].sort();
    return { valueKeys };
  }, [chartData]);

  const sortedChartData = useMemo(() => {
    const d = [...chartData];
    d.sort((a, b) => {
      if (distSortCol === 'total') return distSortDir === 'asc' ? a.total - b.total : b.total - a.total;
      if (distSortCol === '_key') return distSortDir === 'asc' ? String(a._key).localeCompare(String(b._key)) : String(b._key).localeCompare(String(a._key));
      // Sort by a value column count
      const av = a._details.find((x: any) => x.value === distSortCol)?.count || 0;
      const bv = b._details.find((x: any) => x.value === distSortCol)?.count || 0;
      return distSortDir === 'asc' ? av - bv : bv - av;
    });
    return d;
  }, [chartData, distSortCol, distSortDir]);

  const toggleDistSort = (col: string) => {
    if (distSortCol === col) setDistSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setDistSortCol(col); setDistSortDir('desc'); }
  };

  // ─── Raw sorted / filtered / paginated ───
  const rawFiltered = useMemo(() => {
    let d = rawData;
    if (rawSearch) {
      const s = rawSearch.toLowerCase();
      d = d.filter(r => r.site_name?.toLowerCase().includes(s) || r.cell_name?.toLowerCase().includes(s) || r.parameter?.toLowerCase().includes(s) || r.value?.toLowerCase().includes(s));
    }
    d = [...d].sort((a, b) => {
      const av = (a as any)[rawSortCol] ?? '';
      const bv = (b as any)[rawSortCol] ?? '';
      return rawSortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return d;
  }, [rawData, rawSearch, rawSortCol, rawSortDir]);

  const rawTotalPages = Math.max(1, Math.ceil(rawFiltered.length / RAW_PAGE_SIZE));
  const rawPageData = rawFiltered.slice((rawPage - 1) * RAW_PAGE_SIZE, rawPage * RAW_PAGE_SIZE);

  const toggleRawSort = (col: string) => {
    if (rawSortCol === col) setRawSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setRawSortCol(col); setRawSortDir('asc'); }
  };

  const exportCSV = (rows: DumpRow[]) => {
    if (!rows.length) return;
    const headers = ['Site', 'Cell', 'Parameter', 'Value', 'DOR', 'Plaque', 'Vendor', 'Bande'];
    const csv = [headers.join(','), ...rows.map(r => [r.site_name, r.cell_name, r.parameter, r.value, r.dor, r.plaque, r.vendor, r.bande].join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `parameters_export.csv`; a.click();
  };

  const testConnection = async () => {
    setCnxStatus('testing'); setCnxMessage('');
    try {
      if (shouldUseLocal) {
        const resp = await fetch(`${getApiUrl('dump-parameter')}?${new URLSearchParams({ distinct_col: 'parameter' })}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const rows = await resp.json();
        setCnxStatus('ok'); setCnxMessage(`✅ Connecté (Local) — ${rows.length} paramètres`);
      } else {
        const { data: rows, error } = await (supabase as any).from('parameter_dump').select('parameter').limit(1);
        if (error) throw error;
        setCnxStatus('ok'); setCnxMessage(`✅ Connecté (Cloud) — parameter_dump accessible`);
      }
    } catch (err: any) { setCnxStatus('error'); setCnxMessage(`❌ Erreur: ${err.message || err}`); }
  };

  const aggLabel = (key: AggregatorKey) => ({ vendor: 'Vendor', dor: 'DOR', plaque: 'Plaque', ur: 'NetAct', value: 'Valeur' }[key] || key);
  const backendLabel = dataSource === 'local' ? 'Local' : 'Cloud';

  const pdSummary = pdConfirmed ? `${pdAppliedParams.length} param(s)${pdAppliedVendor.length ? ` · Vendor: ${pdAppliedVendor.join(',')}` : ''}${pdAppliedDor.length ? ` · DOR: ${pdAppliedDor.join(',')}` : ''} · Agg: ${aggLabel(pdAppliedAggregator)} · ${pdData.length} rows` : null;
  const rawSummary = rawConfirmed ? `${rawAppliedVendor.length ? `Vendor: ${rawAppliedVendor.join(',')} · ` : ''}${rawAppliedSite.length ? `Sites: ${rawAppliedSite.length} · ` : ''}${rawFiltered.length} rows` : null;

  // Mini stacked bar for table
  const MiniBar: React.FC<{ details: { value: string; count: number; pct: string }[]; total: number }> = ({ details, total }) => {
    if (total === 0) return null;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex h-3 w-20 rounded overflow-hidden bg-muted/50">
              {details.map((d, i) => (
                <div key={i} style={{ width: `${(d.count / total) * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
              ))}
            </div>
          </TooltipTrigger>
          <TooltipContent className="text-[10px]">
            {details.map((d, i) => <div key={i}>{d.value}: {d.count} ({d.pct}%)</div>)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* ─── COMPACT HEADER ─── */}
      <div className="border-b border-border bg-card px-5 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-base font-bold text-foreground">Topologie Réseau</h1>
            <Tabs value={mainTab} onValueChange={setMainTab}>
              <TabsList className="h-8 bg-muted/50">
                <TabsTrigger value="param_distribution" className="gap-1.5 text-xs h-7 px-3">
                  <Layers className="w-3.5 h-3.5" /> Distribution
                </TabsTrigger>
                <TabsTrigger value="raw_parameter" className="gap-1.5 text-xs h-7 px-3">
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Raw
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] h-6 gap-1 px-2"><Database className="w-3 h-3" />{backendLabel}</Badge>
            <div className="inline-flex rounded-md border border-input overflow-hidden">
              <button onClick={() => switchDataSource('local')} className={`px-2.5 py-1 text-[11px] font-medium ${dataSource === 'local' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}>Local</button>
              <button onClick={() => switchDataSource('cloud')} className={`px-2.5 py-1 text-[11px] font-medium ${dataSource === 'cloud' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}>Cloud</button>
            </div>
            <button onClick={testConnection} disabled={cnxStatus === 'testing'}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium ${cnxStatus === 'ok' ? 'bg-primary/10 text-primary' : cnxStatus === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}>
              {cnxStatus === 'testing' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
              Test
            </button>
          </div>
        </div>
        {cnxMessage && <div className={`text-xs px-3 py-1.5 rounded mt-1.5 ${cnxStatus === 'ok' ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>{cnxMessage}</div>}
        {shouldUseLocal && backendReachable === false && (
          <div className="flex items-center gap-2 text-xs px-3 py-2 rounded bg-destructive/10 border border-destructive/30 text-destructive mt-1.5">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            Serveur local injoignable — <code className="bg-muted px-1 rounded text-[10px]">cd server && npm run dev</code>
          </div>
        )}
      </div>

      {/* ─── FILTER BAR ─── */}
      <div className="border-b border-border bg-card/80 px-5 py-3">
        {filtersLoading ? (
          <div className="flex gap-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-32" />)}</div>
        ) : mainTab === 'param_distribution' ? (
          <div className="flex items-end gap-3 flex-wrap">
            <MultiSelectFilter label="Paramètres *" selected={pdPendingParams} options={availableParams} onChange={setPdPendingParams} />
            <MultiSelectFilter label="Vendor" selected={pdPendingVendor} options={availableVendors} onChange={setPdPendingVendor} />
            <MultiSelectFilter label="NetAct" selected={pdPendingVendor} options={availableUrs} onChange={() => {}} />
            <MultiSelectFilter label="DOR" selected={pdPendingDor} options={availableDors} onChange={setPdPendingDor} />
            <MultiSelectFilter label="Plaque" selected={pdPendingPlaque} options={availablePlaques} onChange={setPdPendingPlaque} />

            <div className="w-px h-6 bg-border mx-1" />

            <SegmentedControl label="Agg" value={pdPendingAggregator}
              options={[{ value: 'vendor', label: 'Vendor' }, { value: 'ur', label: 'NetAct' }, { value: 'dor', label: 'DOR' }, { value: 'plaque', label: 'Plaque' }, { value: 'value', label: 'Valeur' }]}
              onChange={v => setPdPendingAggregator(v as AggregatorKey)} />

            <SegmentedControl label="Couleur" value={pdPendingColorBy}
              options={[{ value: 'ne_aggregation', label: `NE (${aggLabel(pdPendingAggregator)})` }, { value: 'value', label: 'Valeur' }]}
              onChange={v => setPdPendingColorBy(v as ColorByKey)} />

            <div className="flex items-center gap-2 ml-auto">
              {pdDirty && <span className="flex items-center gap-1 text-xs text-destructive font-medium animate-pulse"><AlertCircle className="w-3.5 h-3.5" />Non appliqué</span>}
              {pdPendingParams.length === 0 && <span className="text-xs text-destructive">≥1 param</span>}
              <button onClick={pdConfirm} disabled={pdPendingParams.length === 0}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
                <Check className="w-3.5 h-3.5" /> Confirm
              </button>
              <button onClick={pdReset} className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border border-input text-muted-foreground hover:bg-muted/50">
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-3 flex-wrap">
            <MultiSelectFilter label="Vendor" selected={rawPendingVendor} options={availableVendors} onChange={setRawPendingVendor} />
            <MultiSelectFilter label="NetAct" selected={rawPendingDor} options={availableUrs} onChange={setRawPendingDor} />
            <MultiSelectFilter label="DOR" selected={rawPendingDor} options={availableDors} onChange={setRawPendingDor} />
            <MultiSelectFilter label="Plaque" selected={rawPendingPlaque} options={availablePlaques} onChange={setRawPendingPlaque} />
            <MultiSelectFilter label="Site" selected={rawPendingSite} options={availableSites} onChange={setRawPendingSite} />
            <MultiSelectFilter label="Cell" selected={rawPendingCell} options={availableCells} onChange={setRawPendingCell} />

            <div className="flex items-center gap-2 ml-auto">
              {rawDirty && <span className="flex items-center gap-1 text-xs text-destructive font-medium animate-pulse"><AlertCircle className="w-3.5 h-3.5" />Non appliqué</span>}
              <button onClick={rawConfirm} className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
                <Check className="w-3.5 h-3.5" /> Confirm
              </button>
              <button onClick={rawReset} className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border border-input text-muted-foreground hover:bg-muted/50">
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── RESULTS ─── */}
      <div className="flex-1 overflow-auto">

        {/* ═══ PARAM DISTRIBUTION ═══ */}
        {mainTab === 'param_distribution' && (
          <div className="p-3 space-y-3">
            {pdSummary && <div className="text-[10px] text-muted-foreground bg-muted/30 rounded px-3 py-1 border border-border">{pdSummary}</div>}

            {!pdConfirmed ? (
              <div className="flex items-center justify-center h-[50vh] text-muted-foreground">
                <div className="text-center">
                  <Layers className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="font-medium text-xs">Configurez vos filtres</p>
                  <p className="text-[10px] mt-0.5">Sélectionnez ≥1 paramètre puis cliquez <strong>Confirm</strong></p>
                </div>
              </div>
            ) : pdLoading ? (
              <div className="space-y-2">
                <div className="flex gap-2"><Skeleton className="h-14 flex-1" /><Skeleton className="h-14 flex-1" /></div>
                <Skeleton className="h-[240px]" />
                <Skeleton className="h-[120px]" />
              </div>
            ) : pdData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-xs">
                <div className="text-center"><Search className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="font-medium">Aucun résultat</p></div>
              </div>
            ) : (
              <div className="space-y-3">

                {/* ─ KPI tiles (2 compact) ─ */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
                    <div>
                      <div className="text-xl font-bold text-foreground">{globalDistribution[0]?.pct || 0}%</div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">{globalDistribution[0]?.value || '—'}</div>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      <div>{globalDistribution[0]?.count || 0} / {pdData.length} cells</div>
                      <div className="mt-0.5">{globalDistribution.length} distinct values</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="flex gap-1.5 flex-wrap">
                      {globalDistribution.slice(0, 6).map((g, i) => (
                        <div key={g.value} className="flex items-center gap-1 text-[10px]">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span className="text-muted-foreground truncate max-w-[60px]">{g.value}</span>
                          <span className="font-semibold text-foreground">{g.pct}%</span>
                        </div>
                      ))}
                      {globalDistribution.length > 6 && <span className="text-[9px] text-muted-foreground">+{globalDistribution.length - 6}</span>}
                    </div>
                  </div>
                </div>

                {/* ─ Chart card ─ */}
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold text-foreground">
                        Distribution — {aggLabel(pdAppliedAggregator)}
                      </h3>
                      {/* Stacked/Grouped toggle */}
                      <div className="flex rounded border border-input overflow-hidden">
                        <button onClick={() => setChartMode('stacked')}
                          className={`flex items-center gap-0.5 px-2 py-[2px] text-[9px] font-medium ${chartMode === 'stacked' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}>
                          <AlignStartVertical className="w-2.5 h-2.5" /> Stacked
                        </button>
                        <button onClick={() => setChartMode('grouped')}
                          className={`flex items-center gap-0.5 px-2 py-[2px] text-[9px] font-medium ${chartMode === 'grouped' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}>
                          <BarChart3 className="w-2.5 h-2.5" /> Grouped
                        </button>
                      </div>
                      {/* Show labels toggle */}
                      <button onClick={() => setShowLabels(v => !v)}
                        className={`flex items-center gap-0.5 px-2 py-[2px] text-[9px] font-medium rounded border border-input ${showLabels ? 'bg-accent text-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}>
                        {showLabels ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />} Valeurs
                      </button>
                    </div>
                    <button onClick={() => exportCSV(pdData)} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80">
                      <Download className="w-3 h-3" /> Export
                    </button>
                  </div>

                  {chartData.length > 0 ? (
                    <div className="flex justify-center overflow-x-auto">
                      <div style={{ width: chartWidth, height: chartHeight, minWidth: 520 }}>
                        <ReactEChartsCore
                          echarts={echarts}
                          option={echartsOption}
                          style={{ width: '100%', height: '100%' }}
                          notMerge={true}
                          opts={{ renderer: 'canvas' }}
                        />
                      </div>
                    </div>
                  ) : <p className="text-[10px] text-muted-foreground">Aucune donnée</p>}
                </div>

                {/* ─ Table (compact redesign) ─ */}
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="overflow-auto max-h-[280px]">
                    <Table>
                      <TableHeader className="sticky top-0 z-10">
                        <TableRow className="bg-muted/70">
                          <TableHead className="text-[10px] font-semibold cursor-pointer select-none w-[140px]" onClick={() => toggleDistSort('_key')}>
                            <span className="flex items-center gap-0.5">
                              {colorBy === 'value' ? aggLabel(pdAppliedAggregator) : 'Valeur'}
                              {distSortCol === '_key' && <ArrowUpDown className="w-2.5 h-2.5 text-primary" />}
                            </span>
                          </TableHead>
                          <TableHead className="text-[10px] font-semibold text-right cursor-pointer select-none w-[60px]" onClick={() => toggleDistSort('total')}>
                            <span className="flex items-center justify-end gap-0.5">
                              Total
                              {distSortCol === 'total' && <ArrowUpDown className="w-2.5 h-2.5 text-primary" />}
                            </span>
                          </TableHead>
                          {distTableColumns.valueKeys.map(vk => (
                            <TableHead key={vk} className="text-[10px] font-semibold text-right cursor-pointer select-none" onClick={() => toggleDistSort(vk)}>
                              <span className="flex items-center justify-end gap-0.5">
                                {vk}
                                {distSortCol === vk && <ArrowUpDown className="w-2.5 h-2.5 text-primary" />}
                              </span>
                            </TableHead>
                          ))}
                          <TableHead className="text-[10px] font-semibold w-[80px]">Répartition</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedChartData.map((row, idx) => (
                          <TableRow key={idx} className={`${idx % 2 === 0 ? '' : 'bg-muted/20'} h-[44px]`}>
                            <TableCell className="text-[10px] font-medium py-1">{row._key}</TableCell>
                            <TableCell className="text-[10px] font-mono text-right py-1">{row.total}</TableCell>
                            {distTableColumns.valueKeys.map(vk => {
                              const detail = row._details.find((d: any) => d.value === vk);
                              return (
                                <TableCell key={vk} className="text-[10px] font-mono text-right py-1 text-muted-foreground">
                                  {detail ? <><span className="text-foreground">{detail.count}</span> <span className="text-[9px]">({detail.pct}%)</span></> : '—'}
                                </TableCell>
                              );
                            })}
                            <TableCell className="py-1"><MiniBar details={row._details} total={row.total} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ RAW PARAMETERS ═══ */}
        {mainTab === 'raw_parameter' && (
          <div className="p-3 space-y-2">
            {rawSummary && <div className="text-[10px] text-muted-foreground bg-muted/30 rounded px-3 py-1 border border-border">{rawSummary}</div>}

            {!rawConfirmed ? (
              <div className="flex items-center justify-center h-[50vh] text-muted-foreground">
                <div className="text-center">
                  <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="font-medium text-xs">Configurez vos filtres</p>
                  <p className="text-[10px] mt-0.5">Puis cliquez <strong>Confirm</strong></p>
                </div>
              </div>
            ) : rawLoading ? (
              <div className="space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-[360px]" /></div>
            ) : rawData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-xs">
                <div className="text-center"><Search className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="font-medium">Aucun résultat</p></div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input placeholder="Rechercher..." value={rawSearch} onChange={e => { setRawSearch(e.target.value); setRawPage(1); }} className="pl-7 h-7 text-[10px]" />
                  </div>
                  <Badge variant="secondary" className="text-[9px] h-5">{rawFiltered.length} rows</Badge>
                  <button onClick={() => exportCSV(rawFiltered)} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-primary text-primary-foreground hover:bg-primary/90">
                    <Download className="w-3 h-3" /> CSV
                  </button>
                </div>

                <div className="rounded-lg border border-border overflow-hidden bg-card">
                  <div className="max-h-[calc(100vh-260px)] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 z-10">
                        <TableRow className="bg-muted/70">
                          {[
                            { key: 'site_name', label: 'Site' }, { key: 'cell_name', label: 'Cell' },
                            { key: 'parameter', label: 'Param' }, { key: 'value', label: 'Value' },
                            { key: 'dor', label: 'DOR' }, { key: 'plaque', label: 'Plaque' },
                            { key: 'vendor', label: 'Vendor' }, { key: 'bande', label: 'Bande' },
                          ].map(col => (
                            <TableHead key={col.key} className="text-[10px] font-semibold cursor-pointer select-none hover:text-foreground py-1.5" onClick={() => toggleRawSort(col.key)}>
                              <span className="flex items-center gap-0.5">
                                {col.label}
                                {rawSortCol === col.key && <span className="text-primary text-[8px]">{rawSortDir === 'asc' ? '▲' : '▼'}</span>}
                              </span>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rawPageData.map((row, idx) => (
                          <TableRow key={row.id} className={`${idx % 2 === 0 ? '' : 'bg-muted/20'} h-[36px]`}>
                            <TableCell className="text-[10px] font-medium py-1">{row.site_name || '—'}</TableCell>
                            <TableCell className="text-[10px] py-1">{row.cell_name || '—'}</TableCell>
                            <TableCell className="text-[10px] font-mono py-1">{row.parameter}</TableCell>
                            <TableCell className="py-1"><Badge variant="outline" className="text-[9px] font-mono h-4 px-1">{row.value || '—'}</Badge></TableCell>
                            <TableCell className="text-[10px] py-1">{row.dor || '—'}</TableCell>
                            <TableCell className="text-[10px] py-1">{row.plaque || '—'}</TableCell>
                            <TableCell className="text-[10px] py-1">{row.vendor || '—'}</TableCell>
                            <TableCell className="text-[10px] py-1">{row.bande || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-[9px] text-muted-foreground">
                    Page {rawPage}/{rawTotalPages} — {((rawPage - 1) * RAW_PAGE_SIZE) + 1}–{Math.min(rawPage * RAW_PAGE_SIZE, rawFiltered.length)} / {rawFiltered.length}
                  </p>
                  <div className="flex items-center gap-0.5">
                    <button disabled={rawPage <= 1} onClick={() => setRawPage(p => p - 1)}
                      className="p-1 rounded border border-input text-muted-foreground hover:bg-muted/50 disabled:opacity-30">
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                    <button disabled={rawPage >= rawTotalPages} onClick={() => setRawPage(p => p + 1)}
                      className="p-1 rounded border border-input text-muted-foreground hover:bg-muted/50 disabled:opacity-30">
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TopologiePage;
