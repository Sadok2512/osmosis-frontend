/**
 * voronoi.js — In-house Voronoi diagram via half-plane clipping.
 *
 * No dependencies. Suitable for ≤ ~2000 points. O(n²) in practice, but each
 * cell is clipped against only its ~40 nearest neighbors which keeps it fast.
 *
 * Coordinates here are abstract (x, y). The caller is expected to feed
 * (longitude, latitude) and accept the same back. For a small geographic
 * area, the resulting polygons are geometrically correct enough.
 */

/**
 * Build Voronoi cells for a set of 2D points.
 *
 * @param {Array<{x:number,y:number}>} points
 * @param {[number,number,number,number]} bbox  [xmin, ymin, xmax, ymax]
 * @param {object} [opts]
 * @param {number} [opts.neighborLimit=40] How many nearest sites to clip against
 * @returns {{
 *   polys: Array<Array<{x:number,y:number}>>,
 *   neighborGraph: Array<Set<number>>
 * }}
 */
export function voronoiCells(points, bbox, opts = {}) {
  const neighborLimit = opts.neighborLimit ?? 40;

  const poly0 = [
    { x: bbox[0], y: bbox[1] },
    { x: bbox[2], y: bbox[1] },
    { x: bbox[2], y: bbox[3] },
    { x: bbox[0], y: bbox[3] },
  ];

  const polys = [];
  const neighborGraph = points.map(() => new Set());

  for (let i = 0; i < points.length; i++) {
    let poly = poly0.slice();
    const pi = points[i];

    // Sort other points by squared distance to i.
    const others = [];
    for (let j = 0; j < points.length; j++) {
      if (j === i) continue;
      const dx = points[j].x - pi.x;
      const dy = points[j].y - pi.y;
      others.push({ j, d2: dx * dx + dy * dy });
    }
    others.sort((a, b) => a.d2 - b.d2);

    const limit = Math.min(others.length, neighborLimit);

    // Clip by perpendicular bisector for each near neighbor.
    for (let m = 0; m < limit; m++) {
      const pj = points[others[m].j];
      poly = clipByBisector(poly, pi, pj);
      if (poly.length === 0) break;
    }

    // Record neighbors: any j whose bisector midpoint lies inside i's cell.
    if (poly.length) {
      for (let m = 0; m < limit; m++) {
        const j = others[m].j;
        const pj = points[j];
        const mx = (pi.x + pj.x) / 2;
        const my = (pi.y + pj.y) / 2;
        if (pointInPolygon({ x: mx, y: my }, poly)) {
          neighborGraph[i].add(j);
          neighborGraph[j].add(i);
        }
      }
    }
    polys.push(poly);
  }
  return { polys, neighborGraph };
}

/**
 * Clip a convex polygon by the half-plane closer to `pi` than to `pj`.
 * Implements Sutherland–Hodgman against a single bisector.
 */
function clipByBisector(poly, pi, pj) {
  const mx = (pi.x + pj.x) / 2;
  const my = (pi.y + pj.y) / 2;
  const nx = pj.x - pi.x;
  const ny = pj.y - pi.y;
  const inside = (p) => (p.x - mx) * nx + (p.y - my) * ny <= 0;

  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const aIn = inside(a);
    const bIn = inside(b);
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const denom = (b.x - a.x) * nx + (b.y - a.y) * ny;
      if (Math.abs(denom) < 1e-15) continue;
      const t = ((mx - a.x) * nx + (my - a.y) * ny) / denom;
      out.push({
        x: a.x + t * (b.x - a.x),
        y: a.y + t * (b.y - a.y),
      });
    }
  }
  return out;
}

/** Even-odd ray casting point-in-polygon test. */
function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > p.y) !== (yj > p.y)) &&
        (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}
