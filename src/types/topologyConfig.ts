// Mirrors osmosis-parser/app/config_loader.py — keep in sync.
// Source of truth = osmosis-parser/config/topology.config.yaml.

export interface TopologyMeta {
  config_version: string;
  template_sheet: string;
  template_path: string;
  template_header_rows: { section: number; tier: number; field: number };
  template_data_start_row: number;
  template_data_end_row: number;
  slots_per_15m: number;
  slots_per_hour: number;
  slots_per_day: number;
  slots_per_week: number;
  hourly_lookback_hours: number;
  daily_lookback_days: number;
  cutoff_hours_daily: number;
  cutoff_hours_hourly: number;
}

export interface SectionGroup {
  id: string;
  match: string;
  label: string;
  color: string;
  always_visible: boolean;
  techno_filter?: string | null;
}

export type Severity = 'hard_fail' | 'warning' | 'info';

export interface TierSpec {
  label: string;
  severity: Severity;
  color: string;
}

export interface NumericRange {
  min: number;
  max: number;
  note?: string | null;
}

export interface ConditionalRequired {
  discriminator: string;
  rules: Record<string, string[]>;
}

export interface CrossFieldCheck {
  id: string;
  when: string[];
  expression: string;
  severity: Severity;
  message: string;
}

export interface UniqueField {
  field: string;
  scope: string;
  on_duplicate: 'reject' | 'warn_last_wins' | 'warn_first_wins';
}

export type FilterWidget = 'multi_select' | 'combobox' | 'text' | 'range' | 'boolean';

export interface FilterSpec {
  field: string;
  widget: FilterWidget;
  source?: 'enum' | 'facets' | null;
  cascades_to?: string[] | null;
  targets?: string[] | null;
}

export interface PaginationSpec {
  default_limit: number;
  max_limit: number;
}

export interface CoordinatesParser {
  accept_dms: boolean;
  accept_decimal: boolean;
}

export interface PmValueSanity {
  sentinel_threshold: number;
  note?: string | null;
}

export interface ParsersSpec {
  coordinates: CoordinatesParser;
  pm_value_sanity: PmValueSanity;
}

export interface TopologyConfig {
  meta: TopologyMeta;
  section_groups: SectionGroup[];
  section_display_order: string[];
  tiers: Record<string, TierSpec>;
  field_key_overrides: Record<string, string>;
  hidden_in_grid: string[];
  numeric_ranges: Record<string, NumericRange>;
  enums: Record<string, string[]>;
  techno_aliases: Record<string, string[]>;
  conditional_required?: ConditionalRequired | null;
  cross_field_checks: CrossFieldCheck[];
  unique_fields: UniqueField[];
  geo_hierarchy: string[];
  filters: FilterSpec[];
  pagination: PaginationSpec;
  parsers: ParsersSpec;
}

// /api/v1/config/schema response — fields extracted from the UNIFIED_TEMPLATE
export interface FieldSpec {
  key: string;
  label: string;
  column_letter: string;
  column_index: number;
  section: string;
  section_id: string | null;
  tier: string;
}

export interface TopologySchemaResponse {
  template_path: string;
  template_sheet: string;
  fields: FieldSpec[];
}
