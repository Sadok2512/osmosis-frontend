import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useMapEvents, Circle, Polyline, Polygon, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { MapToolType, DistanceMeasurement, ConcentricRingsData, PolygonZoneData, RING_PRESETS } from './MapToolsTypes';
import { haversineDistance, bearing } from '@/utils/geodesicUtils';

// ─── Distance Tool ───────────────────────────────────────

interface DistanceToolProps {
  active: boolean;
  measurement: DistanceMeasurement;
  onUpdate: (m: DistanceMeasurement) => void;
}

const markerIcon = (color: string) => L.divIcon({
  className: '',
  html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

export const DistanceTool: React.FC<DistanceToolProps> = ({ active, measurement, onUpdate }) => {
  const [hoverPos, setHoverPos] = useState<[number, number] | null>(null);

  useMapEvents({
    click(e) {
      if (!active) return;
      const pt: [number, number] = [e.latlng.lat, e.latlng.lng];
      if (!measurement.pointA) {
        onUpdate({ pointA: pt, pointB: null });
      } else if (!measurement.pointB) {
        onUpdate({ ...measurement, pointB: pt });
      } else {
        // restart
        onUpdate({ pointA: pt, pointB: null });
      }
    },
    mousemove(e) {
      if (active && measurement.pointA && !measurement.pointB) {
        setHoverPos([e.latlng.lat, e.latlng.lng]);
      }
    },
  });

  useEffect(() => {
    if (!active) setHoverPos(null);
  }, [active]);

  if (!active && !measurement.pointA) return null;

  const lineEnd = measurement.pointB || hoverPos;
  const dist = measurement.pointA && lineEnd
    ? haversineDistance({ lat: measurement.pointA[0], lng: measurement.pointA[1] }, { lat: lineEnd[0], lng: lineEnd[1] })
    : 0;
  const az = measurement.pointA && lineEnd
    ? bearing({ lat: measurement.pointA[0], lng: measurement.pointA[1] }, { lat: lineEnd[0], lng: lineEnd[1] })
    : 0;
  const distLabel = dist >= 1000 ? `${(dist / 1000).toFixed(2)} km` : `${Math.round(dist)} m`;
  const midPoint = measurement.pointA && lineEnd
    ? [(measurement.pointA[0] + lineEnd[0]) / 2, (measurement.pointA[1] + lineEnd[1]) / 2] as [number, number]
    : null;

  return (
    <>
      {measurement.pointA && (
        <Marker position={measurement.pointA} icon={markerIcon('#f59e0b')} interactive={false} />
      )}
      {measurement.pointB && (
        <Marker position={measurement.pointB} icon={markerIcon('#f59e0b')} interactive={false} />
      )}
      {measurement.pointA && lineEnd && (
        <Polyline
          positions={[measurement.pointA, lineEnd]}
          pathOptions={{
            color: '#f59e0b',
            weight: 2,
            dashArray: measurement.pointB ? undefined : '6,4',
            opacity: 0.9,
          }}
        />
      )}
      {midPoint && dist > 0 && (
        <Marker position={midPoint} icon={L.divIcon({
          className: '',
          html: `<div style="background:rgba(0,0,0,.75);color:#fbbf24;padding:2px 6px;border-radius:6px;font-size:11px;font-weight:700;white-space:nowrap;font-family:monospace;pointer-events:none">${distLabel} · ${Math.round(az)}°</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, -8],
        })} interactive={false} />
      )}
    </>
  );
};

// ─── Concentric Rings Tool ───────────────────────────────

interface ConcentricRingsToolProps {
  active: boolean;
  data: ConcentricRingsData;
  onUpdate: (d: ConcentricRingsData) => void;
  presetIndex: number;
}

const RING_COLORS = ['#06b6d4', '#0891b2', '#0e7490', '#155e75'];

export const ConcentricRingsTool: React.FC<ConcentricRingsToolProps> = ({ active, data, onUpdate, presetIndex }) => {
  const [hoverPos, setHoverPos] = useState<[number, number] | null>(null);
  const [hoverDist, setHoverDist] = useState<number>(0);
  const radii = RING_PRESETS[presetIndex]?.radii || RING_PRESETS[0].radii;

  useMapEvents({
    click(e) {
      if (!active) return;
      const pt: [number, number] = [e.latlng.lat, e.latlng.lng];
      onUpdate({ center: pt, radii });
    },
    mousemove(e) {
      if (active && !data.center) {
        setHoverPos([e.latlng.lat, e.latlng.lng]);
      }
      if (active && data.center) {
        const d = haversineDistance(
          { lat: data.center[0], lng: data.center[1] },
          { lat: e.latlng.lat, lng: e.latlng.lng }
        );
        setHoverDist(d);
      }
    },
  });

  // Update radii when preset changes
  useEffect(() => {
    if (data.center) {
      onUpdate({ ...data, radii });
    }
  }, [presetIndex]);

  if (!data.center && !hoverPos) return null;

  const center = data.center || hoverPos!;

  return (
    <>
      <Marker position={center} icon={markerIcon('#06b6d4')} interactive={false} />
      {(data.center ? data.radii : radii).map((r, i) => (
        <React.Fragment key={r}>
          <Circle
            center={center}
            radius={r}
            pathOptions={{
              color: RING_COLORS[i % RING_COLORS.length],
              weight: 1.5,
              fillOpacity: data.center ? 0.04 : 0.02,
              dashArray: data.center ? undefined : '4,4',
              opacity: data.center ? 0.7 : 0.3,
            }}
          />
          {/* Label at north of each ring */}
          <Marker
            position={[center[0] + (r / 111320), center[1]]}
            icon={L.divIcon({
              className: '',
              html: `<div style="background:rgba(0,0,0,.7);color:${RING_COLORS[i % RING_COLORS.length]};padding:1px 5px;border-radius:4px;font-size:10px;font-weight:700;font-family:monospace;pointer-events:none;white-space:nowrap">${r >= 1000 ? `${r / 1000}km` : `${r}m`}</div>`,
              iconSize: [0, 0],
              iconAnchor: [0, 6],
            })}
            interactive={false}
          />
        </React.Fragment>
      ))}
    </>
  );
};

// ─── Polygon Zone Tool ───────────────────────────────────

interface PolygonZoneToolProps {
  active: boolean;
  data: PolygonZoneData;
  onUpdate: (d: PolygonZoneData) => void;
}

function computePolygonArea(pts: [number, number][]): number {
  // Shoelace formula on projected coords (approximate for small areas)
  if (pts.length < 3) return 0;
  const R = 6371000;
  const toRad = Math.PI / 180;
  const refLat = pts[0][0] * toRad;
  const projected = pts.map(p => [
    (p[1] - pts[0][1]) * toRad * R * Math.cos(refLat),
    (p[0] - pts[0][0]) * toRad * R,
  ]);
  let area = 0;
  for (let i = 0; i < projected.length; i++) {
    const j = (i + 1) % projected.length;
    area += projected[i][0] * projected[j][1];
    area -= projected[j][0] * projected[i][1];
  }
  return Math.abs(area / 2);
}

function computePerimeter(pts: [number, number][]): number {
  if (pts.length < 2) return 0;
  let peri = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    peri += haversineDistance({ lat: pts[i][0], lng: pts[i][1] }, { lat: pts[j][0], lng: pts[j][1] });
  }
  return peri;
}

export const PolygonZoneTool: React.FC<PolygonZoneToolProps> = ({ active, data, onUpdate }) => {
  const [hoverPos, setHoverPos] = useState<[number, number] | null>(null);

  useMapEvents({
    click(e) {
      if (!active) return;
      const pt: [number, number] = [e.latlng.lat, e.latlng.lng];
      onUpdate({ points: [...data.points, pt] });
    },
    dblclick(e) {
      if (!active) return;
      e.originalEvent.preventDefault();
      // double click closes the polygon — don't add another point
    },
    mousemove(e) {
      if (active && data.points.length > 0) {
        setHoverPos([e.latlng.lat, e.latlng.lng]);
      }
    },
  });

  useEffect(() => {
    if (!active) setHoverPos(null);
  }, [active]);

  if (data.points.length === 0 && !active) return null;

  const allPts = data.points;
  const displayPts = hoverPos && active ? [...allPts, hoverPos] : allPts;
  const isClosed = allPts.length >= 3;

  const area = isClosed ? computePolygonArea(allPts) : 0;
  const perimeter = allPts.length >= 2 ? computePerimeter(allPts) : 0;
  const fmtArea = area >= 1e6 ? `${(area / 1e6).toFixed(2)} km²` : `${Math.round(area)} m²`;
  const fmtPerimeter = perimeter >= 1000 ? `${(perimeter / 1000).toFixed(2)} km` : `${Math.round(perimeter)} m`;

  // compute centroid
  const centroid: [number, number] | null = isClosed
    ? [allPts.reduce((s, p) => s + p[0], 0) / allPts.length, allPts.reduce((s, p) => s + p[1], 0) / allPts.length]
    : null;

  return (
    <>
      {allPts.map((pt, i) => (
        <Marker key={i} position={pt} icon={markerIcon('#10b981')} interactive={false} />
      ))}
      {displayPts.length >= 2 && (
        <Polyline
          positions={isClosed && !hoverPos ? [...allPts, allPts[0]] : displayPts}
          pathOptions={{
            color: '#10b981',
            weight: 2,
            dashArray: (active && !isClosed) ? '6,4' : undefined,
            opacity: 0.8,
          }}
        />
      )}
      {isClosed && (
        <Polygon
          positions={allPts}
          pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.1, weight: 0 }}
        />
      )}
      {centroid && isClosed && (
        <Marker
          position={centroid}
          icon={L.divIcon({
            className: '',
            html: `<div style="background:rgba(0,0,0,.75);color:#34d399;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:700;font-family:monospace;pointer-events:none;white-space:nowrap">P: ${fmtPerimeter} · A: ${fmtArea}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, -4],
          })}
          interactive={false}
        />
      )}
    </>
  );
};

// Export measurement helpers for the panel
export function getDistanceText(m: DistanceMeasurement): string | undefined {
  if (!m.pointA || !m.pointB) return undefined;
  const d = haversineDistance({ lat: m.pointA[0], lng: m.pointA[1] }, { lat: m.pointB[0], lng: m.pointB[1] });
  const az = bearing({ lat: m.pointA[0], lng: m.pointA[1] }, { lat: m.pointB[0], lng: m.pointB[1] });
  return `${d >= 1000 ? `${(d / 1000).toFixed(2)} km` : `${Math.round(d)} m`} · Az ${Math.round(az)}°`;
}

export function getPolygonInfo(d: PolygonZoneData): { perimeter: string; area: string } | undefined {
  if (d.points.length < 3) return undefined;
  const area = computePolygonArea(d.points);
  const perimeter = computePerimeter(d.points);
  return {
    perimeter: perimeter >= 1000 ? `${(perimeter / 1000).toFixed(2)} km` : `${Math.round(perimeter)} m`,
    area: area >= 1e6 ? `${(area / 1e6).toFixed(2)} km²` : `${Math.round(area)} m²`,
  };
}
