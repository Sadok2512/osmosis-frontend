import React, { useState, useEffect } from 'react';
import { DetectorConfig } from '../../types';
import { fetchDetectorConfigs } from '../../services/mockData';
import {
  Shield, Settings, Play, History, Sliders, Activity, Plus, RefreshCw, Cpu
} from 'lucide-react';

const DetectorConsole: React.FC = () => {
  const [configs, setConfigs] = useState<DetectorConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await fetchDetectorConfigs();
      setConfigs(data);
      setLoading(false);
    };
    load();
  }, []);

  const triggerRun = () => {
    setIsRunning(true);
    setTimeout(() => setIsRunning(false), 3000);
  };

  if (loading) return <div className="p-20 text-center animate-pulse font-black text-slate-400">Loading configurations...</div>;

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-8 space-y-8">
      {/* Run Control */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-blue-500/20">
            <Cpu className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Detection Engine Control</h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Status: Operational • V2.4-ML</p>
          </div>
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button className="px-6 py-3 bg-white text-slate-800 rounded-xl text-[10px] font-black uppercase shadow-sm">Daily</button>
            <button className="px-6 py-3 text-slate-400 rounded-xl text-[10px] font-black uppercase">15M Realtime</button>
          </div>
          <button onClick={triggerRun} disabled={isRunning}
            className="px-10 py-4 bg-blue-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-3">
            {isRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            {isRunning ? 'Running...' : 'Trigger Run'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Detectors */}
        <div className="xl:col-span-8 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-4 h-4" /> Detector Pipeline
            </h3>
            <button className="flex items-center gap-2 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">
              <Plus className="w-3.5 h-3.5" /> New Detector
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {configs.map(det => (
              <div key={det.id} className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative group hover:border-blue-400 transition-all">
                <div className="flex justify-between items-start mb-6">
                  <div className={`p-3 rounded-2xl ${det.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                    <Shield className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${det.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{det.enabled ? 'Active' : 'Disabled'}</span>
                  </div>
                </div>
                <h4 className="text-lg font-black text-slate-800 tracking-tight mb-2">{det.name}</h4>
                <div className="flex flex-wrap gap-2 mb-8">
                  {det.features.map(f => (
                    <span key={f} className="px-2.5 py-1 bg-slate-100 rounded-lg text-[9px] font-black text-slate-500 uppercase">{f}</span>
                  ))}
                </div>
                <div className="space-y-4 pt-6 border-t border-slate-50">
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-slate-400 uppercase tracking-widest">Method</span>
                    <span className="text-slate-700">{det.method}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-slate-400 uppercase tracking-widest">Scope</span>
                    <span className="text-slate-700">{det.level}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-slate-400 uppercase tracking-widest">Last Run</span>
                    <span className="text-slate-700">{det.last_run || 'Never'}</span>
                  </div>
                </div>
                <div className="mt-8 flex gap-2">
                  <button className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-[10px] font-black uppercase transition-colors">Tuning</button>
                  <button className="px-4 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors"><Settings className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Calibration */}
        <div className="xl:col-span-4 space-y-6">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Sliders className="w-4 h-4" /> Calibration
          </h3>
          <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-8">
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Z-Score Sensitivity</span>
                <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black">2.5σ</span>
              </div>
              <input type="range" className="w-full accent-blue-600 h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer" />
            </div>
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">MAD Multiplier</span>
                <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-black">3.5x</span>
              </div>
              <input type="range" className="w-full accent-amber-500 h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer" />
            </div>
            <div className="pt-8 border-t border-slate-50 space-y-4">
              <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Precision</h5>
              <div className="flex items-center gap-4">
                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 w-[88%]" /></div>
                <span className="text-xs font-black text-slate-800">88%</span>
              </div>
            </div>
            <button className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Apply</button>
          </div>

          <div className="bg-slate-900 p-8 rounded-[2rem] text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity"><History className="w-24 h-24" /></div>
            <h4 className="text-lg font-black mb-4">System Audit Log</h4>
            <div className="space-y-4">
              <AuditItem time="10:00" msg="Detector alt-001 run finished. 12 alerts." />
              <AuditItem time="09:12" msg="Threshold update by admin." />
              <AuditItem time="04:00" msg="Engine heartbeat: Nominal." />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AuditItem = ({ time, msg }: { time: string; msg: string }) => (
  <div className="flex gap-3 text-[10px] font-bold">
    <span className="text-white/40">{time}</span>
    <span className="text-white/80">{msg}</span>
  </div>
);

export default DetectorConsole;
