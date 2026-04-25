import type { DataPoint, GraphSlot } from './types';
import { buildTimeline } from './timeUtils';

export type RuntimeDataPoint = DataPoint & {
  _slotId?: string;
  time?: string;
  timestamp?: string;
  date?: string;
  NE?: string;
  ne?: string;
  plaque?: string;
  plaque_name?: string;
  cell?: string;
  cell_name?: string;
  site?: string;
  site_name?: string;
  dimensionName?: string;
  dimension_name?: string;
  dimName?: string;
  dimension?: any;
  dimensions?: any;
  dims?: Array<{ key?: string; name?: string; value?: string }>;
  labels?: Record<string, string>;
  tags?: Record<string, string>;
  kpiName?: string;
  kpi_name?: string;
  metric?: string;
  metricName?: string;
  metric_name?: string;
  kpiValue?: number;
  kpi_value?: number;
  measureValue?: number;
  measure_value?: number;
};

export type TableColumnKind = 'time' | 'filter' | 'split' | 'dimension' | 'kpi';

export interface TableColumn {
  key: string;
  label: string;
  kind: TableColumnKind;
}

export interface PivotTableRow {
  time: string;
  rawTime: string;
  values: Record<string, string | number | null>;
  kpiValues: Record<string, number | null>;
}

export interface PivotTableResult {
  columns: TableColumn[];
  rows: PivotTableRow[];
  kpiColumns: string[];
}

interface TableTimeContext {
  startDate?: string;
  endDate?: string;
  granularity?: string;
}

const FILTER_EXCLUDE = new Set([
  'VENDOR',
  'TECHNOLOGY',
  'TECHNO',
  'KPI_LEVEL',
  'PROFILE_QCI',
  'PROFILE_ARP',
  'NEIGHBOR_TYPE',
]);

const SPLIT_NONE = new Set(['', 'NONE', 'ALL']);

export const TABLE_ACCENT_TEXT_CLASS = 'text-[#14746C]';
export const TABLE_ACCENT_BG_CLASS = 'bg-[#14746C]/8';
export const TABLE_ACCENT_BORDER_CLASS = 'border-[#14746C]/15';

const cleanKpi = (k: string) => (k.includes('@') ? k.split('@')[0] : k);

export function formatInvestigatorTime(ts: string) {
  return ts.length > 10 ? ts.slice(0, 16).replace('T', ' ') : ts;
}

export function formatInvestigatorValue(v: number | null | undefined) {
  if (v == null) return '—';
  const num = Number(v);
  if (!isFinite(num)) return '—';
  if (num === 0) return '0';
  const abs = Math.abs(num);
  let fractionDigits = 2;
  if (abs > 0 && abs < 0.01) {
    fractionDigits = Math.min(8, Math.max(2, 2 - Math.floor(Math.log10(abs))));
  } else if (abs < 1) {
    fractionDigits = 4;
  }
  return num.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: fractionDigits,
  });
}

export function normalizeDimensionLabel(label?: string | null): string {
  if (!label) return 'NE';
  const raw = String(label).trim();
  if (!raw) return 'NE';
  const normalized = raw.toUpperCase();
  if (normalized === 'ZONE_ARCEP') return 'ZONE ARCEP';
  return normalized;
}

function getFirstDimensionEntries(item: RuntimeDataPoint) {
  const list: Array<{ key?: string; name?: string; value?: string }> = [];
  if (Array.isArray(item.dimensions)) list.push(...item.dimensions);
  if (Array.isArray(item.dims)) list.push(...item.dims);
  return list.filter(Boolean);
}

export function getTimeValue(item: RuntimeDataPoint): string | null {
  const candidate = item.time ?? item.timestamp ?? item.date;
  if (!candidate) return null;
  const value = String(candidate).trim();
  return value || null;
}

export function getKpiName(item: RuntimeDataPoint): string | null {
  const candidate =
    item.kpi ||
    item.kpiName ||
    item.kpi_name ||
    item.metric ||
    item.metricName ||
    item.metric_name;

  if (!candidate) return null;
  const value = cleanKpi(String(candidate).trim());
  return value || null;
}

