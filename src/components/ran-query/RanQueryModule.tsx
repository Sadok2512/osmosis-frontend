import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileUp,
  Filter,
  FolderOpen,
  Loader2,
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
import { vendorBadge, techBadge, VENDOR_HSL, TECH_HSL } from '@/constants/brandColors';
import KpiSelectorModal from '@/components/kpi-monitor/KpiSelectorModal';
import CounterSelectorModal from '@/components/investigator/CounterSelectorModal';
import { fetchKpiCatalogFromDB } from '@/components/kpi-monitor/kpiCatalog';
import type { KpiCatalogEntry } from '@/components/kpi-monitor/types';
import { getApiUrl, getApiHeaders, fetchVpsWithRetry, logBackendRequest } from '@/lib/apiConfig';
import ClusterPicker, { type ClusterSelection } from '@/components/shared/ClusterPicker';
import { topoApi } from '@/lib/localDb';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// 'Empty' added 2026-05-07 to distinguish "the query ran successfully but
// returned 0 rows because there's no PM data in the requested window" from
// "the query actually failed (HTTP 500 / timeout / etc.)". Before this,
// both cases collapsed onto 'Failed' (red) which mis-led the operator into
// thinking the system was broken when it was just a data-gap problem.
type ReportStatus = 'Draft' | 'Ready' | 'Running' | 'Completed' | 'Empty' | 'Failed';
type ReportHealth = 'ok' | 'warning' | 'error';
type TimeMode = 'absolute' | 'relative';
type Tech = '2G' | '3G' | '4G' | '5G';
type RelativeUnit = 'minutes' | 'hours' | 'days';

type RelativePreset = '1h' | '24h' | '7d' | '30d' | '90d' | 'custom';
type Granularity = '15min' | '1h' | '1d' | '1w';

interface AbsoluteTimeConfig {
  timeMode: 'absolute';
  start: string;
  end: string;
  granularity: Granularity;
}

interface RelativeTimeConfig {
  timeMode: 'relative';
  value: number;
  unit: RelativeUnit;
  end: 'now';
  granularity: Granularity;
}

type TimeConfig = AbsoluteTimeConfig | RelativeTimeConfig;

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: '15min', label: '15 min' },
  { value: '1h', label: '1 hour' },
  { value: '1d', label: '1 day' },
  { value: '1w', label: '1 week' },
];

interface ReportResultRow {
  kpi: string;
  vendor: string;
  technology: string;
  timestamp: string;
  value: number | null;
  unit: string;
  site_name?: string;
  cell_name?: string;
  cluster?: string;
  plaque?: string;
  dor?: string;
  band?: string;
}

type AggregationLevel = string;

export interface RanReport {
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
  errorMessage?: string;
  health?: ReportHealth;
  // Backend dense-fill signal — set when the cap blocked the timeline
  // gap-fill (string of the form "too_many_series:NxM").
  denseFillNotice?: string;
  // ── Extended filter & aggregation context ──
  clusters?: string[];
  dors?: string[];
  sites?: string[];
  zoneArcep?: string[];
  aggregation?: AggregationLevel; // legacy single
  aggregations?: string[];
  dimensions?: string[];
  cluster_id?: number;
  cluster_name?: string;
}

interface CreateFormState {
  name: string;
  vendors: string[];
  technologies: Tech[];
  timeMode: TimeMode;
  absoluteStart: string;
  absoluteEnd: string;
  relativePreset: RelativePreset;
  relativeValue: number;
  relativeUnit: RelativeUnit;
  manualInput: string;
  selectedKpis: string[];
  // ── New ──
  clusters: string[];
  dors: string[];
  sites: string[];
  zoneArcep: string[];
  aggregations: string[];
  dimensions: string[];
  granularity: Granularity;
}

const STORAGE_KEY = 'osmosis_ran_query_reports_v1';
const TECH_OPTIONS: Tech[] = ['2G', '3G', '4G', '5G'];
const STATUS_OPTIONS: ReportStatus[] = ['Draft', 'Ready', 'Running', 'Completed', 'Empty', 'Failed'];
const VENDOR_OPTIONS = ['Ericsson', 'Nokia', 'Huawei', 'Samsung', 'Alcatel'];
// Catalog dimension_keys come back in mixed forms (PLAQUE_SITE / NOM_SITE /
// BANDE / CONSTRUCTEUR / etc.). The Reports module's chip-equality checks
// were built against the canonical FE values (cell / site / plaque / band /
// vendor / dor / cluster / arcep). Normalize at load time so the rest of
// the code keeps working without an `=== 'plaque' || === 'plaque_site'`
// litany at every callsite. Returns '' for unknown dims so the chip is
// dropped from the dropdown.
const _CATALOG_AGG_ALIASES: Record<string, string> = {
  PLAQUE_SITE:  'plaque',
  NOM_SITE:     'site',
  NOM_CELLULE:  'cell',
  CELLNAME:     'cell',
  SITENAME:     'site',
  CONSTRUCTEUR: 'vendor',
  BANDE:        'band',
  CLUSTER_B:    'cluster',
  ZONE_ARCEP:   'arcep',
  TECHNO:       'techno',
};
function canonicalAggKey(raw: string | undefined | null): string {
  if (!raw) return '';
  const up = String(raw).toUpperCase();
  if (_CATALOG_AGG_ALIASES[up]) return _CATALOG_AGG_ALIASES[up];
  // Pass-through for already-canonical values (CELL, SITE, PLAQUE, …)
  const lower = up.toLowerCase();
  if (['cell', 'site', 'plaque', 'cluster', 'dor', 'dr', 'region', 'arcep', 'band', 'vendor', 'techno'].includes(lower)) {
    return lower;
  }
  return '';
}

function normalizeAggregationList(values?: string[] | null, legacy?: string | null): string[] {
  const source = values && values.length > 0 ? values : legacy ? [legacy] : ['site'];
  const normalized = Array.from(new Set(source.map(v => canonicalAggKey(v) || String(v || '').trim()).filter(Boolean)));
  const withoutCell = normalized.filter(v => v !== 'cell');
  return withoutCell.length > 0 ? withoutCell : (normalized.includes('cell') ? ['cell'] : ['site']);
}

const FALLBACK_AGGREGATION_OPTIONS: { value: string; label: string }[] = [
  { value: 'cell', label: 'Cell' },
  { value: 'site', label: 'Site' },
  { value: 'band', label: 'Band' },
  { value: 'cluster', label: 'Cluster' },
  { value: 'dor', label: 'DOR' },
  { value: 'dr', label: 'DR' },
  { value: 'region', label: 'Region (UPR)' },
  { value: 'arcep', label: 'Zone ARCEP' },
];
const DEFAULT_DIMENSIONS = ['Neighbors', 'PMQAP', 'Transport'];
const REPORT_WARN_KPI_COUNT = 20;
const REPORT_HARD_KPI_COUNT = 50;
const REPORT_KPI_BATCH_TIMEOUT_MS = 180_000;
const REPORT_COUNTER_BATCH_TIMEOUT_MS = 120_000;
const REPORT_BACKEND_CONCURRENCY_LIMIT = 4;

function selectableKeyVariants(value: unknown): string[] {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  return raw === lower ? [raw] : [raw, lower];
}

function mergeSharedKpiCodes(catalog: KpiCatalogEntry[], sharedCodes: string[]): KpiCatalogEntry[] {
  const bySelectableKey = new Set<string>();
  for (const kpi of catalog) {
    selectableKeyVariants(kpi.kpi_key).forEach(key => bySelectableKey.add(key));
    selectableKeyVariants(kpi.kpi_code_normalized).forEach(key => bySelectableKey.add(key));
  }
  const additions = sharedCodes
    .map(code => String(code || '').trim())
    .filter(Boolean)
    .filter(code => selectableKeyVariants(code).every(key => !bySelectableKey.has(key)))
    .map((code): KpiCatalogEntry => ({
      kpi_id: code,
      kpi_key: code.toLowerCase(),
      display_name: code.toLowerCase(),
      description: 'Admin-curated normalized KPI',
      techno_scope: code.toLowerCase().includes('5g') ? '5G' : code.toLowerCase().includes('4g') || code.toLowerCase().includes('lte') ? '4G' : 'both',
      unit: code.toLowerCase().includes('rate') || code.toLowerCase().includes('ratio') || code.toLowerCase().includes('cssr') || code.toLowerCase().includes('dcr') ? '%' : '',
      value_type: 'gauge',
      default_agg: 'avg',
      allowed_aggs: ['avg', 'min', 'max', 'sum'],
      is_map_supported: false,
      category: 'Normalized',
      color: '#0f766e',
      is_normalized: true,
      kpi_code_normalized: code.toLowerCase(),
    }));
  return [...catalog, ...additions];
}

