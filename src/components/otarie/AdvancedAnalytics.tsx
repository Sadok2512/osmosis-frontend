import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart3, Layout, Download, Filter, Settings2, Database, RefreshCw,
  Layers, Table as TableIcon, X, MousePointer2, TrendingUp, BarChart2,
  Activity, Maximize, MapPin, ChevronDown, Circle, SlidersHorizontal, Eye
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Scatter, ZAxis, ScatterChart
} from 'recharts';
import { Filters, AnalyticsQuery, AnalyticsResponse, AggregationLevel } from '../../types';
import { BI_KPIS, BI_AGGREGATIONS, VENDORS, DORS, DEPARTMENTS, PLAQUES } from '../../constants';
import { fetchAnalyticsQuery } from '../../services/mockData';

const AdvancedAnalytics: React.FC<{ filters: Filters; theme: 'light' | 'dark' }> = ({ filters }) => {
  const [query, setQuery] = useState<AnalyticsQuery>({
    x_kpi: 'date', y_metrics: ['qoe_score_avg'], filters: filters, aggregation: 'date',
    chart_type: 'area', show_points: true, color_by: undefined, size_by: undefined,
  });
  const [res, setRes] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const runQuery = async () => {
    setLoading(true);
    const data = await fetchAnalyticsQuery({ ...query, x_kpi: query.aggregation });
    const enhancedData = data.data.map(d => {
      const row = { ...d };
      query.y_metrics.forEach((metricId, idx) => {
        if (idx > 0) row[metricId] = d.y * (0.6 + Math.random() * 0.8);
        else row[metricId] = d.y;
      });
      if (query.size_by) row[query.size_by] = 200 + Math.random() * 2000;
      return row;
    });
    setRes({ metadata: { x_label: query.aggregation, y_labels: query.y_metrics, unit: '%' }, data: enhancedData });
    setLoading(false);
  };

  useEffect(() => { runQuery(); }, [query.aggregation, query.y_metrics, query.chart_type, query.size_by]);

  const toggleMetric = (metricId: string) => {
    setQuery(prev => {
      const exists = prev.y_metrics.includes(metricId);
      if (exists && prev.y_metrics.length > 1) return { ...prev, y_metrics: prev.y_metrics.filter(m => m !== metricId) };
      if (!exists) return { ...prev, y_metrics: [...prev.y_metrics, metricId] };
      return prev;
    });
  };

  return (
    <div className="flex h-full overflow-hidden bg-[#f8fafc]">
      {/* Sidebar */}
      <div className={`${isSidebarCollapsed ? 'w-0 border-none' : 'w-[280px]'} flex flex-col z-20 transition-all duration-300 border-r bg-white border-slate-200 shadow-xl overflow-hidden`}>
        <div className="p-6 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            <Settings2 size={18} className="text-blue-600" />
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-800">Studio Settings</h2>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/30">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 px-1 text-slate-500">
              <Circle size={14} className="text-blue-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-800">Point Visualization</span>
            </div>
            <button onClick={() => setQuery({ ...query, show_points: !query.show_points })}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all shadow-sm ${query.show_points ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
              <span className="text-[9px] font-black uppercase tracking-widest">Show points</span>
              <Eye size={14} />
            </button>
          </div>
          <div className="space-y-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-800 flex items-center gap-2"><Maximize size={14} className="text-orange-500" /> Bubble Mapping</span>
            <select value={query.size_by || 'none'} onChange={(e) => setQuery({ ...query, size_by: e.target.value === 'none' ? undefined : e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[10px] font-black uppercase outline-none shadow-sm">
              <option value="none">Fixed Size</option>
              {BI_KPIS.map(kpi => <option key={kpi.id} value={kpi.id}>{kpi.label}</option>)}
            </select>
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 bg-white">
          <button onClick={runQuery} className="w-full flex items-center justify-center gap-2 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-slate-200 shadow-sm z-30 flex flex-col shrink-0">
          <div className="px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-100 transition-all border border-slate-200">
                {isSidebarCollapsed ? <Layout size={20} /> : <X size={20} />}
              </button>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter">ANALYTICS STUDIO</h3>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowTable(!showTable)} className={`p-2.5 rounded-xl transition-all ${showTable ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50 border border-slate-200'}`}>
                <TableIcon size={18} />
              </button>
              <button className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100"><Download size={18} /></button>
            </div>
          </div>

          {/* Axes config */}
          <div className="px-8 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center gap-10 overflow-x-auto">
            <div className="flex items-center gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><MapPin size={10} className="text-blue-500" /> AXE X (GROUP BY)</span>
                <div className="flex gap-1.5">
                  {BI_AGGREGATIONS.slice(0, 5).map(agg => (
                    <button key={agg.id} onClick={() => setQuery({ ...query, aggregation: agg.id as AggregationLevel })}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all border ${query.aggregation === agg.id ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-400'}`}>
                      {agg.label.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-10 w-px bg-slate-200" />
              <div className="flex flex-col gap-2">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><TrendingUp size={10} className="text-indigo-500" /> AXE Y (KPI)</span>
                <div className="flex gap-1.5">
                  {BI_KPIS.slice(0, 6).map(kpi => (
                    <button key={kpi.id} onClick={() => toggleMetric(kpi.id)}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all border ${query.y_metrics.includes(kpi.id) ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-400'}`}>
                      {kpi.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex-1" />
            <div className="flex flex-col gap-2">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-right">Style</span>
              <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                {[
                  { id: 'area', icon: <TrendingUp size={12} /> },
                  { id: 'bar', icon: <BarChart3 size={12} /> },
                  { id: 'line', icon: <Activity size={12} /> },
                  { id: 'scatter', icon: <MousePointer2 size={12} /> },
                  { id: 'stacked_bar', icon: <Layers size={12} /> },
                ].map(t => (
                  <button key={t.id} onClick={() => setQuery({ ...query, chart_type: t.id as any })}
                    className={`p-2 rounded-lg transition-all ${query.chart_type === t.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}>
                    {t.icon}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 p-8 overflow-hidden flex flex-col gap-6">
          <div className={`flex-1 bg-white border border-slate-200 rounded-[3.5rem] p-12 shadow-2xl shadow-blue-900/5 relative flex flex-col ${loading ? 'opacity-50 blur-sm' : ''}`}>
            {loading && <div className="absolute inset-0 z-50 flex items-center justify-center"><RefreshCw className="w-12 h-12 text-blue-600 animate-spin" /></div>}
            <div className="flex-1 relative z-10">
              <ResponsiveContainer width="100%" height="100%">
                {query.chart_type === 'scatter' ? (
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="category" dataKey="label" stroke="#94a3b8" fontSize={9} fontWeight={700} axisLine={false} tickLine={false} />
                    <YAxis type="number" dataKey={query.y_metrics[0]} stroke="#94a3b8" fontSize={9} fontWeight={700} axisLine={false} tickLine={false} />
                    <ZAxis type="number" dataKey={query.size_by || ''} range={[100, 2000]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Scatter name={query.y_metrics[0]} data={res?.data || []} fill="#3b82f6" />
                  </ScatterChart>
                ) : (
                  <ComposedChart data={res?.data || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', paddingBottom: '40px' }} />
                    {query.y_metrics.map((metricId, idx) => {
                      const color = BI_KPIS.find(k => k.id === metricId)?.color || ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444'][idx % 6];
                      return (
                        <React.Fragment key={metricId}>
                          {query.chart_type === 'area' && <Area type="monotone" dataKey={metricId} name={BI_KPIS.find(k => k.id === metricId)?.label || metricId} stroke={color} fillOpacity={0.15} fill={color} strokeWidth={4} dot={query.show_points ? { r: 5, strokeWidth: 2, fill: '#fff', stroke: color } : false} />}
                          {query.chart_type === 'bar' && <Bar dataKey={metricId} name={BI_KPIS.find(k => k.id === metricId)?.label || metricId} fill={color} radius={[10, 10, 0, 0]} barSize={query.y_metrics.length > 1 ? 25 : 60} />}
                          {query.chart_type === 'line' && <Line type="monotone" dataKey={metricId} name={BI_KPIS.find(k => k.id === metricId)?.label || metricId} stroke={color} strokeWidth={4} dot={query.show_points ? { r: 5, strokeWidth: 2, fill: '#fff', stroke: color } : false} />}
                          {query.chart_type === 'stacked_bar' && <Bar dataKey={metricId} stackId="bi_stk" name={BI_KPIS.find(k => k.id === metricId)?.label || metricId} fill={color} />}
                        </React.Fragment>
                      );
                    })}
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {showTable && res && (
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden h-[400px] flex flex-col shrink-0">
              <div className="px-10 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <span className="text-[10px] font-black uppercase text-slate-800 tracking-widest">Data Matrix</span>
                <button onClick={() => setShowTable(false)} className="text-slate-400 hover:text-red-500"><X size={18} /></button>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 text-[9px] font-black text-slate-400 sticky top-0 uppercase border-b">
                    <tr>
                      <th className="px-10 py-5">Dimension ({query.aggregation})</th>
                      {query.y_metrics.map(m => <th key={m} className="px-6 py-5">{BI_KPIS.find(k => k.id === m)?.label || m}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {res.data.map((d, i) => (
                      <tr key={i} className="hover:bg-blue-50/20">
                        <td className="px-10 py-5 text-[11px] font-black uppercase text-slate-700">{d.label}</td>
                        {query.y_metrics.map(m => <td key={m} className="px-6 py-5 text-[11px] font-bold text-slate-600">{d[m]?.toFixed(2)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white/95 backdrop-blur-xl p-6 border border-slate-200 rounded-[2.5rem] shadow-2xl min-w-[220px]">
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-3">{label}</div>
        <div className="space-y-4">
          {payload.map((p: any, idx: number) => (
            <div key={idx} className="flex items-center justify-between gap-8">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
                <span className="text-[10px] font-black text-slate-700 uppercase">{p.name}</span>
              </div>
              <span className="text-[14px] font-black text-slate-900 tracking-tighter">{p.value?.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export default AdvancedAnalytics;
