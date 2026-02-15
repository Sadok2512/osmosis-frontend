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
  ORF_NETWORK: ['ORF_IDF', 'ORF_SE', 'ORF_NE', 'ORF_SO', 'ORF_NO'],
  Vendor: ['Ericsson', 'Nokia', 'Huawei', 'Samsung'],
  DOR: ['DOR_IDF', 'DOR_EST', 'DOR_OUEST', 'DOR_SUD', 'DOR_NORD'],
  Plaque: ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Bordeaux', 'Lille', 'Strasbourg'],
  Site: ['SITE_001', 'SITE_002', 'SITE_003', 'SITE_004', 'SITE_005'],
  Cellule: ['CELL_A1', 'CELL_A2', 'CELL_B1', 'CELL_B2', 'CELL_C1'],
  bande: ['700', '800', '1800', '2100', '2600', '3500'],
  '5G_capability': ['5G_SA', '5G_NSA', '4G_only'],
  device_brand: ['Apple', 'Samsung', 'Xiaomi', 'Huawei', 'Oppo'],
  os: ['iOS', 'Android'],
  client: ['B2C', 'B2B', 'MVNO'],
  RAT: ['5G', '4G', '3G', '2G'],
  ARCEP: ['Zone_Dense', 'Zone_Intermediaire', 'Zone_Rurale'],
  Application: ['YouTube', 'Netflix', 'WhatsApp', 'Instagram', 'TikTok', 'Spotify'],
  Service_Provider: ['Google', 'Meta', 'Microsoft', 'Amazon', 'Apple'],
  POP: ['POP_PAR', 'POP_LYO', 'POP_MAR', 'POP_BOR', 'POP_LIL'],
};

export function getDimensionValues(dimension: string): string[] {
  return DIMENSION_VALUES[dimension] || ['Value_1', 'Value_2', 'Value_3'];
}

export function generateChartData(config: ChartConfig): any[] {
  const rng = seededRandom(config.id.charCodeAt(0) * 1000 + config.yMetrics.length);
  const data: any[] = [];

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

      // Group by support
      if (config.groupBy.length > 0) {
        const dim = config.groupBy[0];
        const vals = getDimensionValues(dim);
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
    const vals = getDimensionValues(config.xAxis.value);
    for (const val of vals) {
      const point: any = { x: val };
      for (const metric of config.yMetrics) {
        const base = getKPIBase(metric.kpi);
        point[metric.kpi] = +(base * (0.6 + rng() * 0.8)).toFixed(2);
      }
      data.push(point);
    }
  }

  return data;
}

function getKPIBase(kpi: string): number {
  const bases: Record<string, number> = {
    volume_totale: 1200, debit_dl: 45, debit_ul: 12, dl_ul_ratio: 3.5,
    debit_dl_max: 180, debit_ul_max: 55, rtt_setup_avg: 28, rtt_data_avg: 22,
    loss_dl_rate: 0.8, loss_ul_rate: 1.2,
    tcp_retr_rate_1: 2.5, tcp_retr_rate_3: 1.8, tcp_retr_rate_5: 1.2, tcp_retr_rate_10: 0.6,
    dms_dl_3: 92, dms_dl_8: 78, dms_dl_30: 32, dms_ul_1: 95, dms_ul_3: 88, dms_ul_5: 72,
    session_nbr: 45000, session_dcr: 1.5, fallback_5G_to_4G_rate: 8,
    instability_rate: 3.2, 'time_rat_5g_%': 62, bad_session_rate: 4.5, qoe_index: 78,
  };
  return bases[kpi] ?? 50;
}
