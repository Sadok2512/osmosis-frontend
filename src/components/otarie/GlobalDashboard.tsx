import React, { useEffect, useState, useMemo } from 'react';
import {
  Activity, Radio, Ruler, Target, RefreshCw, Maximize2, X, BarChart3
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { Filters } from '../../types';
import { fetchDashboardSnapshot } from '../../services/mockData';
import TCPAnalytics from './TCPAnalytics';

/* ─── types ─── */
interface GlobalDashboardProps {
  filters: Filters;
  onFilterChange?: (filters: Filters) => void;
}

type SubTab = 'RF_OVERVIEW' | 'TCP_ANALYSE';

/* ─── mock RF data generators ─── */
const rand = (min: number, max: number) => min + Math.random() * (max - min);

function generateRFSnapshot() {
  const overshootPct = rand(4, 28);
  return {
    overshootingFactor: overshootPct,
    overshootSeverity: overshootPct > 20 ? 'red' : overshootPct > 12 ? 'orange' : 'green',
    interSiteDistance: rand(0.8, 3.5),
    avgUeDistance: rand(0.3, 2.1),
  };
}

function generateDistanceTrend(days = 14) {
  const now = new Date('2026-02-10');
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    return { date: d.toISOString().slice(0, 10), avgDist: rand(0.4, 2.0) };
  });
}

function generateRACHHistogram() {
  const raw = [rand(15, 30), rand(25, 40), rand(15, 30), rand(8, 20), rand(2, 10)];
  const total = raw.reduce((a, b) => a + b, 0);
  const bins = ['0–500 m', '500 m–1 km', '1–2 km', '2–5 km', '> 5 km'];
  return bins.map((label, i) => ({ bin: label, pct: (raw[i] / total) * 100 }));
}

/* ─── severity color map ─── */
const severityColor: Record<string, string> = {
  green: 'text-emerald-500',
  orange: 'text-orange-500',
  red: 'text-destructive',
};
const severityBg: Record<string, string> = {
  green: 'bg-emerald-500/10',
  orange: 'bg-orange-500/10',
  red: 'bg-destructive/10',
};

