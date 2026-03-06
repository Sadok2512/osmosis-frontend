import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchKPIHistory, fetchDimensionValues, fetchAnomalies } from '../sentinelApi';
import { Anomaly, SEVERITY_CONFIG, ANOMALY_TYPE_LABELS, KPIHistoryData } from '../types';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Search } from 'lucide-react';
import ReactECharts from 'echarts-for-react';

interface Props { date: string; }

const KPI_LINES = [
  { kpi: 'debit_dl', label: 'Débit DL', color: 'hsl(217,91%,60%)', unit: 'Mbps' },
  { kpi: 'rtt_setup_avg', label: 'RTT Setup', color: 'hsl(38,92%,50%)', unit: 'ms' },
  { kpi: 'qoe_index', label: 'QoE Index', color: 'hsl(142,71%,45%)', unit: '%' },
  { kpi: 'loss_dl_rate', label: 'Loss DL', color: 'hsl(0,72%,51%)', unit: '%' },
];

const SentinelTemporal: React.FC<Props> = ({ date }) => {
  const [searchText, setSearchText] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<{ dim1: string; dim2: string } | null>(null);
  const [enabledKpis, setEnabledKpis] = useState<Record<string, boolean>>(
    Object.fromEntries(KPI_LINES.map(k => [k.kpi, true]))
  );
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSearch = useCallback(async (val: string) => {
    setSearchText(val);
    if (val.length >= 2) {
      try {
        const results = await fetchDimensionValues('Cellule', val);
        setSuggestions(results.slice(0, 10));
        setShowSuggestions(true);
      } catch { setSuggestions([]); }
    } else {
      setShowSuggestions(false);
    }
  }, []);

  const selectEntity = (name: string) => {
    setSelectedEntity({ dim1: 'Cellule', dim2: name });
    setSearchText(name);
    setShowSuggestions(false);
  };

  const dim1 = selectedEntity?.dim1 || '';
  const dim2 = selectedEntity?.dim2 || '';
  const hasEntity = !!selectedEntity;

  // Fixed number of useQuery calls — always 4
  const q0 = useQuery<KPIHistoryData>({
    queryKey: ['sentinel-temporal', dim1, dim2, KPI_LINES[0].kpi],
    queryFn: () => fetchKPIHistory(dim1, dim2, KPI_LINES[0].kpi),
    enabled: hasEntity && enabledKpis[KPI_LINES[0].kpi],
    staleTime: 30_000, retry: 1,
  });
  const q1 = useQuery<KPIHistoryData>({
    queryKey: ['sentinel-temporal', dim1, dim2, KPI_LINES[1].kpi],
    queryFn: () => fetchKPIHistory(dim1, dim2, KPI_LINES[1].kpi),
    enabled: hasEntity && enabledKpis[KPI_LINES[1].kpi],
    staleTime: 30_000, retry: 1,
  });
  const q2 = useQuery<KPIHistoryData>({
    queryKey: ['sentinel-temporal', dim1, dim2, KPI_LINES[2].kpi],
    queryFn: () => fetchKPIHistory(dim1, dim2, KPI_LINES[2].kpi),
    enabled: hasEntity && enabledKpis[KPI_LINES[2].kpi],
    staleTime: 30_000, retry: 1,
  });
  const q3 = useQuery<KPIHistoryData>({
    queryKey: ['sentinel-temporal', dim1, dim2, KPI_LINES[3].kpi],
    queryFn: () => fetchKPIHistory(dim1, dim2, KPI_LINES[3].kpi),
    enabled: hasEntity && enabledKpis[KPI_LINES[3].kpi],
    staleTime: 30_000, retry: 1,
  });
  const historyQueries = [q0, q1, q2, q3];

  const { data: entityAnomalies } = useQuery<Anomaly[]>({
    queryKey: ['sentinel-temporal-anomalies', dim2, date],
    queryFn: () => fetchAnomalies({ date, search: dim2 }),
    enabled: hasEntity,
    staleTime: 30_000,
  });

  const anyLoading = historyQueries.some(q => q.isLoading);

  const chartOption = useMemo(() => {
    const xDates: string[] = [];
    const seriesData: any[] = [];

    KPI_LINES.forEach((kl, idx) => {
      if (!enabledKpis[kl.kpi]) return;
      const qData = historyQueries[idx].data;
      if (!qData?.data) return;
      if (xDates.length === 0) qData.data.forEach(d => xDates.push(d.date));
      seriesData.push({
        name: kl.label, type: 'line', smooth: true,
        data: qData.data.map(d => d.value),
        lineStyle: { color: kl.color, width: 2 },
        itemStyle: { color: kl.color },
        yAxisIndex: idx === 3 ? 1 : 0,
      });
    });

    const anomalyDates = new Set<string>();
    entityAnomalies?.forEach(a => anomalyDates.add(a.date_part));
    const markAreas = Array.from(anomalyDates).map(d => [{ xAxis: d }, { xAxis: d }]);
    if (seriesData.length > 0 && markAreas.length > 0) {
      seriesData[0].markArea = { itemStyle: { color: 'hsl(0,72%,51%/0.1)' }, data: markAreas };
    }

    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, textStyle: { fontSize: 10, color: 'hsl(220,9%,46%)' } },
      grid: { left: 55, right: 55, top: 20, bottom: 45 },
      xAxis: { type: 'category', data: xDates, axisLabel: { fontSize: 9, rotate: 30 } },
      yAxis: [
        { type: 'value', name: 'Valeur', axisLabel: { fontSize: 9 }, nameTextStyle: { fontSize: 9 } },
        { type: 'value', name: 'Loss %', axisLabel: { fontSize: 9 }, nameTextStyle: { fontSize: 9 }, position: 'right' },
      ],
      series: seriesData,
    };
  }, [q0.data, q1.data, q2.data, q3.data, enabledKpis, entityAnomalies]);

  return (
    <div className="p-6 space-y-4">
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher une entité (ex: PARIS_MONTMARTRE)..."
          value={searchText}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          className="pl-9 text-sm"
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
            {suggestions.map(s => (
              <button key={s} onClick={() => selectEntity(s)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {!hasEntity ? (
        <div className="flex-1 flex items-center justify-center py-20">
          <p className="text-sm text-muted-foreground">Sélectionnez une entité pour visualiser l'analyse temporelle</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4">
            {KPI_LINES.map(kl => (
              <label key={kl.kpi} className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={enabledKpis[kl.kpi]}
                  onCheckedChange={checked => setEnabledKpis(prev => ({ ...prev, [kl.kpi]: !!checked }))}
                />
                <span className="text-xs font-medium" style={{ color: kl.color }}>{kl.label}</span>
              </label>
            ))}
          </div>

          <Card className="p-4">
            {anyLoading ? <Skeleton className="h-72 rounded-lg" /> : <ReactECharts option={chartOption} style={{ height: 300 }} />}
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {KPI_LINES.map((kl, idx) => {
              const qData = historyQueries[idx].data;
              const lastVal = qData?.data?.[qData.data.length - 1]?.value;
              return (
                <Card key={kl.kpi} className="p-3">
                  <p className="text-[10px] text-muted-foreground uppercase">{kl.label}</p>
                  <p className="text-lg font-bold mt-1" style={{ color: kl.color }}>
                    {lastVal !== undefined ? lastVal.toFixed(2) : '—'} <span className="text-[10px] text-muted-foreground">{kl.unit}</span>
                  </p>
                </Card>
              );
            })}
          </div>

          {entityAnomalies && entityAnomalies.length > 0 && (
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Anomalies détectées ({entityAnomalies.length})
              </p>
              <div className="overflow-x-auto max-h-48">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border">
                      {['Date', 'Type', 'Sévérité', 'KPI', 'Écart%', 'Détecteur'].map(h => (
                        <th key={h} className="text-left py-2 px-2 font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entityAnomalies.map((a, i) => {
                      const sev = SEVERITY_CONFIG[a.severity];
                      return (
                        <tr key={i} className="border-b border-border/30">
                          <td className="py-1.5 px-2">{a.date_part}</td>
                          <td className="py-1.5 px-2"><Badge variant="outline" className="text-[9px]">{ANOMALY_TYPE_LABELS[a.anomaly_type]}</Badge></td>
                          <td className="py-1.5 px-2"><Badge className="text-[9px]" style={{ background: sev.bg, color: sev.color, border: 'none' }}>{sev.label}</Badge></td>
                          <td className="py-1.5 px-2 font-mono">{a.kpi_name}</td>
                          <td className="py-1.5 px-2 font-mono" style={{ color: a.deviation_pct < 0 ? 'hsl(0,72%,51%)' : 'hsl(142,71%,45%)' }}>
                            {a.deviation_pct > 0 ? '+' : ''}{a.deviation_pct?.toFixed(1)}%
                          </td>
                          <td className="py-1.5 px-2 text-muted-foreground">{a.detector}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default SentinelTemporal;
