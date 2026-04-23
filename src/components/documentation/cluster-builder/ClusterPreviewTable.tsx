import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, Search, Download, ExternalLink, AlertCircle, Inbox, ArrowUpDown, ChevronRight, ChevronDown } from 'lucide-react';
import { topoApi } from '@/lib/localDb';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import type { TopologyConditionState } from './TopologyConditionCard';

interface Props {
  topoConditions: TopologyConditionState[];
  totalMatched?: number;
  onViewFull?: () => void;
  maxRows?: number;
  title?: string;
  description?: string;
}

interface PreviewCell {
  cell_id?: string;
  cell_name?: string;
  source_cellule?: string;
  nom_cellule?: string;
  techno?: string;
  bande?: string;
  band?: string;
  pci?: number | string;
  eci?: number | string;
  sac_ci_eci?: number | string;
  nci?: number | string;
  azimut?: number | string;
  azimuth?: number | string;
  etat_cellule?: string;
  admin_state?: string;
  oper_state?: string;
  status?: string;
}

interface PreviewSite {
  site_id?: string;
  site_name?: string;
  code_nidt?: string;
  vendor?: string;
  constructeur?: string;
  dor?: string;
  plaque?: string;
  region?: string;
  cell_count?: number;
  cells?: PreviewCell[];
  status?: string;
}

const DEFAULT_PREVIEW_LIMIT = 60;

// Map wizard dimension keys → backend query param keys
const DIM_TO_QS: Record<string, string> = {
  vendor: 'vendor',
  dor: 'dor',
  cluster: 'cluster',
  plaque: 'cluster',
  band: 'bande',
  rat: 'rat',
  techno: 'rat',
  region: 'region',
};

function buildQueryString(conds: TopologyConditionState[], limit: number): string {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('include_cells', '1');
  for (const c of conds) {
    if (c.operator !== 'IN' || !c.values.length) continue;
    const key = DIM_TO_QS[c.field] || c.field;
    qs.set(key, c.values.join(','));
  }
  return qs.toString();
}

type SortKey = 'site_name' | 'vendor' | 'region' | 'cell_count';

