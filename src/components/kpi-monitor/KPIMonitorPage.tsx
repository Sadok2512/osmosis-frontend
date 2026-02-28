import React, { useMemo } from 'react';
import { useKpiMonitorStore } from '../../stores/kpiMonitorStore';
import { useGlobalFilterStore } from '../../stores/globalFilterStore';
import { KPI_CATALOG } from './kpiCatalog';
import { generateMockTimeSeries, generateMockSummary } from './mockKpiData';
import EChartsTimeSeries from './EChartsTimeSeries';
import KPITableView from './KPITableView';
import { SplitDimension, AggFunc, KpiSelection, DynamicFilter } from './types';
import {
  BarChart3, Table2, Map as MapIcon, Plus, X, ChevronDown,
  Filter, Layers, Download, Settings2,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';

const SPLIT_OPTIONS: { value: SplitDimension; label: string }[] = [
  { value: 'DR', label: 'DR' }, { value: 'DOR', label: 'DOR' },
  { value: 'ZONE_ARCEP', label: 'Zone ARCEP' }, { value: 'BAND', label: 'Bande' },
  { value: 'PLAQUE', label: 'Plaque' }, { value: 'SITE', label: 'Site' },
  { value: 'CELL', label: 'Cellule' }, { value: 'VENDOR', label: 'Vendor' },
  { value: 'TECHNO', label: 'Techno' },
];

const KPIMonitorPage: React.FC = () => {
  const store = useKpiMonitorStore();
  const globalFilter = useGlobalFilterStore();

  const queryRequest = useMemo(() => ({
    date_from: globalFilter.dateFrom,
    date_to: globalFilter.dateTo,
    granularity: globalFilter.granularity,
    kpis: store.selectedKpis,
    filters: store.localFilters,
    split_by: store.splitBy,
    top_n: store.topN,
    include_others: store.includeOthers,
  }), [globalFilter, store.selectedKpis, store.localFilters, store.splitBy, store.topN, store.includeOthers]);

  const tsResponse = useMemo(() => generateMockTimeSeries(queryRequest), [queryRequest]);
  const summaryRows = useMemo(() => generateMockSummary(queryRequest), [queryRequest]);

  const addKpi = () => {
    const available = KPI_CATALOG.filter(k => !store.selectedKpis.some(s => s.kpi_key === k.kpi_key));
    if (available.length === 0) return;
    store.addKpi({ kpi_key: available[0].kpi_key, agg: available[0].default_agg, axis: 'left' });
  };

  const addFilter = () => {
    store.addFilter({ id: crypto.randomUUID(), dimension: 'VENDOR', op: 'IN', values: [] });
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── LEFT CONFIG PANEL ── */}
      <div className="w-[320px] shrink-0 border-r border-border bg-card overflow-y-auto">
        <div className="p-4 space-y-5">
          {/* Header */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              KPI Monitor
            </h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">Configuration des indicateurs</p>
          </div>

          {/* Date Range */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Période</label>
            <div className="flex gap-2">
              <input type="date" value={globalFilter.dateFrom} onChange={e => globalFilter.setDateRange(e.target.value, globalFilter.dateTo)}
                className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs" />
              <input type="date" value={globalFilter.dateTo} onChange={e => globalFilter.setDateRange(globalFilter.dateFrom, e.target.value)}
                className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs" />
            </div>
            <div className="flex gap-1">
              {['7D', '14D', '30D', '90D'].map(preset => {
                const days = parseInt(preset);
                return (
                  <button key={preset} onClick={() => {
                    const to = new Date();
                    const from = new Date(to.getTime() - days * 86400000);
                    globalFilter.setDateRange(from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
                  }} className="px-2 py-1 text-[10px] font-bold rounded-md bg-muted hover:bg-primary hover:text-primary-foreground transition-colors">
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Granularity */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Granularité</label>
            <Select value={globalFilter.granularity} onValueChange={(v) => globalFilter.setGranularity(v as any)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="15m">15 min</SelectItem>
                <SelectItem value="1h">1 heure</SelectItem>
                <SelectItem value="1d">1 jour</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* KPI Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">KPIs sélectionnés</label>
              <button onClick={addKpi} className="text-primary hover:text-primary/80"><Plus className="w-4 h-4" /></button>
            </div>
            {store.selectedKpis.map((kpi) => {
              const cat = KPI_CATALOG.find(k => k.kpi_key === kpi.kpi_key);
              return (
                <div key={kpi.kpi_key} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat?.color }} />
                  <Select value={kpi.kpi_key} onValueChange={(v) => {
                    store.removeKpi(kpi.kpi_key);
                    const newCat = KPI_CATALOG.find(k => k.kpi_key === v);
                    store.addKpi({ kpi_key: v, agg: newCat?.default_agg || 'avg', axis: kpi.axis });
                  }}>
                    <SelectTrigger className="h-7 text-[11px] flex-1 border-0 bg-transparent p-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {KPI_CATALOG.map(k => <SelectItem key={k.kpi_key} value={k.kpi_key}>{k.display_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={kpi.axis} onValueChange={(v) => store.updateKpi(kpi.kpi_key, { axis: v as any })}>
                    <SelectTrigger className="h-7 w-14 text-[10px] border-0 bg-transparent p-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">L</SelectItem>
                      <SelectItem value="right">R</SelectItem>
                    </SelectContent>
                  </Select>
                  {store.selectedKpis.length > 1 && (
                    <button onClick={() => store.removeKpi(kpi.kpi_key)} className="text-muted-foreground hover:text-red-500">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Split */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Split par</label>
            <Select value={store.splitBy || 'none'} onValueChange={(v) => store.setSplitBy(v === 'none' ? null : v as SplitDimension)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Aucun" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                {SPLIT_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {store.splitBy && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] text-muted-foreground">Top</label>
                  <input type="number" min={1} max={20} value={store.topN}
                    onChange={e => store.setTopN(parseInt(e.target.value) || 5)}
                    className="w-12 px-1.5 py-1 rounded-md border border-border bg-background text-xs text-center" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Switch checked={store.includeOthers} onCheckedChange={store.setIncludeOthers} />
                  <label className="text-[10px] text-muted-foreground">Others</label>
                </div>
              </div>
            )}
          </div>

          {/* Dynamic Filters */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Filter className="w-3 h-3" /> Filtres
              </label>
              <button onClick={addFilter} className="text-primary hover:text-primary/80"><Plus className="w-4 h-4" /></button>
            </div>
            {store.localFilters.map(f => (
              <div key={f.id} className="flex items-center gap-1.5 p-1.5 rounded-lg bg-muted/50 border border-border">
                <Select value={f.dimension} onValueChange={(v) => store.updateFilter(f.id, { dimension: v })}>
                  <SelectTrigger className="h-6 text-[10px] flex-1 border-0 bg-transparent p-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SPLIT_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button onClick={() => store.removeFilter(f.id)} className="text-muted-foreground hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Info */}
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
            <p className="text-[10px] text-muted-foreground">
              <span className="font-bold text-primary">{tsResponse.total_series}</span> séries •{' '}
              <span className="font-bold">{tsResponse.granularity_used}</span> granularité
              {tsResponse.truncated && <Badge variant="destructive" className="ml-1 text-[8px]">Tronqué</Badge>}
            </p>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/50">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {([
              { mode: 'graph' as const, icon: BarChart3, label: 'Graph' },
              { mode: 'table' as const, icon: Table2, label: 'Table' },
              { mode: 'map' as const, icon: MapIcon, label: 'Map' },
            ]).map(({ mode, icon: Icon, label }) => (
              <button key={mode} onClick={() => store.setViewMode(mode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  store.viewMode === mode ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {store.selectedKpis.map(k => {
              const cat = KPI_CATALOG.find(c => c.kpi_key === k.kpi_key);
              return (
                <Badge key={k.kpi_key} variant="secondary" className="text-[10px] gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat?.color }} />
                  {cat?.display_name} ({k.axis.toUpperCase()})
                </Badge>
              );
            })}
            {store.splitBy && (
              <Badge variant="outline" className="text-[10px]">
                <Layers className="w-3 h-3 mr-1" /> Split: {store.splitBy}
              </Badge>
            )}
          </div>
        </div>

        {/* View content */}
        <div className="flex-1 overflow-auto p-4">
          {store.viewMode === 'graph' && (
            <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
              <EChartsTimeSeries data={tsResponse.data} height={520} />
            </div>
          )}
          {store.viewMode === 'table' && (
            <KPITableView rows={summaryRows} />
          )}
          {store.viewMode === 'map' && (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm bg-card rounded-2xl border border-border">
              <MapIcon className="w-8 h-8 mr-2 opacity-30" />
              Vue Map — V1.2
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KPIMonitorPage;
