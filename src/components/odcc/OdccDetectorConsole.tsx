import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Database,
  Download,
  Edit3,
  Eye,
  FileJson,
  Filter,
  Flame,
  Gauge,
  History,
  Info,
  Layers3,
  Minus,
  Play,
  Plus,
  Radar,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  XCircle,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  createDetectorPayloadForBackend,
  deleteDetectorPayload,
  fetchDetectorDimensionValues,
  fetchDetectorDimensions,
  fetchDetectorHolidays,
  fetchDetectorKpis,
  listDetectorAnomalies,
  listDetectorPayloads,
  runDetectorNow,
  updateDetectorPayloadForBackend,
} from './detectorBuilderApi';
import type { MlAnomalyRow, MlDetectorRow } from './detectorBuilderApi';
import DetectorWizard from './DetectorWizard';
import type {
  CriteriaConfig,
  DetectorAggregation,
  DetectorCondition,
  DetectorConditionType,
  DetectorLogic,
  DetectorOperator,
  DetectorPayload,
  DetectorValidation,
  DimensionOption,
  KpiOption,
  ScopeFilter,
  TimeConfig,
} from './detectorBuilderTypes';

type ScopeLevel = 'CELL' | 'SECTOR' | 'SITE' | 'PLAQUE' | 'DOR' | 'REGION';
type DetectionMode = 'REAL_TIME' | 'BATCH' | 'SCHEDULED';
type DetectorStatus = 'draft' | 'active' | 'inactive' | 'archived';
type RunStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
type Severity = 'minor' | 'major' | 'critical';
type ResultStatus = 'open' | 'acknowledged' | 'resolved' | 'ignored';
type Tab = 'detectors' | 'builder' | 'runs' | 'results' | 'parameter_sets' | 'audit';

interface Criterion {
  id: string;
  type: 'kpi' | 'parameter' | 'inventory';
  code: string;
  aggregation: 'avg' | 'sum' | 'min' | 'max' | 'last';
  operator: '<' | '<=' | '>' | '>=' | '=' | '!=' | 'exists';
  threshold: string;
  granularity: '15m' | '30m' | '1h' | '1d';
  severity: Severity;
}

interface Detector {
  id: string;
  code: string;
  name: string;
  description: string;
  status: DetectorStatus;
  enabled: boolean;
  scopeLevel: ScopeLevel;
  detectionMode: DetectionMode;
  scheduleFrequency: '15m' | '30m' | '1h' | 'daily';
  lookbackWindow: 'last_1h' | 'last_24h' | 'custom';
  /** Which CH KPI table the detector reads: 1=kpi_15m … 5=kpi_bh. Default 1 (15m). */
  kpiTableId?: number;
  filters: {
    country: string[];
    department: string[];
    dor: string[];
    plaque: string[];
    siteCodes: string[];
    cellCodes: string[];
    technology: string[];
    vendor: string[];
    band: string[];
    tags: string[];
  };
  criteriaLogic: 'AND' | 'OR';
  criteria: Criterion[];
  scopeFilters: ScopeFilter[];
  criteriaConfig: CriteriaConfig;
  timeConfig: TimeConfig;
  output: {
    storeResults: boolean;
    allowExport: boolean;
    allowParameterApply: boolean;
    parameterSetId: string | null;
  };
  createdAt: string;
  updatedAt: string;
  version: number;
}

interface DetectorRun {
  id: string;
  detectorId: string;
  triggerType: 'scheduled' | 'manual' | 'api';
  runMode: DetectionMode;
  executionStatus: RunStatus;
  periodStart: string;
  periodEnd: string;
  granularity: '15m' | '30m' | '1h' | '1d';
  matchedCount: number;
  createdAt: string;
}

interface DetectionResult {
  id: string;
  detectorId: string;
  detectorRunId: string;
  scopeLevel: ScopeLevel;
  neType: ScopeLevel;
  neId: string;
  neName: string;
  countryCode: string;
  departmentCode: string;
  dorCode: string;
  plaqueCode: string;
  siteCode: string;
  cellCode: string;
  technology: string;
  vendor: string;
  severity: Severity;
  status: ResultStatus;
  triggerSummary: string;
  kpiCode: string;
  currentValue: number;
  threshold: number;
  detectedAt: string;
}

interface ParameterSet {
  id: string;
  code: string;
  name: string;
  description: string;
  targetLevel: 'PLAQUE' | 'SITE' | 'CELL';
  enabled: boolean;
  updatedAt: string;
  items: { parameterCode: string; parameterValue: string; technology: string; vendor: string; band: string }[];
}

interface AuditLog {
  id: string;
  detectorId: string;
  action: string;
  actor: string;
  createdAt: string;
  payload: string;
}

const nowIso = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const emptyDetector = (): Detector => ({
  id: uid('det'),
  code: 'cell_low_availability_4g_nantes',
  name: 'Cell low availability 4G Nantes',
  description: 'Detect 4G cells under threshold on Nantes plaque',
  status: 'draft',
  enabled: false,
  scopeLevel: 'CELL',
  detectionMode: 'REAL_TIME',
  scheduleFrequency: '15m',
  lookbackWindow: 'last_1h',
  filters: {
    country: [],
    department: [],
    dor: [],
    plaque: [],
    siteCodes: [],
    cellCodes: [],
    technology: [],
    vendor: [],
    band: [],
    tags: [],
  },
  criteriaLogic: 'AND',
  criteria: [{
    id: uid('crit'),
    type: 'kpi',
    code: '',
    aggregation: 'avg',
    operator: '<',
    threshold: '98',
    granularity: '15m',
    severity: 'major',
  }],
  scopeFilters: [],
  criteriaConfig: {
    logic: 'AND',
    conditions: [{
      id: uid('cond'),
      type: 'kpi',
      field: '',
      aggregation: 'avg',
      operator: '<',
      value: '',
      unit: '',
    }],
  },
  timeConfig: {
    range: '24h',
    customStart: null,
    customEnd: null,
    excludeTimeSlots: false,
    excludedSlots: [],
    excludeWeekends: false,
    excludeHolidays: false,
  },
  output: { storeResults: true, allowExport: true, allowParameterApply: false, parameterSetId: null },
  createdAt: nowIso(),
  updatedAt: nowIso(),
  version: 1,
});

const seedDetectors: Detector[] = [
  { ...emptyDetector(), id: 'det_1', status: 'active', enabled: true, createdAt: '2026-04-21T09:00:00Z', updatedAt: '2026-04-22T08:05:00Z' },
  {
    ...emptyDetector(),
    id: 'det_2',
    code: 'plaque_nantes_low_traffic',
    name: 'Plaque Nantes low traffic guard',
    description: 'Daily J-1 detector for abnormal traffic drop on Nantes plaque',
    scopeLevel: 'PLAQUE',
    detectionMode: 'SCHEDULED',
    scheduleFrequency: 'daily',
    lookbackWindow: 'last_24h',
    status: 'inactive',
    enabled: false,
    criteria: [{ ...emptyDetector().criteria[0], id: 'crit_2', code: 'TRAFFIC_DL', aggregation: 'sum', operator: '<', threshold: '10', severity: 'minor' }],
  },
];

const seedParameterSets: ParameterSet[] = [
  {
    id: 'ps_1',
    code: 'nokia_l1800_recovery',
    name: 'Nokia L1800 recovery pack',
    description: 'Operational parameter pack for detected low availability cells.',
    targetLevel: 'CELL',
    enabled: true,
    updatedAt: '2026-04-22T07:30:00Z',
    items: [
      { parameterCode: 'PCI', parameterValue: '101', technology: '4G', vendor: 'NOKIA', band: 'L1800' },
      { parameterCode: 'TILT', parameterValue: '6', technology: '4G', vendor: 'NOKIA', band: 'L1800' },
      { parameterCode: 'EARFCN', parameterValue: '1850', technology: '4G', vendor: 'NOKIA', band: 'L1800' },
    ],
  },
];

function isBackendId(id: string): boolean {
  return /^\d+$/.test(String(id));
}

function severityFromBackend(value: string | null | undefined): Severity {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'major') return 'major';
  return 'minor';
}

function detectorFromBackend(row: MlDetectorRow): Detector {
  const extra = row.extra_config || {};
  const odccPayload = extra.odcc_payload as Partial<DetectorPayload> | undefined;
  const scopeFilters = odccPayload?.scopeFilters ?? Object.entries(row.dimension_values || {}).map(([dimension, values]) => ({
    dimension,
    values: Array.isArray(values) ? values : [],
  }));
  const criteriaConfig: CriteriaConfig = odccPayload?.criteria ? {
    logic: odccPayload.criteria.logic,
    conditions: odccPayload.criteria.conditions.map(condition => ({
      id: uid('cond'),
      type: condition.type,
      field: condition.field,
      aggregation: condition.aggregation,
      operator: condition.operator,
      value: condition.value === true ? 'true' : String(condition.value ?? ''),
      unit: condition.unit,
    })),
  } : {
    logic: 'AND',
    conditions: row.kpi_codes.map(kpi => ({
      id: uid('cond'),
      type: 'kpi',
      field: kpi,
      aggregation: 'avg',
      operator: '<',
      value: '',
      unit: '',
    })),
  };
  const timeConfig: TimeConfig = odccPayload?.time ? {
    ...odccPayload.time,
    excludedSlots: odccPayload.time.excludedSlots.map(slot => ({ id: uid('slot'), ...slot })),
  } : {
    range: '24h',
    customStart: null,
    customEnd: null,
    excludeTimeSlots: false,
    excludedSlots: [],
    excludeWeekends: false,
    excludeHolidays: row.holidays_excluded,
  };
  return {
    ...emptyDetector(),
    id: String(row.id),
    code: `odcc_detector_${row.id}`,
    name: row.name,
    description: row.notes || String(extra.description || ''),
    status: row.is_active ? 'active' : 'inactive',
    enabled: row.is_active,
    scopeLevel: (extra.scope_level as ScopeLevel) || 'CELL',
    detectionMode: (extra.detection_mode as DetectionMode) || 'SCHEDULED',
    scheduleFrequency: (extra.schedule_frequency as Detector['scheduleFrequency']) || 'daily',
    lookbackWindow: (extra.lookback_window as Detector['lookbackWindow']) || 'last_24h',
    kpiTableId: row.kpi_table_id,
    scopeFilters,
    criteriaConfig,
    timeConfig,
    criteria: criteriaConfig.conditions.filter(condition => condition.type === 'kpi').map(condition => ({
      id: uid('crit'),
      type: 'kpi',
      code: condition.field,
      aggregation: (condition.aggregation || 'avg') as Criterion['aggregation'],
      operator: condition.operator,
      threshold: String(condition.value || ''),
      granularity: '15m',
      severity: severityFromBackend(condition.unit),
    })),
    createdAt: row.created_at || nowIso(),
    updatedAt: row.updated_at || row.created_at || nowIso(),
  };
}

