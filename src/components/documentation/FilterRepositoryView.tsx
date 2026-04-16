import React, { useState, useMemo } from 'react';
import {
  Search, Plus, Filter as FilterIcon, SlidersHorizontal,
  MoreVertical, Eye, Pencil, Copy, Trash2, Star, Share2,
  ChevronLeft, ChevronRight, BarChart3, User
} from 'lucide-react';
import { toast } from 'sonner';
import type { NetworkFilter, FilterStatus } from './filterTypes';
import { MOCK_FILTERS, FILTER_STATUS_CONFIG } from './filterTypes';
import FilterDetailsDrawer from './FilterDetailsDrawer';
import CreateFilterWizard from './CreateFilterWizard';

const TECH_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  '2G': { label: '2G', bg: 'bg-amber-100', text: 'text-amber-700' },
  '3G': { label: '3G', bg: 'bg-orange-100', text: 'text-orange-700' },
  '4G': { label: '4G', bg: 'bg-blue-100', text: 'text-blue-700' },
  '5G': { label: '5G', bg: 'bg-emerald-100', text: 'text-emerald-700' },
};

const VENDOR_COLORS: Record<string, string> = {
  Nokia: 'text-blue-600',
  Ericsson: 'text-sky-600',
  Huawei: 'text-red-500',
  Samsung: 'text-indigo-600',
};

const ITEMS_PER_PAGE = 8;

/** Infer tech from filter topology bands */
function inferTech(filter: NetworkFilter): string[] {
  const bands = filter.topology.find(t => t.dimension === 'band')?.values || [];
  const techs = new Set<string>();
  bands.forEach(b => {
    if (b.startsWith('NR')) techs.add('5G');
    else if (b.startsWith('LTE')) techs.add('4G');
    else if (b.includes('UMTS') || b.includes('3G')) techs.add('3G');
    else if (b.includes('GSM') || b.includes('2G')) techs.add('2G');
  });
  return techs.size > 0 ? Array.from(techs) : ['All'];
}

function inferVendor(filter: NetworkFilter): string {
  const v = filter.topology.find(t => t.dimension === 'vendor')?.values;
  return v && v.length > 0 ? v.join(', ') : 'All';
}

function inferRegion(filter: NetworkFilter): string {
  const dor = filter.topology.find(t => t.dimension === 'dor')?.values;
  const plaque = filter.topology.find(t => t.dimension === 'plaque')?.values;
  if (dor && dor.length > 0) return dor[0].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).replace(/De /g, 'de ');
  if (plaque && plaque.length > 0) return plaque[0];
  return 'All';
}

