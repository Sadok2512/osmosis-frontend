import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAnomalies, fetchKPIHistory, fetchKPICompare } from '../sentinelApi';
import {
  Anomaly, AnomalyFilters, SEVERITY_CONFIG, ANOMALY_TYPE_LABELS,
  DETECTOR_LABELS, TREND_LABELS, SentinelDimension, SentinelSeverity, AnomalyType,
  KPICompareData
} from '../types';
import { MOCK_ANOMALIES } from '../mockSentinelData';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Search, X, Download, AlertCircle, CheckCircle, ArrowUp, ArrowDown } from 'lucide-react';
import ReactECharts from 'echarts-for-react';

interface Props { date: string; apiConnected?: boolean; }

const DIMENSIONS: SentinelDimension[] = ['Cellule', 'Site', 'Bande', 'Vendor', 'DOR', 'Plaque', 'ARCEP', 'RAT'];
const SEVERITIES: SentinelSeverity[] = ['critical', 'major', 'minor'];
const TYPES: AnomalyType[] = ['degradation_soudaine', 'tendance_anormale', 'outlier_vs_peers', 'correlation_croisee'];
const PAGE_SIZE = 1000;

// Generate extended mock anomalies for demo
const EXTENDED_MOCK: Anomaly[] = [
  ...MOCK_ANOMALIES,
  { date_part: '2025-12-02', dimension_1: 'Site', dimension_2: 'NICE_NORD_07', anomaly_type: 'degradation_soudaine', severity: 'major', kpi_name: 'debit_ul', current_value: 2.1, reference_value: 18.5, deviation_pct: -88.6, detector: 'D1', confidence: 0.86, description: 'Débit UL effondré sur le site' },
  { date_part: '2025-12-02', dimension_1: 'Cellule', dimension_2: 'REN_LTE_B28_004', anomaly_type: 'tendance_anormale', severity: 'minor', kpi_name: 'instability_rate', current_value: 0.28, reference_value: 0.06, deviation_pct: 366.7, detector: 'D2', confidence: 0.79, description: 'Instabilité RAT croissante' },
  { date_part: '2025-12-02', dimension_1: 'DOR', dimension_2: 'DOR_SUD_OUEST', anomaly_type: 'correlation_croisee', severity: 'major', kpi_name: 'qoe_index', current_value: 45.2, reference_value: 72.8, deviation_pct: -37.9, detector: 'D4', confidence: 0.83, description: 'Corrélation QoE-latence-perte' },
  { date_part: '2025-12-02', dimension_1: 'Cellule', dimension_2: 'STR_NR_N78_002', anomaly_type: 'outlier_vs_peers', severity: 'major', kpi_name: 'session_dcr', current_value: 5.4, reference_value: 0.8, deviation_pct: 575.0, detector: 'D3', confidence: 0.87, description: 'DCR très supérieur aux pairs NR' },
  { date_part: '2025-12-02', dimension_1: 'Bande', dimension_2: 'NR3500', anomaly_type: 'tendance_anormale', severity: 'minor', kpi_name: 'fallback_5G_to_4G_rate', current_value: 0.42, reference_value: 0.12, deviation_pct: 250.0, detector: 'D2', confidence: 0.76, description: 'Fallback 5G→4G en hausse sur N3500' },
  { date_part: '2025-12-02', dimension_1: 'Cellule', dimension_2: 'LIL_LTE_B7_011', anomaly_type: 'degradation_soudaine', severity: 'critical', kpi_name: 'loss_dl_rate', current_value: 0.08, reference_value: 0.005, deviation_pct: 1500.0, detector: 'D1', confidence: 0.95, description: 'Pertes DL critiques' },
  { date_part: '2025-12-02', dimension_1: 'Vendor', dimension_2: 'Nokia', anomaly_type: 'correlation_croisee', severity: 'minor', kpi_name: 'tcp_retr_rate_dl', current_value: 0.045, reference_value: 0.015, deviation_pct: 200.0, detector: 'D4', confidence: 0.74, description: 'Retransmission corrélée vendor Nokia' },
  { date_part: '2025-12-02', dimension_1: 'Cellule', dimension_2: 'BOR_NR_B1_006', anomaly_type: 'outlier_vs_peers', severity: 'major', kpi_name: 'rtt_data_avg', current_value: 195000, reference_value: 55000, deviation_pct: 254.5, detector: 'D3', confidence: 0.84, description: 'Latence data très élevée vs pairs' },
];

