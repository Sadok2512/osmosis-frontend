import React, { useState, useEffect, useMemo } from 'react';
import { Activity, TrendingUp, TrendingDown, Minus, AlertTriangle, Download, RefreshCw, Calendar, Filter } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { biQueryApi } from '@/lib/localDb';
import { supabase } from '@/integrations/supabase/client';
import { getPreferredDataSource } from '@/lib/apiConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';

/* ───── Types ───── */
interface KpiSummary {
  label: string;
  key: string;
  value: number | null;
  unit: string;
  delta7j: number | null;
  orientation: 'up' | 'down'; // 'up' = higher is better
}

interface SiteRow {
  dimension_2: string;
  qoe_index: number | null;
  debit_dl: number | null;
  rtt_data_avg: number | null;
  session_nbr: number | null;
  loss_dl_rate: number | null;
  tcp_retr_rate_dl: number | null;
  delta7j?: number | null;
}

interface TimePoint {
  date: string;
  [kpi: string]: any;
}

/* ───── Constants ───── */
const CORE_KPIS: { key: string; label: string; unit: string; orientation: 'up' | 'down'; deltaKey?: string }[] = [
  { key: 'qoe_index', label: 'QoE Index', unit: '', orientation: 'up', deltaKey: 'qoe_index_delta7j_pct' },
  { key: 'debit_dl', label: 'Débit DL', unit: 'Mbps', orientation: 'up', deltaKey: 'debit_dl_delta7j_pct' },
  { key: 'debit_ul', label: 'Débit UL', unit: 'Mbps', orientation: 'up', deltaKey: 'debit_ul_delta7j_pct' },
  { key: 'rtt_data_avg', label: 'RTT Data', unit: 'ms', orientation: 'down', deltaKey: 'rtt_data_avg_delta7j_pct' },
  { key: 'loss_dl_rate', label: 'Loss DL', unit: '%', orientation: 'down', deltaKey: 'loss_dl_rate_delta7j_pct' },
  { key: 'tcp_retr_rate_dl', label: 'Retr. TCP DL', unit: '%', orientation: 'down', deltaKey: 'tcp_retr_rate_dl_delta7j_pct' },
  { key: 'session_nbr', label: 'Sessions', unit: '', orientation: 'up', deltaKey: 'session_nbr_delta7j_pct' },
  { key: 'session_dcr', label: 'DCR', unit: '%', orientation: 'down', deltaKey: 'session_dcr_delta7j_pct' },
];

const TREND_COLORS = ['#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6'];

/* ───── Helpers ───── */
const fmt = (v: number | null | undefined, decimals = 2): string => {
  if (v == null || isNaN(v)) return '—';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return Number(v).toFixed(decimals);
};

const DeltaBadge: React.FC<{ delta: number | null; orientation: 'up' | 'down' }> = ({ delta, orientation }) => {
  if (delta == null || isNaN(delta)) return <span className="text-xs text-muted-foreground">—</span>;
  const isGood = orientation === 'up' ? delta > 0 : delta < 0;
  const isBad = orientation === 'up' ? delta < 0 : delta > 0;
  const color = isGood ? 'text-emerald-500' : isBad ? 'text-red-500' : 'text-muted-foreground';
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${color}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
};

