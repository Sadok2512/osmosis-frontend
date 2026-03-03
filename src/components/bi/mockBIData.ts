import { ChartConfig, BI_DIMENSIONS, BI_KPIS } from './biTypes';

// Seeded random for stable mock data
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const DIMENSION_VALUES: Record<string, string[]> = {
  ORF: ['ORF_IDF', 'ORF_SE', 'ORF_NE', 'ORF_SO', 'ORF_NO'],
  Vendor: ['Ericsson', 'Nokia', 'Huawei', 'Samsung'],
  DOR: ['DOR_IDF', 'DOR_EST', 'DOR_OUEST', 'DOR_SUD', 'DOR_NORD'],
  Plaque: ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Bordeaux', 'Lille', 'Strasbourg'],
  Site: ['SITE_001', 'SITE_002', 'SITE_003', 'SITE_004', 'SITE_005'],
  Cellule: ['CELL_A1', 'CELL_A2', 'CELL_B1', 'CELL_B2', 'CELL_C1'],
  Bande: ['700', '800', '1800', '2100', '2600', '3500'],
  Device_brand: ['Apple', 'Samsung', 'Xiaomi', 'Huawei', 'Oppo'],
  OS: ['iOS', 'Android'],
  AS: ['B2C', 'B2B', 'MVNO'],
  RAT: ['5G', '4G', '3G', '2G'],
  ARCEP: ['Zone_Dense', 'Zone_Intermediaire', 'Zone_Rurale'],
  Application: ['YouTube', 'Netflix', 'WhatsApp', 'Instagram', 'TikTok', 'Spotify'],
  TAC: ['TAC_001', 'TAC_002', 'TAC_003'],
  POP: ['POP_PAR', 'POP_LYO', 'POP_MAR', 'POP_BOR', 'POP_LIL'],
};

export function getDimensionValues(dimension: string): string[] {
  return DIMENSION_VALUES[dimension] || ['Value_1', 'Value_2', 'Value_3'];
}

export function generateChartData(config: ChartConfig): any[] {
  const rng = seededRandom(config.id.charCodeAt(0) * 1000 + config.yMetrics.length);
  const data: any[] = [];

  const activeFilters = (config.filters || []).filter(f => f.values.length > 0);
  const filterMap = new Map<string, Set<string>>();
  for (const f of activeFilters) {
    filterMap.set(f.dimension, new Set(f.values));
  }

  if (config.xAxis.type === 'date') {
    const start = new Date(config.xAxis.dateStart || '2026-02-01');
    const end = new Date(config.xAxis.dateEnd || '2026-02-15');
    const gran = config.xAxis.granularity || 'day';
    const step = gran === 'hour' ? 3600000 : gran === 'day' ? 86400000 : gran === 'week' ? 604800000 : 2592000000;

    let current = start.getTime();
    while (current <= end.getTime()) {
      const point: any = { x: new Date(current).toISOString().split('T')[0] };
      if (gran === 'hour') point.x = new Date(current).toISOString().slice(0, 16);

      for (const metric of config.yMetrics) {
        const base = getKPIBase(metric.kpi);
        const variation = base * 0.15;
        point[metric.kpi] = +(base + (rng() - 0.5) * 2 * variation).toFixed(2);
      }

      if (config.groupBy.length > 0) {
        const dim = config.groupBy[0];
        let vals = getDimensionValues(dim);
        if (filterMap.has(dim)) vals = vals.filter(v => filterMap.get(dim)!.has(v));
        for (const val of vals.slice(0, 4)) {
          const grouped = { ...point, group: val };
          for (const metric of config.yMetrics) {
            grouped[metric.kpi] = +(point[metric.kpi] * (0.7 + rng() * 0.6)).toFixed(2);
          }
          data.push(grouped);
        }
      } else {
        data.push(point);
      }

      current += step;
    }
  } else if (config.xAxis.type === 'dimension') {
    let vals = getDimensionValues(config.xAxis.value);
    if (filterMap.has(config.xAxis.value)) {
      vals = vals.filter(v => filterMap.get(config.xAxis.value)!.has(v));
    }
    for (const val of vals) {
      const point: any = { x: val };
      for (const metric of config.yMetrics) {
        const base = getKPIBase(metric.kpi);
        point[metric.kpi] = +(base * (0.6 + rng() * 0.8)).toFixed(2);
      }
      data.push(point);
    }
  } else if (config.xAxis.type === 'kpi') {
    const xKpi = config.xAxis.value;
    const numPoints = config.groupBy.length > 0 ? 20 : 30;
    for (let i = 0; i < numPoints; i++) {
      const point: any = {};
      const xBase = getKPIBase(xKpi);
      point.x = +(xBase * (0.5 + rng())).toFixed(2);
      point[xKpi] = point.x;
      for (const metric of config.yMetrics) {
        const base = getKPIBase(metric.kpi);
        point[metric.kpi] = +(base * (0.5 + rng())).toFixed(2);
      }
      if (config.sizeBy) {
        const sizeBase = getKPIBase(config.sizeBy);
        point._size = +(sizeBase * (0.3 + rng() * 0.7)).toFixed(2);
        point[config.sizeBy] = point._size;
      }
      if (config.colorBy) {
        const dim = config.colorBy;
        let vals = getDimensionValues(dim);
        if (filterMap.has(dim)) vals = vals.filter(v => filterMap.get(dim)!.has(v));
        point._colorGroup = vals[Math.floor(rng() * vals.length)];
      }
      if (config.groupBy.length > 0) {
        const dim = config.groupBy[0];
        let vals = getDimensionValues(dim);
        if (filterMap.has(dim)) vals = vals.filter(v => filterMap.get(dim)!.has(v));
        point.group = vals[Math.floor(rng() * vals.length)];
      }
      data.push(point);
    }
  }

  return data;
}

export function getKPIBase(kpi: string): number {
  const bases: Record<string, number> = {
    volume_totale_dl: 1200, volume_totale_ul: 300, volume_totale_totale: 1500,
    debit_dl: 45, debit_ul: 12, debit_dl_max: 180, debit_ul_max: 55,
    rtt_setup_avg: 28, rtt_data_avg: 22,
    dms_debit_dl_3: 92, dms_debit_dl_8: 78, dms_debit_dl_30: 32,
    dms_debit_ul_1: 95, dms_debit_ul_3: 88, dms_debit_ul_5: 72,
    loss_dl_rate: 0.8, loss_ul_rate: 1.2,
    tcp_retr_rate_dl: 2.5, tcp_retr_rate_ul: 1.8,
    session_nbr: 45000, session_dcr: 1.5, session_dur_moy: 120,
    out_of_order_rate: 0.5, wind_full_rate: 1.2,
    fallback_5G_to_4G_rate: 8, instability_rate: 3.2,
    time_rat_5g_pct: 62, time_rat_4g_pct: 35,
    Mauvaise_Session_Rate: 4.5, qoe_index: 78,
    '5G_capable_rate': 45, '5gue_attached_4G_rate': 12,
  };
  return bases[kpi] ?? 50;
}
