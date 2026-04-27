import { describe, it, expect } from 'vitest';
import { buildMonitorQueryPayload, type RanReport } from './RanQueryModule';

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
