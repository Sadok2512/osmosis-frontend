import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import {
  ArrowLeft, RefreshCw, Download, MoreHorizontal, Settings2, AlertTriangle,
  Activity, Radio, Wrench, Users, CheckCircle2, Loader2, Circle, Search,
  GitBranch, ShieldAlert, Lightbulb, Ticket, AlertOctagon, CheckSquare,
  StickyNote, Share2, TrendingDown, TrendingUp,
} from 'lucide-react';

// ── Tokens ────────────────────────────────────────────────────────────
const C = {
  bg: '#f5f7fb',
  card: '#ffffff',
  border: '#e5e7eb',
  text: '#111827',
  sub: '#6b7280',
  muted: '#9ca3af',
  primary: '#2563eb',
  danger: '#ef4444',
  warn: '#f59e0b',
  success: '#10b981',
  purple: '#8b5cf6',
};

const Card: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className = '' }) => (
  <div
    className={`bg-white rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_-6px_rgba(15,23,42,0.06)] ${className}`}
  >
    {children}
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
    <span className="text-[11px] font-bold tracking-[0.14em] text-slate-700 uppercase">{children}</span>
    {right}
  </div>
);

// ── Header ────────────────────────────────────────────────────────────
const TopHeader: React.FC<{ onBack?: () => void }> = ({ onBack }) => (
  <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200">
    <div className="flex items-center gap-3">
      <span className="text-[13px] font-bold tracking-[0.18em] text-slate-900">ML&nbsp;DETECTOR</span>
      <span className="text-slate-300">/</span>
      <span className="text-[12px] text-slate-500">RCA Analysis</span>
      <span className="text-slate-300">/</span>
      <span className="text-[12px] font-semibold text-slate-900">Anomaly #214</span>
    </div>
    <div className="flex items-center gap-2">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-[12px] text-slate-700 hover:bg-slate-50"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Issues
      </button>
      <button className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 text-white text-[12px] font-medium hover:bg-blue-700">
        <RefreshCw className="w-3.5 h-3.5" /> Re-run RCA
      </button>
      <button className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-[12px] text-slate-700 hover:bg-slate-50">
        <Download className="w-3.5 h-3.5" /> Export Report
      </button>
      <button className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
        <MoreHorizontal className="w-4 h-4" />
      </button>
    </div>
  </div>
);

// ── Anomaly summary card ──────────────────────────────────────────────
const AnomalyHeader: React.FC = () => (
  <Card className="p-5">
    <div className="grid grid-cols-12 gap-6 items-center">
      <div className="col-span-4">
        <span className="inline-block text-[10px] font-bold tracking-[0.14em] text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full uppercase">
          Critical Anomaly
        </span>
        <h1 className="mt-2 text-[26px] font-bold text-slate-900 leading-none">CELL_LTE_01</h1>
        <div className="mt-2 text-[12px] text-slate-500 flex items-center gap-2">
          <span>4G LTE</span><span className="text-slate-300">•</span>
          <span>Paris South</span><span className="text-slate-300">•</span>
          <span>SITE_098</span>
        </div>
      </div>
      <Field label="Detected At" value="08/05/2026 10:02 AM CET" />
      <Field label="Duration" value="4h 32m" />
      <Field label="Severity" value="CRITICAL" valueClass="text-red-600 font-bold" />
      <div className="col-span-2">
        <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">Confidence</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[16px] font-semibold text-slate-900">76%</span>
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600" style={{ width: '76%' }} />
          </div>
        </div>
      </div>
    </div>
  </Card>
);

const Field: React.FC<{ label: string; value: string; valueClass?: string }> = ({ label, value, valueClass = 'text-slate-900' }) => (
  <div className="col-span-2">
    <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">{label}</div>
    <div className={`mt-1 text-[13px] ${valueClass}`}>{value}</div>
  </div>
);