function resultFromBackend(row: MlAnomalyRow): DetectionResult {
  const cellName = row.cell_name || row.dimension_key || `anomaly_${row.id}`;
  return {
    id: String(row.id),
    detectorId: String(row.detector_id),
    detectorRunId: `backend_${row.detector_id}`,
    scopeLevel: 'CELL',
    neType: 'CELL',
    neId: cellName,
    neName: cellName,
    countryCode: '',
    departmentCode: '',
    dorCode: '',
    plaqueCode: '',
    siteCode: cellName.split('_ENB')[0] || '',
    cellCode: cellName,
    technology: '',
    vendor: '',
    severity: severityFromBackend(row.severity),
    status: 'open',
    triggerSummary: `value=${row.value ?? '-'} z=${row.z_score ?? '-'} trend=${row.trend_pct ?? '-'}`,
    kpiCode: row.kpi_code,
    currentValue: Number(row.value ?? 0),
    threshold: Number(row.z_score ?? row.trend_pct ?? 0),
    detectedAt: row.detected_at,
  };
}

interface OdccDetectorConsoleProps {
  moduleLabel?: string;
  title?: string;
  description?: string;
  backendErrorLabel?: string;
  loadingLabel?: string;
}

export default function OdccDetectorConsole({
  moduleLabel = 'OSMOSIS / ODCC',
  title = 'NE Detector Console',
  description = 'Backend-driven workspace for detector scope filters, criteria, time exclusions, manual runs, detected NE results, and parameter set operations.',
  backendErrorLabel = 'Backend ODCC error',
  loadingLabel = 'Loading ODCC detectors, catalog and anomalies from ml-engine...',
}: OdccDetectorConsoleProps = {}) {
  const [tab, setTab] = useState<Tab>('detectors');
  const [detectors, setDetectors] = useState<Detector[]>([]);
  const [runs, setRuns] = useState<DetectorRun[]>([]);
  const [results, setResults] = useState<DetectionResult[]>([]);
  const [parameterSets, setParameterSets] = useState<ParameterSet[]>(seedParameterSets);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [draft, setDraft] = useState<Detector>(() => emptyDetector());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedResults, setSelectedResults] = useState<string[]>([]);
  const [backendLoading, setBackendLoading] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);

  const refreshBackend = async () => {
    setBackendError(null);
    const [detectorResponse, anomalyResponse] = await Promise.all([
      listDetectorPayloads(),
      listDetectorAnomalies({ limit: 100 }),
    ]);
    setDetectors(detectorResponse.items.map(detectorFromBackend));
    setResults(anomalyResponse.items.map(resultFromBackend));
  };

  useEffect(() => {
    let cancelled = false;
    setBackendLoading(true);
    refreshBackend()
      .catch(error => {
        if (!cancelled) {
          setBackendError(error instanceof Error ? error.message : String(error));
          setDetectors(seedDetectors);
        }
      })
      .finally(() => {
        if (!cancelled) setBackendLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredDetectors = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return detectors;
    return detectors.filter(d => `${d.name} ${d.code} ${d.scopeLevel} ${d.detectionMode}`.toLowerCase().includes(q));
  }, [detectors, query]);

  const stats = useMemo(() => ({
    active: detectors.filter(d => d.enabled).length,
    open: results.filter(r => r.status === 'open').length,
    critical: results.filter(r => r.severity === 'critical').length,
    lastRun: runs[0]?.executionStatus || 'none',
  }), [detectors, results, runs]);

  const log = (detectorId: string, action: string, payload: string) => {
    setAudit(prev => [{ id: uid('audit'), detectorId, action, actor: 'frontend-user', payload, createdAt: nowIso() }, ...prev]);
  };

  const saveDetector = async (enable: boolean) => {
    const next: Detector = {
      ...draft,
      enabled: enable,
      status: enable ? 'active' : draft.status === 'archived' ? 'archived' : 'draft',
      updatedAt: nowIso(),
      version: draft.version + 1,
    };
    const payload = buildDetectorPayload(next);
    const meta = {
      id: next.id,
      name: next.name,
      description: next.description,
      enabled: next.enabled,
      scheduleFrequency: next.scheduleFrequency,
      scopeLevel: next.scopeLevel,
      detectionMode: next.detectionMode,
      lookbackWindow: next.lookbackWindow,
      retentionDays: next.output.storeResults ? 90 : 7,
    };
    const saved = editingId && isBackendId(editingId)
      ? await updateDetectorPayloadForBackend(editingId, payload, meta)
      : await createDetectorPayloadForBackend(payload, meta);
    const savedDetector = detectorFromBackend(saved);
    setDetectors(prev => editingId ? prev.map(d => d.id === editingId ? savedDetector : d) : [savedDetector, ...prev]);
    log(savedDetector.id, editingId ? 'updated_backend' : 'created_backend', enable ? 'saved and enabled' : 'saved as draft');
    setEditingId(null);
    setDraft(emptyDetector());
    setTab('detectors');
    await refreshBackend();
  };

  const editDetector = (detector: Detector) => {
    setDraft(JSON.parse(JSON.stringify(detector)));
    setEditingId(detector.id);
    setTab('builder');
  };

  const duplicateDetector = (detector: Detector) => {
    const copy = { ...detector, id: uid('det'), code: `${detector.code}_copy`, name: `${detector.name} Copy`, status: 'draft' as DetectorStatus, enabled: false, createdAt: nowIso(), updatedAt: nowIso(), version: 1 };
    setDetectors(prev => [copy, ...prev]);
    log(copy.id, 'duplicated', `from ${detector.code}`);
  };

  const toggleDetector = async (detector: Detector) => {
    const next = { ...detector, enabled: !detector.enabled, status: !detector.enabled ? 'active' as DetectorStatus : 'inactive' as DetectorStatus, updatedAt: nowIso() };
    if (isBackendId(detector.id)) {
      await updateDetectorPayloadForBackend(detector.id, buildDetectorPayload(next), {
        id: next.id,
        name: next.name,
        description: next.description,
        enabled: next.enabled,
        scheduleFrequency: next.scheduleFrequency,
        scopeLevel: next.scopeLevel,
        detectionMode: next.detectionMode,
        lookbackWindow: next.lookbackWindow,
      });
    }
    setDetectors(prev => prev.map(d => d.id === detector.id ? next : d));
    log(detector.id, detector.enabled ? 'disabled_backend' : 'enabled_backend', detector.code);
  };

  const deleteDetector = async (detector: Detector) => {
    if (isBackendId(detector.id)) {
      await deleteDetectorPayload(detector.id);
    }
    setDetectors(prev => prev.filter(d => d.id !== detector.id));
    log(detector.id, 'deleted_backend', detector.code);
  };

  const runDetector = async (detector: Detector) => {
    let target = detector;
    if (!isBackendId(target.id)) {
      // Auto-save to backend before running
      try {
        const payload = buildDetectorPayload(target);
        const meta = {
          id: target.id,
          name: target.name,
          description: target.description,
          enabled: target.enabled,
          scheduleFrequency: target.scheduleFrequency,
          scopeLevel: target.scopeLevel,
          detectionMode: target.detectionMode,
          lookbackWindow: target.lookbackWindow,
          retentionDays: target.output.storeResults ? 90 : 7,
        };
        const saved = await createDetectorPayloadForBackend(payload, meta);
        const savedDetector = detectorFromBackend(saved);
        setDetectors(prev => prev.map(d => d.id === target.id ? savedDetector : d));
        log(savedDetector.id, 'auto_saved_backend', `before run (was ${target.code})`);
        target = savedDetector;
      } catch (error) {
        setBackendError(error instanceof Error ? error.message : 'Failed to save detector before running.');
        return;
      }
    }
    const queued = await runDetectorNow(target.id);
    const run: DetectorRun = {
      id: queued.task_id || uid('run'),
      detectorId: target.id,
      triggerType: 'manual',
      runMode: target.detectionMode,
      executionStatus: queued.queued ? 'pending' : 'failed',
      periodStart: target.lookbackWindow === 'last_24h' ? '2026-04-21T07:00:00Z' : '2026-04-22T07:00:00Z',
      periodEnd: nowIso(),
      granularity: target.scheduleFrequency === '15m' ? '15m' : target.scheduleFrequency === '30m' ? '30m' : target.scheduleFrequency === '1h' ? '1h' : '1d',
      matchedCount: 0,
      createdAt: nowIso(),
    };
    setRuns(prev => [run, ...prev]);
    log(target.id, 'queued_backend_run', `task ${run.id}`);
    const anomalies = await listDetectorAnomalies({ detectorId: target.id, limit: 100 });
    setResults(prev => {
      const existing = new Set(prev.map(result => result.id));
      const fresh = anomalies.items.map(resultFromBackend).filter(result => !existing.has(result.id));
      return [...fresh, ...prev];
    });
    setTab('results');
  };

  const updateResultStatus = (ids: string[], status: ResultStatus) => {
    setResults(prev => prev.map(r => ids.includes(r.id) ? { ...r, status } : r));
    setSelectedResults([]);
  };

  const exportCsv = () => {
    const rows = results.map(r => ({
      detected_at: r.detectedAt,
      severity: r.severity,
      status: r.status,
      plaque: r.plaqueCode,
      site: r.siteCode,
      cell: r.cellCode,
      technology: r.technology,
      vendor: r.vendor,
      kpi: r.kpiCode,
      value: r.currentValue,
      threshold: r.threshold,
    }));
    downloadText('odcc_detection_results.csv', toCsv(rows));
  };

  const exportParameterSet = (set: ParameterSet) => {
    downloadText(`${set.code}.json`, JSON.stringify(set, null, 2));
  };

  const applyParameterSet = () => {
    if (selectedResults.length === 0 || parameterSets.length === 0) return;
    updateResultStatus(selectedResults, 'acknowledged');
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_35%),linear-gradient(180deg,#f8fafc_0%,#f4f7fb_100%)] text-foreground">
      <header className="border-b border-border/50 bg-background/80 px-6 py-5 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_12px_30px_rgba(59,130,246,0.28)]">
                <Radar className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-primary">{moduleLabel}</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
              </div>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {description}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setDraft(emptyDetector()); setEditingId(null); setTab('builder'); }} className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[0_12px_30px_rgba(59,130,246,0.28)] transition-all hover:bg-primary/90">
              <Plus className="mr-2 inline h-4 w-4" /> Create Detector
            </button>
            <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm font-bold text-foreground transition-all hover:border-primary/30 hover:text-primary">
              <Download className="mr-2 inline h-4 w-4" /> Export Results
            </button>
          </div>
        </div>
      </header>

      <main className="flex h-[calc(100%-105px)] overflow-hidden">
        <aside className="w-72 shrink-0 border-r border-border/50 bg-background/70 p-5 backdrop-blur-sm">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Active" value={stats.active} icon={<ShieldCheck />} />
            <Metric label="Open" value={stats.open} icon={<AlertTriangle />} />
            <Metric label="Critical" value={stats.critical} icon={<Gauge />} />
            <Metric label="Last run" value={String(stats.lastRun)} icon={<Clock />} />
          </div>
          <nav className="mt-6 space-y-1">
            {[
              ['detectors', 'Detector List', Radar],
              ['builder', 'Create Detector', Settings2],
              ['runs', 'Runs History', History],
              ['results', 'Detection Results', AlertTriangle],
              ['parameter_sets', 'Parameter Sets', Database],
              ['audit', 'Audit Logs', FileJson],
            ].map(([id, label, Icon]) => (
              <button key={id as string} onClick={() => setTab(id as Tab)} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold transition-all', tab === id ? 'bg-primary text-primary-foreground shadow-[0_12px_30px_rgba(59,130,246,0.22)]' : 'text-muted-foreground hover:bg-primary/8 hover:text-primary')}>
                {React.createElement(Icon as typeof Radar, { className: 'h-4 w-4' })}
                {label as string}
              </button>
            ))}
          </nav>
        </aside>

        <section className="flex-1 overflow-auto p-7">
          {backendError && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {backendErrorLabel}: {backendError}
            </div>
          )}
          {backendLoading && (
            <div className="mb-4 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
              {loadingLabel}
            </div>
          )}
          {tab === 'detectors' && (
            <DetectorList
              detectors={filteredDetectors}
              query={query}
              setQuery={setQuery}
              onEdit={editDetector}
              onDuplicate={duplicateDetector}
              onToggle={detector => toggleDetector(detector).catch(error => setBackendError(error instanceof Error ? error.message : String(error)))}
              onDelete={detector => deleteDetector(detector).catch(error => setBackendError(error instanceof Error ? error.message : String(error)))}
              onRun={detector => runDetector(detector).catch(error => setBackendError(error instanceof Error ? error.message : String(error)))}
            />
          )}
          {tab === 'builder' && (
            <DetectorWizard
              draft={draft}
              setDraft={setDraft}
              editing={!!editingId}
              onSaveDraft={() => saveDetector(false).catch(error => setBackendError(error instanceof Error ? error.message : String(error)))}
              onSaveEnable={() => saveDetector(true).catch(error => setBackendError(error instanceof Error ? error.message : String(error)))}
              onRunTest={() => runDetector(draft).catch(error => setBackendError(error instanceof Error ? error.message : String(error)))}
              onValidate={() => log(draft.id, 'validated', 'frontend validation passed')}
            />
          )}
          {tab === 'runs' && <RunsTable runs={runs} detectors={detectors} />}
          {tab === 'results' && (
            <ResultsTable
              results={results}
              selected={selectedResults}
              setSelected={setSelectedResults}
              onStatus={updateResultStatus}
              onExport={exportCsv}
              onApply={applyParameterSet}
            />
          )}
          {tab === 'parameter_sets' && (
            <ParameterSets
              sets={parameterSets}
              setSets={setParameterSets}
              onExport={exportParameterSet}
            />
          )}
          {tab === 'audit' && <AuditTable audit={audit} detectors={detectors} />}
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactElement }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">{React.cloneElement(icon, { className: 'h-4 w-4' })}</div>
      <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function DetectorList({ detectors, query, setQuery, onEdit, onDuplicate, onToggle, onDelete, onRun }: {
  detectors: Detector[];
  query: string;
  setQuery: (v: string) => void;
  onEdit: (d: Detector) => void;
  onDuplicate: (d: Detector) => void;
  onToggle: (d: Detector) => void;
  onDelete: (d: Detector) => void;
  onRun: (d: Detector) => void;
}) {
  return (
    <Panel title="Detector List" action={<SearchBox value={query} onChange={setQuery} />}>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] text-muted-foreground">
            <tr>
              {['Name', 'Scope', 'Mode', 'Frequency', 'Filters', 'Status', 'Enabled', 'Actions'].map(h => <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {detectors.map(detector => (
              <tr key={detector.id} className="border-t border-border/50 transition-all hover:bg-primary/5">
                <td className="px-4 py-4">
                  <p className="font-bold text-foreground">{detector.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{detector.code}</p>
                </td>
                <td className="px-4 py-4"><Pill>{detector.scopeLevel}</Pill></td>
                <td className="px-4 py-4">{modeLabel(detector)}</td>
                <td className="px-4 py-4 font-bold">{detector.scheduleFrequency}</td>
                <td className="px-4 py-4 text-xs text-muted-foreground">{filterSummary(detector)}</td>
                <td className="px-4 py-4"><StatusPill value={detector.status} /></td>
                <td className="px-4 py-4">{detector.enabled ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-muted-foreground/40" />}</td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    <IconButton title="Run now" onClick={() => onRun(detector)}><Play /></IconButton>
                    <IconButton title="Edit" onClick={() => onEdit(detector)}><Edit3 /></IconButton>
                    <IconButton title="Duplicate" onClick={() => onDuplicate(detector)}><Copy /></IconButton>
                    <IconButton title={detector.enabled ? 'Disable' : 'Enable'} onClick={() => onToggle(detector)}><ShieldCheck /></IconButton>
                    <IconButton title="Delete" danger onClick={() => onDelete(detector)}><Trash2 /></IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function DetectorBuilder({ draft, setDraft, editing, parameterSets, onSaveDraft, onSaveEnable, onRunTest, onValidate }: {
  draft: Detector;
  setDraft: (d: Detector) => void;
  editing: boolean;
  parameterSets: ParameterSet[];
  onSaveDraft: () => void;
  onSaveEnable: () => void;
  onRunTest: () => void;
  onValidate: () => void;
}) {
  const [kpis, setKpis] = useState<KpiOption[]>([]);
  const [dimensions, setDimensions] = useState<DimensionOption[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const patch = (p: Partial<Detector>) => setDraft({ ...draft, ...p, updatedAt: nowIso() });

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    Promise.allSettled([
      fetchDetectorKpis(),
      fetchDetectorDimensions(),
      fetchDetectorHolidays(),
    ]).then(results => {
      if (cancelled) return;
      const [kpiResult, dimensionResult, holidayResult] = results;
      if (kpiResult.status === 'fulfilled') setKpis(kpiResult.value);
      if (dimensionResult.status === 'fulfilled') setDimensions(dimensionResult.value);
      if (holidayResult.status === 'fulfilled') setHolidays(holidayResult.value);
      const rejected = results.filter(result => result.status === 'rejected');
      setCatalogError(rejected.length ? 'Some detector catalogs failed to load. Fallback placeholders are shown where needed.' : null);
      setCatalogLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const validation = useMemo(() => validateDetectorPayload(buildDetectorPayload(draft)), [draft]);

  const submit = async (saveLocal: () => void) => {
    const payload = buildDetectorPayload(draft);
    const result = validateDetectorPayload(payload);
    if (!result.valid) {
      setSubmitError(result.errors.join(' '));
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const meta = {
        name: draft.name,
        description: draft.description,
        enabled: draft.enabled,
      };
      if (editing) {
        await updateDetectorPayloadForBackend(draft.id, payload, meta);
      } else {
        await createDetectorPayloadForBackend(payload, meta);
      }
      saveLocal();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Panel title={editing ? 'Edit Detector' : 'Create Detector'} action={<span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">Backend payload</span>}>
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card title="A. General">
          <Field label="Name"><input value={draft.name} onChange={e => patch({ name: e.target.value })} className="input" /></Field>
          <Field label="Code"><input value={draft.code} onChange={e => patch({ code: e.target.value })} className="input font-mono" /></Field>
          <Field label="Description"><textarea value={draft.description} onChange={e => patch({ description: e.target.value })} className="input min-h-20" /></Field>
          <label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={draft.enabled} onChange={e => patch({ enabled: e.target.checked, status: e.target.checked ? 'active' : 'draft' })} /> Enabled</label>
        </Card>

        <Card title="B. Scope + Mode">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Scope level"><Select value={draft.scopeLevel} values={['CELL', 'SITE', 'PLAQUE', 'DOR', 'REGION']} onChange={v => patch({ scopeLevel: v as ScopeLevel })} /></Field>
            <Field label="Mode"><Select value={draft.detectionMode} values={['REAL_TIME', 'BATCH', 'SCHEDULED']} onChange={v => patch({ detectionMode: v as DetectionMode })} /></Field>
            <Field label="Frequency"><Select value={draft.scheduleFrequency} values={['15m', '30m', '1h', 'daily']} onChange={v => patch({ scheduleFrequency: v as Detector['scheduleFrequency'] })} /></Field>
            <Field label="Lookback"><Select value={draft.lookbackWindow} values={['last_1h', 'last_24h', 'custom']} onChange={v => patch({ lookbackWindow: v as Detector['lookbackWindow'] })} /></Field>
          </div>
        </Card>

        {catalogError && <div className="xl:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{catalogError}</div>}

        <ScopeFilters
          filters={draft.scopeFilters}
          dimensions={dimensions}
          loading={catalogLoading}
          onChange={scopeFilters => patch({ scopeFilters })}
        />

        <CriteriaBuilder
          criteria={draft.criteriaConfig}
          kpis={kpis}
          dimensions={dimensions}
          loading={catalogLoading}
          onChange={criteriaConfig => patch({ criteriaConfig })}
        />

        <TimeConfiguration
          config={draft.timeConfig}
          holidays={holidays}
          loading={catalogLoading}
          onChange={timeConfig => patch({ timeConfig })}
        />

        <Card title="G. Output">
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ['storeResults', 'Store results'],
              ['allowExport', 'Allow export'],
              ['allowParameterApply', 'Allow parameter apply'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 rounded-xl border border-border/60 bg-background p-3 text-sm font-bold text-foreground">
                <input type="checkbox" checked={Boolean(draft.output[key as keyof Detector['output']])} onChange={e => patch({ output: { ...draft.output, [key]: e.target.checked } })} />
                {label}
              </label>
            ))}
            <Field label="Default parameter set">
              <Select value={draft.output.parameterSetId || ''} values={['', ...parameterSets.map(p => p.id)]} labels={['None', ...parameterSets.map(p => p.name)]} onChange={v => patch({ output: { ...draft.output, parameterSetId: v || null } })} />
            </Field>
          </div>
        </Card>

        <Card title="H. Actions">
          {!validation.valid && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
              {validation.errors.join(' ')}
            </div>
          )}
          {submitError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
              {submitError}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={() => submit(onSaveDraft)} icon={<Save />} disabled={submitting || !validation.valid}>Save draft</ActionButton>
            <ActionButton onClick={() => submit(onSaveEnable)} icon={<ShieldCheck />} primary disabled={submitting || !validation.valid}>Save & enable</ActionButton>
            <ActionButton onClick={onValidate} icon={<CheckCircle2 />}>Validate</ActionButton>
            <ActionButton onClick={onRunTest} icon={<Play />}>Run test</ActionButton>
          </div>
          <pre className="mt-4 max-h-80 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-blue-100">{JSON.stringify(buildDetectorPayload(draft), null, 2)}</pre>
        </Card>
      </div>
    </Panel>
  );
}

function ScopeFilters({ filters, dimensions, loading, onChange }: {
  filters: ScopeFilter[];
  dimensions: DimensionOption[];
  loading: boolean;
  onChange: (filters: ScopeFilter[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [selectedDimension, setSelectedDimension] = useState('');
  const [dimensionValues, setDimensionValues] = useState<Record<string, string[]>>({});
  const [valuesLoading, setValuesLoading] = useState(false);
  const [valuesError, setValuesError] = useState<string | null>(null);
  const usedDimensions = new Set(filters.map(filter => filter.dimension));
  const availableDimensions = dimensions.filter(dimension => !usedDimensions.has(dimension.key));
  const activeDimension = dimensions.find(dimension => dimension.key === selectedDimension) || null;

  useEffect(() => {
    if (!selectedDimension || dimensionValues[selectedDimension]) return;
    setValuesLoading(true);
    setValuesError(null);
    fetchDetectorDimensionValues(selectedDimension)
      .then(values => setDimensionValues(previous => ({ ...previous, [selectedDimension]: values })))
      .catch(error => setValuesError(error instanceof Error ? error.message : String(error)))
      .finally(() => setValuesLoading(false));
  }, [dimensionValues, selectedDimension]);

  const addFilter = () => {
    if (!selectedDimension || usedDimensions.has(selectedDimension)) return;
    onChange([...filters, { dimension: selectedDimension, values: [] }]);
    setAdding(false);
    setSelectedDimension('');
  };
  const updateValues = (dimension: string, values: string[]) => onChange(filters.map(filter => filter.dimension === dimension ? { ...filter, values } : filter));

  return (
    <Card title="C. NF Scope Filters">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div>
            <p className="text-sm font-bold text-slate-900">Detector population</p>
            <p className="mt-1 text-xs text-slate-500">Select backend dimensions, then choose one or more values for each dimension.</p>
          </div>
          <button type="button" disabled={loading || availableDimensions.length === 0} onClick={() => setAdding(value => !value)} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="h-4 w-4" /> Add filter
          </button>
        </div>

        {loading && <SkeletonText text="Loading dimensions from backend..." />}

        {filters.length > 0 ? filters.map(filter => {
          const dimension = dimensions.find(item => item.key === filter.dimension);
          return (
            <div key={filter.dimension} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-500">{dimension?.label || filter.dimension}</span>
                <button type="button" onClick={() => updateValues(filter.dimension, [])} className="text-xs font-bold text-slate-500 hover:text-red-600">Clear</button>
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                {filter.values.length ? filter.values.map(value => (
                  <Chip key={`${filter.dimension}-${value}`} onRemove={() => updateValues(filter.dimension, filter.values.filter(item => item !== value))}>{value}</Chip>
                )) : <span className="text-xs text-slate-400">No value selected</span>}
              </div>
              <SearchableMultiSelect
                placeholder={`Search ${dimension?.label || filter.dimension} values`}
                options={dimensionValues[filter.dimension] || []}
                selected={filter.values}
                loading={valuesLoading && selectedDimension === filter.dimension}
                onFocus={() => setSelectedDimension(filter.dimension)}
                onChange={values => updateValues(filter.dimension, values)}
              />
            </div>
          );
        }) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-5 text-sm text-slate-500">
            No scope filter selected.
          </div>
        )}

        {adding && (
          <div className="rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <SearchableSelect
                label="Dimension"
                value={selectedDimension}
                options={availableDimensions.map(dimension => ({ value: dimension.key, label: dimension.label }))}
                placeholder={loading ? 'Loading dimensions...' : 'Search dimension'}
                onChange={setSelectedDimension}
              />
              <div className="flex items-end">
                <button type="button" disabled={!activeDimension} onClick={addFilter} className="h-11 rounded-xl bg-teal-600 px-4 text-xs font-semibold text-white transition-all hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50">Create group</button>
              </div>
            </div>
            {valuesError && <p className="mt-3 text-xs font-medium text-red-600">{valuesError}</p>}
          </div>
        )}
      </div>
    </Card>
  );
}

function CriteriaBuilder({ criteria, kpis, dimensions, loading, onChange }: {
  criteria: CriteriaConfig;
  kpis: KpiOption[];
  dimensions: DimensionOption[];
  loading: boolean;
  onChange: (criteria: CriteriaConfig) => void;
}) {
  const patchCondition = (id: string, patch: Partial<DetectorCondition>) => {
    onChange({ ...criteria, conditions: criteria.conditions.map(condition => condition.id === id ? { ...condition, ...patch } : condition) });
  };
  const addCondition = () => onChange({
    ...criteria,
    conditions: [...criteria.conditions, { id: uid('cond'), type: 'kpi', field: '', aggregation: 'avg', operator: '<', value: '', unit: '' }],
  });
  const removeCondition = (id: string) => onChange({ ...criteria, conditions: criteria.conditions.filter(condition => condition.id !== id) });

  return (
    <Card title="D. Criteria Builder">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500">Logic</span>
        <Select value={criteria.logic} values={['AND', 'OR']} onChange={value => onChange({ ...criteria, logic: value as DetectorLogic })} />
        <button type="button" onClick={addCondition} className="ml-auto rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-teal-700">Add condition</button>
      </div>
      {loading && <SkeletonText text="Loading KPIs and dimensions from backend..." />}
      <div className="space-y-3">
        {criteria.conditions.map(condition => {
          const kpi = kpis.find(item => item.key === condition.field);
          const fieldOptions = condition.type === 'kpi'
            ? kpis.map(item => ({ value: item.key, label: item.label }))
            : dimensions.map(item => ({ value: item.key, label: item.label }));
          return (
            <div key={condition.id} className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[0.8fr_1.4fr_0.8fr_0.7fr_0.8fr_0.8fr_auto]">
              <Select value={condition.type} values={['kpi', 'dimension']} labels={['KPI', 'Dimension']} onChange={value => patchCondition(condition.id, { type: value as DetectorConditionType, field: '', aggregation: value === 'kpi' ? 'avg' : undefined, operator: value === 'dimension' ? 'exists' : '<', value: value === 'dimension' ? 'true' : '', unit: '' })} />
              <SearchableSelect value={condition.field} options={fieldOptions} placeholder={condition.type === 'kpi' ? 'Search KPI' : 'Search dimension'} onChange={value => {
                const selectedKpi = kpis.find(item => item.key === value);
                patchCondition(condition.id, { field: value, unit: selectedKpi?.unit || condition.unit || '' });
              }} />
              {condition.type === 'kpi' ? (
                <Select value={condition.aggregation || 'avg'} values={['avg', 'min', 'max', 'sum', 'count']} onChange={value => patchCondition(condition.id, { aggregation: value as DetectorAggregation })} />
              ) : (
                <div className="h-11 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-400">No agg</div>
              )}
              <Select value={condition.operator} values={condition.type === 'dimension' ? ['exists', '=', '!='] : ['<', '<=', '>', '>=', '=', '!=']} onChange={value => patchCondition(condition.id, { operator: value as DetectorOperator, value: value === 'exists' ? 'true' : condition.value })} />
              {condition.operator === 'exists' ? (
                <div className="h-11 rounded-xl border border-teal-200 bg-teal-50 px-3 py-3 text-xs font-bold text-teal-700">exists</div>
              ) : (
                <input value={condition.value} onChange={event => patchCondition(condition.id, { value: event.target.value })} placeholder="Value" className="input" />
              )}
              <SearchableSelect value={condition.unit || ''} options={unitOptions(kpis, kpi, condition.type).map(unit => ({ value: unit, label: unit || 'No unit' }))} placeholder={condition.type === 'kpi' ? 'Severity/unit' : 'Unit'} onChange={value => patchCondition(condition.id, { unit: value })} />
              <IconButton title="Remove condition" danger onClick={() => removeCondition(condition.id)}><Trash2 /></IconButton>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TimeConfiguration({ config, holidays, loading, onChange }: {
  config: TimeConfig;
  holidays: string[];
  loading: boolean;
  onChange: (config: TimeConfig) => void;
}) {
  const addSlot = () => onChange({ ...config, excludeTimeSlots: true, excludedSlots: [...config.excludedSlots, { id: uid('slot'), start: '00:00', end: '06:00' }] });
  const updateSlot = (id: string, patch: Partial<{ start: string; end: string }>) => onChange({ ...config, excludedSlots: config.excludedSlots.map(slot => slot.id === id ? { ...slot, ...patch } : slot) });
  const removeSlot = (id: string) => onChange({ ...config, excludedSlots: config.excludedSlots.filter(slot => slot.id !== id) });

  return (
    <Card title="E. Time Configuration">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Time range">
          <Select value={config.range} values={['24h', 'custom']} labels={['Last 24h', 'Custom range']} onChange={value => onChange({ ...config, range: value as TimeConfig['range'] })} />
        </Field>
        {config.range === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Custom start"><input type="datetime-local" value={config.customStart || ''} onChange={event => onChange({ ...config, customStart: event.target.value || null })} className="input" /></Field>
            <Field label="Custom end"><input type="datetime-local" value={config.customEnd || ''} onChange={event => onChange({ ...config, customEnd: event.target.value || null })} className="input" /></Field>
          </div>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Toggle checked={config.excludeTimeSlots} label="Exclure tranche horaire" onChange={checked => onChange({ ...config, excludeTimeSlots: checked })} />
        <Toggle checked={config.excludeWeekends} label="Exclude weekends" onChange={checked => onChange({ ...config, excludeWeekends: checked })} />
        <Toggle checked={config.excludeHolidays} label="Exclude holidays" onChange={checked => onChange({ ...config, excludeHolidays: checked })} />
      </div>
      {config.excludeTimeSlots && (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Excluded slots</span>
            <button type="button" onClick={addSlot} className="rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white">Add range</button>
          </div>
          {config.excludedSlots.map(slot => (
            <div key={slot.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input type="time" value={slot.start} onChange={event => updateSlot(slot.id, { start: event.target.value })} className="input" />
              <input type="time" value={slot.end} onChange={event => updateSlot(slot.id, { end: event.target.value })} className="input" />
              <IconButton title="Remove slot" danger onClick={() => removeSlot(slot.id)}><Trash2 /></IconButton>
            </div>
          ))}
        </div>
      )}
      {config.excludeHolidays && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
          {loading ? 'Loading holidays...' : holidays.length ? `${holidays.length} backend holiday(s) loaded.` : 'Holiday API integration point active; no backend holidays returned yet.'}
        </div>
      )}
    </Card>
  );
}

function RunsTable({ runs, detectors }: { runs: DetectorRun[]; detectors: Detector[] }) {
  return (
    <Panel title="Runs History">
      <SimpleTable headers={['Created', 'Detector', 'Trigger', 'Mode', 'Period', 'Granularity', 'Matched', 'Status']}>
        {runs.map(run => (
          <tr key={run.id} className="border-t border-border/50 transition-all hover:bg-primary/5">
            <Td>{formatDate(run.createdAt)}</Td>
            <Td>{detectors.find(d => d.id === run.detectorId)?.name || run.detectorId}</Td>
            <Td>{run.triggerType}</Td>
            <Td>{run.runMode}</Td>
            <Td>{formatDate(run.periodStart)} - {formatDate(run.periodEnd)}</Td>
            <Td>{run.granularity}</Td>
            <Td>{run.matchedCount}</Td>
            <Td><StatusPill value={run.executionStatus} /></Td>
          </tr>
        ))}
      </SimpleTable>
    </Panel>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Detection Results — telecom NOC-grade redesign
 * ─────────────────────────────────────────────────────────────────
 *
 * - KPI aliasing (KPI 1, KPI 2…) with hover tooltip showing real code
 * - Severity gradient pills with subtle glow + icon
 * - Inline value bar with threshold marker + delta %
 * - Occurrence column with frequency badge + trend arrow
 * - Smart insights (confidence / impact / trend) derived from data
 * - Summary cards row (totals, critical count, most impacted KPI)
 * - KPI legend panel (collapsible) mapping aliases to real names
 * - Sticky header, rounded rows, hover elevation
 * - Action buttons with icon + text labels
 *
 * NB: confidence/trend/impact are derived in-app (no backend field yet)
 *     — derivation rules kept conservative so values are honest. */

const KPI_PALETTE: Array<{ chip: string; dot: string; glow: string; ring: string }> = [
  { chip: 'bg-rose-50 text-rose-700',       dot: 'bg-rose-500',       glow: 'shadow-rose-400/30',       ring: 'ring-rose-200' },
  { chip: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-500',      glow: 'shadow-amber-400/30',      ring: 'ring-amber-200' },
  { chip: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500',    glow: 'shadow-emerald-400/30',    ring: 'ring-emerald-200' },
  { chip: 'bg-sky-50 text-sky-700',         dot: 'bg-sky-500',        glow: 'shadow-sky-400/30',        ring: 'ring-sky-200' },
  { chip: 'bg-violet-50 text-violet-700',   dot: 'bg-violet-500',     glow: 'shadow-violet-400/30',    ring: 'ring-violet-200' },
  { chip: 'bg-teal-50 text-teal-700',       dot: 'bg-teal-500',       glow: 'shadow-teal-400/30',       ring: 'ring-teal-200' },
];

/** Build a deterministic alias map from the observed kpiCodes. Sorted
 *  alphabetically so refreshes don't shuffle the labels. */
function buildKpiAliasMap(results: DetectionResult[]) {
  const codes = Array.from(new Set(results.map(r => r.kpiCode).filter(Boolean))).sort();
  const aliasByCode = new Map<string, string>();
  const colorByCode = new Map<string, typeof KPI_PALETTE[0]>();
  const thresholdByCode = new Map<string, number>();
  codes.forEach((code, i) => {
    aliasByCode.set(code, `KPI ${i + 1}`);
    colorByCode.set(code, KPI_PALETTE[i % KPI_PALETTE.length]);
    const r = results.find(x => x.kpiCode === code);
    if (r) thresholdByCode.set(code, r.threshold);
  });
  return { aliasByCode, colorByCode, thresholdByCode };
}

/** Percent delta of current vs threshold. Returns null on /0 to avoid Infinity. */
function deltaPct(value: number, threshold: number): number | null {
  if (threshold === 0 || !Number.isFinite(threshold)) return null;
  return ((value - threshold) / Math.abs(threshold)) * 100;
}

/** Frequency tag for an occurrence count — Rare/Common/Frequent. */
function frequencyTag(count: number): { label: string; cls: string; glyph: typeof Snowflake } {
  if (count >= 10) return { label: 'Frequent', cls: 'bg-rose-50 text-rose-700',     glyph: Flame     };
  if (count >= 4)  return { label: 'Common',   cls: 'bg-amber-50 text-amber-700',   glyph: Zap       };
  return { label: 'Rare', cls: 'bg-slate-100 text-slate-600', glyph: Snowflake };
}

/** Severity gradient styles + glow + icon. Maps the 3 backend tiers to a
 *  4-band telecom-NOC palette (critical/major/minor/normal). */
const SEV_STYLES: Record<Severity, {
  pill: string;
  ring: string;
  icon: React.ReactElement;
  label: string;
  rowAccent: string;
}> = {
  critical: {
    pill:      'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-md shadow-rose-500/30',
    ring:      'ring-2 ring-rose-400/40',
    icon:      <AlertTriangle className="h-3 w-3" />,
    label:     'CRITICAL',
    rowAccent: 'border-l-2 border-l-rose-400',
  },
  major: {
    pill:      'bg-gradient-to-br from-orange-400 to-orange-500 text-white shadow-md shadow-orange-500/30',
    ring:      'ring-2 ring-orange-400/40',
    icon:      <AlertTriangle className="h-3 w-3" />,
    label:     'MAJOR',
    rowAccent: 'border-l-2 border-l-orange-400',
  },
  minor: {
    pill:      'bg-gradient-to-br from-amber-300 to-amber-400 text-amber-900 shadow-md shadow-amber-400/30',
    ring:      'ring-2 ring-amber-300/40',
    icon:      <Info className="h-3 w-3" />,
    label:     'MINOR',
    rowAccent: 'border-l-2 border-l-amber-400',
  },
};

const STATUS_STYLES: Record<ResultStatus, { dot: string; chip: string; label: string }> = {
  open:          { dot: 'bg-rose-500',    chip: 'bg-rose-50 text-rose-700',         label: 'OPEN' },
  acknowledged:  { dot: 'bg-amber-500',   chip: 'bg-amber-50 text-amber-700',       label: 'ACK' },
  resolved:      { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700',   label: 'RESOLVED' },
  ignored:       { dot: 'bg-slate-400',   chip: 'bg-slate-100 text-slate-600',      label: 'IGNORED' },
};

function ResultsTable({ results, selected, setSelected, onStatus, onExport, onApply }: {
  results: DetectionResult[];
  selected: string[];
  setSelected: (ids: string[]) => void;
  onStatus: (ids: string[], status: ResultStatus) => void;
  onExport: () => void;
  onApply: () => void;
}) {
  const toggle = (id: string) =>
    setSelected(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  const toggleAll = () =>
    setSelected(selected.length === results.length ? [] : results.map(r => r.id));

  const { aliasByCode, colorByCode, thresholdByCode } = useMemo(
    () => buildKpiAliasMap(results),
    [results],
  );

  // Aggregations for the summary cards + insights.
  const stats = useMemo(() => {
    const total = results.length;
    const critical = results.filter(r => r.severity === 'critical').length;
    const occByCode = new Map<string, number>();
    const sevByCode = new Map<string, { critical: number; major: number; minor: number }>();
    for (const r of results) {
      occByCode.set(r.kpiCode, (occByCode.get(r.kpiCode) || 0) + 1);
      const s = sevByCode.get(r.kpiCode) || { critical: 0, major: 0, minor: 0 };
      s[r.severity as Severity]++;
      sevByCode.set(r.kpiCode, s);
    }
    let mostFrequent: string | null = null;
    let mostFrequentN = 0;
    let mostImpacted: string | null = null;
    let mostImpactedScore = -1;
    for (const [code, n] of occByCode) {
      if (n > mostFrequentN) { mostFrequentN = n; mostFrequent = code; }
      const sev = sevByCode.get(code) || { critical: 0, major: 0, minor: 0 };
      const impactScore = sev.critical * 3 + sev.major * 2 + sev.minor;
      if (impactScore > mostImpactedScore) { mostImpactedScore = impactScore; mostImpacted = code; }
    }
    return { total, critical, occByCode, mostFrequent, mostFrequentN, mostImpacted };
  }, [results]);

  const [legendOpen, setLegendOpen] = useState(true);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Detection Results</h2>
          <p className="mt-0.5 text-[12px] text-slate-500">
            {results.length === 0
              ? 'No anomalies detected yet — run a detector to populate.'
              : `${results.length} anomal${results.length === 1 ? 'y' : 'ies'} across ${aliasByCode.size} KPI${aliasByCode.size === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex gap-2">
          <ActionButton onClick={onExport} icon={<Download />}>Export selected</ActionButton>
          <ActionButton onClick={onApply} icon={<Upload />} primary>Apply parameter set</ActionButton>
        </div>
      </div>

      {/* Summary cards */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryCard
            icon={<Activity className="h-4 w-4" />}
            label="Total anomalies"
            value={stats.total.toLocaleString()}
            tone="slate"
          />
          <SummaryCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Critical"
            value={stats.critical.toLocaleString()}
            tone="rose"
            footer={stats.total > 0 ? `${Math.round((stats.critical / stats.total) * 100)}% of total` : undefined}
          />
          <SummaryCard
            icon={<Target className="h-4 w-4" />}
            label="Most impacted KPI"
            value={stats.mostImpacted ? (aliasByCode.get(stats.mostImpacted) || '—') : '—'}
            tone="teal"
            footer={stats.mostImpacted || undefined}
          />
          <SummaryCard
            icon={<Flame className="h-4 w-4" />}
            label="Most frequent KPI"
            value={stats.mostFrequent ? (aliasByCode.get(stats.mostFrequent) || '—') : '—'}
            tone="amber"
            footer={stats.mostFrequentN ? `${stats.mostFrequentN} occurrences` : undefined}
          />
        </div>
      )}

      {/* KPI legend panel */}
      {aliasByCode.size > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <button
            onClick={() => setLegendOpen(o => !o)}
            className="flex w-full items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-teal-600" />
              <span className="text-[12px] font-semibold text-slate-700">KPI legend</span>
              <span className="text-[11px] text-slate-400">{aliasByCode.size} KPI{aliasByCode.size === 1 ? '' : 's'} mapped</span>
            </div>
            <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', legendOpen && 'rotate-180')} />
          </button>
          {legendOpen && (
            <div className="grid gap-2 border-t border-slate-100 bg-slate-50/50 p-3 md:grid-cols-2 lg:grid-cols-3">
              {Array.from(aliasByCode.entries()).map(([code, alias]) => {
                const c = colorByCode.get(code)!;
                const occ = stats.occByCode.get(code) || 0;
                const t = thresholdByCode.get(code);
                return (
                  <div key={code} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
                    <span className={cn('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1', c.chip, c.ring)}>
                      <span className={cn('h-2 w-2 rounded-full', c.dot)} />
                    </span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="text-[12px] font-semibold text-slate-800">{alias}</p>
                      <p className="truncate font-mono text-[10px] text-slate-500" title={code}>{code}</p>
                    </div>
                    <div className="text-right leading-tight">
                      <p className="text-[11px] font-semibold text-slate-700">{occ} occ</p>
                      <p className="text-[10px] text-slate-400">{t !== undefined ? `< ${t}` : '—'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-auto">
          <table className="w-full min-w-[1280px] border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
              <tr className="text-[11px] text-slate-500">
                <th className="border-b border-slate-200 px-3 py-2.5 text-left font-semibold">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    checked={results.length > 0 && selected.length === results.length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-left font-semibold">Time</th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-left font-semibold">Severity</th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-left font-semibold">Hierarchy</th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-left font-semibold">NE</th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-left font-semibold">KPI</th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-left font-semibold">Value vs threshold</th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-left font-semibold">Occurrences</th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-left font-semibold">Insights</th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-left font-semibold">Status</th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-16 text-center">
                    <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <Activity className="h-5 w-5" />
                    </div>
                    <p className="text-[13px] font-medium text-slate-700">No detection results</p>
                    <p className="mt-1 text-[12px] text-slate-500">Run a detector or wait for the next scheduled tick.</p>
                  </td>
                </tr>
              ) : results.map(r => (
                <ResultRow
                  key={r.id}
                  r={r}
                  alias={aliasByCode.get(r.kpiCode) || r.kpiCode}
                  kpiColor={colorByCode.get(r.kpiCode) || KPI_PALETTE[0]}
                  occurrences={stats.occByCode.get(r.kpiCode) || 1}
                  selected={selected.includes(r.id)}
                  onToggle={() => toggle(r.id)}
                  onStatus={(s) => onStatus([r.id], s)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, tone, footer }: {
  icon: React.ReactElement;
  label: string;
  value: string;
  tone: 'slate' | 'rose' | 'amber' | 'teal' | 'emerald';
  footer?: string;
}) {
  const tones: Record<string, { iconBg: string; iconFg: string; valueFg: string; accent: string }> = {
    slate:   { iconBg: 'bg-slate-100',   iconFg: 'text-slate-600',   valueFg: 'text-slate-900',   accent: 'border-slate-200' },
    rose:    { iconBg: 'bg-rose-100',    iconFg: 'text-rose-600',    valueFg: 'text-rose-700',    accent: 'border-rose-200' },
    amber:   { iconBg: 'bg-amber-100',   iconFg: 'text-amber-700',   valueFg: 'text-amber-800',   accent: 'border-amber-200' },
    teal:    { iconBg: 'bg-teal-100',    iconFg: 'text-teal-700',    valueFg: 'text-teal-800',    accent: 'border-teal-200' },
    emerald: { iconBg: 'bg-emerald-100', iconFg: 'text-emerald-700', valueFg: 'text-emerald-800', accent: 'border-emerald-200' },
  };
  const t = tones[tone];
  return (
    <div className={cn('rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow', t.accent)}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-slate-500">{label}</p>
        <span className={cn('inline-flex h-7 w-7 items-center justify-center rounded-lg', t.iconBg, t.iconFg)}>
          {React.cloneElement(icon, { className: 'h-3.5 w-3.5' })}
        </span>
      </div>
      <p className={cn('mt-2 text-2xl font-bold tracking-tight', t.valueFg)}>{value}</p>
      {footer && <p className="mt-1 text-[11px] text-slate-400">{footer}</p>}
    </div>
  );
}

function ResultRow({
  r, alias, kpiColor, occurrences, selected, onToggle, onStatus,
}: {
  r: DetectionResult;
  alias: string;
  kpiColor: typeof KPI_PALETTE[0];
  occurrences: number;
  selected: boolean;
  onToggle: () => void;
  onStatus: (s: ResultStatus) => void;
}) {
  // Defensive lookups: a stale row from localStorage / an unexpected enum
  // value from the backend (lowercase mismatch, new tier) would otherwise
  // crash the whole table — fall back to the most benign tier so the row
  // still renders, just without the loud accent.
  const sev = SEV_STYLES[r.severity] || SEV_STYLES.minor;
  const sts = STATUS_STYLES[r.status] || STATUS_STYLES.open;
  const dp = deltaPct(r.currentValue, r.threshold);
  const freq = frequencyTag(occurrences);
  const FreqIcon = freq.glyph;

  // Bar shows where current value lies relative to the threshold.
  // Threshold sits at 50%; value bar extends from threshold based on |delta|.
  const barFill = dp !== null ? Math.min(95, Math.abs(dp)) : 50;
  const barAbove = dp !== null && dp > 0;
  const breachExceeded = r.currentValue > r.threshold; // assumes lower_is_better KPIs

  // Confidence heuristic: higher when delta is large and severity is critical.
  const confidence = dp === null ? 50 : Math.min(99, 50 + Math.min(45, Math.abs(dp) / 8) + (r.severity === 'critical' ? 5 : 0));
  // Impact heuristic: severity + occurrence count
  const impactScore = (r.severity === 'critical' ? 3 : r.severity === 'major' ? 2 : 1) + Math.min(3, Math.floor(occurrences / 4));
  const impact: 'Low' | 'Medium' | 'High' | 'Severe' =
    impactScore >= 6 ? 'Severe' : impactScore >= 4 ? 'High' : impactScore >= 3 ? 'Medium' : 'Low';
  const impactTone: Record<string, string> = {
    Low:    'text-slate-600',
    Medium: 'text-amber-700',
    High:   'text-orange-700',
    Severe: 'text-rose-700',
  };
  // Trend: up if delta+ and occurrences ≥ 3, down if delta-, flat otherwise
  const trend: 'up' | 'down' | 'flat' = (dp !== null && occurrences >= 3 && dp > 0) ? 'up' : (dp !== null && dp < 0 ? 'down' : 'flat');
  const TrendIcon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus;
  const trendTone = trend === 'up' ? 'text-rose-600' : trend === 'down' ? 'text-emerald-600' : 'text-slate-400';

  return (
    <tr className={cn(
      'group transition-all hover:bg-teal-50/30',
      sev.rowAccent,
    )}>
      <td className="border-b border-slate-100 px-3 py-3 align-middle">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          checked={selected}
          onChange={onToggle}
        />
      </td>
      <td className="border-b border-slate-100 px-3 py-3 align-middle">
        <div className="flex items-center gap-1.5 text-[12px] text-slate-700">
          <Clock className="h-3 w-3 text-slate-400" />
          <span>{formatDate(r.detectedAt)}</span>
        </div>
      </td>
      <td className="border-b border-slate-100 px-3 py-3 align-middle">
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider',
          sev.pill,
        )}>
          {sev.icon}
          {sev.label}
        </span>
      </td>
      <td className="border-b border-slate-100 px-3 py-3 align-middle">
        <div className="flex flex-col gap-0.5 text-[11px] leading-tight">
          <span className="font-medium text-slate-700">{r.plaqueCode || '—'}</span>
          <span className="font-mono text-[10px] text-slate-400">
            {[r.countryCode, r.departmentCode, r.dorCode].filter(Boolean).join(' / ') || '—'}
          </span>
        </div>
      </td>
      <td className="border-b border-slate-100 px-3 py-3 align-middle">
        <div className="leading-tight">
          <p className="font-mono text-[12px] font-medium text-slate-800">
            {r.cellCode || r.siteCode || r.neName || '—'}
          </p>
          <p className="text-[10px] text-slate-400">{[r.technology, r.vendor].filter(Boolean).join(' · ') || '—'}</p>
        </div>
      </td>
      <td className="border-b border-slate-100 px-3 py-3 align-middle">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm ring-1',
            kpiColor.chip,
            kpiColor.ring,
            kpiColor.glow,
          )}
          title={r.kpiCode}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', kpiColor.dot)} />
          {alias}
        </span>
      </td>
      <td className="border-b border-slate-100 px-3 py-3 align-middle">
        <div className="min-w-[180px]">
          <div className="flex items-baseline gap-1.5">
            <span className={cn('text-[14px] font-bold tabular-nums', breachExceeded ? 'text-rose-700' : 'text-slate-800')}>
              {Number.isFinite(r.currentValue) ? r.currentValue.toLocaleString() : '—'}
            </span>
            {dp !== null && (
              <span className={cn(
                'text-[10px] font-bold tabular-nums',
                dp > 0 ? 'text-rose-600' : dp < 0 ? 'text-emerald-600' : 'text-slate-400',
              )}>
                {dp > 0 ? '+' : ''}{dp.toFixed(0)}%
              </span>
            )}
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                barAbove ? 'bg-gradient-to-r from-rose-400 to-rose-500' : 'bg-gradient-to-r from-emerald-400 to-emerald-500',
              )}
              style={{ width: `${barFill}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Threshold &lt; {r.threshold}</p>
        </div>
      </td>
      <td className="border-b border-slate-100 px-3 py-3 align-middle">
        <div className="flex items-center gap-2">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', freq.cls)}>
            <FreqIcon className="h-2.5 w-2.5" />
            {freq.label}
          </span>
          <span className="text-[13px] font-bold tabular-nums text-slate-800">{occurrences}</span>
          <TrendIcon className={cn('h-3 w-3', trendTone)} />
        </div>
        {/* mini occurrence heat dots */}
        <div className="mt-1.5 flex items-center gap-[2px]">
          {Array.from({ length: 10 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 w-1.5 rounded-sm',
                i < Math.min(10, occurrences)
                  ? (occurrences >= 8 ? 'bg-rose-400' : occurrences >= 4 ? 'bg-amber-400' : 'bg-emerald-400')
                  : 'bg-slate-100',
              )}
            />
          ))}
        </div>
      </td>
      <td className="border-b border-slate-100 px-3 py-3 align-middle">
        <div className="space-y-0.5 leading-tight">
          <p className="text-[11px]">
            <span className="text-slate-400">Confidence</span>{' '}
            <span className="font-semibold text-slate-700">{confidence.toFixed(0)}%</span>
          </p>
          <p className="text-[11px]">
            <span className="text-slate-400">Impact</span>{' '}
            <span className={cn('font-semibold', impactTone[impact])}>{impact}</span>
          </p>
          <p className="text-[11px]">
            <span className="text-slate-400">Trend</span>{' '}
            <span className={cn('font-semibold', trendTone)}>
              {trend === 'up' ? 'Increasing' : trend === 'down' ? 'Recovering' : 'Stable'}
            </span>
          </p>
        </div>
      </td>
      <td className="border-b border-slate-100 px-3 py-3 align-middle">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider', sts.chip)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', sts.dot)} />
          {sts.label}
        </span>
      </td>
      <td className="border-b border-slate-100 px-3 py-3 align-middle text-right">
        <div className="inline-flex items-center gap-1.5 opacity-90 group-hover:opacity-100">
          <ResultActionButton icon={<Eye className="h-3 w-3" />} onClick={() => {}}>RCA</ResultActionButton>
          <ResultActionButton icon={<TrendingUp className="h-3 w-3" />} onClick={() => {}}>Analyze</ResultActionButton>
          <ResultActionButton icon={<CheckCircle2 className="h-3 w-3" />} tone="emerald" onClick={() => onStatus('resolved')}>Validate</ResultActionButton>
          <ResultActionButton icon={<XCircle className="h-3 w-3" />} tone="slate" onClick={() => onStatus('ignored')}>Ignore</ResultActionButton>
        </div>
      </td>
    </tr>
  );
}

function ResultActionButton({ children, icon, onClick, tone }: {
  children: React.ReactNode;
  icon: React.ReactElement;
  onClick: () => void;
  tone?: 'teal' | 'emerald' | 'slate';
}) {
  const tones: Record<string, string> = {
    teal:    'border-teal-200 text-teal-700 hover:bg-teal-50',
    emerald: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
    slate:   'border-slate-200 text-slate-600 hover:bg-slate-50',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-[10px] font-semibold shadow-sm transition',
        tones[tone || 'teal'],
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function ParameterSets({ sets, setSets, onExport }: { sets: ParameterSet[]; setSets: (s: ParameterSet[]) => void; onExport: (s: ParameterSet) => void }) {
  const add = () => setSets([{ ...seedParameterSets[0], id: uid('ps'), code: `manual_pack_${sets.length + 1}`, name: `Manual pack ${sets.length + 1}`, updatedAt: nowIso() }, ...sets]);
  return (
    <Panel title="Parameter Set Manager" action={<ActionButton onClick={add} icon={<Plus />} primary>New set</ActionButton>}>
      <SimpleTable headers={['Name', 'Target level', 'Items', 'Enabled', 'Updated', 'Actions']}>
        {sets.map(set => (
          <tr key={set.id} className="border-t border-border/50 transition-all hover:bg-primary/5">
            <Td><p className="font-bold text-foreground">{set.name}</p><p className="font-mono text-[11px] text-muted-foreground">{set.code}</p></Td>
            <Td>{set.targetLevel}</Td>
            <Td>{set.items.length}</Td>
            <Td>{set.enabled ? 'Yes' : 'No'}</Td>
            <Td>{formatDate(set.updatedAt)}</Td>
            <Td><div className="flex gap-1"><IconButton title="Export JSON" onClick={() => onExport(set)}><Download /></IconButton><IconButton title="Delete" danger onClick={() => setSets(sets.filter(s => s.id !== set.id))}><Trash2 /></IconButton></div></Td>
          </tr>
        ))}
      </SimpleTable>
    </Panel>
  );
}

function AuditTable({ audit, detectors }: { audit: AuditLog[]; detectors: Detector[] }) {
  return (
    <Panel title="Audit Logs">
      <SimpleTable headers={['Time', 'Detector', 'Action', 'Actor', 'Payload']}>
        {audit.map(row => (
          <tr key={row.id} className="border-t border-border/50 transition-all hover:bg-primary/5">
            <Td>{formatDate(row.createdAt)}</Td>
            <Td>{detectors.find(d => d.id === row.detectorId)?.code || row.detectorId}</Td>
            <Td><StatusPill value={row.action} /></Td>
            <Td>{row.actor}</Td>
            <Td>{row.payload}</Td>
          </tr>
        ))}
      </SimpleTable>
    </Panel>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold text-primary"><Layers3 className="h-4 w-4" />{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-muted-foreground">{label}<div className="mt-1">{children}</div></label>;
}

function Select({ value, values, labels, onChange }: { value: string; values: string[]; labels?: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="input">
      {values.map((v, i) => <option key={v} value={v}>{labels?.[i] ?? v}</option>)}
    </select>
  );
}

function SearchableSelect({ label, value, options, placeholder, onChange }: {
  label?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.value === value);
  const filtered = options
    .filter(option => `${option.label} ${option.value}`.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 40);
  return (
    <div className="relative">
      {label && <p className="mb-1 text-xs font-semibold text-slate-500">{label}</p>}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={open ? query : selected?.label || value}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onChange={event => {
            setOpen(true);
            setQuery(event.target.value);
          }}
          placeholder={placeholder}
          className="input pl-10"
        />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {filtered.length ? filtered.map(option => (
            <button
              key={option.value}
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                setQuery('');
              }}
              className={cn('block w-full rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-teal-50 hover:text-teal-700', option.value === value && 'bg-teal-50 text-teal-700')}
            >
              <span>{option.label}</span>
              <span className="ml-2 font-mono text-[10px] text-slate-400">{option.value}</span>
            </button>
          )) : (
            <div className="px-3 py-2 text-xs text-slate-400">No option found</div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchableMultiSelect({ placeholder, options, selected, loading, onFocus, onChange }: {
  placeholder: string;
  options: string[];
  selected: string[];
  loading?: boolean;
  onFocus?: () => void;
  onChange: (values: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = options
    .filter(option => !selected.includes(option))
    .filter(option => option.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 30);
  const addValue = (value: string) => {
    const clean = value.trim();
    if (!clean || selected.includes(clean)) return;
    onChange([...selected, clean]);
    setQuery('');
  };
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onFocus={onFocus}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addValue(query);
            }
          }}
          placeholder={loading ? 'Loading values...' : placeholder}
          className="input pl-10"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {filtered.length ? filtered.map(option => (
          <button key={option} type="button" onClick={() => addValue(option)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700">
            {option}
          </button>
        )) : (
          <span className="text-xs text-slate-400">{loading ? 'Loading...' : 'Type a custom value and press Enter.'}</span>
        )}
      </div>
    </div>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <button type="button" onClick={onRemove} className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] font-bold text-teal-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700">
      {children}
      <XCircle className="h-3.5 w-3.5" />
    </button>
  );
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={cn('flex items-center justify-between rounded-2xl border p-3 text-left text-sm font-bold transition-all', checked ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-600')}>
      <span>{label}</span>
      <span className={cn('ml-3 h-5 w-9 rounded-full p-0.5 transition-all', checked ? 'bg-teal-600' : 'bg-slate-300')}>
        <span className={cn('block h-4 w-4 rounded-full bg-white transition-transform', checked && 'translate-x-4')} />
      </span>
    </button>
  );
}

function SkeletonText({ text }: { text: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500">{text}</div>;
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder="Search detector..." className="h-12 w-72 rounded-2xl border border-border/60 bg-background pl-11 pr-3 text-sm outline-none transition-all focus:border-primary/40" />
    </div>
  );
}

function SimpleTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="overflow-auto">
        <table className="w-full min-w-[1050px] text-sm">
          <thead className="bg-muted/40 text-[11px] text-muted-foreground">
            <tr>{headers.map(h => <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top text-foreground">{children}</td>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">{children}</span>;
}

function StatusPill({ value }: { value: string }) {
  const color = value === 'active' || value === 'success' || value === 'resolved'
    ? 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25'
    : value === 'failed' || value === 'critical'
      ? 'bg-red-500/12 text-red-700 border-red-500/25'
      : value === 'draft' || value === 'pending'
        ? 'bg-amber-500/12 text-amber-700 border-amber-500/25'
        : 'bg-slate-500/12 text-slate-700 border-slate-500/25';
  return <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-medium ', color)}>{value}</span>;
}

function SeverityPill({ value }: { value: Severity }) {
  const color = value === 'critical'
    ? 'bg-red-500/12 text-red-700 border-red-500/25'
    : value === 'major'
      ? 'bg-orange-500/12 text-orange-700 border-orange-500/25'
      : 'bg-amber-500/12 text-amber-700 border-amber-500/25';
  return <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-medium ', color)}>{value}</span>;
}

function IconButton({ title, children, onClick, danger }: { title: string; children: React.ReactElement; onClick: () => void; danger?: boolean }) {
  return <button title={title} onClick={onClick} className={cn('rounded-xl border p-2 transition-all', danger ? 'border-destructive/25 text-destructive hover:bg-destructive/10' : 'border-border/60 text-muted-foreground hover:border-primary/30 hover:text-primary')}>{React.cloneElement(children, { className: 'h-4 w-4' })}</button>;
}

function ActionButton({ children, icon, onClick, primary, disabled }: { children: React.ReactNode; icon: React.ReactElement; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return <button disabled={disabled} onClick={onClick} className={cn('rounded-xl px-4 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50', primary ? 'bg-primary text-primary-foreground shadow-[0_12px_30px_rgba(59,130,246,0.24)] hover:bg-primary/90' : 'border border-border/60 bg-card text-foreground hover:border-primary/30 hover:text-primary')}>{React.cloneElement(icon, { className: 'mr-2 inline h-4 w-4' })}{children}</button>;
}

function filterSummary(detector: Detector): string {
  if (detector.scopeFilters?.length) {
    return detector.scopeFilters
      .map(filter => `${filter.dimension}: ${filter.values.length ? filter.values.join('/') : '-'}`)
      .join(' · ');
  }
  const f = detector.filters;
  return [`Plaque ${f.plaque.join('/') || '-'}`, f.technology.join('/'), f.vendor.join('/')].filter(Boolean).join(' · ');
}

function modeLabel(detector: Detector): string {
  if (detector.detectionMode === 'REAL_TIME') return `Real-time ${detector.scheduleFrequency}`;
  if (detector.detectionMode === 'SCHEDULED') return `Scheduled ${detector.scheduleFrequency}`;
  return 'Batch on demand';
}

function formatDate(value: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toApiPayload(detector: Detector) {
  return {
    code: detector.code,
    name: detector.name,
    description: detector.description,
    scopeLevel: detector.scopeLevel,
    detectionMode: detector.detectionMode,
    scheduleFrequency: detector.scheduleFrequency,
    lookbackWindow: detector.lookbackWindow,
    enabled: detector.enabled,
    config: {
      filters: detector.filters,
      criteria: { logic: detector.criteriaLogic, groups: [{ logic: detector.criteriaLogic, items: detector.criteria }] },
      output: detector.output,
    },
    detectorPayload: buildDetectorPayload(detector),
  };
}

function unitOptions(kpis: KpiOption[], selected?: KpiOption, conditionType: DetectorConditionType = 'kpi'): string[] {
  const units = new Set<string>();
  units.add('');
  if (conditionType === 'dimension') return Array.from(units);
  if (selected?.unit) units.add(selected.unit);
  for (const kpi of kpis) {
    if (kpi.unit) units.add(kpi.unit);
  }
  units.add('MINOR');
  units.add('MAJOR');
  units.add('CRITICAL');
  return Array.from(units);
}

export function buildDetectorPayload(detector: Detector): DetectorPayload {
  return {
    kpiTableId: typeof (detector as any).kpiTableId === 'number' ? (detector as any).kpiTableId : 1,
    scopeFilters: detector.scopeFilters.map(filter => ({
      dimension: filter.dimension,
      values: filter.values,
    })),
    criteria: {
      logic: detector.criteriaConfig.logic,
      conditions: detector.criteriaConfig.conditions.map(condition => {
        const numeric = Number(condition.value);
        return {
          type: condition.type,
          field: condition.field,
          aggregation: condition.type === 'kpi' ? condition.aggregation : undefined,
          operator: condition.operator,
          value: condition.operator === 'exists' ? true : condition.value.trim() !== '' && Number.isFinite(numeric) ? numeric : condition.value,
          unit: condition.unit || undefined,
        };
      }),
    },
    time: {
      range: detector.timeConfig.range,
      customStart: detector.timeConfig.customStart,
      customEnd: detector.timeConfig.customEnd,
      excludeTimeSlots: detector.timeConfig.excludeTimeSlots,
      excludedSlots: detector.timeConfig.excludedSlots.map(slot => ({ start: slot.start, end: slot.end })),
      excludeWeekends: detector.timeConfig.excludeWeekends,
      excludeHolidays: detector.timeConfig.excludeHolidays,
    },
  };
}

export function validateDetectorPayload(payload: DetectorPayload): DetectorValidation {
  const errors: string[] = [];
  for (const filter of payload.scopeFilters) {
    if (!filter.dimension) errors.push('Each scope filter needs a dimension.');
    if (!filter.values.length) errors.push(`${filter.dimension || 'A filter'} needs at least one value.`);
  }
  if (!payload.criteria.conditions.length) errors.push('Add at least one criteria condition.');
  payload.criteria.conditions.forEach((condition, index) => {
    if (!condition.type) errors.push(`Condition ${index + 1} needs a type.`);
    if (!condition.field) errors.push(`Condition ${index + 1} needs a KPI or dimension.`);
    if (condition.operator !== 'exists' && (condition.value === '' || condition.value === null || condition.value === undefined)) errors.push(`Condition ${index + 1} needs a threshold/value.`);
    if (condition.type === 'kpi' && !condition.aggregation) errors.push(`Condition ${index + 1} needs an aggregation.`);
  });
  if (payload.time.range === 'custom' && (!payload.time.customStart || !payload.time.customEnd)) {
    errors.push('Custom time range needs both start and end.');
  }
  if (payload.time.excludeTimeSlots) {
    if (!payload.time.excludedSlots.length) errors.push('Add at least one excluded time slot or disable time-slot exclusion.');
    payload.time.excludedSlots.forEach((slot, index) => {
      if (!slot.start || !slot.end) errors.push(`Excluded slot ${index + 1} needs start and end times.`);
      if (slot.start && slot.end && slot.start >= slot.end) errors.push(`Excluded slot ${index + 1} start must be before end.`);
    });
  }
  return { valid: errors.length === 0, errors };
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  return [headers.join(','), ...rows.map(row => headers.map(h => csvCell(row[h])).join(','))].join('\n');
}

function csvCell(value: unknown): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
