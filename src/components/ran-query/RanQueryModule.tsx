import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  Copy,
  Download,
  FileUp,
  Filter,
  FolderOpen,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  XCircle,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { vendorBadge, techBadge } from '@/constants/brandColors';
import KpiSelectorModal from '@/components/kpi-monitor/KpiSelectorModal';
import CounterSelectorModal from '@/components/investigator/CounterSelectorModal';
import { fetchKpiCatalogFromDB } from '@/components/kpi-monitor/kpiCatalog';
import type { KpiCatalogEntry } from '@/components/kpi-monitor/types';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type ReportStatus = 'Draft' | 'Ready' | 'Running' | 'Completed' | 'Failed';
type TimeMode = 'absolute' | 'relative';
type Tech = '2G' | '3G' | '4G' | '5G';
type RelativeUnit = 'minutes' | 'hours' | 'days';

type RelativePreset = '1h' | '24h' | '7d' | '30d' | '90d' | 'custom';

interface AbsoluteTimeConfig {
  timeMode: 'absolute';
  start: string;
  end: string;
}

interface RelativeTimeConfig {
  timeMode: 'relative';
  value: number;
  unit: RelativeUnit;
  end: 'now';
}

type TimeConfig = AbsoluteTimeConfig | RelativeTimeConfig;

interface ReportResultRow {
  kpi: string;
  vendor: string;
  technology: string;
  timestamp: string;
  value: number;
  unit: string;
  trend: number;
}

interface RanReport {
  id: string;
  name: string;
  vendor: string;
  technologies: Tech[];
  kpis: string[];
  timeConfig: TimeConfig;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  results: ReportResultRow[];
}

interface CreateFormState {
  name: string;
  vendor: string;
  technologies: Tech[];
  timeMode: TimeMode;
  absoluteStart: string;
  absoluteEnd: string;
  relativePreset: RelativePreset;
  relativeValue: number;
  relativeUnit: RelativeUnit;
  manualInput: string;
  selectedKpis: string[];
}

const STORAGE_KEY = 'osmosis_ran_query_reports_v1';
const TECH_OPTIONS: Tech[] = ['2G', '3G', '4G', '5G'];
const STATUS_OPTIONS: ReportStatus[] = ['Draft', 'Ready', 'Running', 'Completed', 'Failed'];
const VENDOR_OPTIONS = ['Ericsson', 'Nokia', 'Huawei', 'Samsung', 'ZTE', 'Multi-Vendor'];
const KPI_LIBRARY = [
  'L.CELL.AVAIL.DUR',
  'L.TCH.SUCC.RATE',
  'ERAB_SETUP_SR',
  'RRC_SETUP_SR',
  'CSSR_PS',
  'DROP_CALL_RATE',
  'DL_USER_THRPUT',
  'UL_USER_THRPUT',
  'PRB_UTIL_DL',
  'PRB_UTIL_UL',
  'HANDOVER_SR',
  'VOLTE_CSSR',
  'VOLTE_DCR',
  'S1_SIG_SR',
  'NR_CELL_AVAIL',
  'X2_HO_SR',
  'RACH_SR',
  'CSFB_SR',
];
const DEFAULT_FORM = (): CreateFormState => {
  const now = new Date();
  const end = toLocalDateTimeInput(now);
  const start = toLocalDateTimeInput(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  return {
    name: '',
    vendor: 'Ericsson',
    technologies: ['4G'],
    timeMode: 'relative',
    absoluteStart: start,
    absoluteEnd: end,
    relativePreset: '24h',
    relativeValue: 24,
    relativeUnit: 'hours',
    manualInput: '',
    selectedKpis: [],
  };
};

function toLocalDateTimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromStoredReports(raw: string | null): RanReport[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as RanReport[];
    return parsed.map(report => ({
      ...report,
      status: report.status === 'Running' ? 'Ready' : report.status,
      results: Array.isArray(report.results) ? report.results : [],
      technologies: Array.isArray(report.technologies) ? report.technologies : [],
      kpis: Array.isArray(report.kpis) ? report.kpis : [],
    }));
  } catch {
    return [];
  }
}

function parseKpiList(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\n,;\t ]+/)
        .map(item => item.trim())
        .filter(Boolean)
    )
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function describeTimeConfig(config: TimeConfig): string {
  if (config.timeMode === 'absolute') {
    return `${formatDateTime(config.start)} → ${formatDateTime(config.end)}`;
  }
  const unitLabel = config.unit === 'minutes' ? 'min' : config.unit === 'hours' ? 'h' : 'd';
  return `Last ${config.value}${unitLabel} up to now`;
}

