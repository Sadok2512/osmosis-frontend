import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Search, Filter, Plus, Database, RefreshCw, ArrowUpDown,
  MoreVertical, Edit2, Trash2, BookOpen, Sigma, BarChart3,
  ArrowUp, ArrowDown, Hash, Copy, Check, Clock, User, Shield,
  Layers, Gauge, Info, FlaskConical, AlertTriangle, X
} from 'lucide-react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { getVpsProxyUrl, getVpsProxyHeaders } from '@/lib/apiConfig';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { KpiCatalogEntry, KpiStatus, UserRole, CounterEntry } from './kpiCatalogTypes';
import { STATUS_CONFIG, CATEGORY_COLORS, VENDOR_COLORS, TECH_COLORS } from './kpiCatalogTypes';
import KpiCreateWizard from './KpiCreateWizard';
import CounterModal from './CounterModal';

/* ── API helpers ── */
const API_BASE = '/api/v1/monitor/catalog';

function catalogUrl(path: string, params?: Record<string, string>): string {
  return getVpsProxyUrl('parser', `${API_BASE}${path}`, params);
}
function catalogHeaders(): Record<string, string> {
  return getVpsProxyHeaders();
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

function mapToEntry(k: any): KpiCatalogEntry {
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
      counters: parseCounters(k.numerator_counters || k.numerateur || (typeof k.numerator === 'string' ? k.numerator : '') || ''),
      source: k.num_source || 'OSS PM', granularity: k.num_granularity || '15min',
    },
    denominator: {
      name: k.denominator_name || (typeof k.denominator === 'string' ? k.denominator : '') || 'Denominator',
      description: k.denominator_desc || '',
      counters: parseCounters(k.denominator_counters || k.denominateur || (typeof k.denominator === 'string' ? k.denominator : '') || ''),
      source: k.den_source || 'OSS PM', granularity: k.den_granularity || '15min',
    },
    thresholds: { green: k.seuil_vert ?? k.threshold_green ?? null, orange: k.seuil_orange ?? k.threshold_orange ?? null, red: k.seuil_rouge ?? k.threshold_red ?? null },
    status: (k.status as KpiStatus) || 'active',
    scope: k.scope || 'Cell', created_by: k.created_by || 'System',
    last_updated: k.updated_at || k.created_at || '—',
    is_normalized: k.is_normalized || false, supported_levels: k.supported_levels || [],
  };
}

