import { ChartConfig } from './biTypes';
import { TextWidgetConfig } from './BITextWidget';
import { ImageWidgetConfig } from './BIImageWidget';
import { TableWidgetConfig } from './BITableWidget';

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

export interface WidgetLayout {
  x: number; y: number; w: number; h: number;
  // Free-mode pixel positions (populated when switching to free mode)
  freeX?: number; freeY?: number; freeW?: number; freeH?: number;
}

export type LayoutMode = 'grid' | 'free';

export type WidgetItem =
  | { kind: 'chart'; config: ChartConfig; layout: WidgetLayout }
  | { kind: 'text'; config: TextWidgetConfig; layout: WidgetLayout }
  | { kind: 'map'; config: MapWidgetConfig; layout: WidgetLayout }
  | { kind: 'image'; config: ImageWidgetConfig; layout: WidgetLayout }
  | { kind: 'table'; config: TableWidgetConfig; layout: WidgetLayout };
