import React, { useMemo } from 'react';
import { Polyline, Polygon, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { SiteSummary } from '../../types';

interface TiltOverlayProps {
  site: SiteSummary;
  visible: boolean;
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

/** Compute tilt ray length from HBA and tilt angle */
function tiltRayLength(hba: number | undefined, tiltDeg: number): number {
  if (!tiltDeg || tiltDeg <= 0) return 1000;
  if (hba && hba > 0) {
    const tanTilt = Math.tan((tiltDeg * Math.PI) / 180);
    if (tanTilt > 0) {
      const D = hba / tanTilt;
      return Math.max(200, Math.min(3000, D));
    }
  }
  return 1000;
}

// Tower icon SVG
const createTowerIcon = (azimuth: number) =>
  L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;transform:rotate(${azimuth}deg);">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L8 8h8L12 2z" fill="#ef4444" opacity="0.9"/>
        <rect x="11" y="8" width="2" height="12" rx="1" fill="#dc2626"/>
        <circle cx="12" cy="8" r="2.5" fill="#ef4444" stroke="#fff" stroke-width="1.5"/>
        <path d="M7 6C5.5 4.5 5 3 5 3" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
        <path d="M17 6C18.5 4.5 19 3 19 3" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
      </svg>
    </div>`,
  });

const DEFAULT_BEAMWIDTH = 7; // degrees

const TiltOverlay: React.FC<TiltOverlayProps> = ({ site, visible }) => {
  const cellOverlays = useMemo(() => {
    if (!visible) return [];

    return site.cells.map((cell) => {
      const az = cell.azimut ?? 0;
      const tilt = (cell as any).tilt ?? 0;
      const hba = cell.hba;
      const beamwidth = (cell as any).vertical_beamwidth ?? DEFAULT_BEAMWIDTH;
      const rayLen = tiltRayLength(hba, tilt);

      const [lat, lng] = site.coordinates;

      // Main ray endpoint
      const mainEnd = destinationPoint(lat, lng, az, rayLen);

      // Beam cone rays (upper/lower edge of beam)
      const halfBw = beamwidth / 2;
      const upperTilt = Math.max(0.5, tilt - halfBw);
      const lowerTilt = tilt + halfBw;
      const upperLen = tiltRayLength(hba, upperTilt);
      const lowerLen = tiltRayLength(hba, lowerTilt);
      const upperEnd = destinationPoint(lat, lng, az, upperLen);
      const lowerEnd = destinationPoint(lat, lng, az, lowerLen);

      const is5G = (cell.techno || '').toUpperCase().includes('5G');
      const color = is5G ? '#8b5cf6' : '#f97316';

      return {
        cellId: cell.cell_id,
        az,
        tilt,
        hba,
        beamwidth,
        rayLen,
        mainEnd,
        upperEnd,
        lowerEnd,
        color,
        is5G,
        bande: cell.bande,
        techno: cell.techno,
      };
    });
  }, [site, visible]);

  if (!visible || cellOverlays.length === 0) return null;

  const [siteLat, siteLng] = site.coordinates;
  // Use the first cell's azimuth for the tower icon orientation
  const primaryAz = cellOverlays[0]?.az ?? 0;

  return (
    <>
      {/* Tower marker at site center */}
      <Marker position={site.coordinates} icon={createTowerIcon(0)} interactive={true}>
        <Tooltip direction="top" offset={[0, -16]} className="tilt-tower-tooltip">
          <div className="px-2 py-1.5 text-[10px]">
            <div className="font-black text-[11px]">{site.site_name}</div>
            <div className="opacity-60 font-mono">{site.site_id}</div>
            <div className="mt-1 opacity-50">{site.cell_count} cells</div>
          </div>
        </Tooltip>
      </Marker>

      {/* Tilt rays per cell */}
      {cellOverlays.map((ov) => (
        <React.Fragment key={ov.cellId}>
          {/* Beam cone fill (shaded sector between upper and lower ray) */}
          <Polygon
            positions={[site.coordinates, ov.upperEnd, ov.lowerEnd]}
            pathOptions={{
              fillColor: ov.color,
              fillOpacity: 0.12,
              color: ov.color,
              weight: 0,
              opacity: 0,
            }}
          />

          {/* Upper beam edge */}
          <Polyline
            positions={[site.coordinates, ov.upperEnd]}
            pathOptions={{
              color: ov.color,
              weight: 1,
              opacity: 0.35,
              dashArray: '4 4',
            }}
          />

          {/* Lower beam edge */}
          <Polyline
            positions={[site.coordinates, ov.lowerEnd]}
            pathOptions={{
              color: ov.color,
              weight: 1,
              opacity: 0.35,
              dashArray: '4 4',
            }}
          />

          {/* Main tilt ray */}
          <Polyline
            positions={[site.coordinates, ov.mainEnd]}
            pathOptions={{
              color: ov.color,
              weight: 2.5,
              opacity: 0.85,
            }}
          >
            <Tooltip direction="center" permanent className="tilt-label-tooltip">
              <span style={{
                fontSize: '9px',
                fontWeight: 800,
                color: ov.color,
                textShadow: '0 0 4px #fff, 0 0 8px #fff',
                letterSpacing: '0.04em',
              }}>
                Tilt: {ov.tilt}°
              </span>
            </Tooltip>
          </Polyline>

          {/* Endpoint marker with popup info */}
          <Marker
            position={ov.mainEnd}
            icon={L.divIcon({
              className: '',
              iconSize: [8, 8],
              iconAnchor: [4, 4],
              html: `<div style="width:8px;height:8px;border-radius:50%;background:${ov.color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
            })}
          >
            <Tooltip direction="right" offset={[8, 0]} className="tilt-info-tooltip">
              <div className="px-2 py-1.5 text-[10px] space-y-0.5 min-w-[140px]">
                <div className="font-black text-[11px]" style={{ color: ov.color }}>{ov.cellId}</div>
                <div className="flex justify-between"><span className="opacity-50">Azimut</span><span className="font-bold">{ov.az}°</span></div>
                <div className="flex justify-between"><span className="opacity-50">Tilt</span><span className="font-bold">{ov.tilt}°</span></div>
                <div className="flex justify-between"><span className="opacity-50">HBA</span><span className="font-bold">{ov.hba ?? '—'} m</span></div>
                <div className="flex justify-between"><span className="opacity-50">Beamwidth</span><span className="font-bold">{ov.beamwidth}°</span></div>
                <div className="flex justify-between"><span className="opacity-50">Distance</span><span className="font-bold">{Math.round(ov.rayLen)} m</span></div>
                <div className="flex justify-between"><span className="opacity-50">Techno</span><span className="font-bold">{ov.techno} · {ov.bande}</span></div>
              </div>
            </Tooltip>
          </Marker>
        </React.Fragment>
      ))}
    </>
  );
};

export default TiltOverlay;
