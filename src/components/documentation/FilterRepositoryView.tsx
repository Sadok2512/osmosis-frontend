import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search, Plus, Filter as FilterIcon,
  MoreVertical, Eye, Pencil, Copy, Trash2, Star,
  ChevronLeft, ChevronRight, BarChart3, Loader2, Globe, Lock,
  Users, FolderOpen, CheckCircle2, Layers,
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

  // Current user (for "Me" filter & private filtering). Pulled from existing filter list owners.
  const currentUser = useMemo(() => {
    try { return localStorage.getItem('osmosis_username') || 'system'; } catch { return 'system'; }
  }, []);

  const loadFilters = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await fetchFilters({ limit: 500 });
      setFilters(resp.filters);
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

  // ── Stats ──
  const stats = useMemo(() => ({
    total: filters.length,
    public: filters.filter(f => f.visibility === 'public').length,
    private: filters.filter(f => f.visibility === 'private').length,
    active: filters.filter(f => f.status === 'active').length,
  }), [filters]);

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
      // Persist visibility too if backend supports it
      if (created?.id && data.visibility) {
        try { await updateFilter(created.id, { visibility: data.visibility }); } catch {}
      }
      setShowCreate(false);
      toast.success(`Cluster "${data.name}" créé`);
      if (data.topology?.length > 0) {
        countFilterMatching(created.id).catch(() => {});
      }
      loadFilters();
    } catch (err) {
      toast.error('Erreur lors de la création du cluster');
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
      toast.success(`Cluster "${data.name}" mis à jour`);
      loadFilters();
    } catch (err) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const handleDuplicate = async (filter: NetworkFilter) => {
    try {
      await duplicateFilter(filter.id);
      toast.success(`Cluster dupliqué`);
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
      toast.success(`Cluster supprimé`);
      setActionMenuId(null);
      loadFilters();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const fmtDate = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gradient-to-br from-muted/20 to-background">

      {/* ── STATS ROW ── */}
      <div className="shrink-0 px-6 pt-5 pb-3 grid grid-cols-4 gap-3">
        <StatCard icon={<FolderOpen className="w-4 h-4" />} label="Total Clusters" value={stats.total} accent="primary" />
        <StatCard icon={<Globe className="w-4 h-4" />} label="Public" value={stats.public} accent="emerald" />
        <StatCard icon={<Lock className="w-4 h-4" />} label="Private" value={stats.private} accent="amber" />
        <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Active" value={stats.active} accent="sky" />
      </div>

      {/* ── TOOLBAR ── */}
      <div className="shrink-0 px-6 pb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all"
          >
            <Plus className="w-4 h-4" /> New Cluster
          </button>

          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Search clusters by name, region, vendor…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-full border border-border/40 bg-card/80 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 backdrop-blur-sm"
            />
          </div>
        </div>

        {/* Filter chip row */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <ChipGroup label="Tech" options={allTechs} value={techFilter} onChange={setTechFilter} />
          <ChipGroup label="Vendor" options={allVendors} value={vendorFilter} onChange={setVendorFilter} />
          <ChipGroup
            label="Visibility"
            options={['All', 'public', 'private']}
            value={visibilityFilter}
            onChange={v => setVisibilityFilter(v as any)}
            renderOption={o => o === 'public' ? '🟢 Public' : o === 'private' ? '🔒 Private' : 'All'}
          />
          <ChipGroup
            label="Status"
            options={['All', 'draft', 'active', 'archived']}
            value={statusFilter}
            onChange={v => setStatusFilter(v as any)}
            renderOption={o => o === 'All' ? 'All' : o.charAt(0).toUpperCase() + o.slice(1)}
          />
          <ChipGroup
            label="Owner"
            options={['All', 'Me']}
            value={ownerFilter}
            onChange={v => setOwnerFilter(v as any)}
          />
        </div>
      </div>

      {/* ── TABLE ── */}
      <div className="flex-1 mx-6 mb-4 rounded-2xl bg-card/90 backdrop-blur-sm border border-border/20 shadow-sm flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground py-16">
            <FilterIcon className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-base font-semibold">No clusters match your filters</p>
            <p className="text-xs mt-1 opacity-60">Try adjusting filters, or create a new cluster</p>
            <button onClick={() => setShowCreate(true)} className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity">
              <Plus className="w-4 h-4" /> Create cluster
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="grid grid-cols-[2.4fr_1fr_0.7fr_1fr_1.1fr_0.9fr_0.9fr_60px] px-5 py-3 border-b border-border/20 bg-muted/20">
              {['NAME', 'SCOPE', 'TECH', 'VENDOR', 'VISIBILITY · STATUS', 'OWNER', 'UPDATED', ''].map(h => (
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
                const isPublic = filter.visibility === 'public';

                return (
                  <div
                    key={filter.id}
                    onClick={() => setSelectedFilter(filter)}
                    className="grid grid-cols-[2.4fr_1fr_0.7fr_1fr_1.1fr_0.9fr_0.9fr_60px] px-5 py-3.5 items-center cursor-pointer group hover:bg-primary/[0.03] transition-colors"
                  >
                    {/* Name + description */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                        <span className="text-[13px] font-bold text-foreground truncate">{filter.name}</span>
                      </div>
                      {filter.description && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5 ml-5">{filter.description}</p>
                      )}
                    </div>

                    {/* Scope */}
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-3 h-3 text-muted-foreground/50" />
                      {filter.matching_objects != null ? (
                        <span className="text-xs font-bold text-primary tabular-nums">
                          {filter.matching_objects.toLocaleString('fr-FR')} <span className="font-normal text-muted-foreground">cells</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/50 italic">—</span>
                      )}
                    </div>

                    {/* Tech */}
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

                    {/* Vendor */}
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {vendorParts.map(v => (
                          <span key={v} className={`text-xs font-semibold truncate ${VENDOR_COLORS[v] || 'text-foreground'}`}>{v}</span>
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate">{region}</span>
                    </div>

                    {/* Visibility · Status */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isPublic ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
                      }`}>
                        {isPublic ? <Globe className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                        {isPublic ? 'Public' : 'Private'}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        filter.status === 'active' ? 'bg-sky-500/10 text-sky-600' :
                        filter.status === 'draft' ? 'bg-amber-500/10 text-amber-600' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {filter.status.charAt(0).toUpperCase() + filter.status.slice(1)}
                      </span>
                    </div>

                    {/* Owner */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-5 h-5 rounded-full bg-muted/60 flex items-center justify-center shrink-0">
                        <Users className="w-3 h-3 text-muted-foreground" />
                      </div>
                      <span className="text-xs text-muted-foreground font-medium truncate">{filter.created_by}</span>
                    </div>

                    {/* Updated */}
                    <span className="text-xs text-muted-foreground tabular-nums">{fmtDate(filter.updated_at || filter.created_at)}</span>

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

            {/* Pagination */}
            <div className="shrink-0 px-5 py-3 border-t border-border/20 flex items-center justify-between bg-muted/10">
              <span className="text-[11px] text-muted-foreground">
                Showing {Math.min(filtered.length, (page - 1) * ITEMS_PER_PAGE + 1)}–{Math.min(filtered.length, page * ITEMS_PER_PAGE)} of {filtered.length} clusters
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors">
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map(p => (
                  <button key={p} onClick={() => setPage(p)} className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                    page === p ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'
                  }`}>{p}</button>
                ))}
                {totalPages > 5 && <span className="text-xs text-muted-foreground px-1">…</span>}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors">
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Drawer */}
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

      {/* Modals */}
      {showCreate && <ClusterBuilderWizard onSubmit={handleCreate} onClose={() => setShowCreate(false)} />}
      {editFilter && <ClusterBuilderWizard onSubmit={handleEdit} onClose={() => setEditFilter(null)} initialData={editFilter} editMode />}
    </div>
  );
};

/* ── Sub-components ── */

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: 'primary' | 'emerald' | 'amber' | 'sky';
}
const StatCard: React.FC<StatCardProps> = ({ icon, label, value, accent }) => {
  const accents = {
    primary: 'bg-primary/10 text-primary',
    emerald: 'bg-emerald-500/10 text-emerald-600',
    amber: 'bg-amber-500/10 text-amber-600',
    sky: 'bg-sky-500/10 text-sky-600',
  };
  return (
    <div className="rounded-2xl bg-card/90 backdrop-blur-sm border border-border/20 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accents[accent]}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-2xl font-black text-foreground tabular-nums leading-tight">{value}</p>
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
  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-card/70 border border-border/30 backdrop-blur-sm">
    <span className="text-[10px] font-bold uppercase text-muted-foreground/70 px-1">{label}:</span>
    {options.map(o => (
      <button
        key={o}
        onClick={() => onChange(o)}
        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
          value === o ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
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
