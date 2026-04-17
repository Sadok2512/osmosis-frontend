import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Database,
  Filter as FilterIcon,
  Layers,
  Loader2,
  MapPin,
  Plus,
  Sliders,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const [draftDimensions, setDraftDimensions] = useState<string[]>(['Cell', 'Vendor']);
  const [draftAggregation, setDraftAggregation] = useState<AggregationLevel>('cell');
  const [appliedAggregation, setAppliedAggregation] = useState<AggregationLevel>('cell');
  const [viewMode, setViewMode] = useState<ViewMode>('distribution');

  const [availableParameters, setAvailableParameters] = useState<string[]>([]);
  const [parametersLoading, setParametersLoading] = useState(true);
  const [distinctCache, setDistinctCache] = useState<Record<string, string[]>>({});
  const [distinctLoading, setDistinctLoading] = useState<Record<string, boolean>>({});

  const [rows, setRows] = useState<ParameterRow[]>([]);
  const [mapRows, setMapRows] = useState<ParameterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasApplied, setHasApplied] = useState(false);

  // Load parameter list once on mount
  useEffect(() => {
    let active = true;
    setParametersLoading(true);
    fetchAvailableParameters()
      .then((list) => {
        if (active) setAvailableParameters(list);
      })
      .catch((e) => console.error('[ParameterHub] params fetch failed', e))
      .finally(() => active && setParametersLoading(false));
    return () => {
      active = false;
    };
  }, []);

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
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card/60 backdrop-blur-sm px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Sliders className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">Parameters Hub</h1>
            <p className="text-xs text-muted-foreground">
              Search, filter, and analyze network parameters across topology and dimensions.
            </p>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="shrink-0 border-b border-border bg-card/30 px-6 py-3 space-y-3">
        {/* Row 1 — Parameters + filter chips */}
        <div className="flex items-center flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
            <Sparkles className="w-3 h-3" /> Parameters
          </span>
          <MultiSelectPopover
            title="Select parameters"
            options={availableParameters}
            selected={draftFilters.parameters}
            onConfirm={(v) => setFilterValues('parameters', v)}
            loading={parametersLoading}
            emptyHint="No parameters in catalog"
            trigger={
              <button>
                <FilterChip
                  label="Parameter"
                  values={draftFilters.parameters}
                  tone="primary"
                  icon={<Sparkles className="w-3 h-3" />}
                  onClear={() => setFilterValues('parameters', [])}
                />
              </button>
            }
          />

          <div className="h-6 w-px bg-border mx-1" />

          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
            <FilterIcon className="w-3 h-3" /> Filters
          </span>

          {FILTER_DIMS.map((d) => (
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
                    onClear={() => setFilterValues(d.key, [])}
                  />
                </button>
              }
            />
          ))}

          <div className="flex-1" />

          {totalActiveFilters > 0 && (
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs text-muted-foreground hover:text-destructive border border-transparent hover:border-destructive/30 rounded-full transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Clear all ({totalActiveFilters})
            </button>
          )}
        </div>

        {/* Row 2 — Dimensions / Aggregation / Apply */}
        <div className="flex items-center flex-wrap gap-3">
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
                  icon={<Layers className="w-3 h-3" />}
                />
              </button>
            }
          />

          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-muted/60 border border-border">
            <span className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Aggregate
            </span>
            {AGGREGATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDraftAggregation(opt.value)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                  draftAggregation === opt.value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-foreground/70 hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          <Button
            onClick={handleApply}
            disabled={loading}
            className={cn(
              'h-9 gap-1.5',
              dirty && 'ring-2 ring-primary/40',
            )}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Apply{dirty ? ' *' : ''}
          </Button>
        </div>
      </div>

      {/* View switcher */}
      <div className="shrink-0 border-b border-border bg-background/40 px-6 py-2 flex items-center justify-between">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList className="h-9">
            <TabsTrigger value="distribution" className="gap-1.5 text-xs">
              <BarChart3 className="w-3.5 h-3.5" /> Distribution
            </TabsTrigger>
            <TabsTrigger value="raw" className="gap-1.5 text-xs">
              <Database className="w-3.5 h-3.5" /> Raw Data
            </TabsTrigger>
            <TabsTrigger value="map" className="gap-1.5 text-xs">
              <MapPin className="w-3.5 h-3.5" /> Map
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="text-[11px] text-muted-foreground">
          {hasApplied
            ? `${rows.length.toLocaleString()} rows · ${mapRows.length.toLocaleString()} geo points · agg ${appliedAggregation}`
            : 'Configure filters and click Apply to load data.'}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
            {error}
          </div>
        )}

        {!hasApplied ? (
          <div className="flex flex-col items-center justify-center py-32 text-muted-foreground">
            <Sliders className="w-12 h-12 opacity-30 mb-3" />
            <p className="text-sm font-medium">Pick parameters and filters, then click Apply</p>
            <p className="text-xs mt-1">
              Nothing will load until you apply — keeps the network calm.
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : viewMode === 'distribution' ? (
          <DistributionView rows={rows} aggregation={appliedAggregation} />
        ) : viewMode === 'raw' ? (
          <RawDataView rows={rows} />
        ) : (
          <MapView
            rows={mapRows}
            parameterFocus={appliedFilters.parameters[0]}
          />
        )}
      </div>
    </div>
  );
};

export default ParameterHubPage;
