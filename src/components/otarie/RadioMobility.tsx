import React, { useEffect, useState } from 'react';
import { MobilityImpact, Filters } from '../../types';
import { fetchMobilityImpact } from '../../services/mockData';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell
} from 'recharts';
import { Network, ArrowRightLeft, Signal, MapPin as MapIcon, TrendingDown } from 'lucide-react';
import { getQoEColor } from '../../constants';

const RadioMobility: React.FC<{ filters: Filters }> = ({ filters }) => {
  const [impact, setImpact] = useState<MobilityImpact[]>([]);
  const [loading, setLoading] = useState(true);

  // Generate stable matrix data
  const matrixData = React.useMemo(() => {
    const types = ['Streaming', 'Web/HTTP', 'Social', 'Gaming', 'Cloud', 'VoIP'];
    return types.map(type => ({
      type,
      '2G': 20 + Math.random() * 20,
      '3G': 35 + Math.random() * 25,
      '4G': 70 + Math.random() * 20,
      '5G': 85 + Math.random() * 15,
    }));
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await fetchMobilityImpact(filters);
      setImpact(data || []);
      setLoading(false);
    };
    load();
  }, [filters]);

  if (loading) return <div className="p-20 text-center animate-pulse font-black text-slate-400 uppercase tracking-widest">Analyse de la mobilité radio...</div>;

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-8 space-y-8">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* RAT x Traffic Type Matrix */}
        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-8 flex items-center gap-2">
            <Network className="w-4 h-4 text-blue-600" /> RAT x Traffic Type Matrix
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-center border-collapse">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase text-left">Traffic Type</th>
                  {['2G', '3G', '4G', '5G'].map(r => <th key={r} className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase">{r}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matrixData.map(row => (
                  <tr key={row.type}>
                    <td className="px-4 py-4 text-[11px] font-black text-slate-700 text-left">{row.type}</td>
                    {['2G', '3G', '4G', '5G'].map(r => {
                      const score = (row as any)[r];
                      return (
                        <td key={r} className="px-4 py-4">
                          <div className="w-full h-10 rounded-lg flex items-center justify-center text-[11px] font-black"
                            style={{ backgroundColor: getQoEColor(score), color: score > 60 ? 'white' : 'black' }}>
                            {score.toFixed(0)}%
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobility Penalty */}
        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-8 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-purple-600" /> Mobility Penalty (FIXE vs MOBILE)
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={impact} barSize={60}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="type" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                <Bar name="Avg QoE Score (%)" dataKey="qoe" radius={[10, 10, 0, 0]}>
                  {impact.map((entry, index) => (
                    <Cell key={index} fill={entry.type === 'FIXE' ? '#10b981' : '#f59e0b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100 flex flex-col items-center">
              <span className="text-[9px] font-black text-emerald-700 uppercase">RTT FIXE</span>
              <span className="text-xl font-black text-emerald-900">{impact[0]?.rtt?.toFixed(0) || 0} ms</span>
            </div>
            <div className="p-5 bg-orange-50 rounded-2xl border border-orange-100 flex flex-col items-center">
              <span className="text-[9px] font-black text-orange-700 uppercase">RTT MOBILE</span>
              <span className="text-xl font-black text-orange-900">{impact[1]?.rtt?.toFixed(0) || 0} ms</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Mobility Impact Map Placeholder */}
        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm relative overflow-hidden h-[500px] flex flex-col">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
            <MapIcon className="w-4 h-4 text-blue-500" /> Mobility Impact Visualization
          </h3>
          <div className="flex-1 bg-slate-100 rounded-3xl relative flex items-center justify-center border border-slate-200">
            <div className="text-center p-8 max-w-sm">
              <Signal className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-sm font-black text-slate-500 uppercase">Mobility Degradation Hotspots</p>
              <p className="text-[10px] text-slate-400 mt-2">Zones where QoE drops &gt;15% during handover</p>
            </div>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="absolute w-12 h-12 bg-red-500/20 rounded-full border border-red-500 animate-pulse"
                style={{ top: `${20 + i * 10}%`, left: `${15 + i * 12}%` }} />
            ))}
          </div>
        </div>

        {/* Handover Stress Table */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[500px]">
          <div className="px-10 py-6 border-b border-slate-100 bg-slate-50/30">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" /> Handover Stress Table
            </h3>
          </div>
          <div className="overflow-y-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/50 text-[9px] font-black text-slate-400 uppercase tracking-widest sticky top-0 border-b z-10">
                <tr>
                  <th className="px-10 py-4">CELL ID</th>
                  <th className="px-6 py-4">MOBILITÉ</th>
                  <th className="px-6 py-4">RTT ↑</th>
                  <th className="px-6 py-4">PERTES ↑</th>
                  <th className="px-10 py-4">IMPACT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-10 py-5 font-bold text-slate-700">CELL_S{i}_V2</td>
                    <td className="px-6 py-5 text-purple-600 font-black">HAUTE</td>
                    <td className="px-6 py-5 font-bold text-red-500">+{20 + i * 5}ms</td>
                    <td className="px-6 py-5 font-bold text-orange-500">0.{i}2%</td>
                    <td className="px-10 py-5 font-black text-slate-400">Streaming</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RadioMobility;
