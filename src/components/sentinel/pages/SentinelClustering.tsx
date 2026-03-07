import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchClusters, fetchClusterMembers } from '../sentinelApi';
import { ClusterData, ClusterMember, CLUSTER_COLORS, SentinelDimension } from '../types';
import { MOCK_CLUSTERS } from '../mockSentinelData';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, BarChart3 } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { cn } from '@/lib/utils';

interface Props { date: string; apiConnected?: boolean; }

const DIMS: SentinelDimension[] = ['Cellule', 'Site', 'Bande', 'Vendor', 'DOR', 'Plaque'];

// Mock members for demo
const MOCK_MEMBERS: Record<number, ClusterMember[]> = {
  0: [
    { dimension_2: 'PAR_LTE_B1_001', qoe_index: 88.2, debit_dl: 52.1, rtt_setup_avg: 28000, loss_dl_rate: 0.002, cluster_label: 'performant', centroid_distance: 0.042 },
    { dimension_2: 'PAR_LTE_B3_002', qoe_index: 85.9, debit_dl: 48.7, rtt_setup_avg: 31000, loss_dl_rate: 0.003, cluster_label: 'performant', centroid_distance: 0.058 },
    { dimension_2: 'LYO_LTE_B1_008', qoe_index: 91.3, debit_dl: 55.4, rtt_setup_avg: 25000, loss_dl_rate: 0.001, cluster_label: 'performant', centroid_distance: 0.031 },
  ],
  1: [
    { dimension_2: 'LYO_LTE_B7_003', qoe_index: 64.5, debit_dl: 28.3, rtt_setup_avg: 68000, loss_dl_rate: 0.015, cluster_label: 'moyen', centroid_distance: 0.087 },
    { dimension_2: 'TLS_NR_B1_004', qoe_index: 61.2, debit_dl: 24.8, rtt_setup_avg: 72000, loss_dl_rate: 0.018, cluster_label: 'moyen', centroid_distance: 0.095 },
  ],
  2: [
    { dimension_2: 'NTE_LTE_B3_005', qoe_index: 42.1, debit_dl: 12.5, rtt_setup_avg: 145000, loss_dl_rate: 0.045, cluster_label: 'degrade', centroid_distance: 0.12 },
    { dimension_2: 'BDX_LTE_B1_006', qoe_index: 38.8, debit_dl: 10.2, rtt_setup_avg: 162000, loss_dl_rate: 0.052, cluster_label: 'degrade', centroid_distance: 0.15 },
  ],
  3: [
    { dimension_2: 'PAR_LTE_B3_001', qoe_index: 32.1, debit_dl: 4.2, rtt_setup_avg: 285000, loss_dl_rate: 0.082, cluster_label: 'critique', centroid_distance: 0.18 },
    { dimension_2: 'LYO_NR_B78_012', qoe_index: 38.5, debit_dl: 8.7, rtt_setup_avg: 210000, loss_dl_rate: 0.067, cluster_label: 'critique', centroid_distance: 0.14 },
  ],
};

const SentinelClustering: React.FC<Props> = ({ date, apiConnected = true }) => {
  const [dimension, setDimension] = useState<SentinelDimension>('Cellule');
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);

  const { data: apiClusters, isLoading, error } = useQuery<ClusterData[]>({
    queryKey: ['sentinel-clusters', date, dimension],
    queryFn: () => fetchClusters(date, dimension),
    staleTime: 30_000,
    retry: 0,
    refetchOnWindowFocus: false,
    enabled: apiConnected,
  });

  const clusters = apiClusters || (!apiConnected ? MOCK_CLUSTERS : null);
  const isMock = !apiClusters && !apiConnected;

  const { data: apiMembers } = useQuery<ClusterMember[]>({
    queryKey: ['sentinel-cluster-members', selectedCluster, date, dimension],
    queryFn: () => fetchClusterMembers(selectedCluster!, date, dimension),
    enabled: selectedCluster !== null && apiConnected,
    staleTime: 30_000,
    retry: 0,
  });

  const members = apiMembers || (isMock && selectedCluster !== null ? MOCK_MEMBERS[selectedCluster] || [] : undefined);

  // Scatter plot
  const scatterOption = (clusters && clusters.length > 0) ? {
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => `${p.data[3]}<br/>Débit: ${p.data[0].toFixed(2)}<br/>Latence: ${p.data[1].toFixed(2)}<br/>${p.data[4]} membres`,
    },
    grid: { left: 50, right: 20, top: 20, bottom: 40 },
    xAxis: { name: 'Score Débit', nameLocation: 'center' as const, nameGap: 25, type: 'value' as const, min: 0, max: 100, axisLabel: { fontSize: 9 } },
    yAxis: { name: 'Score Latence', nameLocation: 'center' as const, nameGap: 35, type: 'value' as const, min: 0, max: 100, axisLabel: { fontSize: 9 } },
    series: clusters.map(c => ({
      type: 'scatter' as const,
      name: c.cluster_label,
      symbolSize: Math.max(10, Math.min(40, c.cluster_size / 5)),
      data: [[c.centroid.score_debit, c.centroid.score_latence, c.cluster_size, c.cluster_label, c.cluster_size]],
      itemStyle: { color: CLUSTER_COLORS[c.cluster_label.toLowerCase()] || 'hsl(220,9%,46%)' },
    })),
  } : null;

  // Radar overlay
  const radarOption = (clusters && clusters.length > 0) ? {
    tooltip: {},
    legend: { bottom: 0, textStyle: { fontSize: 9, color: 'hsl(220,9%,46%)' } },
    radar: {
      indicator: [
        { name: 'Débit', max: 100 }, { name: 'Latence', max: 100 }, { name: 'Loss', max: 100 },
        { name: 'Retrans.', max: 100 }, { name: 'Stabilité', max: 100 }, { name: 'Drop', max: 100 }, { name: 'DMS', max: 100 },
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
      {isMock && (
        <div className="px-3 py-2 rounded-md text-xs bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center gap-2">
          ⚠ Données de démonstration — Backend FastAPI non connecté
        </div>
      )}

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

      {isLoading && apiConnected ? (
        <div className="grid grid-cols-5 gap-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : !clusters?.length ? (
        <div className="flex-1 flex items-center justify-center py-20">
          <div className="text-center space-y-2">
            <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Aucun cluster disponible</p>
          </div>
        </div>
      ) : (
        <>
          {/* Cluster summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {clusters.map(c => {
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
                    <span className="text-xs font-semibold capitalize">{c.cluster_label}</span>
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
          {selectedCluster !== null && members && members.length > 0 && (
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
