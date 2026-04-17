export type ViewMode = 'view' | 'edit' | 'presentation';

export type WidgetKind = 'chart' | 'map' | 'kpi' | 'table';

export interface DynWidget {
  id: string;
  kind: WidgetKind;
  title?: string;
}

export interface PAPage {
  id: string;
  name: string;
  widgets: DynWidget[];
}

export interface KPI {
  label: string;
  value: string;
  unit?: string;
  trend?: string;
  status: 'optimal' | 'warning' | 'critical';
  color: string;
}

export interface NodeData {
  id: string;
  load: number;
  throughput: string;
  health: 'optimal' | 'warning' | 'critical';
}

export interface MetricPoint {
  time: string;
  value: number;
  secondary?: number;
}