function parseCounters(raw: any): CounterEntry[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((name, i) => ({ id: `c-${i}`, name: String(name), description: `PM counter: ${name}`, vendor_mapping: {}, source_system: 'OSS PM', granularity: '15min' }));
  if (typeof raw !== 'string') return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean).map((name, i) => ({
    id: `c-${i}`, name, description: `PM counter: ${name}`, vendor_mapping: {}, source_system: 'OSS PM', granularity: '15min',
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
    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">{label}</span>
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
const KpiCatalogView: React.FC = () => {
  const [kpis, setKpis] = useState<KpiCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [techFilter, setTechFilter] = useState('ALL');
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedKpi, setSelectedKpi] = useState<KpiCatalogEntry | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingKpi, setEditingKpi] = useState<KpiCatalogEntry | null>(null);
  const [userRole] = useState<UserRole>('creator');
  const [selectedCounter, setSelectedCounter] = useState<CounterEntry | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sortField, setSortField] = useState<'name' | 'category' | 'technology'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [filterOptions, setFilterOptions] = useState<{ technologies: string[]; vendors: string[]; categories: string[] }>({
    technologies: ['LTE', 'NR'], vendors: ['Nokia', 'Ericsson', 'Huawei'],
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
    const params: Record<string, string> = {};
    if (debouncedSearch) params.search = debouncedSearch;
    if (techFilter !== 'ALL') params.technology = techFilter;
    if (vendorFilter !== 'ALL') params.vendor = vendorFilter;
    if (categoryFilter !== 'ALL') params.category = categoryFilter;

    catalogGet<any>('/kpis', params)
      .then(data => { const arr = Array.isArray(data) ? data : (data.kpis || []); setKpis(arr.map(mapToEntry)); })
      .catch(async (err) => {
        console.warn('VPS catalog unavailable, falling back to database:', err.message);
        try {
          const rows = await loadKpisFromSupabase(params);
          setKpis(rows.map(mapToEntry));
          if (rows.length === 0) toast.info('No KPIs found in database');
        } catch (fallbackErr) { console.error('Supabase fallback also failed:', fallbackErr); toast.error('Failed to load KPI catalog'); }
      })
      .finally(() => setLoading(false));
  }, [debouncedSearch, techFilter, vendorFilter, categoryFilter]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const filtered = useMemo(() => {
    let list = kpis;
    if (search && search !== debouncedSearch) {
      const q = search.toLowerCase();
      list = list.filter(k => k.kpi_code.toLowerCase().includes(q) || k.display_name.toLowerCase().includes(q) || k.category.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      const va = sortField === 'name' ? a.display_name : sortField === 'category' ? a.category : a.technology;
      const vb = sortField === 'name' ? b.display_name : sortField === 'category' ? b.category : b.technology;
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return list;
  }, [kpis, search, debouncedSearch, sortField, sortDir]);

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

  // Auto-select first KPI when list loads
  useEffect(() => {
    if (!selectedKpi && filtered.length > 0) setSelectedKpi(filtered[0]);
  }, [filtered]);

  const kpi = selectedKpi;
  const statusCfg = kpi ? (STATUS_CONFIG[kpi.status] || STATUS_CONFIG.active) : null;
  const hasThresholds = kpi?.thresholds && (kpi.thresholds.green != null || kpi.thresholds.orange != null || kpi.thresholds.red != null);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* ── HEADER ── */}
      <div className="shrink-0 border-b border-border bg-card">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight text-foreground">KPI Management</h1>
                <p className="text-[10px] text-muted-foreground mt-0.5">Multi-vendor Network KPI Repository • {kpis.length} KPIs</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" placeholder="Search KPIs…" value={search} onChange={e => setSearch(e.target.value)}
                  className="w-56 pl-10 pr-4 py-2 rounded-full border border-border bg-muted/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
              <select value={techFilter} onChange={e => setTechFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer">
                <option value="ALL">All Tech</option>
                {filterOptions.technologies.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer">
                <option value="ALL">All Vendors</option>
                {filterOptions.vendors.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer">
                <option value="ALL">All Categories</option>
                {filterOptions.categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={loadCatalog} className="p-2 rounded-xl border border-border hover:bg-muted transition-colors" title="Refresh">
                <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
              </button>
              {userRole === 'creator' && (
                <button onClick={() => setShowCreate(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity">
                  <Plus className="w-4 h-4" /> Create KPI
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── WORKSPACE: Table + Detail ── */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">

        {/* ── TABLE ── */}
        <ResizablePanel defaultSize={65} minSize={40} className="flex flex-col min-w-0 border-r border-border">
          {/* Table controls */}
          <div className="shrink-0 flex items-center justify-between px-5 py-2.5 border-b border-border bg-muted/20">
            <div className="flex items-center gap-2">
              <button onClick={() => toggleSort('name')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-muted transition-colors">
                <Filter className="w-3 h-3" /> Filter
              </button>
              <button onClick={() => toggleSort(sortField)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-muted transition-colors">
                <ArrowUpDown className="w-3 h-3" /> Sort
              </button>
            </div>
            <span className="text-[10px] text-muted-foreground font-medium">{filtered.length} KPIs Loaded</span>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" />
                <span className="ml-2 text-sm text-muted-foreground">Loading catalog…</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <Database className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">No KPIs match your filters</p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-card border-b border-border">
                  <tr>
                    <th className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort('name')}>
                      KPI Name & Identity
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors hidden lg:table-cell" onClick={() => toggleSort('technology')}>
                      Technology
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hidden xl:table-cell">
                      Vendor
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">
                      Status
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hidden xl:table-cell">
                      Category
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-10">
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 300).map(row => {
                    const isSelected = selectedKpi?.kpi_key === row.kpi_key;
                    const sCfg = STATUS_CONFIG[row.status] || STATUS_CONFIG.active;
                    const tCfg = TECH_COLORS[row.technology] || TECH_COLORS.ALL;
                    const catColor = CATEGORY_COLORS[row.category] || CATEGORY_COLORS.Other;
                    return (
                      <tr key={row.kpi_key || row.id}
                        onClick={() => setSelectedKpi(row)}
                        className={`cursor-pointer transition-colors group ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/40'}`}
                      >
                        <td className="px-5 py-3">
                          <p className="text-sm font-bold text-foreground truncate">{row.display_name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-mono text-muted-foreground truncate">{row.kpi_code}</span>
                            <span className="text-muted-foreground/40">•</span>
                            <span className="text-[10px] text-muted-foreground">{row.unit}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tCfg.bg} ${tCfg.text}`}>{row.technology}</span>
                        </td>
                        <td className="px-3 py-3 hidden xl:table-cell">
                          <span className="text-xs text-foreground">{row.vendor === 'ALL' ? '—' : row.vendor}</span>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${row.status === 'active' ? 'bg-green-500' : row.status === 'validated' ? 'bg-emerald-500' : row.status === 'pending_review' ? 'bg-blue-500' : 'bg-amber-500'}`} />
                            <span className={`text-[10px] font-medium ${sCfg.color}`}>{sCfg.label}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 hidden xl:table-cell">
                          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: catColor }}>{row.category}</span>
                        </td>
                        <td className="px-3 py-3">
                          <button className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-muted transition-all">
                            <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {filtered.length > 300 && (
              <div className="py-3 text-center text-[10px] text-muted-foreground">
                Showing 300 of {filtered.length} — use search to narrow results
              </div>
            )}
          </div>

          {/* Footer stats */}
          <div className="shrink-0 px-5 py-2 border-t border-border bg-muted/20 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">{filtered.length} / {kpis.length} KPIs</span>
            <div className="flex items-center gap-3">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                const count = filtered.filter(k => k.status === key).length;
                if (!count) return null;
                return <span key={key} className={`text-[9px] font-bold ${cfg.color}`}>{count} {cfg.label}</span>;
              })}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="hidden md:flex" />

        {/* ── DETAIL PANEL ── */}
        <ResizablePanel defaultSize={35} minSize={25} maxSize={60} className="flex flex-col overflow-hidden bg-card hidden md:flex">
          {kpi && statusCfg ? (
            <div className="flex-1 overflow-y-auto">
              {/* Panel Header */}
              <div className="px-6 pt-5 pb-4 border-b border-border bg-gradient-to-b from-muted/30 to-transparent">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>{statusCfg.label}</span>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${(TECH_COLORS[kpi.technology] || TECH_COLORS.ALL).bg} ${(TECH_COLORS[kpi.technology] || TECH_COLORS.ALL).text}`}>{kpi.technology}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {(userRole === 'editor' || userRole === 'creator') && (
                      <button onClick={() => setEditingKpi(kpi)} className="p-2 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Edit">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                    {userRole === 'creator' && (
                      <button onClick={() => setShowDeleteConfirm(true)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => setSelectedKpi(null)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
                <h3 className="text-xl font-black text-foreground leading-tight tracking-tight">{kpi.display_name}</h3>
                <p className="text-[11px] font-mono text-muted-foreground/60 mt-1 tracking-wide">{kpi.kpi_code}</p>
              </div>

              {/* Content */}
              <div className="px-6 py-4 space-y-5">
                {/* General Information */}
                <div>
                  <h4 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-foreground mb-2 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" /> General Information
                  </h4>
                  <div className="h-px bg-border mb-3" />
                  <div className="space-y-1">
                    <InfoItem label="Description" value={kpi.description} />
                    <div className="grid grid-cols-2 gap-3">
                      <InfoItem label="Category" value={kpi.category} />
                      <InfoItem label="Unit" value={kpi.unit} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <InfoItem label="Technology" value={kpi.technology} />
                      <InfoItem label="Vendor" value={kpi.vendor} />
                    </div>
                  </div>
                </div>

                {/* Formula */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-foreground flex items-center gap-2">
                      <Sigma className="w-4 h-4 text-primary" /> Calculation Formula
                    </h4>
                  </div>
                  <div className="h-px bg-border mb-3" />
                  <FormulaBlock formula={kpi.formula || `${kpi.display_name} = Numerator / Denominator`} />
                </div>

                {/* Numerator & Denominator */}
                <div className="space-y-3">
                  <CounterGroup
                    title="Numerator" count={kpi.numerator.counters.length}
                    items={kpi.numerator.counters}
                    icon={<Database className="w-3.5 h-3.5 text-emerald-600" />}
                    onCounterClick={setSelectedCounter}
                  />
                  <CounterGroup
                    title="Denominator" count={kpi.denominator.counters.length}
                    items={kpi.denominator.counters}
                    icon={<Database className="w-3.5 h-3.5 text-sky-600" />}
                    secondary
                    onCounterClick={setSelectedCounter}
                  />
                </div>

                {/* Thresholds */}
                {hasThresholds && (
                  <div>
                    <h4 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-foreground mb-2 flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-primary" /> Thresholds
                    </h4>
                    <div className="h-px bg-border mb-3" />
                    <div className="grid grid-cols-3 gap-3">
                      {kpi.thresholds.green != null && (
                        <div className="px-3 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-green-600">Green</span>
                          <p className="text-sm font-bold text-green-700 mt-0.5">{kpi.thresholds.green}{kpi.unit === '%' ? '%' : ''}</p>
                        </div>
                      )}
                      {kpi.thresholds.orange != null && (
                        <div className="px-3 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-center">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600">Orange</span>
                          <p className="text-sm font-bold text-orange-700 mt-0.5">{kpi.thresholds.orange}{kpi.unit === '%' ? '%' : ''}</p>
                        </div>
                      )}
                      {kpi.thresholds.red != null && (
                        <div className="px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-red-600">Red</span>
                          <p className="text-sm font-bold text-red-700 mt-0.5">{kpi.thresholds.red}{kpi.unit === '%' ? '%' : ''}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Metadata footer */}
                <div className="pt-3 border-t border-border">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Created</span>
                      <p className="text-xs text-foreground mt-0.5">{kpi.last_updated}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Owner</span>
                      <p className="text-xs text-foreground mt-0.5">{kpi.created_by}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <BarChart3 className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Select a KPI</p>
              <p className="text-xs opacity-60 mt-1">Details will appear here</p>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>

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

      {/* Create Wizard */}
      {showCreate && <KpiCreateWizard onSubmit={handleCreate} onClose={() => setShowCreate(false)} />}
      {editingKpi && <KpiCreateWizard onSubmit={handleEdit} onClose={() => setEditingKpi(null)} initialData={editingKpi} mode="edit" />}
    </div>
  );
};

export default KpiCatalogView;
