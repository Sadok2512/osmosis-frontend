/**
 * CoverageSimPanel — Simulation parameter panel for 4G/5G coverage
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  SimulationParams, CoverageGrid, simulateCoverage,
  getDefaultParams, RSRP_LEGEND
} from '@/services/propagationEngine';
import {
  Radio, Signal, Activity, ChevronDown, ChevronUp,
  Play, X, Settings2, Zap, RotateCcw
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';

interface CoverageSimPanelProps {
  site: {
    site_name: string;
    site_id: string;
    lat: number;
    lng: number;
    cells: Array<{
      cell_id: string;
      techno: string;
      bande: string;
      azimut: number;
      hba?: number;
      tilt?: number;
    }>;
  } | null;
  onSimulate: (grid: CoverageGrid) => void;
  onClear: () => void;
  isSimulating: boolean;
  onClose: () => void;
}

const ENV_OPTIONS = [
  { value: 'urban', label: 'Urbain', icon: '🏙️' },
  { value: 'suburban', label: 'Suburbain', icon: '🏘️' },
  { value: 'rural', label: 'Rural', icon: '🌾' },
] as const;

const CoverageSimPanel: React.FC<CoverageSimPanelProps> = ({
  site, onSimulate, onClear, isSimulating, onClose
}) => {
  const [selectedCellIdx, setSelectedCellIdx] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showLegend, setShowLegend] = useState(true);

  const cell = site?.cells?.[selectedCellIdx];
  const techno = (cell?.techno?.includes('5G') ? '5G' : '4G') as '4G' | '5G';
  const defaults = useMemo(() => getDefaultParams(techno, cell?.bande), [techno, cell?.bande]);

  const [params, setParams] = useState<Partial<SimulationParams>>({});

  // Merged params with defaults
  const mergedParams = useMemo(() => ({
    lat: site?.lat ?? 0,
    lng: site?.lng ?? 0,
    frequency: params.frequency ?? defaults.frequency ?? 1800,
    txPower: params.txPower ?? defaults.txPower ?? 43,
    antennaHeight: params.antennaHeight ?? cell?.hba ?? defaults.antennaHeight ?? 25,
    antennaGain: params.antennaGain ?? defaults.antennaGain ?? 18,
    azimuth: params.azimuth ?? cell?.azimut ?? defaults.azimuth ?? 0,
    beamwidth: params.beamwidth ?? defaults.beamwidth ?? 65,
    tilt: params.tilt ?? cell?.tilt ?? defaults.tilt ?? 4,
    rxHeight: params.rxHeight ?? defaults.rxHeight ?? 1.5,
    radius: params.radius ?? defaults.radius ?? 5,
    gridSize: params.gridSize ?? defaults.gridSize ?? 80,
    environment: params.environment ?? defaults.environment ?? 'urban',
    techno,
  }), [params, defaults, site, cell, techno]);

  const handleSimulate = useCallback(() => {
    if (!site) return;
    const result = simulateCoverage(mergedParams as SimulationParams);
    onSimulate(result);
  }, [mergedParams, site, onSimulate]);

  const updateParam = (key: keyof SimulationParams, value: any) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const resetParams = () => setParams({});

  if (!site) return null;

  return (
    <div className="absolute top-4 left-4 z-[1100] w-[340px] max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Radio className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[12px] font-extrabold text-foreground uppercase tracking-wider">Simulation Couverture</h3>
          <p className="text-[10px] text-muted-foreground truncate">{site.site_name}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Cell selector */}
      {site.cells.length > 1 && (
        <div className="px-4 py-2 border-b border-border">
          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Cellule</label>
          <div className="flex flex-wrap gap-1">
            {site.cells.map((c, idx) => (
              <button
                key={c.cell_id}
                onClick={() => { setSelectedCellIdx(idx); setParams({}); }}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  idx === selectedCellIdx
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {c.techno} {c.bande} {c.azimut}°
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main parameters */}
      <div className="px-4 py-3 space-y-3">
        {/* Frequency */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[9px] font-bold text-muted-foreground uppercase">Fréquence</label>
            <span className="text-[11px] font-bold text-foreground">{mergedParams.frequency} MHz</span>
          </div>
          <Slider
            value={[mergedParams.frequency]}
            min={400} max={6000} step={100}
            onValueChange={v => updateParam('frequency', v[0])}
            className="mt-1"
          />
        </div>

        {/* Tx Power */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[9px] font-bold text-muted-foreground uppercase">Puissance Tx</label>
            <span className="text-[11px] font-bold text-foreground">{mergedParams.txPower} dBm</span>
          </div>
          <Slider
            value={[mergedParams.txPower]}
            min={20} max={60} step={1}
            onValueChange={v => updateParam('txPower', v[0])}
            className="mt-1"
          />
        </div>

        {/* Antenna Height */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[9px] font-bold text-muted-foreground uppercase">Hauteur Antenne (HBA)</label>
            <span className="text-[11px] font-bold text-foreground">{mergedParams.antennaHeight} m</span>
          </div>
          <Slider
            value={[mergedParams.antennaHeight]}
            min={5} max={100} step={1}
            onValueChange={v => updateParam('antennaHeight', v[0])}
            className="mt-1"
          />
        </div>

        {/* Azimuth */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[9px] font-bold text-muted-foreground uppercase">Azimut</label>
            <span className="text-[11px] font-bold text-foreground">{mergedParams.azimuth}°</span>
          </div>
          <Slider
            value={[mergedParams.azimuth]}
            min={0} max={359} step={1}
            onValueChange={v => updateParam('azimuth', v[0])}
            className="mt-1"
          />
        </div>

        {/* Radius */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[9px] font-bold text-muted-foreground uppercase">Rayon simulation</label>
            <span className="text-[11px] font-bold text-foreground">{mergedParams.radius} km</span>
          </div>
          <Slider
            value={[mergedParams.radius]}
            min={0.5} max={20} step={0.5}
            onValueChange={v => updateParam('radius', v[0])}
            className="mt-1"
          />
        </div>

        {/* Environment */}
        <div>
          <label className="text-[9px] font-bold text-muted-foreground uppercase block mb-1">Environnement</label>
          <div className="flex gap-1">
            {ENV_OPTIONS.map(env => (
              <button
                key={env.value}
                onClick={() => updateParam('environment', env.value)}
                className={`flex-1 px-2 py-2 rounded-lg text-[10px] font-bold transition-all text-center ${
                  mergedParams.environment === env.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {env.icon} {env.label}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          <Settings2 size={11} />
          <span>Paramètres avancés</span>
          {showAdvanced ? <ChevronUp size={11} className="ml-auto" /> : <ChevronDown size={11} className="ml-auto" />}
        </button>

        {showAdvanced && (
          <div className="space-y-3 pl-2 border-l-2 border-border">
            {/* Antenna Gain */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-bold text-muted-foreground uppercase">Gain Antenne</label>
                <span className="text-[11px] font-bold text-foreground">{mergedParams.antennaGain} dBi</span>
              </div>
              <Slider
                value={[mergedParams.antennaGain]}
                min={0} max={30} step={0.5}
                onValueChange={v => updateParam('antennaGain', v[0])}
                className="mt-1"
              />
            </div>

            {/* Beamwidth */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-bold text-muted-foreground uppercase">Ouverture H</label>
                <span className="text-[11px] font-bold text-foreground">{mergedParams.beamwidth}°</span>
              </div>
              <Slider
                value={[mergedParams.beamwidth]}
                min={30} max={120} step={5}
                onValueChange={v => updateParam('beamwidth', v[0])}
                className="mt-1"
              />
            </div>

            {/* Tilt */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-bold text-muted-foreground uppercase">Tilt électrique</label>
                <span className="text-[11px] font-bold text-foreground">{mergedParams.tilt}°</span>
              </div>
              <Slider
                value={[mergedParams.tilt]}
                min={0} max={15} step={0.5}
                onValueChange={v => updateParam('tilt', v[0])}
                className="mt-1"
              />
            </div>

            {/* Grid resolution */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-bold text-muted-foreground uppercase">Résolution grille</label>
                <span className="text-[11px] font-bold text-foreground">{mergedParams.gridSize}×{mergedParams.gridSize}</span>
              </div>
              <Slider
                value={[mergedParams.gridSize]}
                min={40} max={200} step={10}
                onValueChange={v => updateParam('gridSize', v[0])}
                className="mt-1"
              />
            </div>

            {/* Rx Height */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-bold text-muted-foreground uppercase">Hauteur mobile</label>
                <span className="text-[11px] font-bold text-foreground">{mergedParams.rxHeight} m</span>
              </div>
              <Slider
                value={[mergedParams.rxHeight]}
                min={1} max={10} step={0.5}
                onValueChange={v => updateParam('rxHeight', v[0])}
                className="mt-1"
              />
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-4 pb-3 flex gap-2">
        <button
          onClick={resetParams}
          className="px-3 py-2.5 rounded-xl text-[10px] font-bold text-muted-foreground bg-muted hover:bg-muted/80 transition-all flex items-center gap-1.5"
        >
          <RotateCcw size={11} /> Reset
        </button>
        <button
          onClick={onClear}
          className="px-3 py-2.5 rounded-xl text-[10px] font-bold text-muted-foreground bg-muted hover:bg-muted/80 transition-all flex items-center gap-1.5"
        >
          <X size={11} /> Effacer
        </button>
        <button
          onClick={handleSimulate}
          disabled={isSimulating}
          className="flex-1 px-4 py-2.5 rounded-xl text-[11px] font-extrabold uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg"
        >
          {isSimulating ? (
            <><Activity size={13} className="animate-spin" /> Calcul...</>
          ) : (
            <><Play size={13} /> Simuler</>
          )}
        </button>
      </div>

      {/* RSRP Legend */}
      <div className="border-t border-border">
        <button
          onClick={() => setShowLegend(!showLegend)}
          className="flex items-center gap-2 px-4 py-2 text-[9px] font-bold text-muted-foreground uppercase tracking-wider w-full hover:text-foreground transition-colors"
        >
          <Signal size={10} /> Légende RSRP
          {showLegend ? <ChevronUp size={10} className="ml-auto" /> : <ChevronDown size={10} className="ml-auto" />}
        </button>
        {showLegend && (
          <div className="px-4 pb-3 space-y-1">
            {RSRP_LEGEND.map(item => (
              <div key={item.label} className="flex items-center gap-2 text-[10px]">
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: item.color }} />
                <span className="font-mono text-muted-foreground">{item.label}</span>
                <span className="ml-auto font-semibold text-foreground">{item.quality}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CoverageSimPanel;
