import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Search, Filter, Download, BarChart3, TableIcon, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

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

const TopologiePage: React.FC = () => {
  const [data, setData] = useState<DumpRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter states
  const [selectedSite, setSelectedSite] = useState('ALL');
  const [selectedCell, setSelectedCell] = useState('ALL');
  const [selectedParam, setSelectedParam] = useState('ALL');
  const [selectedDor, setSelectedDor] = useState('ALL');
  const [selectedPlaque, setSelectedPlaque] = useState('ALL');
  const [selectedVendor, setSelectedVendor] = useState('ALL');

  // Available filter options
  const [sites, setSites] = useState<string[]>([]);
  const [cells, setCells] = useState<string[]>([]);
  const [params, setParams] = useState<string[]>([]);
  const [dors, setDors] = useState<string[]>([]);
  const [plaques, setPlaques] = useState<string[]>([]);
  const [vendors, setVendors] = useState<string[]>([]);

  // Load filter options
  useEffect(() => {
    const loadFilters = async () => {
      const [siteRes, paramRes, dorRes, plaqueRes, vendorRes] = await Promise.all([
        supabase.from('dump_parameter').select('site_name').not('site_name', 'is', null).limit(1000),
        supabase.from('dump_parameter').select('parameter').limit(1000),
        supabase.from('dump_parameter').select('dor').not('dor', 'is', null).limit(1000),
        supabase.from('dump_parameter').select('plaque').not('plaque', 'is', null).limit(1000),
        supabase.from('dump_parameter').select('vendor').not('vendor', 'is', null).limit(1000),
      ]);

      const unique = (arr: any[], key: string) => [...new Set(arr?.map(r => r[key]).filter(Boolean))].sort() as string[];
      setSites(unique(siteRes.data || [], 'site_name'));
      setParams(unique(paramRes.data || [], 'parameter'));
      setDors(unique(dorRes.data || [], 'dor'));
      setPlaques(unique(plaqueRes.data || [], 'plaque'));
      setVendors(unique(vendorRes.data || [], 'vendor'));
    };
    loadFilters();
  }, []);

  // Load cells when site changes
  useEffect(() => {
    const loadCells = async () => {
      let query = supabase.from('dump_parameter').select('cell_name').not('cell_name', 'is', null);
      if (selectedSite !== 'ALL') query = query.eq('site_name', selectedSite);
      const { data } = await query.limit(1000);
      setCells([...new Set((data || []).map(r => r.cell_name).filter(Boolean))].sort() as string[]);
    };
    loadCells();
  }, [selectedSite]);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      if (selectedParam === 'ALL') {
        setData([]);
        return;
      }
      setLoading(true);
      let query = supabase.from('dump_parameter')
        .select('id, site_name, cell_name, parameter, value, plaque, dor, vendor, bande, dr, ur')
        .eq('parameter', selectedParam);

      if (selectedSite !== 'ALL') query = query.eq('site_name', selectedSite);
      if (selectedCell !== 'ALL') query = query.eq('cell_name', selectedCell);
      if (selectedDor !== 'ALL') query = query.eq('dor', selectedDor);
      if (selectedPlaque !== 'ALL') query = query.eq('plaque', selectedPlaque);
      if (selectedVendor !== 'ALL') query = query.eq('vendor', selectedVendor);

      const { data: rows, error } = await query.order('site_name').limit(5000);
      setData(rows || []);
      setLoading(false);
    };
    loadData();
  }, [selectedParam, selectedSite, selectedCell, selectedDor, selectedPlaque, selectedVendor]);

  // Search filter
  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    const s = searchTerm.toLowerCase();
    return data.filter(r =>
      r.site_name?.toLowerCase().includes(s) ||
      r.cell_name?.toLowerCase().includes(s) ||
      r.value?.toLowerCase().includes(s)
    );
  }, [data, searchTerm]);

  // Distribution by DOR
  const dorDistribution = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    data.forEach(r => {
      const dor = r.dor || 'N/A';
      const val = r.value || 'N/A';
      if (!map[dor]) map[dor] = {};
      map[dor][val] = (map[dor][val] || 0) + 1;
    });
    return Object.entries(map).map(([dor, vals]) => {
      const total = Object.values(vals).reduce((a, b) => a + b, 0);
      return { dor, total, ...vals, _details: Object.entries(vals).map(([v, c]) => ({ value: v, count: c, pct: ((c / total) * 100).toFixed(1) })) };
    }).sort((a, b) => b.total - a.total);
  }, [data]);

  // Distribution by Plaque
  const plaqueDistribution = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    data.forEach(r => {
      const plaque = r.plaque || 'N/A';
      const val = r.value || 'N/A';
      if (!map[plaque]) map[plaque] = {};
      map[plaque][val] = (map[plaque][val] || 0) + 1;
    });
    return Object.entries(map).map(([plaque, vals]) => {
      const total = Object.values(vals).reduce((a, b) => a + b, 0);
      return { plaque, total, ...vals, _details: Object.entries(vals).map(([v, c]) => ({ value: v, count: c, pct: ((c / total) * 100).toFixed(1) })) };
    }).sort((a, b) => b.total - a.total);
  }, [data]);

  // All unique values for chart keys
  const allValues = useMemo(() => {
    return [...new Set(data.map(r => r.value || 'N/A'))].sort();
  }, [data]);

  // Global distribution
  const globalDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    data.forEach(r => {
      const val = r.value || 'N/A';
      map[val] = (map[val] || 0) + 1;
    });
    const total = data.length;
    return Object.entries(map).map(([value, count]) => ({
      value, count, pct: total > 0 ? ((count / total) * 100).toFixed(1) : '0'
    })).sort((a, b) => b.count - a.count);
  }, [data]);

  const exportCSV = () => {
    if (!filteredData.length) return;
    const headers = ['Site', 'Cell', 'Parameter', 'Value', 'DOR', 'Plaque', 'Vendor', 'Bande'];
    const rows = filteredData.map(r => [r.site_name, r.cell_name, r.parameter, r.value, r.dor, r.plaque, r.vendor, r.bande].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `topologie_${selectedParam}.csv`; a.click();
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Topologie Réseau</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Exploration des paramètres CM Dump — Distribution par DOR & Plaque</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">{data.length} cellules</Badge>
            <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <FilterSelect label="Paramètre" value={selectedParam} options={['ALL', ...params]} onChange={setSelectedParam} />
          <FilterSelect label="Site" value={selectedSite} options={['ALL', ...sites]} onChange={setSelectedSite} />
          <FilterSelect label="Cellule" value={selectedCell} options={['ALL', ...cells]} onChange={setSelectedCell} />
          <FilterSelect label="DOR" value={selectedDor} options={['ALL', ...dors]} onChange={setSelectedDor} />
          <FilterSelect label="Plaque" value={selectedPlaque} options={['ALL', ...plaques]} onChange={setSelectedPlaque} />
          <FilterSelect label="Vendor" value={selectedVendor} options={['ALL', ...vendors]} onChange={setSelectedVendor} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {selectedParam === 'ALL' ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            <div className="text-center">
              <Filter className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Sélectionnez un paramètre</p>
              <p className="text-xs mt-1">Choisissez un paramètre CM Dump pour afficher les données</p>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="table" className="space-y-4">
            <TabsList>
              <TabsTrigger value="table" className="gap-1.5"><TableIcon className="w-3.5 h-3.5" /> Données</TabsTrigger>
              <TabsTrigger value="distribution" className="gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> Distribution</TabsTrigger>
            </TabsList>

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

              {/* Distribution by DOR */}
              <div className="border border-border rounded-lg bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Distribution par DOR</h3>
                {dorDistribution.length > 0 ? (
                  <div className="space-y-4">
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dorDistribution} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis dataKey="dor" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: number, name: string) => [`${v} cellules`, name]} contentStyle={{ fontSize: 11 }} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          {allValues.map((val, i) => (
                            <Bar key={val} dataKey={val} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <DistributionTable data={dorDistribution} dimensionKey="dor" dimensionLabel="DOR" />
                  </div>
                ) : <p className="text-xs text-muted-foreground">Aucune donnée</p>}
              </div>

              {/* Distribution by Plaque */}
              <div className="border border-border rounded-lg bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Distribution par Plaque</h3>
                {plaqueDistribution.length > 0 ? (
                  <div className="space-y-4">
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={plaqueDistribution} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis dataKey="plaque" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: number, name: string) => [`${v} cellules`, name]} contentStyle={{ fontSize: 11 }} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          {allValues.map((val, i) => (
                            <Bar key={val} dataKey={val} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <DistributionTable data={plaqueDistribution} dimensionKey="plaque" dimensionLabel="Plaque" />
                  </div>
                ) : <p className="text-xs text-muted-foreground">Aucune donnée</p>}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

// Reusable distribution table
const DistributionTable: React.FC<{ data: any[]; dimensionKey: string; dimensionLabel: string }> = ({ data, dimensionKey, dimensionLabel }) => (
  <div className="overflow-auto max-h-[250px]">
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50">
          <TableHead className="text-xs font-semibold">{dimensionLabel}</TableHead>
          <TableHead className="text-xs font-semibold">Total</TableHead>
          <TableHead className="text-xs font-semibold">Valeurs (count / %)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, i) => (
          <TableRow key={i}>
            <TableCell className="text-xs font-medium">{row[dimensionKey]}</TableCell>
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

// Filter select component
const FilterSelect: React.FC<{ label: string; value: string; options: string[]; onChange: (v: string) => void }> = ({ label, value, options, onChange }) => (
  <div className="space-y-1">
    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(opt => (
          <SelectItem key={opt} value={opt} className="text-xs">{opt === 'ALL' ? `Tous` : opt}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

export default TopologiePage;
