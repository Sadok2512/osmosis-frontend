import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, RefreshCw, Trash2, PlayCircle, FolderOpen, Radio, Info, X,
  Loader2, CheckCircle2, AlertCircle, Database, Layers,
} from 'lucide-react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

/* ────────────────────── Types ────────────────────── */

interface TopoStats {
  rows?: number;
  live_rows?: number;
  sites?: number;
  cells?: number;
  csv_path?: string | null;
  last_loaded_at?: string | null;
  importing?: boolean;
  error?: string | null;
}

interface SiteRow {
  site_name: string;
  constructeur?: string | null;
  cell_count: number;
  technos?: string[];
  bandes?: string[];
  plaque?: string | null;
  dor?: string | null;
}

interface CellRow {
  cell_name?: string;
  raw_data?: Record<string, string | null | undefined>;
}

interface SiteDetail {
  site_name: string;
  cell_count: number;
  technos: string[];
  vendors: string[];
  latitude?: number | null;
  longitude?: number | null;
  cells: CellRow[];
}

/* ────────────────────── Helpers ────────────────────── */

const fmt = (n: number | undefined | null): string =>
  n == null ? '—' : n.toLocaleString();

const prettyLabel = (k: string): string =>
  k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const vendorVariant = (v?: string | null): 'default' | 'secondary' | 'outline' => {
  const vu = (v || '').toUpperCase();
  if (vu === 'NOKIA') return 'default';
  if (vu === 'ERICSSON') return 'secondary';
  return 'outline';
};

