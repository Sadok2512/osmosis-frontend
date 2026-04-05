import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Search, Filter, Plus, Database, BarChart3, RefreshCw,
  ChevronRight, Hash, Shield, Layers, BookOpen
} from 'lucide-react';
import { getVpsProxyUrl, getVpsProxyHeaders } from '@/lib/apiConfig';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { KpiCatalogEntry, KpiStatus, UserRole, CounterEntry, KpiThresholds } from './kpiCatalogTypes';
import { STATUS_CONFIG, CATEGORY_COLORS, VENDOR_COLORS, TECH_COLORS } from './kpiCatalogTypes';
import KpiDetailPanel from './KpiDetailPanel';
import KpiCreateWizard from './KpiCreateWizard';

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
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `API ${res.status}`);
  }
  const json = await res.json();
  // Detect vps-proxy unavailable response
  if (json && json.unavailable === true) {
    throw new Error('VPS_UNAVAILABLE');
  }
  return json as T;
}

/** Fallback: load KPIs from Supabase kpi_catalog table */
async function loadKpisFromSupabase(params?: Record<string, string>): Promise<any[]> {
  let query = supabase.from('kpi_catalog').select('*').order('display_name');
  if (params?.technology && params.technology !== 'ALL') {
    query = query.ilike('techno', `%${params.technology}%`);
  }
  if (params?.vendor && params.vendor !== 'ALL') {
    query = query.ilike('techno', `%${params.vendor}%`); // vendor not in kpi_catalog, best effort
  }
  if (params?.category && params.category !== 'ALL') {
    query = query.ilike('famille', `%${params.category}%`);
  }
  if (params?.search) {
    query = query.or(`display_name.ilike.%${params.search}%,kpi_key.ilike.%${params.search}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(row => ({
    ...row,
    kpi_code: row.kpi_key,
    category: row.famille || 'Other',
    unit: row.unit || '',
    technology: row.techno || 'ALL',
    vendor: 'ALL',
    formula: row.formula_sql || '',
    numerator_name: row.numerator || '',
    denominator_name: row.denominator || '',
    status: 'active',
  }));
}

async function catalogPost<T = any>(path: string, body: any): Promise<T> {
  const url = catalogUrl(path);
  const res = await fetch(url, {
    method: 'POST',
    headers: catalogHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ detail: `API ${res.status}` }));
    throw new Error(errBody.detail || errBody.message || `API ${res.status}`);
  }
  return res.json();
}

async function catalogPut<T = any>(path: string, body: any): Promise<T> {
  const url = catalogUrl(path);
  const res = await fetch(url, {
    method: 'PUT',
    headers: catalogHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ detail: `API ${res.status}` }));
    throw new Error(errBody.detail || errBody.message || `API ${res.status}`);
  }
  return res.json();
}

async function catalogDelete(path: string): Promise<void> {
  const url = catalogUrl(path);
  const res = await fetch(url, {
    method: 'DELETE',
    headers: catalogHeaders(),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ detail: `API ${res.status}` }));
    throw new Error(errBody.detail || errBody.message || `API ${res.status}`);
  }
}

function mapToEntry(k: any): KpiCatalogEntry {
  return {
    id: k.id || k.kpi_key,
    kpi_code: k.kpi_key || k.kpi_code,
    kpi_key: k.kpi_key,
    display_name: k.display_name || k.nom_ihm || k.kpi_key,
    description: k.description || k.definition_courte || '',
    category: k.category || k.famille || 'Other',
    unit: k.unit || k.unites || '',
    technology: (k.technology || k.techno || 'ALL') as any,
    vendor: k.vendor || 'ALL',
    formula: k.formula_sql || k.formula || '',
    formula_type: k.formula_type || 'ratio',
    numerator: {
      name: k.numerator_name || (typeof k.numerator === 'string' ? k.numerator : '') || 'Numerator',
      description: k.numerator_desc || '',
      counters: parseCounters(k.numerator_counters || k.numerateur || (typeof k.numerator === 'string' ? k.numerator : '') || ''),
      source: k.num_source || 'OSS PM',
      granularity: k.num_granularity || '15min',
    },
    denominator: {
      name: k.denominator_name || (typeof k.denominator === 'string' ? k.denominator : '') || 'Denominator',
      description: k.denominator_desc || '',
      counters: parseCounters(k.denominator_counters || k.denominateur || (typeof k.denominator === 'string' ? k.denominator : '') || ''),
      source: k.den_source || 'OSS PM',
      granularity: k.den_granularity || '15min',
    },
    thresholds: {
      green: k.seuil_vert ?? k.threshold_green ?? null,
      orange: k.seuil_orange ?? k.threshold_orange ?? null,
      red: k.seuil_rouge ?? k.threshold_red ?? null,
    },
    status: (k.status as KpiStatus) || 'active',
    scope: k.scope || 'Cell',
    created_by: k.created_by || 'System',
    last_updated: k.updated_at || k.created_at || '—',
    is_normalized: k.is_normalized || false,
    supported_levels: k.supported_levels || [],
  };
}

function parseCounters(raw: any): CounterEntry[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((name, i) => ({ id: `c-${i}`, name: String(name), description: `PM counter: ${name}`, vendor_mapping: {}, source_system: 'OSS PM', granularity: '15min' }));
  if (typeof raw !== 'string') return [];
  const items = raw.split(',').map(s => s.trim()).filter(Boolean);
  return items.map((name, i) => ({
    id: `c-${i}`,
    name: typeof name === 'string' ? name : String(name),
    description: `PM counter: ${name}`,
    vendor_mapping: {},
    source_system: 'OSS PM',
    granularity: '15min',
  }));
}

/* ── Debounce hook ── */
function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/* ── Main Component ── */
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
  const [userRole] = useState<UserRole>('creator'); // Simulated — swap based on auth

  // Filter options from backend
  const [filterOptions, setFilterOptions] = useState<{ technologies: string[]; vendors: string[]; categories: string[] }>({
    technologies: ['LTE', 'NR'],
    vendors: ['Nokia', 'Ericsson', 'Huawei'],
    categories: ['Accessibility', 'Retainability', 'Throughput', 'Traffic', 'Mobility', 'Radio Quality', 'VoLTE', 'Latency', 'Integrity'],
  });

  const debouncedSearch = useDebounce(search, 300);

  // Load filter options once
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
      .catch(() => { /* keep defaults */ });
  }, []);

  const loadCatalog = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (debouncedSearch) params.search = debouncedSearch;
    if (techFilter !== 'ALL') params.technology = techFilter;
    if (vendorFilter !== 'ALL') params.vendor = vendorFilter;
    if (categoryFilter !== 'ALL') params.category = categoryFilter;

    catalogGet<any>('/kpis', params)
      .then(data => {
        const arr = Array.isArray(data) ? data : (data.kpis || []);
        setKpis(arr.map(mapToEntry));
      })
      .catch(async (err) => {
        console.warn('VPS catalog unavailable, falling back to database:', err.message);
        try {
          const rows = await loadKpisFromSupabase(params);
          setKpis(rows.map(mapToEntry));
          if (rows.length === 0) {
            toast.info('No KPIs found in database');
          }
        } catch (fallbackErr) {
          console.error('Supabase fallback also failed:', fallbackErr);
          toast.error('Failed to load KPI catalog');
        }
      })
      .finally(() => setLoading(false));
  }, [debouncedSearch, techFilter, vendorFilter, categoryFilter]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  // Client-side filtering is still available as a fallback for instant feel
  const filtered = useMemo(() => {
    // If the backend handled the filters, just return all
    // But we keep client-side search for instant responsiveness while debounce fires
    if (!search || search === debouncedSearch) return kpis;
    const q = search.toLowerCase();
    return kpis.filter(k => {
      return k.kpi_code.toLowerCase().includes(q) ||
        k.display_name.toLowerCase().includes(q) ||
        k.vendor.toLowerCase().includes(q) ||
        k.category.toLowerCase().includes(q) ||
        k.description.toLowerCase().includes(q);
    });
  }, [kpis, search, debouncedSearch]);

  const handleCreate = async (data: Record<string, any>) => {
    try {
      const r = await catalogPost('/kpis', data);
      toast.success(`KPI ${data.kpi_code || r.kpi_key || ''} created`);
      setShowCreate(false);
      loadCatalog();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create KPI');
    }
  };

  const handleEdit = async (data: Record<string, any>) => {
    if (!editingKpi) return;
    try {
      await catalogPut(`/kpis/${encodeURIComponent(editingKpi.kpi_code)}`, data);
      toast.success(`KPI ${editingKpi.kpi_code} updated`);
      setEditingKpi(null);
      // Refresh selected kpi data
      loadCatalog();
      // Update selected kpi in-place
      if (selectedKpi?.kpi_code === editingKpi.kpi_code) {
        setSelectedKpi(null); // will be reselected after reload
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update KPI');
    }
  };

  const handleDelete = async (kpi: KpiCatalogEntry) => {
    try {
      await catalogDelete(`/kpis/${encodeURIComponent(kpi.kpi_code)}`);
      toast.success(`KPI ${kpi.kpi_code} deactivated`);
      setSelectedKpi(null);
      loadCatalog();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete KPI');
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* ── HEADER ── */}
      <div className="shrink-0 border-b border-border bg-card">
        <div className="px-6 lg:px-8 py-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight text-foreground">KPI Network Repository</h1>
                <p className="text-xs text-muted-foreground mt-0.5">LTE / NR Multi-vendor • {kpis.length} KPIs • Backend Synchronized</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by code, name, vendor…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-64 pl-10 pr-4 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {/* Filters */}
              <select value={techFilter} onChange={e => setTechFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer">
                <option value="ALL">All Tech</option>
                {filterOptions.technologies.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer">
                <option value="ALL">All Vendors</option>
                {filterOptions.vendors.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer">
                <option value="ALL">All Categories</option>
                {filterOptions.categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={loadCatalog} className="p-2 rounded-xl border border-border hover:bg-muted transition-colors" title="Refresh">
                <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
              </button>
              {userRole === 'creator' && (
                <button onClick={() => setShowCreate(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
                  <Plus className="w-4 h-4" /> Create KPI
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── BODY: Split Panel ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: KPI List */}
        <div className={`${selectedKpi ? 'w-1/2 xl:w-3/5' : 'w-full'} flex flex-col overflow-hidden transition-all duration-300`}>
          {/* Column Header */}
          <div className="shrink-0 grid grid-cols-[1fr_100px_80px_80px_80px] gap-3 px-6 py-3 border-b border-border bg-muted/30">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">KPI</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Category</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tech</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vendor</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</span>
          </div>

          {/* List */}
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
              <div className="divide-y divide-border/50">
                {filtered.slice(0, 300).map(kpi => {
                  const isSelected = selectedKpi?.kpi_key === kpi.kpi_key;
                  const statusCfg = STATUS_CONFIG[kpi.status] || STATUS_CONFIG.active;
                  const vendorCfg = VENDOR_COLORS[kpi.vendor] || { bg: 'bg-muted', text: 'text-muted-foreground' };
                  const techCfg = TECH_COLORS[kpi.technology] || TECH_COLORS.ALL;
                  const catColor = CATEGORY_COLORS[kpi.category] || CATEGORY_COLORS.Other;

                  return (
                    <button
                      key={kpi.kpi_key || kpi.id}
                      onClick={() => setSelectedKpi(isSelected ? null : kpi)}
                      className={`w-full grid grid-cols-[1fr_100px_80px_80px_80px] gap-3 px-6 py-3.5 text-left transition-all hover:bg-muted/40 group ${
                        isSelected ? 'bg-primary/5 border-l-2 border-primary' : 'border-l-2 border-transparent'
                      }`}
                    >
                      {/* KPI Name + Code */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: catColor }} />
                          <h3 className="text-sm font-semibold text-foreground truncate">{kpi.display_name}</h3>
                        </div>
                        <p className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">{kpi.kpi_code}</p>
                        {kpi.unit && <span className="text-[9px] text-muted-foreground">{kpi.unit}</span>}
                      </div>

                      {/* Category */}
                      <div className="flex items-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider truncate" style={{ color: catColor }}>
                          {kpi.category}
                        </span>
                      </div>

                      {/* Tech */}
                      <div className="flex items-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${techCfg.bg} ${techCfg.text}`}>
                          {kpi.technology}
                        </span>
                      </div>

                      {/* Vendor */}
                      <div className="flex items-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${vendorCfg.bg} ${vendorCfg.text}`}>
                          {kpi.vendor}
                        </span>
                      </div>

                      {/* Status */}
                      <div className="flex items-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                      </div>
                    </button>
                  );
                })}
                {filtered.length > 300 && (
                  <div className="py-3 text-center text-[10px] text-muted-foreground">
                    Showing 300 of {filtered.length} — use search to narrow results
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer stats */}
          <div className="shrink-0 px-6 py-2 border-t border-border bg-muted/20 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {filtered.length} / {kpis.length} KPIs
            </span>
            <div className="flex items-center gap-3">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                const count = filtered.filter(k => k.status === key).length;
                if (!count) return null;
                return (
                  <span key={key} className={`text-[9px] font-bold ${cfg.color}`}>
                    {count} {cfg.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT: Floating Detail Panel */}
        {selectedKpi && (
          <div className="fixed top-0 right-0 z-40 h-screen w-[460px] p-3 pl-0 animate-in slide-in-from-right-4 duration-200">
            <KpiDetailPanel
              kpi={selectedKpi}
              onClose={() => setSelectedKpi(null)}
              onEdit={() => setEditingKpi(selectedKpi)}
              onDelete={() => handleDelete(selectedKpi)}
              userRole={userRole}
            />
          </div>
        )}
      </div>

      {/* Create Wizard */}
      {showCreate && (
        <KpiCreateWizard onSubmit={handleCreate} onClose={() => setShowCreate(false)} />
      )}

      {/* Edit Wizard (reuse Create) */}
      {editingKpi && (
        <KpiCreateWizard
          onSubmit={handleEdit}
          onClose={() => setEditingKpi(null)}
          initialData={editingKpi}
          mode="edit"
        />
      )}
    </div>
  );
};

export default KpiCatalogView;
