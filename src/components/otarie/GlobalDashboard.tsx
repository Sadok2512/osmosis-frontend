import React, { useEffect, useState, useMemo } from 'react';
import {
  Activity, ShieldCheck, TrendingUp, Zap, Sliders, ChevronDown, ChevronUp,
  Check, Flag, Eye, Layers, Palette, Calendar, RotateCcw, Plus, Trash2, Gauge,
  Maximize2, X, BarChart3, Target, Cpu, RefreshCw
} from 'lucide-react';
import {
  GlobalTimeSeriesPoint, Filters, QoEChartPayload, KPIType, Milestone
} from '../../types';
import {
  fetchGlobalTimeSeries, fetchDashboardSnapshot
} from '../../services/mockData';
import QoEChart from './QoEChart';
import TCPAnalytics from './TCPAnalytics';

interface GlobalDashboardProps {
  filters: Filters;
  onFilterChange?: (filters: Filters) => void;
}

type SubTab = 'OVERVIEW' | 'TCP_ANALYSE' | 'AI_ANALYSIS';

const GlobalDashboard: React.FC<GlobalDashboardProps> = ({ filters, onFilterChange }) => {
  const [activeTab, setActiveTab] = useState<SubTab>('OVERVIEW');
  const [snapshot, setSnapshot] = useState<any>(null);
  const [timeSeries, setTimeSeries] = useState<GlobalTimeSeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showParams, setShowParams] = useState(false);
  const [expandedChart, setExpandedChart] = useState<{ title: string; kpi: string; color: string } | null>(null);

  const [localMilestones, setLocalMilestones] = useState<Milestone[]>(filters.milestones || []);
  const [localThresholds, setLocalThresholds] = useState<Record<string, number>>(filters.thresholds || {});
  const [localVisibility, setLocalVisibility] = useState(filters.visibility);
  const [localBgKpi, setLocalBgKpi] = useState(filters.backgroundKpi || 'sessions');
  const [localBgOpacity, setLocalBgOpacity] = useState(filters.backgroundOpacity || 0.1);
  const [localKpiColors, setLocalKpiColors] = useState<Record<string, string>>(filters.kpiColors || {});
  const [newMilestoneDate, setNewMilestoneDate] = useState('');
  const [newMilestoneLabel, setNewMilestoneLabel] = useState('');

  useEffect(() => {
    setLocalMilestones(filters.milestones || []);
    setLocalThresholds(filters.thresholds || {});
    setLocalVisibility(filters.visibility);
    setLocalBgKpi(filters.backgroundKpi || 'sessions');
    setLocalBgOpacity(filters.backgroundOpacity || 0.1);
    setLocalKpiColors(filters.kpiColors || {});
  }, [filters]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [snap, ts] = await Promise.all([
        fetchDashboardSnapshot(filters),
        fetchGlobalTimeSeries(filters),
      ]);
      setSnapshot(snap);
      setTimeSeries(ts);
      setLoading(false);
    };
    loadData();
  }, [filters]);

  const handleApplyParams = () => {
    onFilterChange?.({
      ...filters,
      milestones: localMilestones,
      thresholds: localThresholds,
      visibility: localVisibility,
      backgroundKpi: localBgKpi,
      backgroundOpacity: localBgOpacity,
      kpiColors: localKpiColors,
    });
    setShowParams(false);
  };

  const addMilestone = () => {
    if (!newMilestoneDate || !newMilestoneLabel) return;
    setLocalMilestones([...localMilestones, { dt: newMilestoneDate, label: newMilestoneLabel }]);
    setNewMilestoneDate('');
    setNewMilestoneLabel('');
  };

  const chartPayload = useMemo((): QoEChartPayload => ({
    from: timeSeries[0]?.t || '',
    to: timeSeries[timeSeries.length - 1]?.t || '',
    granularity: 'day',
    series: timeSeries.map(s => ({
      t: s.t, v: 0, qoe: s.qoe, throughput: s.throughput, throughput_ul: s.throughput_ul,
      latency: s.latency, loss: s.loss * 100, traffic: s.traffic, traffic_ul: s.traffic_ul,
      sessions: s.sessions, dms_dl_3: s.dms_dl_3, dms_dl_8: s.dms_dl_8, dms_dl_30: s.dms_dl_30, dms_ul_3: s.dms_ul_3,
    })),
    events: [],
  }), [timeSeries]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 bg-background">
      <RefreshCw className="w-10 h-10 text-primary animate-spin" />
      <p className="text-sm font-semibold text-muted-foreground">Calcul des agrégats QoE & TCP…</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Expanded chart overlay */}
      {expandedChart && (
        <div className="absolute inset-0 z-[100] bg-card/95 backdrop-blur-xl flex flex-col p-10">
          <div className="flex items-center justify-between mb-10 border-b border-border pb-8">
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground shadow-xl">
                <Maximize2 className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground tracking-tight">{expandedChart.title}</h2>
                <p className="text-xs text-muted-foreground mt-1">Focus Analytique · NOC OTARIE</p>
              </div>
            </div>
            <button onClick={() => setExpandedChart(null)} className="flex items-center gap-3 px-5 py-2.5 bg-foreground text-background rounded-xl font-semibold text-xs">
              <X className="w-4 h-4" /> Fermer
            </button>
          </div>
          <div className="flex-1 bg-card rounded-3xl border border-border p-10 shadow-lg overflow-hidden">
            <QoEChart
              payload={chartPayload}
              selectedKpi={expandedChart.kpi}
              kpiLabel={expandedChart.title}
              color={expandedChart.color}
              type="area"
              showSessions={filters.visibility?.showSessions}
              showPoints={filters.visibility?.showPoints}
              secondaryKpi={filters.backgroundKpi}
              backgroundOpacity={filters.backgroundOpacity}
              threshold={filters.visibility?.showThresholds ? (filters.thresholds as any)[expandedChart.kpi] : undefined}
              height="100%"
            />
          </div>
        </div>
      )}

      {/* Sub-tab bar */}
      <div className="bg-card border-b border-border px-8 py-3 sticky top-0 z-20 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            {(['OVERVIEW', 'TCP_ANALYSE', 'AI_ANALYSIS'] as SubTab[]).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-5 py-2 text-xs font-semibold rounded-xl transition-all ${
                  activeTab === tab ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:bg-muted'
                }`}>
                {tab === 'TCP_ANALYSE' ? 'TCP Analyse' : tab === 'AI_ANALYSIS' ? 'AI Analysis' : 'Overview'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowParams(!showParams)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
              showParams ? 'bg-foreground text-background border-foreground shadow-md' : 'bg-card text-muted-foreground border-border hover:bg-muted'
            }`}>
            <Sliders className="w-3.5 h-3.5" /> Paramètres
            {showParams ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-muted-foreground">Live</span>
          </div>
          <span className="text-xs font-medium text-muted-foreground">{filters.dt}</span>
        </div>
      </div>

      {/* Parameters panel */}
      {showParams && (
        <div className="bg-card border-b border-border px-8 py-6 shadow-inner">
          <div className="flex flex-wrap gap-6 items-end">
            <div className="flex flex-col gap-3 bg-muted/50 p-5 rounded-2xl border border-border min-w-[380px]">
              <span className="text-xs font-semibold text-foreground flex items-center gap-2">
                <Flag className="w-3.5 h-3.5 text-destructive" /> Jalons
              </span>
              <div className="flex items-center gap-3">
                <input type="date" value={newMilestoneDate} onChange={(e) => setNewMilestoneDate(e.target.value)}
                  className="flex-1 h-9 bg-card border border-border rounded-lg px-3 text-xs font-medium outline-none focus:border-primary" />
                <input type="text" value={newMilestoneLabel} placeholder="Nom…" onChange={(e) => setNewMilestoneLabel(e.target.value)}
                  className="flex-1 h-9 bg-card border border-border rounded-lg px-3 text-xs font-medium outline-none focus:border-primary" />
                <button onClick={addMilestone} className="w-9 h-9 bg-foreground text-background rounded-lg flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {localMilestones.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-card border border-border px-3 py-1.5 rounded-lg">
                    <span className="text-xs font-semibold text-foreground">{m.label}</span>
                    <span className="text-[10px] text-muted-foreground">{m.dt}</span>
                    <button onClick={() => setLocalMilestones(localMilestones.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => {
                setLocalThresholds({ qoe: 70, dms_dl_3: 80, dms_dl_8: 65, dms_dl_30: 25, latency: 150, loss: 0.1 });
                setLocalVisibility({ showSessions: true, showMilestones: true, showThresholds: true, showPoints: true });
              }} className="px-5 h-10 bg-muted text-muted-foreground rounded-xl text-xs font-semibold flex items-center gap-2">
                <RotateCcw className="w-4 h-4" /> Défaut
              </button>
              <button onClick={handleApplyParams} className="px-8 h-10 bg-primary text-primary-foreground rounded-xl text-xs font-semibold flex items-center gap-2">
                <Check className="w-4 h-4" /> Appliquer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'OVERVIEW' && (
          <div className="h-full overflow-y-auto p-8 space-y-8 pb-32">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
              <HeaderCard label="Score QoE" value={`${snapshot.avg_qoe}%`} color="text-primary" delta="+2.1" icon={<Activity />} />
              <HeaderCard label="DMS DL 30" value={`${snapshot.dms_dl_30}%`} color="text-orange-600" delta="-1.1" icon={<ShieldCheck />} />
              <HeaderCard label="DMS DL 8" value={`${snapshot.dms_dl_8}%`} color="text-purple-600" delta="-0.5" icon={<ShieldCheck />} />
              <HeaderCard label="DMS DL 3" value={`${snapshot.dms_dl_3}%`} color="text-emerald-600" delta="+0.4" icon={<ShieldCheck />} />
              <HeaderCard label="DMS UL 3" value={`${snapshot.dms_ul_3}%`} color="text-pink-600" delta="+2.5" icon={<TrendingUp />} />
              <HeaderCard label="Débit DL" value={`${snapshot.p50_throughput}M`} color="text-cyan-600" delta="+1.2" icon={<TrendingUp />} />
              <HeaderCard label="Débit UL" value={`${snapshot.p50_throughput_ul}M`} color="text-indigo-600" delta="+0.8" icon={<TrendingUp />} />
              <HeaderCard label="Latence" value={`${snapshot.p95_rtt}ms`} color="text-amber-600" delta="+5" icon={<Zap />} />
            </div>

            {/* Chart grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <ChartTile title="QoE Score (%)" kpi="qoe" color={localKpiColors.qoe || '#3b82f6'} payload={chartPayload} filters={filters} onExpand={() => setExpandedChart({ title: 'QoE Score', kpi: 'qoe', color: localKpiColors.qoe || '#3b82f6' })} />
              <ChartTile title="DMS DL ≥ 30 Mbps (%)" kpi="dms_dl_30" color={localKpiColors.dms_dl_30 || '#f97316'} payload={chartPayload} filters={filters} onExpand={() => setExpandedChart({ title: 'DMS DL 30', kpi: 'dms_dl_30', color: localKpiColors.dms_dl_30 || '#f97316' })} />
              <ChartTile title="DMS DL ≥ 8 Mbps (%)" kpi="dms_dl_8" color={localKpiColors.dms_dl_8 || '#8b5cf6'} payload={chartPayload} filters={filters} onExpand={() => setExpandedChart({ title: 'DMS DL 8', kpi: 'dms_dl_8', color: localKpiColors.dms_dl_8 || '#8b5cf6' })} />
              <ChartTile title="DMS DL ≥ 3 Mbps (%)" kpi="dms_dl_3" color={localKpiColors.dms_dl_3 || '#10b981'} payload={chartPayload} filters={filters} onExpand={() => setExpandedChart({ title: 'DMS DL 3', kpi: 'dms_dl_3', color: localKpiColors.dms_dl_3 || '#10b981' })} />
              <ChartTile title="Débit DL Médian (Mbps)" kpi="throughput" color={localKpiColors.throughput || '#14b8a6'} payload={chartPayload} filters={filters} onExpand={() => setExpandedChart({ title: 'Débit DL', kpi: 'throughput', color: localKpiColors.throughput || '#14b8a6' })} />
              <ChartTile title="Latence P95 (ms)" kpi="latency" color={localKpiColors.latency || '#f59e0b'} payload={chartPayload} filters={filters} onExpand={() => setExpandedChart({ title: 'Latence', kpi: 'latency', color: localKpiColors.latency || '#f59e0b' })} />
            </div>
          </div>
        )}
        {activeTab === 'TCP_ANALYSE' && <div className="h-full flex flex-col overflow-hidden"><TCPAnalytics filters={filters} onFilterChange={onFilterChange} /></div>}
        {activeTab === 'AI_ANALYSIS' && (
          <div className="h-full overflow-y-auto p-8 bg-background">
            <div className="flex flex-col items-center justify-center h-96 bg-card rounded-3xl border border-dashed border-border">
              <Cpu className="w-14 h-14 text-primary mb-6 opacity-20" />
              <p className="text-sm font-semibold text-muted-foreground">IA Insight Engine · Prochaine mise à jour</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const HeaderCard = ({ label, value, color, icon, delta }: any) => (
  <div className="bg-card p-5 rounded-2xl border border-border shadow-sm hover:shadow-lg transition-all group">
    <div className="flex items-center justify-between mb-3">
      <div className={`p-2 rounded-lg ${color} bg-muted group-hover:scale-110 transition-transform`}>{React.cloneElement(icon, { size: 16 })}</div>
      <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${delta.startsWith('+') ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{delta}</div>
    </div>
    <p className="text-xs font-medium text-muted-foreground mb-1 truncate">{label}</p>
    <p className={`text-xl font-bold tracking-tight ${color}`}>{value}</p>
  </div>
);

const ChartTile = ({ title, kpi, color, payload, filters, onExpand }: any) => (
  <div className="bg-card p-8 rounded-3xl border border-border shadow-sm flex flex-col group hover:border-primary/30 transition-all hover:shadow-lg">
    <div className="flex items-center justify-between mb-6">
      <div>
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />{title}
        </h4>
        {filters.visibility?.showThresholds && (filters.thresholds as any)[kpi] && (
          <p className="text-xs font-medium text-destructive flex items-center gap-1.5 bg-destructive/10 px-2 py-0.5 rounded-md mt-2">
            <Target size={12} /> Seuil: {(filters.thresholds as any)[kpi]}
          </p>
        )}
      </div>
      <button onClick={onExpand} className="p-3 bg-primary/10 rounded-xl text-primary hover:bg-primary hover:text-primary-foreground transition-all opacity-0 group-hover:opacity-100">
        <Maximize2 size={16} />
      </button>
    </div>
    <div className="h-72">
      <QoEChart
        payload={payload}
        selectedKpi={kpi}
        kpiLabel={title}
        color={color}
        type="area"
        showSessions={filters.visibility?.showSessions}
        showPoints={filters.visibility?.showPoints}
        secondaryKpi={filters.backgroundKpi}
        backgroundOpacity={filters.backgroundOpacity}
        threshold={filters.visibility?.showThresholds ? (filters.thresholds as any)[kpi] : undefined}
      />
    </div>
  </div>
);

export default GlobalDashboard;