function statusClasses(status: ReportStatus): string {
  switch (status) {
    case 'Completed':
      return 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25';
    case 'Running':
      return 'bg-blue-500/12 text-blue-700 border-blue-500/25';
    case 'Failed':
      return 'bg-red-500/12 text-red-700 border-red-500/25';
    case 'Ready':
      return 'bg-amber-500/12 text-amber-700 border-amber-500/25';
    default:
      return 'bg-slate-500/12 text-slate-700 border-slate-500/25';
  }
}

function buildTimeConfig(form: CreateFormState): TimeConfig {
  if (form.timeMode === 'absolute') {
    return {
      timeMode: 'absolute',
      start: form.absoluteStart,
      end: form.absoluteEnd,
    };
  }
  return {
    timeMode: 'relative',
    value: form.relativeValue,
    unit: form.relativeUnit,
    end: 'now',
  };
}

function generateResults(report: RanReport): ReportResultRow[] {
  const technologies = report.technologies.length > 0 ? report.technologies : ['4G'];
  const timestamp = new Date().toISOString();
  return report.kpis.map((kpi, index) => {
    const tech = technologies[index % technologies.length];
    const base = 42 + (index % 7) * 6 + report.vendor.length;
    const variance = (index * 13) % 17;
    const value = Number((base + variance + technologies.length * 1.8).toFixed(2));
    const trend = Number((((index % 5) - 2) * 1.7).toFixed(2));
    return {
      kpi,
      vendor: report.vendor,
      technology: tech,
      timestamp,
      value,
      unit: kpi.includes('RATE') || kpi.includes('SR') ? '%' : kpi.includes('THR') ? 'Mbps' : 'count',
      trend,
    };
  });
}

