import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Search, Download, ExternalLink, AlertCircle, Inbox, ArrowUpDown } from 'lucide-react';
import { topoApi } from '@/lib/localDb';
import type { TopologyConditionState } from './TopologyConditionCard';

interface Props {
  topoConditions: TopologyConditionState[];
  totalMatched?: number;
  onViewFull?: () => void;
}

interface PreviewSite {
  site_id?: string;
  site_name?: string;
  vendor?: string;
  constructeur?: string;
  dor?: string;
  plaque?: string;
  region?: string;
  cell_count?: number;
  cells?: any[];
  status?: string;
}

const PREVIEW_LIMIT = 50;

// Map wizard dimension keys → backend query param keys
const DIM_TO_QS: Record<string, string> = {
  vendor: 'constructeur',
  dor: 'dor',
  plaque: 'plaque',
  band: 'bande',
  techno: 'techno',
  region: 'region',
};

function buildQueryString(conds: TopologyConditionState[]): string {
  const qs = new URLSearchParams();
  qs.set('limit', String(PREVIEW_LIMIT));
  for (const c of conds) {
    if (c.operator !== 'IN' || !c.values.length) continue;
    const key = DIM_TO_QS[c.field] || c.field;
    qs.set(key, c.values.join(','));
  }
  return qs.toString();
}

type SortKey = 'site_name' | 'vendor' | 'region' | 'cell_count';

const ClusterPreviewTable: React.FC<Props> = ({ topoConditions, totalMatched, onViewFull }) => {
  const [sites, setSites] = useState<PreviewSite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('site_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const validConds = useMemo(
    () => topoConditions.filter(c => c.values.length > 0 && c.operator === 'IN'),
    [topoConditions],
  );

  useEffect(() => {
    if (validConds.length === 0) { setSites([]); return; }
    const qs = buildQueryString(validConds);
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    topoApi.filteredSites(qs)
      .then((rows: any[]) => {
        if (controller.signal.aborted) return;
        setSites((rows || []).slice(0, PREVIEW_LIMIT));
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setError(e?.message || 'Failed to load preview');
        setSites([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [validConds]);

  const enriched = useMemo(() => sites.map(s => ({
    site_id: s.site_id,
    site_name: s.site_name || s.site_id || '—',
    vendor: s.vendor || s.constructeur || '—',
    region: s.dor || s.plaque || s.region || '—',
    cell_count: s.cell_count ?? (Array.isArray(s.cells) ? s.cells.length : undefined) ?? 0,
    status: s.status || 'active',
  })), [sites]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? enriched.filter(s =>
          s.site_name.toLowerCase().includes(q) ||
          s.vendor.toLowerCase().includes(q) ||
          s.region.toLowerCase().includes(q),
        )
      : enriched;
    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return sorted;
  }, [enriched, search, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  };

  const handleExport = () => {
    const headers = ['Site Name', 'Vendor', 'Region', 'Cells', 'Status'];
    const rows = filtered.map(s => [s.site_name, s.vendor, s.region, s.cell_count, s.status]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cluster-preview-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const total = totalMatched ?? sites.length;
  const hasConds = validConds.length > 0;

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Preview Results</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {hasConds && total > 0
              ? <>Showing first <strong className="text-foreground">{Math.min(filtered.length, PREVIEW_LIMIT)}</strong> of <strong className="text-foreground">{total.toLocaleString('fr-FR')}</strong> matched sites</>
              : 'Define topology filters to preview matching sites'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3 h-3 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-7 pr-2 py-1.5 rounded-lg border border-border bg-background text-xs w-40 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={handleExport}
            disabled={!filtered.length}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
          >
            <Download className="w-3 h-3" /> Export
          </button>
          {onViewFull && (
            <button
              onClick={onViewFull}
              disabled={!hasConds}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              <ExternalLink className="w-3 h-3" /> View Full
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="py-10 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <p className="text-xs">Loading preview…</p>
        </div>
      ) : error ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <AlertCircle className="w-6 h-6 text-destructive/70" />
          <p className="text-xs">Preview unavailable</p>
          <p className="text-[10px] text-muted-foreground/70">{error}</p>
        </div>
      ) : !hasConds ? (
        <div className="py-10 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <Inbox className="w-6 h-6 opacity-40" />
          <p className="text-xs">Add topology conditions to see results</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 flex flex-col items-center justify-center gap-1 text-muted-foreground">
          <Inbox className="w-6 h-6 opacity-40" />
          <p className="text-xs font-semibold text-foreground">No matching sites found</p>
          <p className="text-[11px]">Adjust filters or conditions</p>
        </div>
      ) : (
        <>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/50 backdrop-blur z-10">
                <tr className="border-b border-border">
                  {([
                    { k: 'site_name', label: 'Site Name', align: 'left' },
                    { k: 'vendor', label: 'Vendor', align: 'left' },
                    { k: 'region', label: 'Region', align: 'left' },
                    { k: 'cell_count', label: 'Cells', align: 'right' },
                  ] as { k: SortKey; label: string; align: 'left' | 'right' }[]).map(col => (
                    <th
                      key={col.k}
                      onClick={() => toggleSort(col.k)}
                      className={`py-2 px-3 font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        <ArrowUpDown className={`w-2.5 h-2.5 ${sortKey === col.k ? 'text-primary' : 'opacity-30'}`} />
                      </span>
                    </th>
                  ))}
                  <th className="py-2 px-3 font-semibold text-muted-foreground text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => (
                  <tr
                    key={s.site_id || i}
                    className="border-b border-border/30 last:border-0 hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <td className="py-2 px-3 font-medium text-foreground">{s.site_name}</td>
                    <td className="py-2 px-3 text-muted-foreground">{s.vendor}</td>
                    <td className="py-2 px-3 text-muted-foreground">{s.region}</td>
                    <td className="py-2 px-3 text-right font-mono text-foreground">{s.cell_count}</td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize ${
                        s.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > PREVIEW_LIMIT && (
            <div className="px-4 py-2 border-t border-border/50 text-[11px] text-muted-foreground text-center bg-muted/20">
              Only first {PREVIEW_LIMIT} results are displayed
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ClusterPreviewTable;