/* ───── Component ───── */
const PulseReportPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<KpiSummary[]>([]);
  const [topWorst, setTopWorst] = useState<SiteRow[]>([]);
  const [topBest, setTopBest] = useState<SiteRow[]>([]);
  const [timeSeries, setTimeSeries] = useState<TimePoint[]>([]);
  const [latestDate, setLatestDate] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [dimension, setDimension] = useState<string>('Site');

  const isLocal = getPreferredDataSource() === 'local';

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isLocal) {
        await fetchFromLocal();
      } else {
        await fetchFromCloud();
      }
    } catch (err: any) {
      console.error('PULSE fetch error:', err);
      setError(err.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const fetchFromCloud = async () => {
    // 1. Get latest date from ml_features
    const { data: latestRows } = await supabase
      .from('ml_features')
      .select('date_part')
      .eq('dimension_1', dimension)
      .order('date_part', { ascending: false })
      .limit(1);

    const maxDate = latestRows?.[0]?.date_part;
    if (!maxDate) {
      // Fallback to kpi_qoe_aggregated
      const { data: fallbackRows } = await supabase
        .from('kpi_qoe_aggregated')
        .select('date_part')
        .eq('dimension_1', dimension)
        .order('date_part', { ascending: false })
        .limit(1);
      if (!fallbackRows?.[0]) {
        // No data at all — show empty state, not an error loop
        setLatestDate('');
        setSummaries(CORE_KPIS.map(k => ({ label: k.label, key: k.key, value: null, unit: k.unit, delta7j: null, orientation: k.orientation })));
        setTopWorst([]);
        setTopBest([]);
        setTimeSeries([]);
        setError('Aucune donnée dans les tables Cloud. Lancez l\'application en local (localhost:5173) avec le backend Express pour accéder aux données PostgreSQL.');
        return;
      }
      await fetchFromCloudAggregated(fallbackRows[0].date_part);
      return;
    }
    setLatestDate(maxDate);

    // 2. Fetch global averages for latest date (all sites combined → dimension_1='Global' or aggregate)
    const { data: globalRow } = await supabase
      .from('ml_features')
      .select('*')
      .eq('dimension_1', 'Global')
      .eq('date_part', maxDate)
      .limit(1);

    const gRow = globalRow?.[0];

    const sums: KpiSummary[] = CORE_KPIS.map(k => ({
      label: k.label,
      key: k.key,
      value: gRow ? (gRow as any)[k.key] : null,
      unit: k.unit,
      delta7j: gRow && k.deltaKey ? (gRow as any)[k.deltaKey] : null,
      orientation: k.orientation,
    }));
    setSummaries(sums);

    // 3. Top worst / best by qoe_index
    const { data: worstRows } = await supabase
      .from('ml_features')
      .select('dimension_2, qoe_index, debit_dl, rtt_data_avg, session_nbr, loss_dl_rate, tcp_retr_rate_dl, qoe_index_delta7j_pct')
      .eq('dimension_1', dimension)
      .eq('date_part', maxDate)
      .not('qoe_index', 'is', null)
      .order('qoe_index', { ascending: true })
      .limit(10);

    setTopWorst((worstRows || []).map(r => ({ ...r, delta7j: (r as any).qoe_index_delta7j_pct })));

    const { data: bestRows } = await supabase
      .from('ml_features')
      .select('dimension_2, qoe_index, debit_dl, rtt_data_avg, session_nbr, loss_dl_rate, tcp_retr_rate_dl, qoe_index_delta7j_pct')
      .eq('dimension_1', dimension)
      .eq('date_part', maxDate)
      .not('qoe_index', 'is', null)
      .order('qoe_index', { ascending: false })
      .limit(10);

    setTopBest((bestRows || []).map(r => ({ ...r, delta7j: (r as any).qoe_index_delta7j_pct })));

    // 4. Time series (last 30 days, Global level)
    const { data: tsRows } = await supabase
      .from('kpi_qoe_aggregated')
      .select('date_part, qoe_index, debit_dl, debit_ul, rtt_data_avg, session_nbr, loss_dl_rate')
      .eq('dimension_1', 'Global')
      .order('date_part', { ascending: true })
      .limit(60);

    setTimeSeries((tsRows || []).map(r => ({ date: r.date_part, ...r })));
  };

  const fetchFromCloudAggregated = async (maxDate: string) => {
    setLatestDate(maxDate);
    const { data: globalRow } = await supabase
      .from('kpi_qoe_aggregated')
      .select('*')
      .eq('dimension_1', 'Global')
      .eq('date_part', maxDate)
      .limit(1);

    const gRow = globalRow?.[0];
    const sums: KpiSummary[] = CORE_KPIS.map(k => ({
      label: k.label, key: k.key,
      value: gRow ? (gRow as any)[k.key] : null,
      unit: k.unit, delta7j: null, orientation: k.orientation,
    }));
    setSummaries(sums);

    const { data: worstRows } = await supabase
      .from('kpi_qoe_aggregated')
      .select('dimension_2, qoe_index, debit_dl, rtt_data_avg, session_nbr, loss_dl_rate, tcp_retr_rate_dl')
      .eq('dimension_1', dimension)
      .eq('date_part', maxDate)
      .not('qoe_index', 'is', null)
      .order('qoe_index', { ascending: true })
      .limit(10);
    setTopWorst((worstRows || []).map(r => ({ ...r, delta7j: null })));

    const { data: bestRows } = await supabase
      .from('kpi_qoe_aggregated')
      .select('dimension_2, qoe_index, debit_dl, rtt_data_avg, session_nbr, loss_dl_rate, tcp_retr_rate_dl')
      .eq('dimension_1', dimension)
      .eq('date_part', maxDate)
      .not('qoe_index', 'is', null)
      .order('qoe_index', { ascending: false })
      .limit(10);
    setTopBest((bestRows || []).map(r => ({ ...r, delta7j: null })));

    const { data: tsRows } = await supabase
      .from('kpi_qoe_aggregated')
      .select('date_part, qoe_index, debit_dl, debit_ul, rtt_data_avg, session_nbr, loss_dl_rate')
      .eq('dimension_1', 'Global')
      .order('date_part', { ascending: true })
      .limit(60);
    setTimeSeries((tsRows || []).map(r => ({ date: r.date_part, ...r })));
  };

  const fetchFromLocal = async () => {
    try {
      // Use biQueryApi for local backend
      const dateRange = await biQueryApi.dateRange();
      const maxDate = dateRange.max_date;
      if (!maxDate) throw new Error('Aucune donnée');
      setLatestDate(maxDate);

      // Global summary
      const globalRes = await biQueryApi.query({
        kpis: CORE_KPIS.map(k => k.key),
        aggregation: 'avg',
        dateStart: maxDate,
        dateEnd: maxDate,
      });
      const gRow = globalRes.rows?.[0];
      setSummaries(CORE_KPIS.map(k => ({
        label: k.label, key: k.key,
        value: gRow ? gRow[k.key] : null,
        unit: k.unit, delta7j: null, orientation: k.orientation,
      })));

      // Top worst
      const worstRes = await biQueryApi.query({
        kpis: ['qoe_index', 'debit_dl', 'rtt_data_avg', 'session_nbr', 'loss_dl_rate', 'tcp_retr_rate_dl'],
        aggregation: 'avg',
        dateStart: maxDate,
        dateEnd: maxDate,
        groupBy: ['dimension_2'],
        filters: [{ dimension: 'dimension_1', values: [dimension] }],
        topN: 10,
      });
      const sortedWorst = (worstRes.rows || []).sort((a, b) => (a.qoe_index ?? 999) - (b.qoe_index ?? 999));
      setTopWorst(sortedWorst.map(r => ({ ...r, delta7j: null })));

      const sortedBest = [...(worstRes.rows || [])].sort((a, b) => (b.qoe_index ?? 0) - (a.qoe_index ?? 0)).slice(0, 10);
      setTopBest(sortedBest.map(r => ({ ...r, delta7j: null })));

      // Time series
      const tsRes = await biQueryApi.query({
        kpis: ['qoe_index', 'debit_dl', 'debit_ul', 'rtt_data_avg', 'session_nbr', 'loss_dl_rate'],
        aggregation: 'avg',
        granularity: '1d',
      });
      setTimeSeries((tsRes.rows || []).map(r => ({ date: r.date_part || r.date, ...r })));
    } catch (err: any) {
      // Don't fallback to cloud from local — just report the error
      console.warn('Local fetch failed:', err.message);
      throw new Error('Backend local indisponible. Vérifiez que le serveur Express tourne sur localhost:3001.');
    }
  };

  useEffect(() => { fetchData(); }, [dimension]);

  /* ───── ECharts: Trend ───── */
  const trendOption = useMemo(() => {
    if (!timeSeries.length) return {};
    const kpisToPlot = ['qoe_index', 'debit_dl', 'rtt_data_avg'];
    const labels: Record<string, string> = { qoe_index: 'QoE Index', debit_dl: 'Débit DL (Mbps)', rtt_data_avg: 'RTT (ms)' };
    return {
      tooltip: { trigger: 'axis' as const },
      legend: { data: kpisToPlot.map(k => labels[k]), top: 0, textStyle: { fontSize: 11 } },
      grid: { top: 40, bottom: 30, left: 50, right: 50 },
      xAxis: { type: 'category' as const, data: timeSeries.map(t => t.date), axisLabel: { fontSize: 10, rotate: 30 } },
      yAxis: [
        { type: 'value' as const, name: 'QoE / Débit', position: 'left' as const, axisLabel: { fontSize: 10 } },
        { type: 'value' as const, name: 'RTT (ms)', position: 'right' as const, inverse: true, axisLabel: { fontSize: 10 } },
      ],
      series: kpisToPlot.map((k, i) => ({
        name: labels[k],
        type: 'line' as const,
        yAxisIndex: k === 'rtt_data_avg' ? 1 : 0,
        data: timeSeries.map(t => t[k] ?? null),
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: TREND_COLORS[i] },
        itemStyle: { color: TREND_COLORS[i] },
      })),
    };
  }, [timeSeries]);

  /* ───── ECharts: Bar worst ───── */
  const worstBarOption = useMemo(() => {
    if (!topWorst.length) return {};
    return {
      tooltip: { trigger: 'axis' as const },
      grid: { top: 10, bottom: 30, left: 120, right: 20 },
      xAxis: { type: 'value' as const, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'category' as const, data: topWorst.map(r => r.dimension_2?.substring(0, 20) || '?').reverse(), axisLabel: { fontSize: 10 } },
      series: [{
        type: 'bar' as const,
        data: [...topWorst].reverse().map(r => r.qoe_index ?? 0),
        itemStyle: {
          color: (params: any) => {
            const v = params.value;
            if (v < 40) return '#ef4444';
            if (v < 60) return '#f97316';
            if (v < 75) return '#eab308';
            return '#22c55e';
          },
        },
        barWidth: 16,
      }],
    };
  }, [topWorst]);

  const reportDate = latestDate || new Date().toISOString().split('T')[0];

  if (error && !loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-amber-500" />
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <button onClick={fetchData} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition">
              <RefreshCw className="w-4 h-4 inline mr-1" /> Réessayer
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">📡 PULSE — Rapport de Performance RAN</h1>
              <p className="text-xs text-muted-foreground">
                Date : <span className="font-semibold">{reportDate}</span> · Dimension : <span className="font-semibold">{dimension}</span> · Source : <span className="font-semibold">{isLocal ? 'Local' : 'Cloud'}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={dimension}
              onChange={e => setDimension(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-border bg-card text-foreground text-xs font-medium"
            >
              {['Site', 'Plaque', 'DOR', 'Vendor', 'RAT', 'Bande', 'Zone_ARCEP'].map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <button onClick={fetchData} className="p-2 rounded-lg border border-border hover:bg-muted transition" title="Rafraîchir">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* ─── KPI Summary Cards ─── */}
        <section>
          <h2 className="text-sm font-bold text-foreground mb-3 uppercase tracking-wider flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Synthèse Globale
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))
              : summaries.map(s => (
                  <Card key={s.key} className="bg-card border-border hover:shadow-md transition-shadow">
                    <CardContent className="p-3 space-y-1">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide truncate">{s.label}</p>
                      <p className="text-xl font-black text-foreground">{fmt(s.value)}<span className="text-[10px] ml-0.5 text-muted-foreground">{s.unit}</span></p>
                      <DeltaBadge delta={s.delta7j} orientation={s.orientation} />
                    </CardContent>
                  </Card>
                ))}
          </div>
        </section>

        {/* ─── Trend Chart ─── */}
        <section>
          <h2 className="text-sm font-bold text-foreground mb-3 uppercase tracking-wider flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Évolution Temporelle
          </h2>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              {loading ? (
                <Skeleton className="h-64 rounded-lg" />
              ) : timeSeries.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-12">Aucune série temporelle disponible</p>
              ) : (
                <ReactECharts option={trendOption} style={{ height: 280 }} />
              )}
            </CardContent>
          </Card>
        </section>

        {/* ─── Top Worst & Best ─── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Worst */}
          <section>
            <h2 className="text-sm font-bold text-foreground mb-3 uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> 🔴 Top 10 Worst ({dimension})
            </h2>
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                {loading ? (
                  <Skeleton className="h-72 rounded-lg m-4" />
                ) : topWorst.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-12">Aucune donnée</p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2">
                    <div className="p-2">
                      <ReactECharts option={worstBarOption} style={{ height: 300 }} />
                    </div>
                    <div className="overflow-auto max-h-[320px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px]">{dimension}</TableHead>
                            <TableHead className="text-[10px]">QoE</TableHead>
                            <TableHead className="text-[10px]">DL</TableHead>
                            <TableHead className="text-[10px]">RTT</TableHead>
                            <TableHead className="text-[10px]">Δ7j</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {topWorst.map((r, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-[10px] font-medium max-w-[120px] truncate">{r.dimension_2}</TableCell>
                              <TableCell className="text-[10px] font-bold">{fmt(r.qoe_index, 1)}</TableCell>
                              <TableCell className="text-[10px]">{fmt(r.debit_dl, 1)}</TableCell>
                              <TableCell className="text-[10px]">{fmt(r.rtt_data_avg, 0)}</TableCell>
                              <TableCell><DeltaBadge delta={r.delta7j ?? null} orientation="up" /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Best */}
          <section>
            <h2 className="text-sm font-bold text-foreground mb-3 uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 🟢 Top 10 Best ({dimension})
            </h2>
            <Card className="bg-card border-border">
              <CardContent className="p-0 overflow-auto max-h-[360px]">
                {loading ? (
                  <Skeleton className="h-72 rounded-lg m-4" />
                ) : topBest.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-12">Aucune donnée</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">#</TableHead>
                        <TableHead className="text-[10px]">{dimension}</TableHead>
                        <TableHead className="text-[10px]">QoE</TableHead>
                        <TableHead className="text-[10px]">DL (Mbps)</TableHead>
                        <TableHead className="text-[10px]">RTT (ms)</TableHead>
                        <TableHead className="text-[10px]">Sessions</TableHead>
                        <TableHead className="text-[10px]">Loss DL</TableHead>
                        <TableHead className="text-[10px]">Δ7j</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topBest.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-[10px] font-bold text-emerald-600">{i + 1}</TableCell>
                          <TableCell className="text-[10px] font-medium max-w-[140px] truncate">{r.dimension_2}</TableCell>
                          <TableCell className="text-[10px] font-bold">{fmt(r.qoe_index, 1)}</TableCell>
                          <TableCell className="text-[10px]">{fmt(r.debit_dl, 1)}</TableCell>
                          <TableCell className="text-[10px]">{fmt(r.rtt_data_avg, 0)}</TableCell>
                          <TableCell className="text-[10px]">{fmt(r.session_nbr, 0)}</TableCell>
                          <TableCell className="text-[10px]">{fmt(r.loss_dl_rate, 3)}</TableCell>
                          <TableCell><DeltaBadge delta={r.delta7j ?? null} orientation="up" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>
        </div>

        {/* Footer */}
        <div className="text-center text-[10px] text-muted-foreground py-4 border-t border-border">
          PULSE — Performance & User-Level Service Evaluation · Généré le {new Date().toLocaleDateString('fr-FR')} · Données issues de {isLocal ? 'PostgreSQL Local' : 'Lovable Cloud'}
        </div>
      </div>
    </div>
  );
};

export default PulseReportPage;
