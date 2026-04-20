import React, { useEffect, useState, useCallback } from 'react';
import { Layers, ChevronDown, X, RefreshCw, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchActiveClusters, getClusterSites } from '@/services/filterService';
import type { NetworkFilter } from '@/components/documentation/filterTypes';

export interface ClusterSelection {
  cluster: NetworkFilter;
  sites: string[];
}

interface ClusterPickerProps {
  onSelect: (selection: ClusterSelection | null) => void;
  selected?: NetworkFilter | null;
  className?: string;
  compact?: boolean;
}

const ClusterPicker: React.FC<ClusterPickerProps> = ({ onSelect, selected, className, compact }) => {
  const [open, setOpen] = useState(false);
  const [clusters, setClusters] = useState<NetworkFilter[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSites, setLoadingSites] = useState<string | null>(null);

  const loadClusters = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchActiveClusters();
      setClusters(list);
    } catch {
      setClusters([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && clusters.length === 0) loadClusters();
  }, [open, clusters.length, loadClusters]);

  const handleSelect = async (cluster: NetworkFilter) => {
    setLoadingSites(cluster.id);
    try {
      const result = await getClusterSites(cluster.id);
      onSelect({ cluster, sites: result.sites });
      setOpen(false);
    } catch {
      onSelect({ cluster, sites: [] });
      setOpen(false);
    } finally {
      setLoadingSites(null);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
  };

  const topoSummary = (cluster: NetworkFilter) => {
    const topo = cluster.topology as any[] || [];
    return topo
      .filter((t: any) => t.values?.length > 0)
      .map((t: any) => `${t.dimension}: ${t.values.slice(0, 3).join(', ')}${t.values.length > 3 ? '...' : ''}`)
      .join(' | ');
  };

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all',
          selected
            ? 'border-primary/40 bg-primary/8 text-primary'
            : 'border-border/60 bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground'
        )}
      >
        <Layers className="h-3.5 w-3.5" />
        {selected ? (
          <>
            <span className="max-w-[180px] truncate">{selected.name}</span>
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px]">
              {(selected as any).site_count || '?'} sites
            </span>
            <button onClick={handleClear} className="ml-1 rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </>
        ) : (
          <>
            {compact ? 'Cluster' : 'Select Cluster'}
            <ChevronDown className="h-3 w-3" />
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-[340px] rounded-2xl border border-border/60 bg-card shadow-xl">
            <div className="border-b border-border/40 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-foreground">Saved Clusters</p>
                <p className="text-[10px] text-muted-foreground">{clusters.length} active clusters</p>
              </div>
              <button onClick={loadClusters} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50">
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              </button>
            </div>
            <div className="max-h-[300px] overflow-y-auto p-2">
              {loading ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading...</p>
              ) : clusters.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No active clusters. Create one in the Cluster Builder.
                </p>
              ) : (
                clusters.map(c => {
                  const isSelected = selected?.id === c.id;
                  const isLoading = loadingSites === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleSelect(c)}
                      disabled={isLoading}
                      className={cn(
                        'w-full rounded-xl px-3 py-2.5 text-left transition-all mb-1',
                        isSelected
                          ? 'bg-primary/10 border border-primary/30'
                          : 'hover:bg-muted/50 border border-transparent'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground truncate">{c.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {(c as any).site_count || c.matching_objects || '?'} sites
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground truncate">{topoSummary(c)}</p>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ClusterPicker;
