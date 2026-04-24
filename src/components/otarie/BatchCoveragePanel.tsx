/**
 * BatchCoveragePanel — simulate coverage for ALL cells of a selected band
 * in the current dashboard scope. Merges individual cell grids into a
 * combined best-server RSRP map.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Loader2, Play, X, Layers } from 'lucide-react';
import { CoverageGrid, SimulationParams, simulateCoverage, getDefaultParams } from '@/services/propagationEngine';
import type { SiteSummary, CellProperties } from '@/types';

interface Props {
  sites: SiteSummary[];
  onSimulate: (grid: CoverageGrid) => void;
  onClear: () => void;
  isActive: boolean;
}

const BatchCoveragePanel: React.FC<Props> = ({ sites, onSimulate, onClear, isActive }) => {
  const [selectedBand, setSelectedBand] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalCells, setTotalCells] = useState(0);

  // Extract available bands from all visible sites
  const availableBands = useMemo(() => {
    const bandSet = new Map<string, number>();
    for (const site of sites) {
      for (const cell of (site.cells || [])) {
        const band = (cell as any).bande || (cell as any).band || '';
        if (band) bandSet.set(band, (bandSet.get(band) || 0) + 1);
      }
    }
    return Array.from(bandSet.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([band, count]) => ({ band, count }));
  }, [sites]);

  // Get cells matching selected band
  const matchingCells = useMemo(() => {
    if (!selectedBand) return [];
    const cells: { cell: CellProperties; site: SiteSummary }[] = [];
    for (const site of sites) {
      for (const cell of (site.cells || [])) {
        if (((cell as any).bande || (cell as any).band) === selectedBand) {
          cells.push({ cell, site });
        }
      }
    }
    return cells;
  }, [sites, selectedBand]);

  const handleSimulate = useCallback(async () => {
    if (matchingCells.length === 0) return;
    setSimulating(true);
    setProgress(0);
    setTotalCells(matchingCells.length);

    // Determine tech from first cell
    const firstTech = (matchingCells[0].cell.techno || '').toUpperCase();
    const techno = firstTech.includes('5G') || firstTech.includes('NR') ? '5G'
      : firstTech.includes('3G') || firstTech.includes('UMTS') ? '3G'
      : firstTech.includes('2G') || firstTech.includes('GSM') ? '2G' : '4G';
    const defaults = getDefaultParams(techno as any, selectedBand!);

    const allPoints: CoverageGrid['points'] = [];
    let mergedBounds: CoverageGrid['bounds'] | null = null;
    let firstParams: SimulationParams | null = null;
    let minRsrp = Infinity, maxRsrp = -Infinity, sumRsrp = 0, countRsrp = 0;

    // Process in batches to keep UI responsive
    for (let i = 0; i < matchingCells.length; i++) {
      const { cell, site } = matchingCells[i];
      const lat = site.coordinates?.[0] ?? 0;
      const lng = site.coordinates?.[1] ?? 0;
      if (!lat || !lng) {
        setProgress(i + 1);
        continue;
      }

      const pmax = (cell as any).pmax;
      const txPower = pmax ? Math.round(pmax / 10) : defaults.txPower ?? 43;

      const simParams: SimulationParams = {
        lat, lng,
        frequency: defaults.frequency ?? 1800,
        txPower,
        antennaHeight: cell.hba ?? 30,
        antennaGain: defaults.antennaGain ?? 18,
        azimuth: cell.azimut ?? (cell as any).azimuth ?? 0,
        beamwidth: defaults.beamwidth ?? 65,
        tilt: (cell as any).tilt ?? defaults.tilt ?? 4,
        mechanicalTilt: 0,
        rxHeight: 1.5,
        radius: defaults.radius ?? 5,
        gridSize: 40, // Coarser grid for batch (faster)
        environment: 'urban',
        techno: (techno === '5G' ? '5G' : '4G') as '4G' | '5G',
        cableLoss: defaults.cableLoss ?? 2,
        bodyLoss: 3,
        bandwidth: defaults.bandwidth ?? 20,
        shadowFading: false, // Disable for speed
        clutterEnabled: true,
      };

      try {
        const grid = simulateCoverage(simParams);
        if (!firstParams) firstParams = simParams;

        // Merge points
        for (const pt of grid.points) {
          allPoints.push(pt);
          if (pt.rsrp > -200) {
            if (pt.rsrp < minRsrp) minRsrp = pt.rsrp;
            if (pt.rsrp > maxRsrp) maxRsrp = pt.rsrp;
            sumRsrp += pt.rsrp;
            countRsrp++;
          }
        }

        // Expand bounds
        if (!mergedBounds) {
          mergedBounds = { ...grid.bounds };
        } else {
          mergedBounds.minLat = Math.min(mergedBounds.minLat, grid.bounds.minLat);
          mergedBounds.maxLat = Math.max(mergedBounds.maxLat, grid.bounds.maxLat);
          mergedBounds.minLng = Math.min(mergedBounds.minLng, grid.bounds.minLng);
          mergedBounds.maxLng = Math.max(mergedBounds.maxLng, grid.bounds.maxLng);
        }
      } catch { /* skip failed cell */ }

      setProgress(i + 1);
      // Yield to UI every 5 cells
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }

    if (mergedBounds && firstParams && allPoints.length > 0) {
      const mergedGrid: CoverageGrid = {
        points: allPoints,
        bounds: mergedBounds,
        params: firstParams,
        stats: {
          minRsrp: minRsrp === Infinity ? -200 : minRsrp,
          maxRsrp: maxRsrp === -Infinity ? -200 : maxRsrp,
          avgRsrp: countRsrp > 0 ? sumRsrp / countRsrp : -200,
          pointCount: allPoints.length,
        },
      };
      onSimulate(mergedGrid);
    }
    setSimulating(false);
  }, [matchingCells, selectedBand, onSimulate]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Layers size={14} className="text-primary" />
        <span className="text-[10px] font-black uppercase tracking-wider text-foreground">Coverage par Bande</span>
      </div>

      {/* Band selector */}
      <div className="flex flex-wrap gap-1">
        {availableBands.length === 0 && (
          <span className="text-[10px] text-muted-foreground italic">Aucune bande détectée dans la vue actuelle</span>
        )}
        {availableBands.map(({ band, count }) => (
          <button
            key={band}
            onClick={() => { setSelectedBand(selectedBand === band ? null : band); }}
            className={`px-2 py-1 rounded-lg text-[9px] font-bold transition-all border ${
              selectedBand === band
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/30 text-muted-foreground border-border hover:border-primary/50'
            }`}
          >
            {band} <span className="opacity-50">({count})</span>
          </button>
        ))}
      </div>

      {/* Selected band info */}
      {selectedBand && (
        <div className="text-[10px] text-muted-foreground">
          <strong className="text-foreground">{matchingCells.length}</strong> cellules {selectedBand} sur <strong>{sites.length}</strong> sites
        </div>
      )}

      {/* Simulate / Clear buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleSimulate}
          disabled={!selectedBand || matchingCells.length === 0 || simulating}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          {simulating ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          {simulating ? `${progress}/${totalCells}` : 'Simuler Coverage'}
        </button>
        {isActive && (
          <button
            onClick={onClear}
            className="px-3 py-2 rounded-xl border border-border text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Progress bar */}
      {simulating && (
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-200"
            style={{ width: `${totalCells > 0 ? (progress / totalCells) * 100 : 0}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default BatchCoveragePanel;
