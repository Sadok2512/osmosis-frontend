/**
 * geometry.js — Convex 2D primitives used by the site-coverage renderer.
 *
 * All operations work in an abstract Cartesian plane (x, y). The caller
 * is expected to project (lng, lat) to flat metres (equirectangular at a
 * fixed reference latitude) before invoking these — that way disks look
 * round and wedges share consistent angular geometry regardless of where
 * the operator pans.
 *
 * Conventions:
 *   - Bearings are degrees from north (0° = +y), clockwise positive
 *     (90° = +x = east).
 *   - Polygons are arrays of {x, y}. Orientation is irrelevant for
 *     polygonIntersection — it auto-detects via signed area.
 *   - All polygons produced here are convex (regular n-gon, sector
 *     wedge with span < 180°). polygonIntersection assumes the CLIPPER
 *     polygon (the second argument) is convex; the SUBJECT can be any
 *     simple polygon (we always pass convex subjects too).
 */

const TAU = Math.PI * 2;

/**
 * Regular `segments`-gon approximating a disk of `radiusMeters` around
 * `center`. Default 24 vertices — visually circular at typical zooms,
 * cheap to clip.
 *
 * @param {{x:number,y:number}} center
 * @param {number} radiusMeters
 * @param {number} [segments=24]
 * @returns {Array<{x:number,y:number}>}
 */
export function approximateDisk(center, radiusMeters, segments = 24) {
  const out = [];
  for (let i = 0; i < segments; i++) {
    const a = (i * TAU) / segments;
    out.push({
      x: center.x + Math.cos(a) * radiusMeters,
      y: center.y + Math.sin(a) * radiusMeters,
    });
  }
  return out;
}

/**
 * Sector wedge from `startBearing` to `endBearing` of radius
 * `radiusMeters` around `center`. Bearings are degrees from north,
 * clockwise. Convex when (endBearing - startBearing) mod 360 < 180.
 *
 * Vertex order: origin → arc from start to end → implicit closing back.
 *
 * @param {{x:number,y:number}} center
 * @param {number} radiusMeters
 * @param {number} startBearing
 * @param {number} endBearing
 * @param {number} [segments=12]
 * @returns {Array<{x:number,y:number}>}
 */
export function approximateWedge(center, radiusMeters, startBearing, endBearing, segments = 12) {
  let s = startBearing;
  let e = endBearing;
  // Normalise so end > start; tolerate callers passing az - bw/2 < 0.
  while (e <= s) e += 360;
  const span = e - s;

  const out = [{ x: center.x, y: center.y }];
  for (let i = 0; i <= segments; i++) {
    const bearing = s + (span * i) / segments;
    const rad = (bearing * Math.PI) / 180;
    // bearing 0 = north (+y), 90 = east (+x) → dir = (sin, cos)
    out.push({
      x: center.x + Math.sin(rad) * radiusMeters,
      y: center.y + Math.cos(rad) * radiusMeters,
    });
  }
  return out;
}

/**
 * Convex × convex polygon intersection by Sutherland-Hodgman. Clips
 * `polyA` against each edge of `polyB`. Auto-detects polyB's winding
 * (CW vs CCW) so callers don't have to care about orientation.
 *
 * @param {Array<{x:number,y:number}>} polyA
 * @param {Array<{x:number,y:number}>} polyB  must be convex
 * @returns {Array<{x:number,y:number}>}
 */
export function polygonIntersection(polyA, polyB) {
  if (!polyA?.length || !polyB?.length) return [];
  // Winding sign: +1 if polyB is CCW (interior on the left of each
  // directed edge), -1 if CW (interior on the right). Signed area
  // (shoelace) carries the same sign — see Goldman 1991.
  const sign = polygonOrientation(polyB) >= 0 ? 1 : -1;

  let output = polyA.slice();
  for (let i = 0; i < polyB.length; i++) {
    const ea = polyB[i];
    const eb = polyB[(i + 1) % polyB.length];
    output = clipByEdge(output, ea, eb, sign);
    if (output.length === 0) return [];
  }
  return output;
}

/** Signed twice the area of a 2D polygon (shoelace). Positive => CCW. */
function polygonOrientation(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}

/**
 * Sutherland-Hodgman clip step: keep the part of `poly` that lies on
 * the "inside" half-plane of the directed edge ea → eb. `sign` is +1 if
 * the clipper polygon is CCW (inside = left of edge), -1 if CW.
 */
function clipByEdge(poly, ea, eb, sign) {
  const ex = eb.x - ea.x;
  const ey = eb.y - ea.y;
  // cross((p - ea), (eb - ea)) — positive means p is left of the edge,
  // negative means right. Multiplied by `sign` so "inside" is always >= 0.
  const inside = (p) => sign * ((p.x - ea.x) * ey - (p.y - ea.y) * ex) <= 0;

  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const pIn = inside(p);
    const qIn = inside(q);
    if (pIn) out.push(p);
    if (pIn !== qIn) {
      const hit = intersectSegmentLine(p, q, ea, eb);
      if (hit) out.push(hit);
    }
  }
  return out;
}

/** Intersection of segment p→q with the infinite line through ea, eb. */
function intersectSegmentLine(p, q, ea, eb) {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const ex = eb.x - ea.x;
  const ey = eb.y - ea.y;
  const denom = dx * ey - dy * ex;
  // Parallel / coincident: no single intersection point.
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((ea.x - p.x) * ey - (ea.y - p.y) * ex) / denom;
  return { x: p.x + t * dx, y: p.y + t * dy };
}
