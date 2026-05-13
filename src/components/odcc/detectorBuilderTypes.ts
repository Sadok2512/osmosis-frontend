export type DetectorLogic = 'AND' | 'OR';
export type DetectorConditionType = 'kpi' | 'dimension';
export type DetectorAggregation = 'avg' | 'min' | 'max' | 'sum' | 'count';
export type DetectorOperator = '<' | '<=' | '>' | '>=' | '=' | '!=' | 'exists';
export type DetectorTimeRange = '24h' | 'custom';

export interface KpiOption {
  key: string;
  label: string;
  unit?: string;
}

export interface DimensionOption {
  key: string;
  label: string;
  multiSelect?: boolean;
  searchable?: boolean;
}

export interface ScopeFilter {
  dimension: string;
  values: string[];
}

export interface DetectorCondition {
  id: string;
  type: DetectorConditionType;
  field: string;
  aggregation?: DetectorAggregation;
  operator: DetectorOperator;
  value: string;
  unit?: string;
}

export interface CriteriaConfig {
  logic: DetectorLogic;
  conditions: DetectorCondition[];
}

export interface ExcludedTimeSlot {
  id: string;
  start: string;
  end: string;
}

export interface TimeConfig {
  range: DetectorTimeRange;
  customStart: string | null;
  customEnd: string | null;
  excludeTimeSlots: boolean;
  excludedSlots: ExcludedTimeSlot[];
  excludeWeekends: boolean;
  excludeHolidays: boolean;
}

export interface DetectorPayload {
  scopeFilters: Array<{
    dimension: string;
    values: string[];
  }>;
  criteria: {
    logic: DetectorLogic;
    conditions: Array<{
      type: DetectorConditionType;
      field: string;
      aggregation?: DetectorAggregation;
      operator: DetectorOperator;
      value: string | number | boolean;
      unit?: string;
    }>;
  };
  time: {
    range: DetectorTimeRange;
    customStart: string | null;
    customEnd: string | null;
    excludeTimeSlots: boolean;
    excludedSlots: Array<{
      start: string;
      end: string;
    }>;
    excludeWeekends: boolean;
    excludeHolidays: boolean;
  };
}

export interface DetectorValidation {
  valid: boolean;
  errors: string[];
}
