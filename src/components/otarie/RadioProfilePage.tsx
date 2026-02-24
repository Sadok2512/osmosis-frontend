import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useTerrainProfile } from '@/hooks/useTerrainProfile';
import { haversineDistance, LatLng } from '@/utils/geodesicUtils';
import ProfileChart from './radio-profile/ProfileChart';
import InfoPanel from './radio-profile/InfoPanel';
import { supabase } from '@/integrations/supabase/client';
import {
  Radio, Crosshair, Loader2, AlertTriangle, Maximize2, Minimize2,
  MousePointerClick, RotateCcw, Layers, Settings2
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface TopoSite {
  id: number;
  nom_site: string;
  nom_cellule: string;
  code_nidt: string;
  latitude: number | null;
  longitude: number | null;
  azimut: number | null;
  hba: number | null;
  techno: string | null;
  bande: string | null;
  constructeur: string | null;
}

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

// Map click handler component
const MapClickHandler: React.FC<{ onMapClick: (latlng: LatLng) => void; drawing: boolean }> = ({ onMapClick, drawing }) => {
  useMapEvents({
    click(e) {
      if (drawing) {
        onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    },
  });
  return null;
};

// Custom site icon
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

const RadioProfilePage: React.FC = () => {
  const [sites, setSites] = useState<SelectedSite[]>([]);
  const [selectedSite, setSelectedSite] = useState<SelectedSite | null>(null);
  const [targetPoint, setTargetPoint] = useState<LatLng | null>(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const [enableCurvature, setEnableCurvature] = useState(true);
  const [tiltOverride, setTiltOverride] = useState<number>(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [basemap, setBasemap] = useState<'light' | 'dark' | 'satellite'>('light');

  const { loading, error, profilePoints, analysis, computeProfile } = useTerrainProfile();

  // Load sites from topo
  useEffect(() => {
    const loadSites = async () => {
      const { data, error } = await supabase
        .from('topo')
        .select('id, nom_site, nom_cellule, code_nidt, latitude, longitude, azimut, hba, techno, bande, constructeur')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (error || !data) return;

      // Group by site (unique lat/lng)
      const siteMap = new Map<string, SelectedSite>();
      data.forEach((row: TopoSite) => {
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
            tilt: 0,
            techno: row.techno ?? 'LTE',
            bande: row.bande ?? '1800',
            vendor: row.constructeur ?? 'Unknown',
          });
        }
      });
      setSites(Array.from(siteMap.values()));
    };
    loadSites();
  }, []);

  const handleSiteClick = useCallback((site: SelectedSite) => {
    setSelectedSite(site);
    setTargetPoint(null);
    setDrawingMode(false);
  }, []);

  const handleMapClick = useCallback((latlng: LatLng) => {
    if (!drawingMode || !selectedSite) return;
    setTargetPoint(latlng);
    setDrawingMode(false);
    // Auto compute
    computeProfile(
      { lat: selectedSite.lat, lng: selectedSite.lng },
      latlng,
      selectedSite.hba,
      tiltOverride,
      selectedSite.azimuth,
      enableCurvature
    );
  }, [drawingMode, selectedSite, computeProfile, tiltOverride, enableCurvature]);

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
    computeProfile(
      { lat: selectedSite.lat, lng: selectedSite.lng },
      targetPoint,
      selectedSite.hba,
      tiltOverride,
      selectedSite.azimuth,
      enableCurvature
    );
  };

  const totalDistance = selectedSite && targetPoint
    ? haversineDistance({ lat: selectedSite.lat, lng: selectedSite.lng }, targetPoint)
    : 0;

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
    return [46.8, 2.3]; // France center
  }, [sites, selectedSite]);

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
            <p className="text-xs text-muted-foreground">Analyse LOS / NLOS et profil de terrain</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Basemap switcher */}
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

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Map */}
        <div className={`relative transition-all ${fullscreen ? 'w-0 overflow-hidden' : 'flex-1'}`}>
          <MapContainer center={mapCenter} zoom={7} className="w-full h-full" zoomControl={false}>
            <TileLayer url={tileUrl} />
            <MapClickHandler onMapClick={handleMapClick} drawing={drawingMode} />

            {sites.map(site => (
              <Marker
                key={site.id}
                position={[site.lat, site.lng]}
                icon={createSiteIcon(selectedSite?.id === site.id)}
                eventHandlers={{ click: () => handleSiteClick(site) }}
              >
                <Popup>
                  <div className="text-xs space-y-1">
                    <div className="font-bold">{site.name}</div>
                    <div>{site.techno} — {site.bande} MHz</div>
                    <div>Az: {site.azimuth}° | HBA: {site.hba}m</div>
                    <div>{site.vendor}</div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {targetPoint && (
              <Marker position={[targetPoint.lat, targetPoint.lng]} icon={targetIcon} />
            )}

            {selectedSite && targetPoint && (
              <Polyline
                positions={[[selectedSite.lat, selectedSite.lng], [targetPoint.lat, targetPoint.lng]]}
                color="hsl(0,84%,60%)"
                weight={2}
                dashArray="8 4"
              />
            )}
          </MapContainer>

          {/* Drawing mode overlay */}
          {drawingMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-primary text-primary-foreground px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold animate-pulse">
              <MousePointerClick className="w-4 h-4" />
              Cliquez sur la carte pour définir le point cible
            </div>
          )}

          {/* Floating controls on map */}
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

        {/* Right: Profile panel */}
        <div className={`border-l border-border bg-card flex flex-col transition-all ${
          fullscreen ? 'w-full' : analysis ? 'w-[520px]' : 'w-[320px]'
        }`}>
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <h3 className="text-sm font-bold text-foreground">
              {analysis ? 'Résultat Analyse' : selectedSite ? selectedSite.name : 'Sélectionnez un site'}
            </h3>
            {analysis && (
              <button onClick={() => setFullscreen(!fullscreen)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Site selection prompt */}
            {!selectedSite && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
                <MousePointerClick className="w-10 h-10 opacity-30" />
                <p className="text-sm">Cliquez sur un site sur la carte pour commencer l'analyse radio</p>
              </div>
            )}

            {/* Selected site — controls */}
            {selectedSite && !analysis && (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-primary" />
                    <span className="text-sm font-bold text-foreground">{selectedSite.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>Techno: <span className="font-semibold text-foreground">{selectedSite.techno}</span></div>
                    <div>Bande: <span className="font-semibold text-foreground">{selectedSite.bande}</span></div>
                    <div>Azimuth: <span className="font-semibold text-foreground">{selectedSite.azimuth}°</span></div>
                    <div>HBA: <span className="font-semibold text-foreground">{selectedSite.hba} m</span></div>
                  </div>
                </div>

                {/* Tilt control */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">Tilt mécanique/électrique</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range" min="-10" max="20" step="0.5"
                      value={tiltOverride}
                      onChange={e => setTiltOverride(Number(e.target.value))}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-xs font-mono font-bold text-foreground w-10 text-right">{tiltOverride}°</span>
                  </div>
                </div>

                {/* Curvature toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Courbure terrestre (k=4/3)</span>
                  <Switch checked={enableCurvature} onCheckedChange={setEnableCurvature} />
                </div>

                <button onClick={handleStartDrawing}
                  className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                  <Crosshair className="w-4 h-4" />
                  Tracer le profil radio
                </button>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">Calcul du profil terrain...</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <span className="text-xs text-destructive">{error}</span>
              </div>
            )}

            {/* Results */}
            {analysis && !loading && (
              <>
                {/* Chart */}
                <div className={`rounded-xl border border-border bg-card overflow-hidden ${fullscreen ? 'h-[400px]' : 'h-[250px]'}`}>
                  <ProfileChart profilePoints={profilePoints} analysis={analysis} />
                </div>

                {/* Info */}
                <InfoPanel
                  site={{
                    name: selectedSite!.name,
                    techno: selectedSite!.techno,
                    bande: selectedSite!.bande,
                    azimuth: selectedSite!.azimuth,
                    hba: selectedSite!.hba,
                    tilt: tiltOverride,
                  }}
                  analysis={analysis}
                  totalDistance={totalDistance}
                  enableCurvature={enableCurvature}
                />

                {/* Recompute */}
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
