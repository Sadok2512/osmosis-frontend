import { describe, it, expect } from 'vitest';
import { buildMonitorQueryPayload, resolvePivotKpiColumns, type RanReport } from './RanQueryModule';

const baseReport = (overrides: Partial<RanReport> = {}): RanReport => ({
  id: 'r1',
  name: 'Test',
  vendor: 'Nokia',
  technologies: ['4G'],
  kpis: ['DL_VOLUME_IP_GBytes'],
  timeConfig: {
    timeMode: 'relative',
    value: 90,
    unit: 'days',
    end: 'now',
    granularity: '1d',
  } as any,
  status: 'Ready',
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
  lastRunAt: null,
  results: [],
  ...overrides,
});

describe('buildMonitorQueryPayload — multi-dim aggregation', () => {
  it('sends split_by_list when multiple aggregations are selected', () => {
    const report = baseReport({ aggregations: ['plaque', 'site'] });
    const payload = buildMonitorQueryPayload(report, 'Nokia', ['DL_VOLUME_IP_GBytes']);

    expect(payload.split_by_list).toEqual(['PLAQUE', 'SITE']);
    // back-compat: split_by stays as first entry so older backends still work
    expect(payload.split_by).toBe('PLAQUE');
  });

  it('handles three-dim breakdown plaque + site + cell', () => {
    const report = baseReport({ aggregations: ['plaque', 'site', 'cell'] });
    const payload = buildMonitorQueryPayload(report, 'Nokia', ['DL_VOLUME_IP_GBytes']);

    expect(payload.split_by_list).toEqual(['PLAQUE', 'SITE', 'CELL']);
    expect(payload.kpi_level).toBe('CELL');
  });

  it('omits split_by_list for single non-cell aggregation', () => {
    const report = baseReport({ aggregations: ['site'] });
    const payload = buildMonitorQueryPayload(report, 'Nokia', ['DL_VOLUME_IP_GBytes']);

    // Single dim: still emit list for consistency, only one entry
    expect(payload.split_by_list).toEqual(['SITE']);
    expect(payload.split_by).toBe('SITE');
  });

  it('emits null split_by when only cell is selected (no break-down dim)', () => {
    const report = baseReport({ aggregations: ['cell'] });
    const payload = buildMonitorQueryPayload(report, 'Nokia', ['DL_VOLUME_IP_GBytes']);

    // 'cell' alone is the legacy "no split" mode → split_by stays null
    expect(payload.split_by).toBeNull();
    expect(payload.split_by_list).toEqual(['CELL']);
    expect(payload.kpi_level).toBe('CELL');
  });
});

describe('resolvePivotKpiColumns — render all selected KPIs', () => {
  it('returns user-selected KPIs even when results are empty', () => {
    const report = { kpis: ['K1', 'K2', 'K3'], results: [] };
    expect(resolvePivotKpiColumns(report)).toEqual(['K1', 'K2', 'K3']);
  });

  it('keeps the user-selected order even when only one KPI returned data', () => {
    const report = {
      kpis: ['DL_VOL', 'ERAB_SR', 'CSSR', 'HOSR'],
      results: [
        { kpi: 'DL_VOL' },
        { kpi: 'DL_VOL' },
      ],
    };
    expect(resolvePivotKpiColumns(report)).toEqual(['DL_VOL', 'ERAB_SR', 'CSSR', 'HOSR']);
  });

  it('appends KPIs in results that were not in the original selection', () => {
    // Edge case: backend returned data for an aliased/extra KPI
    const report = {
      kpis: ['K1'],
      results: [{ kpi: 'K1' }, { kpi: 'K_EXTRA' }],
    };
    expect(resolvePivotKpiColumns(report)).toEqual(['K1', 'K_EXTRA']);
  });

  it('deduplicates within results and against the selection', () => {
    const report = {
      kpis: ['K1', 'K2'],
      results: [{ kpi: 'K1' }, { kpi: 'K1' }, { kpi: 'K3' }, { kpi: 'K3' }],
    };
    expect(resolvePivotKpiColumns(report)).toEqual(['K1', 'K2', 'K3']);
  });

  it('handles missing kpis array', () => {
    const report = { results: [{ kpi: 'K_RESULT' }] };
    expect(resolvePivotKpiColumns(report)).toEqual(['K_RESULT']);
  });
});
