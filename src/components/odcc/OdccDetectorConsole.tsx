import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  Download,
  Edit3,
  FileJson,
  Filter,
  Gauge,
  History,
  Layers3,
  Play,
  Plus,
  Radar,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type ScopeLevel = 'COUNTRY' | 'DEPARTMENT' | 'DOR' | 'PLAQUE' | 'SITE' | 'CELL';
type DetectionMode = 'REAL_TIME' | 'HISTORICAL' | 'DAILY_J1';
type DetectorStatus = 'draft' | 'active' | 'inactive' | 'archived';
type RunStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
type Severity = 'info' | 'warning' | 'major' | 'critical';
type ResultStatus = 'open' | 'acknowledged' | 'resolved' | 'ignored';
type Tab = 'detectors' | 'builder' | 'runs' | 'results' | 'parameter_sets' | 'audit';
type FilterKey = keyof Detector['filters'];

interface Criterion {
  id: string;
  type: 'kpi' | 'parameter' | 'inventory';
  code: string;
  aggregation: 'avg' | 'sum' | 'min' | 'max' | 'last';
  operator: '<' | '<=' | '>' | '>=' | '=' | '!=';
  threshold: string;
  granularity: '15m' | '1h' | '1d';
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
  scheduleFrequency: '15m' | '1h' | 'daily' | 'manual';
  lookbackWindow: 'last_15m' | 'last_1h' | 'j-1' | 'custom';
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
  granularity: '15m' | '1h' | '1d';
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
    country: ['FR'],
    department: ['44'],
    dor: ['DOR_OUEST'],
    plaque: ['NANTES'],
    siteCodes: [],
    cellCodes: [],
    technology: ['4G'],
    vendor: ['NOKIA'],
    band: ['L1800'],
    tags: [],
  },
  criteriaLogic: 'AND',
  criteria: [{
    id: uid('crit'),
    type: 'kpi',
    code: 'AVAILABILITY',
    aggregation: 'avg',
    operator: '<',
    threshold: '98',
    granularity: '15m',
    severity: 'major',
  }],
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
    detectionMode: 'DAILY_J1',
    scheduleFrequency: 'daily',
    lookbackWindow: 'j-1',
    status: 'inactive',
    enabled: false,
    criteria: [{ ...emptyDetector().criteria[0], id: 'crit_2', code: 'TRAFFIC_DL', aggregation: 'sum', operator: '<', threshold: '10', severity: 'warning' }],
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

const FILTER_DEFINITIONS: { key: FilterKey; label: string; placeholder: string; values: string[] }[] = [
  { key: 'country', label: 'Country', placeholder: 'Search country...', values: ['FR', 'TN', 'BE', 'ES', 'DE'] },
  { key: 'department', label: 'Department', placeholder: 'Search department...', values: ['44', '75', '59', '69', '31', '13', '92'] },
  { key: 'dor', label: 'DOR', placeholder: 'Search DOR...', values: ['DOR_OUEST', 'DOR_NORD', 'DOR_EST', 'DOR_SUD', 'DOR_IDF'] },
  { key: 'plaque', label: 'Plaque', placeholder: 'Search plaque...', values: ['NANTES', 'LILLE', 'PARIS', 'LYON', 'TOULOUSE', 'MARSEILLE', 'TUNIS'] },
  { key: 'siteCodes', label: 'Site', placeholder: 'Search site...', values: ['HAUTE_INDRE', 'BASSE_GOULAINE', 'LOMPRET_DEM', 'BIZERTE_CENTRE', 'NANTES_CENTRE'] },
  { key: 'cellCodes', label: 'Cell', placeholder: 'Search cell...', values: ['HAUTE_INDRE_ENB1_E1', 'BASSE_GOULAINE_L18_01', 'LOMPRET_DEM_N78_01', 'BIZERTE_CENTRE_L18_01'] },
  { key: 'technology', label: 'Technology', placeholder: 'Search technology...', values: ['2G', '3G', '4G', '5G'] },
  { key: 'vendor', label: 'Vendor', placeholder: 'Search vendor...', values: ['NOKIA', 'ERICSSON', 'HUAWEI', 'SAMSUNG', 'ALCATEL'] },
  { key: 'band', label: 'Band', placeholder: 'Search band...', values: ['L700', 'L800', 'L1800', 'L2100', 'L2600', 'N78', 'NR700'] },
  { key: 'tags', label: 'Tags', placeholder: 'Search tag...', values: ['VIP', 'dense-urban', 'rural', 'high-traffic', 'critical-site'] },
];

