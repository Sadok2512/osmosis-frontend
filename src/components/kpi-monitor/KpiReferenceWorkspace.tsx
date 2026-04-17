import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  Eye,
  FilePenLine,
  Layers3,
  Search,
  ShieldAlert,
  Sparkles,
  Table2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { fetchKpiCatalogFromDB } from './kpiCatalog';
import type { AggFunc, KpiCatalogEntry, TechnoScope, ValueType } from './types';
import { useKpiExplain } from './api/kpiMonitorApi';

type DetailTab = 'overview' | 'formula' | 'thresholds' | 'source';
type FilterStatus = 'all' | 'active' | 'inactive';

interface KpiDraft {
  display_name: string;
  description: string;
  category: string;
  techno_scope: TechnoScope;
  unit: string;
  value_type: ValueType;
  default_agg: AggFunc;
  color: string;
  warning: string;
  critical: string;
  is_map_supported: boolean;
}

const STORAGE_KEY = 'osmosis_kpi_reference_filters_v1';
const CATEGORY_TO_FAMILLE: Record<string, string> = {
  Access: 'ACCESSIBILITY',
  Retainability: 'RETAINABILITY',
  Throughput: 'THROUGHPUT',
  Traffic: 'TRAFFIC',
  TCP: 'INTERFERENCE',
  Other: 'Corporate',
};

const DEFAULT_COLOR = '#3b82f6';
const VALUE_TYPES: ValueType[] = ['ratio', 'counter', 'gauge'];
const AGGREGATIONS: AggFunc[] = ['avg', 'sum', 'max', 'min', 'p95', 'p50', 'last', 'count'];
const TECHNO_OPTIONS: TechnoScope[] = ['4G', '5G', 'both'];

function toDraft(kpi: KpiCatalogEntry): KpiDraft {
  return {
    display_name: kpi.display_name || '',
    description: kpi.description || '',
    category: kpi.category || 'Other',
    techno_scope: kpi.techno_scope || 'both',
    unit: kpi.unit || '',
    value_type: kpi.value_type || 'gauge',
    default_agg: kpi.default_agg || 'avg',
    color: kpi.color || DEFAULT_COLOR,
    warning: kpi.thresholds?.warning != null ? String(kpi.thresholds.warning) : '',
    critical: kpi.thresholds?.critical != null ? String(kpi.thresholds.critical) : '',
    is_map_supported: Boolean(kpi.is_map_supported),
  };
}

const SectionCard: React.FC<{ title: string; description?: string; children: React.ReactNode; className?: string }> = ({
  title,
  description,
  children,
  className,
}) => (
  <section className={cn('rounded-3xl border border-border/60 bg-card shadow-[0_18px_48px_rgba(15,23,42,0.06)]', className)}>
    <div className="border-b border-border/50 px-6 py-5">
      <h3 className="text-sm font-black uppercase tracking-[0.14em] text-foreground">{title}</h3>
      {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
    </div>
    <div className="p-6">{children}</div>
  </section>
);

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; tone?: 'default' | 'primary' | 'success' | 'warning' }> = ({
  icon,
  label,
  value,
  tone = 'default',
}) => {
  const toneClass =
    tone === 'primary'
      ? 'bg-primary/10 text-primary'
      : tone === 'success'
        ? 'bg-emerald-500/10 text-emerald-600'
        : tone === 'warning'
          ? 'bg-amber-500/10 text-amber-600'
          : 'bg-slate-500/10 text-slate-700';

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm">
      <div className={cn('mb-4 flex h-11 w-11 items-center justify-center rounded-2xl', toneClass)}>{icon}</div>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-black tracking-tight text-foreground">{value}</p>
    </div>
  );
};

