// Schema TypeScript du payload "WorstCellsView" — émis par l'agent OSMOSIS
// dans un bloc ```worst_cells JSON. Mirroire de la spec backend.

export type Severity = "critical" | "severe" | "warning" | "success" | "info";

export interface MetricSpec {
  name: string;          // "DCR VoLTE"
  unit: string;          // "%"
  direction: "lower_is_better" | "higher_is_better";
  thresholds: {
    critical: number;
    severe: number;
    warning: number;
  };
}

export interface ScopeInfo {
  type: "region" | "cluster" | "site";
  name: string;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapSpec {
  center: { lat: number; lon: number };
  zoom: number;
  bounds?: MapBounds;
  healthy_sites_count: number;
}

export interface WorstCell {
  rank: number;
  cell_id: string;
  cell_display: string;       // Nom humain ("Osm Naval Group")
  cell_tech_label: string;    // Sous-ligne mono ("Indret · eNB1 · H1")
  site_id: string;
  coords: { lat: number; lon: number };
  metric_value: number;
  delta_vs_baseline: number;
  vendor: string;
  severity: Severity;
  drill_down_prompt: string;
}

export interface CommonPattern {
  label: string;
  description: string;
  severity: "warning" | "danger" | "info";
  drill_down_prompt: string;
}

export interface ToolbarAction {
  label: string;
  prompt?: string;
  type: "prompt" | "export_csv" | "export_pdf";
}

export interface WorstCellsResponse {
  view_type: "ranked_list_with_map";
  title: string;
  scope: ScopeInfo;
  metric: MetricSpec;
  map: MapSpec;
  cells: WorstCell[];
  common_pattern?: CommonPattern;
  actions?: ToolbarAction[];
}

// Fonction sendPrompt fournie par l'app (chat input handler).
export type SendPromptFn = (text: string) => void;

// Compute bounds from cells if not provided in payload.
export function computeBoundsFromCells(cells: WorstCell[], padding = 0.05): MapBounds {
  if (cells.length === 0) {
    return { north: 47.3, south: 47.1, east: -1.4, west: -1.7 };
  }
  let n = -Infinity, s = Infinity, e = -Infinity, w = Infinity;
  for (const c of cells) {
    if (c.coords.lat > n) n = c.coords.lat;
    if (c.coords.lat < s) s = c.coords.lat;
    if (c.coords.lon > e) e = c.coords.lon;
    if (c.coords.lon < w) w = c.coords.lon;
  }
  const dLat = (n - s) || 0.05;
  const dLon = (e - w) || 0.05;
  return {
    north: n + dLat * padding,
    south: s - dLat * padding,
    east:  e + dLon * padding,
    west:  w - dLon * padding,
  };
}

// Project lat/lon → SVG coords for the map.
export function projectCoords(
  lat: number, lon: number,
  bounds: MapBounds,
  width: number, height: number,
): { x: number; y: number } {
  const x = ((lon - bounds.west) / (bounds.east - bounds.west)) * width;
  const y = ((bounds.north - lat) / (bounds.north - bounds.south)) * height;
  return { x, y };
}