const FilterRepositoryView: React.FC = () => {
  const [filters, setFilters] = useState<NetworkFilter[]>(MOCK_FILTERS);
  const [search, setSearch] = useState('');
  const [techFilter, setTechFilter] = useState<string>('All');
  const [vendorFilter, setVendorFilter] = useState<string>('All');
  const [selectedFilter, setSelectedFilter] = useState<NetworkFilter | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editFilter, setEditFilter] = useState<NetworkFilter | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const allVendors = useMemo(() => {
    const s = new Set<string>();
    filters.forEach(f => { const v = inferVendor(f); if (v !== 'All') v.split(', ').forEach(x => s.add(x)); });
    return ['All', ...Array.from(s).sort()];
  }, [filters]);

  const allTechs = ['All', '2G', '3G', '4G', '5G'];

  const filtered = useMemo(() => {
    return filters.filter(f => {
      const q = search.toLowerCase();
      const matchSearch = !search ||
        f.name.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.created_by.toLowerCase().includes(q);
      const matchTech = techFilter === 'All' || inferTech(f).includes(techFilter);
      const matchVendor = vendorFilter === 'All' || inferVendor(f).includes(vendorFilter);
      return matchSearch && matchTech && matchVendor;
    });
  }, [filters, search, techFilter, vendorFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  React.useEffect(() => { setPage(1); }, [search, techFilter, vendorFilter]);

  const handleCreate = (data: any) => {
    const newFilter: NetworkFilter = {
      id: `f-${Date.now()}`, name: data.name, description: data.description, status: data.status,
      permission: 'editable', visibility: 'private',
      created_by: 'Ali B.', created_at: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString().slice(0, 10), updated_by: 'Ali B.',
      topology: data.topology, parameters: data.parameters, logic: data.logic,
      condition_count: data.topology.length + data.parameters.length, matching_objects: Math.floor(Math.random() * 2000),
    };
    setFilters(prev => [newFilter, ...prev]);
    setShowCreate(false);
    toast.success(`Filtre "${data.name}" créé`);
  };

  const handleEdit = (data: any) => {
    if (!editFilter) return;
    setFilters(prev => prev.map(f => f.id === editFilter.id ? {
      ...f, ...data, updated_at: new Date().toISOString().slice(0, 10), updated_by: 'Ali B.',
      condition_count: data.topology.length + data.parameters.length,
    } : f));
    setEditFilter(null);
    setSelectedFilter(null);
    toast.success(`Filtre "${data.name}" mis à jour`);
  };

  const handleDuplicate = (filter: NetworkFilter) => {
    const dup: NetworkFilter = {
      ...filter, id: `f-${Date.now()}`, name: `${filter.name} (Copy)`,
      status: 'draft', permission: 'editable', created_at: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString().slice(0, 10),
    };
    setFilters(prev => [dup, ...prev]);
    toast.success(`Filtre dupliqué`);
    setActionMenuId(null);
  };

  const handleDelete = (filter: NetworkFilter) => {
    if (!confirm(`Supprimer le filtre "${filter.name}" ?`)) return;
    setFilters(prev => prev.filter(f => f.id !== filter.id));
    if (selectedFilter?.id === filter.id) setSelectedFilter(null);
    toast.success(`Filtre supprimé`);
    setActionMenuId(null);
  };

  // Stats
  const activeCount = filters.filter(f => f.status === 'active').length;
  const techDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    filters.forEach(f => inferTech(f).forEach(t => { dist[t] = (dist[t] || 0) + 1; }));
    return dist;
  }, [filters]);
  const vendorDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    filters.forEach(f => {
      const v = inferVendor(f);
      if (v !== 'All') v.split(', ').forEach(x => { dist[x] = (dist[x] || 0) + 1; });
    });
    return dist;
  }, [filters]);

  const topCreator = useMemo(() => {
    const counts: Record<string, number> = {};
    filters.forEach(f => { counts[f.created_by] = (counts[f.created_by] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0] ? { name: sorted[0][0], count: sorted[0][1] } : null;
  }, [filters]);

  const fmtDate = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'linear-gradient(135deg, hsl(220 60% 97%), hsl(220 40% 95%))' }}>

      {/* ── TOP BAR ── */}
      <div className="shrink-0 px-6 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* New filter button */}
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all">
            <Plus className="w-4 h-4" /> Nouveau filtre
          </button>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <input type="text" placeholder="Rechercher un filtre…" value={search} onChange={e => setSearch(e.target.value)}
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
                Tech: {t}
              </button>
            ))}
          </div>

          {/* Vendor filter */}
          <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
            className="px-3 py-2 rounded-full border border-border/30 bg-white/70 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer backdrop-blur-sm">
            {allVendors.map(v => <option key={v} value={v}>Vendor: {v}</option>)}
          </select>

          {/* Created by placeholder */}
          <button className="px-3 py-2 rounded-full border border-border/30 bg-white/70 text-xs font-medium text-muted-foreground hover:bg-white transition-colors backdrop-blur-sm">
            Created by
          </button>

          {/* Grid toggle */}
          <button className="p-2 rounded-lg border border-border/30 bg-white/70 text-muted-foreground hover:bg-white transition-colors backdrop-blur-sm">
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── TABLE ── */}
      <div className="flex-1 mx-6 mb-4 rounded-2xl bg-white/90 backdrop-blur-sm border border-border/20 shadow-sm flex flex-col overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground py-16">
            <FilterIcon className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-base font-semibold">No filters yet</p>
            <p className="text-xs mt-1 opacity-60">Start by creating your first filter</p>
            <button onClick={() => setShowCreate(true)}
              className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity">
              <Plus className="w-4 h-4" /> Create filter
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_60px] px-5 py-3 border-b border-border/20 bg-muted/20">
              {['NOM', 'TECHNOLOGY', 'VENDOR', 'REGION', 'CREATED BY', 'CREATION DATE', 'ACTIONS'].map(h => (
                <span key={h} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{h}</span>
              ))}
            </div>

            {/* Rows */}
            <div className="flex-1 overflow-y-auto divide-y divide-border/10">
              {paginated.map(filter => {
                const techs = inferTech(filter);
                const vendor = inferVendor(filter);
                const region = inferRegion(filter);
                const vendorParts = vendor.split(', ');

                return (
                  <div key={filter.id}
                    onClick={() => setSelectedFilter(filter)}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_60px] px-5 py-3.5 items-center cursor-pointer group hover:bg-primary/[0.02] transition-colors">

                    {/* Name */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] font-bold text-foreground truncate">{filter.name}</span>
                    </div>

                    {/* Tech badges */}
                    <div className="flex items-center gap-1">
                      {techs.map(t => {
                        const badge = TECH_BADGE[t];
                        return badge ? (
                          <span key={t} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                        ) : (
                          <span key={t} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">All</span>
                        );
                      })}
                    </div>

                    {/* Vendor */}
                    <div className="flex items-center gap-1 min-w-0">
                      {vendorParts.map(v => (
                        <span key={v} className={`text-xs font-semibold truncate ${VENDOR_COLORS[v] || 'text-foreground'}`}>{v}</span>
                      ))}
                    </div>

                    {/* Region */}
                    <span className="text-xs text-foreground truncate">{region}</span>

                    {/* Created by */}
                    <span className="text-xs text-muted-foreground font-medium truncate">{filter.created_by}</span>

                    {/* Date */}
                    <span className="text-xs text-muted-foreground tabular-nums">{fmtDate(filter.created_at)}</span>

                    {/* Actions */}
                    <div className="relative flex justify-end">
                      <button
                        onClick={e => { e.stopPropagation(); setActionMenuId(actionMenuId === filter.id ? null : filter.id); }}
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-muted/60 transition-all"
                      >
                        <MoreVertical className="w-4 h-4 text-muted-foreground" />
                      </button>

                      {actionMenuId === filter.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setActionMenuId(null)} />
                          <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border border-border/30 bg-white shadow-xl py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                            <button onClick={() => { setSelectedFilter(filter); setActionMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted/40 transition-colors">
                              <Eye className="w-3.5 h-3.5" /> Voir détails
                            </button>
                            <button onClick={() => { if (filter.permission !== 'locked') { setEditFilter(filter); setActionMenuId(null); } }}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${filter.permission === 'locked' ? 'text-muted-foreground/40 cursor-not-allowed' : 'text-foreground hover:bg-muted/40'}`}>
                              <Pencil className="w-3.5 h-3.5" /> Modifier
                            </button>
                            <button onClick={() => handleDuplicate(filter)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted/40 transition-colors">
                              <Copy className="w-3.5 h-3.5" /> Dupliquer
                            </button>
                            <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted/40 transition-colors">
                              <Star className="w-3.5 h-3.5" /> Favori
                            </button>
                            <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted/40 transition-colors">
                              <Share2 className="w-3.5 h-3.5" /> Partager
                            </button>
                            <div className="border-t border-border/20 my-1" />
                            <button onClick={() => handleDelete(filter)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/5 transition-colors">
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
                Showing {Math.min(filtered.length, (page - 1) * ITEMS_PER_PAGE + 1)}–{Math.min(filtered.length, page * ITEMS_PER_PAGE)} of {filtered.length} Filters
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
        {/* Activity card */}
        <div className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-md shadow-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 opacity-80" />
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">ACTIVITY</span>
          </div>
          <p className="text-3xl font-black">{filters.length}</p>
          <p className="text-[11px] opacity-70 mt-0.5">Filters created this month</p>
        </div>

        {/* Tech distribution */}
        <div className="rounded-2xl bg-white/90 backdrop-blur-sm border border-border/20 p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Distribution par technologie</p>
          <div className="space-y-2">
            {Object.entries(techDistribution).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tech, count]) => {
              const pct = Math.round((count / filters.length) * 100);
              const badge = TECH_BADGE[tech];
              return (
                <div key={tech} className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-muted-foreground w-16">{tech} ({pct}%)</span>
                  <div className="flex-1 h-2 rounded-full bg-muted/40 overflow-hidden">
                    <div className={`h-full rounded-full ${badge?.bg || 'bg-primary/30'}`} style={{ width: `${pct}%`, backgroundColor: tech === '4G' ? '#3b82f6' : tech === '5G' ? '#10b981' : undefined }} />
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground w-8 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
          {/* Vendor dots */}
          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/20">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">VENDORS</span>
            <div className="flex items-center gap-1.5">
              {Object.keys(vendorDistribution).slice(0, 4).map(v => (
                <span key={v} className={`text-[10px] font-bold ${VENDOR_COLORS[v] || 'text-foreground'}`}>
                  {v.charAt(0)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Top creator */}
        <div className="rounded-2xl bg-white/90 backdrop-blur-sm border border-border/20 p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">TOP CREATOR</p>
          {topCreator && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted/40 flex items-center justify-center">
                <User className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{topCreator.name}</p>
                <p className="text-[10px] text-muted-foreground">{topCreator.count} active filters</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODALS ── */}
      {selectedFilter && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/30 backdrop-blur-[2px]" onClick={() => setSelectedFilter(null)}>
          <div className="w-[420px] h-full bg-card shadow-2xl animate-in slide-in-from-right duration-200" onClick={e => e.stopPropagation()}>
            <FilterDetailsDrawer
              filter={selectedFilter}
              onClose={() => setSelectedFilter(null)}
              onEdit={() => { if (selectedFilter.permission !== 'locked') { setEditFilter(selectedFilter); setSelectedFilter(null); } }}
              onDuplicate={() => handleDuplicate(selectedFilter)}
              onDelete={() => handleDelete(selectedFilter)}
            />
          </div>
        </div>
      )}
      {showCreate && <CreateFilterWizard onSubmit={handleCreate} onClose={() => setShowCreate(false)} />}
      {editFilter && <CreateFilterWizard onSubmit={handleEdit} onClose={() => setEditFilter(null)} initialData={editFilter} editMode />}
    </div>
  );
};

export default FilterRepositoryView;