const KpiReferenceWorkspace: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [techFilter, setTechFilter] = useState<'all' | TechnoScope>('all');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [selectedKpiKey, setSelectedKpiKey] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<KpiDraft | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as {
        search?: string;
        categoryFilter?: string;
        techFilter?: 'all' | TechnoScope;
        statusFilter?: FilterStatus;
      };
      setSearch(parsed.search || '');
      setCategoryFilter(parsed.categoryFilter || 'all');
      setTechFilter(parsed.techFilter || 'all');
      setStatusFilter(parsed.statusFilter || 'all');
    } catch {
      // ignore malformed cache
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ search, categoryFilter, techFilter, statusFilter }));
  }, [search, categoryFilter, techFilter, statusFilter]);

  const catalogQuery = useQuery({
    queryKey: ['kpi-reference-catalog'],
    queryFn: fetchKpiCatalogFromDB,
    staleTime: 60_000,
  });

  const catalog = catalogQuery.data || [];
  const categories = useMemo(() => Array.from(new Set(catalog.map(item => item.category).filter(Boolean))).sort(), [catalog]);

  const filteredCatalog = useMemo(() => {
    return catalog.filter(item => {
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        item.display_name.toLowerCase().includes(query) ||
        item.kpi_key.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query);
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchesTech = techFilter === 'all' || item.techno_scope === techFilter;
      const isOperationalFocus = item.is_map_supported || Boolean(item.thresholds?.warning) || Boolean(item.thresholds?.critical);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? isOperationalFocus : !isOperationalFocus);
      return matchesSearch && matchesCategory && matchesTech && matchesStatus;
    });
  }, [catalog, search, categoryFilter, techFilter, statusFilter]);

  const selectedKpi = useMemo(
    () => filteredCatalog.find(item => item.kpi_key === selectedKpiKey) || catalog.find(item => item.kpi_key === selectedKpiKey) || null,
    [catalog, filteredCatalog, selectedKpiKey]
  );

  useEffect(() => {
    if (!selectedKpi && filteredCatalog.length > 0) {
      setSelectedKpiKey(filteredCatalog[0].kpi_key);
    }
  }, [filteredCatalog, selectedKpi]);

  useEffect(() => {
    if (selectedKpi) {
      setDraft(toDraft(selectedKpi));
    }
  }, [selectedKpi]);

  const explainQuery = useKpiExplain(selectedKpi?.kpi_key ?? null);
  const explain = (explainQuery.data || null) as any;

  const updateMutation = useMutation({
    mutationFn: async (payload: { kpi: KpiCatalogEntry; draft: KpiDraft }) => {
      const { kpi, draft } = payload;
      const updateBody = {
        display_name: draft.display_name,
        definition: draft.description,
        famille: CATEGORY_TO_FAMILLE[draft.category] || draft.category,
        techno: draft.techno_scope === 'both' ? '4G/5G' : draft.techno_scope,
        unit: draft.unit,
        value_type: draft.value_type,
        default_agg: draft.default_agg,
        color: draft.color,
        is_map_supported: draft.is_map_supported,
        threshold_warning: draft.warning.trim() === '' ? null : Number(draft.warning),
        threshold_critical: draft.critical.trim() === '' ? null : Number(draft.critical),
      };

      const { error } = await supabase.from('kpi_catalog').update(updateBody).eq('id', Number(kpi.kpi_id));
      if (error) throw error;
      return true;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['kpi-reference-catalog'] });
      toast({ title: 'KPI updated', description: 'The KPI reference has been refreshed.' });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({ title: 'Save failed', description: error?.message || 'Unable to update KPI metadata.', variant: 'destructive' });
    },
  });

  const totalKpis = catalog.length;
  const mapReadyCount = catalog.filter(item => item.is_map_supported).length;
  const thresholdCount = catalog.filter(item => item.thresholds?.warning != null || item.thresholds?.critical != null).length;
  const activeCategoryCount = categories.length;

  const hasUnsavedChanges = selectedKpi && draft ? JSON.stringify(toDraft(selectedKpi)) !== JSON.stringify(draft) : false;

  const openEdit = (kpi?: KpiCatalogEntry | null) => {
    const target = kpi || selectedKpi;
    if (!target) return;
    setSelectedKpiKey(target.kpi_key);
    setDraft(toDraft(target));
    setIsEditing(true);
    setDetailTab('overview');
  };

  const saveDraft = () => {
    if (!selectedKpi || !draft) return;
    updateMutation.mutate({ kpi: selectedKpi, draft });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.08),transparent_32%),linear-gradient(180deg,#f8fafc_0%,#f4f7fb_100%)]">
      <div className="border-b border-border/50 bg-background/80 px-6 py-5 backdrop-blur-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">OSMOSIS</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground">Référentiel KPI Réseau</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Browse, inspect, and edit KPI definitions in a cleaner telecom reference workspace. Open any KPI to review or edit it in the lower panel without losing list context.
            </p>
          </div>
          <div className="rounded-3xl border border-primary/20 bg-primary/6 px-5 py-4 text-right shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary">Flow</p>
            <p className="mt-1 text-sm font-semibold text-foreground">Search → Open KPI → Review / Edit → Save</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="mb-6 grid gap-4 xl:grid-cols-4">
          <StatCard icon={<BookOpen className="h-5 w-5" />} label="Total KPIs" value={String(totalKpis)} tone="primary" />
          <StatCard icon={<Layers3 className="h-5 w-5" />} label="Categories" value={String(activeCategoryCount)} />
          <StatCard icon={<BarChart3 className="h-5 w-5" />} label="Map Ready" value={String(mapReadyCount)} tone="success" />
          <StatCard icon={<ShieldAlert className="h-5 w-5" />} label="Thresholded" value={String(thresholdCount)} tone="warning" />
        </div>

        <SectionCard title="KPI Catalog" description="Filter and open KPI definitions. The selected KPI appears in the workspace below.">
          <div className="mb-5 grid gap-4 xl:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr]">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search by KPI key, label, or description"
                className="h-12 w-full rounded-2xl border border-border/60 bg-background px-11 text-sm outline-none transition-all focus:border-primary/40"
              />
            </div>
            <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="h-12 rounded-2xl border border-border/60 bg-background px-4 text-sm outline-none transition-all focus:border-primary/40">
              <option value="all">All categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <select value={techFilter} onChange={event => setTechFilter(event.target.value as 'all' | TechnoScope)} className="h-12 rounded-2xl border border-border/60 bg-background px-4 text-sm outline-none transition-all focus:border-primary/40">
              <option value="all">All technologies</option>
              {TECHNO_OPTIONS.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as FilterStatus)} className="h-12 rounded-2xl border border-border/60 bg-background px-4 text-sm outline-none transition-all focus:border-primary/40">
              <option value="all">All status</option>
              <option value="active">Operational focus</option>
              <option value="inactive">Other records</option>
            </select>
          </div>

          <div className="overflow-hidden rounded-3xl border border-border/60">
            <div className="grid grid-cols-[1.7fr_1.2fr_0.8fr_0.9fr_0.8fr_1.2fr] gap-3 bg-muted/35 px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              <span>KPI</span>
              <span>Category</span>
              <span>Tech</span>
              <span>Unit</span>
              <span>Map</span>
              <span>Actions</span>
            </div>
            <div className="divide-y divide-border/50 bg-card">
              {catalogQuery.isLoading ? (
                <div className="px-6 py-12 text-sm text-muted-foreground">Loading KPI reference...</div>
              ) : filteredCatalog.length > 0 ? filteredCatalog.map(item => {
                const isSelected = selectedKpiKey === item.kpi_key;
                return (
                  <div
                    key={item.kpi_key}
                    className={cn(
                      'grid grid-cols-[1.7fr_1.2fr_0.8fr_0.9fr_0.8fr_1.2fr] gap-3 px-4 py-4 text-sm transition-all',
                      isSelected ? 'bg-primary/6' : 'hover:bg-primary/5'
                    )}
                  >
                    <button className="min-w-0 text-left" onClick={() => { setSelectedKpiKey(item.kpi_key); setIsEditing(false); }}>
                      <p className="truncate font-bold text-foreground">{item.display_name}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{item.kpi_key}</p>
                    </button>
                    <span className="text-foreground">{item.category}</span>
                    <span className="font-semibold text-foreground">{item.techno_scope}</span>
                    <span className="text-foreground">{item.unit || '—'}</span>
                    <span>
                      <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold', item.is_map_supported ? 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700' : 'border-slate-500/20 bg-slate-500/10 text-slate-700')}>
                        {item.is_map_supported ? 'Ready' : 'No'}
                      </span>
                    </span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setSelectedKpiKey(item.kpi_key); setIsEditing(false); }} className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-1.5 text-xs font-bold text-foreground transition-all hover:border-primary/30 hover:text-primary">
                        <Eye className="h-3.5 w-3.5" /> Open
                      </button>
                      <button onClick={() => openEdit(item)} className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/8 px-3 py-1.5 text-xs font-bold text-primary transition-all hover:bg-primary/14">
                        <FilePenLine className="h-3.5 w-3.5" /> Edit
                      </button>
                    </div>
                  </div>
                );
              }) : (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                  <Table2 className="h-10 w-10 text-primary/35" />
                  <div>
                    <p className="text-base font-bold text-foreground">No KPI found</p>
                    <p className="mt-1 text-sm text-muted-foreground">Adjust your filters to browse the KPI reference.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        <div className="mt-6">
          <SectionCard
            title={selectedKpi ? `KPI Workspace — ${selectedKpi.display_name}` : 'KPI Workspace'}
            description={selectedKpi ? 'Open, review, and edit the selected KPI in the lower panel.' : 'Select a KPI above to open its detail workspace.'}
          >
            {!selectedKpi || !draft ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Sparkles className="h-10 w-10 text-primary/35" />
                <div>
                  <p className="text-base font-bold text-foreground">No KPI selected</p>
                  <p className="mt-1 text-sm text-muted-foreground">Choose a KPI from the table to inspect it below.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-[11px] font-bold text-primary">{selectedKpi.kpi_key}</span>
                      <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/25 px-3 py-1 text-[11px] font-bold text-foreground">{selectedKpi.category}</span>
                      <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/25 px-3 py-1 text-[11px] font-bold text-foreground">{selectedKpi.techno_scope}</span>
                    </div>
                    <h2 className="mt-3 text-xl font-black tracking-tight text-foreground">{draft.display_name}</h2>
                    <p className="mt-2 max-w-4xl text-sm text-muted-foreground">{draft.description || 'No KPI description available.'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {isEditing ? (
                      <>
                        <button onClick={() => { setDraft(toDraft(selectedKpi)); setIsEditing(false); }} className="rounded-2xl border border-border/60 bg-card px-4 py-2.5 text-xs font-bold text-foreground transition-all hover:border-primary/30 hover:text-primary">
                          Cancel
                        </button>
                        <button onClick={saveDraft} disabled={!hasUnsavedChanges || updateMutation.isPending} className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50">
                          <CheckCircle2 className="h-3.5 w-3.5" /> {updateMutation.isPending ? 'Saving...' : 'Save KPI'}
                        </button>
                      </>
                    ) : (
                      <button onClick={() => openEdit()} className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-primary-foreground transition-all hover:bg-primary/90">
                        <FilePenLine className="h-3.5 w-3.5" /> Edit KPI
                      </button>
                    )}
                  </div>
                </div>

                <div className="inline-flex rounded-2xl border border-border/60 bg-muted/20 p-1">
                  {[
                    { id: 'overview' as const, label: 'Overview' },
                    { id: 'formula' as const, label: 'Formula' },
                    { id: 'thresholds' as const, label: 'Thresholds' },
                    { id: 'source' as const, label: 'Source' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setDetailTab(tab.id)}
                      className={cn(
                        'rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition-all',
                        detailTab === tab.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {detailTab === 'overview' && (
                  <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="space-y-4 rounded-3xl border border-border/60 bg-background/60 p-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Display name</label>
                          <input value={draft.display_name} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, display_name: event.target.value } : prev)} className="h-11 w-full rounded-2xl border border-border/60 bg-card px-4 text-sm outline-none transition-all focus:border-primary/40 disabled:opacity-75" />
                        </div>
                        <div>
                          <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Category</label>
                          <select value={draft.category} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, category: event.target.value } : prev)} className="h-11 w-full rounded-2xl border border-border/60 bg-card px-4 text-sm outline-none transition-all focus:border-primary/40 disabled:opacity-75">
                            {categories.map(category => (
                              <option key={category} value={category}>{category}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Technology</label>
                          <select value={draft.techno_scope} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, techno_scope: event.target.value as TechnoScope } : prev)} className="h-11 w-full rounded-2xl border border-border/60 bg-card px-4 text-sm outline-none transition-all focus:border-primary/40 disabled:opacity-75">
                            {TECHNO_OPTIONS.map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Unit</label>
                          <input value={draft.unit} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, unit: event.target.value } : prev)} className="h-11 w-full rounded-2xl border border-border/60 bg-card px-4 text-sm outline-none transition-all focus:border-primary/40 disabled:opacity-75" />
                        </div>
                        <div>
                          <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Value type</label>
                          <select value={draft.value_type} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, value_type: event.target.value as ValueType } : prev)} className="h-11 w-full rounded-2xl border border-border/60 bg-card px-4 text-sm outline-none transition-all focus:border-primary/40 disabled:opacity-75">
                            {VALUE_TYPES.map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Default aggregation</label>
                          <select value={draft.default_agg} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, default_agg: event.target.value as AggFunc } : prev)} className="h-11 w-full rounded-2xl border border-border/60 bg-card px-4 text-sm outline-none transition-all focus:border-primary/40 disabled:opacity-75">
                            {AGGREGATIONS.map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Description</label>
                        <textarea value={draft.description} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, description: event.target.value } : prev)} className="min-h-[120px] w-full rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm outline-none transition-all focus:border-primary/40 disabled:opacity-75" />
                      </div>
                    </div>

                    <div className="space-y-4 rounded-3xl border border-border/60 bg-background/60 p-5">
                      <div>
                        <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Display color</label>
                        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3">
                          <input type="color" value={draft.color} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, color: event.target.value } : prev)} className="h-10 w-12 rounded-lg border-0 bg-transparent p-0 disabled:opacity-75" />
                          <span className="text-sm font-semibold text-foreground">{draft.color}</span>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border/60 bg-card px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Map support</p>
                            <p className="mt-1 text-sm text-foreground">Enable KPI availability in map-oriented workflows.</p>
                          </div>
                          <button
                            disabled={!isEditing}
                            onClick={() => setDraft(prev => prev ? { ...prev, is_map_supported: !prev.is_map_supported } : prev)}
                            className={cn('relative h-7 w-12 rounded-full transition-all disabled:opacity-75', draft.is_map_supported ? 'bg-primary' : 'bg-muted-foreground/30')}
                          >
                            <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all', draft.is_map_supported ? 'right-1' : 'left-1')} />
                          </button>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-primary/20 bg-primary/6 px-4 py-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary">Reference summary</p>
                        <ul className="mt-3 space-y-2 text-sm text-foreground">
                          <li>KPI key: <span className="font-bold">{selectedKpi.kpi_key}</span></li>
                          <li>Aggregation: <span className="font-bold">{draft.default_agg}</span></li>
                          <li>Value type: <span className="font-bold">{draft.value_type}</span></li>
                          <li>Tech scope: <span className="font-bold">{draft.techno_scope}</span></li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {detailTab === 'formula' && (
                  <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                    <div className="rounded-3xl border border-border/60 bg-background/60 p-5">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Formula structure</p>
                      <div className="mt-4 space-y-4 text-sm text-foreground">
                        <div className="rounded-2xl border border-border/60 bg-card p-4">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Numerator</p>
                          <p className="mt-2 break-words font-semibold">{explain?.numerator || selectedKpi.numerator_counter || 'No numerator exposed'}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-card p-4">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Denominator</p>
                          <p className="mt-2 break-words font-semibold">{explain?.denominator || selectedKpi.denominator_counter || 'No denominator exposed'}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-card p-4">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">SQL / Formula</p>
                          <p className="mt-2 break-words font-mono text-xs text-foreground">{explain?.formula || selectedKpi.formula_sql || 'No formula SQL available'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-border/60 bg-background/60 p-5">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Counter usage</p>
                      <div className="mt-4 space-y-3">
                        {Array.isArray(explain?.counters) && explain.counters.length > 0 ? explain.counters.map((counter: any, index: number) => (
                          <div key={`${counter?.name || counter}-${index}`} className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-foreground">
                            <p className="font-bold">{counter?.name || counter}</p>
                            {counter?.description ? <p className="mt-1 text-xs text-muted-foreground">{counter.description}</p> : null}
                          </div>
                        )) : (
                          <div className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
                            No explicit counter list returned for this KPI.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {detailTab === 'thresholds' && (
                  <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                    <div className="rounded-3xl border border-border/60 bg-background/60 p-5">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Threshold configuration</p>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Warning</label>
                          <input value={draft.warning} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, warning: event.target.value } : prev)} className="h-11 w-full rounded-2xl border border-border/60 bg-card px-4 text-sm outline-none transition-all focus:border-primary/40 disabled:opacity-75" />
                        </div>
                        <div>
                          <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Critical</label>
                          <input value={draft.critical} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, critical: event.target.value } : prev)} className="h-11 w-full rounded-2xl border border-border/60 bg-card px-4 text-sm outline-none transition-all focus:border-primary/40 disabled:opacity-75" />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-border/60 bg-background/60 p-5">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Threshold preview</p>
                      <div className="mt-4 space-y-3 text-sm">
                        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-amber-700">
                          Warning threshold: <span className="font-black">{draft.warning || 'Not defined'}</span>
                        </div>
                        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-red-700">
                          Critical threshold: <span className="font-black">{draft.critical || 'Not defined'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {detailTab === 'source' && (
                  <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                    <div className="rounded-3xl border border-border/60 bg-background/60 p-5">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Source metadata</p>
                      <div className="mt-4 grid gap-3 text-sm text-foreground">
                        <div className="rounded-2xl border border-border/60 bg-card p-4">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Source table</p>
                          <p className="mt-2 font-semibold">{explain?.source_table || 'Not exposed'}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-card p-4">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Source column</p>
                          <p className="mt-2 font-semibold">{explain?.source_column || 'Not exposed'}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-card p-4">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Supported levels</p>
                          <p className="mt-2 font-semibold">{Array.isArray(explain?.supported_levels) && explain.supported_levels.length > 0 ? explain.supported_levels.join(', ') : (selectedKpi.supported_levels?.join(', ') || 'Not exposed')}</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-border/60 bg-background/60 p-5">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Operational notes</p>
                      <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/6 p-5 text-sm text-foreground">
                        <ul className="space-y-2">
                          <li>Use the lower panel to inspect KPI source and formula without leaving the list.</li>
                          <li>Editing is scoped to KPI metadata fields only.</li>
                          <li>Technical formula details are fetched live from the KPI explain endpoint when available.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
};

export default KpiReferenceWorkspace;