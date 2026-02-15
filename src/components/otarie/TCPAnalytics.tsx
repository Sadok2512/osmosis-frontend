import React, { useEffect, useState, useMemo } from 'react';
import {
  Zap, Clock, Sliders, ChevronDown, ChevronUp, Signal, RefreshCw,
  Maximize2, Minimize2, Play, Layout, Eye, EyeOff, Radio, Cpu, CheckCircle2
} from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TCPAnalyticsData, Filters, KPIType, RCAResult, TCPTimeSeriesDistributionPoint } from '../../types';
import { fetchTCPAnalytics, fetchTCPTimeSeriesDistributions } from '../../services/mockData';

const THRESHOLDS: Record<string, { ok: string; warning: string; critical: string }> = {
  [KPIType.WINDOW_FULL]: { ok: '< 1%', warning: '1-5%', critical: '> 5%' },
  [KPIType.RETRANSMISSION]: { ok: '< 0.5%', warning: '0.5-2%', critical: '> 2%' },
  [KPIType.TCP_LOSS]: { ok: '< 0.03%', warning: '0.03-0.1%', critical: '> 0.3%' },
  [KPIType.OUT_OF_ORDER]: { ok: '< 0.2%', warning: '0.2-1%', critical: '> 1%' },
};

const TCPAnalytics: React.FC<{ filters: Filters; onFilterChange?: (f: Filters) => void }> = ({ filters, onFilterChange }) => {
  const [data, setData] = useState<TCPAnalyticsData | null>(null);
  const [tsDist, setTsDist] = useState<TCPTimeSeriesDistributionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<KPIType>(KPIType.WINDOW_FULL);
  const [displayDistribution, setDisplayDistribution] = useState(true);
  const [isChartFullScreen, setIsChartFullScreen] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [res, tsRes] = await Promise.all([
        fetchTCPAnalytics(filters),
        fetchTCPTimeSeriesDistributions(selectedMetric, filters.from_dt, filters.to_dt),
      ]);
      setData(res);
      setTsDist(tsRes);
      setLoading(false);
    };
    load();
  }, [filters, selectedMetric]);

  const chartData = useMemo(() => {
    return tsDist.map(point => {
      const row: any = { t: point.t.slice(5), ratio: point.ratio };
      point.bins.forEach(bin => { row[bin.range] = bin.percentage; });
      return row;
    });
  }, [tsDist]);

  const binLabels = useMemo(() => tsDist.length === 0 ? [] : tsDist[0].bins.map(b => b.range), [tsDist]);
  const binColors = ['#22c55e', '#f59e0b', '#ef4444', '#7f1d1d'];

  if (loading || !data) return (
    <div className="flex-1 flex flex-col items-center justify-center h-full gap-4 bg-slate-50">
      <RefreshCw className="w-12 h-12 text-blue-600 animate-spin" />
      <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Calcul de la matrice TCP...</p>
    </div>
  );

  return (
    <div className={`flex-1 overflow-auto bg-slate-50 flex flex-col h-full ${isChartFullScreen ? 'p-0 overflow-hidden' : ''}`}>
      {!isChartFullScreen && (
        <div className="bg-white border-b border-slate-200 px-8 py-3 sticky top-0 z-30 flex items-center justify-between shadow-sm">
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-600" /> TCP Intelligence
          </h2>
          <span className="text-[10px] font-black text-slate-600 uppercase">Période: {filters.from_dt} - {filters.to_dt}</span>
        </div>
      )}

      <div className={`${isChartFullScreen ? 'fixed inset-0 z-[2000] bg-white p-10 flex flex-col' : 'p-8 space-y-8 flex-1 overflow-auto pb-24'}`}>
        {!isChartFullScreen && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {data.cards.map(card => (
              <div key={card.metric} onClick={() => setSelectedMetric(card.metric)}
                className={`bg-white p-6 rounded-[2.5rem] border transition-all cursor-pointer group ${selectedMetric === card.metric ? 'ring-2 ring-blue-500 border-blue-200 shadow-xl' : 'border-slate-200 shadow-sm'}`}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase">{card.label}</span>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black text-white ${card.status === 'Critical' ? 'bg-red-500' : 'bg-emerald-500'}`}>{card.status}</span>
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-3xl font-black">{card.value.toFixed(2)}%</span>
                  <span className={`text-[10px] font-black ${card.delta > 0 ? 'text-red-500' : 'text-emerald-500'}`}>{card.delta > 0 ? '+' : ''}{card.delta.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={`grid grid-cols-1 xl:grid-cols-12 gap-8 ${isChartFullScreen ? 'flex-1' : ''}`}>
          <div className={`${isChartFullScreen ? 'xl:col-span-12' : 'xl:col-span-8'} bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm flex flex-col min-h-[500px]`}>
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Trend Over Time</h3>
              <div className="flex gap-2">
                <button onClick={() => setDisplayDistribution(!displayDistribution)} className="p-2 bg-slate-100 rounded-xl">
                  {displayDistribution ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
                <button onClick={() => setIsChartFullScreen(!isChartFullScreen)} className="p-2 bg-slate-100 rounded-xl">
                  {isChartFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
              </div>
            </div>
            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="t" tick={{ fontSize: 9 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 9 }} unit="%" />
                  <YAxis yAxisId="right" tick={{ fontSize: 9 }} orientation="right" />
                  <Tooltip />
                  <Legend />
                  {displayDistribution && binLabels.map((label, i) => (
                    <Bar key={label} dataKey={label} stackId="a" fill={binColors[i % binColors.length]} yAxisId="left" />
                  ))}
                  <Line yAxisId="right" type="monotone" dataKey="ratio" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {!isChartFullScreen && (
            <div className="xl:col-span-4 space-y-8">
              <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-6 flex items-center gap-2"><Signal className="w-4 h-4" /> Thresholds</h3>
                <div className="space-y-4">
                  {Object.entries(THRESHOLDS[selectedMetric] || {}).map(([lvl, val]) => (
                    <div key={lvl} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className={`text-[10px] font-black uppercase tracking-widest ${lvl === 'critical' ? 'text-red-600' : 'text-slate-600'}`}>{lvl}</span>
                      <span className="text-[10px] font-black text-slate-700">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-[#0f172a] rounded-[2.5rem] p-8 text-white">
                <h3 className="text-xl font-black mb-4">Congestion Index</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black">{data.congestion_index}</span>
                  <span className="text-[10px] opacity-40">/ 100</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Worst tables */}
        {!isChartFullScreen && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[400px]">
              <div className="px-10 py-6 border-b border-slate-100 bg-slate-50/30">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><Radio className="w-4 h-4 text-blue-500" /> Worst Cells</h3>
              </div>
              <div className="overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 text-[9px] font-black uppercase tracking-widest sticky top-0 border-b z-10">
                    <tr><th className="px-10 py-4">CELL</th><th className="px-6 py-4 text-right">VALUE</th><th className="px-10 py-4 text-right">IMPACT</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(data.worst_cells || []).map((cell, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-10 py-5"><div className="text-[11px] font-black text-slate-800">{cell.name}</div><div className="text-[9px] text-slate-400">{cell.id}</div></td>
                        <td className="px-6 py-5 text-right font-black">{cell.value}</td>
                        <td className="px-10 py-5 text-right font-black text-red-600">{cell.qoe_impact}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[400px]">
              <div className="px-10 py-6 border-b border-slate-100 bg-slate-50/30">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><Layout className="w-4 h-4 text-purple-600" /> Worst Services</h3>
              </div>
              <div className="overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 text-[9px] font-black uppercase tracking-widest sticky top-0 border-b z-10">
                    <tr><th className="px-10 py-4">SERVICE</th><th className="px-6 py-4 text-right">VALUE</th><th className="px-10 py-4 text-right">IMPACT</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(data.worst_services || []).map((svc, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-10 py-5 text-[11px] font-black uppercase">{svc.name}</td>
                        <td className="px-6 py-5 text-right font-black">{svc.value}</td>
                        <td className="px-10 py-5 text-right font-black text-red-600">{svc.qoe_impact}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TCPAnalytics;
