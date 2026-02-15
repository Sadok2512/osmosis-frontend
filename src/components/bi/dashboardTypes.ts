import { ChartConfig } from './biTypes';
import { TextWidgetConfig } from './BITextWidget';

export interface MapWidgetConfig {
  id: string;
  title: string;
  metric: string;
  vendorFilter: string;
  technoFilter: string;
  dorFilter: string;
  plaqueFilter: string;
  mapLayer: 'light' | 'dark' | 'satellite';
  center: [number, number];
  zoom: number;
  showSiteNames: boolean;
  showMetricValues: boolean;
}

export function createDefaultMapWidget(id: string): MapWidgetConfig {
  return {
    id,
    title: 'Sites Map',
    metric: 'qoe_score_avg',
    vendorFilter: 'ALL',
    technoFilter: 'ALL',
    dorFilter: 'ALL',
    plaqueFilter: 'ALL',
    mapLayer: 'light',
    center: [46.6, 2.5],
    zoom: 6,
    showSiteNames: false,
    showMetricValues: true,
  };
}

export type WidgetItem =
  | { kind: 'chart'; config: ChartConfig; layout: { x: number; y: number; w: number; h: number } }
  | { kind: 'text'; config: TextWidgetConfig; layout: { x: number; y: number; w: number; h: number } }
  | { kind: 'map'; config: MapWidgetConfig; layout: { x: number; y: number; w: number; h: number } };
