import { DataPoint, WorstElement, KpiDefinition } from './types';

export const KPIS: KpiDefinition[] = [
  { id: '4G_LTE_DCR', label: 'LTE Drop Call Rate', unit: '%', category: 'Accessibility', color: '#3b82f6', thresholds: { warning: 0.5, critical: 1.0 }, higherIsBetter: false },
  { id: '4G_LTE_SR', label: 'LTE Setup Success Rate', unit: '%', category: 'Accessibility', color: '#10b981', thresholds: { warning: 98, critical: 95 }, higherIsBetter: true },
  { id: '4G_ERAB_DR', label: 'E-RAB Drop Rate', unit: '%', category: 'Retainability', color: '#f59e0b', thresholds: { warning: 1.0, critical: 2.0 }, higherIsBetter: false },
  { id: '4G_HO_SR', label: 'Handover Success Rate', unit: '%', category: 'Mobility', color: '#8b5cf6', thresholds: { warning: 97, critical: 94 }, higherIsBetter: true },
  { id: '4G_DL_TPUT', label: 'DL Throughput', unit: 'Mbps', category: 'Throughput', color: '#06b6d4', thresholds: { warning: 10, critical: 5 }, higherIsBetter: true },
  { id: '4G_UL_TPUT', label: 'UL Throughput', unit: 'Mbps', category: 'Throughput', color: '#ec4899', thresholds: { warning: 3, critical: 1 }, higherIsBetter: true },
  { id: '4G_PRB_DL', label: 'PRB Usage DL', unit: '%', category: 'Utilization', color: '#84cc16', thresholds: { warning: 70, critical: 85 }, higherIsBetter: false },
  { id: '4G_VOLTE_DCR', label: 'VoLTE Drop Rate', unit: '%', category: 'Voice', color: '#ef4444', thresholds: { warning: 0.8, critical: 1.5 }, higherIsBetter: false },
  { id: '5G_NR_DCR', label: 'NR Drop Call Rate', unit: '%', category: 'Accessibility', color: '#6366f1', thresholds: { warning: 0.3, critical: 0.8 }, higherIsBetter: false },
  { id: '5G_NR_TPUT', label: 'NR DL Throughput', unit: 'Mbps', category: 'Throughput', color: '#14b8a6', thresholds: { warning: 100, critical: 50 }, higherIsBetter: true },
];

export const KPI_MAP: Record<string, KpiDefinition> = Object.fromEntries(KPIS.map(k => [k.id, k]));

export function generateTimeSeriesData(kpiIds: string[], days = 7): DataPoint[] {
  const data: DataPoint[] = [];
  const now = Date.now();
  const hourMs = 3600000;
  const points = days * 24;

  for (const kpi of kpiIds) {
    const def = KPI_MAP[kpi];
    if (!def) continue;
    const base = def.higherIsBetter ? 95 + Math.random() * 4 : 0.3 + Math.random() * 0.5;
    for (let i = 0; i < points; i++) {
      const ts = new Date(now - (points - i) * hourMs);
      const noise = (Math.random() - 0.5) * (def.higherIsBetter ? 3 : 0.4);
      const spike = Math.random() > 0.95 ? (def.higherIsBetter ? -5 : 1.2) : 0;
      data.push({
        timestamp: ts.toISOString(),
        kpi,
        value: Math.max(0, base + noise + spike + Math.sin(i / 12) * (def.higherIsBetter ? 1 : 0.15)),
      });
    }
  }
  return data;
}

const CELL_NAMES = [
  'PAR_ENB4521_C1', 'LYO_ENB3210_C2', 'MAR_ENB1105_C3', 'BOR_ENB2240_C1',
  'TLS_ENB6780_C2', 'LIL_ENB9012_C1', 'NAN_ENB4455_C3', 'STR_ENB7789_C2',
  'REN_ENB3321_C1', 'NCE_ENB5543_C3', 'MTP_ENB8876_C2', 'GRE_ENB1198_C1',
  'DJN_ENB6632_C3', 'ANG_ENB2276_C1', 'CLF_ENB9908_C2', 'ROU_ENB4411_C3',
];

const REGIONS = ['Île-de-France', 'Auvergne-Rhône-Alpes', 'PACA', 'Nouvelle-Aquitaine', 'Occitanie', 'Hauts-de-France', 'Pays de la Loire', 'Grand Est'];
const VENDORS = ['Ericsson', 'Nokia', 'Huawei'];
const TECHS = ['4G', '5G'];

export function generateWorstElements(sortKpi: string, limit: number): WorstElement[] {
  return CELL_NAMES.slice(0, limit).map((name, i) => {
    const kpiValues: Record<string, number> = {};
    for (const k of KPIS) {
      const base = k.higherIsBetter ? 90 - i * 2 + Math.random() * 3 : 0.5 + i * 0.3 + Math.random() * 0.5;
      kpiValues[k.id] = Math.max(0, base);
    }
    const severity = i < 3 ? 'critical' : i < 7 ? 'warning' : 'ok';
    return {
      id: `cell_${i}`,
      name,
      dimension: 'Cell',
      kpiValues,
      trend: i % 3 === 0 ? 'up' : i % 3 === 1 ? 'down' : 'stable',
      severity,
      region: REGIONS[i % REGIONS.length],
      vendor: VENDORS[i % VENDORS.length],
      technology: TECHS[i % TECHS.length],
    };
  });
}

export function generateHistogramData(kpiId: string, bins = 20) {
  const def = KPI_MAP[kpiId];
  if (!def) return [];
  const center = def.higherIsBetter ? 95 : 0.5;
  const spread = def.higherIsBetter ? 8 : 1;
  return Array.from({ length: bins }, (_, i) => {
    const val = center - spread / 2 + (i / bins) * spread;
    const count = Math.floor(Math.exp(-((val - center) ** 2) / (2 * (spread / 4) ** 2)) * 100 + Math.random() * 20);
    return { bin: +val.toFixed(2), count, label: `${val.toFixed(1)} ${def.unit}` };
  });
}

export function generateBreakdownData(kpiId: string) {
  const categories = ['Ericsson', 'Nokia', 'Huawei'];
  const def = KPI_MAP[kpiId];
  if (!def) return [];
  return categories.map(cat => ({
    name: cat,
    value: +(def.higherIsBetter ? 92 + Math.random() * 7 : 0.2 + Math.random() * 1.2).toFixed(2),
    color: vendorHex(cat),
  }));
}
