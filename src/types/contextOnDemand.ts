/**
 * Context-on-Demand types — shared between frontend and edge function.
 * The frontend sends only uiScope + filters (no more giant cellContext).
 * The edge function builds a ContextPlan, fetches only needed data, and enforces budgets.
 */

// ── UI Scope (what the user is looking at) ──

export interface UiScope {
  selectedSiteName?: string | null;
  selectedCellId?: string | null;
  page?: 'global' | 'vendor' | 'site' | 'cell' | 'kpi_monitor';
}

// ── Filters (from global filter bar or UI state) ──

export interface AssistantFilters {
  vendor?: string;
  techno?: string;
  plaque?: string;
  dor?: string;
  dateRange?: { from: string; to: string };
}

// ── New API payload (frontend → edge function) ──

export interface QoeAssistantPayload {
  messages: { role: string; content: string }[];
  uiScope?: UiScope;
  filters?: AssistantFilters;
  openrouter_key?: string;
  model?: string;
  // KPI Monitor specific context (lightweight metadata, not raw data)
  kpiMonitorContext?: string;
}

// ── Intent classification ──

export type Intent =
  | 'global_summary'
  | 'top_degradations'
  | 'site_analysis'
  | 'cell_analysis'
  | 'compare'
  | 'definition'
  | 'trace_change'
  | 'distribution'
  | 'other';

// ── Scope resolution ──

export type Scope =
  | { level: 'global' }
  | { level: 'vendor'; vendor: string }
  | { level: 'techno'; techno: string }
  | { level: 'plaque'; plaque: string }
  | { level: 'dor'; dor: string }
  | { level: 'site'; siteName: string }
  | { level: 'cell'; cellId: string; siteName?: string };

// ── Data needs ──

export type DataNeed =
  | 'agg_stats'
  | 'worst_sites'
  | 'best_sites'
  | 'worst_cells'
  | 'best_cells'
  | 'kpi_snapshot'
  | 'kpi_timeseries'
  | 'alarms'
  | 'topology'
  | 'param_dump'
  | 'change_history'
  | 'documents_rag';

// ── Context Plan (output of the planner) ──

export interface ContextPlan {
  agent: 'PULSE' | 'TRACE' | 'SENTINEL' | 'TOPO';
  intent: Intent;
  scope: Scope;
  needs: DataNeed[];
  limits: {
    maxSites: number;
    maxCells: number;
    maxKpis: number;
    maxDays: number;
    maxRagChunks: number;
  };
  clarificationNeeded?: boolean;
  clarificationQuestion?: string;
}
