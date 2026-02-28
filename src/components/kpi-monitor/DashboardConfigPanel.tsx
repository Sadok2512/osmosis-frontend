import React, { useState } from 'react';
import { useGlobalFilterStore } from '@/stores/globalFilterStore';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { KpiCatalogEntry, SplitDimension } from './types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { ChevronUp, ChevronDown, Calendar, Layers, BarChart3, GitBranch, X, Plus, Settings2, Database } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import KPICatalogImport from './KPICatalogImport';
import { Button } from '../ui/button';

const SPLIT_OPTIONS: { value: SplitDimension; label: string }[] = [
  { value: 'DR', label: 'DR' }, { value: 'DOR', label: 'DOR' },
  { value: 'ZONE_ARCEP', label: 'Zone ARCEP' }, { value: 'BAND', label: 'Bande' },
  { value: 'PLAQUE', label: 'Plaque' }, { value: 'SITE', label: 'Site' },
  { value: 'CELL', label: 'Cellule' }, { value: 'VENDOR', label: 'Vendor' },
  { value: 'TECHNO', label: 'Techno' },
];

interface DashboardConfigPanelProps {
  catalogMap: Record<string, KpiCatalogEntry>;
  onOpenKpiSelector: () => void;
  seriesInfo: { total: number; granularity: string; truncated: boolean };
  catalog: KpiCatalogEntry[];
  catalogSource: 'static' | 'db';
  onRefreshCatalog: () => void;
}

