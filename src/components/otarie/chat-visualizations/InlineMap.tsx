import React, { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  value?: number;
  color?: string;
}

export interface MapSector {
  azimuth: number;
  tilt: number;
  band: string;
  techno?: string;
  color?: string;
}

export interface MapNeighbor {
  lat: number;
  lng: number;
  label: string;
  distance_m: number;
}

export interface MapBlock {
  title?: string;
  markers: MapMarker[];
  // Extended: site design check mode
  site?: {
    lat: number;
    lng: number;
    name: string;
  };
  sectors?: MapSector[];
  neighbors?: MapNeighbor[];
}

/** Compute a destination point given a start [lat, lng], bearing (degrees) and distance (meters) */
function destinationPoint(lat: number, lng: number, bearingDeg: number, distMeters: number): [number, number] {
  const R = 6371000;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const d = distMeters / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
  const lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI];
}

const BAND_COLORS: Record<string, string> = {
  'LTE700': '#ef4444', 'LTE800': '#f97316', 'LTE900': '#f59e0b',
  'LTE1800': '#22c55e', 'LTE2100': '#3b82f6', 'LTE2600': '#8b5cf6',
  'NR_700': '#e11d48', 'NR_1800': '#14b8a6', 'NR_2100': '#06b6d4',
  'NR_3500': '#7c3aed', 'NR_26_GHZ_000': '#ec4899',
};

const FitBounds: React.FC<{ points: [number, number][] }> = ({ points }) => {
  const map = useMap();
  React.useEffect(() => {
    if (points.length) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
    }
  }, [points, map]);
  return null;
};

const getColor = (value?: number, color?: string) => {
  if (color) return color;
  if (value == null) return 'hsl(221, 83%, 53%)';
  if (value < 50) return 'hsl(0, 80%, 50%)';
  if (value < 65) return 'hsl(25, 90%, 50%)';
  if (value < 75) return 'hsl(45, 90%, 48%)';
  return 'hsl(142, 70%, 45%)';
};

