/* ── Filter Management Types ── */

export type FilterStatus = 'draft' | 'active' | 'archived';
export type FilterPermission = 'editable' | 'locked';
export type FilterVisibility = 'public' | 'private';

export interface TopologyCondition {
  dimension: string;
  operator: 'in' | 'not_in';
  values: string[];
}

export interface ParameterCondition {
  id: string;
  parameter: string;
  operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'IN' | 'NOT IN' | 'BETWEEN';
  value: string;
  value2?: string;
}

export interface ConditionGroup {
  logic: 'AND' | 'OR';
  conditions: (ParameterCondition | TopologyCondition)[];
}

export interface NetworkFilter {
  id: string;
  name: string;
  description: string;
  status: FilterStatus;
  permission: FilterPermission;
  visibility: FilterVisibility;
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  topology: TopologyCondition[];
  parameters: ParameterCondition[];
  logic: 'AND' | 'OR';
  condition_count: number;
  matching_objects?: number;
}

export const FILTER_STATUS_CONFIG: Record<FilterStatus, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: 'text-muted-foreground', bg: 'bg-muted' },
  active: { label: 'Active', color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  archived: { label: 'Archived', color: 'text-muted-foreground/60', bg: 'bg-muted/50' },
};

export const FILTER_PERMISSION_CONFIG: Record<FilterPermission, { label: string; color: string; bg: string; icon: string }> = {
  editable: { label: 'Editable', color: 'text-sky-600', bg: 'bg-sky-500/10', icon: '🔓' },
  locked: { label: 'Locked', color: 'text-muted-foreground', bg: 'bg-muted', icon: '🔒' },
};

export const FILTER_VISIBILITY_CONFIG: Record<FilterVisibility, { label: string; color: string; bg: string; icon: string }> = {
  public: { label: 'Public', color: 'text-emerald-600', bg: 'bg-emerald-500/10', icon: '🌐' },
  private: { label: 'Private', color: 'text-amber-600', bg: 'bg-amber-500/10', icon: '🔐' },
};

export const TOPOLOGY_DIMENSIONS = [
  { key: 'vendor', label: 'Vendor', options: ['Nokia', 'Ericsson', 'Huawei', 'Samsung', 'RanSharing'], multiSelect: true, bulkSupport: false },
  { key: 'dor', label: 'DOR', options: ['ILE_DE_FRANCE', 'NORD_EST', 'OUEST', 'SUD_EST', 'SUD_OUEST'], multiSelect: true, bulkSupport: false },
  { key: 'plaque', label: 'Plaque', options: ['Plaque_A', 'Plaque_B', 'Plaque_C', 'Plaque_D', 'Plaque_E', 'Plaque_F'], multiSelect: true, bulkSupport: false },
  { key: 'band', label: 'Band', options: ['NR_3500', 'NR_700', 'LTE2600', 'LTE2100', 'LTE1800', 'LTE800', 'LTE700'], multiSelect: true, bulkSupport: false },
  { key: 'sites', label: 'Sites', options: [], multiSelect: true, bulkSupport: true },
  { key: 'cells', label: 'Cells', options: [], multiSelect: true, bulkSupport: true },
  { key: 'pci', label: 'PCI', options: [], multiSelect: true, bulkSupport: true },
  { key: 'eci', label: 'ECI', options: [], multiSelect: true, bulkSupport: true },
  { key: 'nci', label: 'NCI', options: [], multiSelect: true, bulkSupport: true },
];

// Static fallback — overridden at runtime by fetchParameterOptions()
// These are CM (Configuration Management) parameters, NOT KPIs
export const PARAMETER_OPTIONS = [
  'cellIndividualOffset', 'qRxLevMin', 'pMax', 'tReselectionEUTRA',
  'threshServingLowP', 'sIntraSearch', 'sNonIntraSearch', 'hystRSRP',
  'timeToTrigger', 'a3Offset', 'reportInterval', 'filterCoefficient',
  'pZeroNominalPUSCH', 'referenceSignalPower', 'pa', 'pb',
  'rachPreambleInitialPower', 'powerRampingStep', 'preambleTransMax',
  'maxHARQ_Msg3Tx', 'nRB_CQI', 'cqi_PMI_ConfigIndex',
  'srsBandwidthConfig', 'srsSubframeConfig', 'simultaneousAckNackAndCQI',
  'tac', 'rootSequenceIndex', 'prach_ConfigIndex', 'zeroCorrelationZoneConfig',
  'highSpeedFlag', 'prach_FreqOffset',
];

// Dynamic fetch from parameter_changes table (CM parameters)
let _cachedParamOptions: string[] | null = null;
export async function fetchParameterOptions(): Promise<string[]> {
  if (_cachedParamOptions) return _cachedParamOptions;
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await (supabase as any)
      .from('parameter_changes')
      .select('param_name')
      .order('param_name', { ascending: true });
    if (error) throw error;
    // Deduplicate param names
    const unique = [...new Set((data || []).map((r: any) => r.param_name).filter(Boolean))] as string[];
    _cachedParamOptions = unique.length > 0 ? unique : PARAMETER_OPTIONS;
    return _cachedParamOptions;
  } catch {
    return PARAMETER_OPTIONS;
  }
}