export function getKpiValue(item: RuntimeDataPoint): number | null {
  const candidate =
    item.value ??
    item.kpiValue ??
    item.kpi_value ??
    item.measureValue ??
    item.measure_value;

  if (candidate == null) return null;
  const num = Number(candidate);
  return isFinite(num) ? num : null;
}

function cleanDisplayValue(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text === 'undefined' || text === 'null' || SPLIT_NONE.has(text.toUpperCase())) return null;
  return text;
}

function detectPrimarySplitLabel(item: RuntimeDataPoint, activeSlot?: GraphSlot | null): string | null {
  if (activeSlot?.splitBy && !SPLIT_NONE.has(activeSlot.splitBy.toUpperCase())) {
    return normalizeDimensionLabel(activeSlot.splitBy);
  }

  const firstDimension = getFirstDimensionEntries(item)[0];
  const directLabel =
    item.dimensionName ||
    item.dimension_name ||
    item.dimName ||
    firstDimension?.key ||
    firstDimension?.name;

  return directLabel ? normalizeDimensionLabel(directLabel) : null;
}

function detectSecondarySplitLabel(item: RuntimeDataPoint, activeSlot?: GraphSlot | null): string | null {
  if (activeSlot?.splitBy2 && !SPLIT_NONE.has(activeSlot.splitBy2.toUpperCase())) {
    return normalizeDimensionLabel(activeSlot.splitBy2);
  }

  const dimensions = getFirstDimensionEntries(item);
  const secondDimension = dimensions[1];
  if (!secondDimension) return null;
  return normalizeDimensionLabel(secondDimension.key || secondDimension.name || null);
}

function getFallbackDimensionLabel(item: RuntimeDataPoint, activeSlot?: GraphSlot | null): string {
  const firstDimension = getFirstDimensionEntries(item)[0];
  const directLabel = detectPrimarySplitLabel(item, activeSlot);
  if (directLabel) return directLabel;
  if (item.plaque || item.plaque_name || item.dimension?.plaque || item.labels?.plaque || item.tags?.plaque) return 'PLAQUE';
  if (item.cell || item.cell_name || item.dimension?.cell || item.labels?.cell || item.tags?.cell) return 'CELL';
  if (item.site || item.site_name || item.dimension?.site || item.labels?.site || item.tags?.site) return 'SITE';
  if (item.NE || item.ne || item.dimension?.NE || item.labels?.NE || item.tags?.NE) return 'NE';
  if (item.networkElement) return 'NE';
  return normalizeDimensionLabel(firstDimension?.key || firstDimension?.name || 'NE');
}

function getFallbackDimensionValue(item: RuntimeDataPoint): string {
  const firstDimension = getFirstDimensionEntries(item)[0];
  const candidates = [
    item.networkElement,
    item.splitValue,
    item.NE,
    item.ne,
    item.plaque,
    item.plaque_name,
    item.cell,
    item.cell_name,
    item.site,
    item.site_name,
    item.dimension?.NE,
    item.dimension?.ne,
    item.dimension?.plaque,
    item.dimension?.cell,
    item.dimension?.site,
    !Array.isArray(item.dimensions) ? item.dimensions?.NE : undefined,
    !Array.isArray(item.dimensions) ? item.dimensions?.plaque : undefined,
    !Array.isArray(item.dimensions) ? item.dimensions?.cell : undefined,
    !Array.isArray(item.dimensions) ? item.dimensions?.site : undefined,
    firstDimension?.value,
    firstDimension?.name,
    item.labels?.NE,
    item.labels?.plaque,
    item.labels?.cell,
    item.labels?.site,
    item.tags?.NE,
    item.tags?.plaque,
    item.tags?.cell,
    item.tags?.site,
  ];

  for (const candidate of candidates) {
    const value = cleanDisplayValue(candidate);
    if (value) return value;
  }

  return '—';
}

function buildFilterColumns(filterContext?: Record<string, string[]>) {
  if (!filterContext) return [] as Array<{ key: string; label: string; value: string }>;

  return Object.entries(filterContext)
    .filter(([dimension, values]) => {
      if (!values || values.length === 0) return false;
      const label = normalizeDimensionLabel(dimension);
      return !FILTER_EXCLUDE.has(label);
    })
    .map(([dimension, values]) => ({
      key: `filter:${normalizeDimensionLabel(dimension)}`,
      label: normalizeDimensionLabel(dimension),
      value: values.join(', '),
    }));
}

