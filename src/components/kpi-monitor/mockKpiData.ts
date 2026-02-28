import { KpiTimeSeriesPoint, KpiSummaryRow, KpiMapPoint, KpiQueryRequest, KpiQueryResponse, Granularity, SplitDimension } from './types';
import { KPI_CATALOG_MAP } from './kpiCatalog';

const SPLIT_VALUES: Record<SplitDimension, string[]> = {
  DR: ['DR IDF', 'DR SUD', 'DR NORD', 'DR EST', 'DR OUEST', 'DR CENTRE', 'DR SO'],
  DOR: ['DOR Paris', 'DOR Lyon', 'DOR Marseille', 'DOR Lille', 'DOR Bordeaux', 'DOR Toulouse', 'DOR Strasbourg', 'DOR Nantes'],
  ZONE_ARCEP: ['ZTD', 'ZMD Dense', 'ZMD Intermédiaire', 'ZMD Rurale'],
  BAND: ['700', '800', '1800', '2100', '2600', '3500'],
  PLAQUE: ['P1', 'P2', 'P3', 'P4', 'P5'],
  SITE: ['SITE_001', 'SITE_002', 'SITE_003', 'SITE_004', 'SITE_005', 'SITE_006', 'SITE_007', 'SITE_008'],
  CELL: ['CELL_A1', 'CELL_A2', 'CELL_B1', 'CELL_B2', 'CELL_C1'],
  VENDOR: ['Nokia', 'Ericsson', 'Huawei'],
  TECHNO: ['4G', '5G'],
};

function seedRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function getBaseValue(kpiKey: string): { base: number; variance: number } {
  const map: Record<string, { base: number; variance: number }> = {
    rrc_setup_sr: { base: 97.5, variance: 2 },
    erab_setup_sr: { base: 96.8, variance: 2.5 },
    dl_tp_avg: { base: 42, variance: 15 },
    ul_tp_avg: { base: 12, variance: 5 },
    latency_avg: { base: 28, variance: 12 },
    drop_rate: { base: 1.2, variance: 0.8 },
    qoe_score: { base: 78, variance: 10 },
    traffic_dl_gb: { base: 850, variance: 200 },
    sessions_count: { base: 15000, variance: 5000 },
    tcp_retrans_rate: { base: 3.2, variance: 1.5 },
  };
  return map[kpiKey] || { base: 50, variance: 10 };
}

function autoGranularity(from: string, to: string): Granularity {
  const diff = (new Date(to).getTime() - new Date(from).getTime()) / 86400000;
  if (diff <= 2) return '15m';
  if (diff <= 60) return '1h';
  return '1d';
}

function generateTimestamps(from: string, to: string, gran: Granularity): string[] {
  const start = new Date(from);
  const end = new Date(to);
  const step = gran === '15m' ? 900000 : gran === '1h' ? 3600000 : 86400000;
  const ts: string[] = [];
  let cur = start.getTime();
  while (cur <= end.getTime()) {
    ts.push(new Date(cur).toISOString());
    cur += step;
  }
  return ts;
}

export function generateMockTimeSeries(req: KpiQueryRequest): KpiQueryResponse {
  const gran = req.granularity === 'auto' ? autoGranularity(req.date_from, req.date_to) : req.granularity;
  const timestamps = generateTimestamps(req.date_from, req.date_to, gran);
  const data: KpiTimeSeriesPoint[] = [];

  for (const kpiSel of req.kpis) {
    const { base, variance } = getBaseValue(kpiSel.kpi_key);
    const splits = req.split_by ? SPLIT_VALUES[req.split_by] || ['ALL'] : ['ALL'];
    const topSplits = splits.slice(0, req.top_n);
    const otherSplits = splits.slice(req.top_n);

    for (const sv of topSplits) {
      const rng = seedRandom(sv.charCodeAt(0) * 1000 + kpiSel.kpi_key.length);
      let prev = base + (rng() - 0.5) * variance;
      for (const ts of timestamps) {
        prev += (rng() - 0.5) * variance * 0.3;
        prev = Math.max(0, prev);
        data.push({ ts, kpi_key: kpiSel.kpi_key, split_value: sv, value: Math.round(prev * 100) / 100 });
      }
    }

    if (req.include_others && otherSplits.length > 0) {
      const rng = seedRandom(42 + kpiSel.kpi_key.length);
      let prev = base;
      for (const ts of timestamps) {
        prev += (rng() - 0.5) * variance * 0.2;
        prev = Math.max(0, prev);
        data.push({ ts, kpi_key: kpiSel.kpi_key, split_value: 'Others', value: Math.round(prev * 100) / 100 });
      }
    }
  }

  const totalSeries = new Set(data.map(d => `${d.kpi_key}|${d.split_value}`)).size;
  return { data, granularity_used: gran, total_series: totalSeries, truncated: totalSeries > 50 };
}

export function generateMockSummary(req: KpiQueryRequest): KpiSummaryRow[] {
  const resp = generateMockTimeSeries(req);
  const groups = new Map<string, KpiTimeSeriesPoint[]>();
  for (const pt of resp.data) {
    const key = `${pt.kpi_key}|${pt.split_value}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(pt);
  }

  const rows: KpiSummaryRow[] = [];
  for (const [key, pts] of groups) {
    const [kpi_key, split_value] = key.split('|');
    const values = pts.map(p => p.value);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const last = values[values.length - 1];
    const first = values[0];
    rows.push({
      split_value, kpi_key,
      avg: Math.round(avg * 100) / 100,
      min: Math.round(Math.min(...values) * 100) / 100,
      max: Math.round(Math.max(...values) * 100) / 100,
      last: Math.round(last * 100) / 100,
      delta_pct: first !== 0 ? Math.round(((last - first) / first) * 10000) / 100 : 0,
    });
  }
  return rows;
}

export function generateMockMapPoints(kpiKey: string): KpiMapPoint[] {
  const rng = seedRandom(kpiKey.length * 7);
  const { base, variance } = getBaseValue(kpiKey);
  const points: KpiMapPoint[] = [];
  const cities = [
    { name: 'Paris', lat: 48.85, lon: 2.35 }, { name: 'Lyon', lat: 45.75, lon: 4.85 },
    { name: 'Marseille', lat: 43.30, lon: 5.37 }, { name: 'Toulouse', lat: 43.60, lon: 1.44 },
    { name: 'Bordeaux', lat: 44.84, lon: -0.58 }, { name: 'Lille', lat: 50.63, lon: 3.06 },
    { name: 'Strasbourg', lat: 48.58, lon: 7.75 }, { name: 'Nantes', lat: 47.22, lon: -1.55 },
    { name: 'Montpellier', lat: 43.61, lon: 3.87 }, { name: 'Rennes', lat: 48.11, lon: -1.68 },
  ];
  for (let i = 0; i < 60; i++) {
    const city = cities[i % cities.length];
    points.push({
      id: `site_${i}`,
      lat: city.lat + (rng() - 0.5) * 0.5,
      lon: city.lon + (rng() - 0.5) * 0.5,
      value: Math.round((base + (rng() - 0.5) * variance * 2) * 100) / 100,
      label: `SITE_${String(i).padStart(3, '0')}`,
      meta: { vendor: ['Nokia', 'Ericsson', 'Huawei'][i % 3], techno: i % 3 === 0 ? '5G' : '4G' },
    });
  }
  return points;
}