const InlineMap: React.FC<{ config: MapBlock }> = ({ config }) => {
  const { title, markers, site, sectors, neighbors } = config;
  const hasSectors = site && sectors && sectors.length > 0;

  // Compute all points for bounds
  const allPoints = useMemo(() => {
    const pts: [number, number][] = [];
    if (markers?.length) markers.forEach(m => pts.push([m.lat, m.lng]));
    if (site) pts.push([site.lat, site.lng]);
    if (neighbors?.length) neighbors.forEach(n => pts.push([n.lat, n.lng]));
    return pts;
  }, [markers, site, neighbors]);

  const center = useMemo(() => {
    if (site) return [site.lat, site.lng] as [number, number];
    if (!allPoints.length) return [46.6, 2.3] as [number, number];
    const lat = allPoints.reduce((s, p) => s + p[0], 0) / allPoints.length;
    const lng = allPoints.reduce((s, p) => s + p[1], 0) / allPoints.length;
    return [lat, lng] as [number, number];
  }, [site, allPoints]);

  if (!allPoints.length) return null;

  // Group sectors by azimuth for stacking
  const sectorsByAz = useMemo(() => {
    if (!sectors) return new Map<number, MapSector[]>();
    const map = new Map<number, MapSector[]>();
    sectors.forEach(s => {
      const az = s.azimuth;
      if (!map.has(az)) map.set(az, []);
      map.get(az)!.push(s);
    });
    return map;
  }, [sectors]);

  return (
    <div className="my-4 rounded-xl border border-border overflow-hidden shadow-sm">
      {title && (
        <div className="px-4 py-2 bg-card border-b border-border">
          <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
            <span className="w-1 h-4 bg-primary rounded-full" />
            🗺️ {title}
          </h4>
        </div>
      )}
      <div style={{ height: hasSectors ? 350 : 250 }}>
        <MapContainer center={center} zoom={hasSectors ? 14 : 6} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          <FitBounds points={allPoints} />

          {/* Standard markers */}
          {markers?.map((m, i) => (
            <CircleMarker
              key={`m-${i}`}
              center={[m.lat, m.lng]}
              radius={8}
              fillColor={getColor(m.value, m.color)}
              fillOpacity={0.85}
              weight={2}
              color="#fff"
            >
              <Popup>
                <div className="text-xs">
                  <strong>{m.label}</strong>
                  {m.value != null && <div>QoE: {m.value.toFixed(1)}%</div>}
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {/* Site center marker */}
          {site && (
            <CircleMarker
              center={[site.lat, site.lng]}
              radius={6}
              fillColor="#ef4444"
              fillOpacity={1}
              weight={3}
              color="#fff"
            >
              <Tooltip direction="top" offset={[0, -8]} permanent className="!text-[9px] !font-bold !bg-card !border-border !shadow-md !px-2 !py-1">
                {site.name}
              </Tooltip>
            </CircleMarker>
          )}

          {/* Sector beams */}
          {site && sectorsByAz && Array.from(sectorsByAz.entries()).map(([az, secs]) =>
            secs.map((sec, i) => {
              const color = sec.color || BAND_COLORS[sec.band] || '#6366f1';
              const rayLen = 300 + i * 80; // Stack bands at different lengths
              const endPoint = destinationPoint(site.lat, site.lng, az, rayLen);
              // Beam cone edges
              const leftEnd = destinationPoint(site.lat, site.lng, az - 15, rayLen * 0.85);
              const rightEnd = destinationPoint(site.lat, site.lng, az + 15, rayLen * 0.85);

              return (
                <React.Fragment key={`sec-${az}-${i}`}>
                  {/* Main beam ray */}
                  <Polyline
                    positions={[[site.lat, site.lng], endPoint]}
                    pathOptions={{ color, weight: 2.5, opacity: 0.85 }}
                  >
                    <Tooltip direction="center" className="!text-[8px] !font-bold !border-0 !shadow-none !bg-transparent" permanent>
                      <span style={{ color, textShadow: '0 0 3px #fff, 0 0 6px #fff', fontSize: '8px', fontWeight: 700 }}>
                        {sec.band} {sec.tilt}°
                      </span>
                    </Tooltip>
                  </Polyline>
                  {/* Beam cone */}
                  <Polyline
                    positions={[[site.lat, site.lng], leftEnd]}
                    pathOptions={{ color, weight: 1, opacity: 0.3, dashArray: '3 3' }}
                  />
                  <Polyline
                    positions={[[site.lat, site.lng], rightEnd]}
                    pathOptions={{ color, weight: 1, opacity: 0.3, dashArray: '3 3' }}
                  />
                </React.Fragment>
              );
            })
          )}

          {/* Neighbor sites */}
          {neighbors?.map((n, i) => (
            <React.Fragment key={`nb-${i}`}>
              <CircleMarker
                center={[n.lat, n.lng]}
                radius={5}
                fillColor="#6b7280"
                fillOpacity={0.6}
                weight={1.5}
                color="#fff"
              >
                <Tooltip direction="right" offset={[6, 0]} className="!text-[9px]">
                  <strong>{n.label}</strong><br />{Math.round(n.distance_m)}m
                </Tooltip>
              </CircleMarker>
              {/* Line from site to neighbor */}
              {site && (
                <Polyline
                  positions={[[site.lat, site.lng], [n.lat, n.lng]]}
                  pathOptions={{ color: '#9ca3af', weight: 1, opacity: 0.3, dashArray: '5 5' }}
                />
              )}
            </React.Fragment>
          ))}
        </MapContainer>
      </div>

      {/* Band legend for sector mode */}
      {hasSectors && sectors && (
        <div className="px-3 py-2 bg-card border-t border-border flex flex-wrap gap-2">
          {[...new Set(sectors.map(s => s.band))].sort().map(band => (
            <span
              key={band}
              className="inline-flex items-center gap-1 text-[9px] font-mono"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: BAND_COLORS[band] || '#6366f1' }}
              />
              {band}
            </span>
          ))}
          {neighbors && neighbors.length > 0 && (
            <span className="text-[9px] text-muted-foreground ml-auto">
              {neighbors.length} voisins · nearest: {Math.round(neighbors[0].distance_m)}m
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default InlineMap;