function getSplitValues(item: RuntimeDataPoint, activeSlot?: GraphSlot | null) {
  const split1Label = detectPrimarySplitLabel(item, activeSlot);
  const split2Label = detectSecondarySplitLabel(item, activeSlot);
  const split1Value = cleanDisplayValue(item.splitValue) || (
    split1Label && ['NE', 'CELL', 'CELLS', 'SITE'].includes(split1Label)
      ? cleanDisplayValue(item.networkElement)
      : null
  );
  const split2Value = cleanDisplayValue(item.splitValue2);

  return {
    split1Label,
    split1Value,
    split2Label,
    split2Value,
  };
}

export function sanitizeTableData(tsData: DataPoint[], activeSlot?: GraphSlot | null): RuntimeDataPoint[] {
  const runtimeData = tsData as RuntimeDataPoint[];
  if (!activeSlot) return runtimeData;

  const slotKeys = new Set([
    ...(activeSlot.kpiIds || []),
    ...((activeSlot as GraphSlot & { counterIds?: string[] }).counterIds || []),
  ]);

  const keyMatches = (point: RuntimeDataPoint) => {
    const pointKpi = getKpiName(point);
    return slotKeys.size === 0 || (!!pointKpi && slotKeys.has(pointKpi));
  };

  const taggedForSlot = runtimeData.filter(point => point._slotId === activeSlot.id && keyMatches(point));
  if (taggedForSlot.length > 0) return taggedForSlot;

  const untaggedMatches = runtimeData.filter(point => point._slotId == null && keyMatches(point));
  if (untaggedMatches.length > 0) return untaggedMatches;

  return runtimeData.filter(keyMatches);
}

