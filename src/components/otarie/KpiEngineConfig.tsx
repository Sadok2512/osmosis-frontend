import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings2, Database, Plus, Trash2, Pencil, Info, Loader2,
  ChevronRight, ChevronDown, Check, X, AlertTriangle, Search,
  Layers, Clock, Server, Zap, RefreshCw, Package
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { getVpsProxyUrl, getVpsProxyHeaders } from '@/lib/apiConfig';

/* ────────────────── Types ────────────────── */

interface AggregationTable {
  level: string;
  period: string;
  is_active: boolean;
  retention_days: number;
  table_name: string;
}

interface KpiDefinition {
  kpi_code: string;
  famille: string;
  nom_ihm: string;
  definition_courte: string;
  numerateur: string;
  denominateur: string;
  unites: string;
  techno: string;
  equipement: string;
  formula_type: string;
  version: number;
  status: string;
  is_active: boolean;
  is_visible: boolean;
  is_materialized_default: boolean;
  complexity_score: number;
}

interface EngineStats {
  kpi_definitions: number;
  active_materialized: number;
  cells_in_topo: number;
  open_anomalies: number;
  last_computation: string | null;
}

/* ────────────────── API helpers ────────────────── */

async function kpiFetch(path: string, opts?: RequestInit) {
  const url = getVpsProxyUrl('kpi', path);
  const res = await fetch(url, {
    ...opts,
    headers: { ...getVpsProxyHeaders(), ...opts?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ────────────────── Helpers ────────────────── */

const LEVELS = ['CELL', 'SITE', 'PLAQUE', 'DOR', 'REGION', 'COUNTRY'] as const;
const PERIODS = ['15MIN', '1H', '1D'] as const;
const VENDORS = ['Nokia 4G', 'Nokia 5G', 'Ericsson 4G', 'Ericsson 5G', 'Huawei 4G', 'Huawei 5G'] as const;

function levelColor(level: string) {
  const map: Record<string, string> = {
    CELL: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    SITE: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    PLAQUE: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    DOR: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
    REGION: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
    COUNTRY: 'bg-red-500/10 text-red-600 border-red-500/20',
  };
  return map[level] || 'bg-muted text-muted-foreground';
}

function periodLabel(p: string) {
  const map: Record<string, string> = { '15MIN': '15 min', '1H': '1 hour', '1D': '1 day' };
  return map[p] || p;
}

function formatDate(iso: string | null) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════ */

const KpiEngineConfig: React.FC = () => {
  // ── State ──
  const [tables, setTables] = useState<AggregationTable[]>([]);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [newLevel, setNewLevel] = useState<string>('CELL');
  const [newPeriod, setNewPeriod] = useState<string>('1H');
  const [newRetention, setNewRetention] = useState(30);

  // Edit modal
  const [editTable, setEditTable] = useState<AggregationTable | null>(null);
  const [editRetention, setEditRetention] = useState(30);
  const [editActive, setEditActive] = useState(false);

  // Delete confirmation
  const [deleteTable, setDeleteTable] = useState<AggregationTable | null>(null);

  // KPI selector modal
  const [showKpiSelector, setShowKpiSelector] = useState(false);
  const [kpiList, setKpiList] = useState<KpiDefinition[]>([]);
  const [kpiTotal, setKpiTotal] = useState(0);
  const [kpiSearch, setKpiSearch] = useState('');
  const [kpiVendor, setKpiVendor] = useState('');
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiPage, setKpiPage] = useState(0);

  // ── Data fetching ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [agg, st] = await Promise.all([
        kpiFetch('/config/aggregation'),
        kpiFetch('/config/stats'),
      ]);
      setTables(agg);
      setStats(st);
    } catch (e: any) {
      toast.error('Failed to load KPI Engine config', { description: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchKpis = useCallback(async () => {
    setKpiLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50', offset: String(kpiPage * 50) });
      if (kpiSearch) params.set('search', kpiSearch);
      if (kpiVendor) params.set('techno', kpiVendor);
      const data = await kpiFetch(`/kpi/definitions?${params}`);
      setKpiList(data.items);
      setKpiTotal(data.total);
    } catch (e: any) {
      toast.error('Failed to load KPIs', { description: e.message });
    } finally {
      setKpiLoading(false);
    }
  }, [kpiSearch, kpiVendor, kpiPage]);

  useEffect(() => {
    if (showKpiSelector) fetchKpis();
  }, [showKpiSelector, fetchKpis]);

  // ── Actions ──
  const handleCreateTable = async () => {
    try {
      await kpiFetch('/config/aggregation', {
        method: 'POST',
        body: JSON.stringify({ level: newLevel, period: newPeriod, retention_days: newRetention, is_active: true }),
      });
      toast.success('Aggregation table created', { description: `${newLevel} / ${newPeriod}` });
      setShowCreateModal(false);
      setCreateStep(1);
      fetchData();
    } catch (e: any) {
      toast.error('Creation failed', { description: e.message });
    }
  };

  const handleEditSave = async () => {
    if (!editTable) return;
    try {
      await kpiFetch('/config/aggregation', {
        method: 'POST',
        body: JSON.stringify({
          level: editTable.level,
          period: editTable.period,
          retention_days: editRetention,
          is_active: editActive,
        }),
      });
      toast.success('Table updated', { description: `${editTable.level} / ${editTable.period}` });
      setEditTable(null);
      fetchData();
    } catch (e: any) {
      toast.error('Update failed', { description: e.message });
    }
  };

  const handleDelete = async () => {
    if (!deleteTable) return;
    try {
      await kpiFetch(`/config/aggregation?level=${deleteTable.level}&period=${deleteTable.period}`, {
        method: 'DELETE',
      });
      toast.success('Table removed', { description: `${deleteTable.level} / ${deleteTable.period}` });
      setDeleteTable(null);
      fetchData();
    } catch (e: any) {
      toast.error('Delete failed', { description: e.message });
    }
  };

  const handleToggleKpi = async (kpi: KpiDefinition) => {
    const action = kpi.is_materialized_default ? 'deactivate' : 'activate';
    try {
      await kpiFetch(`/kpi/definitions/${kpi.kpi_code}/${action}`, { method: 'POST' });
      toast.success(`KPI ${action}d`, { description: kpi.kpi_code });
      fetchKpis();
      fetchData();
    } catch (e: any) {
      toast.error(`Failed to ${action} KPI`, { description: e.message });
    }
  };

  // ── Grouped tables by level ──
  const groupedTables = LEVELS.reduce((acc, lvl) => {
    const items = tables.filter(t => t.level === lvl);
    if (items.length) acc.push({ level: lvl, items });
    return acc;
  }, [] as { level: string; items: AggregationTable[] }[]);

  const activeTables = tables.filter(t => t.is_active).length;

  /* ═══════════════════ RENDER ═══════════════════ */

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-6xl mx-auto p-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Settings2 className="w-6 h-6 text-primary" />
              KPI Engine Configuration
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage aggregation tables, KPI catalog & computation pipeline
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>

        {/* ── CHANGE 1: Info Card (replaces Sync with Topology) ── */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Topology sync is automatic</p>
              <p className="text-muted-foreground mt-0.5">
                Cell references are resolved from PM data at compute time. No manual sync required.
                {stats?.last_computation && (
                  <span className="ml-1">Last computation: <strong>{formatDate(stats.last_computation)}</strong></span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat icon={<Package className="w-4 h-4" />} label="KPI Definitions" value={stats?.kpi_definitions ?? 0} />
          <MiniStat icon={<Zap className="w-4 h-4" />} label="Active / Materialized" value={stats?.active_materialized ?? 0} />
          <MiniStat icon={<Server className="w-4 h-4" />} label="Cells in Topo" value={(stats?.cells_in_topo ?? 0).toLocaleString()} />
          <MiniStat icon={<Clock className="w-4 h-4" />} label="Last Computation" value={formatDate(stats?.last_computation ?? null)} small />
        </div>

        {/* ── CHANGE 2 + 5: Aggregation Tables (or empty state) ── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              Aggregation Tables
              <Badge variant="secondary" className="ml-2">{tables.length}</Badge>
              {activeTables > 0 && (
                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 ml-1">{activeTables} active</Badge>
              )}
            </CardTitle>
            <Button size="sm" className="gap-2" onClick={() => { setShowCreateModal(true); setCreateStep(1); }}>
              <Plus className="w-4 h-4" /> New Table
            </Button>
          </CardHeader>
          <CardContent>
            {tables.length === 0 ? (
              /* ── CHANGE 2: Empty state ── */
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                  <Database className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-semibold mb-1">No aggregation tables configured</h3>
                <p className="text-sm text-muted-foreground max-w-md mb-6">
                  Create your first aggregation table to start pre-computing KPIs at different
                  granularities (Cell, Site, Plaque...) and time periods.
                </p>
                <Button onClick={() => { setShowCreateModal(true); setCreateStep(1); }} className="gap-2">
                  <Plus className="w-4 h-4" /> Create First Table
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {groupedTables.map(({ level, items }) => (
                  <div key={level}>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className={`text-[10px] font-bold uppercase ${levelColor(level)}`}>
                        {level}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{items.length} table{items.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {items.map(t => (
                        <div
                          key={t.table_name}
                          className={`relative rounded-xl border p-3 transition-all hover:shadow-md ${
                            t.is_active ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20 opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Database className="w-4 h-4 text-muted-foreground" />
                              <span className="text-xs font-mono font-medium">{t.table_name.replace('kpi.', '')}</span>
                            </div>
                            <div className={`w-2 h-2 rounded-full ${t.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-3">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {periodLabel(t.period)}
                            </span>
                            <span>Retention: {t.retention_days}d</span>
                          </div>
                          {/* ── CHANGE 5: Action buttons ── */}
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1"
                              onClick={() => {
                                setEditTable(t);
                                setEditRetention(t.retention_days);
                                setEditActive(t.is_active);
                              }}
                            >
                              <Pencil className="w-3 h-3" /> Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTable(t)}
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── CHANGE 3: KPI Catalog with vendor selector ── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              KPI Catalog
              <Badge variant="secondary" className="ml-2">{stats?.kpi_definitions ?? 0} total</Badge>
            </CardTitle>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => { setShowKpiSelector(true); setKpiPage(0); }}>
              <Search className="w-4 h-4" /> Browse & Manage KPIs
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                {stats?.active_materialized ?? 0} KPIs are currently active for pre-computation.
                Use the Browse button to search, activate or deactivate individual KPIs.
                KPI definitions are uploaded via the backend admin (Excel upload).
              </p>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* ═══════════════════ MODALS ═══════════════════ */}

      {/* ── CHANGE 4: Create Aggregation Table (3-step wizard) ── */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              New Aggregation Table
            </DialogTitle>
            <DialogDescription>
              Step {createStep} of 3 — {createStep === 1 ? 'Choose level' : createStep === 2 ? 'Choose period' : 'Review & confirm'}
            </DialogDescription>
          </DialogHeader>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 py-2">
            {[1, 2, 3].map(s => (
              <div key={s} className={`w-2.5 h-2.5 rounded-full transition-all ${
                s === createStep ? 'bg-primary scale-125' : s < createStep ? 'bg-primary/50' : 'bg-muted-foreground/20'
              }`} />
            ))}
          </div>

          {createStep === 1 && (
            <div className="space-y-2">
              <p className="text-sm font-medium mb-3">Aggregation Level</p>
              <div className="grid grid-cols-2 gap-2">
                {LEVELS.map(l => (
                  <button
                    key={l}
                    onClick={() => setNewLevel(l)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      newLevel === l
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/30 hover:bg-muted/50'
                    }`}
                  >
                    <span className="text-sm font-semibold">{l}</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {l === 'CELL' && 'Per-cell granularity'}
                      {l === 'SITE' && 'Aggregated per site'}
                      {l === 'PLAQUE' && 'Aggregated per plaque'}
                      {l === 'DOR' && 'Aggregated per DOR'}
                      {l === 'REGION' && 'Regional aggregation'}
                      {l === 'COUNTRY' && 'Country-wide aggregation'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {createStep === 2 && (
            <div className="space-y-2">
              <p className="text-sm font-medium mb-3">Time Period</p>
              <div className="grid grid-cols-3 gap-2">
                {PERIODS.map(p => (
                  <button
                    key={p}
                    onClick={() => setNewPeriod(p)}
                    className={`p-4 rounded-xl border text-center transition-all ${
                      newPeriod === p
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/30 hover:bg-muted/50'
                    }`}
                  >
                    <Clock className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                    <span className="text-sm font-semibold">{periodLabel(p)}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <label className="text-sm font-medium">Retention (days)</label>
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  value={newRetention}
                  onChange={e => setNewRetention(Number(e.target.value))}
                  className="mt-1 w-32"
                />
              </div>
            </div>
          )}

          {createStep === 3 && (
            <div className="space-y-3">
              <p className="text-sm font-medium mb-3">Review Configuration</p>
              <div className="rounded-xl border p-4 space-y-2 bg-muted/30">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Level</span>
                  <Badge variant="outline" className={levelColor(newLevel)}>{newLevel}</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Period</span>
                  <span className="font-medium">{periodLabel(newPeriod)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Retention</span>
                  <span className="font-medium">{newRetention} days</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Table name</span>
                  <span className="font-mono text-xs">kpi.fact_kpi_{newLevel.toLowerCase()}_{newPeriod.toLowerCase().replace('min', 'min')}</span>
                </div>
              </div>
              {tables.some(t => t.level === newLevel && t.period === newPeriod) && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-700">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  This combination already exists. Creating will update the existing table.
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            {createStep > 1 && (
              <Button variant="outline" onClick={() => setCreateStep(s => s - 1)}>Back</Button>
            )}
            {createStep < 3 ? (
              <Button onClick={() => setCreateStep(s => s + 1)}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleCreateTable} className="gap-2">
                <Check className="w-4 h-4" /> Create Table
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CHANGE 5: Edit Modal ── */}
      <Dialog open={!!editTable} onOpenChange={(open) => { if (!open) setEditTable(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              Edit Table
            </DialogTitle>
            <DialogDescription>
              {editTable?.table_name}
            </DialogDescription>
          </DialogHeader>
          {editTable && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-xs text-muted-foreground">Enable pre-computation for this table</p>
                </div>
                <Switch checked={editActive} onCheckedChange={setEditActive} />
              </div>
              <div>
                <label className="text-sm font-medium">Retention (days)</label>
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  value={editRetention}
                  onChange={e => setEditRetention(Number(e.target.value))}
                  className="mt-1 w-32"
                />
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground p-2 rounded-lg bg-muted/30">
                <Info className="w-4 h-4 shrink-0" />
                Level ({editTable.level}) and period ({editTable.period}) cannot be changed after creation.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTable(null)}>Cancel</Button>
            <Button onClick={handleEditSave} className="gap-2">
              <Check className="w-4 h-4" /> Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CHANGE 5: Delete Confirmation ── */}
      <Dialog open={!!deleteTable} onOpenChange={(open) => { if (!open) setDeleteTable(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTable && (
            <div className="space-y-3">
              <p className="text-sm">
                Are you sure you want to delete the aggregation table{' '}
                <strong className="font-mono">{deleteTable.table_name}</strong>?
              </p>
              <p className="text-xs text-muted-foreground">
                All pre-computed data for {deleteTable.level} / {deleteTable.period} will be lost.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTable(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} className="gap-2">
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CHANGE 3: KPI Selector Modal with vendor filter ── */}
      <Dialog open={showKpiSelector} onOpenChange={setShowKpiSelector}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              KPI Catalog
              <Badge variant="secondary" className="ml-2">{kpiTotal}</Badge>
            </DialogTitle>
            <DialogDescription>
              Search, filter by vendor, and toggle KPI pre-computation
            </DialogDescription>
          </DialogHeader>

          {/* Filters row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search KPI code or name..."
                value={kpiSearch}
                onChange={e => { setKpiSearch(e.target.value); setKpiPage(0); }}
                className="pl-9"
              />
            </div>
            {/* CHANGE 3: Vendor selector */}
            <select
              value={kpiVendor}
              onChange={e => { setKpiVendor(e.target.value); setKpiPage(0); }}
              className="h-10 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">All Vendors</option>
              {VENDORS.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          {/* KPI list */}
          <div className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-1">
            {kpiLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : kpiList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No KPIs found</p>
              </div>
            ) : (
              kpiList.map(kpi => (
                <div
                  key={kpi.kpi_code}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-medium truncate">{kpi.kpi_code}</span>
                      <Badge variant="outline" className="text-[9px] shrink-0">{kpi.techno || 'N/A'}</Badge>
                      <Badge variant="outline" className="text-[9px] shrink-0">{kpi.formula_type}</Badge>
                    </div>
                    {kpi.nom_ihm && kpi.nom_ihm !== kpi.kpi_code && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{kpi.nom_ihm}</p>
                    )}
                  </div>
                  <Switch
                    checked={kpi.is_materialized_default}
                    onCheckedChange={() => handleToggleKpi(kpi)}
                  />
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {kpiTotal > 50 && (
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-xs text-muted-foreground">
                Showing {kpiPage * 50 + 1}–{Math.min((kpiPage + 1) * 50, kpiTotal)} of {kpiTotal}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={kpiPage === 0} onClick={() => setKpiPage(p => p - 1)}>
                  Prev
                </Button>
                <Button variant="outline" size="sm" disabled={(kpiPage + 1) * 50 >= kpiTotal} onClick={() => setKpiPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
};

/* ── Mini stat card ── */
function MiniStat({ icon, label, value, small }: { icon: React.ReactNode; label: string; value: string | number; small?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className={`font-bold ${small ? 'text-sm' : 'text-xl'} tracking-tight`}>{value}</p>
    </div>
  );
}

export default KpiEngineConfig;
