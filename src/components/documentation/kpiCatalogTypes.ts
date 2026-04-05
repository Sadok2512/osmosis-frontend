/* ── KPI Catalog Types ── */

export type KpiStatus = 'draft' | 'pending_review' | 'validated' | 'active';
export type UserRole = 'viewer' | 'editor' | 'creator';
export type Technology = 'LTE' | 'NR' | 'ALL';
export type Vendor = 'Nokia' | 'Ericsson' | 'Huawei' | 'ALL';

export interface CounterEntry {
  id: string;
  name: string;
  description: string;
  vendor_mapping: Record<string, string>;
  formula?: string;
  source_system: string;
  granularity: string;
}

export interface NumeratorDenominator {
  name: string;
  description: string;
  counters: CounterEntry[];
  source: string;
  granularity: string;
}

export interface KpiThresholds {
  green?: number | null;
  orange?: number | null;
  red?: number | null;
}

export interface KpiCatalogEntry {
  id: string;
  kpi_code: string;
  kpi_key: string;
  display_name: string;
  description: string;
  category: string;
  unit: string;
  technology: Technology;
  vendor: string;
  formula: string;
  formula_type: string;
  numerator: NumeratorDenominator;
  denominator: NumeratorDenominator;
  thresholds: KpiThresholds;
  status: KpiStatus;
  scope: string;
  created_by: string;
  last_updated: string;
  is_normalized: boolean;
  supported_levels: string[];
}

export const STATUS_CONFIG: Record<KpiStatus, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: 'text-amber-600', bg: 'bg-amber-500/10' },
  pending_review: { label: 'Pending Review', color: 'text-blue-600', bg: 'bg-blue-500/10' },
  validated: { label: 'Validated', color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  active: { label: 'Active', color: 'text-green-600', bg: 'bg-green-500/10' },
};

export const CATEGORY_COLORS: Record<string, string> = {
  Accessibility: 'hsl(210, 70%, 55%)',
  Retainability: 'hsl(340, 70%, 55%)',
  Throughput: 'hsl(260, 60%, 55%)',
  Traffic: 'hsl(150, 60%, 45%)',
  Mobility: 'hsl(230, 60%, 55%)',
  'Radio Quality': 'hsl(40, 80%, 50%)',
  VoLTE: 'hsl(20, 80%, 55%)',
  Latency: 'hsl(180, 60%, 45%)',
  Integrity: 'hsl(290, 60%, 55%)',
  Other: 'hsl(220, 10%, 55%)',
};

export const VENDOR_COLORS: Record<string, { bg: string; text: string }> = {
  Nokia: { bg: 'bg-blue-500/10', text: 'text-blue-500' },
  Ericsson: { bg: 'bg-indigo-500/10', text: 'text-indigo-500' },
  Huawei: { bg: 'bg-rose-500/10', text: 'text-rose-500' },
};

export const TECH_COLORS: Record<string, { bg: string; text: string }> = {
  LTE: { bg: 'bg-cyan-500/10', text: 'text-cyan-500' },
  NR: { bg: 'bg-violet-500/10', text: 'text-violet-500' },
  ALL: { bg: 'bg-muted', text: 'text-muted-foreground' },
};