const DEFAULT_FORM = (): CreateFormState => {
  const now = new Date();
  const end = toLocalDateTimeInput(now);
  const start = toLocalDateTimeInput(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  return {
    name: '',
    vendors: ['Ericsson'],
    technologies: ['4G'],
    timeMode: 'relative',
    absoluteStart: start,
    absoluteEnd: end,
    relativePreset: '24h',
    relativeValue: 24,
    relativeUnit: 'hours',
    manualInput: '',
    selectedKpis: [],
    clusters: [],
    dors: [],
    sites: [],
    zoneArcep: [],
    // Default to site-level aggregation (was 'cell'). Cell-level produces
    // ~24× more rows on a typical site (sectors × technos × bands) and is
    // rarely what an operator wants on first execution — they almost always
    // start at site level, then drill down. Switched 2026-05-07 per user
    // request: "why agg is by default is cell".
    aggregations: ['site'],
    dimensions: [],
    granularity: '1h',
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
      health: report.health || (report.errorMessage && Array.isArray(report.results) && report.results.length > 0 ? 'warning' : undefined),
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

function formatDateTime(value: string | null, granularity?: Granularity | string): string {
  if (!value) return '—';
  const normalized = value.trim();
  if (!normalized) return '—';
  if ((granularity === '1d' || granularity === '1w') && /^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split('-');
    return `${day}/${month}/${year}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (granularity === '1d' || granularity === '1w') {
    return new Intl.DateTimeFormat('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
  return new Intl.DateTimeFormat('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function describeTimeConfig(config: TimeConfig): string {
  const granLabel = GRANULARITY_OPTIONS.find(g => g.value === config.granularity)?.label ?? config.granularity;
  if (config.timeMode === 'absolute') {
    return `${formatDateTime(config.start)} → ${formatDateTime(config.end)} · ${granLabel}`;
  }
  const unitLabel = config.unit === 'minutes' ? 'min' : config.unit === 'hours' ? 'h' : 'd';
  return `Last ${config.value}${unitLabel} up to now · ${granLabel}`;
}

function statusClasses(status: ReportStatus): string {
  switch (status) {
    case 'Completed':
      return 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25';
    case 'Running':
      return 'bg-blue-500/12 text-blue-700 border-blue-500/25';
    case 'Failed':
      return 'bg-red-500/12 text-red-700 border-red-500/25';
    case 'Empty':
      // Yellow/amber, NOT red — the query ran fine, the data gap is just
      // a data-availability issue (e.g. PM ingestion lag).
      return 'bg-amber-500/12 text-amber-700 border-amber-500/25';
    case 'Ready':
      return 'bg-amber-500/12 text-amber-700 border-amber-500/25';
    default:
      return 'bg-slate-500/12 text-slate-700 border-slate-500/25';
  }
}

function healthClasses(health?: ReportHealth): string {
  switch (health) {
    case 'warning':
      return 'bg-amber-500/12 text-amber-700 border-amber-500/25';
    case 'error':
      return 'bg-red-500/12 text-red-700 border-red-500/25';
    default:
      return 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25';
  }
}

function buildTimeConfig(form: CreateFormState): TimeConfig {
  if (form.timeMode === 'absolute') {
    return {
      timeMode: 'absolute',
      start: form.absoluteStart,
      end: form.absoluteEnd,
      granularity: form.granularity,
    };
  }
  return {
    timeMode: 'relative',
    value: form.relativeValue,
    unit: form.relativeUnit,
    end: 'now',
    granularity: form.granularity,
  };
}

/** Resolve absolute date_from / date_to from a TimeConfig. */
function resolveTimeRange(config: TimeConfig): { date_from: string; date_to: string } {
  if (config.timeMode === 'absolute') {
    const startD = new Date(config.start);
    const endD = new Date(config.end);
    return {
      date_from: startD.toISOString().slice(0, 19),
      date_to: endD.toISOString().slice(0, 19),
    };
  }
  const now = new Date();
  const msMap: Record<RelativeUnit, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };
  const startD = new Date(now.getTime() - config.value * msMap[config.unit]);
  return {
    date_from: startD.toISOString().slice(0, 19),
    date_to: now.toISOString().slice(0, 19),
  };
}

/** Build the common filter payload from report scope. */
function buildFilterPayload(report: RanReport) {
  const { date_from, date_to } = resolveTimeRange(report.timeConfig);
  const granularity = report.timeConfig.granularity;
  // Split multi-vendor string into array for per-vendor requests
  const vendors = report.vendor.split(',').map(v => v.trim()).filter(Boolean);
  const base: Record<string, unknown> = {
    date_from,
    date_to,
    granularity,
  };
  // Topology filters — only include if user selected values
  if (report.clusters && report.clusters.length > 0) base.cluster = report.clusters;
  if (report.dors && report.dors.length > 0) base.dor = report.dors;
  if (report.sites && report.sites.length > 0) base.site_name = report.sites;
  if (report.zoneArcep && report.zoneArcep.length > 0) base.zone_arcep = report.zoneArcep;
  if (report.technologies && report.technologies.length > 0) base.technology = report.technologies;
  // Multi-aggregation: use first non-cell aggregation as split_by
  const aggList = normalizeAggregationList(report.aggregations, report.aggregation);
  const primaryAgg = aggList.find(a => a !== 'cell') || null;
  if (primaryAgg) {
    const aggMap: Record<string, string> = { site: 'site_name', band: 'band', cluster: 'cluster', dor: 'dor', dr: 'dor', region: 'region', arcep: 'zone_arcep' };
    base.split_by_field = aggMap[primaryAgg] || primaryAgg;
  }
  if (report.dimensions && report.dimensions.length > 0) base.dimensions = report.dimensions;
  if (report.cluster_id) base.cluster_id = report.cluster_id;
  return { vendors, base };
}

/** KPI columns to render in the pivot/CSV.
 *
 * Starts with the user's selected KPIs (`report.kpis`) so KPIs without data
 * still appear as empty columns. Any extra KPIs that *did* return data but
 * weren't in the original selection are appended at the end. */
export function resolvePivotKpiColumns(
  report: { kpis?: string[]; results: { kpi: string }[] },
): string[] {
  const requested = Array.isArray(report.kpis) ? report.kpis : [];
  const seen = new Set<string>(requested);
  const out = [...requested];
  for (const r of report.results) {
    if (!seen.has(r.kpi)) { seen.add(r.kpi); out.push(r.kpi); }
  }
  return out;
}

export function buildMonitorQueryPayload(report: RanReport, vendor: string, kpiKeys: string[]) {
  const { date_from, date_to } = resolveTimeRange(report.timeConfig);
  const aggList = normalizeAggregationList(report.aggregations, report.aggregation);
  const splitMap: Record<string, string> = {
    cell: 'CELL',
    site: 'SITE',
    band: 'BAND',
    cluster: 'CLUSTER',
    cluster_b: 'CLUSTER',
    dor: 'DOR',
    dr: 'DOR',
    region: 'DOR',
    arcep: 'ZONE_ARCEP',
    zone_arcep: 'ZONE_ARCEP',
    plaque: 'PLAQUE',
    // The aggregation chip stores the underlying ref_cell_daily column
    // name `plaque_site` — alias to the engine-level PLAQUE dim so the
    // multi-aggregation actually splits by plaque.
    plaque_site: 'PLAQUE',
  };
  // Map every aggregation chip to its backend dim, preserving user order.
  const splitByList = aggList
    .map(a => splitMap[a] || a.toUpperCase())
    .filter((v, i, arr) => arr.indexOf(v) === i);
  // Back-compat: split_by stays as the first non-CELL dim (CELL alone = legacy no-split).
  const primaryAgg = aggList.find(a => a !== 'cell') || null;
  const filters: Array<{ dimension: string; op: 'IN'; values: string[] }> = [
    { dimension: 'VENDOR', op: 'IN', values: [vendor] },
  ];
  if (report.technologies.length > 0) {
    filters.push({ dimension: 'TECHNOLOGY', op: 'IN', values: report.technologies });
  }
  if (report.clusters?.length) filters.push({ dimension: 'CLUSTER', op: 'IN', values: report.clusters });
  if (report.dors?.length) filters.push({ dimension: 'DOR', op: 'IN', values: report.dors });
  if (report.sites?.length) filters.push({ dimension: 'SITE', op: 'IN', values: report.sites });
  if (report.zoneArcep?.length) filters.push({ dimension: 'ZONE_ARCEP', op: 'IN', values: report.zoneArcep });

  return {
    date_from,
    date_to,
    granularity: report.timeConfig.granularity,
    kpi_keys: kpiKeys,
    selections: kpiKeys.map((kpi) => ({ kpi_key: kpi })),
    filters,
    split_by: primaryAgg ? (splitMap[primaryAgg] || primaryAgg.toUpperCase()) : null,
    split_by_list: splitByList,
    split_by_2: null,
    kpi_level: aggList.includes('cell') ? 'CELL' : 'SITE',
    page: 1,
    page_size: 500,
  };
}

function parseMetricValue(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && value !== null) {
    const metric = value as Record<string, unknown>;
    return parseMetricValue(metric.avg ?? metric.value ?? metric.val);
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getReportDimensionValue(row: Record<string, any>, aggregation: string | null, fallback?: unknown): string | undefined {
  const value =
    (aggregation === 'plaque' ? row.plaque : undefined) ||
    (aggregation === 'cluster' ? row.cluster : undefined) ||
    (aggregation === 'dor' || aggregation === 'dr' || aggregation === 'region' ? (row.dor || row.DOR || row.region) : undefined) ||
    (aggregation === 'site' ? (row.site_name || row.site) : undefined) ||
    (aggregation === 'band' ? (row.band || row.source_band) : undefined) ||
    (aggregation === 'arcep' ? (row.zone_arcep || row.ZONE_ARCEP) : undefined) ||
    fallback;
  return value == null ? undefined : String(value);
}

const MAX_CONCURRENT = REPORT_BACKEND_CONCURRENCY_LIMIT;

interface ReportSelectionValidation {
  kpiKeys: string[];
  counterKeys: string[];
  unknownKeys: string[];
  warnings: string[];
  errors: string[];
  isValid: boolean;
}

function validateReportSelection(
  selectedKeys: string[],
  kpiKeySet: Set<string>,
  counterKeySet: Set<string>,
  options?: {
    vendors?: string[];
    aggregations?: string[];
    sites?: string[];
  },
): ReportSelectionValidation {
  const uniqueKeys = Array.from(new Set((selectedKeys || []).map(key => String(key || '').trim()).filter(Boolean)));
  const isKnownKpi = (key: string) => kpiKeySet.has(key) || kpiKeySet.has(key.toLowerCase());
  const kpiKeys = uniqueKeys.filter(isKnownKpi);
  const counterKeys = uniqueKeys.filter(key => counterKeySet.has(key));
  const unknownKeys = uniqueKeys.filter(key => !isKnownKpi(key) && !counterKeySet.has(key));
  const warnings: string[] = [];
  const errors: string[] = [];

  if (uniqueKeys.length === 0) errors.push('Select at least one normalized KPI or PM counter.');
  if (unknownKeys.length > 0) {
    errors.push(`Unknown KPI / counter key(s): ${unknownKeys.slice(0, 8).join(', ')}${unknownKeys.length > 8 ? ` +${unknownKeys.length - 8} more` : ''}. Unknown normalized KPIs are not routed as raw counters.`);
  }
  if (uniqueKeys.length >= REPORT_HARD_KPI_COUNT) {
    errors.push(`Report has ${uniqueKeys.length} selected metrics. Hard limit is ${REPORT_HARD_KPI_COUNT}. Reduce the selection before creating or executing.`);
  } else if (uniqueKeys.length >= REPORT_WARN_KPI_COUNT) {
    warnings.push(`Large report: ${uniqueKeys.length} selected metrics. Expect slower execution; consider splitting the report.`);
  }

  const vendors = options?.vendors || [];
  const aggregations = (options?.aggregations || []).map(a => canonicalAggKey(a) || a);
  const hasSiteAggregation = aggregations.includes('site') || aggregations.includes('cell');
  if (vendors.length > 1 && hasSiteAggregation && uniqueKeys.length >= REPORT_WARN_KPI_COUNT) {
    warnings.push('Heavy scope: multi-vendor + site/cell aggregation + large metric set. Backend will batch per vendor; narrow scope if possible.');
  }
  if ((options?.sites?.length || 0) > 50 && uniqueKeys.length >= REPORT_WARN_KPI_COUNT) {
    warnings.push(`Heavy site filter: ${options?.sites?.length || 0} sites with ${uniqueKeys.length} metrics.`);
  }
  if (kpiKeys.length > 0 && counterKeys.length > 0) {
    warnings.push(`Mixed execution: ${kpiKeys.length} normalized KPI(s) use KPI pipeline; ${counterKeys.length} raw counter(s) use PM counter pipeline.`);
  }

  return {
    kpiKeys,
    counterKeys,
    unknownKeys,
    warnings,
    errors,
    isValid: errors.length === 0,
  };
}

/** Run promises with concurrency limit. */
async function pLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  let idx = 0;
  async function next(): Promise<void> {
    const i = idx++;
    if (i >= tasks.length) return;
    results[i] = await tasks[i]();
    await next();
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => next()));
  return results;
}

/** Execute report against real backend APIs. */
async function executeReportApi(
  report: RanReport,
  kpiKeySet: Set<string>,
  counterKeySet: Set<string>,
): Promise<{ rows: ReportResultRow[]; errors: string[]; denseFillNotice?: string }> {
  const { vendors, base } = buildFilterPayload(report);
  const errors: string[] = [];
  const results: ReportResultRow[] = [];
  // First non-null meta.dense_fill encountered — backend signals
  // "too_many_series:NxM" when the cap blocked the gap-fill so the FE
  // can warn the user that the timeline is sparse.
  let denseFillNotice: string | undefined;

  const validation = validateReportSelection(report.kpis, kpiKeySet, counterKeySet, {
    vendors,
    aggregations: normalizeAggregationList(report.aggregations, report.aggregation),
    sites: report.sites,
  });
  if (!validation.isValid) {
    return { rows: [], errors: validation.errors };
  }

  // Separate KPIs from counters. Unknown keys were rejected above; never
  // silently route an unmapped normalized KPI through PM counters.
  const kpiKeys = validation.kpiKeys;
  const counterKeys = validation.counterKeys;

  // ── Fetch KPIs (batch per vendor: 1 request per vendor with all KPI codes) ──
  const kpiTasks = kpiKeys.length === 0 ? [] : vendors.map(vendor => async (): Promise<ReportResultRow[]> => {
    try {
      const payload = buildMonitorQueryPayload(report, vendor, kpiKeys);
      const url = getApiUrl('monitor/query/table');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REPORT_KPI_BATCH_TIMEOUT_MS);
      logBackendRequest('Rapport Builder KPI Table', 'POST', url, payload);
      const res = await fetch(url, {
        method: 'POST',
        headers: getApiHeaders(),
        signal: controller.signal,
        body: JSON.stringify(payload),
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        errors.push(`KPIs batch (${vendor}): HTTP ${res.status}${text ? ` ${text.slice(0, 180)}` : ''}`);
        return [];
      }
      const data = await res.json();
      if (!denseFillNotice && typeof data?.meta?.dense_fill === 'string') {
        denseFillNotice = data.meta.dense_fill;
      }
      const batchResults: ReportResultRow[] = [];
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      const aggList = normalizeAggregationList(report.aggregations, report.aggregation);
      const primaryAgg = aggList.find(a => a !== 'cell') || null;
      // Multi-dim backend now returns named columns (site_name, cell_name, plaque, …)
      // directly. Fallback chain (split_value-based) only kicks in for the legacy
      // single-dim path where the requested dim isn't echoed under its named key.
      for (const pt of rows) {
        const rowKpis = pt?.kpi_key ? [String(pt.kpi_key)] : kpiKeys;
        for (const kpiCode of rowKpis) {
          if (!kpiKeys.includes(kpiCode)) continue;
          const value = parseMetricValue(pt?.[kpiCode] ?? pt?.avg ?? pt?.value);
          // Keep null-valued rows: backend dense-fill emits avg=null for
          // missing (timestamp × dim-combo) cells so the table can render
          // a continuous timeline with explicit "—" gaps.
          const unit = kpiCode.includes('RATE') || kpiCode.includes('SR') ? '%' : kpiCode.includes('THR') ? 'Mbps' : '';
          const splitValue = getReportDimensionValue(pt, primaryAgg, pt.split_value);
          batchResults.push({
            kpi: kpiCode,
            vendor,
            technology: pt.techno || pt.technology || report.technologies[0] || '4G',
            timestamp: pt.ts || pt.timestamp || pt.date || payload.date_from,
            value,
            unit,
            site_name: pt.site_name || pt.site || (primaryAgg === 'site' ? splitValue : undefined),
            cell_name: pt.cell_name || pt.cell || pt.ne_name || pt.network_element,
            cluster:   pt.cluster || (primaryAgg === 'cluster' ? splitValue : undefined),
            plaque:    pt.plaque  || (primaryAgg === 'plaque'  ? splitValue : undefined),
            dor:       pt.dor || pt.DOR || (primaryAgg === 'dor' || primaryAgg === 'dr' || primaryAgg === 'region' ? splitValue : undefined),
            band:      pt.band || pt.source_band || (primaryAgg === 'band' ? splitValue : undefined),
          });
        }
      }
      if (batchResults.length === 0 && data?.error) {
        errors.push(`KPIs batch (${vendor}): ${data.error}`);
      }
      console.log(`[RapportBuilder] KPI batch ${vendor}: ${batchResults.length} rows from ${(rows || []).length} table rows`);
      return batchResults;
    } catch (err: any) {
      const msg = err?.name === 'AbortError' ? 'timeout' : (err?.message || 'unknown error');
      console.error(`[RapportBuilder] KPI batch ${vendor} FAILED:`, err);
      errors.push(`KPIs batch (${vendor}): ${msg}`);
      return [];
    }
  });

  // ── Fetch Counters (per vendor, batch, with concurrency limit) ──
  const counterTasks = counterKeys.length === 0 ? [] : vendors.map(vendor => async (): Promise<ReportResultRow[]> => {
    try {
      const url = getApiUrl('pm/counters/timeseries');
      const body = {
        ...base,
        counter_names: counterKeys,
        vendor,
        split_by_field: base.split_by_field || 'cell_name',
      };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REPORT_COUNTER_BATCH_TIMEOUT_MS);
      logBackendRequest('Rapport Builder Counter Timeseries', 'POST', url, body);
      const res = await fetch(url, {
        method: 'POST',
        headers: getApiHeaders(),
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      clearTimeout(timeout);
      if (!res.ok) {
        errors.push(`Counters (${vendor}): HTTP ${res.status}`);
        return [];
      }
      const data = await res.json();
      const series: any[] = Array.isArray(data?.series) ? data.series : Array.isArray(data) ? data : [];
      if (series.length === 0) {
        if (data?.error) errors.push(`Counters (${vendor}): ${data.error}`);
        else if (data?.meta?.total_series === 0) errors.push(`Counters (${vendor}): no series returned (topology_cells=${data.meta.topology_cells ?? '?'})`);
        return [];
      }
      return series.flatMap((pt: any) => {
        const value = parseMetricValue(pt.value);
        if (value == null) return [];
        return [{
          kpi: pt.counter_id || pt.counter_name || counterKeys[0],
          vendor,
          technology: pt.techno || report.technologies[0] || '4G',
          timestamp: pt.ts || pt.timestamp || base.date_from as string,
          value,
          unit: 'count',
          site_name: pt.site_name,
          cell_name: pt.cell_name,
        }];
      });
    } catch (err: any) {
      const msg = err?.name === 'AbortError' ? 'timeout' : (err?.message || 'unknown error');
      errors.push(`Counters (${vendor}): ${msg}`);
      return [];
    }
  });

  const allTasks = [...kpiTasks, ...counterTasks];
  const batches = await pLimit(allTasks, MAX_CONCURRENT);
  for (const batch of batches) results.push(...batch);
  console.log(`[RapportBuilder] Total: ${results.length} rows, ${errors.length} errors, ${allTasks.length} tasks`);

  return { rows: results, errors, denseFillNotice };
}

function downloadCsv(report: RanReport) {
  if (report.results.length === 0) return;
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  // Build pivot CSV: dimension columns + KPI columns
  const aggLevels = normalizeAggregationList(report.aggregations, report.aggregation);
  const dimHeaders: string[] = ['Timestamp', 'Vendor', 'Technology'];
  if (aggLevels.includes('cluster')) dimHeaders.push('Cluster');
  if (aggLevels.includes('plaque')) dimHeaders.push('Plaque');
  if (aggLevels.includes('dor') || aggLevels.includes('dr') || aggLevels.includes('region')) dimHeaders.push('DOR');
  if (aggLevels.includes('site')) dimHeaders.push('Site');
  if (aggLevels.includes('band')) dimHeaders.push('Band');
  if (aggLevels.includes('cell')) dimHeaders.push('Cell');
  const kpis = resolvePivotKpiColumns(report);
  const header = [...dimHeaders, ...kpis];
  // Pivot rows
  const rowMap = new Map<string, Record<string, any>>();
  for (const r of report.results) {
    const dims = [r.timestamp, r.vendor, r.technology];
    if (aggLevels.includes('cluster')) dims.push(r.cluster || '');
    if (aggLevels.includes('plaque')) dims.push(r.plaque || '');
    if (aggLevels.includes('dor') || aggLevels.includes('dr') || aggLevels.includes('region')) dims.push(r.dor || '');
    if (aggLevels.includes('site')) dims.push(r.site_name || '');
    if (aggLevels.includes('band')) dims.push(r.band || '');
    if (aggLevels.includes('cell')) dims.push(r.cell_name || '');
    const key = dims.join('|');
    if (!rowMap.has(key)) rowMap.set(key, Object.fromEntries(dimHeaders.map((h, i) => [h, dims[i]])));
    const row = rowMap.get(key)!;
    if (r.value != null || row[r.kpi] == null) {
      row[r.kpi] = r.value;
    }
  }
  const csvRows = Array.from(rowMap.values());
  const csv = [
    header.map(escape).join(','),
    ...csvRows.map(row => header.map(h => escape(row[h] ?? '')).join(',')),
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

const ChipMultiSelect: React.FC<{
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyHint?: string;
}> = ({ label, options, selected, onChange, emptyHint }) => {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(o => o.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</label>
        {selected.length > 0 && (
          <button onClick={() => onChange([])} className="text-[10px] font-semibold text-muted-foreground hover:text-destructive">
            Clear
          </button>
        )}
      </div>
      {options.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/50 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          {emptyHint || 'No option available'}
        </p>
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            className="mb-2 h-9 w-full rounded-xl border border-border/60 bg-background px-3 text-xs outline-none transition-all focus:border-primary/40"
          />
          <div className="max-h-44 overflow-y-auto rounded-xl border border-border/40 bg-card/80 p-2">
            {filtered.length === 0 ? (
              <p className="px-2 py-1 text-[11px] text-muted-foreground">No match</p>
            ) : filtered.map(opt => {
              const active = selected.includes(opt);
              return (
                <button
                  key={opt}
                  onClick={() => toggle(opt)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-xs transition-all',
                    active ? 'bg-primary/15 text-primary font-semibold' : 'text-foreground hover:bg-muted/50'
                  )}
                >
                  <span className="truncate">{opt}</span>
                  {active && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selected.map(s => (
                <MetricPill key={s} label={s} onRemove={() => toggle(s)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

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
  const [detailMode, setDetailMode] = useState<'table' | 'chart' | 'pivot'>('table');
  const [resultPage, setResultPage] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<ClusterSelection | null>(null);

  // ── Catalogs (Investigator-themed selectors) ──
  const [kpiCatalog, setKpiCatalog] = useState<KpiCatalogEntry[]>([]);
  const [allKpiCatalog, setAllKpiCatalog] = useState<KpiCatalogEntry[]>([]);
  const [counterCatalog, setCounterCatalog] = useState<any[]>([]);
  const [kpiModalOpen, setKpiModalOpen] = useState(false);
  const [counterModalOpen, setCounterModalOpen] = useState(false);

  // ── Backend-driven Filter Area / Dimension options ──
  const [topoOpts, setTopoOpts] = useState<{ cluster: string[]; dor: string[]; zone_arcep: string[] }>({ cluster: [], dor: [], zone_arcep: [] });
  const [topoLoading, setTopoLoading] = useState(true);
  const [topoError, setTopoError] = useState<string | null>(null);
  const [dimensionOpts, setDimensionOpts] = useState<string[]>(DEFAULT_DIMENSIONS);
  const [dimensionLoading, setDimensionLoading] = useState(true);
  const [aggregationOptions, setAggregationOptions] = useState(FALLBACK_AGGREGATION_OPTIONS);

  // Site search (live debounced)
  const [siteSearch, setSiteSearch] = useState('');
  const [siteResults, setSiteResults] = useState<string[]>([]);
  const [siteSearching, setSiteSearching] = useState(false);

  useEffect(() => {
    // Persist report definitions only — strip results to stay within localStorage limits
    const stripped = reports.map(({ results, ...def }) => ({ ...def, results: [] }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped));
  }, [reports]);

  // Load KPI catalog + counter catalog from backend, re-fetch when vendor changes
  useEffect(() => {
    const vendor = form.vendors.length === 1 ? form.vendors[0] : '';
    // KPI catalog from monitor API
    const loadSharedCodes = async (): Promise<string[]> => {
      try {
        const r = await fetch(getApiUrl('kpi-tables/shared'), { headers: getApiHeaders() });
        if (!r.ok) return [];
        const json = await r.json();
        if (Array.isArray(json?.kpi_codes)) return json.kpi_codes;
        if (Array.isArray(json?.codes)) return json.codes;
        if (Array.isArray(json?.data)) return json.data.map((row: any) => row?.kpi_code || row?.kpi_key || row?.kpi_code_normalized).filter(Boolean);
        if (Array.isArray(json?.kpis)) return json.kpis.map((row: any) => typeof row === 'string' ? row : row?.kpi_code || row?.kpi_key || row?.kpi_code_normalized).filter(Boolean);
        if (Array.isArray(json?.rows)) return json.rows.map((row: any) => row?.kpi_code || row?.kpi_key || row?.kpi_code_normalized).filter(Boolean);
        return [];
      } catch {
        return [];
      }
    };
    fetch(getApiUrl('monitor/catalog/kpis'), { headers: getApiHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(async (data: KpiCatalogEntry[]) => {
        const arr = mergeSharedKpiCodes(Array.isArray(data) ? data : [], await loadSharedCodes());
        setAllKpiCatalog(arr);
        // Filter by vendor if a specific vendor is selected
        const filtered = vendor && vendor !== 'Multi-Vendor'
          ? arr.filter(k => !k.vendor || k.vendor.toLowerCase() === vendor.toLowerCase())
          : arr;
        setKpiCatalog(filtered);
      })
      .catch(() => {
        // Fallback to DB catalog if monitor endpoint is unavailable
        fetchKpiCatalogFromDB()
          .then(async arr => {
            const merged = mergeSharedKpiCodes(arr, await loadSharedCodes());
            setAllKpiCatalog(merged);
            setKpiCatalog(vendor && vendor !== 'Multi-Vendor'
              ? merged.filter(k => !k.vendor || k.vendor.toLowerCase() === vendor.toLowerCase())
              : merged);
          })
          .catch(() => {
            setAllKpiCatalog([]);
            setKpiCatalog([]);
          });
      });
    // Counter catalog from PM API
    const counterUrl = vendor && vendor !== 'Multi-Vendor'
      ? `pm/counters/catalog?vendor=${encodeURIComponent(vendor)}&limit=5000`
      : 'pm/counters/catalog?limit=5000';
    fetchVpsWithRetry(getApiUrl(counterUrl), { headers: getApiHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(d => setCounterCatalog(Array.isArray(d) ? d : []))
      .catch(() => setCounterCatalog([]));
  }, [form.vendors]);

  // Load topology filter dimensions (Plaque / DOR / Zone ARCEP) — re-fetch when vendor/techno changes
  useEffect(() => {
    setTopoLoading(true);
    setTopoError(null);
    const qs = new URLSearchParams();
    if (form.vendors.length > 0) qs.set('vendor', form.vendors.join(','));
    if (form.technologies.length > 0) qs.set('techno', form.technologies.join(','));
    const query = qs.toString();
    topoApi.filters(query || undefined)
      .then((resp) => {
        const map: Record<string, string[]> = {};
        for (const f of resp.filters ?? []) map[f.id] = f.values ?? [];
        setTopoOpts({
          cluster: map.cluster ?? map.plaque ?? [],
          dor: map.dor ?? [],
          zone_arcep: map.zone_arcep ?? [],
        });
      })
      .catch((err) => {
        console.warn('[RanQueryModule] Failed to load topo filters', err);
        // Fallback: load without filters
        topoApi.filters()
          .then((resp) => {
            const map: Record<string, string[]> = {};
            for (const f of resp.filters ?? []) map[f.id] = f.values ?? [];
            setTopoOpts({ cluster: map.cluster ?? map.plaque ?? [], dor: map.dor ?? [], zone_arcep: map.zone_arcep ?? [] });
          })
          .catch(() => setTopoError('Unable to load filter options from backend'));
      })
      .finally(() => setTopoLoading(false));
  }, [form.vendors, form.technologies]);

  // Load dimensions list from backend — fallback to defaults
  useEffect(() => {
    setDimensionLoading(true);
    fetch(getApiUrl('qoe/dimensions?table=qoe_metric'), { headers: getApiHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const arr = Array.isArray(data) ? data : (data?.values || []);
        const extra = arr.filter((s: any) => typeof s === 'string');
        const merged = Array.from(new Set([...DEFAULT_DIMENSIONS, ...extra]));
        setDimensionOpts(merged.length ? merged : DEFAULT_DIMENSIONS);
      })
      .catch(() => setDimensionOpts(DEFAULT_DIMENSIONS))
      .finally(() => setDimensionLoading(false));
  }, []);

  // Load aggregation options from backend filter catalog
  useEffect(() => {
    fetch(getApiUrl('monitor/catalog/filters'), { headers: getApiHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const items = Array.isArray(data) ? data : data.filters || data.data || [];
        const agg = items
          .filter((f: any) => f.is_aggregatable && f.is_active !== false)
          .map((f: any) => ({ value: canonicalAggKey(f.dimension_key), label: f.display_name || f.dimension_key }))
          // Drop catalog dims that don't map to a chip we know how to render
          // (sector, tac, lat/lng/azimuth/tilt, etc.) — they'd produce empty
          // columns in the report results.
          .filter((a: any) => a.value)
          // Dedupe by canonical value (PLAQUE_SITE + PLAQUE → one chip)
          .filter((a: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.value === a.value) === i);
        // Always include Cluster
        if (!agg.find((a: any) => a.value === 'cluster')) agg.push({ value: 'cluster', label: 'Cluster' });
        if (agg.length > 0) setAggregationOptions(agg);
      })
      .catch(() => {});
  }, []);

  // Live site search (debounced) — narrowed by current Plaque / DOR selection
  useEffect(() => {
    const q = siteSearch.trim();
    if (q.length < 2) { setSiteResults([]); setSiteSearching(false); return; }
    setSiteSearching(true);
    const handle = window.setTimeout(async () => {
      try {
        const qs = new URLSearchParams();
        qs.set('search', q);
        qs.set('limit', '40');
        if (form.clusters.length > 0) qs.set('cluster', form.clusters.join(','));
        if (form.dors.length > 0) qs.set('dor', form.dors.join(','));
        const rows = await topoApi.filteredSites(qs.toString());
        const names = (Array.isArray(rows) ? rows : [])
          .map((r: any) => r.nom_site || r.site_name)
          .filter(Boolean);
        setSiteResults(Array.from(new Set(names)).slice(0, 40));
      } catch (err) {
        console.warn('[RanQueryModule] site search failed', err);
        setSiteResults([]);
      } finally {
        setSiteSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [siteSearch, form.clusters, form.dors]);

  // Split current selection into KPI keys vs counter keys
  const kpiKeySet = useMemo(() => new Set(
    allKpiCatalog.flatMap(k => [k.kpi_key, k.kpi_code_normalized].flatMap(selectableKeyVariants))
  ), [allKpiCatalog]);
  const selectedKpiKeys = useMemo(() => form.selectedKpis.filter(k => kpiKeySet.has(k) || kpiKeySet.has(String(k).toLowerCase())), [form.selectedKpis, kpiKeySet]);
  const counterKeySet = useMemo(() => new Set(
    counterCatalog.flatMap((c: any) => [c.counter_name, c.counter_id, c.name, c.key].filter(Boolean).map(String))
  ), [counterCatalog]);
  const selectedCounterKeys = useMemo(() => form.selectedKpis.filter(k => counterKeySet.has(k)), [form.selectedKpis, counterKeySet]);
  const reportSelectionValidation = useMemo(() => validateReportSelection(form.selectedKpis, kpiKeySet, counterKeySet, {
    vendors: form.vendors,
    aggregations: normalizeAggregationList(form.aggregations),
    sites: form.sites,
  }), [counterKeySet, form.aggregations, form.selectedKpis, form.sites, form.vendors, kpiKeySet]);
  const canCreateReport = Boolean(form.name.trim()) && form.selectedKpis.length > 0 && form.technologies.length > 0 && reportSelectionValidation.isValid;
  const selectedMetricRows = useMemo(() => {
    const normalizeValues = (values: Array<string | undefined | null>, fallback: string[]) => {
      const parsed = values
        .flatMap(value => String(value || '').split(/[\/,]/))
        .map(value => value.trim())
        .filter(Boolean);
      return Array.from(new Set(parsed.length > 0 ? parsed : fallback));
    };
    const kpiByKey = new Map<string, KpiCatalogEntry>();
    [...allKpiCatalog, ...kpiCatalog].forEach(kpi => {
      [kpi.kpi_key, kpi.kpi_code_normalized].flatMap(selectableKeyVariants).forEach(key => kpiByKey.set(key, kpi));
    });
    const counterByName = new Map<string, any>();
    counterCatalog.forEach((counter: any) => {
      [counter.counter_name, counter.counter_id, counter.name, counter.key].filter(Boolean).forEach(key => counterByName.set(String(key), counter));
    });
    return form.selectedKpis.map(key => {
      const kpi = kpiByKey.get(key) || kpiByKey.get(key.toLowerCase());
      if (kpi) {
        return {
          key,
          label: kpi.display_name && kpi.display_name !== key ? kpi.display_name : key,
          secondary: kpi.display_name && kpi.display_name !== key ? key : kpi.category || '',
          type: 'KPI' as const,
          vendors: normalizeValues([kpi.vendor], form.vendors),
          technos: normalizeValues([kpi.techno || (kpi.techno_scope === 'both' ? '' : kpi.techno_scope)], form.technologies),
        };
      }
      const counter = counterByName.get(key);
      if (counter) {
        return {
          key,
          label: counter.display_name && counter.display_name !== key ? counter.display_name : key,
          secondary: counter.display_name && counter.display_name !== key ? key : counter.family || counter.object_type || '',
          type: 'Counter' as const,
          vendors: normalizeValues([counter.vendor], form.vendors),
          technos: normalizeValues([counter.techno], form.technologies),
        };
      }
      return {
        key,
        label: key,
        secondary: 'Unknown key - not in KPI or PM counter catalog',
        type: 'Unknown' as const,
        vendors: normalizeValues([], form.vendors),
        technos: normalizeValues([], form.technologies),
      };
    });
  }, [allKpiCatalog, counterCatalog, form.selectedKpis, form.technologies, form.vendors, kpiCatalog]);

  const selectedReport = useMemo(
    () => reports.find(report => report.id === selectedReportId) || null,
    [reports, selectedReportId]
  );
  const selectedReportValidation = useMemo(() => {
    if (!selectedReport) return null;
    return validateReportSelection(selectedReport.kpis, kpiKeySet, counterKeySet, {
      vendors: selectedReport.vendor ? selectedReport.vendor.split(',').map(s => s.trim()).filter(Boolean) : [],
      aggregations: normalizeAggregationList(selectedReport.aggregations, selectedReport.aggregation),
      sites: selectedReport.sites,
    });
  }, [counterKeySet, kpiKeySet, selectedReport]);

  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      const matchesSearch = report.name.toLowerCase().includes(search.toLowerCase());
      const matchesVendor = vendorFilter === 'ALL' || report.vendor === vendorFilter;
      const matchesTech = techFilter === 'ALL' || report.technologies.includes(techFilter);
      const matchesStatus = statusFilter === 'ALL' || report.status === statusFilter;
      return matchesSearch && matchesVendor && matchesTech && matchesStatus;
    });
  }, [reports, search, statusFilter, techFilter, vendorFilter]);

  // Build time-series chart data: group by timestamp, one line per KPI
  const chartData = useMemo(() => {
    if (!selectedReport || selectedReport.results.length === 0) return [];
    // Group by timestamp — compute AVERAGE per KPI per timestamp
    const tsMap = new Map<string, Record<string, { sum: number; count: number }>>();
    const kpiSet = new Set<string>();
    for (const row of selectedReport.results) {
      const ts = row.timestamp;
      if (!tsMap.has(ts)) tsMap.set(ts, {});
      const bucket = tsMap.get(ts)!;
      if (row.value == null) {
        kpiSet.add(row.kpi);
        continue;
      }
      if (!bucket[row.kpi]) bucket[row.kpi] = { sum: 0, count: 0 };
      bucket[row.kpi].sum += row.value;
      bucket[row.kpi].count += 1;
      kpiSet.add(row.kpi);
    }
    const sorted = Array.from(tsMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    return {
      points: sorted.map(([ts, vals]) => {
        const avg: Record<string, any> = { ts };
        for (const [kpi, { sum, count }] of Object.entries(vals)) {
          avg[kpi] = count > 0 ? Number((sum / count).toFixed(4)) : 0;
        }
        return avg;
      }),
      kpis: Array.from(kpiSet),
    };
  }, [selectedReport]);

  // Pagination for results table
  // Build pivot table: rows = unique (timestamp, vendor, techno, agg1, agg2, ...), cols = KPIs
  // Headers are derived from the user's *selection* (aggregations + report.kpis)
  // even when results are empty — so an executed-but-failed report still
  // shows the table the user expected, with empty cells.
  const pivotData = useMemo(() => {
    if (!selectedReport) return { rows: [], kpis: [], dimCols: [] };
    const aggLevels = normalizeAggregationList(selectedReport.aggregations, selectedReport.aggregation);
    // Determine which dimension columns to show
    const dimCols: { key: string; label: string }[] = [];
    dimCols.push({ key: '_timestamp', label: 'Timestamp' });
    dimCols.push({ key: '_vendor', label: 'Vendor' });
    dimCols.push({ key: '_technology', label: 'Techno' });
    if (aggLevels.includes('cluster')) dimCols.push({ key: '_cluster', label: 'Cluster' });
    if (aggLevels.includes('plaque')) dimCols.push({ key: '_plaque', label: 'Plaque' });
    if (aggLevels.includes('dor') || aggLevels.includes('dr') || aggLevels.includes('region')) dimCols.push({ key: '_dor', label: 'DOR' });
    if (aggLevels.includes('site')) dimCols.push({ key: '_site', label: 'Site' });
    if (aggLevels.includes('band')) dimCols.push({ key: '_band', label: 'Band' });
    if (aggLevels.includes('cell')) dimCols.push({ key: '_cell', label: 'Cell' });
    const kpis = resolvePivotKpiColumns(selectedReport);
    // Build pivot rows: group by dimension key → accumulate KPI values
    const rowMap = new Map<string, Record<string, any>>();
    for (const r of selectedReport.results) {
      const dims: Record<string, string> = {
        _timestamp: r.timestamp,
        _vendor: r.vendor,
        _technology: r.technology,
        _cluster: r.cluster || '',
        _plaque: r.plaque || '',
        _dor: r.dor || '',
        _site: r.site_name || '',
        _band: r.band || '',
        _cell: r.cell_name || '',
      };
      const rowKey = dimCols.map(d => dims[d.key] || '').join('|');
      if (!rowMap.has(rowKey)) rowMap.set(rowKey, { ...dims });
      const row = rowMap.get(rowKey)!;
      if (r.value != null || row[r.kpi] == null) {
        row[r.kpi] = r.value;
      }
    }
    return { rows: Array.from(rowMap.values()), kpis, dimCols };
  }, [selectedReport]);

  const PAGE_SIZE = 100;
  const paginatedPivot = useMemo(() => {
    return pivotData.rows.slice(resultPage * PAGE_SIZE, (resultPage + 1) * PAGE_SIZE);
  }, [pivotData, resultPage]);
  const totalPivotPages = Math.max(1, Math.ceil(pivotData.rows.length / PAGE_SIZE));

  const paginatedResults = useMemo(() => {
    if (!selectedReport) return [];
    const start = resultPage * PAGE_SIZE;
    return selectedReport.results.slice(start, start + PAGE_SIZE);
  }, [selectedReport, resultPage]);
  const totalPages = selectedReport ? Math.max(1, Math.ceil(selectedReport.results.length / PAGE_SIZE)) : 1;

  // Pivot: Site (rows) × Technology (columns), SUM of Value
  const sitePivotData = useMemo(() => {
    if (!selectedReport || selectedReport.results.length === 0) {
      return { rows: [] as { site: string; values: Record<string, number>; total: number }[], techs: [] as string[], colTotals: {} as Record<string, number>, grandTotal: 0 };
    }
    const techSet = new Set<string>();
    const map = new Map<string, Record<string, number>>();
    for (const r of selectedReport.results) {
      const site = (r.site_name && r.site_name.trim()) || '—';
      const tech = (r.technology && r.technology.trim()) || '—';
      techSet.add(tech);
      let entry = map.get(site);
      if (!entry) { entry = {}; map.set(site, entry); }
      if (r.value != null) {
        entry[tech] = (entry[tech] ?? 0) + Number(r.value);
      }
    }
    const techs = [...techSet].sort();
    const colTotals: Record<string, number> = {};
    let grandTotal = 0;
    const rows = [...map.entries()]
      .map(([site, values]) => {
        let total = 0;
        for (const t of techs) {
          const v = values[t] ?? 0;
          total += v;
          colTotals[t] = (colTotals[t] ?? 0) + v;
        }
        grandTotal += total;
        return { site, values, total };
      })
      .sort((a, b) => b.total - a.total);
    return { rows, techs, colTotals, grandTotal };
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
  };

  const createReport = () => {
    if (!canCreateReport) return;
    const now = new Date().toISOString();

    // Edit mode: update the existing report in place
    if (editingReportId) {
      setReports(prev => prev.map(r => r.id === editingReportId ? {
        ...r,
        name: form.name.trim(),
        vendor: form.vendors.join(','),
        technologies: form.technologies,
        kpis: form.selectedKpis,
        timeConfig: buildTimeConfig(form),
        clusters: form.clusters,
        dors: form.dors,
        sites: form.sites,
        zoneArcep: form.zoneArcep,
        aggregations: normalizeAggregationList(form.aggregations),
        dimensions: form.dimensions,
        cluster_id: selectedCluster ? Number(selectedCluster.cluster.id) : undefined,
        cluster_name: selectedCluster?.cluster.name,
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

    const reportId = `ran-report-${crypto.randomUUID()}`;
    const report: RanReport = {
      id: reportId,
      name: form.name.trim(),
      vendor: form.vendors.join(','),
      technologies: form.technologies,
      kpis: form.selectedKpis,
      timeConfig: buildTimeConfig(form),
      status: 'Ready',
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      results: [],
      clusters: form.clusters,
      dors: form.dors,
      sites: form.sites,
      zoneArcep: form.zoneArcep,
      aggregations: normalizeAggregationList(form.aggregations),
      dimensions: form.dimensions,
      cluster_id: selectedCluster ? Number(selectedCluster.cluster.id) : undefined,
      cluster_name: selectedCluster?.cluster.name,
    };
    setReports(prev => [report, ...prev]);
    setSelectedReportId(reportId);
    setView('detail');
    resetForm();
  };

  const editReport = (reportId: string) => {
    const r = reports.find(x => x.id === reportId);
    if (!r) return;
    const tc = r.timeConfig;
    setForm({
      name: r.name,
      vendors: r.vendor ? r.vendor.split(',').map(s => s.trim()).filter(Boolean) : [],
      technologies: r.technologies,
      timeMode: tc.timeMode,
      absoluteStart: tc.timeMode === 'absolute' ? tc.start : DEFAULT_FORM().absoluteStart,
      absoluteEnd: tc.timeMode === 'absolute' ? tc.end : DEFAULT_FORM().absoluteEnd,
      relativePreset: 'custom',
      relativeValue: tc.timeMode === 'relative' ? tc.value : 24,
      relativeUnit: tc.timeMode === 'relative' ? tc.unit : 'hours',
      manualInput: '',
      selectedKpis: r.kpis,
      clusters: r.clusters ?? [],
      dors: r.dors ?? [],
      sites: r.sites ?? [],
      zoneArcep: r.zoneArcep ?? [],
      aggregations: normalizeAggregationList(r.aggregations, r.aggregation),
      dimensions: r.dimensions ?? [],
      granularity: r.timeConfig.granularity ?? '1h',
    });
    setEditingReportId(reportId);
    setView('create');
  };

  const executeReport = useCallback(async (reportId: string) => {
    setIsExecutingId(reportId);
    setResultPage(0);
    setReports(prev => prev.map(report => report.id === reportId ? { ...report, status: 'Running' as ReportStatus, health: undefined, errorMessage: undefined, updatedAt: new Date().toISOString() } : report));
    try {
      // Read fresh report state
      const report = reports.find(r => r.id === reportId);
      if (!report) throw new Error('Report not found');
      const validation = validateReportSelection(report.kpis, kpiKeySet, counterKeySet, {
        vendors: report.vendor ? report.vendor.split(',').map(s => s.trim()).filter(Boolean) : [],
        aggregations: normalizeAggregationList(report.aggregations, report.aggregation),
        sites: report.sites,
      });
      if (!validation.isValid) {
        throw new Error(validation.errors.join(' | '));
      }
      const { rows, errors, denseFillNotice } = await executeReportApi(report, kpiKeySet, counterKeySet);
      const errorMsg = errors.length > 0 ? errors.join(' | ') : undefined;
      // A row with value=null is a dense-fill / empty-scope stub — useful to
      // render the table skeleton, but doesn't count as "data found".
      const hasRealData = rows.some(r => r.value != null);
      const hasData = hasRealData;

      // When the query returns no rows, ask the backend for the actual PM data
      // window so the user knows what range *would* have data — instead of the
      // old hardcoded date range that lied about availability.
      let emptyMsg: string | undefined;
      if (!hasData) {
        const requestedRange = report.timeConfig.timeMode === 'absolute'
          ? `${report.timeConfig.start} → ${report.timeConfig.end}`
          : `Last ${(report.timeConfig as any).value} ${(report.timeConfig as any).unit}`;
        let availability = '';
        try {
          const vendor = report.vendor.split(',')[0]?.trim();
          const techno = report.technologies[0];
          if (vendor && techno) {
            const qs = new URLSearchParams({ vendor, techno }).toString();
            const res = await fetch(getApiUrl(`monitor/data-range?${qs}`), { headers: getApiHeaders() });
            if (res.ok) {
              const range = await res.json();
              if (range?.from && range?.to) {
                const fmt = (s: string) => s.slice(0, 10);
                availability = ` PM data available: ${fmt(range.from)} to ${fmt(range.to)} (${range.total ?? '?'} rows).`;
              } else if (range?.total === 0) {
                availability = ' No PM data found for this vendor/technology.';
              }
            }
          }
        } catch (_) { /* fall through to message without availability */ }
        emptyMsg = `No data returned for ${report.vendor} / ${report.technologies.join(', ')}.${availability} Your range: ${requestedRange}.`;
      }

      setReports(prev => prev.map(r => {
        if (r.id !== reportId) return r;
        // Status mapping (2026-05-07):
        //   hasData                          → Completed (green)
        //   !hasData && errors.length === 0  → Empty     (amber) — the query
        //     succeeded, the result set is just empty (typically a PM data
        //     gap in the requested time window). Operator should re-aim the
        //     time range, not chase a backend bug.
        //   !hasData && errors.length > 0    → Failed    (red)   — at least
        //     one underlying request actually errored (HTTP 500, timeout,
        //     malformed payload). Real bug, worth investigating.
        const finalStatus: ReportStatus = hasData
          ? 'Completed'
          : (errors.length > 0 ? 'Failed' : 'Empty');
        const finalHealth: ReportHealth | undefined = hasData
          ? (errors.length > 0 ? 'warning' : 'ok')
          : (errors.length > 0 ? 'error' : 'warning');
        return {
          ...r,
          status: finalStatus,
          health: finalHealth,
          results: rows,
          errorMessage: !hasData ? (errorMsg || emptyMsg) : errorMsg,
          denseFillNotice,
          lastRunAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }));
    } catch (err: any) {
      setReports(prev => prev.map(r => {
        if (r.id !== reportId) return r;
        return { ...r, status: 'Failed' as ReportStatus, health: 'error', errorMessage: err?.message || 'Execution failed', updatedAt: new Date().toISOString() };
      }));
    } finally {
      setIsExecutingId(current => current === reportId ? null : current);
    }
  }, [counterKeySet, reports, kpiKeySet]);

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
      id: `ran-report-${crypto.randomUUID()}`,
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
    if (showDeleteConfirm !== reportId) {
      setShowDeleteConfirm(reportId);
      return;
    }
    setShowDeleteConfirm(null);
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
        {selectedMetricRows.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
            <div className="grid grid-cols-[1.6fr_0.55fr_0.9fr_0.9fr_42px] gap-3 bg-muted/40 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              <span>KPI / Counter</span>
              <span>Type</span>
              <span>Vendor</span>
              <span>Techno</span>
              <span></span>
            </div>
            <div className="max-h-72 divide-y divide-border/40 overflow-y-auto">
              {selectedMetricRows.map(item => (
                <div key={item.key} className="grid grid-cols-[1.6fr_0.55fr_0.9fr_0.9fr_42px] items-center gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-foreground" title={item.label}>{item.label}</p>
                    {item.secondary && <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={item.secondary}>{item.secondary}</p>}
                  </div>
                  <span className={cn(
                    'w-fit rounded-full border px-2 py-0.5 text-[10px] font-bold',
                    item.type === 'KPI' ? 'border-primary/20 bg-primary/10 text-primary' :
                    item.type === 'Counter' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700' :
                    'border-destructive/30 bg-destructive/10 text-destructive'
                  )}>
                    {item.type}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {item.vendors.length > 0 ? item.vendors.map(vendor => (
                      <span key={vendor} className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium', vendorBadge(vendor).bg, vendorBadge(vendor).text, vendorBadge(vendor).border)}>
                        {vendor}
                      </span>
                    )) : <span className="text-[11px] text-muted-foreground">-</span>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {item.technos.length > 0 ? item.technos.map(techno => (
                      <span key={techno} className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium', techBadge(techno).bg, techBadge(techno).text, techBadge(techno).border)}>
                        {techno}
                      </span>
                    )) : <span className="text-[11px] text-muted-foreground">-</span>}
                  </div>
                  <button
                    onClick={() => updateForm('selectedKpis', form.selectedKpis.filter(metric => metric !== item.key))}
                    className="justify-self-end rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
                    title="Remove"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No KPI or counter selected yet.</p>
        )}
        {form.selectedKpis.length > 0 && (
          <div className="mt-3 space-y-2">
            {reportSelectionValidation.warnings.map((warning, idx) => (
              <div key={`report-warning-${idx}`} className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-[11px] font-medium text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
            {reportSelectionValidation.errors.map((error, idx) => (
              <div key={`report-error-${idx}`} className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2 text-[11px] font-medium text-destructive">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            ))}
            <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              Runtime safeguards: backend concurrency limit {REPORT_BACKEND_CONCURRENCY_LIMIT}; KPI batch timeout {Math.round(REPORT_KPI_BATCH_TIMEOUT_MS / 1000)}s per vendor; counter batch timeout {Math.round(REPORT_COUNTER_BATCH_TIMEOUT_MS / 1000)}s per vendor.
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_35%),linear-gradient(180deg,#f8fafc_0%,#f4f7fb_100%)]">
      <div className="border-b border-border/50 bg-background/80 px-6 py-5 backdrop-blur-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">OSMOSIS</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground">Rapport Builder</h1>
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
                      <span className={cn('inline-flex h-fit w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight', vendorBadge(report.vendor).bg, vendorBadge(report.vendor).text, vendorBadge(report.vendor).border)}>{report.vendor}</span>
                      <div className="flex flex-wrap items-center gap-1">
                        {report.technologies.map(t => (
                          <span key={t} className={cn('inline-flex h-fit w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight', techBadge(t).bg, techBadge(t).text, techBadge(t).border)}>{t}</span>
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">{describeTimeConfig(report.timeConfig)}</span>
                      <span className="font-semibold">{report.kpis.length}</span>
                      <div className="flex flex-wrap gap-1">
                        <span className={cn('inline-flex h-fit w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight', statusClasses(report.status))}>{report.status}</span>
                        {report.health === 'warning' && (
                          <span className={cn('inline-flex h-fit w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight', healthClasses('warning'))}>Warning</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDateTime(report.createdAt)}</span>
                      <div className="flex flex-nowrap items-center gap-1.5 justify-end">
                        <button
                          onClick={() => executeReport(report.id)}
                          disabled={isExecutingId === report.id}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/8 px-3 py-1.5 text-xs font-bold text-primary transition-all hover:bg-primary/14 disabled:opacity-50"
                        >
                          {isExecutingId === report.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} {(report.status === 'Completed' || report.status === 'Empty') ? 'Reload' : 'Execute'}
                        </button>
                        <button onClick={() => openReport(report.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-1.5 text-xs font-bold text-foreground transition-all hover:border-primary/30 hover:text-primary">
                          <FolderOpen className="h-3.5 w-3.5" /> Open
                        </button>
                        <button onClick={() => downloadCsv(report)} disabled={report.results.length === 0} className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-1.5 text-xs font-bold text-foreground transition-all hover:border-primary/30 hover:text-primary disabled:opacity-30 disabled:pointer-events-none">
                          <Download className="h-3.5 w-3.5" /> Download
                        </button>
                        <button onClick={() => editReport(report.id)} className="rounded-xl border border-border/60 p-2 text-muted-foreground transition-all hover:border-primary/30 hover:text-primary" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => duplicateReport(report.id)} className="rounded-xl border border-border/60 p-2 text-muted-foreground transition-all hover:border-primary/30 hover:text-primary" title="Duplicate">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteReport(report.id)}
                          onBlur={() => setShowDeleteConfirm(null)}
                          className={cn(
                            'rounded-xl border p-2 transition-all',
                            showDeleteConfirm === report.id
                              ? 'border-destructive bg-destructive/10 text-destructive'
                              : 'border-border/60 text-muted-foreground hover:border-destructive/30 hover:text-destructive'
                          )}
                          title={showDeleteConfirm === report.id ? 'Click again to confirm delete' : 'Delete'}
                        >
                          {showDeleteConfirm === report.id ? <AlertTriangle className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
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
                  <p className="mt-1 text-xs text-muted-foreground">{form.vendors.join(' / ') || 'No vendor selected'} · {form.technologies.join(' / ') || 'No technology selected'}</p>
                </div>
              </div>
            </SectionCard>

            <div className="grid gap-6 xl:grid-cols-2">
              <SectionCard title="Scope Selection" description="Select scope criteria to narrow the analysis.">
                <div className="space-y-5">
                  {/* Vendor — chips style (multi-select) */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Vendor</span>
                      {form.vendors.length > 0 && (
                        <button
                          type="button"
                          onClick={() => updateForm('vendors', [])}
                          className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {VENDOR_OPTIONS.map(vendor => {
                        const isActive = form.vendors.includes(vendor);
                        const accent = VENDOR_HSL[vendor.toUpperCase()] || 'hsl(var(--primary))';
                        return (
                          <button
                            key={vendor}
                            type="button"
                            onClick={() => updateForm('vendors', isActive ? form.vendors.filter(v => v !== vendor) : [...form.vendors, vendor])}
                            className={cn(
                              'px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all border',
                              isActive
                                ? 'text-white border-transparent shadow-sm'
                                : 'text-foreground border-border bg-card hover:bg-accent/50'
                            )}
                            style={isActive ? { backgroundColor: accent, borderColor: accent } : undefined}
                          >
                            {vendor}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="h-px bg-border/60" />

                  {/* Technology — chips style (multi-select) */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Technology</span>
                      {form.technologies.length > 0 && (
                        <button
                          type="button"
                          onClick={() => updateForm('technologies', [])}
                          className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {TECH_OPTIONS.map(tech => {
                        const isActive = form.technologies.includes(tech);
                        const accent = TECH_HSL[tech] || 'hsl(var(--primary))';
                        return (
                          <button
                            key={tech}
                            type="button"
                            onClick={() => updateForm('technologies', isActive ? form.technologies.filter(item => item !== tech) : [...form.technologies, tech])}
                            className={cn(
                              'px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all border',
                              isActive
                                ? 'text-white border-transparent shadow-sm'
                                : 'text-foreground border-border bg-card hover:bg-accent/50'
                            )}
                            style={isActive ? { backgroundColor: accent, borderColor: accent } : undefined}
                          >
                            {tech}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Active summary */}
                  {(form.vendors.length > 0 || form.technologies.length > 0) && (
                    <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {form.vendors.map(v => (
                          <span
                            key={v}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                            style={{ backgroundColor: VENDOR_HSL[v.toUpperCase()] || 'hsl(var(--primary))' }}
                          >
                            {v}
                            <button
                              type="button"
                              onClick={() => updateForm('vendors', form.vendors.filter(x => x !== v))}
                              className="hover:opacity-70"
                            >
                              <XCircle className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        {form.technologies.map(t => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                            style={{ backgroundColor: TECH_HSL[t] || 'hsl(var(--primary))' }}
                          >
                            {t}
                            <button
                              type="button"
                              onClick={() => updateForm('technologies', form.technologies.filter(item => item !== t))}
                              className="hover:opacity-70"
                            >
                              <XCircle className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => { updateForm('vendors', []); updateForm('technologies', []); }}
                        className="text-[10px] text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      >
                        Clear all
                      </button>
                    </div>
                  )}
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

                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Time Granularity</label>
                    <div className="flex flex-wrap gap-2">
                      {GRANULARITY_OPTIONS.map(opt => {
                        const active = form.granularity === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => updateForm('granularity', opt.value)}
                            className={cn(
                              'rounded-xl border px-3 py-2 text-xs font-bold transition-all',
                              active
                                ? 'border-primary/40 bg-primary/8 text-primary'
                                : 'border-border/60 bg-background text-foreground hover:border-primary/25'
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">Resolution at which KPI / counter values are aggregated over time.</p>
                  </div>
                </div>
              </SectionCard>
            </div>

            <SectionCard title="Filter Area" description="Use a saved cluster or narrow scope manually with topology filters.">
              <div className="mb-4 flex items-center gap-3">
                <ClusterPicker
                  selected={selectedCluster?.cluster || null}
                  onSelect={(sel) => {
                    setSelectedCluster(sel);
                    if (sel) {
                      // Auto-fill sites from cluster
                      updateForm('sites', sel.sites);
                    } else {
                      updateForm('sites', []);
                    }
                  }}
                />
                {selectedCluster && (
                  <span className="text-xs text-muted-foreground">
                    {selectedCluster.sites.length} sites from <strong>{selectedCluster.cluster.name}</strong>
                  </span>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Manual Filters" description="Or narrow scope manually with topology dimensions.">
              {topoLoading ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="h-24 animate-pulse rounded-2xl border border-border/40 bg-muted/40" />
                  ))}
                </div>
              ) : topoError ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/8 p-4 text-sm text-destructive">
                  {topoError}
                </div>
              ) : (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                  <ChipMultiSelect
                    label="Cluster"
                    options={topoOpts.cluster}
                    selected={form.clusters}
                    onChange={(v) => updateForm('clusters', v)}
                    emptyHint="No cluster returned by backend"
                  />
                  <ChipMultiSelect
                    label="DOR"
                    options={topoOpts.dor}
                    selected={form.dors}
                    onChange={(v) => updateForm('dors', v)}
                    emptyHint="No DOR returned by backend"
                  />
                  <ChipMultiSelect
                    label="Zone ARCEP"
                    options={topoOpts.zone_arcep}
                    selected={form.zoneArcep}
                    onChange={(v) => updateForm('zoneArcep', v)}
                    emptyHint="No zone returned by backend"
                  />
                  <div>
                    <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Sites</label>
                    <input
                      value={siteSearch}
                      onChange={(e) => setSiteSearch(e.target.value)}
                      placeholder="Search site name (min 2 chars)…"
                      className="h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-sm outline-none transition-all focus:border-primary/40"
                    />
                    {siteSearching && (
                      <p className="mt-2 text-[11px] text-muted-foreground">Searching…</p>
                    )}
                    {!siteSearching && siteResults.length > 0 && (
                      <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-border/40 bg-card/80 p-2">
                        {siteResults.map(name => {
                          const active = form.sites.includes(name);
                          return (
                            <button
                              key={name}
                              onClick={() => updateForm('sites', active ? form.sites.filter(s => s !== name) : [...form.sites, name])}
                              className={cn(
                                'flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-xs transition-all',
                                active ? 'bg-primary/15 text-primary font-semibold' : 'text-foreground hover:bg-muted/50'
                              )}
                            >
                              <span className="truncate">{name}</span>
                              {active && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {form.sites.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {form.sites.map(s => (
                          <MetricPill key={s} label={s} onRemove={() => updateForm('sites', form.sites.filter(item => item !== s))} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </SectionCard>

            <div className="grid gap-6 xl:grid-cols-2">
              <SectionCard title="Aggregation" description="Select one or more aggregation levels. Results will be split by the primary selection.">
                <div className="flex flex-wrap gap-2">
                  {aggregationOptions.map(opt => {
                    const active = form.aggregations.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => {
                          const next = active
                            ? form.aggregations.filter(a => a !== opt.value)
                            : opt.value === 'cell'
                              ? ['cell']
                              : [...form.aggregations.filter(a => a !== 'cell'), opt.value];
                          updateForm('aggregations', normalizeAggregationList(next.length > 0 ? next : ['site']));
                        }}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                          active ? 'border-primary/40 bg-primary/12 text-primary' : 'border-border/60 bg-background text-foreground hover:border-primary/25'
                        )}
                      >
                        {active && <CheckCircle2 className="h-3 w-3" />}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {normalizeAggregationList(form.aggregations).length > 1 && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Primary split: <strong>{aggregationOptions.find(a => a.value === normalizeAggregationList(form.aggregations)[0])?.label}</strong>
                  </p>
                )}
              </SectionCard>

              <SectionCard title="Dimension" description="Add complementary dimensions (Neighbors, PMQAP, Transport, …) to enrich the report.">
                {dimensionLoading ? (
                  <div className="flex flex-wrap gap-2">
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-muted/50" />
                    ))}
                  </div>
                ) : dimensionOpts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No dimension available from backend.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {dimensionOpts.map(d => {
                      const active = form.dimensions.includes(d);
                      return (
                        <button
                          key={d}
                          onClick={() => updateForm('dimensions', active ? form.dimensions.filter(x => x !== d) : [...form.dimensions, d])}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                            active ? 'border-primary/40 bg-primary/12 text-primary' : 'border-border/60 bg-background text-foreground hover:border-primary/25'
                          )}
                        >
                          {active && <CheckCircle2 className="h-3 w-3" />}
                          {d}
                        </button>
                      );
                    })}
                  </div>
                )}
                {form.dimensions.length > 0 && (
                  <p className="mt-3 text-[11px] text-muted-foreground">{form.dimensions.length} dimension(s) selected.</p>
                )}
              </SectionCard>
            </div>

            <SectionCard title="KPI / Counter Selection" description="Pick KPIs and PM counters from the live backend catalog. Scope above pre-filters the counter list by vendor / techno.">
              {KPISelectionBlock}
            </SectionCard>


            <div className="flex items-center justify-end gap-3">
              <button onClick={() => { resetForm(); setEditingReportId(null); setView(editingReportId ? 'detail' : 'list'); }} className="rounded-2xl border border-border/60 bg-card px-5 py-3 text-sm font-bold text-foreground transition-all hover:border-primary/30 hover:text-primary">
                Cancel
              </button>
              <button
                onClick={createReport}
                disabled={!canCreateReport}
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
              <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr_1fr_1fr_0.9fr_1fr]">
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
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Aggregation</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {normalizeAggregationList(selectedReport.aggregations, selectedReport.aggregation).map(a => (
                      <span key={a} className="inline-flex items-center rounded-full border border-primary/20 bg-primary/8 px-2 py-0.5 text-[10px] font-semibold text-primary">{a}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className={cn('inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em]', statusClasses(selectedReport.status))}>
                  {isExecutingId === selectedReport.id && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                  {selectedReport.status}
                </span>
                {selectedReport.health === 'warning' && (
                  <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em]', healthClasses('warning'))}>
                    <AlertTriangle className="h-3 w-3" />
                    Partial data
                  </span>
                )}
                {selectedReport.errorMessage && (
                  <details className="group w-full max-w-2xl rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-[11px] text-amber-700">
                    <summary className="flex cursor-pointer items-center gap-1.5 font-semibold">
                      <AlertTriangle className="h-3 w-3" />
                      {(() => {
                        const items = selectedReport.errorMessage.split(' | ');
                        return items.length > 1
                          ? `${items.length} backend issues — click to expand`
                          : (selectedReport.errorMessage.length > 120
                              ? selectedReport.errorMessage.slice(0, 120) + '… (click)'
                              : selectedReport.errorMessage);
                      })()}
                    </summary>
                    <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pl-4 font-mono text-[10px]">
                      {selectedReport.errorMessage.split(' | ').map((m, i) => (
                        <li key={i} className="list-disc">{m}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {selectedReportValidation && (selectedReportValidation.errors.length > 0 || selectedReportValidation.warnings.length > 0) && (
                  <div className="w-full space-y-2">
                    {selectedReportValidation.errors.map((error, idx) => (
                      <div key={`selected-report-error-${idx}`} className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2 text-[11px] font-medium text-destructive">
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{error}</span>
                      </div>
                    ))}
                    {selectedReportValidation.warnings.map((warning, idx) => (
                      <div key={`selected-report-warning-${idx}`} className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-[11px] font-medium text-amber-700">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{warning}</span>
                      </div>
                    ))}
                    <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                      Runtime safeguards: backend concurrency limit {REPORT_BACKEND_CONCURRENCY_LIMIT}; KPI timeout {Math.round(REPORT_KPI_BATCH_TIMEOUT_MS / 1000)}s per vendor; counter timeout {Math.round(REPORT_COUNTER_BATCH_TIMEOUT_MS / 1000)}s per vendor.
                    </div>
                  </div>
                )}
                <button onClick={() => executeReport(selectedReport.id)} disabled={isExecutingId === selectedReport.id || Boolean(selectedReportValidation && !selectedReportValidation.isValid)} className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50">
                  {isExecutingId === selectedReport.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} {(selectedReport.status === 'Completed' || selectedReport.status === 'Empty') ? 'Reload' : 'Execute'}
                </button>
                <button onClick={() => downloadCsv(selectedReport)} className="inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-4 py-2.5 text-xs font-bold text-foreground transition-all hover:border-primary/30 hover:text-primary">
                  <Download className="h-3.5 w-3.5" /> Download report
                </button>
                <button onClick={() => editReport(selectedReport.id)} className="inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-4 py-2.5 text-xs font-bold text-foreground transition-all hover:border-primary/30 hover:text-primary">
                  <Pencil className="h-3.5 w-3.5" /> Edit report
                </button>
                <div className="ml-auto inline-flex rounded-2xl border border-border/60 bg-muted/20 p-1">
                  <button onClick={() => setDetailMode('table')} className={cn('rounded-xl px-3 py-2 text-xs font-black uppercase tracking-[0.14em] transition-all', detailMode === 'table' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
                    Data Table
                  </button>
                  <button onClick={() => setDetailMode('chart')} className={cn('rounded-xl px-3 py-2 text-xs font-black uppercase tracking-[0.14em] transition-all', detailMode === 'chart' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
                    Time Series
                  </button>
                  <button onClick={() => setDetailMode('pivot')} className={cn('rounded-xl px-3 py-2 text-xs font-black uppercase tracking-[0.14em] transition-all', detailMode === 'pivot' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
                    Site Pivot
                  </button>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Report Results" description="Each report keeps its own independent dataset.">
              {selectedReport.results.length === 0 && !selectedReport.lastRunAt ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <CalendarClock className="h-10 w-10 text-primary/40" />
                  <div>
                    <p className="text-base font-bold text-foreground">No result loaded yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">Execute the report to generate KPI / counter output for this report only.</p>
                  </div>
                </div>
              ) : detailMode === 'table' ? (
                <div>
                  {selectedReport.denseFillNotice?.startsWith('too_many_series:') && (() => {
                    // "too_many_series:NxM" → N series × M timestamps
                    const [, dims] = selectedReport.denseFillNotice.split(':');
                    const [n, m] = (dims || '').split('x');
                    return (
                      <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
                        <strong>Empty hours hidden</strong> — {n} series × {m} timestamps exceeds the 50,000-cell cap.
                        Narrow the scope (one site / one band / shorter range) to get the full timeline with explicit gaps.
                      </div>
                    );
                  })()}
                  <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{pivotData.rows.length} rows · {pivotData.kpis.length} KPI columns · {pivotData.dimCols.length} dimensions</span>
                    {totalPivotPages > 1 && (
                      <div className="flex items-center gap-2">
                        <button disabled={resultPage === 0} onClick={() => setResultPage(p => p - 1)} className="rounded-lg border border-border/60 p-1.5 disabled:opacity-30">
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <span className="font-semibold">Page {resultPage + 1} / {totalPivotPages}</span>
                        <button disabled={resultPage >= totalPivotPages - 1} onClick={() => setResultPage(p => p + 1)} className="rounded-lg border border-border/60 p-1.5 disabled:opacity-30">
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-border/60">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 sticky top-0 z-10">
                        <tr>
                          {pivotData.dimCols.map(d => (
                            <th key={d.key} className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">{d.label}</th>
                          ))}
                          {pivotData.kpis.map(kpi => (
                            <th key={kpi} className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-wider text-primary whitespace-nowrap" title={kpi}>
                              {kpi.length > 20 ? kpi.slice(0, 18) + '…' : kpi}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30 bg-card">
                        {paginatedPivot.length === 0 ? (
                          <tr>
                            <td
                              colSpan={pivotData.dimCols.length + pivotData.kpis.length}
                              className="px-3 py-8 text-center text-xs text-muted-foreground"
                            >
                              No data returned. The selected KPI columns are still listed so you can see exactly what was queried.
                            </td>
                          </tr>
                        ) : paginatedPivot.map((row, idx) => (
                          <tr key={idx} className="hover:bg-primary/5 transition-colors">
                            {pivotData.dimCols.map(d => (
                              <td key={d.key} className="px-3 py-2 text-foreground whitespace-nowrap">
                                {d.key === '_timestamp' ? formatDateTime(row[d.key], selectedReport.timeConfig.granularity) :
                                 d.key === '_vendor' ? <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium', vendorBadge(row[d.key]).bg, vendorBadge(row[d.key]).text, vendorBadge(row[d.key]).border)}>{row[d.key]}</span> :
                                 d.key === '_technology' ? <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium', techBadge(row[d.key]).bg, techBadge(row[d.key]).text, techBadge(row[d.key]).border)}>{row[d.key]}</span> :
                                 <span className="text-muted-foreground truncate max-w-[150px] block" title={row[d.key]}>{row[d.key] || '—'}</span>}
                              </td>
                            ))}
                            {pivotData.kpis.map(kpi => (
                              <td key={kpi} className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                                {row[kpi] != null ? Number(row[kpi]).toFixed(4) : <span className="text-muted-foreground/40">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : detailMode === 'chart' ? (
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                  <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Time Series {chartData && 'kpis' in chartData ? `(${chartData.kpis.length} KPI${chartData.kpis.length > 1 ? 's' : ''})` : ''}
                  </p>
                  <div className="h-[400px]">
                    {chartData && 'points' in chartData && chartData.points.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData.points} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                          <XAxis dataKey="ts" angle={-18} textAnchor="end" interval="preserveStartEnd" height={70} tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          {chartData.kpis.slice(0, 8).map((kpi, i) => {
                            const colors = ['#2563eb', '#0f766e', '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#4f46e5', '#15803d'];
                            return <Line key={kpi} type="monotone" dataKey={kpi} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />;
                          })}
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No chart data available</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Pivot Table</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Rows: <span className="font-semibold text-foreground">Site</span> · Columns: <span className="font-semibold text-foreground">Technology</span> · Aggregation: <span className="font-semibold text-foreground">SUM(Value)</span>
                      </p>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {sitePivotData.rows.length} site{sitePivotData.rows.length > 1 ? 's' : ''} × {sitePivotData.techs.length} techno{sitePivotData.techs.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  {sitePivotData.rows.length === 0 ? (
                    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No data to pivot</div>
                  ) : (
                    <div className="overflow-auto rounded-xl border border-border/60 max-h-[60vh]">
                      <table className="w-full border-collapse text-sm">
                        <thead className="bg-muted/40 sticky top-0 z-10">
                          <tr>
                            <th className="px-3 py-2 text-left text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground border-b border-border/60">Site</th>
                            {sitePivotData.techs.map(t => (
                              <th key={t} className="px-3 py-2 text-right text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground border-b border-l border-border/60">
                                <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium', techBadge(t).bg, techBadge(t).text, techBadge(t).border)}>{t}</span>
                              </th>
                            ))}
                            <th className="px-3 py-2 text-right text-[11px] font-black uppercase tracking-[0.14em] text-foreground border-b border-l border-border/60 bg-muted/60">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50 bg-card">
                          {sitePivotData.rows.map(r => (
                            <tr key={r.site} className="hover:bg-muted/30">
                              <td className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">{r.site}</td>
                              {sitePivotData.techs.map(t => {
                                const v = r.values[t];
                                return (
                                  <td key={t} className="px-3 py-2 text-right font-mono text-xs border-l border-border/40">
                                    {v == null ? <span className="text-muted-foreground">—</span> : v.toFixed(2)}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 text-right font-mono text-xs font-bold text-primary border-l border-border/60 bg-muted/20">{r.total.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-muted/50 sticky bottom-0">
                          <tr>
                            <td className="px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-foreground border-t border-border/60">Total</td>
                            {sitePivotData.techs.map(t => (
                              <td key={t} className="px-3 py-2 text-right font-mono text-xs font-bold text-foreground border-t border-l border-border/60">{(sitePivotData.colTotals[t] ?? 0).toFixed(2)}</td>
                            ))}
                            <td className="px-3 py-2 text-right font-mono text-xs font-black text-primary border-t border-l border-border/60 bg-muted/70">{sitePivotData.grandTotal.toFixed(2)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
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
        perimeterVendor={form.vendors.length === 1 ? form.vendors[0] : undefined}
        perimeterTechno={form.technologies.length === 1 ? form.technologies[0] : undefined}
      />
    </div>
  );
};

export default RanQueryModule;
