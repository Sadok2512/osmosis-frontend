/**
 * FootprintCoveragePanel — display cell dominance footprints by band.
 * Each cell gets a colored sector polygon based on propagation radius.
 * Overlap areas show the dominant (strongest) server color.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Layers, Play, X, Loader2 } from 'lucide-react';
import type { SiteSummary } from '@/types';

// Simple link budget: max range where RSRP > threshold
function computeCoverageRadius(
  freq: number, txPower: number, antennaHeight: number, antennaGain: number, threshold: number = -110
): number {
  // Okumura-Hata simplified for urban
  // Path loss = txPower + antennaGain - threshold
  const maxPathLoss = txPower + antennaGain - threshold; // dB
  // Hata model: PL = 69.55 + 26.16*log10(f) - 13.82*log10(hb) + (44.9-6.55*log10(hb))*log10(d)
  // Solve for d:
  const f = Math.max(150, freq);
  const hb = Math.max(10, antennaHeight);
  const A = 69.55 + 26.16 * Math.log10(f) - 13.82 * Math.log10(hb);
  const B = 44.9 - 6.55 * Math.log10(hb);
  if (B <= 0) return 1;
  const logD = (maxPathLoss - A) / B;
  const d = Math.pow(10, logD); // km
  return Math.max(0.1, Math.min(30, d));
}

// Generate sector polygon coords
function sectorPolygon(
  lat: number, lng: number, azimuth: number, radiusKm: number, beamwidth: number = 65
): [number, number][] {
  const steps = 20;
  const points: [number, number][] = [[lat, lng]];
  const startAngle = azimuth - beamwidth / 2;
  const endAngle = azimuth + beamwidth / 2;
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (endAngle - startAngle) * (i / steps);
    const rad = (angle - 90) * (Math.PI / 180);
    const dlat = (radiusKm / 111.32) * Math.cos(rad);
    const dlng = (radiusKm / (111.32 * Math.cos(lat * Math.PI / 180))) * Math.sin(rad);
    points.push([lat + dlat, lng + dlng]);
  }
  points.push([lat, lng]);
  return points;
}

// Distinct colors for cell dominance (stable per cell index)
const DOMINANCE_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#d946ef', '#0ea5e9', '#22c55e', '#a855f7',
  '#eab308', '#dc2626', '#0891b2', '#7c3aed', '#059669',
];

export interface FootprintCell {
  id: string;
  cellName: string;
  siteName: string;
  lat: number;
  lng: number;
  azimuth: number;
  radiusKm: number;
  beamwidth: number;
  color: string;
  polygon: [number, number][];
  txPower: number;
  antennaGain: number;
  freq: number;
}

interface Props {
  sites: SiteSummary[];
  onFootprintChange: (cells: FootprintCell[]) => void;
  onClear: () => void;
  isActive: boolean;
}

const FreqFromBand: Record<string, number> = {
  GSM900: 900, GSM1800: 1800,
  UMTS900: 900, UMTS2100: 2100,
  LTE700: 700, LTE800: 800, LTE900: 900, LTE1800: 1800, LTE2100: 2100, LTE2600: 2600,
  NR700: 700, NR_700: 700, NR2100: 2100, NR_2100: 2100, NR3500: 3500, NR_3500: 3500,
};

function bandToFreq(band: string): number {
  if (FreqFromBand[band]) return FreqFromBand[band];
  const m = band.match(/(\d{3,4})/);
  return m ? parseInt(m[1]) : 1800;
}

const FootprintCoveragePanel: React.FC<Props> = ({ sites, onFootprintChange, onClear, isActive }) => {
  const [selectedBand, setSelectedBand] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);

  const availableBands = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sites) {
      for (const c of (s.cells || [])) {
        const b = c.bande || c.band || '';
        if (b) m.set(b, (m.get(b) || 0) + 1);
      }
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([band, count]) => ({ band, count }));
  }, [sites]);

  const matchCount = useMemo(() => {
    if (!selectedBand) return 0;
    let n = 0;
    for (const s of sites) for (const c of (s.cells || [])) if ((c.bande || c.band) === selectedBand) n++;
    return n;
  }, [sites, selectedBand]);

  const handleCompute = useCallback(async () => {
    if (!selectedBand) return;
    setComputing(true);
    await new Promise(r => setTimeout(r, 0));

    const freq = bandToFreq(selectedBand);
    const cells: FootprintCell[] = [];
    let idx = 0;

    for (const site of sites) {
      const lat = site.coordinates?.[0] ?? (site as any).lat ?? 0;
      const lng = site.coordinates?.[1] ?? (site as any).lng ?? 0;
      if (!lat || !lng) continue;

      for (const c of (site.cells || [])) {
        if ((c.bande || c.band) !== selectedBand) continue;
        const pmax = (c as any).pmax;
        const txPower = pmax ? Math.round(pmax / 10) : 43;
        const hba = c.hba ?? 30;
        const gain = 18;
        const az = c.azimut ?? (c as any).azimuth ?? 0;
        const bw = 65;

        const radiusKm = computeCoverageRadius(freq, txPower, hba, gain);
        const polygon = sectorPolygon(lat, lng, az, radiusKm, bw);
        const color = DOMINANCE_COLORS[idx % DOMINANCE_COLORS.length];

        cells.push({
          id: `fp_${idx}`,
          cellName: c.cell_id || `cell_${idx}`,
          siteName: site.site_name || '',
          lat, lng, azimuth: az,
          radiusKm, beamwidth: bw, color, polygon,
          txPower, antennaGain: gain, freq,
        });
        idx++;
      }
    }

    onFootprintChange(cells);
    setComputing(false);
  }, [selectedBand, sites, onFootprintChange]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Layers size={14} className="text-emerald-500" />
        <span className="text-[10px] font-black uppercase tracking-wider text-foreground">Footprint Coverage</span>
      </div>

      <div className="flex flex-wrap gap-1">
        {availableBands.map(({ band, count }) => (
          <button
            key={band}
            onClick={() => setSelectedBand(selectedBand === band ? null : band)}
            className={`px-2 py-1 rounded-lg text-[9px] font-bold transition-all border ${
              selectedBand === band
                ? 'bg-emerald-500 text-white border-emerald-500'
                : 'bg-muted/30 text-muted-foreground border-border hover:border-emerald-500/50'
            }`}
          >
            {band} <span className="opacity-50">({count})</span>
          </button>
        ))}
      </div>

      {selectedBand && (
        <div className="text-[10px] text-muted-foreground">
          <strong className="text-foreground">{matchCount}</strong> cellules {selectedBand}
          <span className="ml-1 opacity-60">• rayon ≈ {computeCoverageRadius(bandToFreq(selectedBand), 46, 30, 18).toFixed(1)} km</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleCompute}
          disabled={!selectedBand || matchCount === 0 || computing}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 hover:bg-emerald-600 transition-colors"
        >
          {computing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          Afficher Footprint
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
    </div>
  );
};

export default FootprintCoveragePanel;
