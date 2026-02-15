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
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 bg-slate-50">
      <RefreshCw className="w-12 h-12 text-blue-600 animate-spin" />
      <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Calcul des agrégats QoE & TCP...</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
      {/* Expanded chart overlay */}
      {expandedChart && (
        <div className="absolute inset-0 z-[100] bg-white/95 backdrop-blur-xl flex flex-col p-10">
          <div className="flex items-center justify-between mb-10 border-b border-slate-100 pb-8">
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-2xl shadow-blue-500/20">
                <Maximize2 className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">{expandedChart.title}</h2>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-1">Focus Analytique • NOC OTARIE</p>
              </div>
            </div>
            <button onClick={() => setExpandedChart(null)} className="flex items-center gap-3 px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest">
              <X className="w-5 h-5" /> Fermer
            </button>
          </div>
          <div className="flex-1 bg-white rounded-[4rem] border border-slate-100 p-12 shadow-2xl overflow-hidden">
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
      <div className="bg-white border-b border-slate-200 px-8 py-3 sticky top-0 z-20 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex gap-2">
            {(['OVERVIEW', 'TCP_ANALYSE', 'AI_ANALYSIS'] as SubTab[]).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
                  activeTab === tab ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'
                }`}>
                {tab === 'TCP_ANALYSE' ? 'TCP ANALYSE' : tab.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowParams(!showParams)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
              showParams ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}>
            <Sliders className="w-3.5 h-3.5" /> PARAMÈTRES
            {showParams ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <div className="w-px h-6 bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">LIVE</span>
          </div>
          <span className="text-[10px] font-black text-slate-400 uppercase">{filters.dt}</span>
        </div>
      </div>

      {/* Parameters panel */}
      {showParams && (
        <div className="bg-white border-b border-slate-200 px-8 py-8 shadow-inner">
          <div className="flex flex-wrap gap-8 items-end">
            <div className="flex flex-col gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-100 min-w-[400px]">
              <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Flag className="w-3.5 h-3.5 text-red-500" /> JALONS
              </span>
              <div className="flex items-center gap-3">
                <input type="date" value={newMilestoneDate} onChange={(e) => setNewMilestoneDate(e.target.value)}
                  className="flex-1 h-10 bg-white border border-slate-200 rounded-xl px-3 text-[10px] font-black outline-none" />
                <input type="text" value={newMilestoneLabel} placeholder="NOM..." onChange={(e) => setNewMilestoneLabel(e.target.value)}
                  className="flex-1 h-10 bg-white border border-slate-200 rounded-xl px-4 text-[10px] font-black outline-none" />
                <button onClick={addMilestone} className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {localMilestones.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
                    <span className="text-[9px] font-black text-slate-700">{m.label}</span>
                    <span className="text-[8px] font-bold text-slate-400">{m.dt}</span>
                    <button onClick={() => setLocalMilestones(localMilestones.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-500">
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
              }} className="px-6 h-11 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase flex items-center gap-2">
                <RotateCcw className="w-4 h-4" /> DÉFAUT
              </button>
              <button onClick={handleApplyParams} className="px-10 h-11 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase tracking-[0.2em] flex items-center gap-3">
                <Check className="w-4 h-4" /> APPLIQUER
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'OVERVIEW' && (
          <div className="h-full overflow-y-auto p-8 space-y-10 pb-32">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
              <HeaderCard label="Score QoE" value={`${snapshot.avg_qoe}%`} color="text-blue-600" delta="+2.1" icon={<Activity />} />
              <HeaderCard label="DMS DL 30" value={`${snapshot.dms_dl_30}%`} color="text-orange-600" delta="-1.1" icon={<ShieldCheck />} />
              <HeaderCard label="DMS DL 8" value={`${snapshot.dms_dl_8}%`} color="text-purple-600" delta="-0.5" icon={<ShieldCheck />} />
              <HeaderCard label="DMS DL 3" value={`${snapshot.dms_dl_3}%`} color="text-emerald-600" delta="+0.4" icon={<ShieldCheck />} />
              <HeaderCard label="DMS UL 3" value={`${snapshot.dms_ul_3}%`} color="text-pink-600" delta="+2.5" icon={<TrendingUp />} />
              <HeaderCard label="Débit DL" value={`${snapshot.p50_throughput}M`} color="text-cyan-600" delta="+1.2" icon={<TrendingUp />} />
              <HeaderCard label="Débit UL" value={`${snapshot.p50_throughput_ul}M`} color="text-indigo-600" delta="+0.8" icon={<TrendingUp />} />
              <HeaderCard label="Latence" value={`${snapshot.p95_rtt}ms`} color="text-amber-600" delta="+5" icon={<Zap />} />
            </div>

            {/* Chart grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
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
          <div className="h-full overflow-y-auto p-8 bg-slate-50">
            <div className="flex flex-col items-center justify-center h-96 bg-white rounded-[4rem] border border-dashed border-slate-200">
              <Cpu className="w-16 h-16 text-blue-500 mb-6 opacity-20" />
              <p className="text-sm font-black text-slate-400 uppercase tracking-widest">IA Insight Engine • Prochaine Mise à jour</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const HeaderCard = ({ label, value, color, icon, delta }: any) => (
  <div className="bg-white p-5 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all group">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-2.5 rounded-xl ${color} bg-slate-50 group-hover:scale-110 transition-transform`}>{React.cloneElement(icon, { size: 16 })}</div>
      <div className={`text-[9px] font-black px-2 py-0.5 rounded-lg ${delta.startsWith('+') ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{delta}</div>
    </div>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate">{label}</p>
    <p className={`text-xl font-black tracking-tighter ${color}`}>{value}</p>
  </div>
);

const ChartTile = ({ title, kpi, color, payload, filters, onExpand }: any) => (
  <div className="bg-white p-10 rounded-[3.5rem] border border-slate-200 shadow-sm flex flex-col group hover:border-blue-300 transition-all hover:shadow-2xl">
    <div className="flex items-center justify-between mb-10">
      <div>
        <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2.5">
          <BarChart3 className="w-4 h-4 text-blue-500" />{title}
        </h4>
        {filters.visibility?.showThresholds && (filters.thresholds as any)[kpi] && (
          <p className="text-[10px] font-black text-red-500 uppercase flex items-center gap-1.5 bg-red-50 px-2 py-0.5 rounded-lg mt-2">
            <Target size={12} /> Seuil: {(filters.thresholds as any)[kpi]}
          </p>
        )}
      </div>
      <button onClick={onExpand} className="p-4 bg-blue-50 rounded-2xl text-blue-600 hover:bg-blue-600 hover:text-white transition-all opacity-0 group-hover:opacity-100">
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
