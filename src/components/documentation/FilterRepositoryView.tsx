import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search, Plus, Filter as FilterIcon, MoreVertical, Eye, Pencil, Copy,
  Trash2, Star, ChevronLeft, ChevronRight, BarChart3, Loader2, Globe,
  Lock, Users, FolderOpen, CheckCircle2, Network,
  SlidersHorizontal, RotateCcw, ShieldCheck, Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import type { NetworkFilter, FilterVisibility } from './filterTypes';
import FilterDetailsDrawer from './FilterDetailsDrawer';
import ClusterBuilderWizard from './ClusterBuilderWizard';
import { fetchFilters, createFilter, updateFilter, deleteFilter, duplicateFilter, countFilterMatching } from '@/services/filterService';

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
  const [filters, setFilters] = useState<NetworkFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [techFilter, setTechFilter] = useState<string>('All');
  const [vendorFilter, setVendorFilter] = useState<string>('All');
  const [visibilityFilter, setVisibilityFilter] = useState<'All' | FilterVisibility>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'draft' | 'active' | 'archived'>('All');
  const [ownerFilter, setOwnerFilter] = useState<'All' | 'Me'>('All');
  const [selectedFilter, setSelectedFilter] = useState<NetworkFilter | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editFilter, setEditFilter] = useState<NetworkFilter | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const currentUser = useMemo(() => {
    try { return localStorage.getItem('osmosis_username') || 'system'; } catch { return 'system'; }
  }, []);

  const loadFilters = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await fetchFilters({ limit: 500 });
      setFilters(Array.isArray(resp?.filters) ? resp.filters : []);
    } catch (err) {
      console.warn('[FilterCatalog] Failed to load filters:', err);
      toast.error('Impossible de charger les filtres');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFilters(); }, [loadFilters]);

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
        f.created_by.toLowerCase().includes(q) ||
        inferRegion(f).toLowerCase().includes(q) ||
        inferVendor(f).toLowerCase().includes(q);
      const matchTech = techFilter === 'All' || inferTech(f).includes(techFilter);
      const matchVendor = vendorFilter === 'All' || inferVendor(f).includes(vendorFilter);
      const matchVisibility = visibilityFilter === 'All' || f.visibility === visibilityFilter;
      const matchStatus = statusFilter === 'All' || f.status === statusFilter;
      const matchOwner = ownerFilter === 'All' || f.created_by === currentUser;
      return matchSearch && matchTech && matchVendor && matchVisibility && matchStatus && matchOwner;
    });
  }, [filters, search, techFilter, vendorFilter, visibilityFilter, statusFilter, ownerFilter, currentUser]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => { setPage(1); }, [search, techFilter, vendorFilter, visibilityFilter, statusFilter, ownerFilter]);

  const stats = useMemo(() => ({
    total: filters.length,
    public: filters.filter(f => f.visibility === 'public').length,
    private: filters.filter(f => f.visibility === 'private').length,
    active: filters.filter(f => f.status === 'active').length,
  }), [filters]);

  const activeFilterCount = [
    search.trim(),
    techFilter !== 'All' ? techFilter : '',
    vendorFilter !== 'All' ? vendorFilter : '',
    visibilityFilter !== 'All' ? visibilityFilter : '',
    statusFilter !== 'All' ? statusFilter : '',
    ownerFilter !== 'All' ? ownerFilter : '',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setSearch('');
    setTechFilter('All');
    setVendorFilter('All');
    setVisibilityFilter('All');
    setStatusFilter('All');
    setOwnerFilter('All');
  };

  const handleCreate = async (data: any) => {
    try {
      const created = await createFilter({
        name: data.name,
        description: data.description,
        status: data.status,
        topology: data.topology,
        parameters: data.parameters,
        logic: data.logic,
      });
      if (created?.id && data.visibility) {
        try { await updateFilter(created.id, { visibility: data.visibility }); } catch {}
      }
      setShowCreate(false);
      toast.success(`Cluster "${data.name}" cree`);
      if (data.topology?.length > 0) {
        countFilterMatching(created.id).catch(() => {});
      }
      loadFilters();
    } catch {
      toast.error('Erreur lors de la creation du cluster');
    }
  };

  const handleEdit = async (data: any) => {
    if (!editFilter) return;
    try {
      await updateFilter(editFilter.id, {
        name: data.name,
        description: data.description,
        status: data.status,
        visibility: data.visibility,
        topology: data.topology,
        parameters: data.parameters,
        logic: data.logic,
      });
      setEditFilter(null);
      setSelectedFilter(null);
      toast.success(`Cluster "${data.name}" mis a jour`);
      loadFilters();
    } catch {
      toast.error('Erreur lors de la mise a jour');
    }
  };

  const handleDuplicate = async (filter: NetworkFilter) => {
    try {
      await duplicateFilter(filter.id);
      toast.success('Cluster duplique');
      setActionMenuId(null);
      loadFilters();
    } catch {
      toast.error('Erreur lors de la duplication');
    }
  };

  const handleDelete = async (filter: NetworkFilter) => {
    if (!confirm(`Supprimer le cluster "${filter.name}" ?`)) return;
    try {
      await deleteFilter(filter.id);
      if (selectedFilter?.id === filter.id) setSelectedFilter(null);
      toast.success('Cluster supprime');
      setActionMenuId(null);
      loadFilters();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const fmtDate = (iso: string) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted))/0.34)]">
      <div className="shrink-0 px-6 pt-5 pb-4">
        <div className="rounded-[28px] border border-border/50 bg-card/85 shadow-sm backdrop-blur-xl overflow-hidden">
          <div className="px-5 py-5 border-b border-emerald-900/20 bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-800 text-white">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-100">
                  <Network className="h-3.5 w-3.5" />
                  Network References
                </div>
                <h2 className="mt-3 text-2xl font-black tracking-tight">Filters repository</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-300">
                  Create, audit and reuse topology filters for RAN scopes, dashboards and investigations.
                </p>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-emerald-400 px-4 py-2.5 text-xs font-black text-emerald-950 shadow-lg shadow-emerald-950/30 transition-all hover:-translate-y-0.5 hover:bg-emerald-300"
              >
                <Plus className="h-4 w-4" /> Create filter
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard icon={<FolderOpen className="w-4 h-4" />} label="Total filters" value={stats.total} accent="primary" />
              <StatCard icon={<Globe className="w-4 h-4" />} label="Public" value={stats.public} accent="emerald" />
              <StatCard icon={<Lock className="w-4 h-4" />} label="Private" value={stats.private} accent="amber" />
              <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Active" value={stats.active} accent="sky" />
            </div>
          </div>

          <div className="space-y-3 px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[260px] flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  type="text"
                  placeholder="Search by name, owner, region or vendor"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-border/60 bg-background/80 pl-10 pr-4 text-sm shadow-inner outline-none transition focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10"
                />
              </div>
              <div className="inline-flex items-center gap-2 rounded-2xl border border-border/50 bg-muted/30 px-3 py-2 text-xs font-bold text-muted-foreground">
                <SlidersHorizontal className="h-4 w-4" />
                {filtered.length.toLocaleString('fr-FR')} shown
                <span className="h-4 w-px bg-border" />
                {activeFilterCount} active filters
              </div>
              {activeFilterCount > 0 && (
                <button
                  onClick={resetFilters}
                  className="inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-background px-3 py-2 text-xs font-bold text-foreground transition hover:bg-muted"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ChipGroup label="Tech" options={allTechs} value={techFilter} onChange={setTechFilter} />
              <ChipGroup label="Vendor" options={allVendors} value={vendorFilter} onChange={setVendorFilter} />
              <ChipGroup
                label="Visibility"
                options={['All', 'public', 'private']}
                value={visibilityFilter}
                onChange={v => setVisibilityFilter(v as any)}
                renderOption={o => o === 'public' ? 'Public' : o === 'private' ? 'Private' : 'All'}
              />
              <ChipGroup
                label="Status"
                options={['All', 'draft', 'active', 'archived']}
                value={statusFilter}
                onChange={v => setStatusFilter(v as any)}
                renderOption={o => o === 'All' ? 'All' : o.charAt(0).toUpperCase() + o.slice(1)}
              />
              <ChipGroup label="Owner" options={['All', 'Me']} value={ownerFilter} onChange={v => setOwnerFilter(v as any)} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 mx-6 mb-4 rounded-[24px] bg-card/95 backdrop-blur-sm border border-border/50 shadow-sm flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
            <span className="text-xs font-semibold">Loading network filters...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground py-16">
            <div className="mb-4 rounded-3xl bg-muted/50 p-5">
              <FilterIcon className="w-10 h-10 opacity-40" />
            </div>
            <p className="text-base font-bold text-foreground">No filters match this view</p>
            <p className="text-xs mt-1 opacity-70">Adjust the search criteria or create a new reusable network filter.</p>
            <button onClick={() => setShowCreate(true)} className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 transition-colors">
              <Plus className="w-4 h-4" /> Create filter
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[2.2fr_0.9fr_0.75fr_1fr_1.15fr_0.95fr_0.85fr_88px] px-5 py-3 border-b border-border/50 bg-muted/35">
              {['Filter', 'Scope', 'Tech', 'Vendor', 'State', 'Owner', 'Updated', 'Actions'].map(h => (
                <span key={h} className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">{h}</span>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-border/10">
              {paginated.map(filter => {
                const techs = inferTech(filter);
                const vendor = inferVendor(filter);
                const region = inferRegion(filter);
                const vendorParts = vendor.split(', ');
                const isPublic = filter.visibility === 'public';

                return (
                  <div
                    key={filter.id}
                    onClick={() => setSelectedFilter(filter)}
                    className="grid grid-cols-[2.2fr_0.9fr_0.75fr_1fr_1.15fr_0.95fr_0.85fr_88px] px-5 py-4 items-center cursor-pointer group hover:bg-emerald-500/[0.05] transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white">
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                        <span className="text-[13px] font-bold text-foreground truncate">{filter.name}</span>
                      </div>
                      {filter.description && (
                        <p className="text-[11px] text-muted-foreground truncate mt-1 ml-10">{filter.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-emerald-500" />
                      {filter.matching_objects != null ? (
                        <span className="text-xs font-black text-foreground tabular-nums">
                          {filter.matching_objects.toLocaleString('fr-FR')} <span className="font-normal text-muted-foreground">cells</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/50 italic">Not counted</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 flex-wrap">
                      {techs.map(t => {
                        const badge = TECH_BADGE[t];
                        return badge ? (
                          <span key={t} className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                        ) : (
                          <span key={t} className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-muted text-muted-foreground">All</span>
                        );
                      })}
                    </div>

                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {vendorParts.map(v => (
                          <span key={v} className={`text-xs font-semibold truncate ${VENDOR_COLORS[v] || 'text-foreground'}`}>{v}</span>
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate">{region}</span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isPublic ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
                      }`}>
                        {isPublic ? <Globe className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                        {isPublic ? 'Public' : 'Private'}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        filter.status === 'active' ? 'bg-emerald-500/10 text-emerald-700' :
                        filter.status === 'draft' ? 'bg-amber-500/10 text-amber-600' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {filter.status.charAt(0).toUpperCase() + filter.status.slice(1)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-5 h-5 rounded-full bg-muted/60 flex items-center justify-center shrink-0">
                        <Users className="w-3 h-3 text-muted-foreground" />
                      </div>
                      <span className="text-xs text-muted-foreground font-medium truncate">{filter.created_by}</span>
                    </div>

                    <span className="text-xs text-muted-foreground tabular-nums">{fmtDate(filter.updated_at || filter.created_at)}</span>

                    <div className="relative flex justify-end gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedFilter(filter); }}
                        className="p-1.5 rounded-lg border border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground transition-all"
                        title="Open"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setActionMenuId(actionMenuId === filter.id ? null : filter.id); }}
                        className="p-1.5 rounded-lg border border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground transition-all"
                        title="More actions"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {actionMenuId === filter.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setActionMenuId(null)} />
                          <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border border-border/30 bg-card shadow-xl py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                            <ActionItem icon={<Eye className="w-3.5 h-3.5" />} label="Open" onClick={() => { setSelectedFilter(filter); setActionMenuId(null); }} />
                            <ActionItem
                              icon={<Pencil className="w-3.5 h-3.5" />}
                              label="Edit"
                              disabled={filter.permission === 'locked'}
                              onClick={() => { if (filter.permission !== 'locked') { setEditFilter(filter); setActionMenuId(null); } }}
                            />
                            <ActionItem icon={<Copy className="w-3.5 h-3.5" />} label="Duplicate" onClick={() => handleDuplicate(filter)} />
                            <ActionItem
                              icon={<BarChart3 className="w-3.5 h-3.5" />}
                              label="Recalculate scope"
                              onClick={async () => {
                                setActionMenuId(null);
                                try {
                                  const r = await countFilterMatching(filter.id);
                                  toast.success(`${r.cells.toLocaleString('fr-FR')} cells, ${r.sites.toLocaleString('fr-FR')} sites`);
                                  loadFilters();
                                } catch { toast.error('Erreur lors du calcul'); }
                              }}
                            />
                            <ActionItem icon={<Star className="w-3.5 h-3.5" />} label="Favorite" onClick={() => setActionMenuId(null)} />
                            <div className="border-t border-border/20 my-1" />
                            <ActionItem icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete" tone="destructive" onClick={() => handleDelete(filter)} />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="shrink-0 px-5 py-3 border-t border-border/20 flex items-center justify-between bg-muted/10">
              <span className="text-[11px] text-muted-foreground">
                Showing {Math.min(filtered.length, (page - 1) * ITEMS_PER_PAGE + 1)}-{Math.min(filtered.length, page * ITEMS_PER_PAGE)} of {filtered.length} filters
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors">
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map(p => (
                  <button key={p} onClick={() => setPage(p)} className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                    page === p ? 'bg-emerald-700 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted'
                  }`}>{p}</button>
                ))}
                {totalPages > 5 && <span className="text-xs text-muted-foreground px-1">...</span>}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors">
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

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

      {showCreate && <ClusterBuilderWizard onSubmit={handleCreate} onClose={() => setShowCreate(false)} />}
      {editFilter && <ClusterBuilderWizard onSubmit={handleEdit} onClose={() => setEditFilter(null)} initialData={editFilter} editMode />}
    </div>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: 'primary' | 'emerald' | 'amber' | 'sky';
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, accent }) => {
  const accents = {
    primary: 'bg-white/10 text-emerald-100 border-white/10',
    emerald: 'bg-emerald-400/15 text-emerald-100 border-emerald-300/20',
    amber: 'bg-amber-400/15 text-amber-100 border-amber-300/20',
    sky: 'bg-teal-400/15 text-teal-100 border-teal-300/20',
  };
  return (
    <div className={`rounded-2xl border p-3 shadow-sm backdrop-blur-sm ${accents[accent]}`}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">{label}</p>
          <p className="text-2xl font-black tabular-nums leading-tight">{value}</p>
        </div>
      </div>
    </div>
  );
};

interface ChipGroupProps {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  renderOption?: (o: string) => string;
}

const ChipGroup: React.FC<ChipGroupProps> = ({ label, options, value, onChange, renderOption }) => (
  <div className="inline-flex items-center gap-1 rounded-2xl border border-border/50 bg-background/70 px-2 py-1 shadow-sm">
    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/70 px-1">{label}</span>
    {options.map(o => (
      <button
        key={o}
        onClick={() => onChange(o)}
        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all ${
          value === o ? 'bg-emerald-700 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-emerald-50'
        }`}
      >
        {renderOption ? renderOption(o) : (o === 'All' ? 'All' : o)}
      </button>
    ))}
  </div>
);

interface ActionItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'destructive';
}

const ActionItem: React.FC<ActionItemProps> = ({ icon, label, onClick, disabled, tone = 'default' }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
      disabled ? 'text-muted-foreground/40 cursor-not-allowed' :
      tone === 'destructive' ? 'text-destructive hover:bg-destructive/5' :
      'text-foreground hover:bg-muted/40'
    }`}
  >
    {icon} {label}
  </button>
);

export default FilterRepositoryView;
