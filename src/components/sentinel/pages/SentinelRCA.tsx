// SentinelRCA — full-page RCA view for one anomaly.
// Layout from the original mockup, but every panel now consumes real data
// from ml-engine (anomaly) + agentic-engine (diagnostic / recommendation /
// approval / execution / outcome). Cells without data render an empty
// state instead of fabricating a number — keeps the page honest until
// the relevant upstream step has actually run.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import {
  ArrowLeft, RefreshCw, Download, MoreHorizontal, AlertTriangle,
  Activity, CheckCircle2, Loader2, Circle, Search,
  ShieldAlert, Lightbulb, Ticket, AlertOctagon, CheckSquare,
  StickyNote, Share2, TrendingDown, TrendingUp, GitBranch,
} from 'lucide-react';
import {
  MlAnomaly, RcaDiagnostic, Recommendation, RiskApproval,
  ExecutionRow, OutcomeRow,
  getDiagnostic, getRecommendation, getApproval,
  getExecutionByRec, getOutcomeForExecution, streamDiagnose,
} from '../mlDetectorApi';

const C = {
  primary: '#2563eb',
  danger: '#ef4444',
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

const fmtNum = (v: number | null | undefined): string =>
  v == null ? '—' : (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));

const fmtPct = (v: number | null | undefined): string =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return iso; }
};

// Severity → red/amber/slate. Mirrors the chip styles used elsewhere in
// the Sentinel UI so the RCA page reads visually identical to the drawer.
const sevStyle = (sev: string): { chip: string; valueClass: string; label: string } => {
  const s = (sev || 'info').toLowerCase();
  if (s === 'critical') return { chip: 'text-red-600 bg-red-50 border-red-200', valueClass: 'text-red-600 font-bold', label: 'CRITICAL' };
  if (s === 'warning')  return { chip: 'text-amber-600 bg-amber-50 border-amber-200', valueClass: 'text-amber-700 font-bold', label: 'WARNING' };
  return { chip: 'text-slate-600 bg-slate-50 border-slate-200', valueClass: 'text-slate-700 font-semibold', label: s.toUpperCase() };
};


