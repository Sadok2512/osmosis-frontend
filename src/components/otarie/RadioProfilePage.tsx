import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useTerrainProfile } from '@/hooks/useTerrainProfile';
import { useFresnel } from '@/hooks/useFresnel';
import { haversineDistance, LatLng, AntennaParams } from '@/utils/geodesicUtils';
import ProfileChart from './radio-profile/ProfileChart';
import InfoPanel from './radio-profile/InfoPanel';
import { topoApi } from '@/lib/localDb';
import {
  Radio, Crosshair, Loader2, AlertTriangle, Maximize2, Minimize2,
  MousePointerClick, RotateCcw, Settings2, Mountain, Antenna, Signal, Ruler, CircleDot
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

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

const MapClickHandler: React.FC<{ onMapClick: (latlng: LatLng) => void; drawing: boolean }> = ({ onMapClick, drawing }) => {
  useMapEvents({
    click(e) {
      if (drawing) onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
};

const createSiteIcon = (selected: boolean) => L.divIcon({
  className: '',
  html: `<div style="
    width:${selected ? 28 : 20}px;height:${selected ? 28 : 20}px;
    border-radius:50%;
    background:${selected ? 'hsl(170,70%,35%)' : 'hsl(220,50%,50%)'};
    border:3px solid ${selected ? '#fff' : 'rgba(255,255,255,0.7)'};
    box-shadow:0 2px 8px rgba(0,0,0,0.3);
    transition:all 0.2s;
  "></div>`,
  iconSize: [selected ? 28 : 20, selected ? 28 : 20],
  iconAnchor: [selected ? 14 : 10, selected ? 14 : 10],
});

const targetIcon = L.divIcon({
  className: '',
  html: `<div style="width:14px;height:14px;border-radius:50%;background:hsl(0,84%,60%);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

/** Parse bande string to frequency in GHz */
function bandeToGHz(bande: string): number {
  const mhz = parseFloat(bande);
  if (isNaN(mhz) || mhz <= 0) return 1.8;
  return mhz / 1000;
}

const EngCard: React.FC<{ icon: React.ReactNode; label: string; value: string; accent?: 'primary' | 'ok' | 'warn' }> = ({ icon, label, value, accent }) => {
  const tone =
    accent === 'warn' ? 'text-destructive' :
    accent === 'ok' ? 'text-emerald-500' :
    accent === 'primary' ? 'text-primary' : 'text-foreground';
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2 flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="text-muted-foreground/70">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-xs font-bold font-mono ${tone}`}>{value}</div>
    </div>
  );
};

const RadioProfilePage: React.FC = () => {
  const [sites, setSites] = useState<SelectedSite[]>([]);
  const [selectedSite, setSelectedSite] = useState<SelectedSite | null>(null);
  const [targetPoint, setTargetPoint] = useState<LatLng | null>(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const [enableCurvature, setEnableCurvature] = useState(true);
  const [enableFresnel, setEnableFresnel] = useState(false);
  const [clutterHeight, setClutterHeight] = useState(0);
  const [enableClutter, setEnableClutter] = useState(false);
  // RF parameters
  const [mechTilt, setMechTilt] = useState(0);
  const [elecTilt, setElecTilt] = useState(0);
  const [rxHeight, setRxHeight] = useState(1.5);
  const [hbw, setHbw] = useState(65);
  const [vbw, setVbw] = useState(7);
  const [f2b, setF2b] = useState(25);
  const [fullscreen, setFullscreen] = useState(false);
  const [enableTilt, setEnableTilt] = useState(true);
  const [basemap, setBasemap] = useState<'light' | 'dark' | 'satellite'>('light');
  const [autoScale, setAutoScale] = useState(true);
  const [chartHeight, setChartHeight] = useState(680);

  const { loading, error, profilePoints, analysis, computeProfile } = useTerrainProfile();

  const totalDistance = selectedSite && targetPoint
    ? haversineDistance({ lat: selectedSite.lat, lng: selectedSite.lng }, targetPoint)
    : 0;

  const frequencyGHz = selectedSite ? bandeToGHz(selectedSite.bande) : 1.8;
  const fresnel = useFresnel(profilePoints, analysis, totalDistance, frequencyGHz, enableFresnel);

  // Load sites
  useEffect(() => {
    const loadSites = async () => {
      try {
        const json = await topoApi.listFull(100000);
        const data = json.rows || [];

        if (!data.length) return;

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
        console.warn('[RadioProfile] Failed to load topo:', err);
      }
    };
    loadSites();
  }, []);

  const buildAntennaParams = useCallback((): AntennaParams | null => {
    if (!selectedSite) return null;
    return {
      hba: selectedSite.hba,
      siteAltitude: 0, // will be set from DEM in computeProfile
      antennaAMSL: selectedSite.hba, // will be recalculated
      mechTilt,
      elecTilt,
      totalTilt: mechTilt + elecTilt,
      azimuth: selectedSite.azimuth,
      hbw,
      vbw,
      frontToBackRatio: f2b,
      rxHeight,
    };
  }, [selectedSite, mechTilt, elecTilt, hbw, vbw, f2b, rxHeight]);

  const handleSiteClick = useCallback((site: SelectedSite) => {
    setSelectedSite(site);
    setTargetPoint(null);
    setDrawingMode(false);
    // Pre-fill electrical tilt from DB
    setElecTilt(site.tilt ?? 0);
  }, []);

  const handleMapClick = useCallback((latlng: LatLng) => {
    if (!drawingMode || !selectedSite) return;
    const antenna = buildAntennaParams();
    if (!antenna) return;
    setTargetPoint(latlng);
    setDrawingMode(false);
    computeProfile(
      { lat: selectedSite.lat, lng: selectedSite.lng },
      latlng,
      antenna,
      enableCurvature
    );
  }, [drawingMode, selectedSite, computeProfile, buildAntennaParams, enableCurvature]);

  const handleStartDrawing = () => {
    if (!selectedSite) return;
    setDrawingMode(true);
    setTargetPoint(null);
  };

  const handleReset = () => {
    setSelectedSite(null);
    setTargetPoint(null);
    setDrawingMode(false);
  };

  const handleRecompute = () => {
    if (!selectedSite || !targetPoint) return;
    const antenna = buildAntennaParams();
    if (!antenna) return;
    computeProfile(
      { lat: selectedSite.lat, lng: selectedSite.lng },
      targetPoint,
      antenna,
      enableCurvature
    );
  };

  const tileUrl = basemap === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : basemap === 'satellite'
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  const mapCenter: [number, number] = useMemo(() => {
    if (selectedSite) return [selectedSite.lat, selectedSite.lng];
    if (sites.length > 0) {
      const avgLat = sites.reduce((s, site) => s + site.lat, 0) / sites.length;
      const avgLng = sites.reduce((s, site) => s + site.lng, 0) / sites.length;
      return [avgLat, avgLng];
    }
    return [46.8, 2.3];
  }, [sites, selectedSite]);

  const totalTilt = mechTilt + elecTilt;

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Radio className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">Terrain & Radio Profile</h1>
            <p className="text-xs text-muted-foreground">Analyse RF — LOS / NLOS / Fresnel / Pattern</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
            {(['light', 'dark', 'satellite'] as const).map(bm => (
              <button key={bm} onClick={() => setBasemap(bm)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${basemap === bm ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                {bm === 'light' ? 'Clair' : bm === 'dark' ? 'Sombre' : 'Satellite'}
              </button>
            ))}
          </div>
          <button onClick={handleReset} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Réinitialiser">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map */}
        <div className={`relative transition-all ${fullscreen ? 'w-0 overflow-hidden' : 'flex-1'}`}>
          <MapContainer center={mapCenter} zoom={7} className="w-full h-full" zoomControl={false}>
            <TileLayer url={tileUrl} />
            <MapClickHandler onMapClick={handleMapClick} drawing={drawingMode} />
            {sites.map(site => (
              <Marker key={site.id} position={[site.lat, site.lng]}
                icon={createSiteIcon(selectedSite?.id === site.id)}
                eventHandlers={{ click: () => handleSiteClick(site) }}>
                <Popup>
                  <div className="text-xs space-y-1">
                    <div className="font-bold">{site.name}</div>
                    <div>{site.techno} — {site.bande} MHz</div>
                    <div>Az: {site.azimuth}° | HBA: {site.hba}m</div>
                  </div>
                </Popup>
              </Marker>
            ))}
            {targetPoint && <Marker position={[targetPoint.lat, targetPoint.lng]} icon={targetIcon} />}
            {selectedSite && targetPoint && (
              <Polyline
                positions={[[selectedSite.lat, selectedSite.lng], [targetPoint.lat, targetPoint.lng]]}
                color="hsl(0,84%,60%)" weight={2} dashArray="8 4"
              />
            )}
          </MapContainer>
          {drawingMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-primary text-primary-foreground px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold animate-pulse">
              <MousePointerClick className="w-4 h-4" />
              Cliquez sur la carte pour définir le point cible
            </div>
          )}
          {selectedSite && !drawingMode && (
            <div className="absolute bottom-4 left-4 z-[1000] flex flex-col gap-2">
              <button onClick={handleStartDrawing}
                className="bg-card border border-border shadow-lg rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm font-semibold text-foreground hover:bg-muted transition-all">
                <Crosshair className="w-4 h-4 text-primary" />
                Tracer profil
              </button>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className={`border-l border-border bg-card flex flex-col transition-all ${
          fullscreen ? 'w-full' : analysis ? 'w-[540px]' : 'w-[380px]'
        }`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <h3 className="text-sm font-bold text-foreground">
              {analysis ? 'Analyse RF' : selectedSite ? selectedSite.name : 'Sélectionnez un site'}
            </h3>
            {analysis && (
              <button onClick={() => setFullscreen(!fullscreen)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!selectedSite && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
                <MousePointerClick className="w-10 h-10 opacity-30" />
                <p className="text-sm">Cliquez sur un site sur la carte pour commencer l'analyse RF</p>
              </div>
            )}

            {selectedSite && !analysis && (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-primary" />
                    <span className="text-sm font-bold text-foreground">{selectedSite.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>Techno: <span className="font-semibold text-foreground">{selectedSite.techno}</span></div>
                    <div>Bande: <span className="font-semibold text-foreground">{selectedSite.bande} MHz</span></div>
                    <div>Azimuth: <span className="font-semibold text-foreground">{selectedSite.azimuth}°</span></div>
                    <div>HBA (AGL): <span className="font-semibold text-foreground">{selectedSite.hba} m</span></div>
                  </div>
                </div>

                {/* Antenna Pattern */}
                <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
                    <Settings2 className="w-3.5 h-3.5 text-primary" /> Paramètres Antenne
                  </h4>
                  {/* Mechanical Tilt */}
                  <div className="space-y-1">
                    <Label className="text-[11px]">Tilt mécanique (°)</Label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="-5" max="15" step="0.5" value={mechTilt}
                        onChange={e => setMechTilt(Number(e.target.value))} className="flex-1 accent-primary" />
                      <span className="text-[11px] font-mono font-bold text-foreground w-10 text-right">{mechTilt}°</span>
                    </div>
                  </div>
                  {/* Electrical Tilt */}
                  <div className="space-y-1">
                    <Label className="text-[11px]">Tilt électrique (°)</Label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="0" max="15" step="0.5" value={elecTilt}
                        onChange={e => setElecTilt(Number(e.target.value))} className="flex-1 accent-primary" />
                      <span className="text-[11px] font-mono font-bold text-foreground w-10 text-right">{elecTilt}°</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/40 px-2.5 py-1.5 rounded-lg">
                    <span>Total tilt:</span>
                    <span className="font-bold text-foreground">{totalTilt}°</span>
                  </div>
                  {/* HBW */}
                  <div className="space-y-1">
                    <Label className="text-[11px]">HBW — Largeur lobe H (°)</Label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="30" max="120" step="5" value={hbw}
                        onChange={e => setHbw(Number(e.target.value))} className="flex-1 accent-primary" />
                      <span className="text-[11px] font-mono font-bold text-foreground w-10 text-right">{hbw}°</span>
                    </div>
                  </div>
                  {/* VBW */}
                  <div className="space-y-1">
                    <Label className="text-[11px]">VBW — Largeur lobe V (°)</Label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="3" max="20" step="1" value={vbw}
                        onChange={e => setVbw(Number(e.target.value))} className="flex-1 accent-primary" />
                      <span className="text-[11px] font-mono font-bold text-foreground w-10 text-right">{vbw}°</span>
                    </div>
                  </div>
                  {/* F2B */}
                  <div className="space-y-1">
                    <Label className="text-[11px]">Front-to-Back (dB)</Label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="15" max="35" step="1" value={f2b}
                        onChange={e => setF2b(Number(e.target.value))} className="flex-1 accent-primary" />
                      <span className="text-[11px] font-mono font-bold text-foreground w-10 text-right">{f2b} dB</span>
                    </div>
                  </div>
                  {/* Rx Height */}
                  <div className="space-y-1">
                    <Label className="text-[11px]">Hauteur UE / Récepteur (m)</Label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="1" max="15" step="0.5" value={rxHeight}
                        onChange={e => setRxHeight(Number(e.target.value))} className="flex-1 accent-primary" />
                      <span className="text-[11px] font-mono font-bold text-foreground w-10 text-right">{rxHeight} m</span>
                    </div>
                  </div>
                </div>

                {/* RF Toggle switches */}
                <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
                    <Settings2 className="w-3.5 h-3.5 text-primary" /> Options RF
                  </h4>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Courbure terrestre (k=4/3)</Label>
                    <Switch checked={enableCurvature} onCheckedChange={setEnableCurvature} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Zone de Fresnel F1</Label>
                    <Switch checked={enableFresnel} onCheckedChange={setEnableFresnel} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Hauteur de clutter</Label>
                    <Switch checked={enableClutter} onCheckedChange={(v) => {
                      setEnableClutter(v);
                      if (!v) setClutterHeight(0);
                      else setClutterHeight(10);
                    }} />
                  </div>
                  {enableClutter && (
                    <div className="flex items-center gap-2 pl-5">
                      <input type="range" min="0" max="30" step="1" value={clutterHeight}
                        onChange={e => setClutterHeight(Number(e.target.value))} className="flex-1 accent-primary" />
                      <span className="text-xs font-mono font-bold text-foreground w-10 text-right">{clutterHeight} m</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Tilt beam (downtilt)</Label>
                    <Switch checked={enableTilt} onCheckedChange={setEnableTilt} />
                  </div>
                </div>

                <button onClick={handleStartDrawing}
                  className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                  <Crosshair className="w-4 h-4" />
                  Tracer le profil radio
                </button>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">Calcul du profil terrain...</p>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <span className="text-xs text-destructive">{error}</span>
              </div>
            )}

            {analysis && !loading && (
              <>
                {/* RF options in results view */}
                <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Options d'affichage</h4>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    <div className="flex items-center gap-2">
                      <Switch checked={enableCurvature} onCheckedChange={(v) => { setEnableCurvature(v); }} />
                      <Label className="text-[11px]">Courbure k=4/3</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={enableFresnel} onCheckedChange={setEnableFresnel} />
                      <Label className="text-[11px]">Fresnel F1</Label>
                    </div>
                     <div className="flex items-center gap-2">
                      <Switch checked={enableClutter} onCheckedChange={(v) => {
                        setEnableClutter(v);
                        if (!v) setClutterHeight(0);
                        else setClutterHeight(10);
                      }} />
                      <Label className="text-[11px]">Clutter</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={enableTilt} onCheckedChange={setEnableTilt} />
                      <Label className="text-[11px]">Tilt beam</Label>
                    </div>
                    {enableClutter && (
                      <div className="flex items-center gap-1">
                        <input type="range" min="0" max="30" step="1" value={clutterHeight}
                          onChange={e => setClutterHeight(Number(e.target.value))} className="w-16 accent-primary" />
                        <span className="text-[10px] font-mono text-foreground">{clutterHeight}m</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Resizable Chart frame */}
                <div
                  className="relative rounded-xl border border-border bg-card overflow-hidden group"
                  style={{ height: fullscreen ? 900 : chartHeight, minHeight: 380, maxHeight: 1200 }}
                  onDoubleClick={() => setChartHeight(680)}
                  title="Double-cliquez pour réinitialiser la taille · Glissez le bord inférieur pour redimensionner"
                >
                  <ProfileChart
                    profilePoints={profilePoints}
                    analysis={analysis}
                    fresnel={fresnel}
                    showFresnel={enableFresnel}
                    showCurvature={enableCurvature}
                    clutterHeight={enableClutter ? clutterHeight : 0}
                    showTilt={enableTilt}
                    autoScale={autoScale}
                  />
                  {/* Resize handle */}
                  <div
                    className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize bg-gradient-to-t from-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const startY = e.clientY;
                      const startH = chartHeight;
                      const onMove = (ev: MouseEvent) => {
                        const next = Math.min(1200, Math.max(380, startH + (ev.clientY - startY)));
                        setChartHeight(next);
                      };
                      const onUp = () => {
                        window.removeEventListener('mousemove', onMove);
                        window.removeEventListener('mouseup', onUp);
                      };
                      window.addEventListener('mousemove', onMove);
                      window.addEventListener('mouseup', onUp);
                    }}
                  >
                    <div className="w-10 h-1 rounded-full bg-primary/60" />
                  </div>
                </div>

                {/* Bottom engineering summary row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <EngCard icon={<Ruler className="w-3.5 h-3.5" />} label="Distance" value={`${(totalDistance/1000).toFixed(2)} km`} accent="primary" />
                  <EngCard icon={<Mountain className="w-3.5 h-3.5" />} label="Terrain max" value={`${analysis.maxTerrainAlt} m`} />
                  <EngCard
                    icon={<CircleDot className="w-3.5 h-3.5" />}
                    label="Fresnel"
                    value={fresnel ? (fresnel.isClearFresnel ? 'Clear' : `${fresnel.maxIntrusionPercent}%`) : '—'}
                    accent={fresnel && !fresnel.isClearFresnel ? 'warn' : undefined}
                  />
                  <EngCard
                    icon={<Signal className="w-3.5 h-3.5" />}
                    label="LOS"
                    value={analysis.isLOS ? 'OK' : 'NLOS'}
                    accent={analysis.isLOS ? 'ok' : 'warn'}
                  />
                  <EngCard icon={<Antenna className="w-3.5 h-3.5" />} label="Site A AMSL" value={`${analysis.antennaParams.antennaAMSL.toFixed(0)} m`} />
                  <EngCard icon={<Antenna className="w-3.5 h-3.5" />} label="HBA" value={`${analysis.antennaParams.hba} m`} />
                  <EngCard icon={<Signal className="w-3.5 h-3.5" />} label="Pattern Loss" value={`${analysis.patternLossTotal} dB`} accent={analysis.patternLossTotal > 10 ? 'warn' : undefined} />
                  <EngCard icon={<Mountain className="w-3.5 h-3.5" />} label="Clearance min" value={`${analysis.clearanceMin.toFixed(1)} m`} accent={analysis.clearanceMin < 0 ? 'warn' : undefined} />
                </div>

                {/* Info */}
                <InfoPanel
                  analysis={analysis}
                  totalDistance={totalDistance}
                  enableCurvature={enableCurvature}
                  fresnel={fresnel}
                />

                {/* Actions */}
                <div className="flex gap-2">
                  <button onClick={handleRecompute}
                    className="flex-1 bg-muted text-foreground rounded-xl py-2 text-xs font-bold flex items-center justify-center gap-2 hover:bg-accent transition-colors">
                    <Settings2 className="w-3.5 h-3.5" />
                    Recalculer
                  </button>
                  <button onClick={handleStartDrawing}
                    className="flex-1 bg-primary text-primary-foreground rounded-xl py-2 text-xs font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                    <Crosshair className="w-3.5 h-3.5" />
                    Nouveau tracé
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RadioProfilePage;
