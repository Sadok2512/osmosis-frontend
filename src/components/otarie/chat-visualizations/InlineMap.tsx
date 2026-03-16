import React, { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapBlock {
  title?: string;
  markers: {
    lat: number;
    lng: number;
    label: string;
    value?: number;
    color?: string;
  }[];
}

const FitBounds: React.FC<{ markers: MapBlock['markers'] }> = ({ markers }) => {
  const map = useMap();
  React.useEffect(() => {
    if (markers.length) {
      const bounds = markers.map(m => [m.lat, m.lng] as [number, number]);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
    }
  }, [markers, map]);
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
  const { title, markers } = config;

  const center = useMemo(() => {
    if (!markers?.length) return [46.6, 2.3] as [number, number];
    const lat = markers.reduce((s, m) => s + m.lat, 0) / markers.length;
    const lng = markers.reduce((s, m) => s + m.lng, 0) / markers.length;
    return [lat, lng] as [number, number];
  }, [markers]);

  if (!markers?.length) return null;
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
      <div style={{ height: 250 }}>
        <MapContainer center={center} zoom={6} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          <FitBounds markers={markers} />
          {markers.map((m, i) => (
            <CircleMarker
              key={i}
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
        </MapContainer>
      </div>
    </div>
  );
};

export default InlineMap;
