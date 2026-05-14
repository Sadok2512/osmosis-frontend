import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  Database,
  Filter as FilterIcon,
  History,
  Layers,
  Loader2,
  MapPin,
  Network,
  Plus,
  Share2,
  Sliders,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { lazy, Suspense } from 'react';

const NetworkTopologyPage = lazy(() => import('../otarie/NetworkTopologyPage'));
const NeighborExplorer = lazy(() => import('../investigator/NeighborExplorer'));
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  AggregationLevel,
  EMPTY_FILTERS,
  ParameterHubFilters,
  ParameterRow,
  fetchAvailableParameters,
  fetchDistinctValues,
  fetchParameterMapRows,
  fetchParameterRows,
} from './parameterHubApi';
import FilterChip from './FilterChip';
import MultiSelectPopover from './MultiSelectPopover';
import DistributionView from './DistributionView';
import RawDataView from './RawDataView';
import MapView from './MapView';

type ViewMode = 'distribution' | 'raw' | 'map';
type ExplorerModule = 'parameter-hub' | 'topology' | 'change-history' | 'neighbors';

const FILTER_DIMS: {
  key: keyof Omit<ParameterHubFilters, 'parameters'>;
  label: string;
  column: keyof ParameterRow;
}[] = [
  { key: 'plaque', label: 'Plaque', column: 'plaque' },
  { key: 'site', label: 'Site', column: 'site_name' },
  { key: 'cell', label: 'Cell', column: 'cell_name' },
  { key: 'dor', label: 'DOR', column: 'dor' },
  { key: 'zone_arcep', label: 'Zone ARCEP', column: 'zone_arcep' },
  { key: 'vendor', label: 'Vendor', column: 'vendor' },
  { key: 'bande', label: 'Band', column: 'bande' },
];

const DIMENSION_OPTIONS = [
  'Cell',
  'TAC (4G)',
  'eNodeB ID',
  'gNodeB ID',
  'ECI (4G)',
  'NCI (5G)',
  'Physical Cell ID',
  'DL EARFCN (LTE)',
  'Vendor',
  'Band',
  'Plaque',
  'DOR',
  'Zone ARCEP',
  'Version',
];

const AGGREGATION_OPTIONS: { value: AggregationLevel; label: string }[] = [
  { value: 'cell', label: 'Cell' },
  { value: 'sector', label: 'Sector' },
  { value: 'band', label: 'Band' },
  { value: 'site', label: 'Site' },
  { value: 'plaque', label: 'Plaque' },
  { value: 'dor', label: 'DOR' },
];

