/**
 * Single source of truth for Vendor & Technology colors across the ENTIRE app.
 *
 * ERICSSON = bleu clair,  NOKIA = bleu foncé,  4G/LTE = orange,  5G/NR = green
 *
 * Usage:
 *   import { VENDOR, TECH, vendorHex, techHex, vendorBadge, techBadge } from '@/constants/brandColors';
 */

// ── Hex values ──────────────────────────────────────────────
export const VENDOR = {
  ERICSSON: '#60a5fa',   // blue-400 (bleu clair)
  NOKIA:    '#1e40af',   // blue-800 (bleu foncé)
  HUAWEI:   '#dc2626',   // red-600
  SAMSUNG:  '#7c3aed',   // violet-600
  NSN:      '#1e40af',   // blue-800 (Nokia Siemens)
  ALCATEL:  '#f97316',   // orange-500
  ALU:      '#f97316',   // orange-500
  INDEFINI: '#64748b',   // slate-500
  UNKNOWN:  '#64748b',   // slate-500
} as const;

export const TECH = {
  '5G':  '#22c55e',  // green-500
  NR:    '#22c55e',
  '4G':  '#f97316',  // orange-500
  LTE:   '#f97316',
  '3G':  '#0ea5e9',  // sky-500
  '2G':  '#a855f7',  // purple-500
} as const;

// ── HSL equivalents (for inline style / popover use) ──
export const VENDOR_HSL: Record<string, string> = {
  ERICSSON: 'hsl(213, 94%, 68%)',
  NOKIA:    'hsl(224, 76%, 40%)',
  HUAWEI:   'hsl(0, 72%, 51%)',
  SAMSUNG:  'hsl(263, 70%, 50%)',
  NSN:      'hsl(224, 76%, 40%)',
  ALCATEL:  'hsl(25, 95%, 53%)',
  ALU:      'hsl(25, 95%, 53%)',
  INDEFINI: 'hsl(215, 14%, 50%)',
  INDÉFINI: 'hsl(215, 14%, 50%)',
  UNKNOWN:  'hsl(215, 14%, 50%)',
};

export const TECH_HSL: Record<string, string> = {
  '5G':  'hsl(142, 71%, 45%)',
  NR:    'hsl(142, 71%, 45%)',
  '4G':  'hsl(25, 95%, 53%)',
  LTE:   'hsl(25, 95%, 53%)',
  '3G':  'hsl(199, 89%, 48%)',
  '2G':  'hsl(271, 91%, 65%)',
};

// ── Tailwind badge classes (bg + text) ──
export const VENDOR_BADGE: Record<string, { bg: string; text: string }> = {
  Ericsson: { bg: 'bg-blue-400/15',  text: 'text-blue-400' },
  Nokia:    { bg: 'bg-blue-800/15',  text: 'text-blue-800' },
  Huawei:   { bg: 'bg-red-600/15',   text: 'text-red-500' },
  Samsung:  { bg: 'bg-violet-600/15', text: 'text-violet-500' },
  ERICSSON: { bg: 'bg-blue-400/15',  text: 'text-blue-400' },
  NOKIA:    { bg: 'bg-blue-800/15',  text: 'text-blue-800' },
  HUAWEI:   { bg: 'bg-red-600/15',   text: 'text-red-500' },
  SAMSUNG:  { bg: 'bg-violet-600/15', text: 'text-violet-500' },
};

export const TECH_BADGE: Record<string, { bg: string; text: string }> = {
  '5G':  { bg: 'bg-green-500/15',  text: 'text-green-500' },
  NR:    { bg: 'bg-green-500/15',  text: 'text-green-500' },
  '4G':  { bg: 'bg-orange-500/15', text: 'text-orange-500' },
  LTE:   { bg: 'bg-orange-500/15', text: 'text-orange-500' },
  '3G':  { bg: 'bg-sky-500/15',    text: 'text-sky-500' },
  '2G':  { bg: 'bg-purple-500/15', text: 'text-purple-500' },
  ALL:   { bg: 'bg-muted',         text: 'text-muted-foreground' },
};

// ── Helper functions ──

/** Get vendor hex color (case-insensitive) */
export const vendorHex = (v: string | null | undefined): string => {
  const key = (v || '').toUpperCase().trim();
  if (key.includes('ERICSSON')) return VENDOR.ERICSSON;
  if (key.includes('NOKIA') || key === 'NSN') return VENDOR.NOKIA;
  if (key.includes('HUAWEI')) return VENDOR.HUAWEI;
  if (key.includes('SAMSUNG')) return VENDOR.SAMSUNG;
  if (key.includes('ALCATEL') || key === 'ALU') return VENDOR.ALCATEL;
  return VENDOR[key as keyof typeof VENDOR] || '#64748b';
};

/** Get tech hex color (case-insensitive) */
export const techHex = (t: string | null | undefined): string => {
  const key = (t || '').toUpperCase();
  if (key.includes('NR') || key.includes('5G')) return TECH['5G'];
  if (key.includes('LTE') || key.includes('4G')) return TECH['4G'];
  if (key.includes('3G')) return TECH['3G'];
  if (key.includes('2G')) return TECH['2G'];
  return '#64748b';
};

/** Get vendor HSL (case-insensitive, for inline styles) */
export const vendorHsl = (v: string | null | undefined): string => {
  const key = (v || '').toUpperCase().trim();
  if (key.includes('ERICSSON')) return VENDOR_HSL.ERICSSON;
  if (key.includes('NOKIA') || key === 'NSN') return VENDOR_HSL.NOKIA;
  if (key.includes('HUAWEI')) return VENDOR_HSL.HUAWEI;
  if (key.includes('SAMSUNG')) return VENDOR_HSL.SAMSUNG;
  if (key.includes('ALCATEL') || key === 'ALU') return VENDOR_HSL.ALCATEL;
  return VENDOR_HSL[key] || 'hsl(215, 14%, 50%)';
};

/** Get tech HSL */
export const techHsl = (t: string | null | undefined): string =>
  TECH_HSL[(t || '').toUpperCase()] || 'hsl(var(--primary))';

/** Get vendor Tailwind badge classes */
export const vendorBadge = (v: string | null | undefined): { bg: string; text: string } =>
  VENDOR_BADGE[(v || '')] || VENDOR_BADGE[(v || '').toUpperCase()] || { bg: 'bg-muted', text: 'text-muted-foreground' };

/** Get tech Tailwind badge classes */
export const techBadge = (t: string | null | undefined): { bg: string; text: string } =>
  TECH_BADGE[(t || '')] || TECH_BADGE[(t || '').toUpperCase()] || TECH_BADGE.ALL;
