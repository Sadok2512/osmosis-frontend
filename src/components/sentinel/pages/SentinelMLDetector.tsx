// ML Detector tab inside Sentinel — wraps ml-engine (port 11002).
// MVP per the architecture roundtable (2026-05-10): list profiles + Run Now,
// paginated anomalies viewer with profile/severity/date filters. CRUD is
// out of scope for v1 — added later if usage warrants.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Brain, Play, RefreshCw, AlertTriangle, AlertCircle,
  Loader2, Calendar, Filter, Search, X, Lightbulb, ArrowRight, MapPin,
  Shield, ShieldCheck, ShieldAlert, ThumbsUp, ThumbsDown,
  Terminal, CheckCircle2, XCircle, Copy, TrendingUp, TrendingDown, Award,
} from 'lucide-react';
import {
  listProfiles, listAnomalies, runProfileNow,
  getDiagnostic, streamDiagnose,
  getRecommendation, streamRecommend, listRecommendations,
  getApproval, streamAssess, approveRecommendation, rejectRecommendation,
  getExecutionByRec, streamExecute, markExecuted, markFailed,
  getOutcomeForExecution, assessOutcome,
  MlProfile, MlAnomaly, Recommendation, RiskApproval, ExecutionRow, OutcomeRow,
} from '../mlDetectorApi';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  warning:  'bg-amber-50 text-amber-700 border-amber-200',
  info:     'bg-slate-50 text-slate-600 border-slate-200',
};

const fmtNum = (v: number | null | undefined): string =>
  v == null ? '—' : (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));

/** Infer the KPI family for the classification chip in the drawer header.
 * Pure client-side heuristic on the kpi_code substring — keeps the UI
 * informative without a backend round-trip to kpi.kpi_definition.famille.
 * If the family ever becomes load-bearing (eg. routes recommendations to
 * a specific OPTIMUS runbook) we'll move this to the agentic-engine. */
const kpiFamily = (code: string | undefined | null): { label: string; color: string } => {
  const c = (code || '').toLowerCase();
  if (!c) return { label: '—', color: 'bg-slate-100 text-slate-600' };
  if (/_cssr|_setup|accessib/.test(c))            return { label: 'Accessibility', color: 'bg-blue-100 text-blue-700' };
  if (/_dcr|_drop|_retain|_release/.test(c))       return { label: 'Retainability', color: 'bg-red-100 text-red-700' };
  if (/_thp|_throughput|_thrput|_speed/.test(c))   return { label: 'Throughput',    color: 'bg-emerald-100 text-emerald-700' };
  if (/_ho_|_handover|mobility/.test(c))           return { label: 'Mobility',      color: 'bg-amber-100 text-amber-700' };
  if (/_traffic|_volume|_load|_prb/.test(c))       return { label: 'Traffic',       color: 'bg-violet-100 text-violet-700' };
  if (/_avail|availability/.test(c))               return { label: 'Availability',  color: 'bg-cyan-100 text-cyan-700' };
  return { label: 'Other', color: 'bg-slate-100 text-slate-600' };
};

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return iso; }
};


