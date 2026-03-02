import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { dumpParameterApi } from '@/lib/localDb';
import { supabase } from '@/integrations/supabase/client';
import { getApiUrl, getPreferredDataSource, setPreferredDataSource } from '@/lib/apiConfig';
import {
  Search, Filter, Download, Loader2, ChevronDown, Wifi, WifiOff, Database,
  Settings2, Layers, FileSpreadsheet, Check, X, AlertCircle, ChevronLeft, ChevronRight, RotateCcw
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
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

type AggregatorKey = 'vendor' | 'dor' | 'plaque' | 'ur' | 'value';
type ColorByKey = 'ne_aggregation' | 'value';

// ─── Multi-select filter chip component ───
const MultiSelectFilter: React.FC<{
  label: string;
  selected: string[];
  options: string[];
  onChange: (v: string[]) => void;
  maxChips?: number;
}> = ({ label, selected, options, onChange, maxChips = 3 }) => {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    if (!search) return options;
    const s = search.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(s));
  }, [options, search]);

  const toggle = (val: string) => {
    if (selected.includes(val)) onChange(selected.filter(v => v !== val));
    else onChange([...selected, val]);
  };

  const displayChips = selected.slice(0, maxChips);
  const overflow = selected.length - maxChips;

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1 flex-wrap w-full min-h-[28px] px-2 py-1 text-xs rounded-md border border-input bg-background hover:bg-accent/50 transition-colors text-left">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">Tous</span>
            ) : (
              <>
                {displayChips.map(v => (
                  <span key={v} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium max-w-[100px] truncate">
                    {v}
                    <X className="w-2.5 h-2.5 cursor-pointer opacity-60 hover:opacity-100 shrink-0" onClick={(e) => { e.stopPropagation(); toggle(v); }} />
                  </span>
                ))}
                {overflow > 0 && <span className="text-[10px] text-muted-foreground">+{overflow}</span>}
              </>
            )}
            <ChevronDown className="w-3 h-3 shrink-0 opacity-50 ml-auto" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-0" align="start">
          <div className="flex items-center border-b border-border px-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              className="flex h-8 w-full bg-transparent px-2 py-1 text-xs outline-none placeholder:text-muted-foreground"
              placeholder="Rechercher..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          {selected.length > 0 && (
            <button onClick={() => onChange([])} className="w-full px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground text-left border-b border-border hover:bg-muted/50">
              Tout désélectionner
            </button>
          )}
          <div className="max-h-[200px] overflow-auto p-1">
            {filtered.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">Aucun résultat</div>
            ) : filtered.map(opt => (
              <button
                key={opt}
                onClick={() => toggle(opt)}
                className={`flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-sm hover:bg-accent transition-colors`}
              >
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${selected.includes(opt) ? 'bg-primary border-primary' : 'border-input'}`}>
                  {selected.includes(opt) && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </div>
                <span className="truncate">{opt}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

// ─── Single-select component ───
const SingleSelect: React.FC<{
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="flex flex-col gap-0.5">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1.5 text-xs rounded-md text-left transition-colors ${value === opt.value ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted/80 text-foreground'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
};

const TopologiePage: React.FC = () => {
  const [mainTab, setMainTab] = useState('param_distribution');
  const [cnxStatus, setCnxStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [cnxMessage, setCnxMessage] = useState('');
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  const [dataSource, setDataSource] = useState<'local' | 'cloud'>(getPreferredDataSource());
  const shouldUseLocal = dataSource === 'local';

  // ─── Available filter options (loaded once) ───
  const [availableParams, setAvailableParams] = useState<string[]>([]);
  const [availableVendors, setAvailableVendors] = useState<string[]>([]);
  const [availableDors, setAvailableDors] = useState<string[]>([]);
  const [availablePlaques, setAvailablePlaques] = useState<string[]>([]);
  const [availableSites, setAvailableSites] = useState<string[]>([]);
  const [availableCells, setAvailableCells] = useState<string[]>([]);
  const [availableUrs, setAvailableUrs] = useState<string[]>([]);
  const [filtersLoading, setFiltersLoading] = useState(false);

  // ─── PARAM DISTRIBUTION: pending (draft) vs applied filters ───
  const [pdPendingParams, setPdPendingParams] = useState<string[]>([]);
  const [pdPendingVendor, setPdPendingVendor] = useState<string[]>([]);
  const [pdPendingDor, setPdPendingDor] = useState<string[]>([]);
  const [pdPendingPlaque, setPdPendingPlaque] = useState<string[]>([]);
  const [pdPendingAggregator, setPdPendingAggregator] = useState<AggregatorKey>('vendor');
  const [pdPendingColorBy, setPdPendingColorBy] = useState<ColorByKey>('value');

  const [pdAppliedParams, setPdAppliedParams] = useState<string[]>([]);
  const [pdAppliedVendor, setPdAppliedVendor] = useState<string[]>([]);
  const [pdAppliedDor, setPdAppliedDor] = useState<string[]>([]);
  const [pdAppliedPlaque, setPdAppliedPlaque] = useState<string[]>([]);
  const [pdAppliedAggregator, setPdAppliedAggregator] = useState<AggregatorKey>('vendor');
  const [pdAppliedColorBy, setPdAppliedColorBy] = useState<ColorByKey>('value');
  const [pdData, setPdData] = useState<DumpRow[]>([]);
  const [pdLoading, setPdLoading] = useState(false);
  const [pdConfirmed, setPdConfirmed] = useState(false);

  // ─── RAW PARAMETER: pending vs applied ───
  const [rawPendingVendor, setRawPendingVendor] = useState<string[]>([]);
  const [rawPendingDor, setRawPendingDor] = useState<string[]>([]);
  const [rawPendingPlaque, setRawPendingPlaque] = useState<string[]>([]);
  const [rawPendingSite, setRawPendingSite] = useState<string[]>([]);
  const [rawPendingCell, setRawPendingCell] = useState<string[]>([]);

  const [rawAppliedVendor, setRawAppliedVendor] = useState<string[]>([]);
  const [rawAppliedDor, setRawAppliedDor] = useState<string[]>([]);
  const [rawAppliedPlaque, setRawAppliedPlaque] = useState<string[]>([]);
  const [rawAppliedSite, setRawAppliedSite] = useState<string[]>([]);
  const [rawAppliedCell, setRawAppliedCell] = useState<string[]>([]);
  const [rawData, setRawData] = useState<DumpRow[]>([]);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawConfirmed, setRawConfirmed] = useState(false);
  const [rawPage, setRawPage] = useState(1);
  const [rawSearch, setRawSearch] = useState('');
  const [rawSortCol, setRawSortCol] = useState<string>('site_name');
  const [rawSortDir, setRawSortDir] = useState<'asc' | 'desc'>('asc');
  const RAW_PAGE_SIZE = 50;

  // ─── Dirty detection ───
  const pdDirty = useMemo(() => {
    return JSON.stringify({ p: pdPendingParams, v: pdPendingVendor, d: pdPendingDor, pl: pdPendingPlaque, a: pdPendingAggregator, c: pdPendingColorBy }) !==
      JSON.stringify({ p: pdAppliedParams, v: pdAppliedVendor, d: pdAppliedDor, pl: pdAppliedPlaque, a: pdAppliedAggregator, c: pdAppliedColorBy });
  }, [pdPendingParams, pdPendingVendor, pdPendingDor, pdPendingPlaque, pdPendingAggregator, pdPendingColorBy, pdAppliedParams, pdAppliedVendor, pdAppliedDor, pdAppliedPlaque, pdAppliedAggregator, pdAppliedColorBy]);

  const rawDirty = useMemo(() => {
    return JSON.stringify({ v: rawPendingVendor, d: rawPendingDor, pl: rawPendingPlaque, s: rawPendingSite, c: rawPendingCell }) !==
      JSON.stringify({ v: rawAppliedVendor, d: rawAppliedDor, pl: rawAppliedPlaque, s: rawAppliedSite, c: rawAppliedCell });
  }, [rawPendingVendor, rawPendingDor, rawPendingPlaque, rawPendingSite, rawPendingCell, rawAppliedVendor, rawAppliedDor, rawAppliedPlaque, rawAppliedSite, rawAppliedCell]);

  const switchDataSource = (next: 'local' | 'cloud') => { setDataSource(next); setPreferredDataSource(next); };

  // ─── Cloud helpers ───
  const fetchDistinctCloud = async (col: string): Promise<string[]> => {
    try {
      const { data: rows, error } = await (supabase as any).from('parameter_dump').select(col).limit(10000);
      if (error) throw error;
      return [...new Set((rows || []).map((r: any) => r[col]).filter(Boolean))].sort() as string[];
    } catch { return []; }
  };

  const fetchRowsCloud = async (filters: Record<string, string | string[]>, cols: string, limit = 5000): Promise<any[]> => {
    try {
      let query = (supabase as any).from('parameter_dump').select(cols).limit(limit);
      Object.entries(filters).forEach(([k, v]) => {
        if (Array.isArray(v) && v.length > 0) query = query.in(k, v);
        else if (typeof v === 'string') query = query.eq(k, v);
      });
      const { data: rows, error } = await query;
      if (error) throw error;
      return rows || [];
    } catch { return []; }
  };

  const fetchDistinctLocal = async (col: string) => {
    try {
      const rows = await dumpParameterApi.distinct(col);
      return [...new Set((rows || []).map((r: any) => r[col]).filter(Boolean))].sort() as string[];
    } catch { return []; }
  };

  const fetchRowsLocal = async (filters: Record<string, string | string[]>, cols: string, limit = 5000) => {
    try { return await dumpParameterApi.query(filters as any, cols, limit); } catch { return []; }
  };

  const fetchDistinct = shouldUseLocal ? fetchDistinctLocal : fetchDistinctCloud;
  const fetchRows = shouldUseLocal ? fetchRowsLocal : fetchRowsCloud;

  // Probe backend
  useEffect(() => {
    if (!shouldUseLocal) { setBackendReachable(null); return; }
    const probe = async () => {
      try {
        const resp = await fetch(`${import.meta.env.VITE_LOCAL_API || 'http://localhost:3001'}/api/health`, { signal: AbortSignal.timeout(3000) });
        setBackendReachable(resp.ok);
      } catch { setBackendReachable(false); }
    };
    probe();
  }, [shouldUseLocal]);

  // Load filter options
  useEffect(() => {
    if (shouldUseLocal && backendReachable === false) return;
    setFiltersLoading(true);
    const load = async () => {
      const [p, v, d, pl, s, c, u] = await Promise.all([
        fetchDistinct('parameter'),
        fetchDistinct('vendor'),
        fetchDistinct('dor'),
        fetchDistinct('plaque'),
        fetchDistinct('site_name'),
        fetchDistinct('cell_name'),
        fetchDistinct('ur'),
      ]);
      setAvailableParams(p); setAvailableVendors(v); setAvailableDors(d);
      setAvailablePlaques(pl); setAvailableSites(s); setAvailableCells(c); setAvailableUrs(u);
      setFiltersLoading(false);
    };
    load();
  }, [backendReachable, dataSource]);

  // ─── PD Confirm ───
  const pdConfirm = useCallback(async () => {
    if (pdPendingParams.length === 0) return;
    setPdAppliedParams([...pdPendingParams]);
    setPdAppliedVendor([...pdPendingVendor]);
    setPdAppliedDor([...pdPendingDor]);
    setPdAppliedPlaque([...pdPendingPlaque]);
    setPdAppliedAggregator(pdPendingAggregator);
    setPdAppliedColorBy(pdPendingColorBy);
    setPdLoading(true);
    setPdConfirmed(true);

    const filters: Record<string, string | string[]> = {};
    if (pdPendingParams.length > 0) filters.parameter = pdPendingParams;
    if (pdPendingVendor.length > 0) filters.vendor = pdPendingVendor;
    if (pdPendingDor.length > 0) filters.dor = pdPendingDor;
    if (pdPendingPlaque.length > 0) filters.plaque = pdPendingPlaque;

    const rows = await fetchRows(filters, 'id, site_name, cell_name, parameter, value, plaque, ur, vendor, bande, dr, dor');
    setPdData(rows || []);
    setPdLoading(false);
  }, [pdPendingParams, pdPendingVendor, pdPendingDor, pdPendingPlaque, pdPendingAggregator, pdPendingColorBy, fetchRows]);

  const pdReset = () => {
    setPdPendingParams([]); setPdPendingVendor([]); setPdPendingDor([]); setPdPendingPlaque([]);
    setPdPendingAggregator('vendor'); setPdPendingColorBy('value');
    setPdAppliedParams([]); setPdAppliedVendor([]); setPdAppliedDor([]); setPdAppliedPlaque([]);
    setPdAppliedAggregator('vendor'); setPdAppliedColorBy('value');
    setPdData([]); setPdConfirmed(false);
  };

  // ─── Raw Confirm ───
  const rawConfirm = useCallback(async () => {
    setRawAppliedVendor([...rawPendingVendor]);
    setRawAppliedDor([...rawPendingDor]);
    setRawAppliedPlaque([...rawPendingPlaque]);
    setRawAppliedSite([...rawPendingSite]);
    setRawAppliedCell([...rawPendingCell]);
    setRawLoading(true);
    setRawConfirmed(true);
    setRawPage(1);

    const filters: Record<string, string | string[]> = {};
    if (rawPendingVendor.length > 0) filters.vendor = rawPendingVendor;
    if (rawPendingDor.length > 0) filters.dor = rawPendingDor;
    if (rawPendingPlaque.length > 0) filters.plaque = rawPendingPlaque;
    if (rawPendingSite.length > 0) filters.site_name = rawPendingSite;
    if (rawPendingCell.length > 0) filters.cell_name = rawPendingCell;

    const rows = await fetchRows(filters, 'id, site_name, cell_name, parameter, value, plaque, ur, vendor, bande, dr, dor');
    setRawData(rows || []);
    setRawLoading(false);
  }, [rawPendingVendor, rawPendingDor, rawPendingPlaque, rawPendingSite, rawPendingCell, fetchRows]);

  const rawReset = () => {
    setRawPendingVendor([]); setRawPendingDor([]); setRawPendingPlaque([]);
    setRawPendingSite([]); setRawPendingCell([]);
    setRawAppliedVendor([]); setRawAppliedDor([]); setRawAppliedPlaque([]);
    setRawAppliedSite([]); setRawAppliedCell([]);
    setRawData([]); setRawConfirmed(false); setRawPage(1);
  };

  // ─── PD Chart data ───
  const aggregator = pdAppliedAggregator;
  const colorBy = pdAppliedColorBy;

  const allValues = useMemo(() => [...new Set(pdData.map(r => r.value || 'N/A'))].sort(), [pdData]);
  const allAggKeys = useMemo(() => [...new Set(pdData.map(r => (r as any)[aggregator] || 'N/A'))].sort(), [pdData, aggregator]);

  const chartData = useMemo(() => {
    if (pdData.length === 0) return [];
    if (colorBy === 'value') {
      const map: Record<string, Record<string, number>> = {};
      pdData.forEach(r => {
        const key = (r as any)[aggregator] || 'N/A';
        const val = r.value || 'N/A';
        if (!map[key]) map[key] = {};
        map[key][val] = (map[key][val] || 0) + 1;
      });
      return Object.entries(map).map(([key, vals]) => {
        const total = Object.values(vals).reduce((a, b) => a + b, 0);
        return { _key: key, total, ...vals, _details: Object.entries(vals).map(([v, c]) => ({ value: v, count: c, pct: ((c / total) * 100).toFixed(1) })) };
      }).sort((a, b) => b.total - a.total);
    } else {
      const map: Record<string, Record<string, number>> = {};
      pdData.forEach(r => {
        const val = r.value || 'N/A';
        const key = (r as any)[aggregator] || 'N/A';
        if (!map[val]) map[val] = {};
        map[val][key] = (map[val][key] || 0) + 1;
      });
      return Object.entries(map).map(([val, keys]) => {
        const total = Object.values(keys).reduce((a, b) => a + b, 0);
        return { _key: val, total, ...keys, _details: Object.entries(keys).map(([k, c]) => ({ value: k, count: c, pct: ((c / total) * 100).toFixed(1) })) };
      }).sort((a, b) => b.total - a.total);
    }
  }, [pdData, aggregator, colorBy]);

  const stackKeys = colorBy === 'value' ? allValues : allAggKeys;

  const globalDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    pdData.forEach(r => { const val = r.value || 'N/A'; map[val] = (map[val] || 0) + 1; });
    const total = pdData.length;
    return Object.entries(map).map(([value, count]) => ({
      value, count, pct: total > 0 ? ((count / total) * 100).toFixed(1) : '0'
    })).sort((a, b) => b.count - a.count);
  }, [pdData]);

  // ─── Raw sorted / filtered / paginated ───
  const rawFiltered = useMemo(() => {
    let d = rawData;
    if (rawSearch) {
      const s = rawSearch.toLowerCase();
      d = d.filter(r => r.site_name?.toLowerCase().includes(s) || r.cell_name?.toLowerCase().includes(s) || r.parameter?.toLowerCase().includes(s) || r.value?.toLowerCase().includes(s));
    }
    d = [...d].sort((a, b) => {
      const av = (a as any)[rawSortCol] ?? '';
      const bv = (b as any)[rawSortCol] ?? '';
      return rawSortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return d;
  }, [rawData, rawSearch, rawSortCol, rawSortDir]);

  const rawTotalPages = Math.max(1, Math.ceil(rawFiltered.length / RAW_PAGE_SIZE));
  const rawPageData = rawFiltered.slice((rawPage - 1) * RAW_PAGE_SIZE, rawPage * RAW_PAGE_SIZE);

  const toggleRawSort = (col: string) => {
    if (rawSortCol === col) setRawSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setRawSortCol(col); setRawSortDir('asc'); }
  };

  const exportCSV = (rows: DumpRow[]) => {
    if (!rows.length) return;
    const headers = ['Site', 'Cell', 'Parameter', 'Value', 'DOR', 'Plaque', 'Vendor', 'Bande'];
    const csv = [headers.join(','), ...rows.map(r => [r.site_name, r.cell_name, r.parameter, r.value, r.dor, r.plaque, r.vendor, r.bande].join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `parameters_export.csv`; a.click();
  };

  const testConnection = async () => {
    setCnxStatus('testing'); setCnxMessage('');
    try {
      if (shouldUseLocal) {
        const resp = await fetch(`${getApiUrl('dump-parameter')}?${new URLSearchParams({ distinct_col: 'parameter' })}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const rows = await resp.json();
        setCnxStatus('ok'); setCnxMessage(`✅ Connecté (Local) — ${rows.length} paramètres`);
      } else {
        const { data: rows, error } = await (supabase as any).from('parameter_dump').select('parameter').limit(1);
        if (error) throw error;
        setCnxStatus('ok'); setCnxMessage(`✅ Connecté (Cloud) — parameter_dump accessible`);
      }
    } catch (err: any) { setCnxStatus('error'); setCnxMessage(`❌ Erreur: ${err.message || err}`); }
  };

  const aggLabel = (key: AggregatorKey) => ({ vendor: 'Vendor', dor: 'DOR', plaque: 'Plaque', ur: 'NetAct', value: 'Valeur' }[key] || key);
  const backendLabel = dataSource === 'local' ? 'Local (RAN_OP)' : 'Cloud';

  // ─── Summary line builders ───
  const pdSummary = pdConfirmed ? (
    <span>
      <strong>{pdAppliedParams.length}</strong> paramètre(s) sélectionné(s)
      {pdAppliedVendor.length > 0 && <> · Vendor: {pdAppliedVendor.join(', ')}</>}
      {pdAppliedDor.length > 0 && <> · DOR: {pdAppliedDor.join(', ')}</>}
      {pdAppliedPlaque.length > 0 && <> · Plaque: {pdAppliedPlaque.join(', ')}</>}
      <> · Agrégation: {aggLabel(pdAppliedAggregator)}</>
      <> · {pdData.length} résultats</>
    </span>
  ) : null;

  const rawSummary = rawConfirmed ? (
    <span>
      {rawAppliedVendor.length > 0 && <>Vendor: {rawAppliedVendor.join(', ')} · </>}
      {rawAppliedDor.length > 0 && <>DOR: {rawAppliedDor.join(', ')} · </>}
      {rawAppliedPlaque.length > 0 && <>Plaque: {rawAppliedPlaque.join(', ')} · </>}
      {rawAppliedSite.length > 0 && <>Sites: {rawAppliedSite.length} · </>}
      <strong>{rawFiltered.length}</strong> résultats
    </span>
  ) : null;

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Topologie Réseau</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Distribution paramètres, données brutes</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs gap-1"><Database className="w-3 h-3" />{backendLabel}</Badge>
            <div className="inline-flex rounded-lg border border-border overflow-hidden">
              <button onClick={() => switchDataSource('local')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${dataSource === 'local' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}>Local</button>
              <button onClick={() => switchDataSource('cloud')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${dataSource === 'cloud' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}>Cloud</button>
            </div>
            <button onClick={testConnection} disabled={cnxStatus === 'testing'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${cnxStatus === 'ok' ? 'bg-primary text-primary-foreground' : cnxStatus === 'error' ? 'bg-destructive text-destructive-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}>
              {cnxStatus === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
              Test CNX
            </button>
          </div>
        </div>

        {cnxMessage && (
          <div className={`text-xs px-3 py-2 rounded-md mb-2 ${cnxStatus === 'ok' ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>{cnxMessage}</div>
        )}

        {shouldUseLocal && backendReachable === false && (
          <div className="flex items-center gap-3 text-sm px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive mb-2">
            <WifiOff className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold">Serveur local injoignable</p>
              <p className="text-xs mt-0.5">Lancez le backend avec <code className="bg-amber-500/20 px-1 rounded">cd server && npm run dev</code></p>
            </div>
          </div>
        )}

        <Tabs value={mainTab} onValueChange={setMainTab}>
          <TabsList className="bg-muted/50">
            <TabsTrigger value="param_distribution" className="gap-1.5 text-xs">
              <Layers className="w-3.5 h-3.5" /> Parameter Distribution
            </TabsTrigger>
            <TabsTrigger value="raw_parameter" className="gap-1.5 text-xs">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Raw Parameters
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ═══════════ HORIZONTAL FILTER BAR ═══════════ */}
        <div className="border-b border-border bg-card px-5 py-3 space-y-3">
          {filtersLoading ? (
            <div className="flex gap-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-36" />)}
            </div>
          ) : mainTab === 'param_distribution' ? (
            <>
              {/* Row 1: Parameter + Filters */}
              <div className="flex items-end gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground self-center mr-1">
                  <Filter className="w-3 h-3" /> Filtres
                </div>
                <div className="min-w-[180px]">
                  <MultiSelectFilter label="Paramètres *" selected={pdPendingParams} options={availableParams} onChange={setPdPendingParams} />
                </div>
                <div className="min-w-[140px]">
                  <MultiSelectFilter label="Vendor" selected={pdPendingVendor} options={availableVendors} onChange={setPdPendingVendor} />
                </div>
                <div className="min-w-[140px]">
                  <MultiSelectFilter label="NetAct (UR)" selected={pdPendingVendor} options={availableUrs} onChange={() => {}} />
                </div>
                <div className="min-w-[140px]">
                  <MultiSelectFilter label="DOR" selected={pdPendingDor} options={availableDors} onChange={setPdPendingDor} />
                </div>
                <div className="min-w-[140px]">
                  <MultiSelectFilter label="Plaque" selected={pdPendingPlaque} options={availablePlaques} onChange={setPdPendingPlaque} />
                </div>
              </div>
              {pdPendingParams.length === 0 && (
                <p className="text-[10px] text-destructive">Sélectionnez au moins 1 paramètre</p>
              )}

              {/* Row 2: Aggregation + Color by + Confirm/Reset */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Agrégation</span>
                  <div className="flex rounded-md border border-input overflow-hidden">
                    {[
                      { value: 'vendor', label: 'Vendor' },
                      { value: 'ur', label: 'NetAct' },
                      { value: 'dor', label: 'DOR' },
                      { value: 'plaque', label: 'Plaque' },
                      { value: 'value', label: 'Valeur' },
                    ].map(opt => (
                      <button key={opt.value} onClick={() => setPdPendingAggregator(opt.value as AggregatorKey)}
                        className={`px-2.5 py-1 text-xs font-medium transition-colors ${pdPendingAggregator === opt.value ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-accent'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Coloré par</span>
                  <div className="flex rounded-md border border-input overflow-hidden">
                    <button onClick={() => setPdPendingColorBy('ne_aggregation')}
                      className={`px-2.5 py-1 text-xs font-medium transition-colors ${pdPendingColorBy === 'ne_aggregation' ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-accent'}`}>
                      NE ({aggLabel(pdPendingAggregator)})
                    </button>
                    <button onClick={() => setPdPendingColorBy('value')}
                      className={`px-2.5 py-1 text-xs font-medium transition-colors ${pdPendingColorBy === 'value' ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-accent'}`}>
                      Valeur
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  {pdDirty && (
                    <span className="flex items-center gap-1 text-[10px] text-destructive font-medium">
                      <AlertCircle className="w-3 h-3" /> Non appliqué
                    </span>
                  )}
                  <button onClick={pdConfirm} disabled={pdPendingParams.length === 0}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    <Check className="w-3.5 h-3.5" /> Confirm
                  </button>
                  <button onClick={pdReset}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-muted/50 transition-colors">
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground self-center mr-1">
                <Filter className="w-3 h-3" /> Filtres
              </div>
              <div className="min-w-[140px]">
                <MultiSelectFilter label="Vendor" selected={rawPendingVendor} options={availableVendors} onChange={setRawPendingVendor} />
              </div>
              <div className="min-w-[140px]">
                <MultiSelectFilter label="NetAct (UR)" selected={rawPendingDor} options={availableUrs} onChange={setRawPendingDor} />
              </div>
              <div className="min-w-[140px]">
                <MultiSelectFilter label="DOR" selected={rawPendingDor} options={availableDors} onChange={setRawPendingDor} />
              </div>
              <div className="min-w-[140px]">
                <MultiSelectFilter label="Plaque" selected={rawPendingPlaque} options={availablePlaques} onChange={setRawPendingPlaque} />
              </div>
              <div className="min-w-[140px]">
                <MultiSelectFilter label="Site" selected={rawPendingSite} options={availableSites} onChange={setRawPendingSite} />
              </div>
              <div className="min-w-[140px]">
                <MultiSelectFilter label="Cell" selected={rawPendingCell} options={availableCells} onChange={setRawPendingCell} />
              </div>

              <div className="flex items-center gap-2 ml-auto self-end">
                {rawDirty && (
                  <span className="flex items-center gap-1 text-[10px] text-destructive font-medium">
                    <AlertCircle className="w-3 h-3" /> Non appliqué
                  </span>
                )}
                <button onClick={rawConfirm}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                  <Check className="w-3.5 h-3.5" /> Confirm
                </button>
                <button onClick={rawReset}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-muted/50 transition-colors">
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════ MAIN RESULTS AREA ═══════════ */}
        <div className="flex-1 overflow-auto">

          {/* ─── PARAM DISTRIBUTION ─── */}
          {mainTab === 'param_distribution' && (
            <div className="p-5 space-y-5">
              {/* Summary */}
              {pdSummary && (
                <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-2 border border-border">
                  {pdSummary}
                </div>
              )}

              {!pdConfirmed ? (
                <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
                  <div className="text-center">
                    <Layers className="w-14 h-14 mx-auto mb-4 opacity-20" />
                    <p className="font-medium text-sm">Configurez vos filtres</p>
                    <p className="text-xs mt-1">Sélectionnez au moins un paramètre puis cliquez sur <strong>Confirm</strong></p>
                  </div>
                </div>
              ) : pdLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-6 w-64" />
                  <div className="grid grid-cols-4 gap-3">
                    {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-20" />)}
                  </div>
                  <Skeleton className="h-[300px]" />
                </div>
              ) : pdData.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  <div className="text-center">
                    <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Aucun résultat</p>
                    <p className="text-xs mt-1">Modifiez vos filtres et réessayez</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Global distribution cards */}
                  <div className="border border-border rounded-lg bg-card p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3">
                      Distribution globale — {pdAppliedParams.join(', ')}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                      {globalDistribution.slice(0, 12).map(g => (
                        <div key={g.value} className="rounded-lg border border-border p-3 text-center bg-muted/20">
                          <div className="text-lg font-bold text-foreground">{g.pct}%</div>
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">{g.value}</div>
                          <div className="text-[10px] text-muted-foreground">{g.count} cellules</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Chart */}
                  <div className="border border-border rounded-lg bg-card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        Distribution par {aggLabel(pdAppliedAggregator)}
                        <span className="text-muted-foreground font-normal ml-2 text-xs">— coloré par {pdAppliedColorBy === 'value' ? 'valeur' : aggLabel(pdAppliedAggregator)}</span>
                      </h3>
                      <button onClick={() => exportCSV(pdData)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
                        <Download className="w-3.5 h-3.5" /> Export
                      </button>
                    </div>
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
                        <DistributionTable data={chartData} dimensionLabel={colorBy === 'value' ? aggLabel(pdAppliedAggregator) : 'Valeur'} />
                      </div>
                    ) : <p className="text-xs text-muted-foreground">Aucune donnée</p>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── RAW PARAMETERS ─── */}
          {mainTab === 'raw_parameter' && (
            <div className="p-5 space-y-4">
              {rawSummary && (
                <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-2 border border-border">
                  {rawSummary}
                </div>
              )}

              {!rawConfirmed ? (
                <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
                  <div className="text-center">
                    <FileSpreadsheet className="w-14 h-14 mx-auto mb-4 opacity-20" />
                    <p className="font-medium text-sm">Configurez vos filtres</p>
                    <p className="text-xs mt-1">Sélectionnez vos critères puis cliquez sur <strong>Confirm</strong></p>
                  </div>
                </div>
              ) : rawLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-[400px]" />
                </div>
              ) : rawData.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  <div className="text-center">
                    <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Aucun résultat</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input placeholder="Rechercher dans les résultats..." value={rawSearch} onChange={e => { setRawSearch(e.target.value); setRawPage(1); }} className="pl-9 h-9 text-xs" />
                    </div>
                    <Badge variant="secondary" className="text-xs">{rawFiltered.length} résultats</Badge>
                    <button onClick={() => exportCSV(rawFiltered)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                      <Download className="w-3.5 h-3.5" /> Export CSV
                    </button>
                  </div>

                  <div className="border border-border rounded-lg overflow-hidden bg-card">
                    <div className="max-h-[calc(100vh-340px)] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            {[
                              { key: 'site_name', label: 'Site' },
                              { key: 'cell_name', label: 'Cellule' },
                              { key: 'parameter', label: 'Paramètre' },
                              { key: 'value', label: 'Valeur' },
                              { key: 'dor', label: 'DOR' },
                              { key: 'plaque', label: 'Plaque' },
                              { key: 'vendor', label: 'Vendor' },
                              { key: 'bande', label: 'Bande' },
                            ].map(col => (
                              <TableHead key={col.key}
                                className="text-xs font-semibold cursor-pointer select-none hover:text-foreground transition-colors"
                                onClick={() => toggleRawSort(col.key)}
                              >
                                <span className="flex items-center gap-1">
                                  {col.label}
                                  {rawSortCol === col.key && (
                                    <span className="text-primary text-[10px]">{rawSortDir === 'asc' ? '▲' : '▼'}</span>
                                  )}
                                </span>
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rawPageData.map(row => (
                            <TableRow key={row.id} className="hover:bg-muted/30">
                              <TableCell className="text-xs font-medium">{row.site_name || '—'}</TableCell>
                              <TableCell className="text-xs">{row.cell_name || '—'}</TableCell>
                              <TableCell className="text-xs font-mono">{row.parameter}</TableCell>
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
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-xs text-muted-foreground">
                      Page {rawPage} / {rawTotalPages} — lignes {((rawPage - 1) * RAW_PAGE_SIZE) + 1}–{Math.min(rawPage * RAW_PAGE_SIZE, rawFiltered.length)} sur {rawFiltered.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button disabled={rawPage <= 1} onClick={() => setRawPage(p => p - 1)}
                        className="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted/50 disabled:opacity-30 transition-colors">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button disabled={rawPage >= rawTotalPages} onClick={() => setRawPage(p => p + 1)}
                        className="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted/50 disabled:opacity-30 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Distribution detail table
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

export default TopologiePage;
