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
import { fetchTopoSites } from '../../../services/topoService';

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


const SentinelMLDetector: React.FC<{ onOpenRCA?: (anomaly: MlAnomaly) => void }> = ({ onOpenRCA }) => {
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
  const kpiAliases = useMemo(() => {
    const map = new Map<string, string>();
    anomalies.forEach((a) => {
      if (!map.has(a.kpi_code)) map.set(a.kpi_code, `KPI ${map.size + 1}`);
    });
    return map;
  }, [anomalies]);
  const occurrenceByKpi = useMemo(() => {
    const map = new Map<string, number>();
    anomalies.forEach((a) => map.set(a.kpi_code, (map.get(a.kpi_code) ?? 0) + 1));
    return map;
  }, [anomalies]);
  const trendBars = (a: MlAnomaly): number[] => {
    const vals = [a.delta_14 ?? 0, a.delta_7 ?? 0, a.trend_pct ?? 0, a.z_score ?? 0].map((v) => Math.min(1, Math.abs(v) / 100));
    return vals.map((v) => Math.max(18, Math.round(18 + v * 34)));
  };

  return (
    <div
      className="flex h-full gap-5 overflow-hidden rounded-xl bg-[#F5F7FA] p-5 text-slate-900"
      style={{ fontFamily: 'Inter, system-ui, sans-serif', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' }}
    >
      {/* ─── LEFT: profiles ─────────────────────────────────── */}
      <aside className="flex w-[320px] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-200/70 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
              <Brain className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-[12px] font-black uppercase tracking-[0.14em] text-slate-700">Profils ML</h3>
              <span className="text-[11px] font-medium text-slate-400">({profiles.length})</span>
            </div>
          </div>
          <button
            type="button"
            onClick={loadProfiles}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
            title="Recharger"
          >
            <RefreshCw className={'h-3.5 w-3.5 ' + (profilesLoading ? 'animate-spin' : '')} />
          </button>
        </header>

        {profilesError && (
          <div className="border-b border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
            {profilesError}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {profilesLoading && profiles.length === 0 ? (
            <div className="flex items-center justify-center p-6 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
            </div>
          ) : profiles.length === 0 ? (
            <div className="m-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-xs leading-relaxed text-slate-500">
              Aucun profil ML. Créer un profil via l'API <code className="rounded bg-white px-1 py-0.5 text-[11px] text-slate-700 ring-1 ring-slate-200">POST /ml-api/profiles</code>.
            </div>
          ) : profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setSelectedProfile(p.id); setPage(1); }}
              className={
                'w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-teal-50/40 ' +
                (selectedProfile === p.id ? 'bg-teal-50/70 shadow-[inset_3px_0_0_#0d9488]' : '')
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-slate-900">{p.name}</div>
                  <div className="mt-0.5 text-[12px] text-slate-500">
                    {p.kpi_count} KPIs · {p.dimension_count} dims · {p.run_time}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
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
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50"
                  >
                    {runningId === p.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Play className="h-3 w-3" />}
                    Run now
                  </button>
                </div>
              )}
            </button>
          ))}
        </div>

        {runFeedback && (
          <div className="border-t border-amber-200 bg-amber-50 p-3 text-[11px] font-medium text-amber-800">
            {runFeedback}
          </div>
        )}
      </aside>

      {/* ─── RIGHT: anomalies viewer ─────────────────────────── */}
      <section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200/70 bg-white px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[12px] font-black uppercase tracking-[0.14em] text-slate-700">
                Anomalies {selected ? `· ${selected.name}` : ''}
              </h3>
              <p className="mt-1 text-[12px] text-slate-500">
                {anomaliesTotal.toLocaleString('fr-FR')} anomalies · z-score &gt; {selected?.z_threshold ?? '?'} OU trend% &gt; {selected?.trend_threshold ?? '?'}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setMapOpen((v) => !v)}
                aria-pressed={mapOpen}
                className={
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium border rounded-md transition ' +
                  (mapOpen
                    ? 'bg-teal-600 text-white border-teal-600 hover:bg-teal-500'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700')
                }
                title="Afficher / masquer la carte des anomalies"
              >
                <MapPin className="w-3.5 h-3.5" /> Map
              </button>
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedProfile ?? ''}
                onChange={(e) => { setSelectedProfile(e.target.value ? Number(e.target.value) : null); setPage(1); }}
                className="border border-slate-200 rounded-md px-2 py-1.5 text-[12px] bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-400 transition max-w-[180px]"
                title="Filter by ML profile"
              >
                <option value="">Tous les profils ML</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select
                value={severity}
                onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[12px] text-slate-700 transition hover:border-slate-300 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="">Toutes sévérités</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[12px] text-slate-700 transition hover:border-slate-300 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
              <span className="text-slate-400">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[12px] text-slate-700 transition hover:border-slate-300 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          </div>
        </header>

        {/* Inline accordion map — toggled by the "Map" button */}
        {mapOpen && (
          <div className="border-b border-slate-200/70 bg-slate-50/40">
            <AnomalyMapInline anomalies={anomalies} onClose={() => setMapOpen(false)} />
          </div>
        )}

        {anomaliesError && (
          <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
            <AlertCircle className="h-4 w-4" /> {anomaliesError}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {anomaliesLoading ? (
            <div className="flex items-center justify-center p-12 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
            </div>
          ) : anomalies.length === 0 ? (
            <div className="m-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-12 text-center text-sm text-slate-500">
              Aucune anomalie pour ce filtre.
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10 bg-slate-50/90">
                <tr className="text-left text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-3 py-2.5">Sévérité</th>
                  <th className="px-3 py-2.5">Période</th>
                  <th className="px-3 py-2.5">Cellule</th>
                  <th className="px-3 py-2.5">KPI</th>
                  <th className="px-3 py-2.5">Trend</th>
                  <th className="px-3 py-2.5 text-right">Occ.</th>
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
                  <tr key={a.id} className="border-t border-slate-100 transition hover:bg-teal-50/30">
                    <td className="px-3 py-2">
                      <span className={'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full uppercase tracking-[0.06em] border ' + (SEVERITY_STYLES[a.severity] || SEVERITY_STYLES.info)}>
                        {a.severity === 'critical' && <AlertTriangle className="w-3 h-3" />}
                        {a.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 tabular-nums">{fmtDate(a.period_start)}</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-slate-800">{a.cell_name || '—'}</td>
                    <td className="px-3 py-2">
                      <span title={a.kpi_code} className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[12px] font-semibold text-slate-700">
                        {kpiAliases.get(a.kpi_code) ?? 'KPI'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex h-8 items-end gap-1" title={`Trend ${fmtNum(a.trend_pct)}%`}>
                        {trendBars(a).map((h, i) => (
                          <span
                            key={i}
                            className={(a.severity === 'critical' ? 'bg-red-300' : a.severity === 'warning' ? 'bg-amber-300' : 'bg-emerald-300') + ' w-1.5 rounded-t'}
                            style={{ height: `${h}px` }}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={(a.severity === 'critical' ? 'border-red-200 bg-red-50 text-red-700' : a.severity === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700') + ' inline-flex min-w-8 justify-center rounded-full border px-2 py-0.5 text-[11px] font-semibold'}>
                        {occurrenceByKpi.get(a.kpi_code) ?? 1}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">{fmtNum(a.value)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(a.z_score)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(a.delta_7)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(a.delta_14)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(a.trend_pct)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        title="Ouvrir la page RCA"
                        onClick={() => (onOpenRCA ? onOpenRCA(a) : openRca(a))}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-teal-50 text-teal-700 transition"
                      >
                        <Search className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <footer className="flex items-center justify-between border-t border-slate-200 bg-white p-3 text-xs text-slate-600">
            <span>Page {page} / {totalPages}</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 disabled:opacity-40"
              >‹ Préc.</button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 disabled:opacity-40"
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
          <aside className="relative flex h-full w-[580px] max-w-[96vw] flex-col overflow-hidden border-l border-slate-200 bg-[#F5F7FA] text-slate-900 shadow-2xl">
            <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-5 py-4 shadow-sm backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                      <Brain className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="truncate text-base font-semibold text-slate-900">Analysis · Anomaly #{rcaOpen.id}</h3>
                    <span className={
                      'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.10em] ' +
                      (rcaOpen.severity === 'critical' ? 'border-red-200 bg-red-50 text-red-700' :
                       rcaOpen.severity === 'warning'  ? 'border-amber-200 bg-amber-50 text-amber-700' :
                                                         'border-slate-200 bg-slate-50 text-slate-600')
                    }>{rcaOpen.severity}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <p className="truncate font-mono font-medium text-slate-700">{rcaOpen.kpi_code}</p>
                    <p className="truncate">{rcaOpen.cell_name || 'Unknown cell/site'}</p>
                    <p>{fmtDate(rcaOpen.period_start)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRcaOpen(null)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  title="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="grid grid-cols-6 gap-3">
                  {[
                    ['KPI', kpiAliases.get(rcaOpen.kpi_code) ?? 'KPI', rcaOpen.kpi_code],
                    ['Current value', fmtNum(rcaOpen.value), null],
                    ['Threshold', selected ? `z>${selected.z_threshold}` : 'profile', null],
                    ['Confidence', '76%', null],
                    ['Occurrences', String(occurrenceByKpi.get(rcaOpen.kpi_code) ?? 1), null],
                    ['Last RCA', rcaCached ? 'cached' : rcaText ? 'current' : 'not run', null],
                  ].map(([label, value, title]) => (
                    <div key={label} className="min-w-0 border-r border-slate-100 pr-2 last:border-r-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                      <p title={title ?? undefined} className={(label === 'Current value' && rcaOpen.severity === 'critical' ? 'text-red-700' : 'text-slate-900') + ' mt-1 truncate text-[12px] font-semibold'}>
                        {value}
                      </p>
                      {label === 'Confidence' && (
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full w-[76%] rounded-full bg-blue-500" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </header>

            <nav className="sticky top-[145px] z-10 border-b border-slate-200 bg-white/90 px-5 py-3 backdrop-blur-xl">
              <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1">
                {([
                  { id: 'rca', label: 'RCA', icon: <Brain className="h-3.5 w-3.5" />, enabled: true },
                  { id: 'reco', label: 'Recommendation', icon: <Lightbulb className="h-3.5 w-3.5" />, enabled: !!rcaDiagnosticId },
                  { id: 'risk', label: 'Validation', icon: <Shield className="h-3.5 w-3.5" />, enabled: !!recPersisted },
                  { id: 'exec', label: 'Execution', icon: <Terminal className="h-3.5 w-3.5" />, enabled: approval?.decision === 'approved' },
                  { id: 'outcome', label: 'Outcome', icon: <Award className="h-3.5 w-3.5" />, enabled: executionRow?.status === 'completed' },
                ] as { id: Step; label: string; icon: React.ReactNode; enabled: boolean }[]).map((s) => {
                  const isActive = activeStep === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!s.enabled}
                      onClick={() => setActiveStep(s.id)}
                      title={s.enabled ? s.label : `${s.label} unavailable`}
                      className={
                        'inline-flex min-w-9 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-semibold transition-all duration-200 ' +
                        (isActive
                          ? 'border-blue-200 bg-white text-blue-700 shadow-sm'
                          : s.enabled
                            ? 'border-transparent text-slate-600 hover:bg-white hover:text-slate-900'
                            : 'cursor-not-allowed border-transparent text-slate-400')
                      }
                    >
                      {s.icon}
                      <span className="hidden sm:inline">{s.id === 'reco' ? 'Reco' : s.label}</span>
                    </button>
                  );
                })}
              </div>
            </nav>

            <div className="flex-1 overflow-auto bg-[#F5F7FA] p-5">
              {/* ─── RCA panel ─── */}
              {activeStep === 'rca' && (
                <div className="space-y-4">
                  {/* Auto-trigger RCA if nothing is cached and the user lands on this step. */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-blue-700">RCA engine</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{rcaCached ? 'Cached RCA result is available.' : rcaText ? 'Live RCA analysis captured.' : 'Run RCA to generate operational insight cards.'}</p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(rcaText || `${rcaOpen.cell_name} ${rcaOpen.kpi_code}`)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          title="Copy RCA"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const blob = new Blob([rcaText || 'No RCA generated yet.'], { type: 'text/plain;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `rca-anomaly-${rcaOpen.id}.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          title="Export RCA"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {!rcaText && !rcaLoading && (
                      <button
                        type="button"
                        onClick={() => openRca(rcaOpen, true)}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                      >
                        <Brain className="h-3.5 w-3.5" /> Lancer RCA
                      </button>
                    )}
                  </div>
                  {rcaError && (
                    <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <AlertCircle className="h-4 w-4" /> {rcaError}
                    </div>
                  )}
                  {!rcaText && rcaLoading && (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-12 text-sm text-slate-600 shadow-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      RCAI investigue (peut prendre 60-120s — appels CM/FM/KPI/peers)…
                    </div>
                  )}

                  {[
                    { title: 'RCA Status', body: rcaCached ? 'Cached RCA result is available for this anomaly.' : rcaText ? 'Live RCA analysis captured for the selected anomaly.' : 'Run RCA to generate the operational analysis.', tone: 'blue' },
                    { title: 'Probable Cause', body: rcaText || 'RCA not generated yet. Launch RCA to identify likely degradation drivers.', tone: 'blue' },
                    { title: 'Impact', body: `${rcaOpen.cell_name || 'NE'} is impacted on ${kpiAliases.get(rcaOpen.kpi_code) ?? 'KPI'}. Current value ${fmtNum(rcaOpen.value)}, z-score ${fmtNum(rcaOpen.z_score)}, trend ${fmtNum(rcaOpen.trend_pct)}%.`, tone: 'red' },
                    { title: 'Confidence Details', body: 'Confidence model combines z-score, trend deviation, KPI family, and historical recurrence. Current confidence estimate: 76%.', tone: 'green' },
                    { title: 'Recommended Actions', body: recPersisted?.rationale || 'Generate a recommendation to obtain parameter-level actions and safe rollback guidance.', tone: 'amber' },
                    { title: 'Similar Incidents', body: 'Search previous anomalies with the same KPI family, vendor, and site cluster before executing changes.', tone: 'slate' },
                  ].map((card, idx) => (
                    <details key={card.title} open={idx < 3} className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                        <span className="flex items-center gap-3">
                          <span className={
                            'inline-flex h-2.5 w-2.5 rounded-full ' +
                            (card.tone === 'red' ? 'bg-red-500' :
                             card.tone === 'green' ? 'bg-emerald-500' :
                             card.tone === 'amber' ? 'bg-amber-500' :
                             card.tone === 'blue' ? 'bg-blue-500' :
                             'bg-slate-400')
                          } />
                          <span>
                            <span className="block text-sm font-semibold text-slate-900">{card.title}</span>
                            <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Analysis section</span>
                          </span>
                        </span>
                        <span className="text-slate-400 transition group-open:rotate-90">›</span>
                      </summary>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{card.body}</p>
                    </details>
                  ))}

                  {rcaLoading && rcaText && (
                    <div className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <Loader2 className="h-3 w-3 animate-spin" /> RCAI continue à streamer…
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

            <footer className="border-t border-slate-200 bg-white/95 p-4 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500">
                  agentic.diagnostics cache enabled
                </span>
                <button
                  type="button"
                  disabled={rcaLoading}
                  onClick={() => openRca(rcaOpen!, true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-40"
                >
                  <RefreshCw className={rcaLoading ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
                  Re-run RCA
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50">
                  Escalate
                </button>
                <button type="button" className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50">
                  Create Ticket
                </button>
                <button type="button" className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50">
                  Mark Resolved
                </button>
              </div>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
};

// ── Anomaly Map (inline accordion) ─────────────────────────────────────
// Plots anomalies on a Leaflet map using REAL site coordinates from topo.
// Renders inline above the anomalies table, toggled by the "Map" button.
const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};
const SEV_ORDER: Record<string, number> = { critical: 3, warning: 2, info: 1 };

const AnomalyMapInline: React.FC<{ anomalies: MlAnomaly[]; onClose: () => void }> = ({ anomalies, onClose }) => {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [coords, setCoords] = useState<Map<string, [number, number]> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [height, setHeight] = useState<number>(360);
  const resizingRef = useRef(false);

  // Drag-to-resize handler
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current || !mapEl.current) return;
      const top = mapEl.current.getBoundingClientRect().top;
      const next = Math.max(200, Math.min(900, e.clientY - top));
      setHeight(next);
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.userSelect = '';
      setTimeout(() => mapRef.current?.invalidateSize(), 30);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Keep Leaflet sized in sync when height changes via presets
  useEffect(() => {
    const id = setTimeout(() => mapRef.current?.invalidateSize(), 60);
    return () => clearTimeout(id);
  }, [height]);

  // 2026-05-14: build cell_name → [lat,lng] lookup primarily from the
  // anomalies themselves (each row now ships latitude/longitude inline,
  // no need to pre-load 100k topo cells which the LEGACY_CAP=50000 was
  // silently truncating). Fall back to fetchTopoSites() only if any
  // anomaly is missing coords.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = new Map<string, [number, number]>();
      const missing: string[] = [];
      anomalies.forEach((a: any) => {
        const lat = Number(a.latitude);
        const lng = Number(a.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng) && a.cell_name) {
          map.set(String(a.cell_name), [lat, lng]);
        } else if (a.cell_name) {
          missing.push(String(a.cell_name));
        }
      });
      if (missing.length === 0) {
        if (!cancelled) setCoords(map);
        return;
      }
      try {
        const sites = await fetchTopoSites();
        if (cancelled) return;
        sites.forEach((s: any) => {
          const lat = Number(s.latitude);
          const lng = Number(s.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          (s.cells || []).forEach((c: any) => {
            const name = c?.nom_cellule || c?.cell_name;
            if (name && !map.has(String(name))) map.set(String(name), [lat, lng]);
          });
        });
        setCoords(map);
      } catch (e: any) {
        if (!cancelled) {
          // Keep whatever inline coords we already harvested even if the
          // fallback fails — better some markers than none.
          setCoords(map);
          setLoadError(e?.message || 'Topology fallback failed');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [anomalies]);

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
      if (!grouped[name]) grouped[name] = { lat: ll[0], lng: ll[1], sev: a.severity, count: 0, name };
      grouped[name].count += 1;
      if ((SEV_ORDER[a.severity] || 0) > (SEV_ORDER[grouped[name].sev] || 0)) grouped[name].sev = a.severity;
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
    <div>
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200/70">
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-teal-600" />
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">
            Anomaly Locations
          </h4>
          <span className="text-[11px] text-slate-500">· {anomalies.length} anomalies</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[10px] text-slate-500">
            {([['S',260],['M',360],['L',520],['XL',720]] as const).map(([label, h]) => (
              <button
                key={label}
                onClick={() => setHeight(h)}
                className={`px-1.5 py-0.5 rounded border ${height === h ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                title={`Hauteur ${h}px`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            {(['critical','warning','info'] as const).map(s => (
              <span key={s} className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: SEV_COLOR[s] }} />
                {s}
              </span>
            ))}
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-slate-100 text-slate-500" title="Fermer la carte">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="relative" style={{ height }}>
        <div ref={mapEl} className="absolute inset-0" />
        {!coords && !loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-slate-500 text-[12px] gap-2 pointer-events-none">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading site coordinates…
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-red-600 text-[12px] gap-2">
            <AlertCircle className="w-4 h-4" /> {loadError}
          </div>
        )}
      </div>
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          resizingRef.current = true;
          document.body.style.userSelect = 'none';
        }}
        className="h-2 cursor-ns-resize bg-slate-100 hover:bg-teal-200 border-t border-slate-200 flex items-center justify-center"
        title="Glisser pour redimensionner"
      >
        <div className="w-10 h-1 rounded-full bg-slate-300" />
      </div>
    </div>
  );
};

export default SentinelMLDetector;
