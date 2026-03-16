import React, { useState, useEffect } from 'react';
import { Alert, Filters } from '../../types';
import { fetchAlerts } from '../../services/mockData';
import {
  Bell, AlertTriangle, Shield, Activity, Clock, Target, X, ChevronRight,
  CheckCircle2, Zap, TrendingDown, RefreshCw, Search, Download, ListFilter, Cpu, Info
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, CartesianGrid } from 'recharts';

const SEVERITY_MAP: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  CRITIQUE: { color: 'text-red-600', bg: 'bg-red-50', icon: <AlertTriangle className="w-4 h-4" /> },
  ELEVEE: { color: 'text-orange-600', bg: 'bg-orange-50', icon: <Zap className="w-4 h-4" /> },
  MOYENNE: { color: 'text-amber-600', bg: 'bg-amber-50', icon: <Bell className="w-4 h-4" /> },
  FAIBLE: { color: 'text-blue-600', bg: 'bg-blue-50', icon: <Info className="w-4 h-4" /> },
};

const AlertsRCA: React.FC<{ filters: Filters }> = ({ filters }) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeDrawerTab, setActiveDrawerTab] = useState<'OVERVIEW' | 'EVIDENCE' | 'LLM_RCA' | 'ACTIONS'>('OVERVIEW');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await fetchAlerts(filters);
      setAlerts(data);
      setLoading(false);
    };
    load();
  }, [filters]);

  const generateRCA = () => {
    if (!selectedAlert) return;
    setSelectedAlert({
      ...selectedAlert,
      rca: {
        root_cause_class: 'TCP Congestion — Window Full',
        summary: ['Congestion detected on DL path due to window full ratio exceeding 5%', 'Correlated with retransmission spike during peak hours'],
        evidence: ['Window full ratio: 6.2%', 'Retransmission rate: 2.1%', 'RTT increase: +45ms'],
        recommended_actions: ['Scale backhaul capacity', 'Review TCP window sizing', 'Monitor during next peak window'],
        confidence: 0.87,
      },
    });
    setActiveDrawerTab('LLM_RCA');
  };

  if (loading) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-slate-50">
      <RefreshCw className="w-10 h-10 text-blue-600 animate-spin" />
      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Scan des anomalies...</p>
    </div>
  );

  return (
    <div className="flex-1 flex bg-slate-50 overflow-hidden relative">
      {/* Alerts Table */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${selectedAlert ? 'mr-[450px]' : ''}`}>
        <div className="px-8 py-5 bg-white border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-6">
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-widest flex items-center gap-3">
              <Bell className="w-5 h-5 text-red-500" /> Alerts & RCA
            </h2>
            <div className="flex gap-2">
              <span className="px-3 py-1 bg-red-500 rounded-lg text-white text-[9px] font-black uppercase">{alerts.filter(a => a.severity === 'CRITIQUE').length} Critique</span>
              <span className="px-3 py-1 bg-slate-900 rounded-lg text-white text-[9px] font-black uppercase">{alerts.length} Total</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-8">
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <tr>
                  <th className="px-8 py-4">ID / SEVERITY</th>
                  <th className="px-4 py-4">SCOPE</th>
                  <th className="px-4 py-4">KPI / DELTA</th>
                  <th className="px-4 py-4">CONFIDENCE</th>
                  <th className="px-8 py-4 text-right">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {alerts.map(a => (
                  <tr key={a.alert_id} onClick={() => { setSelectedAlert(a); setActiveDrawerTab('OVERVIEW'); }}
                    className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedAlert?.alert_id === a.alert_id ? 'bg-blue-50' : ''}`}>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${SEVERITY_MAP[a.severity]?.bg} ${SEVERITY_MAP[a.severity]?.color}`}>
                          {SEVERITY_MAP[a.severity]?.icon}
                        </div>
                        <div>
                          <div className="font-black text-slate-800">{a.alert_id}</div>
                          <div className={`text-[9px] font-black uppercase ${SEVERITY_MAP[a.severity]?.color}`}>{a.severity}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-5">
                      <div className="text-[11px] font-black text-slate-800">{a.scope_id}</div>
                      <div className="text-[9px] text-slate-400 font-bold uppercase">{a.scope_type} • {a.scope_name}</div>
                    </td>
                    <td className="px-4 py-5">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-700">{a.primary_kpi}</span>
                        <span className="flex items-center gap-0.5 text-[10px] font-black text-red-500">
                          <TrendingDown className="w-3 h-3" /> {a.delta_pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-5">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${a.confidence * 100}%` }} />
                        </div>
                        <span className="font-bold text-slate-500">{(a.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${a.status === 'NEW' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* RCA Drawer */}
      {selectedAlert && (
        <div className="fixed top-0 bottom-0 right-0 w-[450px] bg-white border-l border-slate-200 shadow-2xl z-20 flex flex-col overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Alert Detail</h3>
              <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">{selectedAlert.alert_id}</p>
            </div>
            <button onClick={() => setSelectedAlert(null)} className="p-2 hover:bg-slate-200 rounded-full"><X className="w-5 h-5 text-slate-400" /></button>
          </div>

          <div className="flex border-b border-slate-100">
            {(['OVERVIEW', 'EVIDENCE', 'LLM_RCA', 'ACTIONS'] as const).map(t => (
              <button key={t} onClick={() => setActiveDrawerTab(t)}
                className={`px-6 py-4 text-[9px] font-black uppercase tracking-widest border-b-2 transition-all ${activeDrawerTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}>
                {t.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-8">
            {activeDrawerTab === 'OVERVIEW' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <MetricBox label="Current" value={selectedAlert.current.toFixed(1)} sub={selectedAlert.primary_kpi} color="text-slate-900" />
                  <MetricBox label="Delta" value={`${selectedAlert.delta_pct.toFixed(1)}%`} sub="vs Baseline" color="text-red-500" />
                  <MetricBox label="Score" value={selectedAlert.anomaly_score.toFixed(2)} sub="Anomaly" color="text-blue-600" />
                  <MetricBox label="Confidence" value={`${(selectedAlert.confidence * 100).toFixed(0)}%`} sub="Model" color="text-slate-500" />
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Baseline Trend</h4>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={Array.from({ length: 14 }).map((_, i) => ({ t: i, v: 80 + Math.random() * 15 }))}>
                        <defs><linearGradient id="colorBase" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <Area type="monotone" dataKey="v" stroke="#3b82f6" strokeWidth={2} fill="url(#colorBase)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {activeDrawerTab === 'EVIDENCE' && (
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Evidence Signals</h4>
                {Object.entries(selectedAlert.evidence_signals).map(([key, val]) => (
                  <div key={key} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600 uppercase">{key.replace('_', ' ')}</span>
                    <span className="text-xs font-black text-slate-900">{String(val)}</span>
                  </div>
                ))}
              </div>
            )}

            {activeDrawerTab === 'LLM_RCA' && (
              <div className="space-y-6">
                {!selectedAlert.rca ? (
                  <div className="p-10 border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center gap-6 text-center">
                    <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600"><Cpu className="w-8 h-8" /></div>
                    <h4 className="text-sm font-black text-slate-800 uppercase">Explain Anomaly</h4>
                    <button onClick={generateRCA} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-3">
                      <Target className="w-4 h-4" /> Generate AI RCA
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="p-5 bg-blue-600 rounded-2xl text-white">
                      <span className="text-[9px] font-black uppercase opacity-60">Root Cause</span>
                      <h5 className="text-xl font-black mt-1">{selectedAlert.rca.root_cause_class}</h5>
                    </div>
                    <div className="space-y-2">
                      {selectedAlert.rca.summary.map((s, i) => (
                        <p key={i} className="text-xs text-slate-700 leading-relaxed font-medium border-l-2 border-blue-500 pl-4 py-1">{s}</p>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {selectedAlert.rca.recommended_actions.map((a, i) => (
                        <div key={i} className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-3">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <span className="text-[11px] font-bold text-emerald-900">{a}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeDrawerTab === 'ACTIONS' && (
              <div className="space-y-6">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Change Status</label>
                <div className="grid grid-cols-2 gap-2">
                  {['ACK', 'RESOLVED', 'FALSE_POSITIVE', 'IGNORE'].map(s => (
                    <button key={s} className="py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-blue-500 transition-all">{s}</button>
                  ))}
                </div>
                <textarea placeholder="Internal notes..." className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs outline-none resize-none" />
                <button className="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase">Save Notes</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const MetricBox = ({ label, value, sub, color }: any) => (
  <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col items-center justify-center">
    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</span>
    <span className={`text-xl font-black tracking-tighter ${color}`}>{value}</span>
    <span className="text-[9px] font-bold text-slate-400 uppercase mt-1">{sub}</span>
  </div>
);

export default AlertsRCA;
