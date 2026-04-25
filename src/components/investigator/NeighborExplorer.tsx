/**
 * NeighborExplorer — Investigator tab for exploring neighbor relations.
 * Filters: vendor, techno, site, relation type. Split by target band.
 * Graph + CSV export.
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { Search, Download, Loader2, ArrowRightLeft, Filter } from 'lucide-react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { useInvestigatorStore } from '@/stores/investigatorStore';

interface NeighborEntry {
  source_cell: string;
  source_site: string;
  source_band: string;
  source_techno: string;
  relation_type: string;
  neighbor_key: string;
  target_earfcn: number | null;
  target_pci: number | null;
  target_eci: number | null;
  target_band: string;
  vendor: string;
  rat: string;
}

interface ExploreResult {
  total: number;
  neighbors: NeighborEntry[];
  grouped: Record<string, NeighborEntry[]> | null;
  stats: {
    by_band: { band: string; count: number }[];
    by_type: { type: string; count: number }[];
  };
  error?: string;
}

const TYPE_COLORS: Record<string, string> = {
  INTER_FREQ: '#f59e0b',
  NR_INTER_FREQ: '#3b82f6',
  NR_RELATION: '#10b981',
  INTRA_FREQ: '#8b5cf6',
  INTER_SYSTEM: '#ef4444',
};

const NeighborExplorer: React.FC = () => {
  const state = useInvestigatorStore(s => s.state);
  const [vendor, setVendor] = useState<string>('Nokia');
  const [rat, setRat] = useState<string>('');
  const [siteName, setSiteName] = useState<string>('');
  const [plaque, setPlaque] = useState<string>('');
  const [dor, setDor] = useState<string>('');
  const [relationType, setRelationType] = useState<string>('');
  const [splitBy, setSplitBy] = useState<'all' | 'target_band'>('all');
  const [data, setData] = useState<ExploreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (vendor) params.set('vendor', vendor);
      if (rat) params.set('rat', rat);
      if (siteName.trim()) params.set('site_name', siteName.trim());
      if (plaque.trim()) params.set('plaque', plaque.trim());
      if (dor.trim()) params.set('dor', dor.trim());
      if (relationType) params.set('relation_type', relationType);
      params.set('split_by', splitBy);

      const res = await fetch(getApiUrl(`neighbors/list/explore?${params}`), { headers: getApiHeaders() });
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch (e) {
      console.warn('[NeighborExplorer] fetch error:', e);
    }
    setLoading(false);
  }, [vendor, rat, siteName, plaque, dor, relationType, splitBy]);

  // Chart options
  const chartOption = useMemo(() => {
    if (!data?.stats) return null;

    if (splitBy === 'target_band' && data.stats.by_band.length > 0) {
      return {
        title: { text: 'Neighbors by Target Band', textStyle: { fontSize: 12, fontWeight: 700 } },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: data.stats.by_band.map(b => b.band), axisLabel: { fontSize: 9, rotate: 30 } },
        yAxis: { type: 'value', name: 'Count', axisLabel: { fontSize: 9 } },
        series: [{ type: 'bar', data: data.stats.by_band.map(b => b.count), itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] } }],
        grid: { top: 40, right: 16, bottom: 60, left: 50 },
      };
    }

    if (data.stats.by_type.length > 0) {
      return {
        title: { text: 'Neighbors by Relation Type', textStyle: { fontSize: 12, fontWeight: 700 } },
        tooltip: { trigger: 'item' },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          data: data.stats.by_type.map(t => ({
            name: t.type,
            value: t.count,
            itemStyle: { color: TYPE_COLORS[t.type] || '#6b7280' },
          })),
          label: { fontSize: 10 },
        }],
      };
    }
    return null;
  }, [data, splitBy]);

  // Filtered neighbors for table
  const filtered = useMemo(() => {
    const list = data?.neighbors || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(n =>
      n.source_cell.toLowerCase().includes(q) ||
      n.source_site.toLowerCase().includes(q) ||
      n.target_band.toLowerCase().includes(q) ||
      n.relation_type.toLowerCase().includes(q)
    );
  }, [data, search]);

  const exportCsv = () => {
    if (!filtered.length) return;
    const headers = ['Source Cell', 'Source Site', 'Source Band', 'Relation Type', 'Target Band', 'Target EARFCN', 'Target PCI', 'Target ECI', 'Vendor', 'RAT'];
    const rows = filtered.map(n => [n.source_cell, n.source_site, n.source_band, n.relation_type, n.target_band, n.target_earfcn ?? '', n.target_pci ?? '', n.target_eci ?? '', n.vendor, n.rat]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `neighbors_${vendor}_${siteName || 'all'}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4 p-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-[9px] font-bold text-muted-foreground uppercase block mb-1">Vendor</label>
          <select value={vendor} onChange={e => setVendor(e.target.value)} className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold">
            <option value="">All</option>
            <option value="Nokia">Nokia</option>
            <option value="Ericsson">Ericsson</option>
          </select>
        </div>
        <div>
          <label className="text-[9px] font-bold text-muted-foreground uppercase block mb-1">Technology</label>
          <select value={rat} onChange={e => setRat(e.target.value)} className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold">
            <option value="">All</option>
            <option value="LTE">LTE (4G)</option>
            <option value="NR">NR (5G)</option>
          </select>
        </div>
        <div>
          <label className="text-[9px] font-bold text-muted-foreground uppercase block mb-1">Site</label>
          <input
            value={siteName}
            onChange={e => setSiteName(e.target.value)}
            placeholder="Site name..."
            className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs w-40"
          />
        </div>
        <div>
          <label className="text-[9px] font-bold text-muted-foreground uppercase block mb-1">Plaque</label>
          <input
            value={plaque}
            onChange={e => setPlaque(e.target.value)}
            placeholder="Plaque..."
            className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs w-32"
          />
        </div>
        <div>
          <label className="text-[9px] font-bold text-muted-foreground uppercase block mb-1">DOR</label>
          <input
            value={dor}
            onChange={e => setDor(e.target.value)}
            placeholder="DOR..."
            className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs w-32"
          />
        </div>
        <div>
          <label className="text-[9px] font-bold text-muted-foreground uppercase block mb-1">Type</label>
          <select value={relationType} onChange={e => setRelationType(e.target.value)} className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold">
            <option value="">All</option>
            <option value="INTER_FREQ">Inter-Freq</option>
            <option value="NR_INTER_FREQ">NR Inter-Freq</option>
            <option value="NR_RELATION">NR Relation</option>
            <option value="INTRA_FREQ">Intra-Freq</option>
          </select>
        </div>
        <div>
          <label className="text-[9px] font-bold text-muted-foreground uppercase block mb-1">Split By</label>
          <select value={splitBy} onChange={e => setSplitBy(e.target.value as any)} className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold">
            <option value="all">All</option>
            <option value="target_band">Target Band</option>
          </select>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-40"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          Rechercher
        </button>
      </div>

      {/* Stats */}
      {data && (
        <div className="flex items-center gap-4 text-xs">
          <span className="font-bold text-foreground">{data.total} relations</span>
          {data.stats.by_type.map(t => (
            <span key={t.type} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[t.type] || '#6b7280' }} />
              <span className="text-muted-foreground">{t.type}: <strong className="text-foreground">{t.count}</strong></span>
            </span>
          ))}
        </div>
      )}

      {/* Chart */}
      {chartOption && (
        <div className="rounded-xl border border-border bg-card p-2">
          <ReactECharts option={chartOption} style={{ height: 250 }} opts={{ renderer: 'canvas' }} />
        </div>
      )}

      {/* Table */}
      {data && data.total > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter..."
                className="px-2 py-1 rounded-lg border border-border bg-background text-xs w-48"
              />
              <span className="text-[10px] text-muted-foreground">{filtered.length} / {data.total}</span>
            </div>
            <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-1 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground">
              <Download size={12} /> CSV
            </button>
          </div>
          <div className="rounded-xl border border-border overflow-hidden max-h-[400px] overflow-y-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-2 py-1.5 text-left font-bold text-muted-foreground">Source Cell</th>
                  <th className="px-2 py-1.5 text-left font-bold text-muted-foreground">Source Site</th>
                  <th className="px-2 py-1.5 text-left font-bold text-muted-foreground">Source Band</th>
                  <th className="px-2 py-1.5 text-center font-bold text-muted-foreground">Type</th>
                  <th className="px-2 py-1.5 text-left font-bold text-muted-foreground">Target Band</th>
                  <th className="px-2 py-1.5 text-right font-bold text-muted-foreground">EARFCN</th>
                  <th className="px-2 py-1.5 text-right font-bold text-muted-foreground">PCI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filtered.slice(0, 200).map((n, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-2 py-1 font-mono font-semibold text-foreground truncate max-w-[160px]">{n.source_cell}</td>
                    <td className="px-2 py-1 text-muted-foreground truncate max-w-[120px]">{n.source_site}</td>
                    <td className="px-2 py-1 font-semibold">{n.source_band}</td>
                    <td className="px-2 py-1 text-center">
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold text-white" style={{ backgroundColor: TYPE_COLORS[n.relation_type] || '#6b7280' }}>
                        {n.relation_type}
                      </span>
                    </td>
                    <td className="px-2 py-1 font-semibold text-primary">{n.target_band || '—'}</td>
                    <td className="px-2 py-1 text-right font-mono">{n.target_earfcn ?? '—'}</td>
                    <td className="px-2 py-1 text-right font-mono">{n.target_pci ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !data && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <ArrowRightLeft size={32} className="mx-auto mb-3 opacity-30" />
          <p>Select filters and click <strong>Rechercher</strong> to explore neighbor relations</p>
        </div>
      )}
    </div>
  );
};

export default NeighborExplorer;