const SentinelMLDetector: React.FC = () => {
  const [profiles, setProfiles] = useState<MlProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [runFeedback, setRunFeedback] = useState<string | null>(null);

  const [anomalies, setAnomalies] = useState<MlAnomaly[]>([]);
  const [anomaliesTotal, setAnomaliesTotal] = useState(0);
  const [anomaliesLoading, setAnomaliesLoading] = useState(false);
  const [anomaliesError, setAnomaliesError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [mapOpen, setMapOpen] = useState(false);

  // RCA drawer state. `rcaOpen` carries the anomaly we're investigating;
  // text accumulates from the SSE stream. `rcaLoading` true while RCAI
  // is grinding through its tool calls (typically 60-120s).
  const [rcaOpen, setRcaOpen] = useState<MlAnomaly | null>(null);
  const [rcaText, setRcaText] = useState<string>('');
  const [rcaLoading, setRcaLoading] = useState(false);
  const [rcaCached, setRcaCached] = useState(false);
  const [rcaError, setRcaError] = useState<string | null>(null);
  // Diagnostic id we got from server — needed to trigger recommendation.
  // We pick it from a cached GET (the only way to get the row id here).
  const [rcaDiagnosticId, setRcaDiagnosticId] = useState<number | null>(null);

  // OPTIMUS recommendation state (Phase 2).
  const [recText, setRecText] = useState<string>('');
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [recPersisted, setRecPersisted] = useState<Recommendation | null>(null);

  // Global recommendations panel (bottom of the right column).
  const [recList, setRecList] = useState<Recommendation[]>([]);
  const [recListLoading, setRecListLoading] = useState(false);

  // Phase 3 — AEGIS risk + approval.
  const [riskText, setRiskText] = useState<string>('');
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [approval, setApproval] = useState<RiskApproval | null>(null);
  const [decisionInFlight, setDecisionInFlight] = useState<'approve' | 'reject' | null>(null);
  // Stub admin id for the demo. Replaces with real session user id in v1.5.
  const _approverId = 1;

  // Phase 4 — EXA execution plan (no real push, manual ack only).
  const [execText, setExecText] = useState<string>('');
  const [execLoading, setExecLoading] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [executionRow, setExecutionRow] = useState<ExecutionRow | null>(null);
  const [execActionInFlight, setExecActionInFlight] = useState<'executed' | 'failed' | null>(null);

  // Phase 5 — ECHO outcome (forecast vs actual KPI delta).
  const [outcome, setOutcome] = useState<OutcomeRow | null>(null);
  const [outcomeLoading, setOutcomeLoading] = useState(false);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);
  const [outcomeWindow, setOutcomeWindow] = useState(7);

  // Stepper navigation across the 5 agentic phases. Default 'rca' when a
  // new anomaly opens; advances are gated by upstream phase availability.
  type Step = 'rca' | 'reco' | 'risk' | 'exec' | 'outcome';
  const [activeStep, setActiveStep] = useState<Step>('rca');
  useEffect(() => { setActiveStep('rca'); }, [rcaOpen?.id]);

  const limit = 50;

  // Profiles — load once on mount, refresh on demand.
  const loadProfiles = async () => {
    setProfilesLoading(true);
    setProfilesError(null);
    try {
      const r = await listProfiles();
      setProfiles(r.profiles);
      if (r.profiles.length && selectedProfile === null) {
        setSelectedProfile(r.profiles[0].id);
      }
    } catch (e) {
      setProfilesError(e instanceof Error ? e.message : String(e));
    } finally {
      setProfilesLoading(false);
    }
  };

  useEffect(() => { loadProfiles(); }, []);

  // Anomalies — re-fetch when filters change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAnomaliesLoading(true);
      setAnomaliesError(null);
      try {
        const r = await listAnomalies({
          profile_id: selectedProfile ?? undefined,
          severity:   severity || undefined,
          date_from:  dateFrom || undefined,
          date_to:    dateTo   || undefined,
          page,
          limit,
        });
        if (cancelled) return;
        setAnomalies(r.items);
        setAnomaliesTotal(r.total);
      } catch (e) {
        if (!cancelled) setAnomaliesError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setAnomaliesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedProfile, severity, dateFrom, dateTo, page]);

  const handleRunNow = async (id: number) => {
    setRunningId(id);
    setRunFeedback(null);
    try {
      const r = await runProfileNow(id);
      setRunFeedback(`Profil #${id} : run en file (task ${r.task_id.slice(0, 8)}…). Les anomalies apparaîtront dès la fin du calcul.`);
    } catch (e) {
      setRunFeedback(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunningId(null);
    }
  };

  // Open the RCA drawer: hit GET first (cached?), else stream POST.
  const openRca = useCallback(async (anomaly: MlAnomaly, force = false) => {
    setRcaOpen(anomaly);
    setRcaText(''); setRcaCached(false); setRcaError(null);
    setRcaDiagnosticId(null);
    setRecText(''); setRecError(null); setRecPersisted(null);
    if (!force) {
      try {
        const cached = await getDiagnostic(anomaly.id);
        if (cached?.summary) {
          setRcaText(cached.summary);
          setRcaCached(true);
          setRcaDiagnosticId(cached.id);
          // Also fetch any existing recommendation produced from this diag.
          try {
            const r = await getRecommendation(cached.id);
            if (r) setRecPersisted(r);
          } catch { /* ignore */ }
          return;
        }
      } catch {
        // ignore — we'll fall through to a live run
      }
    }
    setRcaLoading(true);
    try {
      for await (const chunk of streamDiagnose(anomaly.id, { force })) {
        setRcaText((prev) => prev + chunk);
      }
      // Once the stream finishes we re-GET to pick up the diagnostic id.
      try {
        const newly = await getDiagnostic(anomaly.id);
        if (newly?.id) setRcaDiagnosticId(newly.id);
      } catch { /* ignore */ }
    } catch (e) {
      setRcaError(e instanceof Error ? e.message : String(e));
    } finally {
      setRcaLoading(false);
    }
  }, []);

  // Trigger OPTIMUS recommendation for the diagnostic currently in the drawer.
  const runRecommendation = useCallback(async () => {
    if (!rcaDiagnosticId) return;
    setRecText('');
    setRecError(null);
    setRecPersisted(null);
    setRecLoading(true);
    try {
      for await (const chunk of streamRecommend(rcaDiagnosticId)) {
        setRecText((prev) => prev + chunk);
      }
      // Pick up the persisted row (if OPTIMUS judged it actionable).
      try {
        const r = await getRecommendation(rcaDiagnosticId);
        if (r) setRecPersisted(r);
      } catch { /* ignore */ }
      // Refresh the global list.
      void loadRecList();
    } catch (e) {
      setRecError(e instanceof Error ? e.message : String(e));
    } finally {
      setRecLoading(false);
    }
  }, [rcaDiagnosticId]);

  const loadRecList = useCallback(async () => {
    setRecListLoading(true);
    try {
      const r = await listRecommendations();
      setRecList(r.recommendations);
    } catch {
      setRecList([]);
    } finally {
      setRecListLoading(false);
    }
  }, []);

  useEffect(() => { loadRecList(); }, [loadRecList]);

  // Fetch latest approval for the currently-displayed recommendation.
  useEffect(() => {
    if (!recPersisted) { setApproval(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const a = await getApproval(recPersisted.id);
        if (!cancelled) setApproval(a);
      } catch {
        if (!cancelled) setApproval(null);
      }
    })();
    return () => { cancelled = true; };
  }, [recPersisted]);

  const runAssess = useCallback(async () => {
    if (!recPersisted) return;
    setRiskText(''); setRiskError(null); setRiskLoading(true);
    try {
      for await (const chunk of streamAssess(recPersisted.id)) {
        setRiskText((p) => p + chunk);
      }
      const a = await getApproval(recPersisted.id);
      if (a) setApproval(a);
    } catch (e) {
      setRiskError(e instanceof Error ? e.message : String(e));
    } finally {
      setRiskLoading(false);
    }
  }, [recPersisted]);

  const handleApprove = useCallback(async () => {
    if (!recPersisted) return;
    setDecisionInFlight('approve');
    try {
      await approveRecommendation(recPersisted.id, _approverId);
      const a = await getApproval(recPersisted.id);
      if (a) setApproval(a);
    } catch (e) {
      setRiskError(e instanceof Error ? e.message : String(e));
    } finally {
      setDecisionInFlight(null);
    }
  }, [recPersisted]);

  // Fetch latest execution row for the current recommendation.
  useEffect(() => {
    if (!recPersisted) { setExecutionRow(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const e = await getExecutionByRec(recPersisted.id);
        if (!cancelled) setExecutionRow(e);
      } catch {
        if (!cancelled) setExecutionRow(null);
      }
    })();
    return () => { cancelled = true; };
  }, [recPersisted, approval]);

  const runExecute = useCallback(async () => {
    if (!recPersisted) return;
    setExecText(''); setExecError(null); setExecLoading(true);
    try {
      for await (const chunk of streamExecute(recPersisted.id)) {
        setExecText((p) => p + chunk);
      }
      const e = await getExecutionByRec(recPersisted.id);
      if (e) setExecutionRow(e);
    } catch (e) {
      setExecError(e instanceof Error ? e.message : String(e));
    } finally {
      setExecLoading(false);
    }
  }, [recPersisted]);

  const handleMarkExecuted = useCallback(async () => {
    if (!executionRow) return;
    const notes = window.prompt('Notes (optional)', '') || '';
    setExecActionInFlight('executed');
    try {
      await markExecuted(executionRow.id, notes);
      const e = await getExecutionByRec(executionRow.recommendation_id);
      if (e) setExecutionRow(e);
    } catch (e) {
      setExecError(e instanceof Error ? e.message : String(e));
    } finally {
      setExecActionInFlight(null);
    }
  }, [executionRow]);

  const handleMarkFailed = useCallback(async () => {
    if (!executionRow) return;
    const reason = window.prompt('Failure reason?', '') || '';
    if (!reason.trim()) return;
    setExecActionInFlight('failed');
    try {
      await markFailed(executionRow.id, reason);
      const e = await getExecutionByRec(executionRow.recommendation_id);
      if (e) setExecutionRow(e);
    } catch (e) {
      setExecError(e instanceof Error ? e.message : String(e));
    } finally {
      setExecActionInFlight(null);
    }
  }, [executionRow]);

  // Fetch outcome for the current execution.
  useEffect(() => {
    if (!executionRow) { setOutcome(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const o = await getOutcomeForExecution(executionRow.id);
        if (!cancelled) setOutcome(o);
      } catch {
        if (!cancelled) setOutcome(null);
      }
    })();
    return () => { cancelled = true; };
  }, [executionRow]);

  const runAssessOutcome = useCallback(async () => {
    if (!executionRow) return;
    setOutcome(null);
    setOutcomeError(null);
    setOutcomeLoading(true);
    try {
      const o = await assessOutcome(executionRow.id, outcomeWindow);
      setOutcome(o);
    } catch (e) {
      setOutcomeError(e instanceof Error ? e.message : String(e));
    } finally {
      setOutcomeLoading(false);
    }
  }, [executionRow, outcomeWindow]);

  const handleReject = useCallback(async () => {
    if (!recPersisted) return;
    const reason = window.prompt('Reason for rejection?', '') || '';
    if (!reason.trim()) return;
    setDecisionInFlight('reject');
    try {
      await rejectRecommendation(recPersisted.id, _approverId, reason);
      const a = await getApproval(recPersisted.id);
      if (a) setApproval(a);
    } catch (e) {
      setRiskError(e instanceof Error ? e.message : String(e));
    } finally {
      setDecisionInFlight(null);
    }
  }, [recPersisted]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(anomaliesTotal / limit)), [anomaliesTotal]);
  const selected = profiles.find((p) => p.id === selectedProfile) || null;

  return (
    <div
      className="flex h-full gap-4 text-slate-900"
      style={{ fontFamily: 'Inter, system-ui, sans-serif', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' }}
    >
      {/* ─── LEFT: profiles ─────────────────────────────────── */}
      <aside className="w-[320px] shrink-0 flex flex-col bg-white rounded-xl border border-slate-200/70 shadow-sm overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200/70">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-teal-50 text-teal-700 ring-1 ring-teal-100">
              <Brain className="w-3.5 h-3.5" />
            </span>
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-slate-700">Profils ML</h3>
            <span className="text-[11px] font-medium text-slate-400">({profiles.length})</span>
          </div>
          <button
            type="button"
            onClick={loadProfiles}
            className="p-1.5 rounded-md hover:bg-slate-50 text-slate-500 transition"
            title="Recharger"
          >
            <RefreshCw className={'w-3.5 h-3.5 ' + (profilesLoading ? 'animate-spin' : '')} />
          </button>
        </header>

        {profilesError && (
          <div className="p-3 text-xs text-red-600 bg-red-50 border-b border-red-200">
            {profilesError}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {profilesLoading && profiles.length === 0 ? (
            <div className="flex items-center justify-center p-6 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : profiles.length === 0 ? (
            <div className="p-4 text-xs text-slate-500">
              Aucun profil ML. Créer un profil via l'API <code>POST /ml-api/profiles</code>.
            </div>
          ) : profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setSelectedProfile(p.id); setPage(1); }}
              className={
                'w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50/70 transition ' +
                (selectedProfile === p.id ? 'bg-teal-50/60 border-l-2 border-l-teal-500' : '')
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium text-slate-900 truncate">{p.name}</div>
                  <div className="text-[12px] text-slate-500 mt-0.5">
                    {p.kpi_count} KPIs · {p.dimension_count} dims · {p.run_time}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Last run: {fmtDate(p.last_run_at)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={
                    'text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-[0.08em] ' +
                    (p.is_active
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                      : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200')
                  }>
                    {p.is_active ? 'actif' : 'pause'}
                  </span>
                </div>
              </div>
              {selectedProfile === p.id && (
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRunNow(p.id); }}
                    disabled={runningId === p.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-white rounded-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 shadow-sm transition disabled:opacity-50"
                  >
                    {runningId === p.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Play className="w-3 h-3" />}
                    Run now
                  </button>
                </div>
              )}
            </button>
          ))}
        </div>

        {runFeedback && (
          <div className="p-2 text-[11px] text-slate-700 bg-amber-50 border-t border-amber-200">
            {runFeedback}
          </div>
        )}
      </aside>

      {/* ─── RIGHT: anomalies viewer ─────────────────────────── */}
      <section className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200/70 shadow-sm overflow-hidden">
        <header className="px-4 py-3 border-b border-slate-200/70">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                Anomalies {selected ? `· ${selected.name}` : ''}
              </h3>
              <p className="text-[12px] text-slate-500 mt-0.5">
                {anomaliesTotal.toLocaleString('fr-FR')} anomalies · z-score &gt; {selected?.z_threshold ?? '?'} OU trend% &gt; {selected?.trend_threshold ?? '?'}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setMapOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium border border-slate-200 rounded-md bg-white text-slate-700 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 transition"
                title="View anomaly locations on map"
              >
                <MapPin className="w-3.5 h-3.5" /> Map
              </button>
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={severity}
                onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
                className="border border-slate-200 rounded-md px-2 py-1.5 text-[12px] bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-400 transition"
              >
                <option value="">Toutes sévérités</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="border border-slate-200 rounded-md px-2 py-1.5 text-[12px] bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-400 transition"
              />
              <span className="text-slate-400">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="border border-slate-200 rounded-md px-2 py-1.5 text-[12px] bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-400 transition"
              />
            </div>
          </div>
        </header>

        {anomaliesError && (
          <div className="p-3 text-xs text-red-600 bg-red-50 border-b border-red-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {anomaliesError}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {anomaliesLoading ? (
            <div className="flex items-center justify-center p-12 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : anomalies.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              Aucune anomalie pour ce filtre.
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50/70 sticky top-0 z-10">
                <tr className="text-left text-[11px] font-medium text-slate-500 uppercase tracking-[0.08em]">
                  <th className="px-3 py-2.5">Sévérité</th>
                  <th className="px-3 py-2.5">Période</th>
                  <th className="px-3 py-2.5">Cellule</th>
                  <th className="px-3 py-2.5">KPI</th>
                  <th className="px-3 py-2.5 text-right">Valeur</th>
                  <th className="px-3 py-2.5 text-right">Z-score</th>
                  <th className="px-3 py-2.5 text-right">Δ7d</th>
                  <th className="px-3 py-2.5 text-right">Δ14d</th>
                  <th className="px-3 py-2.5 text-right">Trend %</th>
                  <th className="px-3 py-2.5 text-right w-10">RCA</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50/60 transition">
                    <td className="px-3 py-2">
                      <span className={'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full uppercase tracking-[0.06em] border ' + (SEVERITY_STYLES[a.severity] || SEVERITY_STYLES.info)}>
                        {a.severity === 'critical' && <AlertTriangle className="w-3 h-3" />}
                        {a.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 tabular-nums">{fmtDate(a.period_start)}</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-slate-800">{a.cell_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-700 truncate max-w-[200px]" title={a.kpi_code}>{a.kpi_code}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">{fmtNum(a.value)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(a.z_score)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(a.delta_7)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(a.delta_14)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(a.trend_pct)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        title="Lancer / consulter la RCA (RCAI)"
                        onClick={() => openRca(a)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-teal-50 text-teal-700 transition"
                      >
                        <Search className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <footer className="flex items-center justify-between p-2 border-t border-slate-200 text-xs text-slate-600">
            <span>Page {page} / {totalPages}</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2 py-1 border border-slate-200 rounded disabled:opacity-40 hover:bg-slate-50"
              >‹ Préc.</button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2 py-1 border border-slate-200 rounded disabled:opacity-40 hover:bg-slate-50"
              >Suiv. ›</button>
            </div>
          </footer>
        )}
      </section>

      {/* ─── RCA Drawer (right-side overlay) ─────────────────────────── */}
      {rcaOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-slate-900/30"
            onClick={() => setRcaOpen(null)}
          />
          <aside className="relative w-[720px] max-w-[92vw] h-full bg-white shadow-2xl flex flex-col">
            <header className="p-4 border-b border-slate-200">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Brain className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-semibold text-slate-800">Analysis · Anomaly #{rcaOpen.id}</h3>
                    {(() => {
                      const fam = kpiFamily(rcaOpen.kpi_code);
                      return (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${fam.color}`} title="KPI family (classification)">
                          {fam.label}
                        </span>
                      );
                    })()}
                    <span className={
                      'text-[10px] px-1.5 py-0.5 rounded ' +
                      (rcaOpen.severity === 'critical' ? 'bg-red-100 text-red-700' :
                       rcaOpen.severity === 'warning'  ? 'bg-amber-100 text-amber-700' :
                                                         'bg-slate-100 text-slate-600')
                    }>{rcaOpen.severity}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 font-mono break-all">
                    {rcaOpen.cell_name} · {rcaOpen.kpi_code} · {fmtDate(rcaOpen.period_start)}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    value=<b>{fmtNum(rcaOpen.value)}</b> z=<b>{fmtNum(rcaOpen.z_score)}</b> trend=<b>{fmtNum(rcaOpen.trend_pct)}%</b>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRcaOpen(null)}
                  className="p-1 rounded hover:bg-slate-100 text-slate-500 shrink-0"
                  title="Fermer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Stepper — horizontal navigation across the 5 agentic phases.
                  Steps are gated by upstream availability so the operator
                  can't jump to Validation before a Recommendation exists.
                  Static Tailwind classes (no dynamic interpolation) so
                  the JIT picks everything up at build time. */}
              <nav className="mt-3 flex items-center gap-1 text-[10px]">
                {([
                  { id: 'rca',     label: 'RCA',            icon: <Brain     className="w-3 h-3" />, active: 'bg-indigo-600 text-white',  hover: 'hover:bg-indigo-100 hover:text-indigo-700',  enabled: true },
                  { id: 'reco',    label: 'Recommendation', icon: <Lightbulb className="w-3 h-3" />, active: 'bg-amber-600 text-white',   hover: 'hover:bg-amber-100 hover:text-amber-700',    enabled: !!rcaDiagnosticId },
                  { id: 'risk',    label: 'Validation',     icon: <Shield    className="w-3 h-3" />, active: 'bg-sky-600 text-white',     hover: 'hover:bg-sky-100 hover:text-sky-700',        enabled: !!recPersisted },
                  { id: 'exec',    label: 'Execution',      icon: <Terminal  className="w-3 h-3" />, active: 'bg-violet-600 text-white',  hover: 'hover:bg-violet-100 hover:text-violet-700',  enabled: approval?.decision === 'approved' },
                  { id: 'outcome', label: 'Outcome',        icon: <Award     className="w-3 h-3" />, active: 'bg-emerald-600 text-white', hover: 'hover:bg-emerald-100 hover:text-emerald-700', enabled: executionRow?.status === 'completed' },
                ] as { id: Step; label: string; icon: React.ReactNode; active: string; hover: string; enabled: boolean }[]).map((s, i) => {
                  const isActive = activeStep === s.id;
                  const base = 'flex items-center gap-1 px-2 py-1 rounded transition ';
                  const cls = isActive
                    ? s.active
                    : s.enabled
                      ? `bg-slate-100 text-slate-600 ${s.hover}`
                      : 'bg-slate-50 text-slate-300 cursor-not-allowed';
                  return (
                    <React.Fragment key={s.id}>
                      <button
                        type="button"
                        disabled={!s.enabled}
                        onClick={() => setActiveStep(s.id)}
                        className={base + cls}
                        title={s.enabled ? s.label : `${s.label} — non disponible (étape précédente à compléter)`}
                      >
                        {s.icon}
                        <span className="font-medium">{s.label}</span>
                      </button>
                      {i < 4 && <span className="text-slate-300">›</span>}
                    </React.Fragment>
                  );
                })}
              </nav>
            </header>

            <div className="flex-1 overflow-auto">
              {/* ─── RCA panel ─── */}
              {activeStep === 'rca' && (
                <div className="p-4">
                  {/* Auto-trigger RCA if nothing is cached and the user lands on this step. */}
                  {!rcaText && !rcaLoading && (
                    <button
                      type="button"
                      onClick={() => openRca(rcaOpen, true)}
                      className="mb-3 px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 inline-flex items-center gap-1"
                    >
                      <Brain className="w-3 h-3" /> Lancer RCA
                    </button>
                  )}
                  {rcaCached && (
                    <div className="mb-2 text-[10px] text-slate-500">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 mr-1">cached</span>
                      résultat de la dernière exécution RCAI.
                    </div>
                  )}
                  {rcaError && (
                    <div className="mb-3 p-2 rounded bg-red-50 text-red-700 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> {rcaError}
                    </div>
                  )}
                  {!rcaText && rcaLoading && (
                    <div className="flex items-center gap-2 text-slate-500 text-sm py-12 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      RCAI investigue (peut prendre 60-120s — appels CM/FM/KPI/peers)…
                    </div>
                  )}
                  {rcaText && (
                    <pre className="text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">{rcaText}</pre>
                  )}
                  {rcaLoading && rcaText && (
                    <div className="mt-3 inline-flex items-center gap-1 text-[10px] text-slate-400">
                      <Loader2 className="w-3 h-3 animate-spin" /> RCAI continue à streamer…
                    </div>
                  )}
                </div>
              )}

            {/* ─── OPTIMUS recommendation section (Phase 2) ─── */}
            {activeStep === 'reco' && rcaDiagnosticId && (
              <div className="border-t border-slate-200 p-4 bg-amber-50/40">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-600" />
                    <h4 className="text-sm font-semibold text-slate-800">Recommandation (OPTIMUS)</h4>
                    {recPersisted && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">draft #{recPersisted.id}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={recLoading}
                    onClick={runRecommendation}
                    className="px-2 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-40 inline-flex items-center gap-1"
                  >
                    {recLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lightbulb className="w-3 h-3" />}
                    {recPersisted ? 'Re-générer' : 'Générer recommandation'}
                  </button>
                </div>

                {recError && (
                  <div className="mb-2 p-2 rounded bg-red-50 text-red-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> {recError}
                  </div>
                )}

                {recPersisted && (
                  <div className="mb-2 p-3 rounded border border-amber-200 bg-white text-xs">
                    <div className="flex items-center gap-2 font-mono text-slate-700 mb-1">
                      <span className="text-slate-500">{recPersisted.param_path}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-800 font-semibold">
                      <span>{recPersisted.current_value ?? '—'}</span>
                      <ArrowRight className="w-3 h-3 text-amber-600" />
                      <span className="text-amber-700">{recPersisted.proposed_value ?? '—'}</span>
                      {recPersisted.forecast_kpi_delta !== null && (
                        <span className="ml-auto text-[10px] text-slate-500">
                          forecast Δ{rcaOpen.kpi_code} = {recPersisted.forecast_kpi_delta >= 0 ? '+' : ''}{recPersisted.forecast_kpi_delta.toFixed(2)}
                        </span>
                      )}
                    </div>
                    {recPersisted.rationale && (
                      <p className="mt-1 text-[11px] text-slate-600">{recPersisted.rationale}</p>
                    )}
                  </div>
                )}

                {recText && (
                  <pre className="text-[11px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-auto">{recText}</pre>
                )}
                {recLoading && !recText && (
                  <div className="text-[11px] text-slate-500 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> OPTIMUS analyse les paramètres…
                  </div>
                )}
              </div>
            )}

            {/* ─── AEGIS risk + approval (Phase 3) ─── */}
            {activeStep === 'risk' && recPersisted && (
              <div className="border-t border-slate-200 p-4 bg-sky-50/40">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-sky-600" />
                    <h4 className="text-sm font-semibold text-slate-800">Risk &amp; Approval (AEGIS)</h4>
                    {approval && (
                      <span className={
                        'text-[10px] px-1.5 py-0.5 rounded ' +
                        (approval.decision === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                         approval.decision === 'rejected' ? 'bg-red-100 text-red-700' :
                         'bg-amber-100 text-amber-700')
                      }>
                        {approval.decision ?? 'pending'} · risk={(approval.risk_score ?? 0).toFixed(2)}
                      </span>
                    )}
                  </div>
                  {!approval && (
                    <button
                      type="button"
                      disabled={riskLoading}
                      onClick={runAssess}
                      className="px-2 py-1 text-xs bg-sky-600 text-white rounded hover:bg-sky-700 disabled:opacity-40 inline-flex items-center gap-1"
                    >
                      {riskLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
                      Assess risk
                    </button>
                  )}
                </div>

                {riskError && (
                  <div className="mb-2 p-2 rounded bg-red-50 text-red-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> {riskError}
                  </div>
                )}

                {approval && (
                  <div className="mb-2 p-3 rounded border border-sky-200 bg-white text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[10px] uppercase tracking-wider">
                        Risk factors (0=safe → 1=risky)
                      </span>
                      <span className="text-slate-500 text-[10px]">
                        blast_radius={approval.blast_radius ?? '?'}
                      </span>
                    </div>
                    {approval.risk_factors && (
                      <div className="grid grid-cols-2 gap-1 text-[11px]">
                        {Object.entries(approval.risk_factors).map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between">
                            <span className="text-slate-600">{k}</span>
                            <span className={
                              'font-mono tabular-nums ' +
                              ((v ?? 0) > 0.5 ? 'text-red-600' : (v ?? 0) > 0.3 ? 'text-amber-600' : 'text-emerald-600')
                            }>{Number(v ?? 0).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {approval.rejection_reason && (
                      <p className="text-[11px] text-red-600 italic">↯ {approval.rejection_reason}</p>
                    )}

                    {approval.decision === 'pending' && (
                      <div className="flex gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          disabled={decisionInFlight !== null}
                          onClick={handleApprove}
                          className="flex-1 px-2 py-1.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center justify-center gap-1"
                        >
                          {decisionInFlight === 'approve' ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={decisionInFlight !== null}
                          onClick={handleReject}
                          className="flex-1 px-2 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-40 inline-flex items-center justify-center gap-1"
                        >
                          {decisionInFlight === 'reject' ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsDown className="w-3 h-3" />}
                          Reject
                        </button>
                      </div>
                    )}

                    {approval.decision === 'approved' && (
                      <div className="flex items-center gap-2 text-emerald-700 text-[11px] pt-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Approved{approval.auto_decision === 'auto_approve' ? ' (auto, risk < 0.30)' : ''}.
                        Ready for Phase 4 — EXA execution.
                      </div>
                    )}
                    {approval.decision === 'rejected' && (
                      <div className="flex items-center gap-2 text-red-700 text-[11px] pt-1">
                        <ShieldAlert className="w-3.5 h-3.5" /> Rejected.
                      </div>
                    )}
                  </div>
                )}

                {riskText && !approval && (
                  <pre className="text-[11px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-auto">{riskText}</pre>
                )}
                {riskLoading && !riskText && (
                  <div className="text-[11px] text-slate-500 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> AEGIS analyse les facteurs de risque…
                  </div>
                )}
              </div>
            )}

            {/* ─── EXA execution plan (Phase 4 SKELETON — propose-only) ─── */}
            {activeStep === 'exec' && approval?.decision === 'approved' && (
              <div className="border-t border-slate-200 p-4 bg-violet-50/40">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-violet-600" />
                    <h4 className="text-sm font-semibold text-slate-800">Execution plan (EXA)</h4>
                    {executionRow && (
                      <span className={
                        'text-[10px] px-1.5 py-0.5 rounded ' +
                        (executionRow.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                         executionRow.status === 'failed'    ? 'bg-red-100 text-red-700' :
                                                                'bg-violet-100 text-violet-700')
                      }>
                        {executionRow.status}
                      </span>
                    )}
                  </div>
                  {!executionRow && (
                    <button
                      type="button"
                      disabled={execLoading}
                      onClick={runExecute}
                      className="px-2 py-1 text-xs bg-violet-600 text-white rounded hover:bg-violet-700 disabled:opacity-40 inline-flex items-center gap-1"
                    >
                      {execLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Terminal className="w-3 h-3" />}
                      Generate plan
                    </button>
                  )}
                </div>

                {execError && (
                  <div className="mb-2 p-2 rounded bg-red-50 text-red-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> {execError}
                  </div>
                )}

                {executionRow?.plan && (
                  <div className="mb-2 p-3 rounded border border-violet-200 bg-white text-xs space-y-2">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                      <div><span className="text-slate-500">Vendor:</span> <b>{String(executionRow.plan.vendor ?? '?')}</b></div>
                      <div><span className="text-slate-500">OSS:</span> <b>{String(executionRow.plan.oss_target ?? '?')}</b></div>
                      <div><span className="text-slate-500">Change:</span> <b>{String(executionRow.plan.change_type ?? '?')}</b></div>
                      <div><span className="text-slate-500">Canary:</span> <code className="font-mono">{String(executionRow.plan.canary_cell ?? '?')}</code></div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Payload (à pousser à la main)</span>
                        <button
                          type="button"
                          title="Copier"
                          onClick={() => navigator.clipboard.writeText(String(executionRow.plan?.payload ?? ''))}
                          className="p-0.5 rounded hover:bg-slate-100 text-slate-500"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <pre className="text-[11px] font-mono bg-slate-900 text-emerald-300 p-2 rounded overflow-auto max-h-28">{String(executionRow.plan.payload ?? '')}</pre>
                    </div>
                    {executionRow.plan.rollback_payload && (
                      <details className="text-[11px]">
                        <summary className="cursor-pointer text-slate-500">↺ rollback_payload</summary>
                        <pre className="mt-1 font-mono bg-slate-100 p-2 rounded overflow-auto max-h-20">{String(executionRow.plan.rollback_payload)}</pre>
                      </details>
                    )}
                    {executionRow.plan.notes && (
                      <p className="text-[11px] text-slate-600 italic">⚠ {String(executionRow.plan.notes)}</p>
                    )}

                    {executionRow.status === 'plan_ready' && (
                      <div className="flex gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          disabled={execActionInFlight !== null}
                          onClick={handleMarkExecuted}
                          className="flex-1 px-2 py-1.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center justify-center gap-1"
                        >
                          {execActionInFlight === 'executed' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                          Mark as executed
                        </button>
                        <button
                          type="button"
                          disabled={execActionInFlight !== null}
                          onClick={handleMarkFailed}
                          className="flex-1 px-2 py-1.5 text-xs bg-slate-700 text-white rounded hover:bg-slate-800 disabled:opacity-40 inline-flex items-center justify-center gap-1"
                        >
                          {execActionInFlight === 'failed' ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                          Mark as failed
                        </button>
                      </div>
                    )}
                    {executionRow.status === 'completed' && (
                      <div className="flex items-center gap-2 text-emerald-700 text-[11px] pt-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Push exécuté par l'opérateur. Phase 5 (ECHO) attend l'évaluation post-J+7.
                      </div>
                    )}
                    {executionRow.status === 'failed' && (
                      <div className="text-red-700 text-[11px] pt-1">
                        <span className="font-semibold">Échec :</span> {executionRow.error_log}
                      </div>
                    )}
                  </div>
                )}

                {execText && !executionRow?.plan && (
                  <pre className="text-[11px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-auto">{execText}</pre>
                )}
                {execLoading && !execText && (
                  <div className="text-[11px] text-slate-500 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> EXA construit le plan d'exécution…
                  </div>
                )}
              </div>
            )}

            {/* ─── ECHO outcome (Phase 5 — Learning) ─── */}
            {activeStep === 'outcome' && executionRow?.status === 'completed' && (
              <div className="border-t border-slate-200 p-4 bg-emerald-50/40">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-emerald-700" />
                    <h4 className="text-sm font-semibold text-slate-800">Outcome (ECHO)</h4>
                    {outcome && outcome.success !== null && (
                      <span className={
                        'text-[10px] px-1.5 py-0.5 rounded ' +
                        (outcome.success ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')
                      }>
                        {outcome.success ? 'SUCCESS' : 'FAILED'}
                      </span>
                    )}
                    {outcome && outcome.success === null && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                        insufficient data
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] text-slate-500">window:</label>
                    <select
                      value={outcomeWindow}
                      onChange={(e) => setOutcomeWindow(Number(e.target.value))}
                      className="text-[11px] border border-slate-200 rounded px-1 py-0.5"
                    >
                      <option value={1}>1d</option>
                      <option value={3}>3d</option>
                      <option value={7}>7d</option>
                      <option value={14}>14d</option>
                    </select>
                    <button
                      type="button"
                      disabled={outcomeLoading}
                      onClick={runAssessOutcome}
                      className="px-2 py-1 text-xs bg-emerald-700 text-white rounded hover:bg-emerald-800 disabled:opacity-40 inline-flex items-center gap-1"
                    >
                      {outcomeLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Award className="w-3 h-3" />}
                      {outcome ? 'Re-assess' : 'Assess outcome'}
                    </button>
                  </div>
                </div>

                {outcomeError && (
                  <div className="mb-2 p-2 rounded bg-red-50 text-red-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> {outcomeError}
                  </div>
                )}

                {outcome && (
                  <div className="p-3 rounded border border-emerald-200 bg-white text-xs space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-center p-2 rounded border border-slate-200">
                        <div className="text-[9px] uppercase tracking-wider text-slate-500">Forecast Δ</div>
                        <div className={
                          'text-lg font-bold tabular-nums ' +
                          ((outcome.forecast_delta ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700')
                        }>
                          {outcome.forecast_delta !== null
                            ? (outcome.forecast_delta >= 0 ? '+' : '') + outcome.forecast_delta.toFixed(3)
                            : '—'}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          baseline: {outcome.baseline_avg?.toFixed(3) ?? '—'}
                        </div>
                      </div>
                      <div className="text-center p-2 rounded border border-slate-200">
                        <div className="text-[9px] uppercase tracking-wider text-slate-500">Actual Δ</div>
                        <div className={
                          'text-lg font-bold tabular-nums flex items-center justify-center gap-1 ' +
                          ((outcome.actual_delta ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700')
                        }>
                          {(outcome.actual_delta ?? 0) >= 0
                            ? <TrendingUp className="w-3.5 h-3.5" />
                            : <TrendingDown className="w-3.5 h-3.5" />}
                          {outcome.actual_delta !== null
                            ? (outcome.actual_delta >= 0 ? '+' : '') + outcome.actual_delta.toFixed(3)
                            : '—'}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          observed: {outcome.actual_avg?.toFixed(3) ?? '—'}
                        </div>
                      </div>
                    </div>

                    {outcome.notes && (
                      <p className="text-[11px] text-slate-600 font-mono leading-relaxed">{outcome.notes}</p>
                    )}

                    {outcome.success === true && (
                      <div className="flex items-center gap-2 text-emerald-700 text-[11px] pt-1 border-t border-slate-100">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Recommandation validée — pattern à propager.
                      </div>
                    )}
                    {outcome.success === false && (
                      <div className="flex items-center gap-2 text-red-700 text-[11px] pt-1 border-t border-slate-100">
                        <XCircle className="w-3.5 h-3.5" />
                        Recommandation ratée — abaisse la confidence du pattern OPTIMUS.
                      </div>
                    )}
                  </div>
                )}

                {outcomeLoading && (
                  <div className="text-[11px] text-slate-500 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> ECHO compare forecast vs réalité…
                  </div>
                )}
              </div>
            )}
            </div>{/* flex-1 overflow-auto */}

            <footer className="flex items-center justify-between p-3 border-t border-slate-200">
              <span className="text-[10px] text-slate-400">
                Persisté dans agentic.diagnostics — re-clic réutilise le cache.
              </span>
              <button
                type="button"
                disabled={rcaLoading}
                onClick={() => openRca(rcaOpen!, true)}
                className="px-2 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1"
              >
                <RefreshCw className={rcaLoading ? 'w-3 h-3 animate-spin' : 'w-3 h-3'} />
                Rejouer la RCA
              </button>
            </footer>
          </aside>
        </div>
      )}
      {mapOpen && (
        <AnomalyMapModal anomalies={anomalies} onClose={() => setMapOpen(false)} />
      )}
    </div>
  );
};

// ── Anomaly Map Modal ──────────────────────────────────────────────────
// Plots anomalies on a Leaflet map using REAL site coordinates from topo.
// We resolve cell_name → (lat, lng) via fetchTopoSites() (cached). Cells
// with unknown coordinates are listed as "unlocated".
import { fetchTopoSites } from '../../../services/topoService';

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};
const SEV_ORDER: Record<string, number> = { critical: 3, warning: 2, info: 1 };

const AnomalyMapModal: React.FC<{ anomalies: MlAnomaly[]; onClose: () => void }> = ({ anomalies, onClose }) => {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [coords, setCoords] = useState<Map<string, [number, number]> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Build cell_name → [lat,lng] lookup once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sites = await fetchTopoSites();
        if (cancelled) return;
        const map = new Map<string, [number, number]>();
        sites.forEach((s: any) => {
          const lat = Number(s.latitude);
          const lng = Number(s.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          (s.cells || []).forEach((c: any) => {
            const name = c?.nom_cellule || c?.cell_name;
            if (name) map.set(String(name), [lat, lng]);
          });
        });
        setCoords(map);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || 'Failed to load topology');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Render markers once both map element and coords lookup are ready.
  useEffect(() => {
    if (!mapEl.current || !coords) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

    const map = L.map(mapEl.current, { zoomControl: true, attributionControl: false }).setView([46.6, 2.5], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18, subdomains: 'abcd',
    }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 50);

    const grouped: Record<string, { lat: number; lng: number; sev: string; count: number; name: string }> = {};
    let unlocated = 0;
    anomalies.forEach(a => {
      const name = a.cell_name || '';
      const ll = name ? coords.get(name) : undefined;
      if (!ll) { unlocated += 1; return; }
      const key = name;
      if (!grouped[key]) grouped[key] = { lat: ll[0], lng: ll[1], sev: a.severity, count: 0, name };
      grouped[key].count += 1;
      if ((SEV_ORDER[a.severity] || 0) > (SEV_ORDER[grouped[key].sev] || 0)) grouped[key].sev = a.severity;
    });

    const bounds: L.LatLngTuple[] = [];
    Object.values(grouped).forEach(p => {
      const color = SEV_COLOR[p.sev] || SEV_COLOR.info;
      const radius = Math.min(20, 6 + Math.log2(p.count + 1) * 3);
      L.circleMarker([p.lat, p.lng], { radius, color, weight: 2, fillColor: color, fillOpacity: 0.6 })
        .bindTooltip(`<b>${p.name}</b><br/>${p.count} anomalie${p.count > 1 ? 's' : ''} · ${p.sev}`, { direction: 'top' })
        .addTo(map);
      bounds.push([p.lat, p.lng]);
    });
    if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });

    if (unlocated > 0) {
      const ctrl = new L.Control({ position: 'bottomleft' });
      ctrl.onAdd = () => {
        const div = L.DomUtil.create('div');
        div.innerHTML = `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:4px 8px;font-size:11px;color:#64748b;box-shadow:0 1px 2px rgba(0,0,0,.06)">${unlocated} anomalie${unlocated > 1 ? 's' : ''} sans coordonnées</div>`;
        return div;
      };
      ctrl.addTo(map);
    }

    return () => { map.remove(); mapRef.current = null; };
  }, [anomalies, coords]);

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-teal-600" />
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-slate-700">
              Anomaly Locations
            </h3>
            <span className="text-[12px] text-slate-500">· {anomalies.length} anomalies</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              {(['critical','warning','info'] as const).map(s => (
                <span key={s} className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: SEV_COLOR[s] }} />
                  {s}
                </span>
              ))}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500">
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>
        <div ref={mapEl} className="flex-1" />
      </div>
    </div>
  );
};

export default SentinelMLDetector;