// ── Top bar ───────────────────────────────────────────────────────────
const TopHeader: React.FC<{
  anomaly: MlAnomaly | null;
  onBack?: () => void;
  onRerun?: () => void;
  rerunning?: boolean;
}> = ({ anomaly, onBack, onRerun, rerunning }) => (
  <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200">
    <div className="flex items-center gap-3">
      <span className="text-[13px] font-bold tracking-[0.18em] text-slate-900">ML&nbsp;DETECTOR</span>
      <span className="text-slate-300">/</span>
      <span className="text-[12px] text-slate-500">RCA Analysis</span>
      <span className="text-slate-300">/</span>
      <span className="text-[12px] font-semibold text-slate-900">
        {anomaly ? `Anomaly #${anomaly.id}` : 'No anomaly selected'}
      </span>
    </div>
    <div className="flex items-center gap-2">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-[12px] text-slate-700 hover:bg-slate-50"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Issues
      </button>
      <button
        onClick={onRerun}
        disabled={!anomaly || rerunning}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 text-white text-[12px] font-medium hover:bg-blue-700 disabled:opacity-40"
      >
        {rerunning
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <RefreshCw className="w-3.5 h-3.5" />}
        Re-run RCA
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
const Field: React.FC<{ label: string; value: string; valueClass?: string }> = ({ label, value, valueClass = 'text-slate-900' }) => (
  <div className="col-span-2">
    <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">{label}</div>
    <div className={`mt-1 text-[13px] ${valueClass}`}>{value}</div>
  </div>
);

const AnomalyHeader: React.FC<{ anomaly: MlAnomaly; diagnostic: RcaDiagnostic | null }> = ({ anomaly, diagnostic }) => {
  const sev = sevStyle(anomaly.severity);
  const conf = diagnostic?.confidence != null ? Math.round(diagnostic.confidence * 100) : null;
  return (
    <Card className="p-5">
      <div className="grid grid-cols-12 gap-6 items-center">
        <div className="col-span-4">
          <span className={`inline-block text-[10px] font-bold tracking-[0.14em] px-2 py-0.5 rounded-full border uppercase ${sev.chip}`}>
            {sev.label} ANOMALY
          </span>
          <h1 className="mt-2 text-[26px] font-bold text-slate-900 leading-none">{anomaly.cell_name || '—'}</h1>
          <div className="mt-2 text-[12px] text-slate-500 flex items-center gap-2">
            <span>{anomaly.kpi_code}</span>
            {anomaly.dimension_key && (
              <><span className="text-slate-300">•</span><span>{anomaly.dimension_key}</span></>
            )}
            <span className="text-slate-300">•</span>
            <span>profile #{anomaly.detector_id}</span>
          </div>
        </div>
        <Field label="Detected At" value={fmtDate(anomaly.detected_at)} />
        <Field label="Period" value={fmtDate(anomaly.period_start)} />
        <Field label="Severity" value={sev.label} valueClass={sev.valueClass} />
        <div className="col-span-2">
          <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">Confidence (RCAI)</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[16px] font-semibold text-slate-900">{conf != null ? `${conf}%` : '—'}</span>
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600" style={{ width: `${conf ?? 0}%` }} />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};


// ── Evidence Timeline ─────────────────────────────────────────────────
// Real diagnostic markdown rendered as a plain text panel until we
// promote the agentic-engine to emit a structured event list. The
// previous hardcoded 6-event sample lived here.
const EvidenceTimeline: React.FC<{ diagnostic: RcaDiagnostic | null; loading: boolean }> = ({ diagnostic, loading }) => (
  <Card>
    <SectionTitle right={<span className="text-[10px] text-slate-400">RCAI</span>}>
      Evidence Timeline
    </SectionTitle>
    <div className="px-4 py-3">
      {loading && (
        <div className="flex items-center gap-2 text-[12px] text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading diagnostic…
        </div>
      )}
      {!loading && !diagnostic && (
        <div className="text-[12px] text-slate-400 italic">
          No diagnostic yet — trigger Re-run RCA to invoke the RCAI agent.
        </div>
      )}
      {!loading && diagnostic && (
        <div className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-wrap max-h-[420px] overflow-auto">
          {diagnostic.summary || diagnostic.suspected_cause || 'No summary available.'}
        </div>
      )}
    </div>
  </Card>
);


// ── Affected KPIs ─────────────────────────────────────────────────────
// Just the anomaly's own KPI for now — neighbouring-KPI joins are a
// separate ml-engine endpoint we haven't built yet.
const AffectedKpis: React.FC<{ anomaly: MlAnomaly }> = ({ anomaly }) => {
  const rows = [
    { label: 'Value',     value: fmtNum(anomaly.value),     bad: false },
    { label: 'Δ vs 7d',   value: fmtPct(anomaly.delta_7),   bad: (anomaly.delta_7 ?? 0) < 0 },
    { label: 'Δ vs 14d',  value: fmtPct(anomaly.delta_14),  bad: (anomaly.delta_14 ?? 0) < 0 },
    { label: 'z-score',   value: fmtNum(anomaly.z_score),   bad: Math.abs(anomaly.z_score ?? 0) > 2 },
    { label: 'Trend %',   value: fmtPct(anomaly.trend_pct), bad: (anomaly.trend_pct ?? 0) < -10 },
  ];
  return (
    <Card>
      <SectionTitle>Affected KPI</SectionTitle>
      <div className="px-4 py-2 border-b border-slate-100">
        <div className="text-[13px] font-semibold text-slate-900">{anomaly.kpi_code}</div>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map(r => (
          <div key={r.label} className="flex items-center px-4 py-2 text-[12px]">
            <div className="flex-1 text-slate-600">{r.label}</div>
            <div className={`text-right text-[12px] font-semibold ${r.bad ? 'text-red-600' : 'text-slate-900'}`}>{r.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
};


// ── KPI chart ─────────────────────────────────────────────────────────
// Placeholder series until /kpi-api timeseries fetch is wired. We render
// the anomaly's own value at the anomaly hour so the user gets at least
// the marker — full historical baseline is on the TODO list.
const KpiChart: React.FC<{ anomaly: MlAnomaly }> = ({ anomaly }) => {
  const option = useMemo(() => {
    const anchor = anomaly.period_start ? new Date(anomaly.period_start) : new Date();
    const hours: string[] = [];
    for (let i = -6; i <= 6; i++) {
      const d = new Date(anchor.getTime() + i * 3600 * 1000);
      hours.push(d.toISOString().slice(11, 16));
    }
    const center = 6;
    const baseline = hours.map(() => (anomaly.value ?? 0) - (anomaly.delta_7 ?? 0));
    const actual = hours.map((_, i) => i === center ? (anomaly.value ?? 0) : baseline[i]);
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
      yAxis: [{ type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: '#f1f5f9' } } }],
      series: [
        { name: 'Actual',   type: 'line', data: actual,   smooth: true, symbol: 'none', lineStyle: { color: C.primary, width: 2 }, areaStyle: { color: 'rgba(37,99,235,0.08)' } },
        { name: 'Baseline', type: 'line', data: baseline, smooth: true, symbol: 'none', lineStyle: { color: '#94a3b8', width: 1.5, type: 'dashed' } },
      ],
      markLine: {
        symbol: 'none',
        data: [{ xAxis: hours[center], label: { formatter: `${hours[center]} Anomaly`, color: '#ef4444', fontSize: 10, backgroundColor: '#fee2e2', padding: [3, 6], borderRadius: 4 }, lineStyle: { color: '#ef4444', type: 'dashed' } }],
      },
    } as any;
  }, [anomaly]);

  return (
    <Card>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <span className="text-[11px] font-bold tracking-[0.14em] text-slate-700 uppercase">{anomaly.kpi_code} — anomaly window</span>
        <span className="text-[10px] text-slate-400">±6h around period_start (timeseries fetch TODO)</span>
      </div>
      <div className="px-2 pb-2">
        <ReactECharts option={option} style={{ height: 260 }} opts={{ renderer: 'svg' }} />
      </div>
    </Card>
  );
};


// ── ML Detector Jalon (5-phase agentic pipeline) ─────────────────────
type PhaseStatus = 'idle' | 'progress' | 'done' | 'error';
type Phase = { code: string; title: string; sub: string; status: PhaseStatus; ts: string | null };

const StepIcon: React.FC<{ status: PhaseStatus }> = ({ status }) => {
  if (status === 'done')     return <div className="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-emerald-600" /></div>;
  if (status === 'error')    return <div className="w-7 h-7 rounded-full bg-red-50 border border-red-200 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-red-600" /></div>;
  if (status === 'progress') return <div className="w-7 h-7 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center"><Loader2 className="w-4 h-4 text-blue-600 animate-spin" /></div>;
  return <div className="w-7 h-7 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center"><Circle className="w-3 h-3 text-slate-300" /></div>;
};

const subColor = (s: PhaseStatus) =>
  s === 'done'     ? 'text-emerald-600'
  : s === 'error'  ? 'text-red-600'
  : s === 'progress' ? 'text-blue-600'
  : 'text-slate-400';

const MlJalon: React.FC<{ phases: Phase[] }> = ({ phases }) => (
  <Card>
    <SectionTitle>Agentic Pipeline</SectionTitle>
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        {phases.map((p, i) => (
          <React.Fragment key={p.code}>
            <div className="flex flex-col items-center text-center min-w-0 flex-1">
              <StepIcon status={p.status} />
              <div className="mt-2 text-[11px] font-semibold text-slate-900 leading-tight">{p.title}</div>
              <div className={`text-[10px] mt-0.5 ${subColor(p.status)}`}>{p.sub}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{p.ts ? fmtDate(p.ts) : '—'}</div>
            </div>
            {i < phases.length - 1 && <div className="h-px flex-1 bg-slate-200 mt-3.5" />}
          </React.Fragment>
        ))}
      </div>
    </div>
  </Card>
);


// ── Analysis Summary ──────────────────────────────────────────────────
const AnalysisAndRca: React.FC<{ diagnostic: RcaDiagnostic | null }> = ({ diagnostic }) => (
  <Card>
    <SectionTitle right={
      <span className="text-[10px] font-semibold text-red-600">
        {diagnostic?.suspected_cause ? `Primary Cause: ${diagnostic.suspected_cause}` : 'No cause yet'}
      </span>
    }>
      Analysis Summary
    </SectionTitle>
    <div className="px-4 py-3 text-[12px] text-slate-700">
      {diagnostic?.summary ? (
        <div className="leading-relaxed whitespace-pre-wrap max-h-[260px] overflow-auto">
          {diagnostic.summary}
        </div>
      ) : (
        <div className="italic text-slate-400">Run RCAI to populate the analysis summary.</div>
      )}
    </div>
  </Card>
);


// ── Recommendations ───────────────────────────────────────────────────
const Recommendations: React.FC<{ recommendation: Recommendation | null; approval: RiskApproval | null }> = ({ recommendation, approval }) => (
  <Card>
    <SectionTitle>Recommendation (OPTIMUS)</SectionTitle>
    <div className="px-4 py-3">
      {!recommendation && (
        <div className="text-[12px] text-slate-400 italic">No recommendation yet.</div>
      )}
      {recommendation && (
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="w-7 h-7 rounded-md bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
              <GitBranch className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-slate-900 break-words">
                {recommendation.param_path || 'Parameter change'}
              </div>
              <div className="text-[11px] text-slate-500">
                {recommendation.current_value ?? '—'} → <span className="font-semibold text-slate-700">{recommendation.proposed_value ?? '—'}</span>
              </div>
            </div>
          </div>
          {recommendation.rationale && (
            <div className="text-[11px] text-slate-600 leading-relaxed pl-9">
              {recommendation.rationale}
            </div>
          )}
          <div className="pl-9 flex items-center gap-3 text-[11px]">
            <span className="text-slate-500">Forecast Δ KPI:</span>
            <span className="font-semibold text-slate-700">{fmtPct(recommendation.forecast_kpi_delta)}</span>
            {recommendation.peer_median != null && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">Peer median:</span>
                <span className="font-semibold text-slate-700">{fmtNum(recommendation.peer_median)}</span>
              </>
            )}
          </div>
          {approval && (
            <div className="pl-9 mt-2 flex items-center gap-2 text-[11px]">
              <span className="text-slate-500">AEGIS risk:</span>
              <span className="font-semibold text-slate-700">{approval.risk_score != null ? approval.risk_score.toFixed(2) : '—'}</span>
              <span className="text-slate-300">•</span>
              <span className={`font-semibold ${
                approval.decision === 'approved' ? 'text-emerald-600' :
                approval.decision === 'rejected' ? 'text-red-600' : 'text-amber-600'
              }`}>{approval.decision || approval.auto_decision || 'pending'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  </Card>
);


// ── Execution + Outcome (right rail) ─────────────────────────────────
const ExecutionPanel: React.FC<{ execution: ExecutionRow | null; outcome: OutcomeRow | null }> = ({ execution, outcome }) => (
  <Card>
    <SectionTitle>Execution &amp; Outcome</SectionTitle>
    <div className="px-4 py-3 text-[12px]">
      {!execution && <div className="text-slate-400 italic">No execution plan yet.</div>}
      {execution && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">EXA status:</span>
            <span className={`font-semibold ${execution.status === 'completed' ? 'text-emerald-600' : execution.status === 'failed' ? 'text-red-600' : 'text-blue-600'}`}>
              {execution.status}
            </span>
          </div>
          {execution.canary_cell && (
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Canary:</span>
              <span className="font-mono text-slate-800">{execution.canary_cell}</span>
            </div>
          )}
          {execution.started_at && (
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Started:</span>
              <span className="text-slate-700">{fmtDate(execution.started_at)}</span>
            </div>
          )}
          {execution.completed_at && (
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Completed:</span>
              <span className="text-slate-700">{fmtDate(execution.completed_at)}</span>
            </div>
          )}
        </div>
      )}
      {outcome && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">ECHO outcome:</span>
            <span className={`font-semibold ${outcome.success ? 'text-emerald-600' : 'text-red-600'}`}>
              {outcome.success === null ? 'inconclusive' : outcome.success ? 'success' : 'failed'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Forecast Δ:</span>
            <span className="text-slate-800 font-semibold">{fmtPct(outcome.forecast_delta)}</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500">Actual Δ:</span>
            <span className="text-slate-800 font-semibold">{fmtPct(outcome.actual_delta)}</span>
          </div>
        </div>
      )}
    </div>
  </Card>
);


// ── Actions ──────────────────────────────────────────────────────────
const ActionBtn: React.FC<{ icon: React.ReactNode; label: string; variant?: 'primary' | 'danger' | 'success' | 'default' }> = ({ icon, label, variant = 'default' }) => {
  const cls = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600',
    danger:  'bg-red-50 text-red-600 hover:bg-red-100 border-red-200',
    success: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-200',
    default: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200',
  }[variant];
  return (
    <button className={`inline-flex items-center justify-center gap-1.5 h-8 rounded-lg border text-[12px] font-medium ${cls}`}>
      {icon}{label}
    </button>
  );
};

const Actions: React.FC = () => (
  <Card>
    <SectionTitle>Actions</SectionTitle>
    <div className="grid grid-cols-2 gap-2 p-3">
      <ActionBtn icon={<Ticket className="w-3.5 h-3.5" />}      label="Create Ticket"   variant="primary" />
      <ActionBtn icon={<AlertOctagon className="w-3.5 h-3.5" />} label="Escalate Issue"  variant="danger" />
      <ActionBtn icon={<CheckSquare className="w-3.5 h-3.5" />}  label="Mark Resolved"   variant="success" />
      <ActionBtn icon={<StickyNote className="w-3.5 h-3.5" />}   label="Add Note" />
      <ActionBtn icon={<Share2 className="w-3.5 h-3.5" />}       label="Share Analysis" />
    </div>
  </Card>
);


// ── Page ──────────────────────────────────────────────────────────────
const SentinelRCA: React.FC<{ onBack?: () => void; anomaly?: MlAnomaly | null }> = ({ onBack, anomaly }) => {
  const [diagnostic,     setDiagnostic]     = useState<RcaDiagnostic | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [approval,       setApproval]       = useState<RiskApproval | null>(null);
  const [execution,      setExecution]      = useState<ExecutionRow | null>(null);
  const [outcome,        setOutcome]        = useState<OutcomeRow | null>(null);
  const [loadingDiag,    setLoadingDiag]    = useState(false);
  const [rerunning,      setRerunning]      = useState(false);

  // Chain: anomaly → diagnostic → recommendation → approval → execution → outcome.
  // Each step short-circuits if its upstream produced nothing; that way a
  // freshly-detected anomaly that has only run RCAI still renders cleanly
  // (no spinner storm trying to fetch executions that don't exist yet).
  const loadAll = useCallback(async () => {
    if (!anomaly) return;
    setLoadingDiag(true);
    setDiagnostic(null); setRecommendation(null); setApproval(null);
    setExecution(null); setOutcome(null);
    try {
      const d = await getDiagnostic(anomaly.id).catch(() => null);
      setDiagnostic(d);
      if (!d?.id) return;
      const r = await getRecommendation(d.id).catch(() => null);
      setRecommendation(r);
      if (!r?.id) return;
      const a = await getApproval(r.id).catch(() => null);
      setApproval(a);
      const e = await getExecutionByRec(r.id).catch(() => null);
      setExecution(e);
      if (!e?.id) return;
      const o = await getOutcomeForExecution(e.id).catch(() => null);
      setOutcome(o);
    } finally {
      setLoadingDiag(false);
    }
  }, [anomaly?.id]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // Re-run RCAI on demand: streams chunks (discarded — we just need the
  // final persisted row), then re-fetches the chain to refresh the page.
  const onRerun = useCallback(async () => {
    if (!anomaly) return;
    setRerunning(true);
    try {
      for await (const _ of streamDiagnose(anomaly.id, { force: true })) {
        // chunks streamed but not displayed inline here — the drawer in
        // SentinelMLDetector is the live-text view; this page shows the
        // persisted result.
      }
      await loadAll();
    } catch {
      // surfaced via empty state — TODO: toast
    } finally {
      setRerunning(false);
    }
  }, [anomaly?.id, loadAll]);

  const phases: Phase[] = useMemo(() => ([
    {
      code: 'rca',
      title: 'RCA',
      sub: diagnostic?.status === 'completed' ? 'completed'
         : diagnostic?.status === 'failed' ? 'failed'
         : diagnostic ? 'running' : 'pending',
      status: diagnostic?.status === 'completed' ? 'done'
            : diagnostic?.status === 'failed' ? 'error'
            : diagnostic ? 'progress' : 'idle',
      ts: diagnostic?.completed_at || diagnostic?.started_at || null,
    },
    {
      code: 'reco',
      title: 'Recommendation',
      sub: recommendation ? (recommendation.status || 'ready') : 'pending',
      status: recommendation ? 'done' : 'idle',
      ts: recommendation?.created_at || null,
    },
    {
      code: 'risk',
      title: 'Risk + Approval',
      sub: approval?.decision || approval?.auto_decision || 'pending',
      status: approval?.decision === 'approved' ? 'done'
            : approval?.decision === 'rejected' ? 'error'
            : approval ? 'progress' : 'idle',
      ts: approval?.decision_ts || approval?.created_at || null,
    },
    {
      code: 'exec',
      title: 'Execution',
      sub: execution?.status || 'pending',
      status: execution?.status === 'completed' ? 'done'
            : execution?.status === 'failed' ? 'error'
            : execution ? 'progress' : 'idle',
      ts: execution?.completed_at || execution?.started_at || null,
    },
    {
      code: 'outcome',
      title: 'Outcome',
      sub: outcome ? (outcome.success === null ? 'inconclusive' : outcome.success ? 'success' : 'failed') : 'pending',
      status: outcome?.success === true ? 'done'
            : outcome?.success === false ? 'error'
            : outcome ? 'progress' : 'idle',
      ts: outcome?.assessed_at || null,
    },
  ]), [diagnostic, recommendation, approval, execution, outcome]);

  // No anomaly selected — common case if the user lands on the RCA tab
  // without clicking through from the ML Detector list.
  if (!anomaly) {
    return (
      <div className="min-h-full bg-[#f5f7fb] -mx-6 -mt-2 -mb-6">
        <TopHeader anomaly={null} onBack={onBack} />
        <div className="px-6 py-12 flex flex-col items-center text-center text-slate-500">
          <Search className="w-10 h-10 text-slate-300 mb-3" />
          <div className="text-[14px] font-semibold text-slate-700">No anomaly selected</div>
          <div className="mt-1 text-[12px]">
            Open an anomaly from the ML Detector list to view its RCA.
          </div>
          <button
            onClick={onBack}
            className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-[12px] text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to ML Detector
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#f5f7fb] -mx-6 -mt-2 -mb-6">
      <TopHeader anomaly={anomaly} onBack={onBack} onRerun={onRerun} rerunning={rerunning} />
      <div className="px-6 py-4 space-y-4">
        <AnomalyHeader anomaly={anomaly} diagnostic={diagnostic} />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-3 space-y-4">
            <EvidenceTimeline diagnostic={diagnostic} loading={loadingDiag} />
            <AffectedKpis anomaly={anomaly} />
          </div>
          <div className="col-span-6 space-y-4">
            <KpiChart anomaly={anomaly} />
            <MlJalon phases={phases} />
            <AnalysisAndRca diagnostic={diagnostic} />
          </div>
          <div className="col-span-3 space-y-4">
            <Recommendations recommendation={recommendation} approval={approval} />
            <ExecutionPanel execution={execution} outcome={outcome} />
            <Actions />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SentinelRCA;
