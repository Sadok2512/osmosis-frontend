import React, { useState, useEffect, useMemo } from 'react';
import { dumpParameterApi } from '@/lib/localDb';
import { getApiUrl, getPreferredDataSource, setPreferredDataSource } from '@/lib/apiConfig';
import { Search, Filter, Download, BarChart3, TableIcon, Loader2, ChevronDown, Wifi, WifiOff, Database } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const CHART_COLORS = [
  'hsl(210, 80%, 55%)', 'hsl(25, 95%, 53%)', 'hsl(160, 84%, 39%)', 'hsl(262, 83%, 58%)',
  'hsl(330, 81%, 60%)', 'hsl(187, 92%, 39%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)',
  'hsl(120, 60%, 45%)', 'hsl(280, 60%, 50%)', 'hsl(45, 90%, 50%)', 'hsl(200, 70%, 50%)',
];

interface DumpRow {
  id: number;
  site_name: string | null;
  cell_name: string | null;
  parameter: string;
  value: string | null;
  plaque: string | null;
  dor: string | null;
  vendor: string | null;
  bande: string | null;
  dr: string | null;
  ur: string | null;
}

type AggregatorKey = 'ur' | 'plaque';
type ColorBy = 'value' | 'aggregator';

const TopologiePage: React.FC = () => {
  const [data, setData] = useState<DumpRow[]>([]);
  const [cnxStatus, setCnxStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [cnxMessage, setCnxMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  const [dataSource, setDataSource] = useState<'local' | 'cloud'>(getPreferredDataSource());
  const [searchTerm, setSearchTerm] = useState('');

  // Search parameter (main)
  const [paramSearch, setParamSearch] = useState('');
  const [selectedParam, setSelectedParam] = useState('ALL');

  // Filters
  const [selectedSite, setSelectedSite] = useState('ALL');
  const [selectedCell, setSelectedCell] = useState('ALL');
  const [selectedUr, setSelectedUr] = useState('ALL');
  const [selectedPlaque, setSelectedPlaque] = useState('ALL');
  const [selectedVendor, setSelectedVendor] = useState('ALL');

  // Aggregator & color
  const [aggregator, setAggregator] = useState<AggregatorKey>('ur');
  const [colorBy, setColorBy] = useState<ColorBy>('value');

  // Available filter options
  const [sites, setSites] = useState<string[]>([]);
  const [cells, setCells] = useState<string[]>([]);
  const [params, setParams] = useState<string[]>([]);
  const [urs, setUrs] = useState<string[]>([]);
  const [plaques, setPlaques] = useState<string[]>([]);
  const [vendors, setVendors] = useState<string[]>([]);

  const shouldUseLocal = dataSource === 'local';

  const switchDataSource = (next: 'local' | 'cloud') => {
    setDataSource(next);
    setPreferredDataSource(next);
  };

  const fetchDistinct = async (col: string, extraParams?: Record<string, string>) => {
    try {
      const rows = await dumpParameterApi.distinct(col, extraParams);
      return [...new Set((rows || []).map((r: any) => r[col]).filter(Boolean))].sort() as string[];
    } catch (error) {
      console.warn('[Topologie] distinct fetch failed', error);
      return [];
    }
  };

  const fetchRows = async (filters: Record<string, string>, cols: string, limit = 5000) => {
    try {
      return await dumpParameterApi.query(filters, cols, limit);
    } catch (error) {
      console.warn('[Topologie] rows fetch failed', error);
      return [];
    }
  };

  const fetchRowsCloud = async (filters: Record<string, string>, cols: string, limit = 5000) => {
    // Cloud disabled — delegate to local
    return fetchRows(filters, cols, limit);
  };

  // Probe backend reachability on mount
  useEffect(() => {
    const probe = async () => {
      const healthUrl = getApiUrl('health');
      console.log('[Topologie] Probing backend at:', healthUrl);
      try {
        const resp = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
        console.log('[Topologie] Health probe result:', resp.status, resp.ok);
        setBackendReachable(resp.ok);
      } catch (err) {
        console.warn('[Topologie] Health probe FAILED:', err);
        setBackendReachable(false);
      }
    };
    probe();
  }, []);

  // Load filter options
  useEffect(() => {
    if (backendReachable === false) return; // skip if unreachable
    const loadFilters = async () => {
      const [s, p, d, pl, v] = await Promise.all([
        fetchDistinct('site_name'),
        fetchDistinct('parameter'),
        fetchDistinct('ur'),
        fetchDistinct('plaque'),
        fetchDistinct('vendor'),
      ]);
      setSites(s); setParams(p); setUrs(d); setPlaques(pl); setVendors(v);
    };
    loadFilters();
  }, [backendReachable]);

  // Don't auto-select — let user pick their parameter
  // useEffect(() => {
  //   if (selectedParam === 'ALL' && params.length > 0) {
  //     setSelectedParam(params[0]);
  //   }
  // }, [params, selectedParam]);

  // Filtered params for search
  const filteredParams = useMemo(() => {
    if (!paramSearch) return params;
    const s = paramSearch.toLowerCase();
    return params.filter(p => p.toLowerCase().includes(s));
  }, [params, paramSearch]);

  // Load cells when site changes
  useEffect(() => {
    const loadCells = async () => {
      const extra = selectedSite !== 'ALL' ? { site_name: selectedSite } : undefined;
      const c = await fetchDistinct('cell_name', extra);
      setCells(c);
    };
    loadCells();
  }, [selectedSite]);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      if (selectedParam === 'ALL') { setData([]); return; }
      setLoading(true);
      const filters: Record<string, string> = { parameter: selectedParam };
      if (selectedSite !== 'ALL') filters.site_name = selectedSite;
      if (selectedCell !== 'ALL') filters.cell_name = selectedCell;
      if (selectedUr !== 'ALL') filters.ur = selectedUr;
      if (selectedPlaque !== 'ALL') filters.plaque = selectedPlaque;
      if (selectedVendor !== 'ALL') filters.vendor = selectedVendor;
      const rows = await fetchRows(filters, 'id, site_name, cell_name, parameter, value, plaque, ur, vendor, bande, dr');
      setData(rows || []);
      setLoading(false);
    };
    loadData();
  }, [selectedParam, selectedSite, selectedCell, selectedUr, selectedPlaque, selectedVendor]);

  // Table search
  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    const s = searchTerm.toLowerCase();
    return data.filter(r =>
      r.site_name?.toLowerCase().includes(s) || r.cell_name?.toLowerCase().includes(s) || r.value?.toLowerCase().includes(s)
    );
  }, [data, searchTerm]);

  // All unique values & aggregator keys
  const allValues = useMemo(() => [...new Set(data.map(r => r.value || 'N/A'))].sort(), [data]);
  const allAggKeys = useMemo(() => [...new Set(data.map(r => r[aggregator] || 'N/A'))].sort(), [data, aggregator]);

  // Distribution: aggregator dimension, colored by value or aggregator
  const chartData = useMemo(() => {
    if (colorBy === 'value') {
      // Group by aggregator key, stack by value
      const map: Record<string, Record<string, number>> = {};
      data.forEach(r => {
        const key = r[aggregator] || 'N/A';
        const val = r.value || 'N/A';
        if (!map[key]) map[key] = {};
        map[key][val] = (map[key][val] || 0) + 1;
      });
      return Object.entries(map).map(([key, vals]) => {
        const total = Object.values(vals).reduce((a, b) => a + b, 0);
        return { _key: key, total, ...vals, _details: Object.entries(vals).map(([v, c]) => ({ value: v, count: c, pct: ((c / total) * 100).toFixed(1) })) };
      }).sort((a, b) => b.total - a.total);
    } else {
      // Group by value, stack by aggregator key
      const map: Record<string, Record<string, number>> = {};
      data.forEach(r => {
        const val = r.value || 'N/A';
        const key = r[aggregator] || 'N/A';
        if (!map[val]) map[val] = {};
        map[val][key] = (map[val][key] || 0) + 1;
      });
      return Object.entries(map).map(([val, keys]) => {
        const total = Object.values(keys).reduce((a, b) => a + b, 0);
        return { _key: val, total, ...keys, _details: Object.entries(keys).map(([k, c]) => ({ value: k, count: c, pct: ((c / total) * 100).toFixed(1) })) };
      }).sort((a, b) => b.total - a.total);
    }
  }, [data, aggregator, colorBy]);

  const stackKeys = colorBy === 'value' ? allValues : allAggKeys;

  // Global distribution
  const globalDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    data.forEach(r => { const val = r.value || 'N/A'; map[val] = (map[val] || 0) + 1; });
    const total = data.length;
    return Object.entries(map).map(([value, count]) => ({
      value, count, pct: total > 0 ? ((count / total) * 100).toFixed(1) : '0'
    })).sort((a, b) => b.count - a.count);
  }, [data]);

  const exportCSV = () => {
    if (!filteredData.length) return;
    const headers = ['Site', 'Cell', 'Parameter', 'Value', 'UR', 'Plaque', 'Vendor', 'Bande'];
    const rows = filteredData.map(r => [r.site_name, r.cell_name, r.parameter, r.value, r.ur, r.plaque, r.vendor, r.bande].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `topologie_${selectedParam}.csv`; a.click();
  };

  const aggLabel = aggregator === 'ur' ? 'UR' : 'Plaque';
  const isLocal = shouldUseLocal;
  const backendLabel = dataSource === 'local' ? 'Local (RAN_OP)' : 'Cloud';
  const tableTarget = 'dump_parameter';

  const testConnection = async () => {
    setCnxStatus('testing');
    setCnxMessage('');
    try {
      if (isLocal) {
        try {
          const resp = await fetch(`${getApiUrl('dump-parameter')}?${new URLSearchParams({ distinct_col: 'parameter' })}`);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const rows = await resp.json();
          setCnxStatus('ok');
          setCnxMessage(`✅ Connecté (Local) — ${rows.length} paramètres trouvés`);
          return;
        } catch (localErr: any) {
          console.warn('[Topologie] Local connection failed, fallback to cloud', localErr);
          switchDataSource('cloud');
        }
      }

      const probe = await dumpParameterApi.query({}, 'parameter', 1);
      setCnxStatus('ok');
      setCnxMessage(`✅ Connecté (Local) — dump_parameter accessible`);
    } catch (err: any) {
      setCnxStatus('error');
      setCnxMessage(`❌ Erreur: ${err.message || err}`);
    }
  };



  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Topologie Réseau</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Exploration des paramètres CM Dump</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Backend info badge */}
            <Badge variant="outline" className="text-xs gap-1">
              <Database className="w-3 h-3" />
              {backendLabel} → <span className="font-mono">{tableTarget}</span>
            </Badge>
            <div className="inline-flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => switchDataSource('local')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  dataSource === 'local'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-accent'
                }`}
              >
                Local
              </button>
              <button
                onClick={() => switchDataSource('cloud')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  dataSource === 'cloud'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-accent'
                }`}
              >
                Cloud
              </button>
            </div>
            {/* Connection test button */}
            <button
              onClick={testConnection}
              disabled={cnxStatus === 'testing'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                cnxStatus === 'ok' ? 'bg-green-600 text-white' :
                cnxStatus === 'error' ? 'bg-destructive text-destructive-foreground' :
                'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {cnxStatus === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
               cnxStatus === 'ok' ? <Wifi className="w-3.5 h-3.5" /> :
               cnxStatus === 'error' ? <WifiOff className="w-3.5 h-3.5" /> :
               <Wifi className="w-3.5 h-3.5" />}
              Test CNX
            </button>
            <Badge variant="secondary" className="text-xs">{data.length} cellules</Badge>
            <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
        </div>
        {/* Connection test result */}
        {cnxMessage && (
          <div className={`text-xs px-3 py-2 rounded-md ${cnxStatus === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-destructive/10 text-destructive'}`}>
            {cnxMessage}
          </div>
        )}

        {/* Backend unreachable warning */}
        {backendReachable === false && (
          <div className="flex items-center gap-3 text-sm px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">
            <WifiOff className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold">Serveur local injoignable</p>
              <p className="text-xs text-amber-400/80 mt-0.5">
                Impossible de contacter <code className="bg-amber-500/20 px-1 rounded">localhost:3001</code>. 
                Lancez le backend avec <code className="bg-amber-500/20 px-1 rounded">cd server &amp;&amp; npm run dev</code> puis rechargez cette page.
                Si vous êtes sur la preview Lovable, ouvrez l'app en local sur <code className="bg-amber-500/20 px-1 rounded">http://localhost:5173</code>.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">🔍 Rechercher un paramètre</label>
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center justify-between w-full max-w-md h-9 px-3 text-xs rounded-md border border-input bg-background hover:bg-accent/50 transition-colors text-left">
                <span className={`truncate ${selectedParam === 'ALL' ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>
                  {selectedParam === 'ALL' ? 'Sélectionner un paramètre…' : selectedParam}
                </span>
                <Search className="w-3.5 h-3.5 shrink-0 opacity-50 ml-1" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
              <div className="flex items-center border-b border-border px-3">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  className="flex h-9 w-full bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
                  placeholder="Rechercher paramètre..."
                  value={paramSearch}
                  onChange={e => setParamSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="max-h-[280px] overflow-auto p-1">
                {filteredParams.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">Aucun paramètre trouvé</div>
                ) : (
                  filteredParams.map(p => (
                    <button
                      key={p}
                      onClick={() => { setSelectedParam(p); setParamSearch(''); }}
                      className={`flex items-center w-full px-3 py-2 text-xs rounded-sm hover:bg-accent transition-colors ${selectedParam === p ? 'bg-accent font-semibold' : ''}`}
                    >
                      {p}
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Row 2: Filters */}
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
            <Filter className="w-3 h-3" /> Filtres
          </div>
          <FilterSelect label="UR" value={selectedUr} options={['ALL', ...urs]} onChange={setSelectedUr} />
          <FilterSelect label="Plaque" value={selectedPlaque} options={['ALL', ...plaques]} onChange={setSelectedPlaque} />
          <FilterSelect label="Vendor" value={selectedVendor} options={['ALL', ...vendors]} onChange={setSelectedVendor} />
          <FilterSelect label="Site" value={selectedSite} options={['ALL', ...sites]} onChange={setSelectedSite} />
          <FilterSelect label="Cellule" value={selectedCell} options={['ALL', ...cells]} onChange={setSelectedCell} />
        </div>

        {/* Row 3: Aggregator & Color */}
        {selectedParam !== 'ALL' && (
          <div className="flex items-center gap-4 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Agréger par</span>
              <div className="flex rounded-md border border-input overflow-hidden">
                <button
                  onClick={() => setAggregator('ur')}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${aggregator === 'ur' ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-accent'}`}
                >UR</button>
                <button
                  onClick={() => setAggregator('plaque')}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${aggregator === 'plaque' ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-accent'}`}
                >Plaque</button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Couleur par</span>
              <div className="flex rounded-md border border-input overflow-hidden">
                <button
                  onClick={() => setColorBy('value')}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${colorBy === 'value' ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-accent'}`}
                >Valeur</button>
                <button
                  onClick={() => setColorBy('aggregator')}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${colorBy === 'aggregator' ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-accent'}`}
                >{aggLabel}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {selectedParam === 'ALL' ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            <div className="text-center">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Recherchez un paramètre</p>
              <p className="text-xs mt-1">Utilisez la barre de recherche ci-dessus pour trouver un paramètre CM Dump</p>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="distribution" className="space-y-4">
            <TabsList>
              <TabsTrigger value="distribution" className="gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> Distribution</TabsTrigger>
              <TabsTrigger value="table" className="gap-1.5"><TableIcon className="w-3.5 h-3.5" /> Données</TabsTrigger>
            </TabsList>

            {/* Distribution View */}
            <TabsContent value="distribution" className="space-y-6">
              {/* Global Summary */}
              <div className="border border-border rounded-lg bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Distribution globale — {selectedParam}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {globalDistribution.map((g, i) => (
                    <div key={g.value} className="rounded-lg border border-border p-3 text-center bg-muted/20">
                      <div className="text-lg font-bold text-foreground">{g.pct}%</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{g.value}</div>
                      <div className="text-[10px] text-muted-foreground">{g.count} cellules</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chart */}
              <div className="border border-border rounded-lg bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  Distribution par {aggLabel}
                  <span className="text-muted-foreground font-normal ml-2 text-xs">
                    — coloré par {colorBy === 'value' ? 'valeur' : aggLabel}
                  </span>
                </h3>
                {chartData.length > 0 ? (
                  <div className="space-y-4">
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 50 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis dataKey="_key" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: number, name: string) => [`${v} cellules`, name]} contentStyle={{ fontSize: 11 }} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          {stackKeys.map((key, i) => (
                            <Bar key={key} dataKey={key} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <DistributionTable data={chartData} dimensionLabel={colorBy === 'value' ? aggLabel : 'Valeur'} />
                  </div>
                ) : <p className="text-xs text-muted-foreground">Aucune donnée</p>}
              </div>
            </TabsContent>

            {/* Table View */}
            <TabsContent value="table" className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Rechercher site, cellule..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 h-9 text-xs" />
                </div>
                <span className="text-xs text-muted-foreground">{filteredData.length} résultats</span>
              </div>
              <div className="border border-border rounded-lg overflow-hidden bg-card">
                <div className="max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs font-semibold">Site</TableHead>
                        <TableHead className="text-xs font-semibold">Cellule</TableHead>
                        <TableHead className="text-xs font-semibold">Valeur</TableHead>
                        <TableHead className="text-xs font-semibold">DOR</TableHead>
                        <TableHead className="text-xs font-semibold">Plaque</TableHead>
                        <TableHead className="text-xs font-semibold">Vendor</TableHead>
                        <TableHead className="text-xs font-semibold">Bande</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredData.slice(0, 200).map(row => (
                        <TableRow key={row.id} className="hover:bg-muted/30">
                          <TableCell className="text-xs font-medium">{row.site_name || '—'}</TableCell>
                          <TableCell className="text-xs">{row.cell_name || '—'}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs font-mono">{row.value || '—'}</Badge></TableCell>
                          <TableCell className="text-xs">{row.dor || '—'}</TableCell>
                          <TableCell className="text-xs">{row.plaque || '—'}</TableCell>
                          <TableCell className="text-xs">{row.vendor || '—'}</TableCell>
                          <TableCell className="text-xs">{row.bande || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {filteredData.length > 200 && (
                  <div className="text-center py-2 text-xs text-muted-foreground bg-muted/30">
                    Affichage limité à 200 lignes sur {filteredData.length}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

// Distribution table
const DistributionTable: React.FC<{ data: any[]; dimensionLabel: string }> = ({ data, dimensionLabel }) => (
  <div className="overflow-auto max-h-[250px]">
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50">
          <TableHead className="text-xs font-semibold">{dimensionLabel}</TableHead>
          <TableHead className="text-xs font-semibold">Total</TableHead>
          <TableHead className="text-xs font-semibold">Détails (count / %)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, i) => (
          <TableRow key={i}>
            <TableCell className="text-xs font-medium">{row._key}</TableCell>
            <TableCell className="text-xs font-mono">{row.total}</TableCell>
            <TableCell className="text-xs">
              <div className="flex flex-wrap gap-1.5">
                {row._details.map((d: any, j: number) => (
                  <Badge key={j} variant="outline" className="text-[10px] font-mono gap-1">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: CHART_COLORS[j % CHART_COLORS.length] }} />
                    {d.value}: {d.count} ({d.pct}%)
                  </Badge>
                ))}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

// Filter select with search
const FilterSelect: React.FC<{ label: string; value: string; options: string[]; onChange: (v: string) => void }> = ({ label, value, options, onChange }) => {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    if (!search) return options;
    const s = search.toLowerCase();
    return options.filter(o => o === 'ALL' || o.toLowerCase().includes(s));
  }, [options, search]);
  const displayValue = value === 'ALL' ? 'Tous' : value;
  return (
    <div className="space-y-1 min-w-[120px]">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }}>
        <PopoverTrigger asChild>
          <button className="flex items-center justify-between w-full h-7 px-2.5 text-xs rounded-md border border-input bg-background hover:bg-accent/50 transition-colors text-left">
            <span className="truncate max-w-[100px]">{displayValue}</span>
            <ChevronDown className="w-3 h-3 shrink-0 opacity-50 ml-1" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align="start">
          <div className="flex items-center border-b border-border px-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              className="flex h-8 w-full bg-transparent px-2 py-1 text-xs outline-none placeholder:text-muted-foreground"
              placeholder={`Rechercher...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-[200px] overflow-auto p-1">
            {filtered.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">Aucun résultat</div>
            ) : filtered.map(opt => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); setSearch(''); }}
                className={`flex items-center w-full px-2 py-1.5 text-xs rounded-sm hover:bg-accent transition-colors ${value === opt ? 'bg-accent font-medium' : ''}`}
              >
                {opt === 'ALL' ? 'Tous' : opt}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default TopologiePage;
