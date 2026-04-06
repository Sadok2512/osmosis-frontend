import React from 'react';
import ReactECharts from 'echarts-for-react';
import { fetchBreakdownData } from './investigatorApi';
import { fetchExplain } from '../kpi-monitor/api/kpiMonitorApi';
import { DataPoint } from './types';
import { BarChart3, TrendingUp, Calculator, Table2, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  selectedKpis: string[];
  layout: 1 | 2 | 4;
  dateFrom?: string;
  dateTo?: string;
  filters?: { dimension: string; values: string[] }[];
  splitBy?: string;
  timeSeriesData?: DataPoint[];
}

interface KpiExplain {
  kpi_key: string;
  display_name: string;
  description: string;
  category: string;
  unit: string;
  formula_type: string;
  numerator: string;
  denominator: string;
  techno: string;
  vendor: string;
}

const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#ef4444','#84cc16','#6366f1','#14b8a6'];
const MUTED_OPACITY = 0.15;

const extractCounters = (formula: string) => {
  if (!formula) return [];
  const matches = formula.match(/`([^`]+)`/g) || [];
  return matches.map(m => m.replace(/`/g, ''));
};

/** Interactive Excel-like table synced with graph */
const CounterTable: React.FC<{
  ts: DataPoint[];
  kpiLabel: string;
  color: string;
  selectedSeries: Set<string>;
  onToggleSeries: (kpi: string) => void;
}> = ({ ts, kpiLabel, color, selectedSeries, onToggleSeries }) => {
  if (ts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        <Table2 className="w-5 h-5 mr-2 opacity-30" /> No data available
      </div>
    );
  }

  const kpis = [...new Set(ts.map(p => p.kpi))];
  const timestamps = [...new Set(ts.map(p => p.timestamp))].sort();
  const lookup: Record<string, Record<string, number>> = {};
  kpis.forEach(k => { lookup[k] = {}; });
  ts.forEach(p => { lookup[p.kpi][p.timestamp] = p.value; });

  const hasSelection = selectedSeries.size > 0;

  const downloadCSV = () => {
    const header = ['Date', ...kpis].join(',');
    const rows = timestamps.map(t => {
      const vals = kpis.map(k => lookup[k]?.[t] ?? '');
      return [t.length > 10 ? t.slice(0, 10) : t, ...vals].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kpiLabel.replace(/\s+/g, '_')}_counters.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden h-full flex flex-col bg-card shadow-sm">
      <div className="px-4 py-3 bg-muted/30 border-b border-border/40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Table2 className="w-4 h-4 text-primary" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">Raw Counters</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground font-medium">{timestamps.length} rows × {kpis.length} cols</span>
          <button
            onClick={downloadCSV}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-border/30 bg-muted/10 flex flex-wrap gap-1.5 shrink-0">
        {kpis.map((k, i) => {
          const isSelected = selectedSeries.has(k);
          const isMuted = hasSelection && !isSelected;
          const seriesColor = COLORS[i % COLORS.length];
          return (
            <button
              key={k}
              onClick={() => onToggleSeries(k)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all border cursor-pointer',
                isSelected
                  ? 'bg-primary/10 border-primary/40 text-primary shadow-sm'
                  : isMuted
                    ? 'bg-muted/20 border-border/20 text-muted-foreground/40'
                    : 'bg-muted/30 border-border/30 text-foreground hover:bg-muted/50'
              )}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 transition-opacity"
                style={{ backgroundColor: seriesColor, opacity: isMuted ? 0.2 : 1 }}
              />
              <span className="truncate max-w-[120px]">{k}</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-auto flex-1">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/60 backdrop-blur-sm">
              <th className="px-4 py-2.5 text-left text-[11px] font-bold text-muted-foreground border-b-2 border-r border-border/40 whitespace-nowrap min-w-[110px] uppercase tracking-wider">
                Date
              </th>
              {kpis.map((k, i) => {
                const isSelected = selectedSeries.has(k);
                const isMuted = hasSelection && !isSelected;
                const seriesColor = COLORS[i % COLORS.length];
                return (
                  <th
                    key={k}
                    onClick={() => onToggleSeries(k)}
                    className={cn(
                      'px-4 py-2.5 text-right text-[11px] font-bold border-b-2 border-r border-border/40 last:border-r-0 whitespace-nowrap min-w-[100px] uppercase tracking-wider cursor-pointer transition-all',
                      isSelected ? 'text-primary bg-primary/5' : isMuted ? 'text-muted-foreground/30' : 'text-muted-foreground hover:bg-muted/40'
                    )}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 transition-opacity"
                        style={{ backgroundColor: seriesColor, opacity: isMuted ? 0.2 : 1 }}
                      />
                      <span className="truncate max-w-[110px]">{k}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {timestamps.map((ts, ti) => (
              <tr
                key={ti}
                className={cn(
                  'border-b border-border/20 hover:bg-primary/[0.04] transition-colors',
                  ti % 2 === 0 ? 'bg-background' : 'bg-muted/[0.06]'
                )}
              >
                <td className="px-4 py-2 text-[12px] text-foreground/70 border-r border-border/20 whitespace-nowrap font-semibold tabular-nums">
                  {ts.length > 10 ? ts.slice(0, 10) : ts}
                </td>
                {kpis.map((k, ki) => {
                  const val = lookup[k]?.[ts];
                  const isSelected = selectedSeries.has(k);
                  const isMuted = hasSelection && !isSelected;
                  const seriesColor = COLORS[ki % COLORS.length];
                  return (
                    <td
                      key={ki}
                      onClick={() => onToggleSeries(k)}
                      className={cn(
                        'px-4 py-2 text-right border-r border-border/20 last:border-r-0 whitespace-nowrap tabular-nums cursor-pointer transition-all',
                        isSelected
                          ? 'font-extrabold text-[13px]'
                          : isMuted
                            ? 'text-muted-foreground/25 text-[12px]'
                            : 'text-foreground font-semibold text-[12px] hover:bg-muted/20'
                      )}
                      style={isSelected ? { color: seriesColor } : undefined}
                    >
                      {val != null ? val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const KPIBreakdown: React.FC<Props> = ({
  selectedKpis,
  layout,
  dateFrom = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
  dateTo = new Date().toISOString().split('T')[0],
  filters = [],
  splitBy,
  timeSeriesData = [],
}) => {
  const cols = layout === 1 ? 1 : 2;
  const [breakData, setBreakData] = React.useState<Record<string, any[]>>({});
  const [explainData, setExplainData] = React.useState<Record<string, KpiExplain>>({});
  const [activeView, setActiveView] = React.useState<Record<string, 'chart' | 'formula' | 'breakdown'>>({});
  const [selectedSeries, setSelectedSeries] = React.useState<Record<string, Set<string>>>({});

  const uniqueKpiIds = React.useMemo(() => [...new Set(selectedKpis.filter(Boolean))], [selectedKpis]);
  const counterTs = React.useMemo(
    () => Object.fromEntries(
      uniqueKpiIds.map((kpiId) => [
        kpiId,
        timeSeriesData.filter((point) => point.kpi === kpiId || point.kpi.startsWith(`${kpiId}@`)),
      ])
    ) as Record<string, DataPoint[]>,
    [uniqueKpiIds, timeSeriesData]
  );

  const breakdownDim = splitBy && splitBy !== 'None'
    ? (splitBy.startsWith('PM_DIM:') ? splitBy.replace('PM_DIM:', '') : splitBy)
    : undefined;

  const toggleSeries = (kpiId: string, seriesName: string) => {
    setSelectedSeries(prev => {
      const current = new Set(prev[kpiId] || []);
      if (current.has(seriesName)) current.delete(seriesName);
      else current.add(seriesName);
      return { ...prev, [kpiId]: current };
    });
  };

  React.useEffect(() => {
    uniqueKpiIds.forEach(kpiId => {
      const currentBreakdownDim = splitBy && splitBy !== 'None' ? (splitBy.startsWith('PM_DIM:') ? splitBy.replace('PM_DIM:', '') : splitBy) : undefined;
      if (currentBreakdownDim) {
        fetchBreakdownData(kpiId, dateFrom, dateTo, currentBreakdownDim, filters).then(slices => {
          setBreakData(prev => ({ ...prev, [kpiId]: slices }));
        }).catch(() => {});
      }
      fetchExplain(kpiId).then((data: any) => {
        setExplainData(prev => ({ ...prev, [kpiId]: data }));
      }).catch(() => {});
      setActiveView(prev => ({ ...prev, [kpiId]: prev[kpiId] || 'chart' }));
    });
  }, [uniqueKpiIds, dateFrom, dateTo, filters, splitBy]);

  return (
    <div className={`grid gap-4 ${cols === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {uniqueKpiIds.map((kpiId, idx) => {
        const explain = explainData[kpiId];
        const slices = breakData[kpiId] || [];
        const ts = counterTs[kpiId] || [];
        const view = activeView[kpiId] || 'chart';
        const color = COLORS[idx % COLORS.length];
        const kpiSelected = selectedSeries[kpiId] || new Set<string>();
        const hasSelection = kpiSelected.size > 0;

        const kpiNames = [...new Set(ts.map(p => p.kpi))];

        const buildSeriesStyle = (seriesKpi: string, seriesIdx: number) => {
          const c = COLORS[seriesIdx % COLORS.length];
          const isSelected = kpiSelected.has(seriesKpi);
          const isMuted = hasSelection && !isSelected;
          return {
            lineStyle: { width: isSelected ? 3.5 : 2.5, color: c, opacity: isMuted ? MUTED_OPACITY : 1 },
            itemStyle: { color: c, opacity: isMuted ? MUTED_OPACITY : 1, borderWidth: isSelected ? 2 : 0, borderColor: '#fff' },
            symbolSize: isSelected ? 8 : 4,
            z: isSelected ? 10 : 1,
          };
        };

        const tsOption = {
          tooltip: {
            trigger: 'axis' as const,
            backgroundColor: 'rgba(15,23,42,0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            textStyle: { color: '#f8fafc', fontSize: 11 },
          },
          grid: { left: 55, right: 20, top: 15, bottom: 30 },
          xAxis: {
            type: 'category' as const,
            data: [...new Set(ts.map(p => p.timestamp))].sort().map(t => t?.slice(5, 10)),
            axisLabel: { color: '#6b7280', fontSize: 10 },
            axisLine: { lineStyle: { color: '#e5e7eb' } },
          },
          yAxis: {
            type: 'value' as const,
            axisLabel: { color: '#6b7280', fontSize: 10 },
            splitLine: { lineStyle: { color: '#f3f4f6' } },
          },
          series: kpiNames.map((kName, ki) => {
            const seriesTs = ts.filter(p => p.kpi === kName);
            const style = buildSeriesStyle(kName, ki);
            return {
              name: kName,
              type: 'line' as const,
              data: seriesTs.map(p => p.value),
              smooth: true,
              symbol: 'circle',
              ...style,
            };
          }),
        };

        const pieOption = slices.length > 0 ? {
          tooltip: { trigger: 'item' as const, backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(255,255,255,0.08)', textStyle: { color: '#f8fafc', fontSize: 11 } },
          legend: { bottom: 0, textStyle: { color: '#6b7280', fontSize: 10 } },
          series: [{ type: 'pie' as const, radius: ['30%', '60%'], center: ['50%', '45%'], data: slices.map(s => ({ name: s.name, value: s.value, itemStyle: { color: s.color } })), label: { show: true, color: '#6b7280', fontSize: 10, formatter: '{b}: {d}%' } }],
        } : null;

        const numCounters = explain ? extractCounters(explain.numerator) : [];
        const denCounters = explain ? extractCounters(explain.denominator) : [];

        return (
          <div key={kpiId} className="rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-border/40 bg-muted/15">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: color }} />
                  <h3 className="text-[13px] font-bold text-foreground tracking-tight">
                    {explain?.display_name || kpiId}
                  </h3>
                  {explain && (
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-muted/60 text-muted-foreground border border-border/30">
                      {explain.formula_type} · {explain.unit || 'ratio'}
                    </span>
                  )}
                </div>
                <div className="flex items-center bg-muted/40 p-0.5 rounded-lg border border-border/30">
                  {([
                    { key: 'chart' as const, icon: TrendingUp, label: 'Trend' },
                    { key: 'formula' as const, icon: Calculator, label: 'Formula' },
                    { key: 'breakdown' as const, icon: BarChart3, label: 'Breakdown' },
                  ]).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveView(prev => ({ ...prev, [kpiId]: tab.key }))}
                      className={cn(
                        'flex items-center gap-1 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all',
                        view === tab.key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <tab.icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              {explain?.description && (
                <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{explain.description}</p>
              )}
            </div>

            <div className="p-5" style={{ backgroundColor: '#ffffff' }}>
              {view === 'chart' && (
                <div>
                  {ts.length > 0 ? (
                    <ReactECharts option={tsOption} style={{ height: layout === 1 ? 260 : 200 }} />
                  ) : (
                    <div className="flex items-center justify-center h-40 text-muted-foreground text-xs">No data</div>
                  )}
                </div>
              )}

              {view === 'formula' && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="rounded-lg bg-muted/20 border border-border/30 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/15 text-green-600 border border-green-500/30">NUM</span>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Numerator</span>
                      </div>
                      <code className="text-[11px] text-foreground font-mono leading-relaxed break-all">{explain?.numerator || '—'}</code>
                      {numCounters.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {numCounters.map(c => (
                            <span key={c} className="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold bg-green-500/10 text-green-600 border border-green-500/20">{c}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg bg-muted/20 border border-border/30 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-500 border border-blue-500/30">DEN</span>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Denominator</span>
                      </div>
                      <code className="text-[11px] text-foreground font-mono leading-relaxed break-all">{explain?.denominator || '—'}</code>
                      {denCounters.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {denCounters.map(c => (
                            <span key={c} className="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">{c}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {explain && (
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      {[
                        { label: 'Category', value: explain.category },
                        { label: 'Formula Type', value: explain.formula_type },
                        { label: 'Technology', value: explain.techno },
                        { label: 'Vendor', value: explain.vendor },
                      ].map(item => (
                        <div key={item.label} className="flex items-center gap-2 text-[11px]">
                          <span className="text-muted-foreground font-medium">{item.label}:</span>
                          <span className="font-bold text-foreground">{item.value || '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {view === 'breakdown' && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5" style={{ minHeight: layout === 1 ? 340 : 260 }}>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className="w-4 h-4 text-primary" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">Breakdown by {breakdownDim}</span>
                    </div>
                    {pieOption ? (
                      <div className="rounded-xl border border-border/30 bg-white p-3 flex-1 shadow-sm">
                        <ReactECharts option={pieOption} style={{ height: layout === 1 ? 280 : 220, width: '100%' }} />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center flex-1 text-muted-foreground text-xs rounded-xl border border-border/30 bg-white">
                        No breakdown data available
                      </div>
                    )}
                  </div>

                  <CounterTable
                    ts={ts}
                    kpiLabel={explain?.display_name || kpiId}
                    color={color}
                    selectedSeries={kpiSelected}
                    onToggleSeries={(series) => toggleSeries(kpiId, series)}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default KPIBreakdown;