/* ─── component ─── */
const GlobalDashboard: React.FC<GlobalDashboardProps> = ({ filters, onFilterChange }) => {
  const [activeTab, setActiveTab] = useState<SubTab>('RF_OVERVIEW');
  const [loading, setLoading] = useState(true);
  const [rfSnap, setRfSnap] = useState<ReturnType<typeof generateRFSnapshot> | null>(null);
  const [distTrend, setDistTrend] = useState<ReturnType<typeof generateDistanceTrend>>([]);
  const [rachHist, setRachHist] = useState<ReturnType<typeof generateRACHHistogram>>([]);
  const [graphTab, setGraphTab] = useState<'trend' | 'rach'>('trend');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      setRfSnap(generateRFSnapshot());
      setDistTrend(generateDistanceTrend());
      setRachHist(generateRACHHistogram());
      setLoading(false);
    }, 400);
    return () => clearTimeout(t);
  }, [filters]);

  /* ─── ECharts: Distance Trend ─── */
  const trendOption = useMemo(() => ({
    tooltip: { trigger: 'axis' as const, backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', textStyle: { color: 'hsl(var(--foreground))' } },
    grid: { top: 30, right: 20, bottom: 30, left: 50 },
    xAxis: { type: 'category' as const, data: distTrend.map(d => d.date.slice(5)), axisLabel: { color: 'hsl(var(--muted-foreground))', fontSize: 10 }, axisLine: { lineStyle: { color: 'hsl(var(--border))' } } },
    yAxis: { type: 'value' as const, name: 'km', nameTextStyle: { color: 'hsl(var(--muted-foreground))', fontSize: 10 }, axisLabel: { color: 'hsl(var(--muted-foreground))', fontSize: 10, formatter: '{value}' }, splitLine: { lineStyle: { color: 'hsl(var(--border))', opacity: 0.4 } } },
    series: [{
      type: 'line', data: distTrend.map(d => +d.avgDist.toFixed(2)), smooth: true,
      lineStyle: { width: 2.5, color: 'hsl(var(--primary))' },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'hsla(var(--primary), 0.25)' }, { offset: 1, color: 'hsla(var(--primary), 0.02)' }] } },
      itemStyle: { color: 'hsl(var(--primary))' }, symbol: 'circle', symbolSize: 5,
    }],
  }), [distTrend]);

  /* ─── ECharts: RACH Histogram ─── */
  const rachColors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];
  const rachOption = useMemo(() => ({
    tooltip: { trigger: 'axis' as const, backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', textStyle: { color: 'hsl(var(--foreground))' }, formatter: (p: any) => `${p[0].name}<br/>${p[0].value.toFixed(1)} %` },
    grid: { top: 20, right: 20, bottom: 40, left: 50 },
    xAxis: { type: 'category' as const, data: rachHist.map(r => r.bin), axisLabel: { color: 'hsl(var(--muted-foreground))', fontSize: 10, rotate: 0 }, axisLine: { lineStyle: { color: 'hsl(var(--border))' } } },
    yAxis: { type: 'value' as const, name: '%', nameTextStyle: { color: 'hsl(var(--muted-foreground))', fontSize: 10 }, axisLabel: { color: 'hsl(var(--muted-foreground))', fontSize: 10 }, splitLine: { lineStyle: { color: 'hsl(var(--border))', opacity: 0.4 } } },
    series: [{
      type: 'bar', data: rachHist.map((r, i) => ({ value: +r.pct.toFixed(1), itemStyle: { color: rachColors[i], borderRadius: [4, 4, 0, 0] } })),
      barWidth: '50%',
    }],
  }), [rachHist]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 bg-background">
      <RefreshCw className="w-10 h-10 text-primary animate-spin" />
      <p className="text-sm font-semibold text-muted-foreground">Calcul des indicateurs RF…</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Expanded overlay */}
      {expanded && (
        <div className="absolute inset-0 z-[100] bg-card/95 backdrop-blur-xl flex flex-col p-10">
          <div className="flex items-center justify-between mb-8 border-b border-border pb-6">
            <h2 className="text-xl font-bold text-foreground">{graphTab === 'trend' ? 'Distance Moyenne — Trend' : 'RACH Distribution'}</h2>
            <button onClick={() => setExpanded(false)} className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-xl text-xs font-semibold"><X className="w-4 h-4" /> Fermer</button>
          </div>
          <div className="flex-1">
            <ReactECharts option={graphTab === 'trend' ? trendOption : rachOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>
      )}

      {/* Sub-tab bar */}
      <div className="bg-card border-b border-border px-8 py-3 sticky top-0 z-20 flex items-center justify-between shadow-sm">
        <div className="flex gap-2">
          {(['RF_OVERVIEW', 'TCP_ANALYSE'] as SubTab[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 text-xs font-semibold rounded-xl transition-all ${activeTab === tab ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:bg-muted'}`}>
              {tab === 'TCP_ANALYSE' ? 'TCP Analyse' : 'RF Overview'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-medium text-muted-foreground">Live</span>
          <span className="text-xs font-medium text-muted-foreground">{filters.dt}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'RF_OVERVIEW' && rfSnap && (
          <div className="h-full overflow-y-auto p-8 space-y-8 pb-32">
            {/* ─── RF KPI Cards ─── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Overshooting Factor */}
              <div className="bg-card p-6 rounded-2xl border border-border shadow-sm hover:shadow-lg transition-all group">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-2.5 rounded-xl ${severityBg[rfSnap.overshootSeverity]}`}>
                    <Target className={`w-5 h-5 ${severityColor[rfSnap.overshootSeverity]}`} />
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${severityBg[rfSnap.overshootSeverity]} ${severityColor[rfSnap.overshootSeverity]}`}>
                    {rfSnap.overshootSeverity === 'green' ? 'Normal' : rfSnap.overshootSeverity === 'orange' ? 'Warning' : 'Critical'}
                  </span>
                </div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Overshooting Factor</p>
                <p className={`text-3xl font-bold tracking-tight ${severityColor[rfSnap.overshootSeverity]}`}>{rfSnap.overshootingFactor.toFixed(1)}%</p>
                <p className="text-[10px] text-muted-foreground mt-2">% UE connectés au-delà du seuil</p>
              </div>

              {/* Inter-site Distance */}
              <div className="bg-card p-6 rounded-2xl border border-border shadow-sm hover:shadow-lg transition-all group">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-xl bg-primary/10">
                    <Ruler className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-muted text-muted-foreground">Avg</span>
                </div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Inter-site Distance</p>
                <p className="text-3xl font-bold tracking-tight text-primary">{rfSnap.interSiteDistance.toFixed(2)} km</p>
                <p className="text-[10px] text-muted-foreground mt-2">Distance moyenne vers voisins</p>
              </div>

              {/* Average UE Distance */}
              <div className="bg-card p-6 rounded-2xl border border-border shadow-sm hover:shadow-lg transition-all group">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-xl bg-accent/50">
                    <Radio className="w-5 h-5 text-accent-foreground" />
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-muted text-muted-foreground">P50</span>
                </div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Distance Moyenne UE</p>
                <p className="text-3xl font-bold tracking-tight text-foreground">{rfSnap.avgUeDistance.toFixed(2)} km</p>
                <p className="text-[10px] text-muted-foreground mt-2">Distance UE ↔ cellule servante</p>
              </div>
            </div>

            {/* ─── Graph Section ─── */}
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="flex gap-2">
                  <button onClick={() => setGraphTab('trend')}
                    className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${graphTab === 'trend' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                    <span className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Distance Trend</span>
                  </button>
                  <button onClick={() => setGraphTab('rach')}
                    className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${graphTab === 'rach' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                    <span className="flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> RACH Distribution</span>
                  </button>
                </div>
                <button onClick={() => setExpanded(true)} className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6" style={{ height: 340 }}>
                <ReactECharts option={graphTab === 'trend' ? trendOption : rachOption} style={{ height: '100%', width: '100%' }} />
              </div>
            </div>
          </div>
        )}
        {activeTab === 'TCP_ANALYSE' && <div className="h-full flex flex-col overflow-hidden"><TCPAnalytics filters={filters} onFilterChange={onFilterChange} /></div>}
      </div>
    </div>
  );
};

export default GlobalDashboard;