export default function OdccDetectorConsole() {
  const [tab, setTab] = useState<Tab>('detectors');
  const [detectors, setDetectors] = useState<Detector[]>(seedDetectors);
  const [runs, setRuns] = useState<DetectorRun[]>([]);
  const [results, setResults] = useState<DetectionResult[]>([]);
  const [parameterSets, setParameterSets] = useState<ParameterSet[]>(seedParameterSets);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [draft, setDraft] = useState<Detector>(() => emptyDetector());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedResults, setSelectedResults] = useState<string[]>([]);

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

  const saveDetector = (enable: boolean) => {
    const next: Detector = {
      ...draft,
      enabled: enable,
      status: enable ? 'active' : draft.status === 'archived' ? 'archived' : 'draft',
      updatedAt: nowIso(),
      version: draft.version + 1,
    };
    setDetectors(prev => editingId ? prev.map(d => d.id === editingId ? next : d) : [next, ...prev]);
    log(next.id, editingId ? 'updated' : 'created', enable ? 'saved and enabled' : 'saved as draft');
    setEditingId(null);
    setDraft(emptyDetector());
    setTab('detectors');
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

  const toggleDetector = (detector: Detector) => {
    setDetectors(prev => prev.map(d => d.id === detector.id ? { ...d, enabled: !d.enabled, status: !d.enabled ? 'active' : 'inactive', updatedAt: nowIso() } : d));
    log(detector.id, detector.enabled ? 'disabled' : 'enabled', detector.code);
  };

  const deleteDetector = (detector: Detector) => {
    setDetectors(prev => prev.filter(d => d.id !== detector.id));
    log(detector.id, 'deleted', detector.code);
  };

  const runDetector = (detector: Detector) => {
    const run: DetectorRun = {
      id: uid('run'),
      detectorId: detector.id,
      triggerType: 'manual',
      runMode: detector.detectionMode,
      executionStatus: 'success',
      periodStart: detector.lookbackWindow === 'j-1' ? '2026-04-21T00:00:00Z' : '2026-04-22T07:00:00Z',
      periodEnd: nowIso(),
      granularity: detector.scheduleFrequency === '15m' ? '15m' : detector.scheduleFrequency === '1h' ? '1h' : '1d',
      matchedCount: 3,
      createdAt: nowIso(),
    };
    const generated = ['HAUTE_INDRE_ENB1_E1', 'NANTES_CENTRE_E2', 'CARQUEFOU_E1'].map((cell, idx): DetectionResult => ({
      id: uid('res'),
      detectorId: detector.id,
      detectorRunId: run.id,
      scopeLevel: detector.scopeLevel,
      neType: detector.scopeLevel,
      neId: cell,
      neName: cell,
      countryCode: detector.filters.country[0] || 'FR',
      departmentCode: detector.filters.department[0] || '44',
      dorCode: detector.filters.dor[0] || 'DOR_OUEST',
      plaqueCode: detector.filters.plaque[0] || 'NANTES',
      siteCode: cell.split('_ENB')[0],
      cellCode: cell,
      technology: detector.filters.technology[0] || '4G',
      vendor: detector.filters.vendor[0] || 'NOKIA',
      severity: idx === 0 ? 'critical' : idx === 1 ? 'major' : 'warning',
      status: 'open',
      triggerSummary: `Availability avg ${idx === 0 ? 94.8 : 96.8} < ${detector.criteria[0]?.threshold || 98}`,
      kpiCode: detector.criteria[0]?.code || 'AVAILABILITY',
      currentValue: idx === 0 ? 94.8 : idx === 1 ? 96.8 : 97.3,
      threshold: Number(detector.criteria[0]?.threshold || 98),
      detectedAt: nowIso(),
    }));
    setRuns(prev => [run, ...prev]);
    setResults(prev => [...generated, ...prev]);
    log(detector.id, 'executed', `manual run ${run.id}`);
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
    <div
      className="flex h-full flex-col overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f4f7fb_100%)] text-slate-900 antialiased"
      style={{ fontFamily: 'Inter, system-ui, sans-serif', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' } as React.CSSProperties}
    >
      <header className="border-b border-slate-200/70 bg-white/80 px-8 py-6 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-sm">
                <Radar className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-600">OSMOSIS / ODCC</p>
                <h1 className="mt-1 tracking-tight text-slate-900" style={{ fontSize: '28px', fontWeight: 600 }}>NE Detector Console</h1>
              </div>
            </div>
            <p className="mt-2 max-w-3xl text-[13px] font-medium text-slate-500">
              Frontend-only workspace for detector rules, manual runs, detected NE results, and parameter set operations. Backend wiring is intentionally disabled.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setDraft(emptyDetector()); setEditingId(null); setTab('builder'); }} className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-teal-600 to-emerald-600 px-5 text-[13px] font-semibold text-white shadow-sm transition-all hover:from-teal-500 hover:to-emerald-500">
              <Plus className="h-4 w-4" /> Create Detector
            </button>
            <button onClick={exportCsv} className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 shadow-sm transition-all hover:border-teal-300 hover:text-teal-700">
              <Download className="h-4 w-4" /> Export Results
            </button>
          </div>
        </div>
      </header>

      <main className="flex h-[calc(100%-105px)] overflow-hidden">
        <aside className="w-72 shrink-0 border-r border-slate-200/70 bg-white/60 p-5 backdrop-blur-sm">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Active" value={stats.active} icon={<ShieldCheck />} />
            <Metric label="Open" value={stats.open} icon={<AlertTriangle />} />
            <Metric label="Critical" value={stats.critical} icon={<Gauge />} />
            <Metric label="Last run" value={String(stats.lastRun)} icon={<Clock />} />
          </div>
          <nav className="mt-6 space-y-0.5">
            {[
              ['detectors', 'Detector List', Radar],
              ['builder', 'Create Detector', Settings2],
              ['runs', 'Runs History', History],
              ['results', 'Detection Results', AlertTriangle],
              ['parameter_sets', 'Parameter Sets', Database],
              ['audit', 'Audit Logs', FileJson],
            ].map(([id, label, Icon]) => (
              <button key={id as string} onClick={() => setTab(id as Tab)} className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition-all', tab === id ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-100' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900')}>
                {React.createElement(Icon as typeof Radar, { className: 'h-4 w-4' })}
                {label as string}
              </button>
            ))}
          </nav>
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">MVP mode</p>
            <p className="mt-1 leading-relaxed">All detector actions are simulated in local React state. No backend endpoints are called.</p>
          </div>
        </aside>

        <section className="flex-1 overflow-auto p-7">
          {tab === 'detectors' && (
            <DetectorList
              detectors={filteredDetectors}
              query={query}
              setQuery={setQuery}
              onEdit={editDetector}
              onDuplicate={duplicateDetector}
              onToggle={toggleDetector}
              onDelete={deleteDetector}
              onRun={runDetector}
            />
          )}
          {tab === 'builder' && (
            <DetectorBuilder
              draft={draft}
              setDraft={setDraft}
              editing={!!editingId}
              parameterSets={parameterSets}
              onSaveDraft={() => saveDetector(false)}
              onSaveEnable={() => saveDetector(true)}
              onRunTest={() => runDetector(draft)}
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
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-100">{React.cloneElement(icon, { className: 'h-4 w-4' })}</div>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-slate-900">{value}</p>
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
          <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
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
  const [isAddingFilter, setIsAddingFilter] = useState(false);
  const [filterKey, setFilterKey] = useState<FilterKey>('plaque');
  const [filterSearch, setFilterSearch] = useState('');
  const patch = (p: Partial<Detector>) => setDraft({ ...draft, ...p, updatedAt: nowIso() });
  const patchFilterValues = (key: FilterKey, values: string[]) => patch({ filters: { ...draft.filters, [key]: values } });
  const addFilterValue = (key: FilterKey, value: string) => {
    const clean = value.trim();
    if (!clean) return;
    const current = draft.filters[key] || [];
    if (current.some(item => item.toLowerCase() === clean.toLowerCase())) return;
    patchFilterValues(key, [...current, clean]);
    setFilterSearch('');
  };
  const removeFilterValue = (key: FilterKey, value: string) => {
    patchFilterValues(key, (draft.filters[key] || []).filter(item => item !== value));
  };
  const updateCriterion = (id: string, p: Partial<Criterion>) => patch({ criteria: draft.criteria.map(c => c.id === id ? { ...c, ...p } : c) });
  const selectedFilterDefinition = FILTER_DEFINITIONS.find(item => item.key === filterKey) || FILTER_DEFINITIONS[0];
  const selectedFilterValues = draft.filters[filterKey] || [];
  const filteredFilterOptions = selectedFilterDefinition.values
    .filter(value => !selectedFilterValues.includes(value))
    .filter(value => value.toLowerCase().includes(filterSearch.trim().toLowerCase()))
    .slice(0, 8);
  const activeFilterCount = FILTER_DEFINITIONS.reduce((count, item) => count + (draft.filters[item.key]?.length || 0), 0);
  return (
    <Panel title={editing ? 'Edit Detector' : 'Create Detector'} action={<span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Frontend draft</span>}>
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card title="A. General">
          <Field label="Name"><input value={draft.name} onChange={e => patch({ name: e.target.value })} className="input" /></Field>
          <Field label="Code"><input value={draft.code} onChange={e => patch({ code: e.target.value })} className="input font-mono" /></Field>
          <Field label="Description"><textarea value={draft.description} onChange={e => patch({ description: e.target.value })} className="input min-h-20" /></Field>
          <label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={draft.enabled} onChange={e => patch({ enabled: e.target.checked, status: e.target.checked ? 'active' : 'draft' })} /> Enabled</label>
        </Card>

        <Card title="B. Scope + Mode">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Scope level"><Select value={draft.scopeLevel} values={['COUNTRY', 'DEPARTMENT', 'DOR', 'PLAQUE', 'SITE', 'CELL']} onChange={v => patch({ scopeLevel: v as ScopeLevel })} /></Field>
            <Field label="Mode"><Select value={draft.detectionMode} values={['REAL_TIME', 'HISTORICAL', 'DAILY_J1']} onChange={v => patch({ detectionMode: v as DetectionMode })} /></Field>
            <Field label="Frequency"><Select value={draft.scheduleFrequency} values={['15m', '1h', 'daily', 'manual']} onChange={v => patch({ scheduleFrequency: v as Detector['scheduleFrequency'] })} /></Field>
            <Field label="Lookback"><Select value={draft.lookbackWindow} values={['last_15m', 'last_1h', 'j-1', 'custom']} onChange={v => patch({ lookbackWindow: v as Detector['lookbackWindow'] })} /></Field>
          </div>
        </Card>

        <Card title="C. NE Filters">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/30 p-4">
              <div>
                <p className="text-sm font-bold text-foreground">Build NE scope with reusable filters</p>
                <p className="mt-1 text-xs text-muted-foreground">Add Country, Department, DOR, Plaque, Site, Cell, vendor, technology, band, or tag filters from a searchable list.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingFilter(value => !value)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-primary-foreground transition-all hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" /> Add filter
              </button>
            </div>

            {activeFilterCount > 0 ? (
              <div className="space-y-3">
                {FILTER_DEFINITIONS.filter(item => (draft.filters[item.key] || []).length > 0).map(item => (
                  <div key={item.key} className="rounded-2xl border border-border/60 bg-background p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{item.label}</span>
                      <button type="button" onClick={() => patchFilterValues(item.key, [])} className="text-[10px] font-bold text-muted-foreground transition-colors hover:text-destructive">Clear</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(draft.filters[item.key] || []).map(value => (
                        <button
                          key={`${item.key}-${value}`}
                          type="button"
                          onClick={() => removeFilterValue(item.key, value)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary transition-all hover:border-destructive/25 hover:bg-destructive/10 hover:text-destructive"
                          title="Remove filter"
                        >
                          {value}
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/60 p-5 text-sm text-muted-foreground">
                No NE filters selected. Click Add filter to define the target population.
              </div>
            )}

            {isAddingFilter && (
              <div className="rounded-2xl border border-primary/20 bg-background p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-[0.8fr_1.2fr_auto]">
                  <Field label="Filter type">
                    <Select
                      value={filterKey}
                      values={FILTER_DEFINITIONS.map(item => item.key)}
                      labels={FILTER_DEFINITIONS.map(item => item.label)}
                      onChange={value => {
                        setFilterKey(value as FilterKey);
                        setFilterSearch('');
                      }}
                    />
                  </Field>
                  <Field label="Search value">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={filterSearch}
                        onChange={event => setFilterSearch(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addFilterValue(filterKey, filterSearch);
                          }
                        }}
                        placeholder={selectedFilterDefinition.placeholder}
                        className="input pl-11"
                      />
                    </div>
                  </Field>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => addFilterValue(filterKey, filterSearch)}
                      className="h-11 rounded-xl border border-border/60 bg-card px-4 text-xs font-semibold uppercase tracking-[0.08em] text-foreground transition-all hover:border-primary/30 hover:text-primary"
                    >
                      Add value
                    </button>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Available {selectedFilterDefinition.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {filteredFilterOptions.length > 0 ? filteredFilterOptions.map(value => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => addFilterValue(filterKey, value)}
                        className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-bold text-foreground transition-all hover:border-primary/30 hover:bg-primary/8 hover:text-primary"
                      >
                        {value}
                      </button>
                    )) : (
                      <span className="text-xs text-muted-foreground">No list match. Type a custom value and click Add value.</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card title="F. Criteria Builder">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Logic</span>
            <Select value={draft.criteriaLogic} values={['AND', 'OR']} onChange={v => patch({ criteriaLogic: v as 'AND' | 'OR' })} />
            <button onClick={() => patch({ criteria: [...draft.criteria, { ...draft.criteria[0], id: uid('crit'), code: 'NEW_KPI', threshold: '0' }] })} className="ml-auto rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90">Add condition</button>
          </div>
          <div className="space-y-3">
            {draft.criteria.map(c => (
              <div key={c.id} className="grid grid-cols-7 gap-2 rounded-xl border border-border/60 bg-muted/30 p-3">
                <Select value={c.type} values={['kpi', 'parameter', 'inventory']} onChange={v => updateCriterion(c.id, { type: v as Criterion['type'] })} />
                <input value={c.code} onChange={e => updateCriterion(c.id, { code: e.target.value })} className="input col-span-2 font-mono" />
                <Select value={c.aggregation} values={['avg', 'sum', 'min', 'max', 'last']} onChange={v => updateCriterion(c.id, { aggregation: v as Criterion['aggregation'] })} />
                <Select value={c.operator} values={['<', '<=', '>', '>=', '=', '!=']} onChange={v => updateCriterion(c.id, { operator: v as Criterion['operator'] })} />
                <input value={c.threshold} onChange={e => updateCriterion(c.id, { threshold: e.target.value })} className="input" />
                <Select value={c.severity} values={['info', 'warning', 'major', 'critical']} onChange={v => updateCriterion(c.id, { severity: v as Severity })} />
              </div>
            ))}
          </div>
        </Card>

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
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={onSaveDraft} icon={<Save />}>Save draft</ActionButton>
            <ActionButton onClick={onSaveEnable} icon={<ShieldCheck />} primary>Save & enable</ActionButton>
            <ActionButton onClick={onValidate} icon={<CheckCircle2 />}>Validate</ActionButton>
            <ActionButton onClick={onRunTest} icon={<Play />}>Run test</ActionButton>
          </div>
          <pre className="mt-4 max-h-80 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-blue-100">{JSON.stringify(toApiPayload(draft), null, 2)}</pre>
        </Card>
      </div>
    </Panel>
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

function ResultsTable({ results, selected, setSelected, onStatus, onExport, onApply }: {
  results: DetectionResult[];
  selected: string[];
  setSelected: (ids: string[]) => void;
  onStatus: (ids: string[], status: ResultStatus) => void;
  onExport: () => void;
  onApply: () => void;
}) {
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  return (
    <Panel title="Detection Results" action={<div className="flex gap-2"><ActionButton onClick={onExport} icon={<Download />}>Export selected</ActionButton><ActionButton onClick={onApply} icon={<Upload />} primary>Apply parameter set</ActionButton></div>}>
      <SimpleTable headers={['', 'Detection time', 'Severity', 'Hierarchy', 'NE', 'Tech', 'Vendor', 'KPI', 'Value', 'Threshold', 'Status', 'Actions']}>
        {results.map(r => (
          <tr key={r.id} className="border-t border-border/50 transition-all hover:bg-primary/5">
            <Td><input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} /></Td>
            <Td>{formatDate(r.detectedAt)}</Td>
            <Td><SeverityPill value={r.severity} /></Td>
            <Td>{r.countryCode} / {r.departmentCode} / {r.dorCode} / {r.plaqueCode}</Td>
            <Td><span className="font-mono text-xs">{r.cellCode || r.siteCode || r.neName}</span></Td>
            <Td>{r.technology}</Td>
            <Td>{r.vendor}</Td>
            <Td>{r.kpiCode}</Td>
            <Td>{r.currentValue}</Td>
            <Td>{`< ${r.threshold}`}</Td>
            <Td><StatusPill value={r.status} /></Td>
            <Td>
              <div className="flex gap-1">
                <IconButton title="Acknowledge" onClick={() => onStatus([r.id], 'acknowledged')}><CheckCircle2 /></IconButton>
                <IconButton title="Resolve" onClick={() => onStatus([r.id], 'resolved')}><ShieldCheck /></IconButton>
                <IconButton title="Ignore" onClick={() => onStatus([r.id], 'ignored')}><XCircle /></IconButton>
              </div>
            </Td>
          </tr>
        ))}
      </SimpleTable>
    </Panel>
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
      <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Layers3 className="h-4 w-4" />{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}<div className="mt-1">{children}</div></label>;
}

function Select({ value, values, labels, onChange }: { value: string; values: string[]; labels?: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="input">
      {values.map((v, i) => <option key={v} value={v}>{labels?.[i] ?? v}</option>)}
    </select>
  );
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
          <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
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
  return <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em]', color)}>{value}</span>;
}

function SeverityPill({ value }: { value: Severity }) {
  const color = value === 'critical'
    ? 'bg-red-500/12 text-red-700 border-red-500/25'
    : value === 'major'
      ? 'bg-orange-500/12 text-orange-700 border-orange-500/25'
      : value === 'warning'
        ? 'bg-amber-500/12 text-amber-700 border-amber-500/25'
        : 'bg-blue-500/12 text-blue-700 border-blue-500/25';
  return <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em]', color)}>{value}</span>;
}

function IconButton({ title, children, onClick, danger }: { title: string; children: React.ReactElement; onClick: () => void; danger?: boolean }) {
  return <button title={title} onClick={onClick} className={cn('rounded-xl border p-2 transition-all', danger ? 'border-destructive/25 text-destructive hover:bg-destructive/10' : 'border-border/60 text-muted-foreground hover:border-primary/30 hover:text-primary')}>{React.cloneElement(children, { className: 'h-4 w-4' })}</button>;
}

function ActionButton({ children, icon, onClick, primary }: { children: React.ReactNode; icon: React.ReactElement; onClick: () => void; primary?: boolean }) {
  return <button onClick={onClick} className={cn('rounded-xl px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] transition-all', primary ? 'bg-primary text-primary-foreground shadow-[0_12px_30px_rgba(59,130,246,0.24)] hover:bg-primary/90' : 'border border-border/60 bg-card text-foreground hover:border-primary/30 hover:text-primary')}>{React.cloneElement(icon, { className: 'mr-2 inline h-4 w-4' })}{children}</button>;
}

function filterSummary(detector: Detector): string {
  const f = detector.filters;
  return [`Plaque ${f.plaque.join('/') || '-'}`, f.technology.join('/'), f.vendor.join('/')].filter(Boolean).join(' · ');
}

function modeLabel(detector: Detector): string {
  if (detector.detectionMode === 'REAL_TIME') return `Real-time ${detector.scheduleFrequency}`;
  if (detector.detectionMode === 'DAILY_J1') return 'Daily J-1';
  return 'Historical on demand';
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
  };
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
