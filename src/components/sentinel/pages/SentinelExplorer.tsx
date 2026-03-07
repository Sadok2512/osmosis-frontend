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
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Search, X, Download, AlertCircle, CheckCircle, ArrowUp, ArrowDown,
  Radio, Cpu, TreePine, TrendingUp, GitBranch, Gauge, Activity,
  Signal, Server, Layers, Building2, MapPin, Globe, Wifi,
  ChevronRight, Shield, Zap, Brain, BarChart3, AlertTriangle
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';

interface Props { date: string; apiConnected?: boolean; }

const DIMENSIONS: SentinelDimension[] = ['Cellule', 'Site', 'Bande', 'Vendor', 'DOR', 'Plaque', 'ARCEP', 'RAT'];
const SEVERITIES: SentinelSeverity[] = ['critical', 'major', 'minor'];
const TYPES: AnomalyType[] = ['degradation_soudaine', 'tendance_anormale', 'outlier_vs_peers', 'correlation_croisee'];
const PAGE_SIZE = 1000;

// Detector icons mapping
const DETECTOR_ICONS: Record<string, React.ReactNode> = {
  D1: <Gauge className="w-3 h-3" />,       // Dynamic thresholds
  D2: <TrendingUp className="w-3 h-3" />,  // Trend Analysis
  D3: <TreePine className="w-3 h-3" />,    // Isolation Forest
  D4: <GitBranch className="w-3 h-3" />,   // Correlation multi-KPI
  D5: <Brain className="w-3 h-3" />,       // Clustering
};

// Dimension icons
const DIMENSION_ICONS: Record<string, React.ReactNode> = {
  Cellule: <Radio className="w-3 h-3" />,
  Site: <Server className="w-3 h-3" />,
  Bande: <Layers className="w-3 h-3" />,
  Vendor: <Building2 className="w-3 h-3" />,
  DOR: <MapPin className="w-3 h-3" />,
  Plaque: <Globe className="w-3 h-3" />,
  ARCEP: <Shield className="w-3 h-3" />,
  RAT: <Wifi className="w-3 h-3" />,
};

// Severity badge styles
const SEVERITY_BADGE_STYLES: Record<SentinelSeverity, string> = {
  critical: 'bg-red-600 text-white border-red-700',
  major: 'bg-orange-500 text-white border-orange-600',
  minor: 'bg-blue-500 text-white border-blue-600',
};

// Root cause hypotheses per detector
const ROOT_CAUSE_MAP: Record<string, string[]> = {
  D1: [
    'Seuil dynamique dépassé — dégradation hardware probable',
    'Variation soudaine de charge ou interférence externe',
    'Anomalie de configuration récente possible',
  ],
  D2: [
    'Tendance dégradante sur 7+ jours consécutifs',
    'Corrélation avec événement réseau ou maintenance',
    'Usure progressive d\'un composant (PA, feeder, antenne)',
  ],
  D3: [
    'Entité fortement isolée du cluster de référence',
    'Profil multi-KPI atypique vs pairs de même bande/techno',
    'Possible problème de voisinage ou paramétrage cellule',
  ],
  D4: [
    'Corrélation multi-KPI détectée (latence ↔ pertes ↔ débit)',
    'Probable congestion backhaul ou transport',
    'Impact simultané sur QoE composite et sessions utilisateurs',
  ],
  D5: [
    'Cluster de comportement dégradé identifié',
    'Entité classée dans un groupe à haut risque',
  ],
};

// Mock mini trend data generator with dates
const generateMiniTrend = (baseValue: number, volatility: number, days = 30) => {
  const data: { date: string; value: number }[] = [];
  let val = baseValue;
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    val += (Math.random() - 0.5) * volatility;
    val = Math.max(0, val);
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    data.push({ date: d.toISOString().split('T')[0], value: parseFloat(val.toFixed(2)) });
  }
  return data;
};

// Generate extended mock anomalies
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

// Detect technology from entity name
const detectTechnology = (name: string): 'NR' | 'LTE' | '—' => {
  if (name.includes('NR') || name.includes('N78') || name.includes('N3500') || name.includes('5G')) return 'NR';
  if (name.includes('LTE') || name.includes('B1') || name.includes('B3') || name.includes('B7') || name.includes('B28')) return 'LTE';
  return '—';
};