const ParameterHubPage: React.FC = () => {
  const [draftFilters, setDraftFilters] = useState<ParameterHubFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ParameterHubFilters>(EMPTY_FILTERS);
  const [activeFilterDims, setActiveFilterDims] = useState<Set<string>>(new Set());
  const [draftDimensions, setDraftDimensions] = useState<string[]>(['Cell', 'Vendor']);
  const [draftAggregation, setDraftAggregation] = useState<AggregationLevel>('sector');
  const [appliedAggregation, setAppliedAggregation] = useState<AggregationLevel>('sector');
  const [viewMode, setViewMode] = useState<ViewMode>('distribution');
  const [activeModule, setActiveModule] = useState<ExplorerModule>('topology');

  const [availableParameters, setAvailableParameters] = useState<string[]>([]);
  const [parametersLoading, setParametersLoading] = useState(false);
  const [distinctCache, setDistinctCache] = useState<Record<string, string[]>>({});
  const [distinctLoading, setDistinctLoading] = useState<Record<string, boolean>>({});

  const [rows, setRows] = useState<ParameterRow[]>([]);
  const [mapRows, setMapRows] = useState<ParameterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasApplied, setHasApplied] = useState(false);

  // Lazy-load parameter list — only when the Parameters multi-select is first opened.
  const loadParameters = useCallback((query = '') => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery && (availableParameters.length > 0 || parametersLoading)) return;
    setParametersLoading(true);
    fetchAvailableParameters(false, normalizedQuery)
      .then((list) => setAvailableParameters(list))
      .catch((e) => console.error('[ParameterHub] params fetch failed', e))
      .finally(() => setParametersLoading(false));
  }, [availableParameters.length, parametersLoading]);

  const ensureDistinct = useCallback(
    (column: keyof ParameterRow) => {
      const k = column as string;
      if (distinctCache[k] || distinctLoading[k]) return;
      setDistinctLoading((s) => ({ ...s, [k]: true }));
      fetchDistinctValues(column)
        .then((vals) => setDistinctCache((c) => ({ ...c, [k]: vals })))
        .catch((e) => console.warn('[ParameterHub] distinct fetch failed', column, e))
        .finally(() => setDistinctLoading((s) => ({ ...s, [k]: false })));
    },
    [distinctCache, distinctLoading],
  );

  const setFilterValues = (key: keyof ParameterHubFilters, values: string[]) => {
    setDraftFilters((f) => ({ ...f, [key]: values }));
  };

  const clearAllFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setActiveFilterDims(new Set());
  };

  const totalActiveFilters = useMemo(() => {
    return (
      draftFilters.parameters.length +
      FILTER_DIMS.reduce((acc, d) => acc + draftFilters[d.key].length, 0)
    );
  }, [draftFilters]);

  const handleApply = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAppliedFilters(draftFilters);
    setAppliedAggregation(draftAggregation);
    setHasApplied(true);
    try {
      const [rawRows, geoRows] = await Promise.all([
        fetchParameterRows(draftFilters, 5000),
        fetchParameterMapRows(draftFilters, 10000),
      ]);
      setRows(rawRows);
      setMapRows(geoRows);
    } catch (e: any) {
      console.error('[ParameterHub] apply failed', e);
      setError(e?.message ?? 'Failed to load parameters');
      setRows([]);
      setMapRows([]);
    } finally {
      setLoading(false);
    }
  }, [draftFilters, draftAggregation]);

  const dirty =
    JSON.stringify(draftFilters) !== JSON.stringify(appliedFilters) ||
    draftAggregation !== appliedAggregation;

  return (
    <div className="flex flex-col h-full bg-[#F7F9FB] overflow-hidden font-sans">
      {/* Scrollable wrapper — content centered in a max-width column */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-[1680px] mx-auto px-10 py-8 space-y-6">
          {/* Header */}
          <header className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 shadow-[0_4px_12px_-2px_rgba(14,124,102,0.35)] flex items-center justify-center shrink-0">
              <Network className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-[22px] font-semibold text-slate-800 tracking-tight leading-tight">
                Network Explorer
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Explore, analyze, and monitor network data across topology.
              </p>
            </div>
          </header>

          {/* Top-level module tabs */}
          <div className="flex items-center gap-1 p-1 rounded-full bg-white border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] w-fit">
            {[
              { key: 'topology' as const, label: 'Topology', icon: Share2 },
              { key: 'parameter-hub' as const, label: 'Parameter Hub', icon: Sliders },
              { key: 'neighbors' as const, label: 'Neighbors', icon: Network },
              { key: 'change-history' as const, label: 'Change History', icon: History },
              { key: 'alarms' as const, label: 'Alarms', icon: Bell },
            ].map((m) => {
              const Icon = m.icon;
              const active = activeModule === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => setActiveModule(m.key)}
                  className={cn(
                    'inline-flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-medium transition-all duration-150',
                    active
                      ? 'bg-gradient-to-b from-teal-500 to-teal-600 text-white shadow-[0_1px_2px_rgba(14,124,102,0.18),0_4px_12px_-2px_rgba(14,124,102,0.30)]'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50',
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {m.label}
                </button>
              );
            })}
          </div>

          {activeModule === 'parameter-hub' && (
          <>
          {/* Main premium card */}
          <div className="rounded-2xl bg-white border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.10)] overflow-hidden">
            {/* Filter bar */}
            <div className="px-7 pt-6 pb-5 border-b border-slate-100">
              <div className="flex items-center gap-2 flex-wrap">
                <MultiSelectPopover
                  title="Select parameters"
                  options={availableParameters}
                  selected={draftFilters.parameters}
                  onConfirm={(v) => setFilterValues('parameters', v)}
                  onOpen={loadParameters}
                  onSearch={loadParameters}
                  loading={parametersLoading}
                  emptyHint="Type at least 2 characters to search parameters"
                  trigger={
                    <button>
                      <FilterChip
                        label="Parameter"
                        values={draftFilters.parameters}
                        tone="primary"
                        icon={<Sparkles className="w-3.5 h-3.5" />}
                        onClear={() => setFilterValues('parameters', [])}
                      />
                    </button>
                  }
                />

                <div className="h-5 w-px bg-slate-200 mx-1" />

                {FILTER_DIMS.filter(d => activeFilterDims.has(d.key) || draftFilters[d.key].length > 0).map((d) => (
                  <MultiSelectPopover
                    key={d.key}
                    title={`Select ${d.label}`}
                    options={distinctCache[d.column as string] ?? []}
                    selected={draftFilters[d.key]}
                    onConfirm={(v) => setFilterValues(d.key, v)}
                    loading={distinctLoading[d.column as string]}
                    emptyHint="No values"
                    trigger={
                      <button onMouseEnter={() => ensureDistinct(d.column)} onClick={() => ensureDistinct(d.column)}>
                        <FilterChip
                          label={d.label}
                          values={draftFilters[d.key]}
                          onClear={() => {
                            setFilterValues(d.key, []);
                            setActiveFilterDims(prev => {
                              const n = new Set(prev);
                              n.delete(d.key);
                              return n;
                            });
                          }}
                        />
                      </button>
                    }
                  />
                ))}

                {/* Add filter dropdown — Investigator-style */}
                {(() => {
                  const remaining = FILTER_DIMS.filter(d => !activeFilterDims.has(d.key) && draftFilters[d.key].length === 0);
                  if (remaining.length === 0) return null;
                  return (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-dashed border-slate-300 text-[12.5px] font-medium text-slate-500 hover:text-teal-700 hover:border-teal-400 hover:bg-teal-50/40 transition-all">
                          <Plus className="w-3.5 h-3.5" /> Ajouter filtre
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-56 p-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
                          Dimensions
                        </div>
                        {remaining.map(d => (
                          <button
                            key={d.key}
                            onClick={() => {
                              setActiveFilterDims(prev => new Set(prev).add(d.key));
                              ensureDistinct(d.column);
                            }}
                            className="w-full text-left px-2 py-1.5 rounded-md text-[12px] hover:bg-accent hover:text-accent-foreground transition-colors"
                          >
                            {d.label}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  );
                })()}

                <div className="flex-1" />

                {totalActiveFilters > 0 && (
                  <button
                    onClick={clearAllFilters}
                    className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-slate-500 hover:text-rose-600 rounded-full transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear all ({totalActiveFilters})
                  </button>
                )}

                <button
                  onClick={handleApply}
                  disabled={loading}
                  className={cn(
                    'inline-flex items-center gap-1.5 h-9 px-5 rounded-full text-[13px] font-semibold text-white transition-all duration-150',
                    'bg-gradient-to-b from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500',
                    'shadow-[0_1px_2px_rgba(14,124,102,0.18),0_4px_12px_-2px_rgba(14,124,102,0.30)]',
                    'hover:shadow-[0_2px_4px_rgba(14,124,102,0.20),0_8px_18px_-4px_rgba(14,124,102,0.40)]',
                    'disabled:opacity-60 disabled:cursor-not-allowed',
                    dirty && !loading && 'ring-2 ring-teal-300/60 ring-offset-1',
                  )}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Apply{dirty ? ' *' : ''}
                </button>
              </div>

              {/* Secondary row — Dimensions & Aggregation */}
              <div className="flex items-center gap-3 flex-wrap mt-4 pt-4 border-t border-slate-100">
                <MultiSelectPopover
                  title="Select dimensions"
                  options={DIMENSION_OPTIONS}
                  selected={draftDimensions}
                  onConfirm={(v) => setDraftDimensions(v)}
                  trigger={
                    <button>
                      <FilterChip
                        label="Dimensions"
                        values={draftDimensions}
                        tone="accent"
                        icon={<Layers className="w-3.5 h-3.5" />}
                      />
                    </button>
                  }
                />

                <div className="inline-flex items-center gap-0.5 p-1 rounded-full bg-slate-100/80 border border-slate-200/60">
                  <span className="px-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                    Aggregate
                  </span>
                  {AGGREGATION_OPTIONS
                    .filter((opt) => viewMode !== 'distribution' || (opt.value !== 'cell' && opt.value !== 'site'))
                    .map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setDraftAggregation(opt.value)}
                      className={cn(
                        'px-3 py-1 rounded-full text-xs font-medium transition-all duration-150',
                        draftAggregation === opt.value
                          ? 'bg-white text-teal-700 shadow-[0_1px_2px_rgba(15,23,42,0.08)]'
                          : 'text-slate-500 hover:text-slate-700',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-7 pt-4 pb-0 flex items-center justify-between border-b border-slate-100">
              <Tabs value={viewMode} onValueChange={(v) => {
                const next = v as ViewMode;
                setViewMode(next);
                if (next === 'distribution' && (draftAggregation === 'cell' || draftAggregation === 'site')) {
                  setDraftAggregation('sector');
                }
              }}>
                <TabsList className="h-10 bg-slate-100/70 p-1 rounded-full">
                  <TabsTrigger
                    value="distribution"
                    className="gap-1.5 text-xs px-4 rounded-full data-[state=active]:bg-white data-[state=active]:text-teal-700 data-[state=active]:shadow-sm"
                  >
                    <BarChart3 className="w-3.5 h-3.5" /> Distribution
                  </TabsTrigger>
                  <TabsTrigger
                    value="raw"
                    className="gap-1.5 text-xs px-4 rounded-full data-[state=active]:bg-white data-[state=active]:text-teal-700 data-[state=active]:shadow-sm"
                  >
                    <Database className="w-3.5 h-3.5" /> Raw Data
                  </TabsTrigger>
                  <TabsTrigger
                    value="map"
                    className="gap-1.5 text-xs px-4 rounded-full data-[state=active]:bg-white data-[state=active]:text-teal-700 data-[state=active]:shadow-sm"
                  >
                    <MapPin className="w-3.5 h-3.5" /> Map
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="text-[11.5px] text-slate-400 font-medium">
                {hasApplied
                  ? `${rows.length.toLocaleString()} rows · ${mapRows.length.toLocaleString()} geo points · aggregation: ${appliedAggregation}`
                  : 'Configure filters and click Apply to load data.'}
              </div>
            </div>

            {/* Content area */}
            <div className="px-6 py-8 bg-gradient-to-b from-white to-slate-50/40 min-h-[520px]">
              {error && (
                <div className="mb-5 mx-auto max-w-3xl px-4 py-3 rounded-xl border border-rose-200 bg-rose-50/60 text-sm text-rose-700">
                  {error}
                </div>
              )}

              {!hasApplied ? (
                <div className="flex flex-col items-center justify-center py-32 text-slate-400">
                  <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center mb-4">
                    <Sliders className="w-7 h-7 text-teal-600/70" />
                  </div>
                  <p className="text-sm font-semibold text-slate-600">
                    Pick parameters and filters, then click Apply
                  </p>
                  <p className="text-xs mt-1.5 text-slate-400">
                    Nothing loads until you apply — keeps the network calm.
                  </p>
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center py-32">
                  <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
                </div>
              ) : viewMode === 'distribution' ? (
                <DistributionView rows={rows} aggregation={draftAggregation} />
              ) : viewMode === 'raw' ? (
                <RawDataView rows={rows} />
              ) : (
                <MapView rows={mapRows} parameterFocus={appliedFilters.parameters[0]} />
              )}
            </div>
          </div>
          </>
          )}

          {activeModule === 'topology' && (
            <div className="rounded-2xl bg-white border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.10)] overflow-hidden min-h-[640px]">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-32">
                    <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
                  </div>
                }
              >
                <NetworkTopologyPage />
              </Suspense>
            </div>
          )}

          {activeModule === 'change-history' && (
            <div className="rounded-2xl bg-white border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.10)] overflow-hidden">
              <div className="px-7 pt-6 pb-5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-teal-600" />
                  <h2 className="text-base font-semibold text-slate-800">Change History</h2>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Track configuration changes over time across the network.
                </p>
              </div>
              <div className="px-6 py-24 bg-gradient-to-b from-white to-slate-50/40 min-h-[520px] flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center mb-4">
                  <History className="w-7 h-7 text-teal-600/70" />
                </div>
                <p className="text-sm font-semibold text-slate-600">Change History — coming soon</p>
                <p className="text-xs mt-1.5 text-slate-400 max-w-sm">
                  This module will show parameter changes (old → new), timestamps, source user/system,
                  and an interactive timeline.
                </p>
              </div>
            </div>
          )}

          {activeModule === 'neighbors' && (
            <div className="rounded-2xl bg-white border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.10)] overflow-hidden">
              <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>}>
                <NeighborExplorer />
              </Suspense>
            </div>
          )}

          {activeModule === 'alarms' && (
            <div className="rounded-2xl bg-white border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.10)] overflow-hidden">
              <div className="px-7 pt-6 pb-5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-teal-600" />
                  <h2 className="text-base font-semibold text-slate-800">Alarms</h2>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Monitor active alerts and anomalies on sites and cells.
                </p>
              </div>
              <div className="px-6 py-24 bg-gradient-to-b from-white to-slate-50/40 min-h-[520px] flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center mb-4">
                  <Bell className="w-7 h-7 text-teal-600/70" />
                </div>
                <p className="text-sm font-semibold text-slate-600">Alarms — coming soon</p>
                <p className="text-xs mt-1.5 text-slate-400 max-w-sm">
                  This module will list severity-coded alarms (active/resolved), affected elements,
                  filters by severity/region/time, and per-alarm sparklines.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ParameterHubPage;
