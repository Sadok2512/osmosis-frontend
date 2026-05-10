// ML Detector tab inside Sentinel — wraps ml-engine (port 11002).
// MVP per the architecture roundtable (2026-05-10): list profiles + Run Now,
// paginated anomalies viewer with profile/severity/date filters. CRUD is
// out of scope for v1 — added later if usage warrants.
import React, { useEffect, useMemo, useState } from 'react';
import {
  Brain, Play, RefreshCw, AlertTriangle, AlertCircle,
  Loader2, Calendar, Filter,
} from 'lucide-react';
import {
  listProfiles, listAnomalies, runProfileNow,
  MlProfile, MlAnomaly,
} from '../mlDetectorApi';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  warning:  'bg-amber-100 text-amber-700 border-amber-200',
  info:     'bg-slate-100 text-slate-700 border-slate-200',
};

const fmtNum = (v: number | null | undefined): string =>
  v == null ? '—' : (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));

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

  const totalPages = useMemo(() => Math.max(1, Math.ceil(anomaliesTotal / limit)), [anomaliesTotal]);
  const selected = profiles.find((p) => p.id === selectedProfile) || null;

  return (
    <div className="flex h-full gap-4">
      {/* ─── LEFT: profiles ─────────────────────────────────── */}
      <aside className="w-[320px] shrink-0 flex flex-col bg-white rounded-lg border border-slate-200 overflow-hidden">
        <header className="flex items-center justify-between p-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-slate-700">Profils ML</h3>
            <span className="text-xs text-slate-400">({profiles.length})</span>
          </div>
          <button
            type="button"
            onClick={loadProfiles}
            className="p-1 rounded hover:bg-slate-100 text-slate-500"
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
                'w-full text-left px-3 py-2 border-b border-slate-100 hover:bg-slate-50 ' +
                (selectedProfile === p.id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : '')
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{p.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {p.kpi_count} KPIs · {p.dimension_count} dims · {p.run_time}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Last run: {fmtDate(p.last_run_at)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={
                    'text-[10px] px-1.5 py-0.5 rounded ' +
                    (p.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600')
                  }>
                    {p.is_active ? 'actif' : 'pause'}
                  </span>
                </div>
              </div>
              {selectedProfile === p.id && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRunNow(p.id); }}
                    disabled={runningId === p.id}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
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
      <section className="flex-1 flex flex-col bg-white rounded-lg border border-slate-200 overflow-hidden">
        <header className="p-3 border-b border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">
                Anomalies {selected ? `· ${selected.name}` : ''}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {anomaliesTotal.toLocaleString('fr-FR')} anomalies · z-score &gt; {selected?.z_threshold ?? '?'} OU trend% &gt; {selected?.trend_threshold ?? '?'}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={severity}
                onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
                className="border border-slate-200 rounded px-2 py-1 text-xs"
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
                className="border border-slate-200 rounded px-2 py-1 text-xs"
              />
              <span className="text-slate-400">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="border border-slate-200 rounded px-2 py-1 text-xs"
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
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="text-left text-[11px] text-slate-500 uppercase tracking-wider">
                  <th className="px-3 py-2 font-semibold">Sévérité</th>
                  <th className="px-3 py-2 font-semibold">Période</th>
                  <th className="px-3 py-2 font-semibold">Cellule</th>
                  <th className="px-3 py-2 font-semibold">KPI</th>
                  <th className="px-3 py-2 font-semibold text-right">Valeur</th>
                  <th className="px-3 py-2 font-semibold text-right">Z-score</th>
                  <th className="px-3 py-2 font-semibold text-right">Δ7d</th>
                  <th className="px-3 py-2 font-semibold text-right">Δ14d</th>
                  <th className="px-3 py-2 font-semibold text-right">Trend %</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <span className={'inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded border ' + (SEVERITY_STYLES[a.severity] || SEVERITY_STYLES.info)}>
                        {a.severity === 'critical' && <AlertTriangle className="w-3 h-3" />}
                        {a.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 tabular-nums">{fmtDate(a.period_start)}</td>
                    <td className="px-3 py-2 font-mono text-slate-800">{a.cell_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-700 truncate max-w-[200px]" title={a.kpi_code}>{a.kpi_code}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtNum(a.value)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(a.z_score)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(a.delta_7)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(a.delta_14)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(a.trend_pct)}</td>
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
    </div>
  );
};

export default SentinelMLDetector;
