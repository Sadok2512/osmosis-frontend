import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownRight,
  BookOpen,
  CheckCircle2,
  Eye,
  FilePenLine,
  Layers3,
  Loader2,
  Plus,
  Radar,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Table2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import KpiCreateWizard from '@/components/documentation/KpiCreateWizard';
import { createKpiInVps, fetchKpiCatalogFromVps, updateKpiInVps } from './kpiCatalogVps';
import type { AggFunc, KpiCatalogEntry, TechnoScope, ValueType } from './types';
import { useKpiExplain } from './api/kpiMonitorApi';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { vendorPillClass, techPillClass } from '@/constants/brandColors';

type DetailSection = 'overview' | 'formula' | 'thresholds' | 'source';
type FilterStatus = 'all' | 'active' | 'inactive';
const CATALOG_PAGE_SIZE = 80;

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
  numerator: string;
  denominator: string;
}

const STORAGE_KEY = 'osmosis_kpi_reference2_filters_v1';
const DEFAULT_COLOR = '#0f766e';
const VALUE_TYPES: ValueType[] = ['ratio', 'counter', 'gauge'];
const AGGREGATIONS: AggFunc[] = ['avg', 'sum', 'max', 'min', 'p95', 'p50', 'last', 'count'];
const TECHNO_OPTIONS: TechnoScope[] = ['4G', '5G', 'both'];

function buildFormula(numerator: string, denominator: string): string {
  const n = numerator.trim();
  const d = denominator.trim();
  if (!n && !d) return '';
  if (!d || d === '1') return n;
  if (!n) return `1 / (${d})`;
  return `(${n}) / (${d})`;
}

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
    numerator: kpi.numerator_counter || '',
    denominator: kpi.denominator_counter || '',
  };
}