const SentinelExplorer: React.FC<Props> = ({ date, apiConnected = true }) => {
  const [dimension, setDimension] = useState<SentinelDimension | ''>('');
  const [severity, setSeverity] = useState<SentinelSeverity[]>([]);
  const [types, setTypes] = useState<AnomalyType[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Anomaly | null>(null);

  const filters: AnomalyFilters = {
    date,
    dimension: dimension || undefined,
    severity: severity.length ? severity : undefined,
    type: types.length ? types : undefined,
    search: search || undefined,
    page,
    per_page: PAGE_SIZE,
  };

  const { data: apiAnomalies, isLoading, error } = useQuery<Anomaly[]>({
    queryKey: ['sentinel-anomalies', filters],
    queryFn: () => fetchAnomalies(filters),
    staleTime: 30_000,
    retry: 0,
    refetchOnWindowFocus: false,
    enabled: apiConnected,
  });

  // Use mock data when API is not connected
  const anomalies = useMemo(() => {
    if (apiAnomalies) return apiAnomalies;
    if (!apiConnected) {
      let filtered = [...EXTENDED_MOCK];
      if (dimension) filtered = filtered.filter(a => a.dimension_1 === dimension);
      if (severity.length) filtered = filtered.filter(a => severity.includes(a.severity));
      if (types.length) filtered = filtered.filter(a => types.includes(a.anomaly_type));
      if (search) filtered = filtered.filter(a => a.dimension_2.toLowerCase().includes(search.toLowerCase()));
      return filtered;
    }
    return [];
  }, [apiAnomalies, apiConnected, dimension, severity, types, search]);

  const isMock = !apiAnomalies && !apiConnected;

  // Detail panel queries
  const { data: kpiHistory } = useQuery({
    queryKey: ['sentinel-kpi-history', selected?.dimension_1, selected?.dimension_2, selected?.kpi_name],
    queryFn: () => fetchKPIHistory(selected!.dimension_1, selected!.dimension_2, selected!.kpi_name),
    enabled: !!selected && apiConnected,
    staleTime: 30_000,
  });

  const { data: kpiCompare } = useQuery<KPICompareData>({
    queryKey: ['sentinel-kpi-compare', selected?.dimension_2, date],
    queryFn: () => fetchKPICompare(selected!.dimension_2, date),
    enabled: !!selected && apiConnected,
    staleTime: 30_000,
  });

  const toggleSeverity = (s: SentinelSeverity) => {
    setSeverity(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
    setPage(1);
  };
  const toggleType = (t: AnomalyType) => {
    setTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    setPage(1);
  };

  const exportCSV = () => {
    if (!anomalies?.length) return;
    const headers = ['Date', 'Dimension', 'Nom', 'Type', 'Sévérité', 'KPI', 'Valeur', 'Référence', 'Écart%', 'Détecteur', 'Confiance'];
    const rows = anomalies.map(a => [a.date_part, a.dimension_1, a.dimension_2, a.anomaly_type, a.severity, a.kpi_name, a.current_value, a.reference_value, a.deviation_pct, a.detector, a.confidence]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `sentinel_anomalies_${date}.csv`; a.click();
  };

  // History chart option
  const historyOption = useMemo(() => {
    if (!kpiHistory?.data) return null;
    const dates = kpiHistory.data.map(d => d.date);
    const values = kpiHistory.data.map(d => d.value);
    const anomalyMarkAreas = kpiHistory.data
      .filter(d => d.is_anomaly)
      .map(d => [{ xAxis: d.date }, { xAxis: d.date }]);

    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 50, right: 20, top: 20, bottom: 30 },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 9, rotate: 30 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 9 } },
      series: [{
        type: 'line', data: values, smooth: true,
        lineStyle: { color: 'hsl(217,91%,60%)', width: 2 },
        itemStyle: { color: 'hsl(217,91%,60%)' },
        areaStyle: { color: 'hsl(217,91%,60%/0.1)' },
        markArea: anomalyMarkAreas.length ? {
          itemStyle: { color: 'hsl(0,72%,51%/0.15)' },
          data: anomalyMarkAreas,
        } : undefined,
      }],
    };
  }, [kpiHistory]);

  // Radar option
  const radarOption = useMemo(() => {
    if (!kpiCompare?.scores) return null;
    const indicator = [
      { name: 'Débit', max: 1 }, { name: 'Latence', max: 1 }, { name: 'Loss', max: 1 },
      { name: 'Retrans.', max: 1 }, { name: 'Stabilité', max: 1 }, { name: 'Drop', max: 1 }, { name: 'DMS', max: 1 },
    ];
    const values = [
      kpiCompare.scores.debit, kpiCompare.scores.latence, kpiCompare.scores.loss,
      kpiCompare.scores.retr, kpiCompare.scores.stabilite, kpiCompare.scores.drop, kpiCompare.scores.dms,
    ];
    return {
      tooltip: {},
      radar: { indicator, radius: '65%', axisName: { fontSize: 9, color: 'hsl(220,9%,46%)' } },
      series: [{ type: 'radar', data: [{ value: values, name: 'Scores', areaStyle: { color: 'hsl(217,91%,60%/0.2)' }, lineStyle: { color: 'hsl(217,91%,60%)' } }] }],
    };
  }, [kpiCompare]);

  return (
    <div className="flex-1 flex flex-col p-4 gap-4">
      {/* Mock banner */}
      {isMock && (
        <div className="px-3 py-2 rounded-md text-xs bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center gap-2">
          ⚠ Données de démonstration — Backend FastAPI non connecté
        </div>
      )}

      {/* Filters */}
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-7 h-8 w-48 text-xs"
          />
        </div>

        <select
          value={dimension}
          onChange={e => { setDimension(e.target.value as any); setPage(1); }}
          className="text-xs border border-border rounded-md px-2 py-1.5 bg-card"
        >
          <option value="">Toutes dimensions</option>
          {DIMENSIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <div className="flex gap-1">
          {SEVERITIES.map(s => {
            const cfg = SEVERITY_CONFIG[s];
            const active = severity.includes(s);
            return (
              <button key={s} onClick={() => toggleSeverity(s)}
                className="px-2 py-1 rounded text-[10px] font-medium border transition-all"
                style={{
                  background: active ? cfg.bg : 'transparent',
                  color: active ? cfg.color : 'hsl(220,9%,46%)',
                  borderColor: active ? cfg.color : 'hsl(220,13%,91%)',
                }}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-1">
          {TYPES.map(t => {
            const active = types.includes(t);
            return (
              <button key={t} onClick={() => toggleType(t)}
                className="px-2 py-1 rounded text-[10px] font-medium border transition-all"
                style={{
                  background: active ? 'hsl(220,40%,18%)' : 'transparent',
                  color: active ? 'hsl(0,0%,100%)' : 'hsl(220,9%,46%)',
                  borderColor: active ? 'hsl(220,40%,18%)' : 'hsl(220,13%,91%)',
                }}
              >
                {ANOMALY_TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />
        <button onClick={exportCSV} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </Card>

      {/* Table */}
      {isLoading && apiConnected ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
      ) : !anomalies?.length ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <CheckCircle className="w-8 h-8 mx-auto text-[hsl(142,71%,45%)]" />
            <p className="text-sm text-muted-foreground">Aucune anomalie détectée</p>
          </div>
        </div>
      ) : (
        <Card className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border">
                {['Date', 'Dimension', 'Nom', 'Type', 'Sévérité', 'KPI', 'Valeur', 'Réf.', 'Écart%', 'Confiance', 'Détecteur'].map(h => (
                  <th key={h} className="text-left py-2 px-2 font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {anomalies.map((a, i) => {
                const sev = SEVERITY_CONFIG[a.severity];
                return (
                  <tr key={i} onClick={() => setSelected(a)}
                    className="border-b border-border/30 hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-2 text-muted-foreground">{a.date_part}</td>
                    <td className="py-2 px-2">{a.dimension_1}</td>
                    <td className="py-2 px-2 font-medium">{a.dimension_2}</td>
                    <td className="py-2 px-2">
                      <Badge variant="outline" className="text-[9px]">{ANOMALY_TYPE_LABELS[a.anomaly_type]}</Badge>
                    </td>
                    <td className="py-2 px-2">
                      <Badge className="text-[9px]" style={{ background: sev.bg, color: sev.color, border: 'none' }}>{sev.label}</Badge>
                    </td>
                    <td className="py-2 px-2 font-mono">{a.kpi_name}</td>
                    <td className="py-2 px-2 font-mono text-right">{a.current_value?.toFixed(2)}</td>
                    <td className="py-2 px-2 font-mono text-right text-muted-foreground">{a.reference_value?.toFixed(2)}</td>
                    <td className="py-2 px-2 font-mono text-right" style={{ color: a.deviation_pct < 0 ? 'hsl(0,72%,51%)' : 'hsl(142,71%,45%)' }}>
                      {a.deviation_pct > 0 ? '+' : ''}{a.deviation_pct?.toFixed(1)}%
                    </td>
                    <td className="py-2 px-2 text-right">{(a.confidence * 100).toFixed(0)}%</td>
                    <td className="py-2 px-2 text-muted-foreground">{DETECTOR_LABELS[a.detector] || a.detector}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="flex items-center justify-between p-2 border-t border-border">
            <span className="text-xs text-muted-foreground">
              {anomalies.length} anomalies {isMock ? '(demo)' : `— Page ${page}`}
            </span>
            {!isMock && (
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="text-xs px-2 py-1 rounded border border-border disabled:opacity-30">Précédent</button>
                <button disabled={(anomalies?.length || 0) < PAGE_SIZE} onClick={() => setPage(p => p + 1)} className="text-xs px-2 py-1 rounded border border-border disabled:opacity-30">Suivant</button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Detail slide-over */}
      <Sheet open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span>{selected.dimension_2}</span>
                  <Badge className="text-[9px]" style={{
                    background: SEVERITY_CONFIG[selected.severity].bg,
                    color: SEVERITY_CONFIG[selected.severity].color,
                    border: 'none',
                  }}>
                    {SEVERITY_CONFIG[selected.severity].label}
                  </Badge>
                </SheetTitle>
                <p className="text-xs text-muted-foreground">{selected.dimension_1} · {selected.date_part}</p>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                {historyOption && (
                  <div>
                    <p className="text-xs font-semibold mb-2">Historique {selected.kpi_name} (15j)</p>
                    <ReactECharts option={historyOption} style={{ height: 180 }} />
                  </div>
                )}
                {radarOption && (
                  <div>
                    <p className="text-xs font-semibold mb-2">Profil des scores</p>
                    <ReactECharts option={radarOption} style={{ height: 200 }} />
                  </div>
                )}
                {kpiCompare && (
                  <div className="grid grid-cols-2 gap-2">
                    {['debit_dl', 'rtt_setup_avg', 'qoe_index', 'loss_dl_rate'].map(kpi => {
                      const d7 = kpiCompare.deltas_7j?.[kpi];
                      const d14 = kpiCompare.deltas_14j?.[kpi];
                      return (
                        <Card key={kpi} className="p-3">
                          <p className="text-[10px] text-muted-foreground uppercase">{kpi}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-mono">Δ7j:</span>
                            {d7 !== undefined && (
                              <span className="text-xs font-mono flex items-center gap-0.5" style={{ color: d7 < 0 ? 'hsl(0,72%,51%)' : 'hsl(142,71%,45%)' }}>
                                {d7 < 0 ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                                {d7?.toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs font-mono">Δ14j:</span>
                            {d14 !== undefined && (
                              <span className="text-xs font-mono flex items-center gap-0.5" style={{ color: d14 < 0 ? 'hsl(0,72%,51%)' : 'hsl(142,71%,45%)' }}>
                                {d14 < 0 ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                                {d14?.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
                {kpiCompare?.trends && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(kpiCompare.trends).map(([kpi, trend]) => {
                      const cfg = TREND_LABELS[trend];
                      if (!cfg) return null;
                      return (
                        <Badge key={kpi} variant="outline" className="text-[9px] gap-1" style={{ color: cfg.color }}>
                          {cfg.icon} {kpi}: {cfg.label}
                        </Badge>
                      );
                    })}
                  </div>
                )}
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">{selected.description}</p>
                </Card>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default SentinelExplorer;
