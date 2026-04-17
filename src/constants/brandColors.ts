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
  '5G':  '#27AE60',
  NR:    '#27AE60',
  '4G':  '#F39C12',
  LTE:   '#F39C12',
  '3G':  '#3498DB',
  '2G':  '#8E44AD',
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
  '5G':  'hsl(145, 63%, 42%)',
  NR:    'hsl(145, 63%, 42%)',
  '4G':  'hsl(37, 91%, 51%)',
  LTE:   'hsl(37, 91%, 51%)',
  '3G':  'hsl(204, 70%, 53%)',
  '2G':  'hsl(283, 59%, 47%)',
};

// ── Pill badge palette (clean & pro) — single source of truth for network UI ──
// Soft background + matching text + light border. Used everywhere: filters, tables, chips.
export type PillTone = { bg: string; text: string; border: string };

export const VENDOR_PILL: Record<string, PillTone> = {
  Ericsson: { bg: 'bg-[#E8F1FF]', text: 'text-[#1D4ED8]', border: 'border-[#BFDBFE]' },
  Huawei:   { bg: 'bg-[#FEECEC]', text: 'text-[#DC2626]', border: 'border-[#FCA5A5]' },
  Nokia:    { bg: 'bg-[#E6F0FF]', text: 'text-[#1E40AF]', border: 'border-[#93C5FD]' },
  Alcatel:  { bg: 'bg-[#F3E8FF]', text: 'text-[#7C3AED]', border: 'border-[#C4B5FD]' },
  ALU:      { bg: 'bg-[#F3E8FF]', text: 'text-[#7C3AED]', border: 'border-[#C4B5FD]' },
  Samsung:  { bg: 'bg-[#F3F4F6]', text: 'text-[#374151]', border: 'border-[#D1D5DB]' },
  NSN:      { bg: 'bg-[#E6F0FF]', text: 'text-[#1E40AF]', border: 'border-[#93C5FD]' },
  Indéfini: { bg: 'bg-[#F9FAFB]', text: 'text-[#6B7280]', border: 'border-[#E5E7EB]' },
  Indefini: { bg: 'bg-[#F9FAFB]', text: 'text-[#6B7280]', border: 'border-[#E5E7EB]' },
  Unknown:  { bg: 'bg-[#F9FAFB]', text: 'text-[#6B7280]', border: 'border-[#E5E7EB]' },
};

export const TECH_PILL: Record<string, PillTone> = {
  '2G':  { bg: 'bg-[#F3E8FF]', text: 'text-[#7C3AED]', border: 'border-[#E9D5FF]' },
  '3G':  { bg: 'bg-[#E0F2FE]', text: 'text-[#0284C7]', border: 'border-[#BAE6FD]' },
  '4G':  { bg: 'bg-[#FFF7ED]', text: 'text-[#EA580C]', border: 'border-[#FED7AA]' },
  LTE:   { bg: 'bg-[#FFF7ED]', text: 'text-[#EA580C]', border: 'border-[#FED7AA]' },
  '5G':  { bg: 'bg-[#ECFDF5]', text: 'text-[#059669]', border: 'border-[#A7F3D0]' },
  NR:    { bg: 'bg-[#ECFDF5]', text: 'text-[#059669]', border: 'border-[#A7F3D0]' },
  ALL:   { bg: 'bg-muted',     text: 'text-muted-foreground', border: 'border-border' },
};

// Backward-compat alias (used by existing components that read { bg, text } only)
export const VENDOR_BADGE: Record<string, PillTone> = {
  ...VENDOR_PILL,
  ERICSSON: VENDOR_PILL.Ericsson,
  HUAWEI:   VENDOR_PILL.Huawei,
  NOKIA:    VENDOR_PILL.Nokia,
  SAMSUNG:  VENDOR_PILL.Samsung,
  ALCATEL:  VENDOR_PILL.Alcatel,
};

export const TECH_BADGE: Record<string, PillTone> = { ...TECH_PILL };

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

/** Normalize a raw vendor string to its canonical pill key */
const normalizeVendorKey = (v: string | null | undefined): string => {
  const k = (v || '').trim().toUpperCase();
  if (!k) return 'Indéfini';
  if (k.includes('ERICSSON')) return 'Ericsson';
  if (k.includes('NOKIA') || k === 'NSN') return 'Nokia';
  if (k.includes('HUAWEI')) return 'Huawei';
  if (k.includes('SAMSUNG')) return 'Samsung';
  if (k.includes('ALCATEL') || k === 'ALU') return 'Alcatel';
  if (k.includes('INDEF') || k === 'UNKNOWN' || k === '-') return 'Indéfini';
  return v as string;
};

/** Normalize a raw tech string to its canonical pill key */
const normalizeTechKey = (t: string | null | undefined): string => {
  const k = (t || '').trim().toUpperCase();
  if (k.includes('NR') || k.includes('5G')) return '5G';
  if (k.includes('LTE') || k.includes('4G')) return '4G';
  if (k.includes('3G') || k === 'UMTS')     return '3G';
  if (k.includes('2G') || k === 'GSM')      return '2G';
  return k || 'ALL';
};

/** Get vendor pill (bg + text + border) */
export const vendorBadge = (v: string | null | undefined): PillTone =>
  VENDOR_PILL[normalizeVendorKey(v)] || VENDOR_PILL.Indéfini;

/** Get tech pill (bg + text + border) */
export const techBadge = (t: string | null | undefined): PillTone =>
  TECH_PILL[normalizeTechKey(t)] || TECH_PILL.ALL;

/** Convenience: ready-to-use className string for a Vendor pill */
export const vendorPillClass = (v: string | null | undefined): string => {
  const p = vendorBadge(v);
  return `inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${p.bg} ${p.text} ${p.border}`;
};

/** Convenience: ready-to-use className string for a Tech pill */
export const techPillClass = (t: string | null | undefined): string => {
  const p = techBadge(t);
  return `inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${p.bg} ${p.text} ${p.border}`;
};
