import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchOverview } from '../sentinelApi';
import { SEVERITY_CONFIG, ANOMALY_TYPE_LABELS, type DashboardOverviewData } from '../types';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Shield, AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react';
import ReactECharts from 'echarts-for-react';

interface Props { date: string; apiConnected?: boolean; }

const SentinelOverview: React.FC<Props> = ({ date, apiConnected = true }) => {
  const { data, isLoading, isFetching, error } = useQuery<DashboardOverviewData>({
    queryKey: ['sentinel-overview', date],
    queryFn: () => fetchOverview(date),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 0,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    enabled: apiConnected && !!date,
  });

  console.log('[SentinelOverview] state:', { isLoading, isFetching, error: error?.message, hasData: !!data, date, apiConnected });

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <AlertCircle className="w-10 h-10 mx-auto text-destructive" />
          <p className="text-sm font-medium">Impossible de contacter l'API Sentinel</p>
          <p className="text-xs text-muted-foreground">Vérifiez que le backend FastAPI tourne sur localhost:1000</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Note : la preview cloud ne peut pas accéder à localhost. Testez en local ou utilisez un tunnel (ngrok).</p>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Anomalies', value: data.total_anomalies, icon: <Shield className="w-5 h-5" />, color: 'text-foreground', bg: 'bg-muted' },
    { label: 'Critiques', value: data.critical, icon: <AlertTriangle className="w-5 h-5" />, color: 'text-[hsl(0,72%,51%)]', bg: 'bg-[hsl(0,72%,51%/0.1)]' },
    { label: 'Majeures', value: data.major, icon: <AlertCircle className="w-5 h-5" />, color: 'text-[hsl(38,92%,50%)]', bg: 'bg-[hsl(38,92%,50%/0.1)]' },
    { label: 'Mineures', value: data.minor, icon: <Info className="w-5 h-5" />, color: 'text-[hsl(217,91%,60%)]', bg: 'bg-[hsl(217,91%,60%/0.1)]' },
  ];

  // Donut chart: anomalies by type
  const donutData = data.anomalies_by_type
    ? Object.entries(data.anomalies_by_type).filter(([, val]) => val > 0).map(([key, val]) => ({
        name: ANOMALY_TYPE_LABELS[key as keyof typeof ANOMALY_TYPE_LABELS] || key,
        value: val,
      }))
    : [];

  const donutOption = {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: 'hsl(220, 9%, 46%)', fontSize: 10 } },
    series: [{
      type: 'pie', radius: ['45%', '72%'], center: ['50%', '45%'],
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 12, fontWeight: 'bold' } },
      data: donutData,
      itemStyle: { borderRadius: 6, borderWidth: 2, borderColor: 'transparent' },
      color: ['hsl(0,72%,51%)', 'hsl(38,92%,50%)', 'hsl(258,90%,66%)', 'hsl(217,91%,60%)'],
    }],
  };

  // Bar chart: anomalies by dimension
  const barDimensions = (data.anomalies_by_dimension || []).sort((a, b) => b.count - a.count);
  const barOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 100, right: 20, top: 10, bottom: 30 },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: 'hsl(220,13%,91%/0.3)' } } },
    yAxis: {
      type: 'category',
      data: barDimensions.map(d => d.dimension),
      axisLabel: { fontSize: 10, color: 'hsl(220,9%,46%)' },
      inverse: true,
    },
    series: [{
      type: 'bar', data: barDimensions.map(d => d.count),
      itemStyle: { color: 'hsl(0,72%,51%)', borderRadius: [0, 4, 4, 0] },
      barWidth: 16,
    }],
  };

  return (
    <div className="p-6 space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(card => (
          <Card key={card.label} className="p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${card.bg}`}>
              <span className={card.color}>{card.icon}</span>
            </div>
            <div>
              <p className="text-2xl font-bold">{card.value}</p>
              <p className="text-xs text-muted-foreground">{card.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Anomalies par type</p>
          <ReactECharts option={donutOption} style={{ height: 250 }} />
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Anomalies par dimension</p>
          <ReactECharts option={barOption} style={{ height: 250 }} />
        </Card>
      </div>

      {/* Top 10 degraded */}
      <Card className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Top 10 entités dégradées</p>
        {data.top_degraded.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
            <CheckCircle className="w-5 h-5 text-[hsl(142,71%,45%)]" />
            <span className="text-sm">Aucune anomalie détectée</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground">Nom</th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground">Dimension</th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground">Sévérité</th>
                  <th className="text-right py-2 px-2 font-medium text-muted-foreground">QoE Index</th>
                  <th className="text-right py-2 px-2 font-medium text-muted-foreground">Débit DL</th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground">Problème</th>
                </tr>
              </thead>
              <tbody>
                {data.top_degraded.slice(0, 10).map((row, i) => {
                  const sev = SEVERITY_CONFIG[row.severity];
                  return (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 px-2 font-medium">{row.dimension_2}</td>
                      <td className="py-2 px-2 text-muted-foreground">{row.dimension_1}</td>
                      <td className="py-2 px-2">
                        <Badge className="text-[10px]" style={{ background: sev.bg, color: sev.color, border: 'none' }}>
                          {sev.label}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-right font-mono">{row.qoe_index?.toFixed(1)}</td>
                      <td className="py-2 px-2 text-right font-mono">{row.debit_dl?.toFixed(1)}</td>
                      <td className="py-2 px-2 text-muted-foreground">{row.main_issue}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default SentinelOverview;
