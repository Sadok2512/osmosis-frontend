import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ParameterRow } from './parameterHubApi';
import { MapPin } from 'lucide-react';

interface MapViewProps {
  rows: ParameterRow[];
  parameterFocus?: string;
}

const stringToColor = (val: string | null): string => {
  if (!val) return 'hsl(0, 0%, 60%)';
  let hash = 0;
  for (let i = 0; i < val.length; i++) hash = val.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 50%)`;
};

const numericColor = (n: number, min: number, max: number): string => {
  if (max === min) return 'hsl(200, 70%, 50%)';
  const t = (n - min) / (max - min);
  const hue = 220 - t * 220; // blue → red
  return `hsl(${hue}, 80%, 50%)`;
};

const FitBounds: React.FC<{ rows: ParameterRow[] }> = ({ rows }) => {
  const map = useMap();
  useEffect(() => {
    if (rows.length === 0) return;
    const lats = rows.map((r) => r.latitude!).filter((n) => Number.isFinite(n));
    const lngs = rows.map((r) => r.longitude!).filter((n) => Number.isFinite(n));
    if (!lats.length) return;
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
      { padding: [40, 40], maxZoom: 13 },
    );
  }, [rows, map]);
  return null;
};

export const MapView: React.FC<MapViewProps> = ({ rows, parameterFocus }) => {
  const focusRows = useMemo(
    () => (parameterFocus ? rows.filter((r) => r.parameter === parameterFocus) : rows),
    [rows, parameterFocus],
  );

  const numericStats = useMemo(() => {
    const nums = focusRows
      .map((r) => Number(r.value))
      .filter((n) => Number.isFinite(n));
    if (nums.length < focusRows.length * 0.5) return null;
    return { min: Math.min(...nums), max: Math.max(...nums), isNumeric: true as const };
  }, [focusRows]);

  const uniqueValues = useMemo(() => {
    if (numericStats) return [];
    return Array.from(new Set(focusRows.map((r) => r.value ?? '(null)'))).sort().slice(0, 20);
  }, [focusRows, numericStats]);

  if (focusRows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 flex flex-col items-center justify-center text-muted-foreground">
        <MapPin className="w-10 h-10 opacity-30 mb-3" />
        <p className="text-sm font-medium">No geo-located rows</p>
        <p className="text-xs mt-1">Apply filters that match cells with latitude/longitude.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30 text-xs">
        <span className="font-semibold text-foreground">
          {focusRows.length.toLocaleString()} points
          {parameterFocus && (
            <>
              {' · '}
              <span className="text-muted-foreground">parameter:</span> {parameterFocus}
            </>
          )}
        </span>
        <span className="text-muted-foreground">
          {numericStats
            ? `Numeric scale: ${numericStats.min.toFixed(2)} → ${numericStats.max.toFixed(2)}`
            : `${uniqueValues.length} unique values`}
        </span>
      </div>

      <div className="relative h-[60vh]">
        <MapContainer
          center={[46.6, 2.3]}
          zoom={6}
          className="w-full h-full z-0"
          style={{ background: 'hsl(var(--background))' }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
            attribution="&copy; CartoDB"
          />
          <FitBounds rows={focusRows} />
          {focusRows.map((r, i) => {
            const color = numericStats
              ? numericColor(Number(r.value) || 0, numericStats.min, numericStats.max)
              : stringToColor(r.value);
            return (
              <CircleMarker
                key={`${r.cell_name ?? r.site_name ?? i}-${i}`}
                center={[r.latitude!, r.longitude!]}
                radius={5}
                pathOptions={{
                  fillColor: color,
                  fillOpacity: 0.85,
                  color: 'hsl(var(--border))',
                  weight: 0.5,
                }}
              >
                <Popup>
                  <div className="text-xs space-y-1 min-w-[180px]">
                    <div className="font-bold text-sm">
                      {r.cell_name || r.site_name || 'Point'}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Parameter</span>
                      <span className="font-semibold">{r.parameter}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Value</span>
                      <span className="font-semibold" style={{ color }}>
                        {r.value ?? '—'}
                      </span>
                    </div>
                    {r.vendor && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Vendor</span>
                        <span>{r.vendor}</span>
                      </div>
                    )}
                    {r.bande && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Band</span>
                        <span>{r.bande}</span>
                      </div>
                    )}
                    {r.plaque && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Plaque</span>
                        <span>{r.plaque}</span>
                      </div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>

        {!numericStats && uniqueValues.length > 0 && uniqueValues.length <= 20 && (
          <div className="absolute bottom-4 left-4 z-[1000] bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3 max-h-[240px] overflow-y-auto">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Values ({uniqueValues.length})
            </div>
            <div className="space-y-1">
              {uniqueValues.map((v) => (
                <div key={v} className="flex items-center gap-2 text-xs">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: stringToColor(v === '(null)' ? null : v) }}
                  />
                  <span className="truncate max-w-[140px]">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {numericStats && (
          <div className="absolute bottom-4 left-4 z-[1000] bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Numeric scale
            </div>
            <div
              className="h-2 w-40 rounded"
              style={{
                background:
                  'linear-gradient(to right, hsl(220,80%,50%), hsl(110,80%,50%), hsl(0,80%,50%))',
              }}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>{numericStats.min.toFixed(2)}</span>
              <span>{numericStats.max.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MapView;
