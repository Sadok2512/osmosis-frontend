import { ChartConfig } from './biTypes';

/**
 * Dimension value lists — used for filter UIs and table widgets.
 * These are NOT mock data; they define the available dimension values in the data model.
 */
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

/** KPI base values for reference (used by KPI card display when no live data) */
export function getKPIBase(kpi: string): number {
  const bases: Record<string, number> = {
    volume_totale_dl: 1200, volume_totale_ul: 300, volume_totale_totale: 1500,
    debit_dl: 45, debit_ul: 12, debit_dl_max: 180, debit_ul_max: 55,
    debit_dl_vol5: 30, debit_ul_vol5: 8, debit_dl_vol10: 20, debit_ul_vol10: 5,
    rtt_setup_avg: 28, rtt_data_avg: 22,
    rtt_setup_0_40000: 65, rtt_setup_40000_80000: 20, rtt_setup_80000_150000: 10,
    rtt_setup_150000_300000: 4, rtt_setup_300000_inf: 1,
    rtt_data_0_40000: 70, rtt_data_40000_80000: 18, rtt_data_80000_150000: 8,
    rtt_data_150000_300000: 3, rtt_data_300000_inf: 1,
    dms_debit_dl_3: 92, dms_debit_dl_8: 78, dms_debit_dl_30: 32,
    dms_3_dl_vol5: 25, dms_8_dl_vol5: 20, dms_30_dl_vol5: 10,
    dms_3_dl_vol10: 15, dms_8_dl_vol10: 12, dms_30_dl_vol10: 6,
    dms_debit_ul_1: 95, dms_debit_ul_3: 88, dms_debit_ul_5: 72,
    loss_dl_rate: 0.8, loss_ul_rate: 1.2,
    'loss_dl_0_0.01': 85, 'loss_dl_0.01_0.03': 10, 'loss_dl_0.03_0.05': 3, 'loss_dl_0.05_inf': 2,
    'loss_ul_0_0.01': 82, 'loss_ul_0.01_0.03': 12, 'loss_ul_0.03_0.05': 4, 'loss_ul_0.05_inf': 2,
    tcp_retr_rate_dl: 2.5, tcp_retr_rate_ul: 1.8,
    'retr_dl_0_0.01': 80, 'retr_dl_0.01_0.03': 12, 'retr_dl_0.03_0.05': 5, 'retr_dl_0.05_inf': 3,
    'retr_ul_0_0.01': 82, 'retr_ul_0.01_0.03': 11, 'retr_ul_0.03_0.05': 4, 'retr_ul_0.05_inf': 3,
    session_nbr: 45000, session_dcr: 1.5, session_dur_moy: 120,
    session_wifi_nbr: 8000, session_3g2g_nbr: 2000, session_4g_nbr: 25000, session_5g_nbr: 10000,
    out_of_order_nbr: 500, out_of_order_rate: 0.5,
    wind_full_nbr: 600, wind_full_rate: 1.2,
    Mauvaise_Session_nbr: 2000, Mauvaise_Session_Rate: 4.5,
    fallback_5G_to_4G_rate: 8, fallback_4G_to_3G2G_rate: 3, instability_rate: 3.2,
    time_rat_5g_pct: 62, time_rat_4g_pct: 35, time_rat_3g2g_pct: 2, time_rat_wifi_pct: 1,
    qoe_index: 78,
    '5G_capable_rate': 45, '5gue_attached_4G_rate': 12,
  };
  return bases[kpi] ?? 50;
}

/**
 * Returns empty array — no more mock chart data.
 * Charts will show "Aucune donnée" when no live/CSV source is connected.
 */
export function generateChartData(_config: ChartConfig): any[] {
  return [];
}