const SentinelExplorer: React.FC<Props> = ({ date, apiConnected = true }) => {
  const [dimension, setDimension] = useState<SentinelDimension | ''>('');
  const [severity, setSeverity] = useState<SentinelSeverity[]>([]);
  const [types, setTypes] = useState<AnomalyType[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Anomaly | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const filters: AnomalyFilters = {
    date,
    dimension: dimension || undefined,
    severity: severity.length ? severity : undefined,
    type: types.length ? types : undefined,
    search: search || undefined,
    page,
    per_page: PAGE_SIZE,
  };

  const { data: apiAnomalies, isLoading } = useQuery<Anomaly[]>({
    queryKey: ['sentinel-anomalies', filters],
    queryFn: () => fetchAnomalies(filters),
    staleTime: 30_000,
    retry: 0,
    refetchOnWindowFocus: false,
    enabled: apiConnected,
  });

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

  const handleSelectRow = (a: Anomaly) => {
    setSelected(a);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setTimeout(() => setSelected(null), 300);
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

  // Mini chart options for detail panel — line only with date slider
  const miniChartOption = (title: string, data: { date: string; value: number }[], color: string, unit: string) => ({
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: any) => `${params[0].axisValue} — ${params[0].value} ${unit}`,
      backgroundColor: 'hsl(220, 20%, 14%)',
      borderColor: 'hsl(220, 13%, 25%)',
      textStyle: { color: '#fff', fontSize: 10 },
    },
    grid: { left: 4, right: 4, top: 8, bottom: 28, containLabel: false },
    xAxis: {
      type: 'category' as const,
      data: data.map(d => d.date),
      axisLabel: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: { type: 'value' as const, show: false },
    dataZoom: [{
      type: 'slider',
      height: 14,
      bottom: 2,
      start: 60,
      end: 100,
      borderColor: 'transparent',
      backgroundColor: 'hsl(220,13%,91%/0.15)',
      fillerColor: `${color}33`,
      handleSize: '60%',
      handleStyle: { color, borderColor: color },
      textStyle: { fontSize: 8, color: 'hsl(220,9%,46%)' },
      labelFormatter: (val: number) => data[val]?.date?.slice(5) || '',
    }],
    series: [{
      type: 'line' as const,
      data: data.map(d => d.value),
      smooth: true,
      symbol: 'none',
      lineStyle: { color, width: 1.5 },
    }],
  });

  // Generate mock mini trends for selected anomaly
  const miniTrends = useMemo(() => {
    if (!selected) return null;
    return {
      dl: generateMiniTrend(35, 8),
      latency: generateMiniTrend(65, 20),
      dcr: generateMiniTrend(1.2, 0.5),
    };
  }, [selected]);

  // History chart option
  const historyOption = useMemo(() => {
    if (!kpiHistory?.data) return null;
    const dates = kpiHistory.data.map((d: any) => d.date);
    const values = kpiHistory.data.map((d: any) => d.value);
    const anomalyMarkAreas = kpiHistory.data
      .filter((d: any) => d.is_anomaly)
      .map((d: any) => [{ xAxis: d.date }, { xAxis: d.date }]);

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

  const tech = selected ? detectTechnology(selected.dimension_2) : '—';

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex-1 flex flex-col p-4 gap-3">
        {/* Mock banner */}
        {isMock && (
          <div className="px-3 py-1.5 rounded text-[11px] bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            Données de démonstration — Backend FastAPI non connecté
          </div>
        )}

        {/* Filters */}
        <Card className="p-2.5 flex flex-wrap items-center gap-2 shadow-sm">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher entité..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-7 h-7 w-44 text-[11px]"
            />
          </div>

          <select
            value={dimension}
            onChange={e => { setDimension(e.target.value as any); setPage(1); }}
            className="text-[11px] border border-border rounded px-2 py-1 bg-card text-foreground"
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
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${active ? SEVERITY_BADGE_STYLES[s] : 'text-muted-foreground border-border hover:border-foreground/30'}`}
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
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${active ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground border-border hover:border-foreground/30'}`}
                >
                  {ANOMALY_TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>

          <div className="flex-1" />
          <span className="text-[10px] text-muted-foreground font-mono">{anomalies?.length || 0} résultats</span>
          <button onClick={exportCSV} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </Card>

        {/* Main content area */}
        <div className="flex-1 flex gap-0 overflow-hidden">
          {/* Table */}
          <div className={`flex-1 transition-all duration-300 ease-in-out ${panelOpen ? 'mr-0' : ''}`}>
            {isLoading && apiConnected ? (
              <div className="space-y-1.5">{[...Array(12)].map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}</div>
            ) : !anomalies?.length ? (
              <div className="flex-1 flex items-center justify-center h-full">
                <div className="text-center space-y-2">
                  <CheckCircle className="w-8 h-8 mx-auto text-green-500" />
                  <p className="text-sm text-muted-foreground">Aucune anomalie détectée</p>
                </div>
              </div>
            ) : (
              <Card className="h-full overflow-auto shadow-sm border">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                    <tr className="border-b border-border">
                      <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">Dimension</th>
                      <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">Entité</th>
                      <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">Type</th>
                      <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">Sévérité</th>
                      <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">KPI</th>
                      <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">Valeur</th>
                      <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">Réf.</th>
                      <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">Écart</th>
                      <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider w-28">Confiance</th>
                      <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">Détecteur</th>
                      <th className="py-1.5 px-1 w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.map((a, i) => {
                      const isSelected = selected === a;
                      const isCritical = a.severity === 'critical';
                      return (
                        <tr key={i} onClick={() => handleSelectRow(a)}
                          className={`border-b border-border/20 cursor-pointer transition-colors
                            ${isCritical ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-muted/40'}
                            ${isSelected ? 'bg-primary/10 border-l-2 border-l-primary' : ''}`}
                        >
                          <td className="py-1.5 px-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                  {DIMENSION_ICONS[a.dimension_1] || <Radio className="w-3 h-3" />}
                                  <span className="text-[10px]">{a.dimension_1}</span>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-[10px]">Dimension: {a.dimension_1}</TooltipContent>
                            </Tooltip>
                          </td>
                          <td className="py-1.5 px-2 font-mono font-medium text-foreground">{a.dimension_2}</td>
                          <td className="py-1.5 px-2">
                            <span className="text-[9px] text-muted-foreground">{ANOMALY_TYPE_LABELS[a.anomaly_type]}</span>
                          </td>
                          <td className="py-1.5 px-2">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${SEVERITY_BADGE_STYLES[a.severity]}`}>
                              {a.severity === 'critical' && <AlertCircle className="w-2.5 h-2.5" />}
                              {SEVERITY_CONFIG[a.severity].label}
                            </span>
                          </td>
                          <td className="py-1.5 px-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="font-mono text-[10px]">{a.kpi_name}</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-[10px] max-w-48">{a.description}</TooltipContent>
                            </Tooltip>
                          </td>
                          <td className="py-1.5 px-2 font-mono text-right text-foreground">{a.current_value?.toFixed(2)}</td>
                          <td className="py-1.5 px-2 font-mono text-right text-muted-foreground">{a.reference_value?.toFixed(2)}</td>
                          <td className="py-1.5 px-2 font-mono text-right font-semibold" style={{ color: a.deviation_pct < 0 ? 'hsl(0,72%,51%)' : 'hsl(25,95%,53%)' }}>
                            {a.deviation_pct > 0 ? '+' : ''}{a.deviation_pct?.toFixed(1)}%
                          </td>
                          <td className="py-1.5 px-2">
                            <div className="flex items-center gap-1.5">
                              <Progress value={a.confidence * 100} className="h-1.5 w-16 bg-muted" />
                              <span className="text-[9px] text-muted-foreground font-mono w-7 text-right">{(a.confidence * 100).toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="py-1.5 px-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  {DETECTOR_ICONS[a.detector] || <Cpu className="w-3 h-3" />}
                                  <span className="text-[9px]">{DETECTOR_LABELS[a.detector] || a.detector}</span>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-[10px]">{DETECTOR_LABELS[a.detector] || a.detector}</TooltipContent>
                            </Tooltip>
                          </td>
                          <td className="py-1.5 px-1">
                            <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Pagination */}
                <div className="flex items-center justify-between p-2 border-t border-border bg-muted/30">
                  <span className="text-[10px] text-muted-foreground">
                    {anomalies.length} anomalies {isMock ? '(demo)' : `— Page ${page}`}
                  </span>
                  {!isMock && (
                    <div className="flex gap-1.5">
                      <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="text-[10px] px-2 py-0.5 rounded border border-border disabled:opacity-30 hover:bg-muted transition-colors">Précédent</button>
                      <button disabled={(anomalies?.length || 0) < PAGE_SIZE} onClick={() => setPage(p => p + 1)} className="text-[10px] px-2 py-0.5 rounded border border-border disabled:opacity-30 hover:bg-muted transition-colors">Suivant</button>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* Detail side panel */}
          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden border-l border-border bg-card shadow-xl
              ${panelOpen ? 'w-[420px] opacity-100' : 'w-0 opacity-0'}`}
          >
            {selected && (
              <div className="w-[420px] h-full overflow-y-auto">
                {/* Panel header */}
                <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {DIMENSION_ICONS[selected.dimension_1] || <Radio className="w-4 h-4 text-muted-foreground" />}
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-foreground truncate">{selected.dimension_2}</h3>
                      <p className="text-[10px] text-muted-foreground">{selected.dimension_1} · {selected.date_part}</p>
                    </div>
                  </div>
                  <button onClick={closePanel} className="p-1 rounded hover:bg-muted transition-colors">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  {/* Entity info cards */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-center">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Techno</p>
                      <span className={`text-xs font-bold ${tech === 'NR' ? 'text-purple-500' : tech === 'LTE' ? 'text-blue-500' : 'text-muted-foreground'}`}>
                        {tech === 'NR' ? '5G NR' : tech === 'LTE' ? '4G LTE' : '—'}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-center">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Sévérité</p>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${SEVERITY_BADGE_STYLES[selected.severity]}`}>
                        {SEVERITY_CONFIG[selected.severity].label}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-center">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Détecteur</p>
                      <span className="flex items-center justify-center gap-1 text-[10px] text-foreground">
                        {DETECTOR_ICONS[selected.detector]}
                        <span className="font-medium">{selected.detector}</span>
                      </span>
                    </div>
                  </div>

                  {/* KPI anomaly explanation */}
                  <div className="rounded-lg border border-border p-3 space-y-2.5">
                    <h4 className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-primary" />
                      Anomalie KPI
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase">KPI</p>
                        <p className="text-xs font-mono font-medium text-foreground">{selected.kpi_name}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase">Type</p>
                        <p className="text-[10px] text-foreground">{ANOMALY_TYPE_LABELS[selected.anomaly_type]}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded bg-muted/50 p-2 text-center">
                        <p className="text-[8px] text-muted-foreground uppercase">Observé</p>
                        <p className="text-sm font-mono font-bold text-foreground">{selected.current_value?.toFixed(2)}</p>
                      </div>
                      <div className="rounded bg-muted/50 p-2 text-center">
                        <p className="text-[8px] text-muted-foreground uppercase">Attendu</p>
                        <p className="text-sm font-mono font-bold text-muted-foreground">{selected.reference_value?.toFixed(2)}</p>
                      </div>
                      <div className="rounded p-2 text-center" style={{ background: selected.deviation_pct < 0 ? 'hsl(0,72%,51%,0.1)' : 'hsl(25,95%,53%,0.1)' }}>
                        <p className="text-[8px] text-muted-foreground uppercase">Déviation</p>
                        <p className="text-sm font-mono font-bold" style={{ color: selected.deviation_pct < 0 ? 'hsl(0,72%,51%)' : 'hsl(25,95%,53%)' }}>
                          {selected.deviation_pct > 0 ? '+' : ''}{selected.deviation_pct?.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    {/* Confidence bar */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[9px] text-muted-foreground uppercase">Confiance ML</p>
                        <span className="text-[10px] font-mono font-bold text-foreground">{(selected.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <Progress value={selected.confidence * 100} className="h-2" />
                    </div>
                  </div>

                  {/* Description */}
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-[11px] text-foreground leading-relaxed">{selected.description}</p>
                  </div>

                  {/* Root cause hypotheses */}
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <h4 className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      Hypothèses de cause racine
                    </h4>
                    <div className="space-y-1.5">
                      {(ROOT_CAUSE_MAP[selected.detector] || ROOT_CAUSE_MAP.D1).map((cause, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-[10px] text-muted-foreground">
                          <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                          <span>{cause}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Mini KPI trend charts */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5 text-primary" />
                      Tendances KPI (30j)
                    </h4>

                    {miniTrends && (
                      <div className="space-y-2">
                        <div className="rounded-lg border border-border p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] text-muted-foreground uppercase font-medium">DL Throughput (Mbps)</span>
                            <span className="text-[9px] font-mono text-foreground">{miniTrends.dl[miniTrends.dl.length - 1]?.value.toFixed(1)}</span>
                          </div>
                          <ReactECharts option={miniChartOption('DL', miniTrends.dl, 'hsl(217,91%,60%)', 'Mbps')} style={{ height: 80 }} />
                        </div>
                        <div className="rounded-lg border border-border p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] text-muted-foreground uppercase font-medium">Latency (ms)</span>
                            <span className="text-[9px] font-mono text-foreground">{miniTrends.latency[miniTrends.latency.length - 1]?.value.toFixed(0)}</span>
                          </div>
                          <ReactECharts option={miniChartOption('Latency', miniTrends.latency, 'hsl(38,92%,50%)', 'ms')} style={{ height: 80 }} />
                        </div>
                        <div className="rounded-lg border border-border p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] text-muted-foreground uppercase font-medium">Session Drop Rate (%)</span>
                            <span className="text-[9px] font-mono text-foreground">{miniTrends.dcr[miniTrends.dcr.length - 1]?.value.toFixed(2)}</span>
                          </div>
                          <ReactECharts option={miniChartOption('DCR', miniTrends.dcr, 'hsl(0,72%,51%)', '%')} style={{ height: 80 }} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* API-driven charts when connected */}
                  {historyOption && (
                    <div className="rounded-lg border border-border p-2">
                      <p className="text-[10px] font-bold text-foreground mb-1">Historique {selected.kpi_name} (15j)</p>
                      <ReactECharts option={historyOption} style={{ height: 160 }} />
                    </div>
                  )}
                  {radarOption && (
                    <div className="rounded-lg border border-border p-2">
                      <p className="text-[10px] font-bold text-foreground mb-1">Profil des scores</p>
                      <ReactECharts option={radarOption} style={{ height: 180 }} />
                    </div>
                  )}
                  {kpiCompare && (
                    <div className="grid grid-cols-2 gap-2">
                      {['debit_dl', 'rtt_setup_avg', 'qoe_index', 'loss_dl_rate'].map(kpi => {
                        const d7 = kpiCompare.deltas_7j?.[kpi];
                        const d14 = kpiCompare.deltas_14j?.[kpi];
                        return (
                          <div key={kpi} className="rounded-lg border border-border p-2.5">
                            <p className="text-[9px] text-muted-foreground uppercase">{kpi}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-mono text-muted-foreground">Δ7j:</span>
                              {d7 !== undefined && (
                                <span className="text-[10px] font-mono flex items-center gap-0.5" style={{ color: d7 < 0 ? 'hsl(0,72%,51%)' : 'hsl(142,71%,45%)' }}>
                                  {d7 < 0 ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowUp className="w-2.5 h-2.5" />}
                                  {d7?.toFixed(1)}%
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-mono text-muted-foreground">Δ14j:</span>
                              {d14 !== undefined && (
                                <span className="text-[10px] font-mono flex items-center gap-0.5" style={{ color: d14 < 0 ? 'hsl(0,72%,51%)' : 'hsl(142,71%,45%)' }}>
                                  {d14 < 0 ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowUp className="w-2.5 h-2.5" />}
                                  {d14?.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {kpiCompare?.trends && (
                    <div className="flex flex-wrap gap-1.5">
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
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default SentinelExplorer;