export const OPERATOR_OPTIONS = ['=', '!=', '>', '>=', '<', '<=', 'IN', 'NOT IN', 'BETWEEN'];

/* ── Mock Data ── */
export const MOCK_FILTERS: NetworkFilter[] = [
  {
    id: 'f1', name: 'Nokia LTE North Region', description: 'All Nokia LTE cells in NORD_EST region with high traffic',
    status: 'active', permission: 'editable', visibility: 'public', created_by: 'admin', created_at: '2025-03-15', updated_at: '2025-04-01', updated_by: 'admin',
    topology: [
      { dimension: 'vendor', operator: 'in', values: ['Nokia'] },
      { dimension: 'dor', operator: 'in', values: ['NORD_EST'] },
      { dimension: 'band', operator: 'in', values: ['LTE1800', 'LTE2100'] },
    ],
    parameters: [
      { id: 'p1', parameter: 'Traffic Volume', operator: '>=', value: '100' },
      { id: 'p2', parameter: 'Availability', operator: '>', value: '95' },
    ],
    logic: 'AND', condition_count: 5, matching_objects: 1247,
  },
  {
    id: 'f2', name: 'NR Ericsson High Traffic Sites', description: 'Ericsson 5G NR sites with high throughput demand',
    status: 'active', permission: 'locked', visibility: 'public', created_by: 'perf_engineer', created_at: '2025-02-20', updated_at: '2025-03-28', updated_by: 'perf_engineer',
    topology: [
      { dimension: 'vendor', operator: 'in', values: ['Ericsson'] },
      { dimension: 'band', operator: 'in', values: ['NR_3500', 'NR_700'] },
    ],
    parameters: [
      { id: 'p3', parameter: 'Throughput DL', operator: '>=', value: '500' },
    ],
    logic: 'AND', condition_count: 3, matching_objects: 834,
  },
  {
    id: 'f3', name: 'Huawei Cells PCI List', description: 'Specific Huawei cells identified by PCI for interference analysis',
    status: 'draft', permission: 'editable', visibility: 'private', created_by: 'radio_eng', created_at: '2025-04-01', updated_at: '2025-04-01', updated_by: 'radio_eng',
    topology: [
      { dimension: 'vendor', operator: 'in', values: ['Huawei'] },
      { dimension: 'pci', operator: 'in', values: ['100', '200', '300', '450', '512'] },
    ],
    parameters: [],
    logic: 'AND', condition_count: 2, matching_objects: 42,
  },
  {
    id: 'f4', name: 'LTE Plaque A Accessibility Degradation', description: 'Monitoring accessibility issues in Plaque A LTE network',
    status: 'active', permission: 'editable', visibility: 'public', created_by: 'noc_lead', created_at: '2025-01-10', updated_at: '2025-03-15', updated_by: 'noc_lead',
    topology: [
      { dimension: 'plaque', operator: 'in', values: ['Plaque_A'] },
      { dimension: 'band', operator: 'in', values: ['LTE800', 'LTE1800', 'LTE2600'] },
    ],
    parameters: [
      { id: 'p4', parameter: 'Accessibility', operator: '<', value: '98' },
      { id: 'p5', parameter: 'RRC SR', operator: '<', value: '99' },
    ],
    logic: 'OR', condition_count: 4, matching_objects: 156,
  },
  {
    id: 'f5', name: 'IDF Critical Sites Monitoring', description: 'Critical infrastructure sites in Île-de-France requiring priority monitoring',
    status: 'active', permission: 'locked', visibility: 'private', created_by: 'admin', created_at: '2024-12-01', updated_at: '2025-04-02', updated_by: 'admin',
    topology: [
      { dimension: 'dor', operator: 'in', values: ['ILE_DE_FRANCE'] },
      { dimension: 'vendor', operator: 'in', values: ['Nokia', 'Ericsson'] },
    ],
    parameters: [
      { id: 'p6', parameter: 'Availability', operator: '<', value: '99.5' },
    ],
    logic: 'AND', condition_count: 3, matching_objects: 89,
  },
  {
    id: 'f6', name: 'Archived - Old QoE Filter', description: 'Previously used QoE degradation filter — no longer maintained',
    status: 'archived', permission: 'locked', visibility: 'private', created_by: 'perf_engineer', created_at: '2024-06-15', updated_at: '2024-11-30', updated_by: 'perf_engineer',
    topology: [{ dimension: 'dor', operator: 'in', values: ['SUD_EST', 'SUD_OUEST'] }],
    parameters: [{ id: 'p7', parameter: 'QoE Index', operator: '<', value: '60' }],
    logic: 'AND', condition_count: 2, matching_objects: 0,
  },
];