const technoClass = (t: string): string => {
  const tu = t.toUpperCase();
  if (tu === '5G' || tu === 'NR') return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
  if (tu === '4G' || tu === 'LTE') return 'bg-blue-500/15 text-blue-500 border-blue-500/30';
  if (tu === '3G' || tu === 'UMTS') return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
  return 'bg-muted text-muted-foreground border-border';
};

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = getApiUrl(path);
  const res = await fetch(url, { ...init, headers: { ...getApiHeaders(), ...(init?.headers || {}) } });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${detail || res.statusText}`);
  }
  return res.json();
}

/* ────────────────────── Component ────────────────────── */

const NetworkTopologyPage: React.FC = () => {
  /* ── Stats + service status ── */
  const [stats, setStats] = useState<TopoStats | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const pollRef = useRef<number | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const d = await fetchJson<TopoStats>('config/topo/stats');
      setStats(d);
      setImporting(!!d.importing);
    } catch (e) {
      console.error('[topology] loadStats', e);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // Poll while importing
  useEffect(() => {
    if (!importing) {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = window.setInterval(loadStats, 3000) as unknown as number;
    return () => {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [importing, loadStats]);

  const runImport = async () => {
    try {
      await fetchJson<unknown>('config/topo/reload', { method: 'POST' });
      toast.success('Topology import started');
      setImporting(true);
      loadStats();
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`);
    }
  };

  const deleteTopo = async () => {
    try {
      await fetchJson<unknown>('topo/delete', { method: 'DELETE' });
      toast.success('Topology data deleted');
      loadStats();
      setSites([]);
      setSelectedSite(null);
      setSiteDetail(null);
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    } finally {
      setDeleteOpen(false);
    }
  };

  /* ── Sites search + filters + table ── */
  const [query, setQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const [technoFilter, setTechnoFilter] = useState<string>('all');
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const searchTimer = useRef<number | null>(null);

  const searchSites = useCallback(async () => {
    setSitesLoading(true);
    setSitesError(null);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (query.trim()) params.set('search', query.trim());
      if (vendorFilter !== 'all') params.set('vendor', vendorFilter);
      if (technoFilter !== 'all') params.set('techno', technoFilter);
      const d = await fetchJson<SiteRow[]>(`topo/sites?${params}`);
      setSites(d);
    } catch (e) {
      setSitesError((e as Error).message);
      setSites([]);
    } finally {
      setSitesLoading(false);
    }
  }, [query, vendorFilter, technoFilter]);

  // Debounce query changes
  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => { searchSites(); }, 300) as unknown as number;
    return () => { if (searchTimer.current) window.clearTimeout(searchTimer.current); };
  }, [searchSites]);

  // Vendor options discovered from results (first non-empty load)
  const vendorOptions = useMemo(() => {
    const set = new Set<string>();
    sites.forEach(s => { if (s.constructeur) set.add(s.constructeur); });
    return Array.from(set).sort();
  }, [sites]);

  /* ── Site detail ── */
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [siteDetail, setSiteDetail] = useState<SiteDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const viewSite = async (siteName: string) => {
    setSelectedSite(siteName);
    setSiteDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const s = await fetchJson<SiteDetail>(`topo/site/${encodeURIComponent(siteName)}`);
      setSiteDetail(s);
      // Scroll to detail
      setTimeout(() => {
        document.getElementById('topo-site-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    } catch (e) {
      setDetailError((e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  };

  // Derive site-level vs cell-level fields from raw_data
  const { siteKeys, cellKeys, siteRaw0 } = useMemo(() => {
    const empty = { siteKeys: [] as string[], cellKeys: [] as string[], siteRaw0: {} as Record<string, string | null | undefined> };
    if (!siteDetail?.cells?.length) return empty;
    const allKeys = new Set<string>();
    siteDetail.cells.forEach(c => { if (c.raw_data) Object.keys(c.raw_data).forEach(k => allKeys.add(k)); });
    const sKeys: string[] = [];
    const cKeys: string[] = [];
    for (const k of Array.from(allKeys)) {
      const vals = new Set(siteDetail.cells.map(c => (c.raw_data || {})[k] ?? ''));
      if (vals.size <= 1) sKeys.push(k); else cKeys.push(k);
    }
    const raw0 = siteDetail.cells[0]?.raw_data || {};
    return { siteKeys: sKeys, cellKeys: cKeys, siteRaw0: raw0 };
  }, [siteDetail]);

  const cellAllCols = useMemo(() => {
    if (!siteDetail?.cells?.length) return [] as string[];
    const s = new Set<string>();
    siteDetail.cells.forEach(c => { if (c.raw_data) Object.keys(c.raw_data).forEach(k => s.add(k)); });
    return Array.from(s);
  }, [siteDetail]);

  /* ── Service badge ── */
  const serviceBadge = useMemo(() => {
    if (!stats) return <Badge variant="outline">—</Badge>;
    if (stats.importing) return <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30" variant="outline"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Importing…</Badge>;
    if (stats.error) return <Badge className="bg-rose-500/15 text-rose-500 border-rose-500/30" variant="outline"><AlertCircle className="w-3 h-3 mr-1" />Error</Badge>;
    if ((stats.rows || stats.live_rows || 0) > 0) return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30" variant="outline"><CheckCircle2 className="w-3 h-3 mr-1" />Loaded</Badge>;
    return <Badge variant="outline">Empty</Badge>;
  }, [stats]);

  /* ────────────────────── Render ────────────────────── */
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-8 py-6 max-w-[1600px] mx-auto space-y-4">

        {/* ── Stats row ── */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="CSV Rows" value={fmt(stats?.rows ?? stats?.live_rows)} icon={<Database className="w-5 h-5 text-blue-500" />} />
          <StatCard label="Sites" value={fmt(stats?.sites)} icon={<Radio className="w-5 h-5 text-emerald-500" />} />
          <StatCard label="Cells" value={fmt(stats?.cells)} icon={<Layers className="w-5 h-5 text-violet-500" />} />
          <StatCard
            label="Last Loaded"
            value={stats?.last_loaded_at ? new Date(stats.last_loaded_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
            icon={<Info className="w-5 h-5 text-amber-500" />}
            small
          />
        </div>


        {/* ── Sites search + table ── */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-cyan-500" />
              <h2 className="text-sm font-bold uppercase tracking-wide">Sites</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {sitesLoading ? 'Loading…' : `${sites.length} sites${query ? ' matching' : ''}`}
            </span>
          </div>

          <div className="flex gap-2 items-end mb-4 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Search Site</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Type site name…"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-[160px]">
              <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Vendor</label>
              <Select value={vendorFilter} onValueChange={setVendorFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {vendorOptions.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[140px]">
              <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Techno</label>
              <Select value={technoFilter} onValueChange={setTechnoFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="5G">5G</SelectItem>
                  <SelectItem value="4G">4G</SelectItem>
                  <SelectItem value="3G">3G</SelectItem>
                  <SelectItem value="2G">2G</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={searchSites} disabled={sitesLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${sitesLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>

          <div className="border rounded-lg overflow-hidden max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Site Name</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-center">Cells</TableHead>
                  <TableHead>Technos</TableHead>
                  <TableHead>Bands</TableHead>
                  <TableHead>Plaque</TableHead>
                  <TableHead>DOR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sitesLoading && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6"><Loader2 className="w-4 h-4 inline animate-spin mr-2" />Loading…</TableCell></TableRow>
                )}
                {!sitesLoading && sitesError && (
                  <TableRow><TableCell colSpan={7} className="text-center text-rose-500 py-6">{sitesError}</TableCell></TableRow>
                )}
                {!sitesLoading && !sitesError && sites.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No sites found</TableCell></TableRow>
                )}
                {!sitesLoading && !sitesError && sites.map(s => (
                  <TableRow
                    key={s.site_name}
                    className={`cursor-pointer hover:bg-muted/50 ${selectedSite === s.site_name ? 'bg-primary/5' : ''}`}
                    onClick={() => viewSite(s.site_name)}
                  >
                    <TableCell className="font-semibold text-cyan-500">{s.site_name}</TableCell>
                    <TableCell><Badge variant={vendorVariant(s.constructeur)} className="text-[10px]">{s.constructeur || '—'}</Badge></TableCell>
                    <TableCell className="text-center font-semibold">{s.cell_count}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {(s.technos || []).map(t => (
                          <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded border ${technoClass(t)}`}>{t}</span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={(s.bandes || []).join(', ')}>
                      {(s.bandes || []).slice(0, 4).join(', ')}
                      {(s.bandes || []).length > 4 && <span className="ml-1">+{(s.bandes || []).length - 4}</span>}
                    </TableCell>
                    <TableCell className="text-xs">{s.plaque || ''}</TableCell>
                    <TableCell className="text-xs">{s.dor || ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* ── Site detail ── */}
        {(selectedSite || detailLoading) && (
          <Card className="p-5" id="topo-site-detail">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-emerald-500" />
                <h2 className="text-sm font-bold uppercase tracking-wide">Site Detail</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setSelectedSite(null); setSiteDetail(null); }}>
                <X className="w-4 h-4 mr-1" /> Close
              </Button>
            </div>

            {detailLoading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading site details…
              </div>
            )}
            {!detailLoading && detailError && (
              <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-500 text-sm">
                <AlertCircle className="w-4 h-4 inline mr-2" />{detailError}
              </div>
            )}

            {!detailLoading && !detailError && siteDetail && (
              <>
                {/* Summary stats */}
                <div className="grid grid-cols-4 gap-3 mb-5">
                  <StatCard label="Site" value={siteDetail.site_name} small />
                  <StatCard label="Cells" value={String(siteDetail.cell_count)} />
                  <StatCard label="Technologies" value={siteDetail.technos.join(', ') || '—'} small />
                  <StatCard label="Vendors" value={siteDetail.vendors.join(', ') || '—'} small />
                </div>

                {/* Site-level fields */}
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wide">Site Info</h3>
                </div>
                <div className="grid grid-cols-3 gap-x-6 gap-y-1 mb-5 text-xs">
                  {siteKeys.map(k => {
                    const v = siteRaw0[k];
                    if (!v) return null;
                    return (
                      <div key={k} className="flex justify-between items-center py-1 border-b border-border/40">
                        <span className="text-muted-foreground">{prettyLabel(k)}</span>
                        <span className="font-medium truncate ml-2" title={String(v)}>{String(v)}</span>
                      </div>
                    );
                  })}
                  {siteDetail.latitude != null && (
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Latitude</span>
                      <span className="font-mono text-xs">{siteDetail.latitude.toFixed(6)}</span>
                    </div>
                  )}
                  {siteDetail.longitude != null && (
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Longitude</span>
                      <span className="font-mono text-xs">{siteDetail.longitude.toFixed(6)}</span>
                    </div>
                  )}
                </div>

                {/* Cells table with all columns */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-blue-500" />
                    <h3 className="text-xs font-bold uppercase tracking-wide">Cells ({siteDetail.cells.length})</h3>
                  </div>
                </div>
                <div className="border rounded-lg overflow-hidden max-h-[500px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        {cellAllCols.map(k => (
                          <TableHead key={k} className="text-[10px] whitespace-nowrap">{prettyLabel(k)}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {siteDetail.cells.map((c, i) => (
                        <TableRow key={i}>
                          {cellAllCols.map(k => (
                            <TableCell key={k} className="text-xs whitespace-nowrap">{String((c.raw_data || {})[k] ?? '')}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </Card>
        )}
      </div>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-500 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Delete Topology Data
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div>This will permanently delete <strong>all</strong> topology data:</div>
                <div className="rounded-lg bg-muted/30 border border-border p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span>Rows</span><b>{fmt(stats?.rows ?? stats?.live_rows)}</b></div>
                  <div className="flex justify-between"><span>Sites</span><b>{fmt(stats?.sites)}</b></div>
                  <div className="flex justify-between"><span>Cells</span><b>{fmt(stats?.cells)}</b></div>
                </div>
                <div className="text-rose-500 text-xs font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> This action cannot be undone. You will need to re-import the topology file.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteTopo} className="bg-rose-500 hover:bg-rose-600 text-white">
              Delete All Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/* ────────────────────── StatCard ────────────────────── */

const StatCard: React.FC<{ label: string; value: string; icon?: React.ReactNode; small?: boolean }> = ({ label, value, icon, small }) => (
  <Card className="p-4">
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-1">{label}</div>
        <div className={`font-black ${small ? 'text-sm' : 'text-2xl'} truncate`} title={value}>{value}</div>
      </div>
      {icon && <div className="shrink-0">{icon}</div>}
    </div>
  </Card>
);

export default NetworkTopologyPage;
