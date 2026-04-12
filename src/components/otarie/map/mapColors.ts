/**
 * Single source of truth for technology colors across the entire map system.
 * 2G (GSM) = Red, 3G (UMTS) = Blue, 4G (LTE) = Orange, 5G (NR) = Green.
 */
import { is5GTech, is4GTech, is3GTech, is2GTech } from '@/utils/telecomHelpers';

// ── Technology group colors ──
export const TECH_COLORS = {
  '2G': '#ef4444',
  '3G': '#3b82f6',
  '4G': '#f97316',
  '5G': '#22c55e',
  FADED: '#94a3b8',
} as const;

// ── Band-based color mapping ──
export const DEFAULT_BAND_COLORS: Record<string, string> = {
  // GSM (2G) — red tones
  GSM900:  '#ef4444',
  GSM1800: '#dc2626',
  // UMTS (3G) — blue tones
  UMTS900:  '#3b82f6',
  UMTS2100: '#2563eb',
  // NR (5G) — green tones
  NR3500: '#22c55e',
  NR700:  '#16a34a',
  NR2100: '#15803d',
  NR1800: '#166534',
  NR2600: '#059669',
  NR1400: '#047857',
  // LTE (4G) — orange tones
  L2600:  '#f97316',
  L2100:  '#fb923c',
  L1800:  '#ea580c',
  L800:   '#fdba74',
  L700:   '#c2410c',
  L900:   '#d97706',
  // Group header colors
  '2G_GROUP': '#ef4444',
  '3G_GROUP': '#3b82f6',
  '4G_GROUP': '#f97316',
  '5G_GROUP': '#22c55e',
};

export const GSM_BANDS = ['GSM900', 'GSM1800'] as const;
export const UMTS_BANDS = ['UMTS900', 'UMTS2100'] as const;
export const NR_BANDS = ['NR3500', 'NR700', 'NR2100', 'NR1800', 'NR2600', 'NR1400'] as const;
export const LTE_BANDS = ['L2600', 'L2100', 'L1800', 'L800', 'L700', 'L900'] as const;

/** Darken a hex color by ~25% for stroke use */
export const deriveStrokeColor = (hex: string): string => {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const d = (v: number) => Math.max(0, Math.round(v * 0.75));
    return `#${d(r).toString(16).padStart(2, '0')}${d(g).toString(16).padStart(2, '0')}${d(b).toString(16).padStart(2, '0')}`;
  } catch {
    return '#64748b';
  }
};

/** Load custom band colors from localStorage, merged with defaults */
export const loadCustomBandColors = (): Record<string, string> => {
  try {
    const saved = localStorage.getItem('osmosis_band_colors');
    if (saved) return { ...DEFAULT_BAND_COLORS, ...JSON.parse(saved) };
  } catch (err) {
    console.warn('[mapColors] loadCustomBandColors failed', err);
  }
  return { ...DEFAULT_BAND_COLORS };
};

/** Normalize a band string to a known band key */
export const normalizeBandKey = (bande: string, techno?: string): string | null => {
  if (!bande) return null;
  const normalized = bande.replace(/\s+/g, '').replace(/MHZ/gi, '').replace(/_/g, '').toUpperCase();
  const is5G = is5GTech(techno) || normalized.includes('NR') || /^N\d+$/i.test(normalized);
  const is3G = is3GTech(techno) || normalized.includes('UMTS') || normalized.includes('WCDMA');
  const is2G = is2GTech(techno) || normalized.includes('GSM');

  // 2G bands
  if (is2G || normalized.includes('GSM')) {
    if (normalized.includes('1800')) return 'GSM1800';
    if (normalized.includes('900')) return 'GSM900';
    return 'GSM900'; // default 2G
  }

  // 3G bands
  if (is3G || normalized.includes('UMTS') || normalized.includes('WCDMA')) {
    if (normalized.includes('2100')) return 'UMTS2100';
    if (normalized.includes('900')) return 'UMTS900';
    return 'UMTS2100'; // default 3G
  }

  // 5G / 4G bands (existing logic)
  if (normalized.includes('3500') || normalized.includes('NR3500') || normalized.includes('N78')) return 'NR3500';
  if (normalized.includes('2600') || normalized.includes('L2600') || normalized.includes('B7')) {
    return is5G ? 'NR2600' : 'L2600';
  }
  if (normalized.includes('1800') || normalized.includes('L1800') || normalized.includes('B3')) {
    return is5G ? 'NR1800' : 'L1800';
  }
  if (normalized.includes('1400') || normalized.includes('NR1400') || normalized.includes('B32')) return 'NR1400';
  if (normalized.includes('900') || normalized.includes('L900') || normalized.includes('B8')) {
    if (!normalized.includes('3500') && !normalized.includes('1900') && !normalized.includes('2900')) return 'L900';
  }
  if (normalized.includes('800') || normalized.includes('L800') || normalized.includes('B20')) {
    if (!normalized.includes('1800') && !normalized.includes('3800')) return is5G ? 'NR700' : 'L800';
  }

  if (normalized.includes('2100') || normalized.includes('NR2100') || normalized.includes('L2100') || normalized === 'N1' || normalized === 'B1') {
    return is5G ? 'NR2100' : 'L2100';
  }

  if (normalized.includes('700') || normalized.includes('NR700') || normalized.includes('L700') || normalized === 'N28' || normalized === 'B28') {
    if (!normalized.includes('3700') && !normalized.includes('2700')) return is5G ? 'NR700' : 'L700';
  }

  return null;
};

/** Get technology color for a site/cell */
export const getTechColor = (techGroup: string, bandColors?: Record<string, string>): string => {
  if (techGroup === '5G') return bandColors?.['5G_GROUP'] || TECH_COLORS['5G'];
  if (techGroup === '4G') return bandColors?.['4G_GROUP'] || TECH_COLORS['4G'];
  if (techGroup === '3G') return bandColors?.['3G_GROUP'] || TECH_COLORS['3G'];
  if (techGroup === '2G') return bandColors?.['2G_GROUP'] || TECH_COLORS['2G'];
  return TECH_COLORS['4G'];
};

/** Get the CSS class for a tech badge */
export const getTechBadgeBg = (techno: string | null | undefined): string => {
  if (is5GTech(techno)) return 'bg-[#22c55e]';
  if (is4GTech(techno)) return 'bg-[#f97316]';
  if (is3GTech(techno)) return 'bg-[#3b82f6]';
  if (is2GTech(techno)) return 'bg-[#ef4444]';
  return 'bg-[#f97316]';
};

/** Get inline style background for a tech dot */
export const getTechDotColor = (techno: string | null | undefined): string => {
  if (is5GTech(techno)) return '#22c55e';
  if (is4GTech(techno)) return '#f97316';
  if (is3GTech(techno)) return '#3b82f6';
  if (is2GTech(techno)) return '#ef4444';
  return '#f97316';
};

/** Get filter chip colors for tech labels */
export const getTechChipClasses = (tech: string): string => {
  if (tech === '5G') return 'bg-green-500/15 text-green-500';
  if (tech === '4G') return 'bg-orange-500/15 text-orange-500';
  if (tech === '3G') return 'bg-blue-500/15 text-blue-500';
  if (tech === '2G') return 'bg-red-500/15 text-red-500';
  return 'bg-orange-500/15 text-orange-500';
};

/** Get the group color key for a tech group string */
export const getTechGroupKey = (techGroup: string): string => `${techGroup}_GROUP`;