// ── LEFT: Evidence Timeline ───────────────────────────────────────────
type Ev = { time: string; tag: string; tagColor: string; icon: React.ReactNode; title: string; desc: string; asset: string };
const EVENTS: Ev[] = [
  { time: '10:02', tag: 'CONFIG CHANGE', tagColor: 'text-blue-600', icon: <Settings2 className="w-3.5 h-3.5" />, title: 'Antenna Tilt Adjusted', desc: 'Down-tilt changed from 2.0° to 3.5°', asset: 'SITE_098' },
  { time: '10:05', tag: 'ALARM TRIGGERED', tagColor: 'text-red-600', icon: <AlertTriangle className="w-3.5 h-3.5" />, title: 'VSWR Threshold Exceeded', desc: 'VSWR above critical threshold 1.5', asset: 'SITE_098' },
  { time: '10:08', tag: 'PERFORMANCE DEGRADATION', tagColor: 'text-amber-600', icon: <Activity className="w-3.5 h-3.5" />, title: 'SINR Drop Detected', desc: 'SINR decreased by 6dB', asset: 'CELL_LTE_01' },
  { time: '10:12', tag: 'KPI ANOMALY', tagColor: 'text-red-600', icon: <TrendingDown className="w-3.5 h-3.5" />, title: 'Throughput Drop', desc: 'Throughput decreased by 42%', asset: 'CELL_LTE_01' },
  { time: '10:18', tag: 'NEIGHBOR IMPACT', tagColor: 'text-purple-600', icon: <Radio className="w-3.5 h-3.5" />, title: 'Neighbor Cells Affected', desc: '3 neighboring cells showing impact', asset: '3 CELLS' },
  { time: '10:25', tag: 'MAINTENANCE ACTIVITY', tagColor: 'text-slate-500', icon: <Wrench className="w-3.5 h-3.5" />, title: 'No Activity Detected', desc: 'No maintenance in the last 24h', asset: 'SITE_098' },
];