const Panel: React.FC<{ title: string; description?: string; children: React.ReactNode; className?: string }> = ({ title, description, children, className }) => (
  <section className={cn('rounded-[28px] border border-border bg-card shadow-[0_20px_60px_rgba(15,23,42,0.06)]', className)}>
    <div className="border-b border-border/70 px-6 py-5">
      <h3 className="text-[13px] font-black uppercase tracking-[0.16em] text-foreground">{title}</h3>
      {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
    </div>
    <div className="p-6">{children}</div>
  </section>
);

const MetricCard: React.FC<{ icon: React.ReactNode; label: string; value: string; tone?: 'default' | 'primary' | 'success' | 'warning' }> = ({ icon, label, value, tone = 'default' }) => {
  const toneClass =
    tone === 'primary'
      ? 'bg-primary/10 text-primary'
      : tone === 'success'
        ? 'bg-emerald-50 text-emerald-700'
        : tone === 'warning'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-muted text-muted-foreground';

  return (
    <div className="rounded-[24px] border border-border bg-card p-5 shadow-sm">
      <div className={cn('mb-4 flex h-11 w-11 items-center justify-center rounded-2xl', toneClass)}>{icon}</div>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-black tracking-tight text-foreground">{value}</p>
    </div>
  );
};

const KpiReferenceWorkspace2: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [techFilter, setTechFilter] = useState<'all' | TechnoScope>('all');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [selectedKpiKey, setSelectedKpiKey] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<DetailSection[]>(['overview']);
  const [isEditing, setIsEditing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [activeView, setActiveView] = useState<'catalog' | 'create'>('catalog');
  const [draft, setDraft] = useState<KpiDraft | null>(null);
  const [catalogPage, setCatalogPage] = useState(1);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const reviewRef = React.useRef<HTMLDivElement | null>(null);

  const scrollToReview = () => {
    requestAnimationFrame(() => {
      const container = contentRef.current;
      const review = reviewRef.current;
      if (!container || !review) return;
      const top = review.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 24;
      container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    });
  };

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
    queryKey: ['kpi-reference2-catalog'],
    queryFn: fetchKpiCatalogFromVps,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: (previous) => previous,
    retry: 2,
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
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? isOperationalFocus : !isOperationalFocus);
      return matchesSearch && matchesCategory && matchesTech && matchesStatus;
    });
  }, [catalog, search, categoryFilter, techFilter, statusFilter]);

  const selectedKpi = useMemo(
    () => filteredCatalog.find(item => item.kpi_key === selectedKpiKey) || catalog.find(item => item.kpi_key === selectedKpiKey) || null,
    [catalog, filteredCatalog, selectedKpiKey]
  );

  const totalCatalogPages = Math.max(1, Math.ceil(filteredCatalog.length / CATALOG_PAGE_SIZE));
  const visibleCatalog = useMemo(
    () => filteredCatalog.slice((catalogPage - 1) * CATALOG_PAGE_SIZE, catalogPage * CATALOG_PAGE_SIZE),
    [filteredCatalog, catalogPage]
  );

  useEffect(() => {
    setCatalogPage(1);
  }, [search, categoryFilter, techFilter, statusFilter]);

  useEffect(() => {
    if (catalogPage > totalCatalogPages) setCatalogPage(totalCatalogPages);
  }, [catalogPage, totalCatalogPages]);

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

  // When backend explain returns numerator/denominator, prefill the editor
  // (only if the user hasn't already started editing them locally).
  useEffect(() => {
    if (!explain || !selectedKpi) return;
    setDraft(prev => {
      if (!prev) return prev;
      const next = { ...prev };
      if (!prev.numerator && explain.numerator) next.numerator = String(explain.numerator);
      if (!prev.denominator && explain.denominator) next.denominator = String(explain.denominator);
      return next;
    });
  }, [explain, selectedKpi]);

  // KPI Test state
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; value?: number; numerator?: number; denominator?: number } | null>(null);

  const updateMutation = useMutation({
    mutationFn: async (payload: { kpi: KpiCatalogEntry; draft: KpiDraft }) => {
      const { kpi, draft } = payload;
      const updateBody: Record<string, any> = {
        display_name: draft.display_name,
        description: draft.description,
        category: draft.category,
        techno: draft.techno_scope === 'both' ? '4G/5G' : draft.techno_scope,
        unit: draft.unit,
        value_type: draft.value_type,
        default_agg: draft.default_agg,
        color: draft.color,
        is_map_supported: draft.is_map_supported,
        threshold_warning: draft.warning.trim() === '' ? null : Number(draft.warning),
        threshold_critical: draft.critical.trim() === '' ? null : Number(draft.critical),
        numerator: draft.numerator.trim() || null,
        denominator: draft.denominator.trim() || null,
        formula_sql: buildFormula(draft.numerator, draft.denominator) || null,
      };

      await updateKpiInVps(kpi.kpi_key, updateBody);
      return true;
    },
    onSuccess: async (_result, payload) => {
      await queryClient.invalidateQueries({ queryKey: ['kpi-reference2-catalog'] });
      await queryClient.invalidateQueries({ queryKey: ['kpi-reference-catalog'] });
      sonnerToast.dismiss(`kpi-save-${payload.kpi.kpi_key}`);
      sonnerToast.success('KPI mis à jour', { description: 'Le référentiel a été rafraîchi.' });
      setIsEditing(false);
    },
    onError: (error: any, payload) => {
      sonnerToast.dismiss(`kpi-save-${payload.kpi.kpi_key}`);
      sonnerToast.error('Échec de la sauvegarde', { description: error?.message || 'Impossible de mettre à jour le KPI.' });
    },
  });

  const createMutation = useMutation({
    mutationFn: createKpiInVps,
    onSuccess: async (_result, payload) => {
      await queryClient.invalidateQueries({ queryKey: ['kpi-reference2-catalog'] });
      await queryClient.invalidateQueries({ queryKey: ['kpi-reference-catalog'] });
      toast({ title: 'KPI created', description: `${payload.kpi_code || payload.nom_ihm || 'New KPI'} has been added to the catalog.` });
      setShowCreate(false);
      setActiveView('catalog');
      if (payload.kpi_code) {
        setSelectedKpiKey(payload.kpi_code);
      }
    },
    onError: (error: any) => {
      toast({ title: 'Create failed', description: error?.message || 'Unable to create KPI.', variant: 'destructive' });
    },
  });

  const totalKpis = catalog.length;
  const mapReadyCount = catalog.filter(item => item.is_map_supported).length;
  const thresholdCount = catalog.filter(item => item.thresholds?.warning != null || item.thresholds?.critical != null).length;
  const activeCategoryCount = categories.length;
  const activeFilterCount = [search.trim() ? 1 : 0, categoryFilter !== 'all' ? 1 : 0, techFilter !== 'all' ? 1 : 0, statusFilter !== 'all' ? 1 : 0].reduce((sum, value) => sum + value, 0);
  const selectedIndex = selectedKpi ? filteredCatalog.findIndex(item => item.kpi_key === selectedKpi.kpi_key) : -1;
  const hasUnsavedChanges = selectedKpi && draft ? JSON.stringify(toDraft(selectedKpi)) !== JSON.stringify(draft) : false;

  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setTechFilter('all');
    setStatusFilter('all');
  };

  const openView = (kpi: KpiCatalogEntry) => {
    setSelectedKpiKey(kpi.kpi_key);
    setDraft(toDraft(kpi));
    // Always open in editable mode so the user can immediately modify the KPI.
    setIsEditing(true);
    setOpenSections(['overview', 'formula', 'thresholds', 'source']);
    const id = `kpi-open-${kpi.kpi_key}`;
    sonnerToast.loading('Chargement du KPI…', { id, description: kpi.display_name });
    // Safety net: auto-dismiss after 3s if the explain query never settles
    window.setTimeout(() => sonnerToast.dismiss(id), 3000);
    scrollToReview();
  };

  const openEdit = (kpi?: KpiCatalogEntry | null) => {
    const target = kpi || selectedKpi;
    if (!target) return;
    setSelectedKpiKey(target.kpi_key);
    setDraft(toDraft(target));
    setIsEditing(true);
    setOpenSections(['overview', 'formula', 'thresholds', 'source']);
    sonnerToast.dismiss(`kpi-edit-${target.kpi_key}`);
    scrollToReview();
  };

  // Dismiss loading toasts as soon as explain query settles (success OR error)
  useEffect(() => {
    if (!selectedKpi) return;
    if (explainQuery.isLoading || explainQuery.isFetching) return;
    sonnerToast.dismiss(`kpi-open-${selectedKpi.kpi_key}`);
    sonnerToast.dismiss(`kpi-edit-${selectedKpi.kpi_key}`);
  }, [selectedKpi, explainQuery.isLoading, explainQuery.isFetching, explainQuery.isError, explainQuery.isSuccess]);

  const saveDraft = () => {
    if (!selectedKpi || !draft) return;
    sonnerToast.loading('Enregistrement du KPI…', { id: `kpi-save-${selectedKpi.kpi_key}` });
    updateMutation.mutate({ kpi: selectedKpi, draft });
  };

  // ----- KPI TEST -----
  // Lightweight client-side evaluator: only allows digits, counter ids
  // (alphanum + underscore), operators + - * / parentheses and dots.
  const runTest = async () => {
    if (!draft) return;
    setTestResult(null);
    setTestRunning(true);
    try {
      const num = draft.numerator.trim();
      const den = draft.denominator.trim();
      if (!num) throw new Error('Le numerator est vide.');
      const SAFE_RE = /^[\sA-Za-z0-9_+\-*/().`]*$/;
      if (!SAFE_RE.test(num) || !SAFE_RE.test(den)) {
        throw new Error('Caractères non autorisés dans la formule (utilisez +, -, *, /, (), nombres et identifiants).');
      }
      // Replace each counter identifier by a deterministic mock value
      // derived from its name so tests are reproducible.
      const mockValue = (id: string) => {
        let h = 0;
        for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
        return 50 + (h % 950); // 50..999
      };
      const substitute = (expr: string) => expr
        .replace(/`/g, '')
        .replace(/[A-Za-z][A-Za-z0-9_]{2,}/g, (tok) => /\d/.test(tok) ? String(mockValue(tok)) : tok);
      const numExpr = substitute(num);
      const denExpr = den ? substitute(den) : '1';
      // eslint-disable-next-line no-new-func
      const numVal = Number(Function(`"use strict"; return (${numExpr});`)());
      // eslint-disable-next-line no-new-func
      const denVal = Number(Function(`"use strict"; return (${denExpr});`)());
      if (!Number.isFinite(numVal) || !Number.isFinite(denVal)) throw new Error('Le résultat n\'est pas un nombre fini.');
      if (denVal === 0) throw new Error('Division par zéro (denominator = 0).');
      const value = numVal / denVal;
      setTestResult({ ok: true, message: 'Formule valide.', value, numerator: numVal, denominator: denVal });
    } catch (e: any) {
      setTestResult({ ok: false, message: e?.message || 'Erreur inconnue.' });
    } finally {
      setTestRunning(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--muted))_52%,hsl(var(--background))_100%)] px-3 py-3 sm:px-5 sm:py-4">
      <div className="mb-4 rounded-xl border border-white/80 bg-white/78 px-6 py-5 shadow-[0_18px_60px_rgba(15,118,110,0.10)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-primary">OSMOSIS</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground">Référentiel KPI Réseau 2</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              A cleaner telecom reference workspace for browsing KPI definitions, opening a KPI in context, and editing metadata in the same lower review area.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveView('catalog')}
              className={cn(
                'flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-bold transition',
                activeView === 'catalog'
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                  : 'text-muted-foreground hover:bg-white hover:text-primary'
              )}
            >
              <BookOpen className="h-4 w-4" />
              <span>Catalog</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('create')}
              className={cn(
                'flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-bold transition',
                activeView === 'create'
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                  : 'text-muted-foreground hover:bg-white hover:text-primary'
              )}
            >
              <Plus className="h-4 w-4" />
              <span>Create KPI</span>
            </button>
          </div>
        </div>
      </div>

      <div ref={contentRef} className="flex-1 overflow-auto px-6 py-6">
        {activeView === 'create' ? (
          <KpiCreateWizard
            embedded
            onSubmit={async (payload) => createMutation.mutateAsync(payload)}
            onClose={() => {
              if (!createMutation.isPending) setActiveView('catalog');
            }}
          />
        ) : (
          <>
        <div className="mb-6 grid gap-4 xl:grid-cols-4">
          <MetricCard icon={<BookOpen className="h-5 w-5" />} label="Total KPIs" value={String(totalKpis)} tone="primary" />
          <MetricCard icon={<Layers3 className="h-5 w-5" />} label="Categories" value={String(activeCategoryCount)} />
          <MetricCard icon={<Radar className="h-5 w-5" />} label="Map Ready" value={String(mapReadyCount)} tone="success" />
          <MetricCard icon={<ShieldAlert className="h-5 w-5" />} label="Thresholded" value={String(thresholdCount)} tone="warning" />
        </div>

        <Panel title="Catalog Explorer" description="Search, filter, and open KPI definitions. The active KPI is reviewed in the panel below.">
          <div className="mb-5 grid gap-3 xl:grid-cols-[1.45fr_0.8fr_0.8fr_0.8fr]">
            <div className="relative min-w-0">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search by KPI key, label, or description"
                className="h-11 w-full rounded-lg border border-border bg-card px-11 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="h-11 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20">
              <option value="all">All categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <select value={techFilter} onChange={event => setTechFilter(event.target.value as 'all' | TechnoScope)} className="h-11 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20">
              <option value="all">All technologies</option>
              {TECHNO_OPTIONS.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as FilterStatus)} className="h-11 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20">
              <option value="all">All status</option>
              <option value="active">Operational focus</option>
              <option value="inactive">Other records</option>
            </select>
          </div>

          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary ring-1 ring-primary/20">
                {catalogQuery.isLoading ? 'Loading catalog...' : `${filteredCatalog.length} result${filteredCatalog.length === 1 ? '' : 's'}`}
              </span>
              {activeFilterCount > 0 ? (
                <span className="inline-flex items-center rounded-full bg-card px-3 py-1 text-[11px] font-bold text-foreground ring-1 ring-border">
                  {activeFilterCount} active filter{activeFilterCount === 1 ? '' : 's'}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-card px-3 py-1 text-[11px] font-bold text-muted-foreground ring-1 ring-border">
                  Full catalog view
                </span>
              )}
              {selectedKpi && selectedIndex >= 0 ? (
                <span className="inline-flex items-center rounded-full bg-card px-3 py-1 text-[11px] font-bold text-foreground ring-1 ring-border">
                  Row {selectedIndex + 1} of {filteredCatalog.length}
                </span>
              ) : null}
            </div>
            <button
              onClick={clearFilters}
              disabled={activeFilterCount === 0}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground transition hover:bg-muted hover:text-primary disabled:opacity-45"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Clear filters
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-[1.6fr_1fr_0.7fr_0.7fr_0.9fr_0.9fr_0.9fr_0.9fr_1.1fr] gap-3 bg-muted px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
              <span>KPI</span>
              <span>Category</span>
              <span>Tech</span>
              <span>Unit</span>
              <span>Vendor</span>
              <span>Normalized</span>
              <span>Status</span>
              <span>Coverage</span>
              <span>Actions</span>
            </div>
            <div className="divide-y divide-border bg-card">
              {catalogQuery.isLoading ? (
                <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="font-semibold">Chargement du catalogue KPI complet depuis le backend…</span>
                </div>
              ) : filteredCatalog.length > 0 ? visibleCatalog.map(item => {
                const isSelected = selectedKpiKey === item.kpi_key;
                const hasThresholds = item.thresholds?.warning != null || item.thresholds?.critical != null;
                return (
                  <div key={item.kpi_key} className={cn('grid grid-cols-[1.6fr_1fr_0.7fr_0.7fr_0.9fr_0.9fr_0.9fr_0.9fr_1.1fr] gap-3 px-4 py-3 text-sm transition-all', isSelected ? 'bg-primary/5 shadow-[inset_4px_0_0_0_hsl(var(--primary))]' : 'hover:bg-muted/40')}>
                    <button className="min-w-0 text-left" onClick={() => openView(item)}>
                      <p className="truncate font-bold text-foreground">{item.display_name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.kpi_key}</p>
                    </button>
                    <span className="text-foreground/90">{item.category}</span>
                    <span><span className={techPillClass(item.techno_scope)}>{item.techno_scope}</span></span>
                    <span className="text-foreground/90">{item.unit || '—'}</span>
                    <span>{item.vendor ? <span className={vendorPillClass(item.vendor)}>{item.vendor}</span> : <span className="text-muted-foreground">—</span>}</span>
                    <span>
                      {item.is_normalized ? (
                        <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">Yes</span>
                      ) : (
                        <span className="inline-flex rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-bold text-muted-foreground">No</span>
                      )}
                    </span>
                    <span>
                      {hasThresholds || item.is_map_supported ? (
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">Active</span>
                      ) : (
                        <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">Draft</span>
                      )}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold', item.is_map_supported ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-border bg-muted text-muted-foreground')}>
                        {item.is_map_supported ? 'Map ready' : 'Catalog only'}
                      </span>
                      {hasThresholds ? (
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                          Thresholds
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openView(item)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground transition hover:bg-muted hover:text-primary">
                        <Eye className="h-3.5 w-3.5" /> Open
                      </button>
                      <button onClick={() => openEdit(item)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground shadow-md shadow-primary/20 transition hover:bg-primary/90">
                        <FilePenLine className="h-3.5 w-3.5" /> Edit
                      </button>
                    </div>
                  </div>
                );
              }) : (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                  <Table2 className="h-10 w-10 text-primary/40" />
                  <div>
                    <p className="text-base font-bold text-foreground">No KPI found</p>
                    <p className="mt-1 text-sm text-muted-foreground">Adjust your filters to browse the KPI reference.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {filteredCatalog.length > CATALOG_PAGE_SIZE && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
              <span className="font-semibold text-muted-foreground">
                Showing {(catalogPage - 1) * CATALOG_PAGE_SIZE + 1}-{Math.min(catalogPage * CATALOG_PAGE_SIZE, filteredCatalog.length)} of {filteredCatalog.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCatalogPage(page => Math.max(1, page - 1))}
                  disabled={catalogPage <= 1}
                  className="h-8 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground transition hover:bg-muted hover:text-primary disabled:opacity-45"
                >
                  Prev
                </button>
                <span className="min-w-20 text-center text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {catalogPage} / {totalCatalogPages}
                </span>
                <button
                  onClick={() => setCatalogPage(page => Math.min(totalCatalogPages, page + 1))}
                  disabled={catalogPage >= totalCatalogPages}
                  className="h-8 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground transition hover:bg-muted hover:text-primary disabled:opacity-45"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </Panel>

        <div ref={reviewRef} className="mt-6 scroll-mt-6">
          <Panel title={selectedKpi ? `Review Workspace — ${selectedKpi.display_name}` : 'Review Workspace'} description={selectedKpi ? 'Open, review, and edit the selected KPI in the lower panel.' : 'Select a KPI above to open its lower review workspace.'}>
            {!selectedKpi || !draft ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Sparkles className="h-10 w-10 text-primary/40" />
                <div>
                  <p className="text-base font-bold text-foreground">No KPI selected</p>
                  <p className="mt-1 text-sm text-muted-foreground">Choose a KPI from the list to inspect it below.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {(explainQuery.isLoading || explainQuery.isFetching) && (
                  <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Chargement des détails du KPI (formule, compteurs, source)…</span>
                  </div>
                )}
                {updateMutation.isPending && (
                  <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm font-semibold text-amber-800">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Enregistrement des modifications en cours…</span>
                  </div>
                )}
                <div className="rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(240,253,250,0.95),rgba(255,255,255,0.96))] p-5 shadow-sm">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary">{selectedKpi.kpi_key}</span>
                        <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-[11px] font-bold text-foreground">{selectedKpi.category}</span>
                        <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-[11px] font-bold text-foreground">{selectedKpi.techno_scope}</span>
                        <span className={cn('inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold', hasUnsavedChanges ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>
                          {hasUnsavedChanges ? 'Unsaved changes' : 'Synchronized'}
                        </span>
                      </div>
                      <h2 className="mt-3 text-2xl font-black tracking-tight text-foreground">{draft.display_name}</h2>
                      <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">{draft.description || 'No KPI description available.'}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:w-[360px]">
                      <div className="rounded-2xl border border-border bg-card p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Workspace mode</p>
                        <p className="mt-2 text-sm font-bold text-foreground">{isEditing ? 'Editing metadata' : 'Read review mode'}</p>
                      </div>
                      <div className="rounded-2xl border border-border bg-card p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Update scope</p>
                        <p className="mt-2 text-sm font-bold text-foreground">Catalog metadata only</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    <button onClick={() => openView(selectedKpi)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:bg-muted hover:text-primary">
                      <Eye className="h-4 w-4" /> View
                    </button>
                    {isEditing ? (
                      <>
                        <button onClick={() => { setDraft(toDraft(selectedKpi)); setIsEditing(false); }} className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:bg-muted hover:text-primary">
                          Cancel
                        </button>
                        <button onClick={saveDraft} disabled={updateMutation.isPending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 transition hover:bg-primary/90 disabled:opacity-50">
                          <CheckCircle2 className="h-4 w-4" /> {updateMutation.isPending ? 'Saving...' : hasUnsavedChanges ? 'Save KPI' : 'Save (no changes)'}
                        </button>
                      </>
                    ) : (
                      <button onClick={() => openEdit()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 transition hover:bg-primary/90">
                        <FilePenLine className="h-4 w-4" /> Edit KPI
                      </button>
                    )}
                  </div>
                </div>

                <Accordion
                  type="multiple"
                  value={openSections}
                  onValueChange={(v) => setOpenSections(v as DetailSection[])}
                  className="space-y-3"
                >
                  {/* OVERVIEW */}
                  <AccordionItem value="overview" className="rounded-[24px] border border-border bg-card/80 px-5 [&]:border-b">
                    <AccordionTrigger className="py-4 text-left text-sm font-black uppercase tracking-[0.14em] text-foreground hover:no-underline">
                      Overview
                    </AccordionTrigger>
                    <AccordionContent className="pb-5 pt-1">
                      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Display name</label>
                              <input value={draft.display_name} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, display_name: event.target.value } : prev)} className="h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm text-foreground outline-none transition-all focus:border-primary disabled:opacity-75" />
                            </div>
                            <div>
                              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Category</label>
                              <select value={draft.category} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, category: event.target.value } : prev)} className="h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm text-foreground outline-none transition-all focus:border-primary disabled:opacity-75">
                                {categories.map(category => (
                                  <option key={category} value={category}>{category}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Technology</label>
                              <select value={draft.techno_scope} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, techno_scope: event.target.value as TechnoScope } : prev)} className="h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm text-foreground outline-none transition-all focus:border-primary disabled:opacity-75">
                                {TECHNO_OPTIONS.map(option => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Unit</label>
                              <input value={draft.unit} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, unit: event.target.value } : prev)} className="h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm text-foreground outline-none transition-all focus:border-primary disabled:opacity-75" />
                            </div>
                            <div>
                              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Value type</label>
                              <select value={draft.value_type} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, value_type: event.target.value as ValueType } : prev)} className="h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm text-foreground outline-none transition-all focus:border-primary disabled:opacity-75">
                                {VALUE_TYPES.map(option => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Default aggregation</label>
                              <select value={draft.default_agg} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, default_agg: event.target.value as AggFunc } : prev)} className="h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm text-foreground outline-none transition-all focus:border-primary disabled:opacity-75">
                                {AGGREGATIONS.map(option => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Description</label>
                            <textarea value={draft.description} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, description: event.target.value } : prev)} className="min-h-[120px] w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary disabled:opacity-75" />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-2xl border border-border bg-card p-5">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Reference summary</p>
                            <div className="mt-4 grid gap-3 text-sm text-foreground">
                              <div className="rounded-2xl border border-border bg-card p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">KPI key</p>
                                <p className="mt-2 break-words font-bold">{selectedKpi.kpi_key}</p>
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-2xl border border-border bg-card p-4">
                                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Aggregation</p>
                                  <p className="mt-2 font-bold">{draft.default_agg}</p>
                                </div>
                                <div className="rounded-2xl border border-border bg-card p-4">
                                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Value type</p>
                                  <p className="mt-2 font-bold">{draft.value_type}</p>
                                </div>
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-2xl border border-border bg-card p-4">
                                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Technology</p>
                                  <p className="mt-2 font-bold">{draft.techno_scope}</p>
                                </div>
                                <div className="rounded-2xl border border-border bg-card p-4">
                                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Unit</p>
                                  <p className="mt-2 font-bold">{draft.unit || '—'}</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-border bg-card p-5">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Operational profile</p>
                            <div className="mt-4 space-y-4">
                              <div>
                                <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Display color</label>
                                <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                                  <input type="color" value={draft.color} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, color: event.target.value } : prev)} className="h-10 w-12 rounded-lg border-0 bg-transparent p-0 disabled:opacity-75" />
                                  <span className="text-sm font-semibold text-foreground">{draft.color}</span>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-border bg-card px-4 py-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Map support</p>
                                    <p className="mt-1 text-sm text-foreground">Enable KPI availability in map-oriented workflows.</p>
                                  </div>
                                  <button disabled={!isEditing} onClick={() => setDraft(prev => prev ? { ...prev, is_map_supported: !prev.is_map_supported } : prev)} className={cn('relative h-7 w-12 rounded-full transition-all disabled:opacity-75', draft.is_map_supported ? 'bg-primary' : 'bg-muted')}>
                                    <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all', draft.is_map_supported ? 'right-1' : 'left-1')} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* FORMULA */}
                  <AccordionItem value="formula" className="rounded-[24px] border border-border bg-card/80 px-5 [&]:border-b">
                    <AccordionTrigger className="py-4 text-left text-base font-bold uppercase tracking-[0.1em] text-foreground hover:no-underline">
                      <div className="flex w-full items-center justify-between pr-3">
                        <span>Formula</span>
                        {explainQuery.isLoading ? <span className="text-xs font-medium normal-case tracking-normal text-muted-foreground">Loading explain...</span> : null}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-6 pt-2">
                      {(() => {
                        const liveFormula = buildFormula(draft.numerator, draft.denominator)
                          || explain?.formula
                          || selectedKpi.formula_sql
                          || 'No formula available';
                        const counters: any[] = Array.isArray(explain?.counters) ? explain.counters : [];

                        return (
                          <div className="space-y-5">
                            {/* Live calculation formula preview */}
                            <div className="rounded-2xl bg-primary px-6 py-5 text-primary-foreground shadow-md shadow-primary/20">
                              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-foreground/80">Calculation formula</p>
                              <p className="mt-3 break-words font-mono text-base font-medium leading-relaxed text-white">{liveFormula}</p>
                            </div>

                            {/* NUMERATOR / DENOMINATOR EDITORS (dark code blocks) */}
                            <div className="grid gap-5 xl:grid-cols-2">
                              <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-[0_10px_30px_rgba(2,6,23,0.25)]">
                                <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
                                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">Numerator</span>
                                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">Expression</span>
                                </div>
                                <textarea
                                  value={draft.numerator}
                                  onChange={e => setDraft(prev => prev ? { ...prev, numerator: e.target.value } : prev)}
                                  disabled={!isEditing}
                                  spellCheck={false}
                                  placeholder="ex: m55125c09514 + m55125c09515"
                                  className="block min-h-[160px] max-h-[320px] w-full resize-y overflow-auto bg-slate-950 px-5 py-4 font-mono text-sm leading-6 text-emerald-200 caret-emerald-200 outline-none placeholder:text-muted-foreground disabled:opacity-80"
                                />
                              </div>

                              <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-[0_10px_30px_rgba(2,6,23,0.25)]">
                                <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
                                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">Denominator</span>
                                  <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">Expression</span>
                                </div>
                                <textarea
                                  value={draft.denominator}
                                  onChange={e => setDraft(prev => prev ? { ...prev, denominator: e.target.value } : prev)}
                                  disabled={!isEditing}
                                  spellCheck={false}
                                  placeholder="ex: 1   ou   m55125c00005"
                                  className="block min-h-[160px] max-h-[320px] w-full resize-y overflow-auto bg-slate-950 px-5 py-4 font-mono text-sm leading-6 text-sky-200 caret-sky-200 outline-none placeholder:text-muted-foreground disabled:opacity-80"
                                />
                              </div>
                            </div>

                            {/* KPI TEST */}
                            <div className="rounded-2xl border border-border bg-card p-5">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-bold uppercase tracking-[0.12em] text-foreground">KPI Test</p>
                                  <p className="mt-1 text-xs text-muted-foreground">Évalue la formule avec des valeurs simulées pour vérifier sa validité avant sauvegarde.</p>
                                </div>
                                <button
                                  onClick={runTest}
                                  disabled={testRunning || !draft.numerator.trim()}
                                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 transition hover:bg-primary/90 disabled:opacity-50"
                                >
                                  {testRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                  {testRunning ? 'Test en cours…' : 'Run Test'}
                                </button>
                              </div>

                              {testResult ? (
                                testResult.ok ? (
                                  <div className="mt-4 space-y-3">
                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                                      Test réussi sur la page. Résultat calculé = <span className="font-mono font-black">{testResult.value?.toFixed(4)}</span>
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-3">
                                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Result</p>
                                        <p className="mt-2 font-mono text-2xl font-black text-emerald-800">{testResult.value?.toFixed(4)}</p>
                                      </div>
                                      <div className="rounded-xl border border-border bg-muted/40 p-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Numerator</p>
                                        <p className="mt-2 font-mono text-lg font-bold text-foreground">{testResult.numerator?.toFixed(2)}</p>
                                      </div>
                                      <div className="rounded-xl border border-border bg-muted/40 p-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Denominator</p>
                                        <p className="mt-2 font-mono text-lg font-bold text-foreground">{testResult.denominator?.toFixed(2)}</p>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                                    ✕ {testResult.message}
                                  </div>
                                )
                              ) : null}
                            </div>

                            {counters.length > 0 ? (
                              <div className="rounded-2xl border border-border bg-card p-5">
                                <p className="text-sm font-bold uppercase tracking-[0.12em] text-foreground">Counter usage (référence)</p>
                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                  {counters.map((counter: any, index: number) => (
                                    <div key={`${counter?.name || counter}-${index}`} className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground">
                                      <p className="break-all font-mono text-sm font-bold text-foreground">{counter?.name || counter}</p>
                                      {counter?.description ? <p className="mt-1.5 text-[13px] font-medium text-muted-foreground">{counter.description}</p> : null}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </AccordionContent>
                  </AccordionItem>

                  {/* THRESHOLDS */}
                  <AccordionItem value="thresholds" className="rounded-[24px] border border-border bg-card/80 px-5 [&]:border-b">
                    <AccordionTrigger className="py-4 text-left text-sm font-black uppercase tracking-[0.14em] text-foreground hover:no-underline">
                      Thresholds
                    </AccordionTrigger>
                    <AccordionContent className="pb-5 pt-1">
                      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                        <div className="rounded-2xl border border-border bg-card p-5">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Threshold configuration</p>
                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div>
                              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Warning</label>
                              <input value={draft.warning} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, warning: event.target.value } : prev)} className="h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm text-foreground outline-none transition-all focus:border-primary disabled:opacity-75" />
                            </div>
                            <div>
                              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Critical</label>
                              <input value={draft.critical} disabled={!isEditing} onChange={event => setDraft(prev => prev ? { ...prev, critical: event.target.value } : prev)} className="h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm text-foreground outline-none transition-all focus:border-primary disabled:opacity-75" />
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-border bg-card p-5">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Threshold preview</p>
                          <div className="mt-4 space-y-3 text-sm">
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-700">
                              Warning threshold: <span className="font-black">{draft.warning || 'Not defined'}</span>
                            </div>
                            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
                              Critical threshold: <span className="font-black">{draft.critical || 'Not defined'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* SOURCE */}
                  <AccordionItem value="source" className="rounded-[24px] border border-border bg-card/80 px-5 [&]:border-b">
                    <AccordionTrigger className="py-4 text-left text-sm font-black uppercase tracking-[0.14em] text-foreground hover:no-underline">
                      <div className="flex w-full items-center justify-between pr-3">
                        <span>Source</span>
                        {explainQuery.isLoading ? <span className="text-[10px] font-semibold normal-case tracking-normal text-muted-foreground">Loading explain...</span> : null}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-5 pt-1">
                      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                        <div className="rounded-2xl border border-border bg-card p-5">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Source metadata</p>
                          <div className="mt-4 grid gap-3 text-sm text-foreground">
                            <div className="rounded-2xl border border-border bg-card p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Source table</p>
                              <p className="mt-2 font-semibold">{explain?.source_table || 'Not exposed'}</p>
                            </div>
                            <div className="rounded-2xl border border-border bg-card p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Source column</p>
                              <p className="mt-2 font-semibold">{explain?.source_column || 'Not exposed'}</p>
                            </div>
                            <div className="rounded-2xl border border-border bg-card p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Supported levels</p>
                              <p className="mt-2 font-semibold">{Array.isArray(explain?.supported_levels) && explain.supported_levels.length > 0 ? explain.supported_levels.join(', ') : (selectedKpi.supported_levels?.join(', ') || 'Not exposed')}</p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-border bg-card p-5">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Review notes</p>
                          <div className="mt-4 rounded-2xl border border-border bg-card p-5 text-sm text-foreground">
                            <ul className="space-y-3">
                              <li className="flex items-start gap-2"><ArrowDownRight className="mt-0.5 h-4 w-4 text-primary" />Open and compare KPI definitions without losing the list context.</li>
                              <li className="flex items-start gap-2"><ArrowDownRight className="mt-0.5 h-4 w-4 text-primary" />Use edit mode for metadata only; technical source remains review-focused.</li>
                              <li className="flex items-start gap-2"><ArrowDownRight className="mt-0.5 h-4 w-4 text-primary" />Keep formula, thresholds, and source in one continuous analyst workflow.</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            )}
          </Panel>
        </div>
          </>
        )}
      </div>
    </div>
  );
};

export default KpiReferenceWorkspace2;