function downloadCsv(report: RanReport) {
  const rows = report.results.length > 0 ? report.results : report.kpis.map((kpi, index) => ({
    kpi,
    vendor: report.vendor,
    technology: report.technologies[index % Math.max(report.technologies.length, 1)] || '4G',
    timestamp: report.lastRunAt || report.updatedAt,
    value: '',
    unit: '',
    trend: '',
  }));
  const header = ['KPI', 'Vendor', 'Technology', 'Timestamp', 'Value', 'Unit', 'Trend'];
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [
    header.join(','),
    ...rows.map(row => [row.kpi, row.vendor, row.technology, row.timestamp, row.value, row.unit, row.trend].map(escape).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.name.replace(/\s+/g, '_').toLowerCase()}_report.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const SectionCard: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="rounded-3xl border border-border/60 bg-card shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
    <div className="border-b border-border/50 px-6 py-5">
      <h3 className="text-sm font-black uppercase tracking-[0.14em] text-foreground">{title}</h3>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
    </div>
    <div className="p-6">{children}</div>
  </section>
);

const MetricPill: React.FC<{ label: string; onRemove?: () => void }> = ({ label, onRemove }) => (
  <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1.5 text-xs font-semibold text-primary">
    {label}
    {onRemove && (
      <button onClick={onRemove} className="rounded-full text-primary/70 hover:text-primary">
        <XCircle className="h-3.5 w-3.5" />
      </button>
    )}
  </span>
);

const RanQueryModule: React.FC = () => {
  const [reports, setReports] = useState<RanReport[]>(() => fromStoredReports(localStorage.getItem(STORAGE_KEY)));
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [techFilter, setTechFilter] = useState<'ALL' | Tech>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ReportStatus>('ALL');
  const [form, setForm] = useState<CreateFormState>(DEFAULT_FORM);
  const [isExecutingId, setIsExecutingId] = useState<string | null>(null);
  const [detailMode, setDetailMode] = useState<'table' | 'chart'>('table');
  const [showKpiLibrary, setShowKpiLibrary] = useState(false);

  // ── Catalogs (Investigator-themed selectors) ──
  const [kpiCatalog, setKpiCatalog] = useState<KpiCatalogEntry[]>([]);
  const [counterCatalog, setCounterCatalog] = useState<any[]>([]);
  const [kpiModalOpen, setKpiModalOpen] = useState(false);
  const [counterModalOpen, setCounterModalOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  }, [reports]);

  // Load KPI catalog (DB) + counter catalog (VPS) once
  useEffect(() => {
    fetchKpiCatalogFromDB().then(setKpiCatalog).catch(() => setKpiCatalog([]));
    fetch(getApiUrl('pm/counters/catalog?limit=25000'), { headers: getApiHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(d => setCounterCatalog(Array.isArray(d) ? d : []))
      .catch(() => setCounterCatalog([]));
  }, []);

  // Split current selection into KPI keys vs counter keys
  const kpiKeySet = useMemo(() => new Set(kpiCatalog.map(k => k.kpi_key)), [kpiCatalog]);
  const selectedKpiKeys = useMemo(() => form.selectedKpis.filter(k => kpiKeySet.has(k)), [form.selectedKpis, kpiKeySet]);
  const counterKeySet = useMemo(() => new Set(counterCatalog.map((c: any) => c.counter_name)), [counterCatalog]);
  const selectedCounterKeys = useMemo(() => form.selectedKpis.filter(k => counterKeySet.has(k)), [form.selectedKpis, counterKeySet]);

  const selectedReport = useMemo(
    () => reports.find(report => report.id === selectedReportId) || null,
    [reports, selectedReportId]
  );

  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      const matchesSearch = report.name.toLowerCase().includes(search.toLowerCase());
      const matchesVendor = vendorFilter === 'ALL' || report.vendor === vendorFilter;
      const matchesTech = techFilter === 'ALL' || report.technologies.includes(techFilter);
      const matchesStatus = statusFilter === 'ALL' || report.status === statusFilter;
      return matchesSearch && matchesVendor && matchesTech && matchesStatus;
    });
  }, [reports, search, statusFilter, techFilter, vendorFilter]);

  const chartData = useMemo(() => {
    if (!selectedReport) return [];
    return selectedReport.results.slice(0, 10).map(row => ({
      name: row.kpi,
      value: row.value,
      trend: row.trend,
    }));
  }, [selectedReport]);

  const updateForm = <K extends keyof CreateFormState>(key: K, value: CreateFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const addManualKpis = () => {
    const parsed = parseKpiList(form.manualInput);
    if (parsed.length === 0) return;
    updateForm('selectedKpis', Array.from(new Set([...form.selectedKpis, ...parsed])));
    updateForm('manualInput', '');
  };

  const handleFileUpload = async (file: File) => {
    const text = await file.text();
    const parsed = parseKpiList(text);
    if (parsed.length === 0) return;
    updateForm('selectedKpis', Array.from(new Set([...form.selectedKpis, ...parsed])));
  };

  const handleRelativePreset = (preset: RelativePreset) => {
    updateForm('relativePreset', preset);
    if (preset === '1h') {
      updateForm('relativeValue', 1);
      updateForm('relativeUnit', 'hours');
    } else if (preset === '24h') {
      updateForm('relativeValue', 24);
      updateForm('relativeUnit', 'hours');
    } else if (preset === '7d') {
      updateForm('relativeValue', 7);
      updateForm('relativeUnit', 'days');
    } else if (preset === '30d') {
      updateForm('relativeValue', 30);
      updateForm('relativeUnit', 'days');
    } else if (preset === '90d') {
      updateForm('relativeValue', 90);
      updateForm('relativeUnit', 'days');
    }
  };

  const resetForm = () => {
    setForm(DEFAULT_FORM());
    setShowKpiLibrary(false);
  };

  const createReport = () => {
    if (!form.name.trim() || form.selectedKpis.length === 0 || form.technologies.length === 0) return;
    const now = new Date().toISOString();

    // Edit mode: update the existing report in place
    if (editingReportId) {
      setReports(prev => prev.map(r => r.id === editingReportId ? {
        ...r,
        name: form.name.trim(),
        vendor: form.vendor,
        technologies: form.technologies,
        kpis: form.selectedKpis,
        timeConfig: buildTimeConfig(form),
        // Reset results because scope changed; keep status as Ready so user must re-execute
        status: 'Ready',
        results: [],
        updatedAt: now,
      } : r));
      setSelectedReportId(editingReportId);
      setEditingReportId(null);
      setView('detail');
      resetForm();
      return;
    }

    const report: RanReport = {
      id: `ran-report-${Date.now()}`,
      name: form.name.trim(),
      vendor: form.vendor,
      technologies: form.technologies,
      kpis: form.selectedKpis,
      timeConfig: buildTimeConfig(form),
      status: 'Ready',
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      results: [],
    };
    setReports(prev => [report, ...prev]);
    setSelectedReportId(report.id);
    setView('list');
    resetForm();
  };

  const editReport = (reportId: string) => {
    const r = reports.find(x => x.id === reportId);
    if (!r) return;
    const tc = r.timeConfig;
    setForm({
      name: r.name,
      vendor: r.vendor,
      technologies: r.technologies,
      timeMode: tc.timeMode,
      absoluteStart: tc.timeMode === 'absolute' ? tc.start : DEFAULT_FORM().absoluteStart,
      absoluteEnd: tc.timeMode === 'absolute' ? tc.end : DEFAULT_FORM().absoluteEnd,
      relativePreset: 'custom',
      relativeValue: tc.timeMode === 'relative' ? tc.value : 24,
      relativeUnit: tc.timeMode === 'relative' ? tc.unit : 'hours',
      manualInput: '',
      selectedKpis: r.kpis,
    });
    setEditingReportId(reportId);
    setView('create');
  };

  const executeReport = (reportId: string) => {
    setIsExecutingId(reportId);
    setReports(prev => prev.map(report => report.id === reportId ? { ...report, status: 'Running', updatedAt: new Date().toISOString() } : report));
    window.setTimeout(() => {
      setReports(prev => prev.map(report => {
        if (report.id !== reportId) return report;
        const results = generateResults(report);
        return {
          ...report,
          status: results.length > 0 ? 'Completed' : 'Failed',
          results,
          lastRunAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }));
      setIsExecutingId(current => current === reportId ? null : current);
    }, 1200);
  };

  const openReport = (reportId: string) => {
    setSelectedReportId(reportId);
    setDetailMode('table');
    setView('detail');
  };

  const duplicateReport = (reportId: string) => {
    const source = reports.find(report => report.id === reportId);
    if (!source) return;
    const now = new Date().toISOString();
    const duplicate: RanReport = {
      ...source,
      id: `ran-report-${Date.now()}`,
      name: `${source.name} Copy`,
      status: 'Draft',
      results: [],
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
    };
    setReports(prev => [duplicate, ...prev]);
  };

  const deleteReport = (reportId: string) => {
    setReports(prev => prev.filter(report => report.id !== reportId));
    if (selectedReportId === reportId) {
      setSelectedReportId(null);
      setView('list');
    }
  };

  const KPISelectionBlock = (
    <div className="space-y-4">
      {/* ── Two themed selectors: KPIs (Investigator) + Counters PM (Investigator) ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <button
          onClick={() => setKpiModalOpen(true)}
          className="group flex flex-col items-start gap-3 rounded-2xl border border-border/60 bg-background/70 p-5 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">KPI Catalog</p>
                <p className="text-[11px] text-muted-foreground">{kpiCatalog.length} KPIs available</p>
              </div>
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
              {selectedKpiKeys.length} selected
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Browse and select KPIs from the unified catalog (Investigator-style).</p>
        </button>

        <button
          onClick={() => setCounterModalOpen(true)}
          className="group flex flex-col items-start gap-3 rounded-2xl border border-border/60 bg-background/70 p-5 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/30 text-accent-foreground">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">PM Counters</p>
                <p className="text-[11px] text-muted-foreground">{counterCatalog.length} counters available</p>
              </div>
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
              {selectedCounterKeys.length} selected
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Browse PM counters by vendor / techno / family with full Investigator filters.</p>
        </button>
      </div>

      {/* ── Manual / file fallback (compact) ── */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Add manually</label>
          <div className="flex gap-2">
            <input
              value={form.manualInput}
              onChange={(event) => updateForm('manualInput', event.target.value)}
              placeholder="Paste KPI / counter names (comma, semicolon, line break)"
              className="h-10 flex-1 rounded-xl border border-border/60 bg-card px-3 text-sm outline-none transition-all focus:border-primary/50"
            />
            <button
              onClick={addManualKpis}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        </div>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 text-center transition-all hover:border-primary/50">
          <FileUp className="h-5 w-5 text-primary" />
          <span className="text-xs font-semibold text-foreground">Upload CSV / TXT</span>
          <input
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFileUpload(file);
              event.currentTarget.value = '';
            }}
          />
        </label>
      </div>

      {/* ── Selection summary ── */}
      <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Selected list</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {form.selectedKpis.length} item{form.selectedKpis.length === 1 ? '' : 's'}
              {' · '}
              <span className="text-primary">{selectedKpiKeys.length} KPI</span>
              {' · '}
              <span className="text-accent-foreground">{selectedCounterKeys.length} counter</span>
            </p>
          </div>
          {form.selectedKpis.length > 0 && (
            <button
              onClick={() => updateForm('selectedKpis', [])}
              className="text-xs font-semibold text-muted-foreground transition-all hover:text-destructive"
            >
              Clear list
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {form.selectedKpis.length > 0 ? form.selectedKpis.map(kpi => (
            <MetricPill key={kpi} label={kpi} onRemove={() => updateForm('selectedKpis', form.selectedKpis.filter(item => item !== kpi))} />
          )) : <p className="text-sm text-muted-foreground">No KPI or counter selected yet.</p>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_35%),linear-gradient(180deg,#f8fafc_0%,#f4f7fb_100%)]">
      <div className="border-b border-border/50 bg-background/80 px-6 py-5 backdrop-blur-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">OSMOSIS</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground">RAN Query Module</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Create, execute, view, and download telecom KPI / counter reports with vendor, technology, and time filters.
            </p>
          </div>
          {view === 'list' ? (
            <button
              onClick={() => {
                resetForm();
                setView('create');
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-primary-foreground shadow-[0_12px_30px_rgba(59,130,246,0.28)] transition-all hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Create Report
            </button>
          ) : (
            <button
              onClick={() => setView('list')}
              className="inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm font-bold text-foreground transition-all hover:border-primary/30 hover:text-primary"
            >
              <ChevronLeft className="h-4 w-4" /> Back to list
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        {view === 'list' && (
          <div className="space-y-6">
            <SectionCard title="Report Catalog" description="Simple execution flow: create, execute, view, download.">
              <div className="mb-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search report name"
                    className="h-12 w-full rounded-2xl border border-border/60 bg-background px-11 text-sm outline-none transition-all focus:border-primary/40"
                  />
                </div>
                <select value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)} className="h-12 rounded-2xl border border-border/60 bg-background px-4 text-sm outline-none focus:border-primary/40">
                  <option value="ALL">All vendors</option>
                  {VENDOR_OPTIONS.map(vendor => <option key={vendor} value={vendor}>{vendor}</option>)}
                </select>
                <select value={techFilter} onChange={(event) => setTechFilter(event.target.value as 'ALL' | Tech)} className="h-12 rounded-2xl border border-border/60 bg-background px-4 text-sm outline-none focus:border-primary/40">
                  <option value="ALL">All technologies</option>
                  {TECH_OPTIONS.map(tech => <option key={tech} value={tech}>{tech}</option>)}
                </select>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'ALL' | ReportStatus)} className="h-12 rounded-2xl border border-border/60 bg-background px-4 text-sm outline-none focus:border-primary/40">
                  <option value="ALL">All status</option>
                  {STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border/60">
                <div className="grid grid-cols-[2fr_0.9fr_1.1fr_1.5fr_0.7fr_0.8fr_1.1fr_2.6fr] gap-3 bg-muted/40 px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                  <span>Report Name</span>
                  <span>Vendor</span>
                  <span>Technology</span>
                  <span>Time Range</span>
                  <span>KPI Count</span>
                  <span>Status</span>
                  <span>Created Date</span>
                  <span>Actions</span>
                </div>
                <div className="divide-y divide-border/50 bg-card">
                  {filteredReports.length > 0 ? filteredReports.map(report => (
                    <div key={report.id} className="grid grid-cols-[2fr_0.9fr_1.1fr_1.5fr_0.7fr_0.8fr_1.1fr_2.6fr] items-center gap-3 px-4 py-4 text-sm text-foreground transition-all hover:bg-primary/5">
                      <div>
                        <p className="font-bold text-foreground">{report.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Updated {formatDateTime(report.updatedAt)}</p>
                      </div>
                      <span className={cn('inline-flex h-fit w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-medium', vendorBadge(report.vendor).bg, vendorBadge(report.vendor).text, vendorBadge(report.vendor).border)}>{report.vendor}</span>
                      <div className="flex flex-wrap gap-1">
                        {report.technologies.map(t => (
                          <span key={t} className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none', techBadge(t).bg, techBadge(t).text, techBadge(t).border)}>{t}</span>
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">{describeTimeConfig(report.timeConfig)}</span>
                      <span className="font-semibold">{report.kpis.length}</span>
                      <span className={cn('inline-flex h-fit w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-bold', statusClasses(report.status))}>{report.status}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(report.createdAt)}</span>
                      <div className="flex flex-nowrap items-center gap-1.5 justify-end">
                        <button
                          onClick={() => executeReport(report.id)}
                          disabled={isExecutingId === report.id}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/8 px-3 py-1.5 text-xs font-bold text-primary transition-all hover:bg-primary/14 disabled:opacity-50"
                        >
                          <Play className="h-3.5 w-3.5" /> {report.status === 'Completed' ? 'Reload' : 'Execute'}
                        </button>
                        <button onClick={() => openReport(report.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-1.5 text-xs font-bold text-foreground transition-all hover:border-primary/30 hover:text-primary">
                          <FolderOpen className="h-3.5 w-3.5" /> Open
                        </button>
                        <button onClick={() => downloadCsv(report)} className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-1.5 text-xs font-bold text-foreground transition-all hover:border-primary/30 hover:text-primary">
                          <Download className="h-3.5 w-3.5" /> Download
                        </button>
                        <button onClick={() => editReport(report.id)} className="rounded-xl border border-border/60 p-2 text-muted-foreground transition-all hover:border-primary/30 hover:text-primary" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => duplicateReport(report.id)} className="rounded-xl border border-border/60 p-2 text-muted-foreground transition-all hover:border-primary/30 hover:text-primary" title="Duplicate">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteReport(report.id)} className="rounded-xl border border-border/60 p-2 text-muted-foreground transition-all hover:border-destructive/30 hover:text-destructive" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )) : (
                    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                      <BarChart3 className="h-10 w-10 text-primary/40" />
                      <div>
                        <p className="text-base font-bold text-foreground">No report found</p>
                        <p className="mt-1 text-sm text-muted-foreground">Create your first RAN query report to start executing KPI and counter extracts.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          </div>
        )}

        {view === 'create' && (
          <div className="mx-auto max-w-6xl space-y-6">
            <SectionCard title="General Info" description="Create a clean report definition before execution.">
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Report Name</label>
                  <input
                    value={form.name}
                    onChange={(event) => updateForm('name', event.target.value)}
                    placeholder="Daily LTE accessibility review"
                    className="h-12 w-full rounded-2xl border border-border/60 bg-background px-4 text-sm outline-none transition-all focus:border-primary/40"
                  />
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Report preview</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{form.name.trim() || 'Untitled report'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{form.vendor} · {form.technologies.join(' / ') || 'No technology selected'}</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="KPI / Counter Selection" description="Select KPIs manually or upload a KPI / counter list.">
              {KPISelectionBlock}
            </SectionCard>

            <div className="grid gap-6 xl:grid-cols-2">
              <SectionCard title="Scope Selection" description="Apply telecom scope filters for the report query.">
                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Vendor</label>
                    <select value={form.vendor} onChange={(event) => updateForm('vendor', event.target.value)} className="h-12 w-full rounded-2xl border border-border/60 bg-background px-4 text-sm outline-none focus:border-primary/40">
                      {VENDOR_OPTIONS.map(vendor => <option key={vendor} value={vendor}>{vendor}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Technology</label>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      {TECH_OPTIONS.map(tech => {
                        const active = form.technologies.includes(tech);
                        const tb = techBadge(tech);
                        return (
                          <button
                            key={tech}
                            onClick={() => updateForm('technologies', active ? form.technologies.filter(item => item !== tech) : [...form.technologies, tech])}
                            className={cn(
                              'rounded-2xl border px-4 py-3 text-sm font-medium transition-all',
                              active ? cn(tb.bg, tb.text, tb.border) : 'border-border/60 bg-background text-foreground hover:border-primary/25'
                            )}
                          >
                            {tech}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Time Selection" description="Switch between absolute and relative time. Relative mode ends at now by default.">
                <div className="space-y-5">
                  <div className="inline-flex rounded-2xl border border-border/60 bg-muted/20 p-1">
                    {(['absolute', 'relative'] as TimeMode[]).map(mode => (
                      <button
                        key={mode}
                        onClick={() => updateForm('timeMode', mode)}
                        className={cn(
                          'rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition-all',
                          form.timeMode === mode ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>

                  {form.timeMode === 'absolute' ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Start date & time</label>
                        <input type="datetime-local" value={form.absoluteStart} onChange={(event) => updateForm('absoluteStart', event.target.value)} className="h-12 w-full rounded-2xl border border-border/60 bg-background px-4 text-sm outline-none focus:border-primary/40" />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">End date & time</label>
                        <input type="datetime-local" value={form.absoluteEnd} onChange={(event) => updateForm('absoluteEnd', event.target.value)} className="h-12 w-full rounded-2xl border border-border/60 bg-background px-4 text-sm outline-none focus:border-primary/40" />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                        {(['1h', '24h', '7d', '30d', '90d'] as RelativePreset[]).map(preset => (
                          <button
                            key={preset}
                            onClick={() => handleRelativePreset(preset)}
                            className={cn(
                              'rounded-2xl border px-4 py-3 text-sm font-bold transition-all',
                              form.relativePreset === preset ? 'border-primary/40 bg-primary/8 text-primary' : 'border-border/60 bg-background text-foreground hover:border-primary/25'
                            )}
                          >
                            {preset === '1h' ? 'Last 1h' : preset === '24h' ? 'Last 24h' : preset === '7d' ? 'Last 7d' : preset === '30d' ? 'Last 30d' : 'Last 90d'}
                          </button>
                        ))}
                      </div>
                      <div className="grid gap-4 md:grid-cols-[0.9fr_0.9fr_1.2fr]">
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Custom value</label>
                          <input type="number" min={1} value={form.relativeValue} onChange={(event) => { handleRelativePreset('custom'); updateForm('relativeValue', Number(event.target.value) || 1); }} className="h-12 w-full rounded-2xl border border-border/60 bg-background px-4 text-sm outline-none focus:border-primary/40" />
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Unit</label>
                          <select value={form.relativeUnit} onChange={(event) => { handleRelativePreset('custom'); updateForm('relativeUnit', event.target.value as RelativeUnit); }} className="h-12 w-full rounded-2xl border border-border/60 bg-background px-4 text-sm outline-none focus:border-primary/40">
                            <option value="minutes">Minutes</option>
                            <option value="hours">Hours</option>
                            <option value="days">Days</option>
                          </select>
                        </div>
                        <div className="rounded-2xl border border-primary/20 bg-primary/6 px-4 py-3">
                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Up to now</p>
                          <p className="mt-2 text-sm font-semibold text-foreground">End time = current system time</p>
                          <p className="mt-1 text-xs text-muted-foreground">Start time is computed backward from the selected duration.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </SectionCard>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button onClick={() => { resetForm(); setEditingReportId(null); setView(editingReportId ? 'detail' : 'list'); }} className="rounded-2xl border border-border/60 bg-card px-5 py-3 text-sm font-bold text-foreground transition-all hover:border-primary/30 hover:text-primary">
                Cancel
              </button>
              <button
                onClick={createReport}
                disabled={!form.name.trim() || form.selectedKpis.length === 0 || form.technologies.length === 0}
                className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-primary-foreground shadow-[0_12px_30px_rgba(59,130,246,0.28)] transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" /> {editingReportId ? 'Save changes' : 'Create Report'}
              </button>
            </div>
          </div>
        )}

        {view === 'detail' && selectedReport && (
          <div className="space-y-6">
            <SectionCard title="Report Summary" description="Review report scope, execute the query, and inspect the output.">
              <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr_1fr_1fr_0.9fr]">
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Name</p>
                  <p className="mt-2 text-lg font-black text-foreground">{selectedReport.name}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Vendor</p>
                  <span className={cn('mt-2 inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium', vendorBadge(selectedReport.vendor).bg, vendorBadge(selectedReport.vendor).text, vendorBadge(selectedReport.vendor).border)}>{selectedReport.vendor}</span>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Technology</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedReport.technologies.map(t => (
                      <span key={t} className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium', techBadge(t).bg, techBadge(t).text, techBadge(t).border)}>{t}</span>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Time range</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{describeTimeConfig(selectedReport.timeConfig)}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">KPI count</p>
                  <p className="mt-2 text-lg font-black text-foreground">{selectedReport.kpis.length}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className={cn('inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em]', statusClasses(selectedReport.status))}>{selectedReport.status}</span>
                <button onClick={() => executeReport(selectedReport.id)} disabled={isExecutingId === selectedReport.id} className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50">
                  <Play className="h-3.5 w-3.5" /> {selectedReport.status === 'Completed' ? 'Reload' : 'Execute'}
                </button>
                <button onClick={() => downloadCsv(selectedReport)} className="inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-4 py-2.5 text-xs font-bold text-foreground transition-all hover:border-primary/30 hover:text-primary">
                  <Download className="h-3.5 w-3.5" /> Download report
                </button>
                <button onClick={() => editReport(selectedReport.id)} className="inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-4 py-2.5 text-xs font-bold text-foreground transition-all hover:border-primary/30 hover:text-primary">
                  <Pencil className="h-3.5 w-3.5" /> Edit report
                </button>
                <div className="ml-auto inline-flex rounded-2xl border border-border/60 bg-muted/20 p-1">
                  <button onClick={() => setDetailMode('table')} className={cn('rounded-xl px-3 py-2 text-xs font-black uppercase tracking-[0.14em] transition-all', detailMode === 'table' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
                    Table view
                  </button>
                  <button onClick={() => setDetailMode('chart')} className={cn('rounded-xl px-3 py-2 text-xs font-black uppercase tracking-[0.14em] transition-all', detailMode === 'chart' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
                    Charts
                  </button>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Report Results" description="Each report keeps its own independent dataset.">
              {selectedReport.results.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <CalendarClock className="h-10 w-10 text-primary/40" />
                  <div>
                    <p className="text-base font-bold text-foreground">No result loaded yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">Execute the report to generate KPI / counter output for this report only.</p>
                  </div>
                </div>
              ) : detailMode === 'table' ? (
                <div className="overflow-hidden rounded-2xl border border-border/60">
                  <div className="grid grid-cols-[1.8fr_0.9fr_0.9fr_1.2fr_0.8fr_0.8fr_0.7fr] gap-3 bg-muted/40 px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                    <span>KPI</span>
                    <span>Vendor</span>
                    <span>Technology</span>
                    <span>Timestamp</span>
                    <span>Value</span>
                    <span>Unit</span>
                    <span>Trend</span>
                  </div>
                  <div className="divide-y divide-border/50 bg-card">
                    {selectedReport.results.map(result => (
                      <div key={`${result.kpi}-${result.technology}`} className="grid grid-cols-[1.8fr_0.9fr_0.9fr_1.2fr_0.8fr_0.8fr_0.7fr] gap-3 px-4 py-4 text-sm text-foreground">
                        <span className="font-bold">{result.kpi}</span>
                        <span><span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium', vendorBadge(result.vendor).bg, vendorBadge(result.vendor).text, vendorBadge(result.vendor).border)}>{result.vendor}</span></span>
                        <span><span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium', techBadge(result.technology).bg, techBadge(result.technology).text, techBadge(result.technology).border)}>{result.technology}</span></span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(result.timestamp)}</span>
                        <span className="font-semibold">{result.value.toFixed(2)}</span>
                        <span>{result.unit}</span>
                        <span className={cn('font-semibold', result.trend >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                          {result.trend >= 0 ? '+' : ''}{result.trend.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid gap-6 xl:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                    <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Value distribution</p>
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                          <XAxis dataKey="name" angle={-18} textAnchor="end" interval={0} height={70} tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="value" fill="#2563eb" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                    <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Trend by KPI</p>
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                          <XAxis dataKey="name" angle={-18} textAnchor="end" interval={0} height={70} tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Line type="monotone" dataKey="trend" stroke="#0f766e" strokeWidth={3} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>
          </div>
        )}
      </div>

      {/* ── Investigator-themed selectors ── */}
      <KpiSelectorModal
        open={kpiModalOpen}
        onClose={() => setKpiModalOpen(false)}
        catalog={kpiCatalog}
        selectedKeys={selectedKpiKeys}
        onConfirm={(keys) => {
          // Replace KPI portion, keep counters
          const next = Array.from(new Set([...selectedCounterKeys, ...keys]));
          updateForm('selectedKpis', next);
          setKpiModalOpen(false);
        }}
      />

      <CounterSelectorModal
        open={counterModalOpen}
        onClose={() => setCounterModalOpen(false)}
        catalog={counterCatalog}
        selectedKeys={selectedCounterKeys}
        onConfirm={(keys) => {
          // Replace counter portion, keep KPIs
          const next = Array.from(new Set([...selectedKpiKeys, ...keys]));
          updateForm('selectedKpis', next);
          setCounterModalOpen(false);
        }}
        perimeterVendor={form.vendor}
        perimeterTechno={form.technologies.length === 1 ? form.technologies[0] : undefined}
      />
    </div>
  );
};

export default RanQueryModule;
