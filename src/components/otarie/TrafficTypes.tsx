import React, { useEffect, useState } from 'react';
import { TrafficTypeStats, Filters, GlobalTimeSeriesPoint } from '../../types';
import { fetchTrafficOverview, fetchGlobalTimeSeries } from '../../services/mockData';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';
import { Activity, Zap, BarChart2, Target } from 'lucide-react';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

const TrafficTypes: React.FC<{ filters: Filters }> = ({ filters }) => {
  const [stats, setStats] = useState<TrafficTypeStats[]>([]);
  const [series, setSeries] = useState<GlobalTimeSeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [ov, ts] = await Promise.all([fetchTrafficOverview(filters), fetchGlobalTimeSeries(filters)]);
      setStats(ov);
      setSeries(ts);
      setLoading(false);
    };
    load();
  }, [filters]);

  if (loading) return <div className="p-20 text-center animate-pulse font-black text-slate-400 uppercase tracking-widest">Calcul du mix de trafic...</div>;

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-8 space-y-8">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Pie chart */}
        <div className="xl:col-span-4 bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm flex flex-col">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-8 flex items-center gap-2">Traffic Mix</h3>
          <div className="h-64 mb-8">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats} innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="traffic_dn_bytes" nameKey="traffic_type">
                  {stats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-4 flex-1">
            {stats.map((s, i) => (
              <div key={s.traffic_type} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-[11px] font-black text-slate-700 uppercase">{s.traffic_type}</span>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-black text-slate-900">{(s.traffic_dn_bytes / 1e12).toFixed(1)} TB</div>
                  <div className="text-[9px] font-bold text-slate-400">{s.sessions.toLocaleString()} sess.</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Area chart */}
        <div className="xl:col-span-8 bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-8 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-500" /> Traffic Evolution (14 Days)
          </h3>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs><linearGradient id="colorMix" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="t" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94a3b8' }} tickFormatter={(t) => t.slice(8)} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none' }} />
                <Area name="Traffic Vol." type="monotone" dataKey="traffic" stroke="#3b82f6" strokeWidth={4} fill="url(#colorMix)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Hotspots */}
        <div className="xl:col-span-6 bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-8 flex items-center gap-2">
            <Target className="w-4 h-4 text-purple-600" /> Traffic Type Hotspots
          </h3>
          <div className="space-y-4">
            {stats.slice(0, 4).map((s, i) => (
              <div key={i} className="flex items-center gap-6 p-5 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center font-black text-blue-600">{s.traffic_type[0]}</div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[11px] font-black text-slate-800 uppercase">{s.traffic_type} Hotspot</span>
                    <span className="text-[9px] font-black text-slate-400 uppercase">CELL_S{i}_V1</span>
                  </div>
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-blue-500 w-[70%]" /></div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] font-black text-slate-700">82% Share</div>
                  <div className="text-[9px] font-bold text-slate-400">{(s.traffic_dn_bytes / 1e9).toFixed(1)} GB</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* QoE Degradation */}
        <div className="xl:col-span-6 bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm flex flex-col">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-8 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-red-500" /> QoE Degradation vs Baseline
          </h3>
          <div className="flex-1 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats} margin={{ bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="traffic_type" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none' }} />
                <Bar dataKey="loss_rate" fill="#ef4444" radius={[6, 6, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="p-6 bg-red-50 rounded-2xl border border-red-100 flex items-center gap-4">
            <Zap className="w-6 h-6 text-red-500 animate-pulse" />
            <p className="text-[11px] font-bold text-red-900 leading-relaxed italic">
              Gaming segment shows +42% latency increase vs 30-day historical average.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrafficTypes;
