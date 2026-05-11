# Visual Coverage Module — Site footprints + sector wedges

Renders an approximate cell-coverage layer on top of an existing Leaflet
map. **No real RF propagation.** Geometry only.

## Model

Each **site** gets one footprint, computed as:

```
footprint = disk(site_center, max_radius) ∩ voronoi_cell(site)
```

- The disk gives each site a circular "reach" up to `maxRadiusMeters`.
- The Voronoi cell (computed over **site centres only**, not per cell)
  cuts the disk where a neighbouring site is closer. Without a neighbour
  in range, the disk wins → isolated sites stay round/octagonal.
- The whole map shows **islands** of coverage with empty space between
  distant sites — not a full tessellation.

Each **cell** of the site contributes one wedge on top of the footprint:

```
wedge = approximateWedge(site_center, cell.maxRadius, azimuth ± beamwidth/2)
wedge = wedge ∩ footprint
```

The wedges form the "daisy / star" pattern you expect from a real RAN
tool — 3 to 6 triangular slices pointing in each cell's azimuth.

A site's KPI is the **worst KPI across its cells** (`red > orange > green`).
Both footprint and wedges use that colour, with the wedges slightly more
saturated so they read as "the antenna direction" against the base
footprint.

## Public API

```js
import { initVisualCoverage } from './coverage-layer.js';

const ctl = initVisualCoverage({
  map,             // Leaflet L.Map instance (required)
  cells,           // array of Cell objects (required)
  panelMount,      // optional HTMLElement — where to inject the panel
  defaultEnabled,  // boolean, default false
  maxRadiusMeters, // default 1500
});

ctl.setEnabled(true | false);
ctl.rebuild(newCells);
ctl.on('ready', ({ nSites, nCells, nNeighbors, elapsedMs }) => { … });
ctl.on('status', state => { … });   // 'Ready' | 'Loading' | 'Error'
ctl.destroy();
```

Lower-level (framework-agnostic) entry point:

```js
import { buildSiteCoverage } from './coverage.js';

const { fc, wedgesFc, nSites, nCells, nNeighbors, elapsedMs }
  = buildSiteCoverage(cells, { maxRadiusMeters: 1500 });

// fc       = FeatureCollection of site footprints
// wedgesFc = FeatureCollection of sector wedges
// Both are ready to drop into any GeoJSON consumer (Leaflet,
// Mapbox GL, MapLibre, custom canvas).
```

## Cell input shape

```ts
interface Cell {
  id:        string;            // unique cell id
  siteId:    string;            // parent site — used for grouping
  siteName:  string;
  lat:       number;
  lon:       number;
  azimuth:   number;            // 0-360, 0 = north, clockwise
  beamwidth: number;            // typically 65; ≥ 180 ⇒ omni (no wedge)
  maxRadius?: number;           // metres; per-cell override of the default
  tech?:     string;            // '4G', '5G', …
  band?:     string;
  kpi?:      'green' | 'orange' | 'red';
  rsrp?:     number;            // optional, displayed in tooltip
}
```

## Property maps

**Site footprint feature properties** (`fc.features[i].properties`):
`siteId`, `siteName`, `kpi`, `nCells`, `nNeighbors`, `technologies[]`.

**Wedge feature properties** (`wedgesFc.features[i].properties`):
`cellId`, `siteId`, `siteName`, `kpi`, `azimuth`, `beamwidth`, `tech`,
`band`, `rsrp`, `neighbors`.

## Geometry primitives

`geometry.js` exposes three convex helpers used by `coverage.js`. They
operate in an abstract (x, y) plane; the caller projects (lng, lat) to
flat metres first.

- `approximateDisk(center, radius, segments=24)` — regular N-gon disk.
- `approximateWedge(center, radius, startBearing, endBearing, segments=12)`
  — pie-slice; convex for spans < 180°.
- `polygonIntersection(polyA, polyB)` — Sutherland-Hodgman, auto-detects
  the clipper's winding.

`voronoi.js` is unchanged from the original drop-in package; the site
refactor reuses it as-is for the site-level tessellation.

## CSS classes

All classes are namespaced with `.cov-`. Override colours via your own
stylesheet rather than editing `coverage-panel.css`.

## License

MIT-style — use freely in your dashboard.
