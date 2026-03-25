import React from 'react';
import ReactECharts from 'echarts-for-react';
import { fetchBreakdownData, fetchTimeSeriesData } from './investigatorApi';
import { fetchExplain } from '../kpi-monitor/api/kpiMonitorApi';
import { DataPoint } from './types';
import { Info, BarChart3, TrendingUp, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  selectedKpis: string[];
  layout: 1 | 2 | 4;
  dateFrom?: string;
  dateTo?: string;
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

const KPIBreakdown: React.FC<Props> = ({ selectedKpis, layout, dateFrom = '2026-01-01', dateTo = '2026-03-24' }) => {
  const cols = layout === 1 ? 1 : 2;
  const [breakData, setBreakData] = React.useState<Record<string, any[]>>({});
  const [explainData, setExplainData] = React.useState<Record<string, KpiExplain>>({});
  const [counterTs, setCounterTs] = React.useState<Record<string, DataPoint[]>>({});
  const [activeView, setActiveView] = React.useState<Record<string, 'chart' | 'formula' | 'breakdown'>>({});

  React.useEffect(() => {
    selectedKpis.forEach(kpiId => {
      // Fetch breakdown (pie)
      fetchBreakdownData(kpiId, dateFrom, dateTo).then(slices => {
        setBreakData(prev => ({ ...prev, [kpiId]: slices }));
      }).catch(() => {});

      // Fetch formula explain
      fetchExplain(kpiId).then((data: any) => {
        setExplainData(prev => ({ ...prev, [kpiId]: data }));
      }).catch(() => {});

      // Fetch timeseries for this KPI (daily)
      fetchTimeSeriesData([kpiId], dateFrom, dateTo, '1d').then(ts => {
        setCounterTs(prev => ({ ...prev, [kpiId]: ts }));
      }).catch(() => {});

      // Default view
      setActiveView(prev => ({ ...prev, [kpiId]: prev[kpiId] || 'chart' }));
    });
  }, [selectedKpis, dateFrom, dateTo]);

  return (
    <div className={`grid gap-4 ${cols === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {selectedKpis.filter(Boolean).map((kpiId, idx) => {
        const explain = explainData[kpiId];
        const slices = breakData[kpiId] || [];
        const ts = counterTs[kpiId] || [];
        const view = activeView[kpiId] || 'chart';
        const color = COLORS[idx % COLORS.length];

        // Timeseries chart option
        const tsOption = {
          tooltip: {
            trigger: 'axis' as const,
            backgroundColor: 'rgba(15,23,42,0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            textStyle: { color: '#f8fafc', fontSize: 11 },
          },
          grid: { left: 50, right: 20, top: 10, bottom: 25 },
          xAxis: {
            type: 'category' as const,
            data: ts.map(p => p.timestamp?.slice(5, 10)),
            axisLabel: { color: '#6b7280', fontSize: 9 },
            axisLine: { lineStyle: { color: '#374151' } },
          },
          yAxis: {
            type: 'value' as const,
            axisLabel: { color: '#6b7280', fontSize: 9 },
            splitLine: { lineStyle: { color: 'rgba(55,65,81,0.3)' } },
          },
          series: [{
            type: 'line' as const,
            data: ts.map(p => p.value),
            smooth: true,
            lineStyle: { width: 2, color },
            areaStyle: { color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + '30' }, { offset: 1, color: color + '05' }] } },
            itemStyle: { color },
            symbolSize: 3,
          }],
        };

        // Pie chart option  
        const pieOption = slices.length > 0 ? {
          tooltip: {
            trigger: 'item' as const,
            backgroundColor: 'rgba(15,23,42,0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            textStyle: { color: '#f8fafc', fontSize: 11 },
          },
          legend: { bottom: 0, textStyle: { color: '#9ca3af', fontSize: 9 } },
          series: [{
            type: 'pie' as const,
            radius: ['30%', '60%'],
            center: ['50%', '45%'],
            data: slices.map(s => ({ name: s.name, value: s.value, itemStyle: { color: s.color } })),
            label: { show: true, color: '#9ca3af', fontSize: 9, formatter: '{b}: {d}%' },
          }],
        } : null;

        // Parse counter names from formula
        const extractCounters = (formula: string) => {
          if (!formula) return [];
          const matches = formula.match(/`([^`]+)`/g) || [];
          return matches.map(m => m.replace(/`/g, ''));
        };

        const numCounters = explain ? extractCounters(explain.numerator) : [];
        const denCounters = explain ? extractCounters(explain.denominator) : [];

        return (
          <div key={kpiId} className="rounded-xl border border-border/60 bg-card overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-tight">
                    {explain?.display_name || kpiId}
                  </h3>
                  {explain && (
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-muted text-muted-foreground">
                      {explain.formula_type} · {explain.unit || 'ratio'}
                    </span>
                  )}
                </div>
                {/* View switcher */}
                <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border/40">
                  {([
                    { key: 'chart' as const, icon: TrendingUp, label: 'Trend' },
                    { key: 'formula' as const, icon: Calculator, label: 'Formula' },
                    { key: 'breakdown' as const, icon: BarChart3, label: 'Breakdown' },
                  ]).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveView(prev => ({ ...prev, [kpiId]: tab.key }))}
                      className={cn(
                        'flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-bold transition-all',
                        view === tab.key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <tab.icon className="w-3 h-3" />
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              {explain?.description && (
                <p className="text-[10px] text-muted-foreground mt-1">{explain.description}</p>
              )}
            </div>

            {/* Content */}
            <div className="p-4">
              {view === 'chart' && (
                <div>
                  {ts.length > 0 ? (
                    <ReactECharts option={tsOption} style={{ height: layout === 1 ? 240 : 180 }} />
                  ) : (
                    <div className="flex items-center justify-center h-40 text-muted-foreground text-xs">No data</div>
                  )}
                </div>
              )}

              {view === 'formula' && (
                <div className="space-y-4">
                  {/* Formula display */}
                  <div className="space-y-3">
                    <div className="rounded-lg bg-muted/30 border border-border/40 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/15 text-green-500 border border-green-500/30">NUM</span>
                        <span className="text-[9px] font-bold text-muted-foreground uppercase">Numerator</span>
                      </div>
                      <code className="text-[10px] text-foreground font-mono leading-relaxed break-all">
                        {explain?.numerator || '—'}
                      </code>
                      {numCounters.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {numCounters.map(c => (
                            <span key={c} className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-green-500/10 text-green-600 border border-green-500/20">{c}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg bg-muted/30 border border-border/40 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/15 text-blue-500 border border-blue-500/30">DEN</span>
                        <span className="text-[9px] font-bold text-muted-foreground uppercase">Denominator</span>
                      </div>
                      <code className="text-[10px] text-foreground font-mono leading-relaxed break-all">
                        {explain?.denominator || '—'}
                      </code>
                      {denCounters.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {denCounters.map(c => (
                            <span key={c} className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">{c}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* KPI metadata */}
                  {explain && (
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {[
                        { label: 'Category', value: explain.category },
                        { label: 'Formula Type', value: explain.formula_type },
                        { label: 'Technology', value: explain.techno },
                        { label: 'Vendor', value: explain.vendor },
                      ].map(item => (
                        <div key={item.label} className="flex items-center gap-2 text-[10px]">
                          <span className="text-muted-foreground font-medium">{item.label}:</span>
                          <span className="font-bold text-foreground">{item.value || '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {view === 'breakdown' && (
                <div>
                  {pieOption ? (
                    <ReactECharts option={pieOption} style={{ height: layout === 1 ? 280 : 200 }} />
                  ) : (
                    <div className="flex items-center justify-center h-40 text-muted-foreground text-xs">
                      No breakdown data available
                    </div>
                  )}
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
