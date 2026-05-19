/**
 * OdccAdminPanel — backend admin overview for the ODCC module.
 *
 * Lives inside BackendAdmin (otarie) so operators can audit ODCC state
 * without navigating away from the backend dashboard:
 *   - aggregate counters (total / active detectors, anomalies, NE footprint)
 *   - table of detectors with name, scope, KPI table, ne_count, last fired
 *   - table of recent anomalies (most recently detected NEs)
 *
 * Reads via the renamed ml-engine endpoints (2026-05-19 party):
 *   GET /ml-api/detectors                    → lean list
 *   GET /ml-api/anomalies?limit=N            → recent NE detections
 */
import React, { useEffect, useState } from 'react';
import { Radar, ShieldCheck, AlertTriangle, Activity, RefreshCw } from 'lucide-react';
import { getVpsProxyUrl, getVpsProxyHeaders, getApiHeaders } from '@/lib/apiConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface DetectorRow {
  id: number;
  name: string;
  is_active: boolean;
  scope_level: string | null;
  kpi_table: { table_name: string; period: string } | null;
  kpi_count: number;
  dimension_count: number;
  ne_count: number | null;
  last_run_at: string | null;
  last_fired_at: string | null;
  created_at: string | null;
}

interface AnomalyRow {
  id: number;
  detector_id: number;
  period_start: string;
  cell_name: string | null;
  kpi_code: string;
  value: number | null;
  severity: string;
  detected_at: string;
}

const fmtDate = (iso: string | null): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return '—'; }
};

const sevColor = (s: string): string => {
  const k = (s || '').toLowerCase();
  if (k === 'critical') return 'bg-destructive/20 text-destructive border-destructive/30';
  if (k === 'major' || k === 'warning') return 'bg-orange-500/20 text-orange-500 border-orange-500/30';
  if (k === 'minor' || k === 'info') return 'bg-primary/20 text-primary border-primary/30';
  return 'bg-muted text-muted-foreground border-border';
};

