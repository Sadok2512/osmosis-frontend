export type ViewMode = 'view' | 'edit' | 'presentation';

export type WidgetKind = 'chart' | 'map' | 'kpi' | 'table' | 'text' | 'image';

export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DynWidget {
  id: string;
  kind: WidgetKind;
  title?: string;
  /** Free-form rich text body (used by `text` widget). */
  body?: string;
  /** Image source URL (used by `image` widget). */
  imageUrl?: string;
  /** Optional caption for `image` widget. */
  caption?: string;
  layout: WidgetLayout;
}

export interface PASection {
  id: string;
  name: string;
  title: string;
  description: string;
}

export interface PAPage {
  id: string;
  name: string;
  widgets: DynWidget[];
  sections: PASection[];
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