const DashboardConfigPanel: React.FC<DashboardConfigPanelProps> = ({
  catalogMap, onOpenKpiSelector, seriesInfo, catalog, catalogSource, onRefreshCatalog,
}) => {
  const globalFilter = useGlobalFilterStore();
  const store = useKpiMonitorStore();
  const [isOpen, setIsOpen] = useState(true);
  const [showCatalog, setShowCatalog] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border-b border-border bg-card/60">
        {/* Toggle header */}
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-muted/30 transition-colors group">
            <div className="flex items-center gap-2">
              <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Configuration</span>
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                {store.selectedKpis.length} KPI{store.selectedKpis.length > 1 ? 's' : ''}
              </Badge>
              <span className="text-[9px] text-muted-foreground">
                • {seriesInfo.total} séries • {seriesInfo.granularity}
              </span>
              {seriesInfo.truncated && <Badge variant="destructive" className="text-[8px] h-4">Tronqué</Badge>}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-muted-foreground">
                {catalogSource === 'db' ? '✓ Base de données' : 'Catalogue statique'} • {catalog.length} KPIs
              </span>
              {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-3 pt-1">
            {/* Horizontal config cards */}
            <div className="grid grid-cols-4 gap-3">
              {/* ── PÉRIODE ── */}
              <div className="rounded-xl border border-border bg-background p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Période</span>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="date"
                    value={globalFilter.dateFrom}
                    onChange={e => globalFilter.setDateRange(e.target.value, globalFilter.dateTo)}
                    className="flex-1 px-2 py-1 rounded-md border border-border bg-card text-[11px] text-foreground outline-none focus:ring-1 focus:ring-primary/30"
                  />
                  <input
                    type="date"
                    value={globalFilter.dateTo}
                    onChange={e => globalFilter.setDateRange(globalFilter.dateFrom, e.target.value)}
                    className="flex-1 px-2 py-1 rounded-md border border-border bg-card text-[11px] text-foreground outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
                <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
                  {['7D', '14D', '30D', '90D'].map(preset => {
                    const days = parseInt(preset);
                    return (
                      <button
                        key={preset}
                        onClick={() => {
                          const to = new Date();
                          const from = new Date(to.getTime() - days * 86400000);
                          globalFilter.setDateRange(from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
                        }}
                        className="flex-1 px-1.5 py-1 text-[10px] font-bold rounded hover:bg-primary hover:text-primary-foreground transition-colors text-muted-foreground"
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── GRANULARITÉ ── */}
              <div className="rounded-xl border border-border bg-background p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Granularité</span>
                </div>
                <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
                  {[
                    { value: 'auto', label: 'Auto' },
                    { value: '15m', label: '15m' },
                    { value: '1h', label: '1h' },
                    { value: '1d', label: '1j' },
                  ].map(g => (
                    <button
                      key={g.value}
                      onClick={() => globalFilter.setGranularity(g.value as any)}
                      className={`flex-1 px-2 py-1.5 rounded text-[10px] font-bold transition-all ${
                        globalFilter.granularity === g.value
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-card'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground">
                  {globalFilter.granularity === 'auto' ? 'Sélection automatique selon la période' : `Fixé à ${globalFilter.granularity}`}
                </p>
              </div>

              {/* ── KPIs SÉLECTIONNÉS ── */}
              <div className="rounded-xl border border-border bg-background p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">KPIs</span>
                  </div>
                  <button
                    onClick={onOpenKpiSelector}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[10px] font-semibold"
                  >
                    <Plus className="w-3 h-3" /> Ajouter
                  </button>
                </div>
                {store.selectedKpis.length === 0 ? (
                  <button
                    onClick={onOpenKpiSelector}
                    className="w-full py-3 rounded-lg border border-dashed border-border hover:border-primary/30 transition-colors flex items-center justify-center gap-1.5 text-muted-foreground hover:text-primary text-[10px]"
                  >
                    <BarChart3 className="w-3.5 h-3.5" /> Sélectionner des KPIs
                  </button>
                ) : (
                  <div className="space-y-0.5 max-h-[100px] overflow-y-auto">
                    {store.selectedKpis.map(kpi => {
                      const cat = catalogMap[kpi.kpi_key];
                      return (
                        <div key={kpi.kpi_key} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/40 group">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat?.color }} />
                          <span className="text-[10px] font-medium text-foreground truncate flex-1">{cat?.display_name || kpi.kpi_key}</span>
                          <select
                            value={kpi.agg}
                            onChange={e => store.updateKpi(kpi.kpi_key, { agg: e.target.value as any })}
                            className="h-5 text-[9px] bg-card border border-border rounded px-1 outline-none"
                          >
                            {(cat?.allowed_aggs || ['avg', 'sum', 'max', 'min']).map(a => (
                              <option key={a} value={a}>{a.toUpperCase()}</option>
                            ))}
                          </select>
                          <select
                            value={kpi.axis}
                            onChange={e => store.updateKpi(kpi.kpi_key, { axis: e.target.value as any })}
                            className="h-5 text-[9px] bg-card border border-border rounded px-1 outline-none w-8"
                          >
                            <option value="left">L</option>
                            <option value="right">R</option>
                          </select>
                          <button
                            onClick={() => store.removeKpi(kpi.kpi_key)}
                            className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── SPLIT BY ── */}
              <div className="rounded-xl border border-border bg-background p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Split par</span>
                </div>
                <Select value={store.splitBy || 'none'} onValueChange={v => store.setSplitBy(v === 'none' ? null : v as SplitDimension)}>
                  <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Aucun" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {SPLIT_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {store.splitBy && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-muted-foreground">Top</span>
                      <input
                        type="number" min={1} max={20} value={store.topN}
                        onChange={e => store.setTopN(parseInt(e.target.value) || 5)}
                        className="w-10 px-1 py-0.5 rounded border border-border bg-card text-[10px] text-center outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch checked={store.includeOthers} onCheckedChange={store.setIncludeOthers} className="scale-75" />
                      <span className="text-[9px] text-muted-foreground">Others</span>
                    </div>
                  </div>
                )}
                {/* Catalog import collapsible */}
                <Collapsible open={showCatalog} onOpenChange={setShowCatalog}>
                  <CollapsibleTrigger className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors mt-1">
                    <Database className="w-3 h-3" /> Catalogue KPI
                    {showCatalog ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <KPICatalogImport />
                    <Button variant="outline" size="sm" className="w-full mt-1.5 text-[9px] h-6 gap-1" onClick={onRefreshCatalog}>
                      Recharger catalogue
                    </Button>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export default DashboardConfigPanel;
