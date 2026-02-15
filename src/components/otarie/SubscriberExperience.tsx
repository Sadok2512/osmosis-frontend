import React, { useState } from 'react';
import { SubscriberExperienceData, Filters } from '../../types';
import { fetchSubscriberProfile } from '../../services/mockData';
import {
  Users, Search, Shield, Activity, Clock, Signal, AlertTriangle, Layers, Package
} from 'lucide-react';
import { getQoEColor } from '../../constants';

const SubscriberExperience: React.FC<{ filters: Filters }> = ({ filters }) => {
  const [profile, setProfile] = useState<SubscriberExperienceData | null>(null);
  const [hash, setHash] = useState('b3c1d2e4f5...');
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const data = await fetchSubscriberProfile(hash);
    setProfile(data);
    setLoading(false);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
      {/* Search */}
      <div className="px-8 py-6 bg-white border-b border-slate-200 sticky top-0 z-10">
        <form onSubmit={handleSearch} className="flex items-center gap-4 max-w-4xl">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" value={hash} onChange={(e) => setHash(e.target.value)} placeholder="MSISDN Hash..."
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-blue-500/10 outline-none" />
          </div>
          <button type="submit" className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg">Analyser</button>
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-100 rounded-xl">
            <Shield className="w-4 h-4 text-amber-500" />
            <span className="text-[10px] font-black text-amber-700 uppercase">Restricted</span>
          </div>
        </form>
      </div>

      {!profile ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-400">
          <Users className="w-16 h-16 opacity-10" />
          <p className="text-sm font-black uppercase tracking-[0.2em]">Enter MSISDN to begin</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-8 space-y-8">
          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <SubCard label="Total Traffic" value={`${profile.total_traffic_gb.toFixed(1)} GB`} icon={<Package />} color="text-blue-600" />
            <SubCard label="Global QoE" value={`${profile.qoe_global.toFixed(1)}%`} icon={<Activity />} color="text-emerald-600" />
            <SubCard label="Top App" value={profile.top_app} icon={<Signal />} color="text-purple-600" />
            <SubCard label="Sessions" value={profile.sessions.length.toString()} icon={<Clock />} color="text-slate-600" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            {/* Timeline */}
            <div className="xl:col-span-4 bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm flex flex-col h-[500px]">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-8 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" /> Timeline
              </h3>
              <div className="space-y-8 overflow-y-auto px-2 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                {profile.timeline.map((item, i) => (
                  <div key={i} className="flex gap-6 relative group">
                    <div className="w-6 h-6 rounded-full bg-white border-2 border-slate-200 group-hover:border-blue-500 flex items-center justify-center z-10 mt-1 shadow-sm shrink-0">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] font-black text-slate-400 uppercase mb-1">{item.time} • {item.event}</div>
                      <div className="text-sm font-black text-slate-800">{item.type || item.cell}</div>
                      <div className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">{item.rat}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Traffic QoE */}
            <div className="xl:col-span-8 bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm flex flex-col h-[500px]">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-8 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-600" /> Traffic Type QoE
              </h3>
              <div className="space-y-4 overflow-y-auto pr-2">
                {['Streaming', 'Gaming', 'Social', 'Web'].map((type, i) => (
                  <div key={type} className="flex items-center gap-8 p-5 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-blue-400 transition-all">
                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center font-black text-slate-400 group-hover:text-blue-600">{type[0]}</div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-sm font-black text-slate-800 uppercase">{type}</span>
                        <span className="text-[11px] font-black text-slate-500">{70 + i * 5}% QoE</span>
                      </div>
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${70 + i * 5}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] font-black text-slate-700">{(5 + i * 2).toFixed(1)} GB</div>
                      <div className="text-[9px] font-bold text-slate-400">{20 + i * 10} Sessions</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sessions table */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-10 py-6 border-b border-slate-100 bg-slate-50/30">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" /> Session Diagnostics
              </h3>
            </div>
            <table className="w-full text-left">
              <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <tr>
                  <th className="px-10 py-4">TYPE</th>
                  <th className="px-6 py-4">CELL</th>
                  <th className="px-6 py-4 text-center">RTT / LOSS</th>
                  <th className="px-10 py-4 text-right">DIAGNOSTIC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {profile.sessions.map((s, i) => (
                  <tr key={i} className="hover:bg-red-50/30 transition-colors">
                    <td className="px-10 py-5 font-bold text-slate-800 uppercase">{s.type}</td>
                    <td className="px-6 py-5 text-xs font-bold text-slate-700">{s.cell}</td>
                    <td className="px-6 py-5 text-center">
                      <div className={`text-sm font-black ${s.rtt > 150 ? 'text-red-500' : 'text-slate-700'}`}>{s.rtt}ms</div>
                      <div className="text-[9px] font-bold text-slate-400">{s.loss.toFixed(1)}% Loss</div>
                    </td>
                    <td className="px-10 py-5 text-right">
                      <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase ${s.status === 'OK' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {s.diagnostic}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const SubCard = ({ label, value, icon, color }: any) => (
  <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 flex flex-col items-center justify-center shadow-sm">
    <div className={`p-4 bg-slate-50 rounded-2xl mb-4 ${color}`}>{React.cloneElement(icon, { size: 24 })}</div>
    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</span>
    <span className="text-2xl font-black text-slate-900 tracking-tighter">{value}</span>
  </div>
);

export default SubscriberExperience;
