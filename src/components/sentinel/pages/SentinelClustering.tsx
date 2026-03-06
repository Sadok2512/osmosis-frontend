import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchClusters, fetchClusterMembers } from '../sentinelApi';
import { ClusterData, ClusterMember, CLUSTER_COLORS, SentinelDimension } from '../types';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { cn } from '@/lib/utils';

interface Props { date: string; }

const DIMS: SentinelDimension[] = ['Cellule', 'Site', 'Bande', 'Vendor', 'DOR', 'Plaque'];

const SentinelClustering: React.FC<Props> = ({ date }) => {
  const [dimension, setDimension] = useState<SentinelDimension>('Cellule');
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);

  const { data: clusters, isLoading, error } = useQuery<ClusterData[]>({
    queryKey: ['sentinel-clusters', date, dimension],
    queryFn: () => fetchClusters(date, dimension),
    staleTime: 30_000,
    retry: 1,
  });

  const { data: members } = useQuery<ClusterMember[]>({
    queryKey: ['sentinel-cluster-members', selectedCluster, date, dimension],
    queryFn: () => fetchClusterMembers(selectedCluster!, date, dimension),
    enabled: selectedCluster !== null,
    staleTime: 30_000,
  });

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <AlertCircle className="w-10 h-10 mx-auto text-destructive" />
          <p className="text-sm">API Sentinel non disponible</p>
          <p className="text-xs text-muted-foreground">Vérifiez la connexion à localhost:1000</p>
        </div>
      </div>
    );
  }

  // Scatter plot
  const scatterOption = clusters ? {
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => `${p.data[3]}<br/>Débit: ${p.data[0].toFixed(2)}<br/>Latence: ${p.data[1].toFixed(2)}<br/>${p.data[4]} membres`,
    },
    grid: { left: 50, right: 20, top: 20, bottom: 40 },
    xAxis: { name: 'Score Débit', nameLocation: 'center', nameGap: 25, type: 'value', min: 0, max: 1, axisLabel: { fontSize: 9 } },
    yAxis: { name: 'Score Latence', nameLocation: 'center', nameGap: 35, type: 'value', min: 0, max: 1, axisLabel: { fontSize: 9 } },
    series: clusters.map(c => ({
      type: 'scatter',
      name: c.cluster_label,
      symbolSize: Math.max(10, Math.min(40, c.cluster_size / 2)),
      data: [[c.centroid.score_debit, c.centroid.score_latence, c.cluster_size, c.cluster_label, c.cluster_size]],
      itemStyle: { color: CLUSTER_COLORS[c.cluster_label.toLowerCase()] || 'hsl(220,9%,46%)' },
    })),
  } : null;

  // Radar overlay
  const radarOption = clusters ? {
    tooltip: {},
    legend: { bottom: 0, textStyle: { fontSize: 9, color: 'hsl(220,9%,46%)' } },
    radar: {
      indicator: [
        { name: 'Débit', max: 1 }, { name: 'Latence', max: 1 }, { name: 'Loss', max: 1 },
        { name: 'Retrans.', max: 1 }, { name: 'Stabilité', max: 1 }, { name: 'Drop', max: 1 }, { name: 'DMS', max: 1 },
      ],
      radius: '60%',
      axisName: { fontSize: 9, color: 'hsl(220,9%,46%)' },
    },
    series: [{
      type: 'radar',
      data: clusters.map(c => ({
        value: [c.centroid.score_debit, c.centroid.score_latence, c.centroid.score_loss, c.centroid.score_retr, c.centroid.score_stabilite, c.centroid.score_drop, c.centroid.score_dms],
        name: c.cluster_label,
        lineStyle: { color: CLUSTER_COLORS[c.cluster_label.toLowerCase()] || 'hsl(220,9%,46%)' },
        areaStyle: { color: (CLUSTER_COLORS[c.cluster_label.toLowerCase()] || 'hsl(220,9%,46%)') + '33' },
      })),
    }],
  } : null;

  return (
    <div className="p-6 space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <select
          value={dimension}
          onChange={e => { setDimension(e.target.value as SentinelDimension); setSelectedCluster(null); }}
          className="text-xs border border-border rounded-md px-2 py-1.5 bg-card"
        >
          {DIMS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-5 gap-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : (
        <>
          {/* Cluster summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {clusters?.map(c => {
              const color = CLUSTER_COLORS[c.cluster_label.toLowerCase()] || 'hsl(220,9%,46%)';
              const isActive = selectedCluster === c.cluster_id;
              return (
                <Card
                  key={c.cluster_id}
                  onClick={() => setSelectedCluster(isActive ? null : c.cluster_id)}
                  className={cn('p-3 cursor-pointer transition-all border-2', isActive ? 'border-current' : 'border-transparent hover:border-border')}
                  style={{ borderColor: isActive ? color : undefined }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                    <span className="text-xs font-semibold">{c.cluster_label}</span>
                  </div>
                  <p className="text-xl font-bold">{c.cluster_size}</p>
                  <p className="text-[10px] text-muted-foreground">entités</p>
                </Card>
              );
            })}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scatterOption && (
              <Card className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Scatter — Débit vs Latence</p>
                <ReactECharts option={scatterOption} style={{ height: 280 }} />
              </Card>
            )}
            {radarOption && (
              <Card className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Profils clusters</p>
                <ReactECharts option={radarOption} style={{ height: 280 }} />
              </Card>
            )}
          </div>

          {/* Members table */}
          {selectedCluster !== null && members && (
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Membres du cluster ({members.length})
              </p>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border">
                      {['Nom', 'QoE', 'Débit DL', 'RTT', 'Loss DL', 'Cluster', 'Dist. centroïde'].map(h => (
                        <th key={h} className="text-left py-2 px-2 font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-muted/30">
                        <td className="py-1.5 px-2 font-medium">{m.dimension_2}</td>
                        <td className="py-1.5 px-2 font-mono">{m.qoe_index?.toFixed(1)}</td>
                        <td className="py-1.5 px-2 font-mono">{m.debit_dl?.toFixed(1)}</td>
                        <td className="py-1.5 px-2 font-mono">{m.rtt_setup_avg?.toFixed(1)}</td>
                        <td className="py-1.5 px-2 font-mono">{m.loss_dl_rate?.toFixed(4)}</td>
                        <td className="py-1.5 px-2">{m.cluster_label}</td>
                        <td className="py-1.5 px-2 font-mono">{m.centroid_distance?.toFixed(3)}</td>
                      </tr>
                    ))}
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

export default SentinelClustering;
