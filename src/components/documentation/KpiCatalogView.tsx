import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Search, Filter, Plus, Database, RefreshCw, ArrowUpDown,
  MoreVertical, Edit2, Trash2, BookOpen, Sigma, BarChart3,
  ArrowUp, ArrowDown, Hash, Copy, Check, Clock, User, Shield,
  Layers, Gauge, Info, FlaskConical, AlertTriangle, X,
  Eye, ChevronLeft, ChevronRight, SlidersHorizontal
} from 'lucide-react';
// API routing imports moved to API helpers block below
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { KpiCatalogEntry, KpiStatus, UserRole, CounterEntry } from './kpiCatalogTypes';
import { STATUS_CONFIG, CATEGORY_COLORS, VENDOR_COLORS, TECH_COLORS } from './kpiCatalogTypes';
import KpiCreateWizard from './KpiCreateWizard';
import CounterModal from './CounterModal';

/* ── API helpers ── */
// Route to KPI Engine (:8001) via getApiUrl, NOT Parser proxy (:8000)
// Parser proxy returns "Not authenticated" for /monitor/* endpoints
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';

function catalogUrl(path: string, params?: Record<string, string>): string {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return getApiUrl(`monitor/catalog${path}${qs}`);
}
function catalogHeaders(): Record<string, string> {
  return getApiHeaders();
}
async function catalogGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = catalogUrl(path, params);
  const res = await fetch(url, { headers: catalogHeaders() });
  if (!res.ok) { const body = await res.text().catch(() => ''); throw new Error(body || `API ${res.status}`); }
  const json = await res.json();
  if (json && json.unavailable === true) throw new Error('VPS_UNAVAILABLE');
  return json as T;
}
async function loadKpisFromSupabase(params?: Record<string, string>): Promise<any[]> {
  let query = supabase.from('kpi_catalog').select('*').order('display_name');
  if (params?.technology && params.technology !== 'ALL') query = query.ilike('techno', `%${params.technology}%`);
  if (params?.category && params.category !== 'ALL') query = query.ilike('famille', `%${params.category}%`);
  if (params?.search) query = query.or(`display_name.ilike.%${params.search}%,kpi_key.ilike.%${params.search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(row => ({
    ...row, kpi_code: row.kpi_key, category: row.famille || 'Other', unit: row.unit || '',
    technology: row.techno || 'ALL', vendor: 'ALL', formula: row.formula_sql || '',
    numerator_name: row.numerator || '', denominator_name: row.denominator || '', status: 'active',
  }));
}
async function catalogPost<T = any>(path: string, body: any): Promise<T> {
  const url = catalogUrl(path);
  const res = await fetch(url, { method: 'POST', headers: catalogHeaders(), body: JSON.stringify(body) });
  if (!res.ok) { const e = await res.json().catch(() => ({ detail: `API ${res.status}` })); throw new Error(e.detail || e.message || `API ${res.status}`); }
  return res.json();
}
async function catalogPut<T = any>(path: string, body: any): Promise<T> {
  const url = catalogUrl(path);
  const res = await fetch(url, { method: 'PUT', headers: catalogHeaders(), body: JSON.stringify(body) });
  if (!res.ok) { const e = await res.json().catch(() => ({ detail: `API ${res.status}` })); throw new Error(e.detail || e.message || `API ${res.status}`); }
  return res.json();
}
async function catalogDelete(path: string): Promise<void> {
  const url = catalogUrl(path);
  const res = await fetch(url, { method: 'DELETE', headers: catalogHeaders() });
  if (!res.ok) { const e = await res.json().catch(() => ({ detail: `API ${res.status}` })); throw new Error(e.detail || e.message || `API ${res.status}`); }
}

// Light mapping for list rows — skips expensive parseCounters().
// Raw counter strings are kept on the entry and parsed lazily when the
// detail drawer opens (see enrichEntry below). With ~4800 KPIs this cuts
// ~9600 regex+Set passes off the initial render.
function mapToEntry(k: any): KpiCatalogEntry {
  const rawNum = k.numerator_counters || k.numerateur || (typeof k.numerator === 'string' ? k.numerator : '') || '';
  const rawDen = k.denominator_counters || k.denominateur || (typeof k.denominator === 'string' ? k.denominator : '') || '';
  return {
    id: k.id || k.kpi_key, kpi_code: k.kpi_key || k.kpi_code, kpi_key: k.kpi_key,
    display_name: k.display_name || k.nom_ihm || k.kpi_key,
    description: k.description || k.definition_courte || '',
    category: k.category || k.famille || 'Other', unit: k.unit || k.unites || '',
    technology: (k.technology || k.techno || 'ALL') as any,
    vendor: k.vendor || 'ALL', formula: k.formula_sql || k.formula || '',
    formula_type: k.formula_type || 'ratio',
    numerator: {
      name: k.numerator_name || (typeof k.numerator === 'string' ? k.numerator : '') || 'Numerator',
      description: k.numerator_desc || '',
      counters: [], // lazy — filled by enrichEntry on selection
      source: k.num_source || 'OSS PM', granularity: k.num_granularity || '15min',
    },
    denominator: {
      name: k.denominator_name || (typeof k.denominator === 'string' ? k.denominator : '') || 'Denominator',
      description: k.denominator_desc || '',
      counters: [], // lazy — filled by enrichEntry on selection
      source: k.den_source || 'OSS PM', granularity: k.den_granularity || '15min',
    },
    thresholds: { green: k.seuil_vert ?? k.threshold_green ?? null, orange: k.seuil_orange ?? k.threshold_orange ?? null, red: k.seuil_rouge ?? k.threshold_red ?? null },
    status: (k.status as KpiStatus) || 'active',
    scope: k.scope || 'Cell', created_by: k.created_by || 'System',
    last_updated: k.updated_at || k.created_at || '—',
    is_normalized: k.is_normalized || false, supported_levels: k.supported_levels || [],
    // Stash raw strings on the entry for lazy parsing.
    _rawNumCounters: rawNum,
    _rawDenCounters: rawDen,
  } as KpiCatalogEntry & { _rawNumCounters: string; _rawDenCounters: string };
}

function enrichEntry(e: KpiCatalogEntry): KpiCatalogEntry {
  const raw = e as any;
  if (e.numerator.counters.length || e.denominator.counters.length) return e;
  return {
    ...e,
    numerator: { ...e.numerator, counters: parseCounters(raw._rawNumCounters || '') },
    denominator: { ...e.denominator, counters: parseCounters(raw._rawDenCounters || '') },
  };
}

// Reserved words to strip from counter formulas (SQL/math keywords, not counter names)
const FORMULA_RESERVED = new Set([
  'sum', 'avg', 'max', 'min', 'count', 'coalesce', 'nullif', 'case', 'when', 'then',
  'else', 'end', 'if', 'and', 'or', 'not', 'null', 'true', 'false', 'as', 'cast',
  'integer', 'float', 'numeric', 'text', 'bigint', 'abs', 'round', 'floor', 'ceil',
  'sqrt', 'power', 'log', 'exp', 'greatest', 'least', 'over', 'partition', 'by',
  'order', 'rows', 'between', 'preceding', 'following', 'unbounded', 'distinct',
]);

function parseCounters(raw: any): CounterEntry[] {
  if (!raw) return [];
  // Array: already a list of counter names
  if (Array.isArray(raw)) {
    return raw.map((name, i) => ({
      id: `c-${i}`, name: String(name), description: `PM counter: ${name}`,
      vendor_mapping: {}, source_system: 'OSS PM', granularity: '15min',
    }));
  }
  if (typeof raw !== 'string') return [];
  const str = raw.trim();
  if (!str) return [];

  // Detect if it's a comma-separated list (no math operators) vs a formula expression.
  const hasFormulaOperators = /[+\-*/()]/.test(str);
  let names: string[];
  if (!hasFormulaOperators) {
    // Simple comma-separated list
    names = str.split(',').map(s => s.trim()).filter(Boolean);
  } else {
    // Formula expression — extract identifiers (counter names) via regex.
    // A counter identifier: starts with a letter, contains letters/digits/underscore,
    // not followed by '(' (which would make it a function call).
    const matches = str.match(/[A-Za-z_][A-Za-z0-9_]*(?!\s*\()/g) || [];
    const seen = new Set<string>();
    names = [];
    for (const m of matches) {
      const lower = m.toLowerCase();
      if (FORMULA_RESERVED.has(lower)) continue;
      // Skip bare numbers interpreted as identifiers (shouldn't happen but safe)
      if (/^\d+$/.test(m)) continue;
      if (seen.has(m)) continue;
      seen.add(m);
      names.push(m);
    }
  }

  return names.map((name, i) => ({
    id: `c-${i}`, name, description: `PM counter: ${name}`,
    vendor_mapping: {}, source_system: 'OSS PM', granularity: '15min',
  }));
}

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDebounced(value), delayMs); return () => clearTimeout(t); }, [value, delayMs]);
  return debounced;
}

/* ── Sub-components ── */
const InfoItem: React.FC<{ label: string; value: string | React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="py-1.5">
    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">{label}</span>
    <p className={`mt-0.5 text-[13px] text-foreground leading-snug ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</p>
  </div>
);

const FormulaBlock: React.FC<{ formula: string }> = ({ formula }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => { navigator.clipboard.writeText(formula); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className="relative group rounded-xl bg-primary px-4 py-3.5 shadow-sm">
      <pre className="text-[13px] font-mono text-primary-foreground leading-relaxed whitespace-pre-wrap pr-8">{formula}</pre>
      <button onClick={handleCopy} className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-primary-foreground/20 opacity-0 group-hover:opacity-100 hover:bg-primary-foreground/30 transition-all" title="Copy formula">
        {copied ? <Check className="w-3.5 h-3.5 text-primary-foreground" /> : <Copy className="w-3.5 h-3.5 text-primary-foreground/80" />}
      </button>
    </div>
  );
};

const CounterGroup: React.FC<{
  title: string; count: number; items: CounterEntry[]; icon: React.ReactNode; secondary?: boolean;
  onCounterClick: (c: CounterEntry) => void;
}> = ({ title, count, items, icon, secondary, onCounterClick }) => (
  <div className={`rounded-xl border ${secondary ? 'border-sky-500/20 bg-sky-500/5' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
    <div className={`flex items-center justify-between px-4 py-2.5 border-b ${secondary ? 'border-sky-500/20' : 'border-emerald-500/20'}`}>
      <h4 className={`text-[11px] font-extrabold uppercase tracking-wider ${secondary ? 'text-sky-600' : 'text-emerald-600'}`}>{title}</h4>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${secondary ? 'bg-sky-500/10 text-sky-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
        {count} Counter{count !== 1 ? 's' : ''}
      </span>
    </div>
    <div className="px-4 py-3 space-y-2">
      {items.length > 0 ? items.map((item) => (
        <button key={item.id} onClick={() => onCounterClick(item)}
          className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/60 transition-colors group text-left"
        >
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${secondary ? 'bg-sky-500/10' : 'bg-emerald-500/10'}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold font-mono text-foreground truncate">{item.name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
          </div>
        </button>
      )) : (
        <span className="text-xs text-muted-foreground italic">No counters defined</span>
      )}
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                           */
/* ══════════════════════════════════════════════════════════ */
const ITEMS_PER_PAGE = 12;

const TECH_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  LTE: { label: '4G', bg: 'bg-blue-100', text: 'text-blue-700' },
  NR: { label: '5G', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  '4G': { label: '4G', bg: 'bg-blue-100', text: 'text-blue-700' },
  '5G': { label: '5G', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  '3G': { label: '3G', bg: 'bg-orange-100', text: 'text-orange-700' },
  '2G': { label: '2G', bg: 'bg-amber-100', text: 'text-amber-700' },
  ALL: { label: 'All', bg: 'bg-muted', text: 'text-muted-foreground' },
};

const KpiCatalogView: React.FC = () => {
  const [kpis, setKpis] = useState<KpiCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [techFilter, setTechFilter] = useState('ALL');
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | KpiStatus>('ALL');
  const [selectedKpi, setSelectedKpi] = useState<KpiCatalogEntry | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingKpi, setEditingKpi] = useState<KpiCatalogEntry | null>(null);
  const [userRole] = useState<UserRole>('creator');
  const [selectedCounter, setSelectedCounter] = useState<CounterEntry | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sortField, setSortField] = useState<'name' | 'category' | 'technology'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [filterOptions, setFilterOptions] = useState<{ technologies: string[]; vendors: string[]; categories: string[] }>({
    technologies: ['2G', '3G', '4G', '5G'], vendors: ['Nokia', 'Ericsson', 'Huawei'],
    categories: ['Accessibility', 'Retainability', 'Throughput', 'Traffic', 'Mobility', 'Radio Quality', 'VoLTE', 'Latency', 'Integrity'],
  });

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    catalogGet<{ technologies: string[]; vendors: string[]; categories: string[] }>('/filters')
      .then(data => {
        if (data.technologies?.length || data.vendors?.length || data.categories?.length) {
          setFilterOptions(prev => ({
            technologies: data.technologies?.length ? data.technologies : prev.technologies,
            vendors: data.vendors?.length ? data.vendors : prev.vendors,
            categories: data.categories?.length ? data.categories : prev.categories,
          }));
        }
      })
      .catch(() => {});
  }, []);

  const loadCatalog = useCallback(() => {
    setLoading(true);
    catalogGet<any>('/kpis')
      .then(data => { const arr = Array.isArray(data) ? data : (data.kpis || []); setKpis(arr.map(mapToEntry)); })
      .catch(async (err) => {
        console.warn('VPS catalog unavailable, falling back to database:', err.message);
        try {
          const rows = await loadKpisFromSupabase({});
          setKpis(rows.map(mapToEntry));
          if (rows.length === 0) toast.info('No KPIs found in database');
        } catch (fallbackErr) { console.error('Supabase fallback also failed:', fallbackErr); toast.error('Failed to load KPI catalog'); }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const filtered = useMemo(() => {
    let list = kpis;
    if (techFilter !== 'ALL') list = list.filter(k => k.technology?.toUpperCase() === techFilter.toUpperCase());
    if (vendorFilter !== 'ALL') list = list.filter(k => k.vendor?.toLowerCase() === vendorFilter.toLowerCase());
    if (categoryFilter !== 'ALL') list = list.filter(k => k.category?.toLowerCase() === categoryFilter.toLowerCase());
    if (statusFilter !== 'ALL') list = list.filter(k => (k.status || 'active') === statusFilter);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(k => k.kpi_code.toLowerCase().includes(q) || k.display_name.toLowerCase().includes(q) || k.category.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      const va = sortField === 'name' ? a.display_name : sortField === 'category' ? a.category : a.technology;
      const vb = sortField === 'name' ? b.display_name : sortField === 'category' ? b.category : b.technology;
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return list;
  }, [kpis, debouncedSearch, sortField, sortDir, techFilter, vendorFilter, categoryFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => { setPage(1); }, [search, techFilter, vendorFilter, categoryFilter, statusFilter]);

  const handleCreate = async (data: Record<string, any>) => {
    try { const r = await catalogPost('/kpis', data); toast.success(`KPI ${data.kpi_code || r.kpi_key || ''} created`); setShowCreate(false); loadCatalog(); }
    catch (err: any) { toast.error(err.message || 'Failed to create KPI'); }
  };
  const handleEdit = async (data: Record<string, any>) => {
    if (!editingKpi) return;
    try { await catalogPut(`/kpis/${encodeURIComponent(editingKpi.kpi_code)}`, data); toast.success(`KPI ${editingKpi.kpi_code} updated`); setEditingKpi(null); loadCatalog(); if (selectedKpi?.kpi_code === editingKpi.kpi_code) setSelectedKpi(null); }
    catch (err: any) { toast.error(err.message || 'Failed to update KPI'); }
  };
  const handleDelete = async (kpi: KpiCatalogEntry) => {
    try { await catalogDelete(`/kpis/${encodeURIComponent(kpi.kpi_code)}`); toast.success(`KPI ${kpi.kpi_code} deactivated`); setSelectedKpi(null); loadCatalog(); }
    catch (err: any) { toast.error(err.message || 'Failed to delete KPI'); }
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const kpi = selectedKpi;
  const statusCfg = kpi ? (STATUS_CONFIG[kpi.status] || STATUS_CONFIG.active) : null;
  const hasThresholds = kpi?.thresholds && (kpi.thresholds.green != null || kpi.thresholds.orange != null || kpi.thresholds.red != null);

  const allTechs = ['ALL', ...filterOptions.technologies];

  // Stats
  const categoryDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    kpis.forEach(k => { dist[k.category] = (dist[k.category] || 0) + 1; });
    return dist;
  }, [kpis]);

  const techDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    kpis.forEach(k => { const t = k.technology || 'ALL'; dist[t] = (dist[t] || 0) + 1; });
    return dist;
  }, [kpis]);

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'linear-gradient(135deg, hsl(220 60% 97%), hsl(220 40% 95%))' }}>

      {/* ── TOP BAR ── */}
      <div className="shrink-0 px-6 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Create KPI button */}
          {userRole === 'creator' && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all">
              <Plus className="w-4 h-4" /> Nouveau KPI
            </button>
          )}

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <input type="text" placeholder="Rechercher un KPI…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-full border border-border/40 bg-white/80 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all backdrop-blur-sm" />
          </div>

          {/* Tech filter chips */}
          <div className="flex items-center gap-1.5">
            {allTechs.map(t => (
              <button key={t} onClick={() => setTechFilter(t)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                  techFilter === t
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-white/70 text-muted-foreground border border-border/30 hover:bg-white hover:border-primary/30'
                }`}>
                {t === 'ALL' ? 'All' : t}
              </button>
            ))}
          </div>

          {/* Vendor filter */}
          <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
            className="px-3 py-2 rounded-full border border-border/30 bg-white/70 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer backdrop-blur-sm">
            <option value="ALL">Vendor: All</option>
            {filterOptions.vendors.map(v => <option key={v} value={v}>Vendor: {v}</option>)}
          </select>

          {/* Category filter */}
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="px-3 py-2 rounded-full border border-border/30 bg-white/70 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer backdrop-blur-sm">
            <option value="ALL">Category: All</option>
            {filterOptions.categories.map(c => <option key={c} value={c}>Category: {c}</option>)}
          </select>

          {/* Status filter — disabled: no status column in DB yet */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'ALL' | KpiStatus)}
            disabled
            title="Filtre désactivé : la colonne status n'est pas encore disponible en base"
            className="px-3 py-2 rounded-full border border-border/30 bg-muted/40 text-xs font-medium text-muted-foreground/60 focus:outline-none appearance-none cursor-not-allowed backdrop-blur-sm opacity-60">
            <option value="ALL">Status: All</option>
            {(Object.keys(STATUS_CONFIG) as KpiStatus[]).map(s => (
              <option key={s} value={s}>Status: {STATUS_CONFIG[s].label}</option>
            ))}
          </select>

          {/* Refresh */}
          <button onClick={loadCatalog} className="p-2 rounded-lg border border-border/30 bg-white/70 text-muted-foreground hover:bg-white transition-colors backdrop-blur-sm" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── TABLE ── */}
      <div className="flex-1 mx-6 mb-4 rounded-2xl bg-white/90 backdrop-blur-sm border border-border/20 shadow-sm flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" />
            <span className="ml-2 text-sm text-muted-foreground">Loading catalog…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground py-16">
            <Database className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-base font-semibold">No KPIs found</p>
            <p className="text-xs mt-1 opacity-60">Try adjusting your filters or search</p>
            {userRole === 'creator' && (
              <button onClick={() => setShowCreate(true)}
                className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity">
                <Plus className="w-4 h-4" /> Create KPI
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_60px] px-5 py-3 border-b border-border/20 bg-muted/20">
              {['NOM', 'TECHNOLOGY', 'CATEGORY', 'VENDOR', 'UNIT', 'STATUS', 'ACTIONS'].map(h => (
                <span key={h} className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/70">{h}</span>
              ))}
            </div>

            {/* Rows */}
            <div className="flex-1 overflow-y-auto divide-y divide-border/10">
              {paginated.map(row => {
                const tBadge = TECH_BADGE[row.technology] || TECH_BADGE.ALL;
                const sCfg = STATUS_CONFIG[row.status] || STATUS_CONFIG.active;

                return (
                  <div key={row.kpi_key || row.id}
                    onClick={() => setSelectedKpi(row)}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_60px] px-5 py-3.5 items-center cursor-pointer group hover:bg-primary/[0.02] transition-colors">

                    {/* Name */}
                    <div className="min-w-0">
                      <span className="text-[13px] font-bold text-foreground truncate block">{row.display_name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground/60 truncate block">{row.kpi_code}</span>
                    </div>

                    {/* Technology */}
                    <div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${tBadge.bg} ${tBadge.text}`}>{tBadge.label}</span>
                    </div>

                    {/* Category */}
                    <span className="text-xs text-foreground truncate">{row.category}</span>

                    {/* Vendor */}
                    <span className="text-xs text-muted-foreground font-medium truncate">{row.vendor === 'ALL' ? '—' : row.vendor}</span>

                    {/* Unit */}
                    <span className="text-xs text-muted-foreground truncate">{row.unit || '—'}</span>

                    {/* Status */}
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${row.status === 'active' ? 'bg-green-500' : row.status === 'validated' ? 'bg-emerald-500' : row.status === 'pending_review' ? 'bg-blue-500' : 'bg-amber-500'}`} />
                      <span className={`text-[10px] font-medium ${sCfg.color}`}>{sCfg.label}</span>
                    </div>

                    {/* Actions */}
                    <div className="relative flex justify-end">
                      <button
                        onClick={e => { e.stopPropagation(); setActionMenuId(actionMenuId === (row.kpi_key || row.id) ? null : (row.kpi_key || row.id)); }}
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-muted/60 transition-all">
                        <MoreVertical className="w-4 h-4 text-muted-foreground" />
                      </button>

                      {actionMenuId === (row.kpi_key || row.id) && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setActionMenuId(null)} />
                          <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border border-border/30 bg-white shadow-xl py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                            <button onClick={() => { setSelectedKpi(row); setActionMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted/40 transition-colors">
                              <Eye className="w-3.5 h-3.5" /> Voir détails
                            </button>
                            <button onClick={() => { setEditingKpi(row); setActionMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted/40 transition-colors">
                              <Edit2 className="w-3.5 h-3.5" /> Modifier
                            </button>
                            <div className="border-t border-border/20 my-1" />
                            <button onClick={() => { handleDelete(row); setActionMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/5 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" /> Supprimer
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination footer */}
            <div className="shrink-0 px-5 py-3 border-t border-border/20 flex items-center justify-between bg-muted/10">
              <span className="text-[11px] text-muted-foreground">
                Showing {Math.min(filtered.length, (page - 1) * ITEMS_PER_PAGE + 1)}–{Math.min(filtered.length, page * ITEMS_PER_PAGE)} of {filtered.length} KPIs
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors">
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                      page === p ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'
                    }`}>
                    {p}
                  </button>
                ))}
                {totalPages > 5 && <span className="text-xs text-muted-foreground px-1">…</span>}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors">
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── STATS FOOTER ── */}
      <div className="shrink-0 mx-6 mb-4 grid grid-cols-3 gap-4">
        {/* Total KPIs */}
        <div className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-md shadow-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 opacity-80" />
            <span className="text-[10px] font-black uppercase tracking-[0.14em] opacity-80">CATALOG</span>
          </div>
          <p className="text-3xl font-black">{kpis.length}</p>
          <p className="text-[11px] opacity-70 mt-0.5">Total KPIs in repository</p>
        </div>

        {/* Tech distribution */}
        <div className="rounded-2xl bg-white/90 backdrop-blur-sm border border-border/20 p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground mb-3">Distribution par technologie</p>
          <div className="space-y-2">
            {Object.entries(techDistribution).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tech, count]) => {
              const pct = kpis.length > 0 ? Math.round((count / kpis.length) * 100) : 0;
              const badge = TECH_BADGE[tech];
              return (
                <div key={tech} className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-muted-foreground w-16">{tech} ({pct}%)</span>
                  <div className="flex-1 h-2 rounded-full bg-muted/40 overflow-hidden">
                    <div className={`h-full rounded-full ${badge?.bg || 'bg-primary/30'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground w-8 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top categories */}
        <div className="rounded-2xl bg-white/90 backdrop-blur-sm border border-border/20 p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground mb-3">TOP CATEGORIES</p>
          <div className="space-y-1.5">
            {Object.entries(categoryDistribution).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([cat, count]) => (
              <div key={cat} className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground truncate">{cat}</span>
                <span className="text-[10px] font-bold text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── DETAIL DRAWER ── */}
      {selectedKpi && statusCfg && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/30 backdrop-blur-[2px]" onClick={() => setSelectedKpi(null)}>
          <div className="w-[460px] h-full bg-card shadow-2xl animate-in slide-in-from-right duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Drawer Header */}
            <div className="px-6 pt-5 pb-4 border-b border-border bg-gradient-to-b from-muted/30 to-transparent shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>{statusCfg.label}</span>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${(TECH_BADGE[selectedKpi.technology] || TECH_BADGE.ALL).bg} ${(TECH_BADGE[selectedKpi.technology] || TECH_BADGE.ALL).text}`}>{selectedKpi.technology}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditingKpi(selectedKpi)} className="p-2 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Edit">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setSelectedKpi(null)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <h3 className="text-xl font-black text-foreground leading-tight tracking-tight">{selectedKpi.display_name}</h3>
              <p className="text-[11px] font-mono text-muted-foreground/60 mt-1 tracking-wide">{selectedKpi.kpi_code}</p>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {/* General */}
              <div>
                <h4 className="text-[11px] font-black uppercase tracking-[0.14em] text-foreground mb-2 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" /> General Information
                </h4>
                <div className="h-px bg-border mb-3" />
                <div className="space-y-1">
                  <InfoItem label="Description" value={selectedKpi.description} />
                  <div className="grid grid-cols-2 gap-3">
                    <InfoItem label="Category" value={selectedKpi.category} />
                    <InfoItem label="Unit" value={selectedKpi.unit} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoItem label="Technology" value={selectedKpi.technology} />
                    <InfoItem label="Vendor" value={selectedKpi.vendor} />
                  </div>
                </div>
              </div>

              {/* Formula */}
              <div>
                <h4 className="text-[11px] font-black uppercase tracking-[0.14em] text-foreground mb-2 flex items-center gap-2">
                  <Sigma className="w-4 h-4 text-primary" /> Calculation Formula
                </h4>
                <div className="h-px bg-border mb-3" />
                <FormulaBlock formula={selectedKpi.formula || `${selectedKpi.display_name} = Numerator / Denominator`} />
              </div>

              {/* Counters */}
              <div className="space-y-3">
                <CounterGroup title="Numerator" count={selectedKpi.numerator.counters.length} items={selectedKpi.numerator.counters}
                  icon={<Database className="w-3.5 h-3.5 text-emerald-600" />} onCounterClick={setSelectedCounter} />
                <CounterGroup title="Denominator" count={selectedKpi.denominator.counters.length} items={selectedKpi.denominator.counters}
                  icon={<Database className="w-3.5 h-3.5 text-sky-600" />} secondary onCounterClick={setSelectedCounter} />
              </div>

              {/* Thresholds */}
              {hasThresholds && (
                <div>
                  <h4 className="text-[11px] font-black uppercase tracking-[0.14em] text-foreground mb-2 flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-primary" /> Thresholds
                  </h4>
                  <div className="h-px bg-border mb-3" />
                  <div className="grid grid-cols-3 gap-3">
                    {selectedKpi.thresholds.green != null && (
                      <div className="px-3 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-green-600">Green</span>
                        <p className="text-sm font-bold text-green-700 mt-0.5">{selectedKpi.thresholds.green}{selectedKpi.unit === '%' ? '%' : ''}</p>
                      </div>
                    )}
                    {selectedKpi.thresholds.orange != null && (
                      <div className="px-3 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-center">
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-orange-600">Orange</span>
                        <p className="text-sm font-bold text-orange-700 mt-0.5">{selectedKpi.thresholds.orange}{selectedKpi.unit === '%' ? '%' : ''}</p>
                      </div>
                    )}
                    {selectedKpi.thresholds.red != null && (
                      <div className="px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-red-600">Red</span>
                        <p className="text-sm font-bold text-red-700 mt-0.5">{selectedKpi.thresholds.red}{selectedKpi.unit === '%' ? '%' : ''}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="pt-3 border-t border-border">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/70">Updated</span>
                    <p className="text-xs text-foreground mt-0.5">{selectedKpi.last_updated}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/70">Owner</span>
                    <p className="text-xs text-foreground mt-0.5">{selectedKpi.created_by}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Counter Modal */}
      {selectedCounter && <CounterModal counter={selectedCounter} onClose={() => setSelectedCounter(null)} />}

      {/* Delete Confirmation */}
      {showDeleteConfirm && kpi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)}>
          <div className="w-full max-w-md mx-4 rounded-2xl bg-card border border-border shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Delete KPI</h3>
                <p className="text-xs text-muted-foreground">This will deactivate the KPI</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              Are you sure you want to delete <strong className="text-foreground">{kpi.display_name}</strong>?
            </p>
            <p className="text-xs text-muted-foreground mb-6 font-mono">{kpi.kpi_code}</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button onClick={() => { setShowDeleteConfirm(false); handleDelete(kpi); }} className="px-4 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold hover:opacity-90 transition-opacity">Delete KPI</button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Wizard */}
      {showCreate && <KpiCreateWizard onSubmit={handleCreate} onClose={() => setShowCreate(false)} />}
      {editingKpi && <KpiCreateWizard onSubmit={handleEdit} onClose={() => setEditingKpi(null)} initialData={editingKpi} mode="edit" />}
    </div>
  );
};

export default KpiCatalogView;