const EvidenceTimeline: React.FC = () => (
  <Card>
    <SectionTitle right={<select className="text-[11px] border border-slate-200 rounded-md px-1.5 py-0.5 text-slate-600 bg-white"><option>24H</option><option>7D</option></select>}>
      Evidence Timeline
    </SectionTitle>
    <div className="px-4 py-3 space-y-3">
      {EVENTS.map((e, i) => (
        <div key={i} className="flex gap-3">
          <div className="text-[11px] font-mono text-slate-500 w-10 pt-1">{e.time}</div>
          <div className="flex flex-col items-center">
            <div className={`flex items-center justify-center w-6 h-6 rounded-full bg-white border-2 ${e.tagColor === 'text-red-600' ? 'border-red-300 text-red-600' : e.tagColor === 'text-amber-600' ? 'border-amber-300 text-amber-600' : e.tagColor === 'text-purple-600' ? 'border-purple-300 text-purple-600' : e.tagColor === 'text-blue-600' ? 'border-blue-300 text-blue-600' : 'border-slate-300 text-slate-500'}`}>
              {e.icon}
            </div>
            {i < EVENTS.length - 1 && <div className="flex-1 w-px bg-slate-200 my-1" />}
          </div>
          <div className="flex-1 pb-1">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[10px] font-bold tracking-wider ${e.tagColor}`}>{e.tag}</span>
              <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{e.asset}</span>
            </div>
            <div className="mt-0.5 text-[12px] font-semibold text-slate-900">{e.title}</div>
            <div className="text-[11px] text-slate-500">{e.desc}</div>
          </div>
        </div>
      ))}
    </div>
  </Card>
);

// ── LEFT: Affected KPIs ───────────────────────────────────────────────
const KPIS = [
  { name: 'Throughput', icon: <Activity className="w-3.5 h-3.5 text-blue-600" />, value: '58.00', unit: 'Mbps', delta: '-42%', bad: true },
  { name: 'SINR', icon: <Radio className="w-3.5 h-3.5 text-emerald-600" />, value: '12.5', unit: 'dB', delta: '-6 dB', bad: true },
  { name: 'RSRP', icon: <Activity className="w-3.5 h-3.5 text-slate-600" />, value: '-98', unit: 'dBm', delta: '-4 dB', bad: true },
  { name: 'Drop Call Rate', icon: <AlertTriangle className="w-3.5 h-3.5 text-red-600" />, value: '2.8', unit: '%', delta: '+1.6 %', bad: true },
  { name: 'PRB Utilization', icon: <TrendingUp className="w-3.5 h-3.5 text-amber-600" />, value: '78', unit: '%', delta: '+18 %', bad: true },
];

const AffectedKpis: React.FC = () => (
  <Card>
    <SectionTitle>Affected KPIs</SectionTitle>
    <div className="divide-y divide-slate-100">
      {KPIS.map(k => (
        <div key={k.name} className="flex items-center px-4 py-2.5 text-[12px]">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="w-6 h-6 rounded-md bg-slate-50 border border-slate-100 flex items-center justify-center">{k.icon}</span>
            <span className="text-slate-700 truncate">{k.name}</span>
          </div>
          <div className="text-right w-20">
            <span className="font-semibold text-slate-900">{k.value}</span>
            <span className="text-[10px] text-slate-400 ml-1">{k.unit}</span>
          </div>
          <div className={`text-right w-16 text-[11px] font-semibold ${k.bad ? 'text-red-600' : 'text-emerald-600'}`}>{k.delta}</div>
        </div>
      ))}
    </div>
    <div className="px-4 py-2 border-t border-slate-100 text-center">
      <button className="text-[11px] text-blue-600 font-medium hover:underline">View all KPIs</button>
    </div>
  </Card>
);

// ── CENTER: KPI chart ─────────────────────────────────────────────────
const KpiChart: React.FC = () => {
  const option = useMemo(() => {
    const hours = ['06:00','08:00','10:00','12:00','14:00','16:00','18:00','20:00','22:00','00:00','02:00','04:00','06:00'];
    const actual = [95, 96, 94, 92, 55, 52, 54, 56, 58, 60, 61, 62, 63];
    const baseline = [94, 95, 95, 94, 88, 85, 84, 83, 82, 81, 80, 80, 79];
    const anomaly = [2, 3, 4, 8, 92, 30, 12, 6, 4, 3, 3, 2, 2];
    return {
      grid: { left: 36, right: 44, top: 30, bottom: 32 },
      tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#e5e7eb', textStyle: { color: '#111827', fontSize: 11 } },
      legend: { show: false },
      xAxis: {
        type: 'category', data: hours,
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
        axisTick: { show: false },
      },
      yAxis: [
        { type: 'value', name: 'Mbps', nameTextStyle: { color: '#94a3b8', fontSize: 10 }, axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
        { type: 'value', name: 'Anomaly Score', nameTextStyle: { color: '#94a3b8', fontSize: 10 }, max: 100, axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        { name: 'Actual', type: 'line', data: actual, smooth: true, symbol: 'none', lineStyle: { color: C.primary, width: 2 }, areaStyle: { color: 'rgba(37,99,235,0.08)' } },
        { name: 'Baseline (7D Avg)', type: 'line', data: baseline, smooth: true, symbol: 'none', lineStyle: { color: '#94a3b8', width: 1.5, type: 'dashed' } },
        { name: 'Anomaly Score', type: 'line', yAxisIndex: 1, data: anomaly, smooth: true, symbol: 'none', lineStyle: { color: C.danger, width: 2 } },
      ],
      markLine: {
        symbol: 'none',
        data: [{ xAxis: '10:00', label: { formatter: '10:02 Incident Start', color: '#ef4444', fontSize: 10, backgroundColor: '#fee2e2', padding: [3,6], borderRadius: 4 }, lineStyle: { color: '#ef4444', type: 'dashed' } }],
      },
    } as any;
  }, []);

  return (
    <Card>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <span className="text-[11px] font-bold tracking-[0.14em] text-slate-700 uppercase">KPI Trends & ML Detector</span>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <Legend color={C.primary} label="Actual" />
          <Legend color="#94a3b8" label="Baseline (7D Avg)" dashed />
          <Legend color={C.danger} label="Anomaly Score" />
        </div>
      </div>
      <div className="px-4 pt-3 flex flex-wrap items-center gap-3 text-[11px]">
        <Selector label="KPI" value="Throughput" />
        <Selector label="Comparison" value="Baseline (7D Avg)" />
        <Selector label="Time Range" value="Last 24 Hours" />
      </div>
      <div className="px-2 pb-2">
        <ReactECharts option={option} style={{ height: 260 }} opts={{ renderer: 'svg' }} />
      </div>
    </Card>
  );
};

const Legend: React.FC<{ color: string; label: string; dashed?: boolean }> = ({ color, label, dashed }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="inline-block w-4 h-[2px]" style={{ background: color, borderTop: dashed ? `2px dashed ${color}` : undefined, height: dashed ? 0 : 2 }} />
    {label}
  </span>
);

const Selector: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="inline-flex items-center gap-1.5">
    <span className="text-slate-500">{label}:</span>
    <button className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-medium">
      {value}
      <svg className="w-3 h-3 text-slate-400" viewBox="0 0 20 20" fill="currentColor"><path d="M5.5 7.5l4.5 5 4.5-5z" /></svg>
    </button>
  </div>
);

// ── CENTER: ML Detector Jalon ─────────────────────────────────────────
type Step = { title: string; sub: string; status: 'done' | 'anomaly' | 'progress'; time: string };
const STEPS: Step[] = [
  { title: 'Baseline Deviation', sub: 'Detected', status: 'done', time: '10:02' },
  { title: 'Anomaly Confirmed', sub: 'High Confidence', status: 'anomaly', time: '10:05' },
  { title: 'Pattern Analysis', sub: 'In Progress', status: 'progress', time: '10:06' },
  { title: 'Correlation Engine', sub: 'Running', status: 'progress', time: '10:06' },
  { title: 'Root Cause Analysis', sub: 'Completed', status: 'done', time: '10:08' },
  { title: 'Recommendation Ready', sub: 'Ready', status: 'done', time: '10:09' },
];

const StepIcon: React.FC<{ status: Step['status'] }> = ({ status }) => {
  if (status === 'done') return <div className="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-emerald-600" /></div>;
  if (status === 'anomaly') return <div className="w-7 h-7 rounded-full bg-red-50 border border-red-200 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-red-600" /></div>;
  return <div className="w-7 h-7 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center"><Loader2 className="w-4 h-4 text-blue-600 animate-spin" /></div>;
};

const MlJalon: React.FC = () => (
  <Card>
    <SectionTitle>ML Detector Jalon</SectionTitle>
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        {STEPS.map((s, i) => (
          <React.Fragment key={i}>
            <div className={`flex flex-col items-center text-center min-w-0 flex-1 ${s.status === 'anomaly' ? 'bg-red-50/50 rounded-lg p-2 -m-1' : ''}`}>
              <StepIcon status={s.status} />
              <div className="mt-2 text-[11px] font-semibold text-slate-900 leading-tight">{s.title}</div>
              <div className={`text-[10px] mt-0.5 ${s.status === 'done' ? 'text-emerald-600' : s.status === 'anomaly' ? 'text-red-600' : 'text-blue-600'}`}>{s.sub}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{s.time}</div>
            </div>
            {i < STEPS.length - 1 && <div className="h-px flex-1 bg-slate-200 mt-3.5" />}
          </React.Fragment>
        ))}
      </div>
    </div>
  </Card>
);

// ── CENTER: Analysis Summary (compact) ────────────────────────────────
const AnalysisAndRca: React.FC = () => (
  <Card>
    <SectionTitle right={<span className="text-[10px] font-semibold text-red-600">Primary Cause: External Interference</span>}>
      Analysis Summary
    </SectionTitle>
    <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] text-slate-700">
      {[
        'Throughput drop started 18 min after antenna tilt change.',
        'SINR dropped by 6 dB with noise floor increase.',
        'VSWR alarm triggered — possible antenna issue.',
        '3 neighboring cells experiencing performance impact.',
        'No backhaul alarms or latency degradation detected.',
        'Tilt change strongly correlated with anomaly window.',
      ].map((t, i) => (
        <div key={i} className="flex items-start gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
          <span>{t}</span>
        </div>
      ))}
    </div>
  </Card>
);

// ── BOTTOM: Neighbor Impact + Similar Incidents ───────────────────────
type NeighborRow = { cell: string; distance: string; health: number; impact: 'Low' | 'Medium' | 'High' };
const NEIGHBORS: NeighborRow[] = [
  { cell: 'CELL_LTE_02', distance: '450 m', health: 98, impact: 'Low' },
  { cell: 'CELL_LTE_03', distance: '820 m', health: 94, impact: 'Low' },
  { cell: 'CELL_LTE_04', distance: '1.2 km', health: 82, impact: 'Medium' },
  { cell: 'CELL_LTE_05', distance: '1.8 km', health: 76, impact: 'High' },
];

const impactStyle = (i: NeighborRow['impact']) =>
  i === 'High'
    ? 'bg-red-50 text-red-600 border-red-200'
    : i === 'Medium'
      ? 'bg-amber-50 text-amber-600 border-amber-200'
      : 'bg-emerald-50 text-emerald-600 border-emerald-200';

const healthColor = (h: number) =>
  h >= 90 ? 'text-emerald-600' : h >= 80 ? 'text-amber-600' : 'text-red-600';

const NeighborImpact: React.FC = () => (
  <Card>
    <SectionTitle right={<span className="text-[10px] text-slate-400">{NEIGHBORS.length} cells</span>}>
      Neighbor Impact
    </SectionTitle>
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase bg-slate-50/60">
          <th className="text-left px-4 py-2">Cell ID</th>
          <th className="text-left px-2 py-2">Distance</th>
          <th className="text-left px-2 py-2">Health</th>
          <th className="text-right px-4 py-2">Impact</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {NEIGHBORS.map((n) => (
          <tr key={n.cell} className="hover:bg-slate-50/60">
            <td className="px-4 py-2.5 font-medium text-slate-900">{n.cell}</td>
            <td className="px-2 py-2.5 text-slate-600">{n.distance}</td>
            <td className={`px-2 py-2.5 font-semibold ${healthColor(n.health)}`}>{n.health}%</td>
            <td className="px-4 py-2.5 text-right">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${impactStyle(n.impact)}`}>
                {n.impact}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </Card>
);

type IncidentRow = { date: string; site: string; cause: string; sim: number; resolution: string };
const INCIDENTS: IncidentRow[] = [
  { date: '28/04/2026', site: 'SITE_112', cause: 'External Interference', sim: 92, resolution: 'Power adjustment + Tilt revert' },
  { date: '15/04/2026', site: 'SITE_098', cause: 'Antenna Tilt Change', sim: 89, resolution: 'Tilt reverted' },
  { date: '03/04/2026', site: 'SITE_221', cause: 'Interference', sim: 85, resolution: 'Interference source removed' },
];

const SimilarIncidents: React.FC = () => (
  <Card>
    <SectionTitle right={<span className="text-[10px] text-slate-400">Last 60 days</span>}>
      Similar Incidents
    </SectionTitle>
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase bg-slate-50/60">
          <th className="text-left px-4 py-2">Date</th>
          <th className="text-left px-2 py-2">Site</th>
          <th className="text-left px-2 py-2">Root Cause</th>
          <th className="text-left px-2 py-2">Similarity</th>
          <th className="text-left px-4 py-2">Resolution</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {INCIDENTS.map((it) => (
          <tr key={it.date} className="hover:bg-slate-50/60">
            <td className="px-4 py-2.5 font-mono text-slate-600">{it.date}</td>
            <td className="px-2 py-2.5 font-medium text-slate-900">{it.site}</td>
            <td className="px-2 py-2.5 text-slate-700">{it.cause}</td>
            <td className="px-2 py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">{it.sim}%</span>
                <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600" style={{ width: `${it.sim}%` }} />
                </div>
              </div>
            </td>
            <td className="px-4 py-2.5 text-slate-600">{it.resolution}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </Card>
);

// ── RIGHT: Recommendations ────────────────────────────────────────────
type Reco = { title: string; desc: string; impact: 'High' | 'Medium' | 'Low'; conf: number; icon: React.ReactNode };
const RECOS: Reco[] = [
  { title: 'Verify Interference Source', desc: 'Check external interference in 1800 MHz band', impact: 'High', conf: 78, icon: <Search className="w-3.5 h-3.5" /> },
  { title: 'Revert Antenna Tilt', desc: 'Revert antenna tilt to previous value (2.0°)', impact: 'High', conf: 72, icon: <GitBranch className="w-3.5 h-3.5" /> },
  { title: 'Monitor KPIs', desc: 'Monitor KPIs for next 30 minutes', impact: 'Medium', conf: 65, icon: <Activity className="w-3.5 h-3.5" /> },
  { title: 'Check VSWR and Connections', desc: 'Inspect antenna connections and VSWR', impact: 'Medium', conf: 60, icon: <ShieldAlert className="w-3.5 h-3.5" /> },
];

const Recommendations: React.FC = () => (
  <Card>
    <SectionTitle>Recommendations</SectionTitle>
    <div className="divide-y divide-slate-100">
      {RECOS.map((r, i) => (
        <div key={i} className="px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <span className="w-7 h-7 rounded-md bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">{r.icon}</span>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-slate-900 truncate">{r.title}</div>
                <div className="text-[11px] text-slate-500">{r.desc}</div>
              </div>
            </div>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${r.impact === 'High' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>◇ {r.impact}</span>
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <span className="text-[11px] font-semibold text-slate-700">{r.conf}%</span>
            <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600" style={{ width: `${r.conf}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
    <div className="px-4 py-2 border-t border-slate-100 text-center">
      <button className="text-[11px] text-blue-600 font-medium hover:underline">View all recommendations</button>
    </div>
  </Card>
);

const Actions: React.FC = () => (
  <Card>
    <SectionTitle>Actions</SectionTitle>
    <div className="grid grid-cols-2 gap-2 p-3">
      <ActionBtn icon={<Ticket className="w-3.5 h-3.5" />} label="Create Ticket" variant="primary" />
      <ActionBtn icon={<AlertOctagon className="w-3.5 h-3.5" />} label="Escalate Issue" variant="danger" />
      <ActionBtn icon={<CheckSquare className="w-3.5 h-3.5" />} label="Mark Resolved" variant="success" />
      <ActionBtn icon={<StickyNote className="w-3.5 h-3.5" />} label="Add Note" />
      <ActionBtn icon={<Share2 className="w-3.5 h-3.5" />} label="Share Analysis" />
    </div>
  </Card>
);

const ActionBtn: React.FC<{ icon: React.ReactNode; label: string; variant?: 'primary' | 'danger' | 'success' | 'default' }> = ({ icon, label, variant = 'default' }) => {
  const cls = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 border-red-200',
    success: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-200',
    default: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200',
  }[variant];
  return (
    <button className={`inline-flex items-center justify-center gap-1.5 h-8 rounded-lg border text-[12px] font-medium ${cls}`}>
      {icon}{label}
    </button>
  );
};

// ── Page ──────────────────────────────────────────────────────────────
const SentinelRCA: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  return (
    <div className="min-h-full bg-[#f5f7fb] -mx-6 -mt-2 -mb-6">
      <TopHeader onBack={onBack} />
      <div className="px-6 py-4 space-y-4">
        <AnomalyHeader />
        <div className="grid grid-cols-12 gap-4">
          {/* LEFT */}
          <div className="col-span-3 space-y-4">
            <EvidenceTimeline />
            <AffectedKpis />
          </div>
          {/* CENTER */}
          <div className="col-span-6 space-y-4">
            <KpiChart />
            <MlJalon />
            <AnalysisAndRca />
          </div>
          {/* RIGHT */}
          <div className="col-span-3 space-y-4">
            <Recommendations />
            <Actions />
          </div>
        </div>
        {/* BOTTOM */}
        <div className="grid grid-cols-2 gap-4">
          <NeighborImpact />
          <SimilarIncidents />
        </div>
      </div>
    </div>
  );
};

export default SentinelRCA;