export function buildPivotTable(
  tsData: RuntimeDataPoint[],
  activeSlot?: GraphSlot | null,
  filterContext?: Record<string, string[]>,
  timeContext?: TableTimeContext,
): PivotTableResult {
  const rowsByKey = new Map<string, PivotTableRow>();
  const kpiSet = new Set<string>();
  const filterColumns = buildFilterColumns(filterContext);
  const splitColumns = new Map<string, TableColumn>();
  let fallbackDimensionLabel: string | null = null;
  let hasExplicitSplit = false;

  for (const item of tsData) {
    const time = getTimeValue(item);
    const kpiName = getKpiName(item);
    const value = getKpiValue(item);
    if (!time || !kpiName) continue;

    const splitInfo = getSplitValues(item, activeSlot);
    const rowValues: Record<string, string | number | null> = {};
    const keyParts = [time];

    for (const filterCol of filterColumns) {
      rowValues[filterCol.key] = filterCol.value;
      keyParts.push(filterCol.value);
    }

    if (splitInfo.split1Label && splitInfo.split1Value) {
      const key = `split:${splitInfo.split1Label}`;
      splitColumns.set(key, { key, label: splitInfo.split1Label, kind: 'split' });
      rowValues[key] = splitInfo.split1Value;
      keyParts.push(splitInfo.split1Value);
      hasExplicitSplit = true;
    }

    if (splitInfo.split2Label && splitInfo.split2Value) {
      const key = `split:${splitInfo.split2Label}`;
      if (!splitColumns.has(key)) {
        splitColumns.set(key, { key, label: splitInfo.split2Label, kind: 'split' });
      }
      rowValues[key] = splitInfo.split2Value;
      keyParts.push(splitInfo.split2Value);
      hasExplicitSplit = true;
    }

    if (!hasExplicitSplit) {
      const dimensionLabel = getFallbackDimensionLabel(item, activeSlot);
      const dimensionValue = getFallbackDimensionValue(item);
      fallbackDimensionLabel = fallbackDimensionLabel || dimensionLabel;
      rowValues.dimensionValue = dimensionValue;
      keyParts.push(dimensionValue);
    }

    kpiSet.add(kpiName);

    const rowKey = keyParts.join('__');
    if (!rowsByKey.has(rowKey)) {
      rowsByKey.set(rowKey, {
        time: formatInvestigatorTime(time),
        rawTime: time,
        values: rowValues,
        kpiValues: {},
      });
    }

    const row = rowsByKey.get(rowKey)!;
    row.values = { ...row.values, ...rowValues };
    row.kpiValues[kpiName] = value;
    row.values[`kpi:${kpiName}`] = value;
  }

  const kpiColumns = Array.from(kpiSet);
  if (kpiColumns.length === 0 && activeSlot) {
    const fallbackKpis = new Set([
      ...(activeSlot.kpiIds || []),
      ...((activeSlot as GraphSlot & { counterIds?: string[] }).counterIds || []),
    ]);
    kpiColumns.push(...fallbackKpis);
  }
  const columns: TableColumn[] = [{ key: 'time', label: 'TIME', kind: 'time' }];

  filterColumns.forEach((filterCol) => {
    columns.push({ key: filterCol.key, label: filterCol.label, kind: 'filter' });
  });

  if (splitColumns.size > 0) {
    Array.from(splitColumns.values()).forEach((column) => columns.push(column));
  } else if (fallbackDimensionLabel) {
    const filterLabels = new Set(filterColumns.map((f) => f.label));
    if (!filterLabels.has(fallbackDimensionLabel)) {
      columns.push({ key: 'dimensionValue', label: fallbackDimensionLabel, kind: 'dimension' });
    }
  } else if (filterColumns.length === 0) {
    columns.push({ key: 'dimensionValue', label: 'NE', kind: 'dimension' });
  }

  kpiColumns.forEach((kpi) => {
    columns.push({ key: `kpi:${kpi}`, label: kpi, kind: 'kpi' });
  });

  const timeStart = (activeSlot?.startDate && activeSlot.startDate.trim()) || (timeContext?.startDate || '').trim();
  const timeEnd = (activeSlot?.endDate && activeSlot.endDate.trim()) || (timeContext?.endDate || '').trim();
  const timeGranularity = activeSlot?.granularity || timeContext?.granularity || '1d';
  const timeline = timeStart && timeEnd ? buildTimeline(timeStart, timeEnd, timeGranularity) : [];

  if (splitColumns.size > 0 && timeline.length > 0) {
    for (const column of splitColumns.values()) {
      for (const time of timeline) {
        const hasTimeRow = Array.from(rowsByKey.values()).some((row) => row.rawTime === time);
        if (hasTimeRow) continue;
        const values: Record<string, string | number | null> = {};
        filterColumns.forEach((filterCol) => {
          values[filterCol.key] = filterCol.value;
        });
        values[column.key] = '—';
        kpiColumns.forEach((kpi) => {
          values[`kpi:${kpi}`] = null;
        });
        rowsByKey.set(`${time}__placeholder__${column.key}`, {
          time: formatInvestigatorTime(time),
          rawTime: time,
          values,
          kpiValues: Object.fromEntries(kpiColumns.map((kpi) => [kpi, null])),
        });
      }
    }
  } else if (timeline.length > 0) {
    const dimensionColumn = columns.find((column) => column.kind === 'dimension');
    for (const time of timeline) {
      const hasTimeRow = Array.from(rowsByKey.values()).some((row) => row.rawTime === time);
      if (hasTimeRow) continue;
      const values: Record<string, string | number | null> = {};
      filterColumns.forEach((filterCol) => {
        values[filterCol.key] = filterCol.value;
      });
      if (dimensionColumn) values[dimensionColumn.key] = '—';
      kpiColumns.forEach((kpi) => {
        values[`kpi:${kpi}`] = null;
      });
      rowsByKey.set(`${time}__placeholder`, {
        time: formatInvestigatorTime(time),
        rawTime: time,
        values,
        kpiValues: Object.fromEntries(kpiColumns.map((kpi) => [kpi, null])),
      });
    }
  }

  const rows = Array.from(rowsByKey.values())
    .sort((a, b) => {
      const timeDiff = String(b.rawTime).localeCompare(String(a.rawTime));
      if (timeDiff !== 0) return timeDiff;

      const left = columns
        .filter((column) => column.kind !== 'time' && column.kind !== 'kpi')
        .map((column) => String(a.values[column.key] ?? ''))
        .join('__');
      const right = columns
        .filter((column) => column.kind !== 'time' && column.kind !== 'kpi')
        .map((column) => String(b.values[column.key] ?? ''))
        .join('__');
      return left.localeCompare(right);
    });

  return {
    columns,
    rows,
    kpiColumns,
  };
}
