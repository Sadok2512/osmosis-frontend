/**
 * Single source of truth for technology colors across the entire map system.
 * 2G (GSM) = Purple, 3G (UMTS) = Blue, 4G (LTE) = Orange, 5G (NR) = Green.
 */
import { is5GTech, is4GTech, is3GTech, is2GTech } from '@/utils/telecomHelpers';

// ── Technology group colors ──
export const TECH_COLORS = {
  '2G': '#8E44AD',
  '3G': '#3498DB',
  '4G': '#F39C12',
  '5G': '#27AE60',
  FADED: '#94a3b8',
} as const;

// ── Band-based color mapping ──
export const DEFAULT_BAND_COLORS: Record<string, string> = {
  // GSM (2G) — purple tones
  GSM900:  '#8E44AD',
  GSM1800: '#7D3C98',
  // UMTS (3G) — blue tones
  UMTS900:  '#3498DB',
  UMTS2100: '#2E86C1',
  // NR (5G) — green tones
  NR3500: '#27AE60',
  NR700:  '#229954',
  NR2100: '#1E8449',
  NR1800: '#196F3D',
  NR2600: '#1ABC9C',
  NR1400: '#17A589',
  // LTE (4G) — orange/amber tones
  L2600:  '#F39C12',
  L2100:  '#E67E22',
  L1800:  '#D68910',
  L800:   '#F5B041',
  L700:   '#CA6F1E',
  L900:   '#D4AC0D',
  // Group header colors
  '2G_GROUP': '#8E44AD',
  '3G_GROUP': '#3498DB',
  '4G_GROUP': '#F39C12',
  '5G_GROUP': '#27AE60',
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
  if (is5GTech(techno)) return 'bg-[#27AE60]';
  if (is4GTech(techno)) return 'bg-[#F39C12]';
  if (is3GTech(techno)) return 'bg-[#3498DB]';
  if (is2GTech(techno)) return 'bg-[#8E44AD]';
  return 'bg-[#F39C12]';
};

/** Get inline style background for a tech dot */
export const getTechDotColor = (techno: string | null | undefined): string => {
  if (is5GTech(techno)) return '#27AE60';
  if (is4GTech(techno)) return '#F39C12';
  if (is3GTech(techno)) return '#3498DB';
  if (is2GTech(techno)) return '#8E44AD';
  return '#F39C12';
};

/** Get filter chip colors for tech labels */
export const getTechChipClasses = (tech: string): string => {
  if (tech === '5G') return 'bg-[#27AE60]/15 text-[#27AE60]';
  if (tech === '4G') return 'bg-[#F39C12]/15 text-[#F39C12]';
  if (tech === '3G') return 'bg-[#3498DB]/15 text-[#3498DB]';
  if (tech === '2G') return 'bg-[#8E44AD]/15 text-[#8E44AD]';
  return 'bg-[#F39C12]/15 text-[#F39C12]';
};

/** Get the group color key for a tech group string */
export const getTechGroupKey = (techGroup: string): string => `${techGroup}_GROUP`;