const ClusterPreviewTable: React.FC<Props> = ({
  topoConditions,
  totalMatched,
  onViewFull,
  maxRows = DEFAULT_PREVIEW_LIMIT,
  title = 'Preview Results',
  description,
}) => {
  const [sites, setSites] = useState<PreviewSite[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('site_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cellsCache, setCellsCache] = useState<Record<string, PreviewCell[]>>({});
  const [cellsLoading, setCellsLoading] = useState<Set<string>>(new Set());

  const validConds = useMemo(
    () => topoConditions.filter(c => c.values.length > 0 && c.operator === 'IN'),
    [topoConditions],
  );

  useEffect(() => {
    if (validConds.length === 0) { setSites([]); return; }
    const qs = buildQueryString(validConds, maxRows);
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setExpanded(new Set());
    setCellsCache({});
    topoApi.filteredSites(qs)
      .then((rows: any[]) => {
        if (controller.signal.aborted) return;
        setSites((rows || []).slice(0, maxRows));
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setError(e?.message || 'Failed to load preview');
        setSites([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [validConds, maxRows]);

  const enriched = useMemo(() => sites.map(s => ({
    site_id: s.site_id || s.code_nidt || s.site_name || '',
    site_name: s.site_name || s.code_nidt || s.site_id || '—',
    vendor: s.vendor || s.constructeur || '—',
    region: s.dor || s.plaque || s.region || '—',
    cell_count: s.cell_count ?? (Array.isArray(s.cells) ? s.cells.length : undefined) ?? 0,
    status: s.status || 'active',
    cells: Array.isArray(s.cells) ? s.cells : undefined,
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
      const av = (a as any)[sortKey] ?? '';
      const bv = (b as any)[sortKey] ?? '';
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

  const toggleExpand = async (siteId: string, inlineCells?: PreviewCell[]) => {
    const isCurrentlyOpen = expanded.has(siteId);
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId); else next.add(siteId);
      return next;
    });

    if (isCurrentlyOpen) return;

    // Lazy fetch cells with topology filters applied
    if (!cellsCache[siteId] && (!inlineCells || inlineCells.length === 0)) {
      setCellsLoading(prev => new Set(prev).add(siteId));
      try {
        const site = enriched.find(s => s.site_id === siteId);
        const siteName = site?.site_name || siteId;
        // Build query with topology filters so only matching cells are returned
        const qs = new URLSearchParams({ search: siteName, limit: '500' });
        for (const c of validConds) {
          if (c.values.length === 0) continue;
          const key = DIM_TO_QS[c.field] || c.field;
          if (key !== 'cluster' && key !== 'plaque') { // site already scoped by cluster
            qs.set(key, c.values.join(','));
          }
        }
        const url = getApiUrl(`topo/cells?${qs}`);
        const res = await fetch(url, { headers: getApiHeaders() });
        const data = res.ok ? await res.json() : [];
        const cells: PreviewCell[] = (Array.isArray(data) ? data : []).map((r: any) => ({
          cell_name: r.cell_name || r.source_cellule || '',
          techno: r.techno || '',
          band: r.band || '',
          pci: r.pci ?? null,
          eci: r.eci ?? r.sac_ci_eci ?? null,
          status: r.status || r.etat_fonctionnement || 'active',
        }));
        setCellsCache(prev => ({ ...prev, [siteId]: cells }));
      } catch {
        setCellsCache(prev => ({ ...prev, [siteId]: [] }));
      } finally {
        setCellsLoading(prev => { const n = new Set(prev); n.delete(siteId); return n; });
      }
    } else if (inlineCells && !cellsCache[siteId]) {
      setCellsCache(prev => ({ ...prev, [siteId]: inlineCells }));
    }
  };

  const handleExport = async () => {
    setExporting(true);
    const headers = ['Site Name', 'Vendor', 'Region', 'Cell Name', 'Techno', 'Band', 'PCI/ECI', 'Status'];
    const rows: any[] = [];
    const nextCache: Record<string, PreviewCell[]> = {};
    for (const s of filtered) {
      let cells = cellsCache[s.site_id] || s.cells || [];
      if (cells.length === 0 && s.site_id) {
        try {
          const qs = new URLSearchParams({ search: s.site_name || s.site_id, limit: '500' });
          const url = getApiUrl(`topo/cells?${qs}`);
          const res = await fetch(url, { headers: getApiHeaders() });
          const data = res.ok ? await res.json() : [];
          cells = (Array.isArray(data) ? data : []).map((r: any) => ({
            cell_name: r.cell_name || r.source_cellule || '',
            techno: r.techno || '',
            band: r.band || '',
            pci: r.pci ?? null,
            eci: r.eci ?? r.sac_ci_eci ?? null,
            status: r.status || r.etat_fonctionnement || 'active',
          }));
          nextCache[s.site_id] = cells;
        } catch {
          nextCache[s.site_id] = [];
        }
      }
      if (cells.length === 0) {
        rows.push([s.site_name, s.vendor, s.region, '', '', '', '', s.status]);
      } else {
        cells.forEach(c => rows.push([
          s.site_name, s.vendor, s.region,
          c.cell_name || c.source_cellule || c.nom_cellule || c.cell_id || '',
          c.techno || '', c.bande || c.band || '',
          c.pci ?? c.eci ?? c.sac_ci_eci ?? c.nci ?? '',
          c.etat_cellule || c.admin_state || c.oper_state || c.status || s.status,
        ]));
      }
    }
    if (Object.keys(nextCache).length) {
      setCellsCache(prev => ({ ...prev, ...nextCache }));
    }
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `filtered-elements-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  const total = totalMatched ?? sites.length;
  const hasConds = validConds.length > 0;

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {description || (hasConds && total > 0
              ? <>Showing first <strong className="text-foreground">{Math.min(filtered.length, maxRows)}</strong> of <strong className="text-foreground">{total.toLocaleString('fr-FR')}</strong> matched sites - click a row to expand cells</>
              : 'Define topology filters to preview matching sites')}
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
            disabled={!filtered.length || exporting}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
          >
            {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} CSV
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
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/50 backdrop-blur z-10">
                <tr className="border-b border-border">
                  <th className="w-6 py-2 px-2"></th>
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
                {filtered.map((s, i) => {
                  const isOpen = expanded.has(s.site_id);
                  const cells = cellsCache[s.site_id] || s.cells || [];
                  const isLoadingCells = cellsLoading.has(s.site_id);
                  return (
                    <React.Fragment key={s.site_id || i}>
                      <tr
                        onClick={() => toggleExpand(s.site_id, s.cells)}
                        className="border-b border-border/30 hover:bg-muted/40 transition-colors cursor-pointer"
                      >
                        <td className="py-2 px-2 text-muted-foreground">
                          {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </td>
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
                      {isOpen && (
                        <tr className="bg-muted/20">
                          <td></td>
                          <td colSpan={5} className="py-2 px-3">
                            {isLoadingCells ? (
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-2">
                                <Loader2 className="w-3 h-3 animate-spin" /> Loading cells…
                              </div>
                            ) : cells.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground italic py-1">No cell details available</p>
                            ) : (
                              <div className="rounded-lg border border-border/40 bg-background overflow-hidden">
                                <table className="w-full text-[11px]">
                                  <thead className="bg-muted/40">
                                    <tr>
                                      <th className="py-1.5 px-2 text-left font-semibold text-muted-foreground">Cell Name</th>
                                      <th className="py-1.5 px-2 text-left font-semibold text-muted-foreground">Techno</th>
                                      <th className="py-1.5 px-2 text-left font-semibold text-muted-foreground">Band</th>
                                      <th className="py-1.5 px-2 text-right font-semibold text-muted-foreground">PCI</th>
                                      <th className="py-1.5 px-2 text-right font-semibold text-muted-foreground">ECI/CID</th>
                                      <th className="py-1.5 px-2 text-left font-semibold text-muted-foreground">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {cells.map((c, j) => (
                                      <tr key={j} className="border-t border-border/30 hover:bg-muted/30">
                                        <td className="py-1 px-2 font-medium text-foreground">{c.cell_name || c.source_cellule || c.nom_cellule || c.cell_id || '—'}</td>
                                        <td className="py-1 px-2 text-muted-foreground">{c.techno || '—'}</td>
                                        <td className="py-1 px-2 text-muted-foreground">{c.bande || c.band || '—'}</td>
                                        <td className="py-1 px-2 text-right font-mono">{c.pci ?? '—'}</td>
                                        <td className="py-1 px-2 text-right font-mono">{c.eci ?? c.sac_ci_eci ?? c.nci ?? '—'}</td>
                                        <td className="py-1 px-2">
                                          <span className="text-[10px] text-muted-foreground">{c.etat_cellule || c.admin_state || c.oper_state || c.status || '—'}</span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {total > maxRows && (
            <div className="px-4 py-2 border-t border-border/50 text-[11px] text-muted-foreground text-center bg-muted/20">
              Only first {maxRows} sites are displayed
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ClusterPreviewTable;
