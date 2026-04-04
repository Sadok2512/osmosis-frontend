import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Search, Filter, Plus, Database, BarChart3, RefreshCw,
  ChevronRight, Hash, Shield, Layers, BookOpen
} from 'lucide-react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { toast } from 'sonner';
import type { KpiCatalogEntry, KpiStatus, UserRole, CounterEntry } from './kpiCatalogTypes';
import { STATUS_CONFIG, CATEGORY_COLORS, VENDOR_COLORS, TECH_COLORS } from './kpiCatalogTypes';
import KpiDetailPanel from './KpiDetailPanel';
import KpiCreateWizard from './KpiCreateWizard';

/* ── API helpers ── */
async function monitorGet<T>(path: string): Promise<T> {
  const url = getApiUrl(`monitor/${path}`);
  const res = await fetch(url, { headers: getApiHeaders() });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function monitorPost(path: string, body: any) {
  const url = getApiUrl(`monitor/${path}`);
  const res = await fetch(url, { method: 'POST', headers: getApiHeaders(), body: JSON.stringify(body) });
  return res.json();
}

function mapToEntry(k: any): KpiCatalogEntry {
  return {
    id: k.id || k.kpi_key,
    kpi_code: k.kpi_key || k.kpi_code,
    kpi_key: k.kpi_key,
    display_name: k.display_name || k.kpi_key,
    description: k.description || '',
    category: k.category || k.famille || 'Other',
    unit: k.unit || k.unites || '',
    technology: (k.techno || 'ALL') as any,
    vendor: k.vendor || 'ALL',
    formula: k.formula_sql || k.formula || '',
    formula_type: k.formula_type || 'ratio',
    numerator: {
      name: k.numerator_name || k.numerator || 'Numerator',
      description: k.numerator_desc || '',
      counters: parseCounters(k.numerator_counters || k.numerator || ''),
      source: k.num_source || 'OSS PM',
      granularity: k.num_granularity || '15min',
    },
    denominator: {
      name: k.denominator_name || k.denominator || 'Denominator',
      description: k.denominator_desc || '',
      counters: parseCounters(k.denominator_counters || k.denominator || ''),
      source: k.den_source || 'OSS PM',
      granularity: k.den_granularity || '15min',
    },
    status: (k.status as KpiStatus) || 'active',
    scope: k.scope || 'Cell',
    created_by: k.created_by || 'System',
    last_updated: k.updated_at || k.created_at || '—',
    is_normalized: k.is_normalized || false,
    supported_levels: k.supported_levels || [],
  };
}

function parseCounters(raw: string): CounterEntry[] {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean).map((name, i) => ({
    id: `c-${i}`,
    name,
    description: `PM counter: ${name}`,
    vendor_mapping: {},
    source_system: 'OSS PM',
    granularity: '15min',
  }));
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
  const [userRole] = useState<UserRole>('creator'); // Simulated — swap based on auth

  const loadCatalog = useCallback(() => {
    setLoading(true);
    monitorGet<any[]>('catalog/kpis')
      .then(data => setKpis(data.map(mapToEntry)))
      .catch(() => toast.error('Failed to load KPI catalog'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const categories = useMemo(() => [...new Set(kpis.map(k => k.category))].sort(), [kpis]);
  const vendors = useMemo(() => [...new Set(kpis.map(k => k.vendor).filter(Boolean))].sort(), [kpis]);

  const filtered = useMemo(() => kpis.filter(k => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      k.kpi_code.toLowerCase().includes(q) ||
      k.display_name.toLowerCase().includes(q) ||
      k.vendor.toLowerCase().includes(q) ||
      k.category.toLowerCase().includes(q) ||
      k.description.toLowerCase().includes(q);
    const matchTech = techFilter === 'ALL' || k.technology === techFilter;
    const matchVendor = vendorFilter === 'ALL' || k.vendor === vendorFilter;
    const matchCat = categoryFilter === 'ALL' || k.category === categoryFilter;
    return matchSearch && matchTech && matchVendor && matchCat;
  }), [kpis, search, techFilter, vendorFilter, categoryFilter]);

  const handleCreate = async (data: Record<string, any>) => {
    try {
      const r = await monitorPost('catalog/kpis', data);
      if (r.status === 'created') {
        toast.success(`KPI ${data.kpi_code} created`);
        setShowCreate(false);
        loadCatalog();
      } else {
        toast.error(r.message || 'Creation failed');
      }
    } catch {
      toast.error('API error');
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
                <option value="LTE">LTE</option>
                <option value="NR">NR</option>
              </select>
              <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer">
                <option value="ALL">All Vendors</option>
                {vendors.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer">
                <option value="ALL">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
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
                  const statusCfg = STATUS_CONFIG[kpi.status];
                  const vendorCfg = VENDOR_COLORS[kpi.vendor] || { bg: 'bg-muted', text: 'text-muted-foreground' };
                  const techCfg = TECH_COLORS[kpi.technology] || TECH_COLORS.ALL;
                  const catColor = CATEGORY_COLORS[kpi.category] || CATEGORY_COLORS.Other;

                  return (
                    <button
                      key={kpi.kpi_key}
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

        {/* RIGHT: Detail Panel */}
        {selectedKpi && (
          <div className="w-1/2 xl:w-2/5 overflow-hidden animate-in slide-in-from-right-4 duration-200">
            <KpiDetailPanel
              kpi={selectedKpi}
              onClose={() => setSelectedKpi(null)}
              userRole={userRole}
            />
          </div>
        )}
      </div>

      {/* Create Wizard */}
      {showCreate && (
        <KpiCreateWizard onSubmit={handleCreate} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
};

export default KpiCatalogView;