const OdccAdminPanel: React.FC = () => {
  const [detectors, setDetectors] = useState<DetectorRow[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyRow[]>([]);
  const [total, setTotal]         = useState(0);
  const [anomaliesTotal, setAnomaliesTotal] = useState(0);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // Same URL resolution as detectorBuilderApi.ts — on VPS / qoebit.net
      // hits /ml-api directly; off-domain goes through vps-proxy so this
      // panel works in Lovable preview too.
      const headers = getVpsProxyHeaders(getApiHeaders());
      const [dRes, aRes] = await Promise.all([
        fetch(getVpsProxyUrl('ml', '/detectors?limit=200'), { headers }),
        fetch(getVpsProxyUrl('ml', '/anomalies?limit=20'),  { headers }),
      ]);
      if (!dRes.ok) throw new Error(`/detectors HTTP ${dRes.status}`);
      if (!aRes.ok) throw new Error(`/anomalies HTTP ${aRes.status}`);
      const dJson = await dRes.json();
      const aJson = await aRes.json();
      // Tolerate the vps-proxy "unavailable" envelope — render empty state.
      if (dJson?.unavailable || aJson?.unavailable) {
        setDetectors([]); setTotal(0);
        setAnomalies([]); setAnomaliesTotal(0);
        setError('Backend ODCC indisponible (preview / tunnel coupé).');
        return;
      }
      setDetectors(Array.isArray(dJson.detectors) ? dJson.detectors : []);
      setTotal(Number(dJson.total ?? 0));
      setAnomalies(Array.isArray(aJson.items) ? aJson.items : []);
      setAnomaliesTotal(Number(aJson.total ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const activeCount = detectors.filter(d => d.is_active).length;
  const neFootprint = detectors.reduce((acc, d) => acc + (d.ne_count ?? 0), 0);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Radar className="w-4 h-4 text-primary" />
            ODCC — Operator Detection Control Console
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="h-7 px-2 text-xs">
            <RefreshCw className={'w-3 h-3 mr-1 ' + (loading ? 'animate-spin' : '')} />
            Rafraîchir
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Vue admin des Detectors créés via le wizard <code className="text-[10px]">/odcc</code> et des
          NEs récemment détectés en anomalie. Source : <code className="text-[10px]">public.ml_detector_config</code>,&nbsp;
          <code className="text-[10px]">kpi.ml_anomalies</code>.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            ODCC backend unreachable: {error}
          </div>
        )}

        {/* Aggregate counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-md border border-border p-3 bg-muted/30">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wide">
              <ShieldCheck className="w-3 h-3" /> Detectors
            </div>
            <div className="text-2xl font-bold mt-1">{total}</div>
          </div>
          <div className="rounded-md border border-border p-3 bg-muted/30">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wide">
              <Activity className="w-3 h-3" /> Actifs
            </div>
            <div className="text-2xl font-bold mt-1 text-primary">{activeCount}</div>
          </div>
          <div className="rounded-md border border-border p-3 bg-muted/30">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wide">
              <Radar className="w-3 h-3" /> NEs couverts
            </div>
            <div className="text-2xl font-bold mt-1">{neFootprint.toLocaleString('fr-FR')}</div>
          </div>
          <div className="rounded-md border border-border p-3 bg-muted/30">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wide">
              <AlertTriangle className="w-3 h-3" /> Anomalies (total)
            </div>
            <div className="text-2xl font-bold mt-1">{anomaliesTotal}</div>
          </div>
        </div>

        {/* Detector list */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Detectors créés ({detectors.length})
          </h4>
          {detectors.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Aucun detector créé. Lancez le wizard depuis l'onglet <strong>ODCC</strong>.
            </div>
          ) : (
            <div className="rounded-md border border-border overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1 text-left">Nom</th>
                    <th className="px-2 py-1 text-left">Scope</th>
                    <th className="px-2 py-1 text-left">KPI table</th>
                    <th className="px-2 py-1 text-right">KPIs</th>
                    <th className="px-2 py-1 text-right">NEs</th>
                    <th className="px-2 py-1 text-left">Dernière anomalie</th>
                    <th className="px-2 py-1 text-left">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {detectors.map(d => (
                    <tr key={d.id} className="border-t border-border/30 hover:bg-muted/20">
                      <td className="px-2 py-1 text-foreground font-semibold">{d.name}</td>
                      <td className="px-2 py-1">{d.scope_level ?? '—'}</td>
                      <td className="px-2 py-1">
                        {d.kpi_table
                          ? <>{d.kpi_table.table_name} <span className="text-muted-foreground">({d.kpi_table.period})</span></>
                          : '—'}
                      </td>
                      <td className="px-2 py-1 text-right">{d.kpi_count}</td>
                      <td className="px-2 py-1 text-right">{d.ne_count?.toLocaleString('fr-FR') ?? '—'}</td>
                      <td className="px-2 py-1">{fmtDate(d.last_fired_at)}</td>
                      <td className="px-2 py-1">
                        <Badge className={d.is_active
                          ? 'bg-primary/20 text-primary border-primary/30 text-[10px]'
                          : 'bg-muted text-muted-foreground border-border text-[10px]'}>
                          {d.is_active ? 'actif' : 'pause'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent anomalies (NEs detected) */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            NEs détectés récemment ({anomalies.length})
          </h4>
          {anomalies.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Aucune anomalie remontée pour l'instant.
            </div>
          ) : (
            <div className="rounded-md border border-border overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1 text-left">Détecté le</th>
                    <th className="px-2 py-1 text-right">Detector</th>
                    <th className="px-2 py-1 text-left">Cell</th>
                    <th className="px-2 py-1 text-left">KPI</th>
                    <th className="px-2 py-1 text-right">Valeur</th>
                    <th className="px-2 py-1 text-left">Sévérité</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.map(a => (
                    <tr key={a.id} className="border-t border-border/30 hover:bg-muted/20">
                      <td className="px-2 py-1">{fmtDate(a.detected_at)}</td>
                      <td className="px-2 py-1 text-right">#{a.detector_id}</td>
                      <td className="px-2 py-1 text-foreground">{a.cell_name ?? '—'}</td>
                      <td className="px-2 py-1">{a.kpi_code}</td>
                      <td className="px-2 py-1 text-right">{a.value?.toFixed(2) ?? '—'}</td>
                      <td className="px-2 py-1">
                        <Badge className={sevColor(a.severity) + ' text-[10px]'}>
                          {a.severity}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default OdccAdminPanel;
