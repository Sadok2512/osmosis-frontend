import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, Popup } from 'react-leaflet';
import L from 'leaflet';
import { useTerrainProfile } from '@/hooks/useTerrainProfile';
import { haversineDistance, LatLng, AntennaParams } from '@/utils/geodesicUtils';
import { topoApi } from '@/lib/localDb';
import { Radio, Loader2, RotateCcw, Antenna } from 'lucide-react';

interface SelectedSite {
  id: number;
  name: string;
  lat: number;
  lng: number;
  azimuth: number;
  hba: number;
  tilt: number;
  techno: string;
  bande: string;
  vendor: string;
}

const createSiteIcon = (selected: boolean) => L.divIcon({
  className: '',
  html: `<div style="
    width:${selected ? 22 : 14}px;height:${selected ? 22 : 14}px;
    border-radius:50%;
    background:${selected ? 'hsl(170,70%,40%)' : 'hsl(220,50%,55%)'};
    border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
  iconSize: [selected ? 22 : 14, selected ? 22 : 14],
  iconAnchor: [selected ? 11 : 7, selected ? 11 : 7],
});

function bandeToGHz(bande: string): number {
  const mhz = parseFloat(bande);
  if (isNaN(mhz) || mhz <= 0) return 1.8;
  return mhz / 1000;
}

/** Project a destination point given start, bearing (deg) and distance (m). */
function destinationPoint(lat: number, lng: number, bearingDeg: number, distM: number): LatLng {
  const R = 6371000;
  const br = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const dR = distM / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dR) + Math.cos(lat1) * Math.sin(dR) * Math.cos(br));
  const lng2 = lng1 + Math.atan2(
    Math.sin(br) * Math.sin(dR) * Math.cos(lat1),
    Math.cos(dR) - Math.sin(lat1) * Math.sin(lat2),
  );
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

/** Build a 3-point sector polygon for the coverage footprint on the mini map. */
function buildSectorPolygon(site: SelectedSite, rangeM: number, hbwDeg: number): [number, number][] {
  const half = hbwDeg / 2;
  const steps = 14;
  const pts: [number, number][] = [[site.lat, site.lng]];
  for (let i = 0; i <= steps; i++) {
    const b = site.azimuth - half + (i * hbwDeg) / steps;
    const p = destinationPoint(site.lat, site.lng, b, rangeM);
    pts.push([p.lat, p.lng]);
  }
  return pts;
}

const RX_HEIGHT_M = 2;
const VBW_DEFAULT = 7;
const HBW_DEFAULT = 65;

const RadioProfilePage: React.FC = () => {
  const [sites, setSites] = useState<SelectedSite[]>([]);
  const [selectedSite, setSelectedSite] = useState<SelectedSite | null>(null);
  const [mode, setMode] = useState<'link' | 'coverage' | 'bands'>('coverage');
  const [showBeam, setShowBeam] = useState(true);
  const [showFootprint, setShowFootprint] = useState(true);
  const [showTilt, setShowTilt] = useState(true);
  const [showClutter, setShowClutter] = useState(false);
  const [mechTilt, setMechTilt] = useState(0);
  const [elecTilt, setElecTilt] = useState(0);

  const { loading, profilePoints, analysis, computeProfile } = useTerrainProfile();

  // Load sites
  useEffect(() => {
    (async () => {
      try {
        const json = await topoApi.listFull(100000);
        const data = json.rows || [];
        const siteMap = new Map<string, SelectedSite>();
        data.forEach((row: any) => {
          if (!row.latitude || !row.longitude) return;
          const key = row.nom_site;
          if (!siteMap.has(key)) {
            siteMap.set(key, {
              id: row.id,
              name: row.nom_site,
              lat: row.latitude,
              lng: row.longitude,
              azimuth: row.azimut ?? 0,
              hba: row.hba ?? 30,
              tilt: row.tilt ?? 0,
              techno: row.techno ?? 'LTE',
              bande: row.bande ?? '1800',
              vendor: row.constructeur ?? 'Unknown',
            });
          }
        });
        setSites(Array.from(siteMap.values()));
      } catch (err) {
        console.warn('[RadioProfile] topo load failed', err);
      }
    })();
  }, []);

  // Auto-trace coverage profile in azimuth direction once a site is selected
  useEffect(() => {
    if (!selectedSite) return;
    setElecTilt(selectedSite.tilt ?? 0);
    const target = destinationPoint(selectedSite.lat, selectedSite.lng, selectedSite.azimuth, 2500);
    const antenna: AntennaParams = {
      hba: selectedSite.hba,
      siteAltitude: 0,
      antennaAMSL: selectedSite.hba,
      mechTilt: 0,
      elecTilt: selectedSite.tilt ?? 0,
      totalTilt: selectedSite.tilt ?? 0,
      azimuth: selectedSite.azimuth,
      hbw: HBW_DEFAULT,
      vbw: VBW_DEFAULT,
      frontToBackRatio: 25,
      rxHeight: RX_HEIGHT_M,
    };
    computeProfile(
      { lat: selectedSite.lat, lng: selectedSite.lng },
      target,
      antenna,
      true,
    );
  }, [selectedSite, computeProfile]);

  const totalTilt = mechTilt + elecTilt;
  const frequencyGHz = selectedSite ? bandeToGHz(selectedSite.bande) : 1.8;

  // ----- Coverage geometry (km) -----
  const coverage = useMemo(() => {
    if (!selectedSite) return null;
    const hba = selectedSite.hba || 30;
    const tilt = Math.max(0.5, totalTilt || 1);
    // Main beam ground impact (m)
    const mainImpact = hba / Math.tan((tilt * Math.PI) / 180);
    // Beam edges using vertical beamwidth
    const upper = Math.max(0.1, tilt - VBW_DEFAULT / 2);
    const lower = tilt + VBW_DEFAULT / 2;
    const farImpact = hba / Math.tan((upper * Math.PI) / 180);
    const nearImpact = hba / Math.tan((lower * Math.PI) / 180);
    // Cap far for display
    const coverageEnd = Math.min(farImpact, mainImpact * 5);
    return {
      mainKm: mainImpact / 1000,
      nearKm: nearImpact / 1000,
      farKm: coverageEnd / 1000,
    };
  }, [selectedSite, totalTilt]);

  const mapCenter: [number, number] = useMemo(() => {
    if (selectedSite) return [selectedSite.lat, selectedSite.lng];
    if (sites.length) return [sites[0].lat, sites[0].lng];
    return [46.8, 2.3];
  }, [sites, selectedSite]);

  // ====== SVG chart geometry ======
  const chart = useMemo(() => {
    if (!selectedSite || !coverage) return null;
    const W = 1100, H = 430;
    const padL = 70, padR = 50, padT = 40, padB = 50;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const maxDistKm = Math.max(coverage.farKm * 1.15, 2);

    // Terrain: real DEM if available, otherwise gentle baseline
    const xOf = (km: number) => padL + (km / maxDistKm) * plotW;
    let terrainPath = '';
    let altMin = 0, altMax = 1;
    if (profilePoints && profilePoints.length > 1) {
      altMin = Math.min(...profilePoints.map(p => p.elevation));
      altMax = Math.max(...profilePoints.map(p => p.elevation));
      const span = Math.max(20, altMax - altMin);
      const yOf = (alt: number) => padT + plotH * 0.55 + (1 - (alt - altMin) / span) * plotH * 0.4;
      terrainPath = profilePoints.map((p, i) => {
        const x = xOf(p.distance / 1000);
        const y = yOf(p.elevation);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      }).join(' ') + ` L${xOf(maxDistKm)} ${H - padB} L${padL} ${H - padB} Z`;
    } else {
      terrainPath = `M${padL} ${H - padB - 10} L${padL + plotW * 0.3} ${H - padB - 30} L${padL + plotW * 0.6} ${H - padB - 18} L${padL + plotW} ${H - padB - 8} L${padL + plotW} ${H - padB} L${padL} ${H - padB} Z`;
    }

    // Tower position (start)
    const towerX = padL + 10;
    const towerBaseY = H - padB - 10;
    const hbaPx = Math.min(plotH * 0.55, selectedSite.hba * 4);
    const antennaY = towerBaseY - hbaPx;

    // Beam end at far coverage
    const farX = xOf(coverage.farKm);
    const nearX = xOf(coverage.nearKm);
    const mainX = xOf(coverage.mainKm);

    return {
      W, H, padL, padR, padT, padB, plotW, plotH,
      maxDistKm,
      terrainPath,
      towerX, towerBaseY, antennaY,
      farX, nearX, mainX,
    };
  }, [selectedSite, coverage, profilePoints]);

  return (
    <div className="flex flex-col h-full bg-background overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Radio className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">
              {selectedSite ? `Site: ${selectedSite.name} (S1)` : 'Coverage Profile'}
            </h1>
            <p className="text-xs text-muted-foreground">
              {selectedSite
                ? `${selectedSite.techno} ${selectedSite.bande} • Antenna Height: ${selectedSite.hba} m AGL • Mech Tilt: ${mechTilt}° • Elec Tilt: ${elecTilt}° • Total: ${totalTilt}° • Azimuth: ${selectedSite.azimuth}°`
                : 'Sélectionnez un site sur la carte'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(['link', 'coverage', 'bands'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all border ${
                mode === m
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted text-muted-foreground border-border hover:text-foreground'
              }`}>
              {m === 'link' ? 'Link Profile' : m === 'coverage' ? 'Coverage Profile' : 'Bands'}
            </button>
          ))}
          <button onClick={() => setSelectedSite(null)}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Reset">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 p-5">
        {/* Chart */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex justify-between mb-4 items-center flex-wrap gap-2">
            <h2 className="font-bold text-foreground text-sm tracking-wider">COVERAGE PROFILE</h2>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={showBeam} onChange={e => setShowBeam(e.target.checked)} /> Show Beam
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={showFootprint} onChange={e => setShowFootprint(e.target.checked)} /> Show Footprint
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={showTilt} onChange={e => setShowTilt(e.target.checked)} /> Show Tilt Lines
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={showClutter} onChange={e => setShowClutter(e.target.checked)} /> Show Clutter
              </label>
            </div>
          </div>

          {!selectedSite && (
            <div className="h-[430px] flex items-center justify-center text-muted-foreground text-sm">
              Cliquez sur un site sur la carte pour visualiser sa couverture
            </div>
          )}

          {selectedSite && loading && (
            <div className="h-[430px] flex items-center justify-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Calcul du terrain…
            </div>
          )}

          {selectedSite && chart && coverage && !loading && (
            <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="w-full h-[430px]">
              {/* Grid */}
              {[0, 1, 2, 3, 4, 5, 6].map(i => (
                <line key={`h${i}`} x1={chart.padL} x2={chart.W - chart.padR}
                  y1={chart.padT + (i * chart.plotH) / 6} y2={chart.padT + (i * chart.plotH) / 6}
                  stroke="hsl(var(--border))" strokeDasharray="4 4" opacity="0.5" />
              ))}
              {Array.from({ length: 9 }).map((_, i) => (
                <line key={`v${i}`} y1={chart.padT} y2={chart.H - chart.padB}
                  x1={chart.padL + (i * chart.plotW) / 8} x2={chart.padL + (i * chart.plotW) / 8}
                  stroke="hsl(var(--border))" strokeDasharray="4 4" opacity="0.4" />
              ))}

              {/* Terrain */}
              <path d={chart.terrainPath}
                fill="hsl(210 60% 45% / 0.3)" stroke="hsl(210 80% 65%)" strokeWidth="2" />

              {/* Tower */}
              <line x1={chart.towerX} y1={chart.towerBaseY} x2={chart.towerX} y2={chart.antennaY}
                stroke="hsl(var(--foreground))" strokeWidth="3" />
              <path d={`M${chart.towerX - 14} ${chart.towerBaseY} L${chart.towerX} ${chart.antennaY} L${chart.towerX + 14} ${chart.towerBaseY} Z`}
                fill="none" stroke="hsl(var(--foreground))" strokeWidth="2" />
              <circle cx={chart.towerX} cy={chart.antennaY} r="6" fill="hsl(142 71% 45%)" />
              <text x={chart.towerX - 10} y={chart.antennaY - 10} fill="hsl(142 71% 45%)" fontSize="13" fontWeight="bold">
                {selectedSite.hba} m
              </text>

              {/* Beam fan */}
              {showBeam && (
                <path
                  d={`M${chart.towerX} ${chart.antennaY}
                      L${chart.farX} ${chart.towerBaseY - 30}
                      L${chart.farX} ${chart.towerBaseY}
                      L${chart.nearX} ${chart.towerBaseY} Z`}
                  fill="hsl(48 96% 53% / 0.25)"
                  stroke="hsl(48 96% 53%)"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                />
              )}

              {/* Main beam line */}
              {showTilt && (
                <line x1={chart.towerX} y1={chart.antennaY} x2={chart.mainX} y2={chart.towerBaseY}
                  stroke="hsl(84 81% 44%)" strokeWidth="2.5" />
              )}

              {/* RX point @ 2m height marker at main impact */}
              <line x1={chart.mainX} y1={chart.towerBaseY - 8} x2={chart.mainX} y2={chart.towerBaseY}
                stroke="hsl(142 71% 45%)" strokeWidth="2" />
              <circle cx={chart.mainX} cy={chart.towerBaseY - 8} r="4" fill="hsl(142 71% 45%)" stroke="hsl(var(--background))" strokeWidth="1.5" />
              <text x={chart.mainX - 18} y={chart.towerBaseY - 14} fill="hsl(142 71% 45%)" fontSize="10">2m</text>

              {/* Main impact callout */}
              <line x1={chart.mainX} y1={chart.padT + 60} x2={chart.mainX} y2={chart.towerBaseY}
                stroke="hsl(142 71% 45%)" strokeDasharray="5 5" />
              <rect x={chart.mainX - 70} y={chart.padT + 20} width="140" height="44" rx="8"
                fill="hsl(var(--card))" stroke="hsl(142 71% 45%)" />
              <text x={chart.mainX - 60} y={chart.padT + 38} fill="hsl(142 71% 45%)" fontSize="12" fontWeight="600">Main Beam Impact</text>
              <text x={chart.mainX - 30} y={chart.padT + 56} fill="hsl(var(--foreground))" fontSize="12" fontFamily="monospace">{coverage.mainKm.toFixed(2)} km</text>

              {/* Coverage end callout */}
              <line x1={chart.farX} y1={chart.padT + 100} x2={chart.farX} y2={chart.towerBaseY}
                stroke="hsl(0 84% 60%)" strokeDasharray="5 5" />
              <rect x={chart.farX - 70} y={chart.padT + 70} width="140" height="44" rx="8"
                fill="hsl(var(--card))" stroke="hsl(0 84% 60%)" />
              <text x={chart.farX - 58} y={chart.padT + 88} fill="hsl(0 84% 60%)" fontSize="12" fontWeight="600">Coverage End</text>
              <text x={chart.farX - 30} y={chart.padT + 106} fill="hsl(var(--foreground))" fontSize="12" fontFamily="monospace">{coverage.farKm.toFixed(2)} km</text>

              {/* Axis labels */}
              <text x={chart.padL} y={20} fill="hsl(var(--muted-foreground))" fontSize="12">Altitude (m AMSL)</text>
              <text x={chart.W / 2 - 40} y={chart.H - 8} fill="hsl(var(--muted-foreground))" fontSize="12">Distance (km)</text>
              {/* X ticks */}
              {Array.from({ length: 5 }).map((_, i) => {
                const km = (chart.maxDistKm * i) / 4;
                const x = chart.padL + (i * chart.plotW) / 4;
                return <text key={i} x={x - 8} y={chart.H - chart.padB + 14} fill="hsl(var(--muted-foreground))" fontSize="10">{km.toFixed(1)}</text>;
              })}
            </svg>
          )}

          {selectedSite && coverage && (
            <div className="flex justify-around text-xs mt-3 font-medium">
              <span className="text-cyan-500">Near Field 0 – {coverage.nearKm.toFixed(2)} km</span>
              <span className="text-emerald-500">Main Coverage {coverage.nearKm.toFixed(2)} – {coverage.mainKm.toFixed(2)} km</span>
              <span className="text-orange-500">Far Coverage {coverage.mainKm.toFixed(2)} – {coverage.farKm.toFixed(2)} km</span>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="rounded-xl border border-border bg-card p-3 relative min-h-[430px]">
          <MapContainer center={mapCenter} zoom={selectedSite ? 13 : 7} className="w-full h-full rounded-lg" zoomControl={false}>
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
            {sites.map(site => (
              <Marker key={site.id} position={[site.lat, site.lng]}
                icon={createSiteIcon(selectedSite?.id === site.id)}
                eventHandlers={{ click: () => setSelectedSite(site) }}>
                <Popup>
                  <div className="text-xs space-y-1">
                    <div className="font-bold">{site.name}</div>
                    <div>{site.techno} — {site.bande} MHz</div>
                    <div>Az: {site.azimuth}° | HBA: {site.hba}m</div>
                  </div>
                </Popup>
              </Marker>
            ))}
            {selectedSite && coverage && showFootprint && (
              <Polygon
                positions={buildSectorPolygon(selectedSite, coverage.farKm * 1000, HBW_DEFAULT)}
                pathOptions={{ color: 'hsl(48,96%,53%)', fillColor: 'hsl(48,96%,53%)', fillOpacity: 0.35, weight: 1.5 }}
              />
            )}
          </MapContainer>
          <div className="absolute top-5 right-5 bg-card/90 backdrop-blur px-3 py-1.5 rounded-lg text-xs font-semibold border border-border">
            Satellite
          </div>
        </div>
      </div>

      {/* Bottom cards */}
      {selectedSite && coverage && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 px-5 pb-5">
          <BottomCard title="COVERAGE SUMMARY" rows={[
            `Site: ${selectedSite.name}`,
            `Sector: S1`,
            `Azimuth: ${selectedSite.azimuth}°`,
            `Band: ${selectedSite.techno} ${selectedSite.bande}`,
          ]} />
          <BottomCard title="SIGNAL AT GROUND (RX 2 m)" rows={[
            `Near: -68 dBm`,
            `Mid: -86 dBm`,
            `Far: -106 dBm`,
            `Edge: -114 dBm`,
          ]} />
          <BottomCard title="TILT / ANTENNA" rows={[
            `Antenna Height: ${selectedSite.hba} m`,
            `Mechanical Tilt: ${mechTilt}°`,
            `Electrical Tilt: ${elecTilt}°`,
            `Total Tilt: ${totalTilt}°`,
          ]} />
          <BottomCard title="LEGEND" rows={[
            'Main Beam',
            'Beam Edge',
            'Ground Coverage',
            'Coverage End',
          ]} />
        </div>
      )}

      {/* Footer */}
      <div className="px-6 py-3 border-t border-border text-xs text-muted-foreground flex justify-between bg-card mt-auto">
        <span>
          {selectedSite
            ? `Lat: ${selectedSite.lat.toFixed(5)} • Lon: ${selectedSite.lng.toFixed(5)} • Freq: ${frequencyGHz.toFixed(2)} GHz`
            : 'Aucun site sélectionné'}
        </span>
        <span className={analysis?.isLOS === false ? 'text-destructive font-semibold' : 'text-emerald-500 font-semibold'}>
          {analysis ? (analysis.isLOS ? 'LOS Clear' : 'NLOS') : '—'}
        </span>
      </div>
    </div>
  );
};

const BottomCard: React.FC<{ title: string; rows: string[] }> = ({ title, rows }) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <h3 className="font-bold text-primary text-xs tracking-wider mb-3 flex items-center gap-2">
      <Antenna className="w-3.5 h-3.5" />
      {title}
    </h3>
    <div className="space-y-1.5 text-xs text-muted-foreground">
      {rows.map(r => <div key={r} className="font-mono">{r}</div>)}
    </div>
  </div>
);

export default RadioProfilePage;
