import { ChartConfig } from './biTypes';
import { TextWidgetConfig } from './BITextWidget';

export type WidgetItem =
  | { kind: 'chart'; config: ChartConfig; layout: { x: number; y: number; w: number; h: number } }
  | { kind: 'text'; config: TextWidgetConfig; layout: { x: number; y: number; w: number; h: number } };
