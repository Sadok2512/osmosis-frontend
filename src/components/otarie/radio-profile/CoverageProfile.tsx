/**
 * CoverageProfile — antenna-to-ground cellular coverage view (premium UI).
 *
 * Side-elevation chart with a rich header (site/sector/band info chips),
 * a colored beam segmented by RSRP zone (Near / Main / Far), an RSRP legend,
 * tower with antenna marker, terrain (when available) and bottom summary
 * panels (Coverage Summary, Signal at Ground, Legend).
 *
 * Engineering model (simplified, side-view, ignores earth curvature):
 *   totalTilt           = mechanicalTilt + electricalTilt              [deg]
 *   mainBeamGroundDist  = antennaHeight / tan(totalTilt)               [m]
 *   farEdgeDist         = antennaHeight / tan(totalTilt - vbw/2)       [m]
 *   nearEdgeDist        = antennaHeight / tan(totalTilt + vbw/2)       [m]
 */
import React, { useMemo, useRef, useState } from 'react';
import { Antenna } from 'lucide-react';
import type { ProfilePoint } from '@/utils/geodesicUtils';
import type { ProfileHoverData } from './ProfileChart';
import { SiteTower } from './ProfileChart';

export interface CoverageSiteParams {
  siteName: string;
  sectorName?: string;
  azimut?: number;
  antennaHeight: number;
  mechanicalTilt: number;
  electricalTilt: number;
  band: string;
  techno: string;
  hbw?: number;
  vbw?: number;
}

export interface CoverageProfileProps {
  siteName: string;
  sectorName?: string;
  azimut?: number;
  antennaHeight: number;
  mechanicalTilt: number;
  electricalTilt: number;
  band: string;
  techno: string;
  hbw?: number;
  vbw?: number;
  /** Channel bandwidth (MHz), e.g. 20. Optional, displayed in header. */
  bandwidthMhz?: number;
  /** Tx power in dBm (for free-space estimate). Defaults to 46 dBm (~40W). */
  txPowerDbm?: number;
  terrainProfile?: ProfilePoint[];
  siteAltitudeAmsl?: number;
  showBeam?: boolean;
  showFootprint?: boolean;
  showTiltLines?: boolean;
  showClutter?: boolean;
  clutterHeight?: number;
  /**
   * Optional second site. When provided, the chart shows TWO independent
   * antenna-to-ground coverages (Site A on the left, Site B on the right,
   * mirrored). NO link / LOS / Fresnel line is drawn between them — each
   * antenna covers the ground around its own site only.
   */
  siteB?: CoverageSiteParams & { siteAltitudeAmsl?: number };
  onHoverPoint?: (data: ProfileHoverData | null) => void;
  /** Optional bearing from the antenna to the target point (deg). Used to compute ΔAz. */
  targetBearing?: number | null;
  /** Raw HBA value as stored in DB. When null, the chip shows "—" instead of a fallback number. */
  rawHba?: number | null;
  /** Raw tilt value as stored in DB. When null, the chip shows "—" instead of "0.0°". */
  rawTilt?: number | null;
}

const SAFE_MIN_DEG = 0.5;
const tanDeg = (deg: number) => Math.tan((deg * Math.PI) / 180);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function technoColor(techno: string): string {
  const t = String(techno || '').toUpperCase();
  if (t.includes('5G') || t.startsWith('NR')) return '#27AE60';
  if (t.includes('4G') || t.includes('LTE')) return '#F39C12';
  if (t.includes('3G') || t.includes('UMTS') || t.includes('WCDMA')) return '#3498DB';
  if (t.includes('2G') || t.includes('GSM')) return '#8E44AD';
  return '#94a3b8';
}

export function bandFreqLabel(band: string): { label: string; freqMhz: number } {
  const b = String(band || '').toUpperCase().replace(/\s+/g, '');
  if (b.includes('3500') || b.includes('N78')) return { label: '3500 MHz (n78)', freqMhz: 3500 };
  if (b.includes('2600') || b.includes('B7')) return { label: '2600 MHz (B7)', freqMhz: 2600 };
  if (b.includes('2100') || b === 'B1') return { label: '2100 MHz (B1)', freqMhz: 2100 };
  if (b.includes('1800') || b.includes('B3') || b.includes('DCS')) return { label: '1800 MHz (B3)', freqMhz: 1800 };
  if (b.includes('900') || b.includes('B8')) return { label: '900 MHz (B8)', freqMhz: 900 };
  if (b.includes('800') || b.includes('B20')) return { label: '800 MHz (B20)', freqMhz: 800 };
  if (b.includes('700') || b.includes('B28')) return { label: '700 MHz (B28)', freqMhz: 700 };
  return { label: band || '—', freqMhz: 1800 };
}

function bandMaxDistance(band: string, techno: string): number {
  const b = String(band || '').toUpperCase().replace(/\s+/g, '');
  if (b.includes('3500') || b.includes('N78')) return 1500;
  if (b.includes('2600') || b.includes('B7')) return 1800;
  if (b.includes('2100')) return 2500;
  if (b.includes('1800')) return 3000;
  if (b.includes('900')) return 5000;
  if (b.includes('800')) return 6500;
  if (b.includes('700')) return 7000;
  const t = String(techno || '').toUpperCase();
  if (t.includes('5G')) return 1500;
  if (t.includes('4G')) return 3000;
  if (t.includes('3G')) return 4000;
  if (t.includes('2G')) return 6000;
  return 3000;
}

function defaultVbw(band: string, techno: string): number {
  const b = String(band || '').toUpperCase();
  if (b.includes('3500')) return 6;
  if (String(techno).toUpperCase().includes('5G')) return 6;
  return 7;
}

/** Free-space path loss in dB. d in meters, f in MHz. */
function fspl(distM: number, freqMhz: number): number {
  if (distM <= 0 || freqMhz <= 0) return 0;
  return 32.45 + 20 * Math.log10(distM / 1000) + 20 * Math.log10(freqMhz);
}

/**
 * Estimate received RSRP at a ground distance — smooth log-distance model
 * tuned to realistic telecom ranges:
 *   d ≤ 50 m   → -65 to -75 dBm   (near field)
 *   d ≈ 200 m  → ~-85 dBm         (main coverage)
 *   d ≈ 700 m  → ~-100 dBm        (far)
 *   d ≥ 1500 m → ≤ -115 dBm       (edge)
 * Adjusted for frequency and tx power offsets.
 */
function estimateRsrpDbm(distM: number, freqMhz: number, txPowerDbm: number): number {
  const d = Math.max(20, distM);
  const freqAdj = 6 * Math.log10(Math.max(100, freqMhz) / 1800); // +dB at higher freq
  const pAdj = txPowerDbm - 46;
  // -60 dBm at 20 m, ~-88 dBm at 200 m, ~-102 dBm at 700 m, ~-113 dBm at 1500 m
  return -60 - 28 * Math.log10(d / 20) - freqAdj + pAdj;
}

function rsrpClass(rsrp: number): { color: string; label: string } {
  if (rsrp >= -85) return { color: '#22c55e', label: '> -85 dBm' };
  if (rsrp >= -100) return { color: '#eab308', label: '-85 to -100 dBm' };
  if (rsrp >= -115) return { color: '#f97316', label: '-100 to -115 dBm' };
  return { color: '#ef4444', label: '< -115 dBm' };
}

/**
 * Public component. Renders ONE antenna-to-ground coverage chart by default.
 * If `siteB` is provided, it renders TWO independent ground-coverage charts
 * stacked vertically (Site A on top, Site B below). NO link / LOS / Fresnel
 * line is ever drawn between the two sites — each antenna only covers the
 * ground around its own site.
 */
export const CoverageProfile: React.FC<CoverageProfileProps> = (props) => {
  if (props.siteB) {
    const {
      siteB,
      siteName, sectorName, azimut, antennaHeight, mechanicalTilt, electricalTilt,
      band, techno, hbw, vbw, bandwidthMhz, txPowerDbm, siteAltitudeAmsl,
      showBeam, showFootprint, showTiltLines, showClutter, clutterHeight,
      targetBearing, rawHba, rawTilt,
    } = props;
    const aProps = {
      siteName, sectorName, azimut, antennaHeight, mechanicalTilt, electricalTilt,
      band, techno, hbw, vbw, bandwidthMhz, txPowerDbm, siteAltitudeAmsl,
      showBeam, showFootprint, showTiltLines, showClutter, clutterHeight,
      targetBearing, rawHba, rawTilt,
    };
    return (
      <div className="w-full h-full grid grid-rows-2 gap-2 min-h-0">
        <div className="min-h-0 relative">
          <div className="absolute top-2 left-3 z-10 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-[10px] font-bold uppercase tracking-wider pointer-events-none">
            Site A ground coverage
          </div>
          <CoverageProfileSingle {...aProps} />
        </div>
        <div className="min-h-0 relative">
          <div className="absolute top-2 left-3 z-10 px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-400/30 text-sky-200 text-[10px] font-bold uppercase tracking-wider pointer-events-none">
            Site B ground coverage
          </div>
          <CoverageProfileSingle
            siteName={siteB.siteName}
            sectorName={siteB.sectorName}
            azimut={siteB.azimut}
            antennaHeight={siteB.antennaHeight}
            mechanicalTilt={siteB.mechanicalTilt}
            electricalTilt={siteB.electricalTilt}
            band={siteB.band}
            techno={siteB.techno}
            hbw={siteB.hbw}
            vbw={siteB.vbw}
            bandwidthMhz={bandwidthMhz}
            txPowerDbm={txPowerDbm}
            siteAltitudeAmsl={siteB.siteAltitudeAmsl ?? siteAltitudeAmsl}
            showBeam={showBeam}
            showFootprint={showFootprint}
            showTiltLines={showTiltLines}
            showClutter={showClutter}
            clutterHeight={clutterHeight}
          />
        </div>
      </div>
    );
  }
  return <CoverageProfileSingle {...props} />;
};

const CoverageProfileSingle: React.FC<Omit<CoverageProfileProps, 'siteB'>> = ({
  siteName,
  sectorName,
  azimut,
  antennaHeight,
  mechanicalTilt,
  electricalTilt,
  band,
  techno,
  hbw = 65,
  vbw,
  bandwidthMhz = 20,
  txPowerDbm = 46,
  terrainProfile,
  siteAltitudeAmsl,
  showBeam: showBeamProp = true,
  showFootprint: showFootprintProp = true,
  showTiltLines: showTiltLinesProp = true,
  showClutter: showClutterProp = false,
  clutterHeight = 10,
  onHoverPoint,
  targetBearing = null,
  rawHba = null,
  rawTilt = null,
}) => {
  // Local UI state — toggles inside the panel header strip
  const [showBeam, setShowBeam] = useState(showBeamProp);
  const [showFootprint, setShowFootprint] = useState(showFootprintProp);
  const [showTiltLines, setShowTiltLines] = useState(showTiltLinesProp);
  const [showClutter, setShowClutter] = useState(showClutterProp);
  const [autoScale, setAutoScale] = useState(true);
  const [hoverDist, setHoverDist] = useState<number | null>(null);
  const [hoverPx, setHoverPx] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const color = technoColor(techno);
  const vbwEff = vbw ?? defaultVbw(band, techno);
  const { label: bandLabel, freqMhz } = bandFreqLabel(band);

  const geom = useMemo(() => {
    const totalTilt = mechanicalTilt + electricalTilt;
    const mainAngle = Math.max(SAFE_MIN_DEG, totalTilt);
    const farAngle = Math.max(SAFE_MIN_DEG, totalTilt - vbwEff / 2);
    const nearAngle = Math.max(SAFE_MIN_DEG, totalTilt + vbwEff / 2);
    const cap = bandMaxDistance(band, techno);
    const mainDist = clamp(antennaHeight / tanDeg(mainAngle), 0, cap);
    const farDist = clamp(antennaHeight / tanDeg(farAngle), 0, cap);
    const nearDist = clamp(antennaHeight / tanDeg(nearAngle), 0, cap);
    const maxRange = clamp(antennaHeight / tanDeg(Math.max(SAFE_MIN_DEG, totalTilt - vbwEff)), 0, cap * 1.2);
    return { totalTilt, mainAngle, farAngle, nearAngle, mainDist, farDist, nearDist, cap, maxRange };
  }, [mechanicalTilt, electricalTilt, antennaHeight, band, techno, vbwEff]);

  // ── Chart frame ──
  // Margins use a consistent 8/12/16 spacing scale and reserve room for the
  // rotated Altitude axis label on the left and the RSRP legend on the right.
  const VIEW_W = 1100;
  const VIEW_H = 430;
  const M = { top: 40, right: 24, bottom: 64, left: 72 };
  const IW = VIEW_W - M.left - M.right;
  const IH = VIEW_H - M.top - M.bottom;

  // Real link distance from terrain profile (matches Link Profile exactly)
  const linkDistance = (terrainProfile && terrainProfile.length >= 2)
    ? terrainProfile[terrainProfile.length - 1].distance
    : 0;
  const xMaxDomain = linkDistance > 0
    ? linkDistance
    : (autoScale ? Math.max(1, geom.farDist) * 1.15 : geom.cap);
  const groundBaseAmsl = siteAltitudeAmsl ?? 0;
  const antennaAmsl = groundBaseAmsl + antennaHeight;

  const terrainSeries = useMemo<{ x: number; y: number }[]>(() => {
    if (terrainProfile && terrainProfile.length >= 2) {
      return terrainProfile.map(p => ({ x: p.distance, y: p.elevation }));
    }
    return [
      { x: 0, y: groundBaseAmsl },
      { x: xMaxDomain, y: groundBaseAmsl },
    ];
  }, [terrainProfile, groundBaseAmsl, xMaxDomain]);

  // Y-axis: same auto-scale logic as Link Profile —
  // tight frame around terrain min and max(antenna, terrain) with adaptive padding.
  const _tMin = Math.min(groundBaseAmsl, ...terrainSeries.map(p => p.y));
  const _tMax = Math.max(...terrainSeries.map(p => p.y));
  const _rfMax = Math.max(_tMax, antennaAmsl);
  const _rfMin = _tMin;
  const _range = Math.max(20, _rfMax - _rfMin);
  const yMin = autoScale
    ? Math.max(0, Math.floor((_rfMin - _range * 0.10) / 10) * 10)
    : Math.min(groundBaseAmsl, _tMin) - 10;
  const yMax = autoScale
    ? Math.ceil((_rfMax + Math.max(15, _range * 0.12)) / 25) * 25
    : Math.max(antennaAmsl + 30, _tMax) + 10;
  const ySpan = Math.max(1, yMax - yMin);

  const xScale = (d: number) => M.left + (d / xMaxDomain) * IW;
  const yScale = (a: number) => M.top + IH - ((a - yMin) / ySpan) * IH;

  const towerX = xScale(0);
  const groundY = yScale(groundBaseAmsl);
  const antennaY = yScale(antennaAmsl);
  const axisY = M.top + IH;

  const nearImpact = { x: xScale(geom.nearDist), y: yScale(groundBaseAmsl) };
  const mainImpact = { x: xScale(geom.mainDist), y: yScale(groundBaseAmsl) };
  const farImpact = { x: xScale(geom.farDist), y: yScale(groundBaseAmsl) };

  const terrainPath = useMemo(() => {
    if (terrainSeries.length < 2) return '';
    const pts = terrainSeries.map(p => `${xScale(p.x)},${yScale(p.y)}`).join(' L ');
    const first = `${xScale(terrainSeries[0].x)},${yScale(yMin)}`;
    const last = `${xScale(terrainSeries[terrainSeries.length - 1].x)},${yScale(yMin)}`;
    return `M ${first} L ${pts} L ${last} Z`;
  }, [terrainSeries, xMaxDomain, yMin, yMax]);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = niceStep(ySpan / 6);
    const start = Math.ceil(yMin / step) * step;
    for (let v = start; v <= yMax; v += step) ticks.push(v);
    return ticks;
  }, [yMin, yMax, ySpan]);

  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = niceStep(xMaxDomain / 8);
    for (let v = 0; v <= xMaxDomain + 1e-6; v += step) ticks.push(v);
    return ticks;
  }, [xMaxDomain]);

  // RSRP at landmark distances
  const rsrpNear = estimateRsrpDbm(100, freqMhz, txPowerDbm);
  const rsrpMid = estimateRsrpDbm(500, freqMhz, txPowerDbm);
  const rsrpFar = estimateRsrpDbm(1500, freqMhz, txPowerDbm);
  const rsrpEdge = estimateRsrpDbm(geom.farDist || 1, freqMhz, txPowerDbm);
  const coverageAreaKm2 = (Math.PI * Math.pow(geom.farDist / 1000, 2) * (hbw / 360));

  // Coverage zones (along the beam) — colored by RSRP class
  const zone = (d0: number, d1: number) => {
    const mid = (d0 + d1) / 2;
    return rsrpClass(estimateRsrpDbm(Math.max(50, mid), freqMhz, txPowerDbm));
  };
  const nearZone = zone(0, geom.nearDist);
  const mainZone = zone(geom.nearDist, geom.mainDist);
  const farZone = zone(geom.mainDist, geom.farDist);

  // Build a coverage polygon clipped to terrain.
  // Top edge = far-edge ray from antenna to where it meets terrain.
  // Bottom edge = terrain walked back to where near-edge ray meets terrain.
  // Closing edge = near-edge ray back up to antenna.
  const beamHits = useMemo(() => {
    const ax = towerX;
    const ay = antennaY;
    const xLimit = M.left + IW;
    const rayY = (impact: { x: number; y: number }, x: number) => {
      if (Math.abs(impact.x - ax) < 1e-6) return impact.y;
      return ay + ((x - ax) * (impact.y - ay)) / (impact.x - ax);
    };
    const tYs = terrainSeries.map(p => ({ sx: xScale(p.x), sy: yScale(p.y) }));
    const tY = (x: number) => {
      if (x <= tYs[0].sx) return tYs[0].sy;
      if (x >= tYs[tYs.length - 1].sx) return tYs[tYs.length - 1].sy;
      for (let i = 0; i < tYs.length - 1; i++) {
        if (x >= tYs[i].sx && x <= tYs[i + 1].sx) {
          const t = (x - tYs[i].sx) / Math.max(1e-6, tYs[i + 1].sx - tYs[i].sx);
          return tYs[i].sy + (tYs[i + 1].sy - tYs[i].sy) * t;
        }
      }
      return tYs[tYs.length - 1].sy;
    };
    const findHit = (impact: { x: number; y: number }) => {
      const N = 320;
      const xStart = ax + 0.5;
      const xEnd = xLimit;
      let prevDiff = rayY(impact, xStart) - tY(xStart);
      if (prevDiff >= 0) return xStart;
      let prevX = xStart;
      for (let i = 1; i <= N; i++) {
        const x = xStart + ((xEnd - xStart) * i) / N;
        const diff = rayY(impact, x) - tY(x);
        if (diff >= 0) {
          const t = prevDiff / (prevDiff - diff);
          return prevX + (x - prevX) * t;
        }
        prevDiff = diff;
        prevX = x;
      }
      return xEnd;
    };
    const farHitX = findHit(farImpact);
    const nearHitX = Math.min(findHit(nearImpact), farHitX);
    const mainHitX = Math.min(findHit(mainImpact), farHitX);
    const farHitY = tY(farHitX);
    const nearHitY = tY(nearHitX);
    const mainHitY = tY(mainHitX);
    const back: string[] = [];
    for (let i = tYs.length - 1; i >= 0; i--) {
      if (tYs[i].sx < nearHitX || tYs[i].sx > farHitX) continue;
      back.push(`L ${tYs[i].sx.toFixed(2)} ${tYs[i].sy.toFixed(2)}`);
    }
    const path = `M ${ax.toFixed(2)} ${ay.toFixed(2)} L ${farHitX.toFixed(2)} ${farHitY.toFixed(2)} ${back.join(' ')} L ${nearHitX.toFixed(2)} ${nearHitY.toFixed(2)} Z`;
    return { path, farHitX, farHitY, nearHitX, nearHitY, mainHitX, mainHitY };
  }, [towerX, antennaY, nearImpact, farImpact, mainImpact, terrainSeries, xScale, yScale]);
  const beamCoveragePath = beamHits.path;

  // Aim angle so the dish points along the main beam direction.
  const mainAimDeg = useMemo(
    () => (Math.atan2(mainImpact.y - antennaY, mainImpact.x - towerX) * 180) / Math.PI,
    [mainImpact, antennaY, towerX],
  );

  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950/80 via-slate-900/60 to-slate-950/80 backdrop-blur-xl border border-white/10 shadow-[0_8px_40px_rgba(0,0,0,0.5)] flex flex-col text-white">
      {/* ── Sub-header strip: toggles ── */}
      <div className="flex items-center justify-between px-4 py-2.5 m-2 rounded-xl bg-white/[0.04] border border-white/10 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2">
          <Toggle label="Show Beam" value={showBeam} onChange={setShowBeam} />
          <Toggle label="Show Tilt Lines" value={showTiltLines} onChange={setShowTiltLines} />
          <Toggle label="Show Clutter" value={showClutter} onChange={setShowClutter} />
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] text-white/50 font-semibold uppercase tracking-wider">Auto Scale</span>
          <button
            onClick={() => setAutoScale(v => !v)}
            className={`w-9 h-4 rounded-full transition-colors relative ${autoScale ? 'bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-white/15'}`}
          >
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${autoScale ? 'left-[20px]' : 'left-0.5'}`} />
          </button>
          <button
            onClick={() => setAutoScale(true)}
            className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-white/70 hover:text-white border border-white/10 hover:bg-white/10 transition-colors"
          >
            Reset View
          </button>
        </div>
      </div>



      {/* RSRP legend — moved out of SVG into a glass card pinned top-right of the chart area */}
      <div className="absolute top-[60px] right-5 z-20 px-3 py-2 rounded-lg bg-slate-900/80 backdrop-blur-md border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.4)] pointer-events-none">
        <div className="text-[9px] uppercase tracking-[0.15em] font-bold text-slate-300 mb-1.5">Signal Level (RSRP)</div>
        <div className="grid grid-cols-1 gap-1">
          {[
            { c: '#22c55e', l: '> -85 dBm', t: 'Excellent' },
            { c: '#eab308', l: '-85 / -100', t: 'Good' },
            { c: '#f97316', l: '-100 / -115', t: 'Fair' },
            { c: '#ef4444', l: '< -115 dBm', t: 'Poor' },
          ].map(r => (
            <div key={r.l} className="flex items-center gap-2 text-[9px] font-mono">
              <span className="w-2.5 h-2.5 rounded-sm shadow-[0_0_4px_currentColor]" style={{ background: r.c, color: r.c }} />
              <span className="text-slate-200 font-bold w-[68px]">{r.l}</span>
              <span className="text-slate-400">{r.t}</span>
            </div>
          ))}
        </div>
      </div>

      {/* (info moved to footer) */}

      {/* ── Chart ── */}
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="w-full h-full"
          style={{ background: 'transparent' }}
          onMouseMove={(e) => {
            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * VIEW_W;
            const d = ((px - M.left) / IW) * xMaxDomain;
            if (d < 0 || d > xMaxDomain) { setHoverDist(null); setHoverPx(null); onHoverPoint?.(null); return; }
            setHoverDist(d);
            setHoverPx({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            if (onHoverPoint && terrainProfile && terrainProfile.length > 0) {
              let best = 0; let bestD = Infinity;
              for (let i = 0; i < terrainProfile.length; i++) {
                const dx = Math.abs(terrainProfile[i].distance - d);
                if (dx < bestD) { bestD = dx; best = i; }
              }
              const p = terrainProfile[best];
              onHoverPoint({ distanceKm: p.distance / 1000, elevationM: p.elevation, lat: p.lat, lng: p.lng });
            }
          }}
          onMouseLeave={() => { setHoverDist(null); setHoverPx(null); onHoverPoint?.(null); }}
        >
          <defs>
            <linearGradient id="cp-terrain" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.55" />
              <stop offset="50%" stopColor="#64748b" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="cp-beam" x1="0" x2="1" y1="0" y2="0.15">
              <stop offset="0%" stopColor={nearZone.color} stopOpacity="0.75" />
              <stop
                offset={`${(Math.min(0.95, Math.max(0.02, geom.nearDist / Math.max(1, geom.farDist))) * 100).toFixed(1)}%`}
                stopColor={nearZone.color}
                stopOpacity="0.6"
              />
              <stop
                offset={`${(Math.min(0.97, Math.max(0.04, geom.mainDist / Math.max(1, geom.farDist))) * 100).toFixed(1)}%`}
                stopColor={mainZone.color}
                stopOpacity="0.5"
              />
              <stop offset="100%" stopColor={farZone.color} stopOpacity="0.45" />
            </linearGradient>
            <linearGradient id="cp-beam-axis" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#34d399" stopOpacity="1" />
              <stop offset="60%" stopColor="#fbbf24" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#fb7185" stopOpacity="0.9" />
            </linearGradient>
            <filter id="cp-beam-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grid */}
          {yTicks.map(v => (
            <g key={`yt-${v}`}>
              <line
                x1={M.left}
                x2={M.left + IW}
                y1={yScale(v)}
                y2={yScale(v)}
                stroke="rgba(148,163,184,0.15)"
                strokeDasharray="4 4"
                strokeWidth={0.7}
              />
              <text x={M.left - 8} y={yScale(v) + 4} textAnchor="end" fontSize="10" fill="rgba(148,163,184,0.7)" fontFamily="monospace">
                {Math.round(v)}m
              </text>
            </g>
          ))}
          {xTicks.map(v => (
            <g key={`xt-${v}`}>
              <line
                x1={xScale(v)}
                x2={xScale(v)}
                y1={M.top}
                y2={M.top + IH}
                stroke="rgba(148,163,184,0.15)"
                strokeDasharray="4 4"
                strokeWidth={0.7}
              />
              <text
                x={xScale(v)}
                y={M.top + IH + 16}
                textAnchor="middle"
                fontSize="10"
                fill="rgba(148,163,184,0.7)"
                fontFamily="monospace"
              >
                {(v / 1000).toFixed(1)}km
              </text>
            </g>
          ))}

          {/* Terrain */}
          <path d={terrainPath} fill="url(#cp-terrain)" />
          {terrainSeries.length >= 2 && (
            <path
              d={terrainSeries.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.x)} ${yScale(p.y)}`).join(' ')}
              fill="none"
              stroke="rgba(203,213,225,0.85)"
              strokeWidth={1.5}
            />
          )}

          {/* Clutter overlay */}
          {showClutter && clutterHeight > 0 && terrainSeries.length >= 2 && (
            <path
              d={terrainSeries
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.x)} ${yScale(p.y + clutterHeight)}`)
                .concat([
                  `L ${xScale(terrainSeries[terrainSeries.length - 1].x)} ${yScale(terrainSeries[terrainSeries.length - 1].y)}`,
                  `L ${xScale(terrainSeries[0].x)} ${yScale(terrainSeries[0].y)} Z`,
                ])
                .join(' ')}
              fill="rgba(251,146,60,0.18)"
              stroke="rgba(251,146,60,0.5)"
              strokeWidth={0.8}
            />
          )}

          {/* Coverage beam — terrain-clipped polygon with green→red gradient */}
          {showBeam && (
            <path
              d={beamCoveragePath}
              fill="url(#cp-beam)"
              filter="url(#cp-beam-glow)"
              stroke={`${color}aa`}
              strokeWidth={1}
              className="transition-all duration-700"
            />
          )}

          {/* Tilt edge lines */}
          {showTiltLines && (
            <>
              <line x1={towerX} y1={antennaY} x2={nearImpact.x} y2={nearImpact.y}
                stroke={color} strokeWidth={1} strokeDasharray="3 4" opacity={0.55} />
              <line x1={towerX} y1={antennaY} x2={farImpact.x} y2={farImpact.y}
                stroke={color} strokeWidth={1} strokeDasharray="3 4" opacity={0.55} />
            </>
          )}

          {/* Main beam axis — gradient stroke with soft glow */}
          {showBeam && (
            <>
              <line x1={towerX} y1={antennaY} x2={mainImpact.x} y2={mainImpact.y}
                stroke="url(#cp-beam-axis)" strokeWidth={4} strokeLinecap="round" opacity={0.35} filter="url(#cp-beam-glow)" />
              <line x1={towerX} y1={antennaY} x2={mainImpact.x} y2={mainImpact.y}
                stroke="url(#cp-beam-axis)" strokeWidth={2} strokeLinecap="round" />
            </>
          )}

          {/* Tower (reused from Link Profile) */}
          <SiteTower
            x={towerX}
            terrainY={groundY}
            antennaY={antennaY}
            innerHeight={IH}
            align="left"
            label="TX"
            heightAGL={antennaHeight}
            altitudeAMSL={Math.round(antennaAmsl)}
            isPoint={false}
            aimDeg={mainAimDeg}
          />

          {/* Main beam impact marker + leader line to top callout */}
          <line x1={beamHits.mainHitX} y1={beamHits.mainHitY - 6} x2={beamHits.mainHitX} y2={M.top + 50}
            stroke="#22c55e" strokeDasharray="3 3" strokeWidth={1} opacity={0.55} />
          <circle cx={beamHits.mainHitX} cy={beamHits.mainHitY} r={10} fill="#22c55e" opacity={0.22} filter="url(#glow)" />
          <circle cx={beamHits.mainHitX} cy={beamHits.mainHitY} r={5} fill="#22c55e" stroke="#fff" strokeWidth={1.5} />
          <g transform={`translate(${clamp(beamHits.mainHitX - 70, M.left + 8, M.left + IW - 300)}, ${M.top + 8})`}>
            <rect width="140" height="40" rx="8" fill="rgba(11,23,40,0.92)" stroke="rgba(34,197,94,0.5)" strokeWidth={1} />
            <rect x="0" y="0" width="3" height="40" rx="1.5" fill="#22c55e" />
            <text x="12" y="16" fontSize="9" fontWeight="700" letterSpacing="1.5" fill="#86efac">MAIN BEAM IMPACT</text>
            <text x="12" y="32" fontSize="13" fontWeight="800" fill="#fff" fontFamily="monospace">{(geom.mainDist / 1000).toFixed(2)} km</text>
          </g>

          {/* Coverage end marker + leader line */}
          <line x1={beamHits.farHitX} y1={beamHits.farHitY - 6} x2={beamHits.farHitX} y2={M.top + 102}
            stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} opacity={0.55} />
          <circle cx={beamHits.farHitX} cy={beamHits.farHitY} r={10} fill="#ef4444" opacity={0.22} filter="url(#glow)" />
          <circle cx={beamHits.farHitX} cy={beamHits.farHitY} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
          <g transform={`translate(${clamp(beamHits.farHitX - 70, M.left + 8, M.left + IW - 300)}, ${M.top + 60})`}>
            <rect width="140" height="40" rx="8" fill="rgba(11,23,40,0.92)" stroke="rgba(239,68,68,0.5)" strokeWidth={1} />
            <rect x="0" y="0" width="3" height="40" rx="1.5" fill="#ef4444" />
            <text x="12" y="16" fontSize="9" fontWeight="700" letterSpacing="1.5" fill="#fca5a5">COVERAGE END</text>
            <text x="12" y="32" fontSize="13" fontWeight="800" fill="#fff" fontFamily="monospace">{(geom.farDist / 1000).toFixed(2)} km</text>
          </g>

          {/* Rotated Altitude axis label — drawn inside the SVG left margin so
              it never overlaps the chart container. */}
          <text
            transform={`translate(${M.left - 56}, ${M.top + IH / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            letterSpacing="2"
            fill="rgba(148,163,184,0.7)"
          >
            ALTITUDE (AMSL m)
          </text>

          {/* Distance axis label */}
          <text
            x={M.left + IW / 2}
            y={M.top + IH + 44}
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            letterSpacing="2"
            fill="rgba(148,163,184,0.7)"
          >
            DISTANCE (km)
          </text>


          {/* Hover position pointer (crosshair on the link/beam) */}
          {hoverDist !== null && (() => {
            // Snap hoverDist to nearest terrain sample for stability
            let snapDist = hoverDist;
            let terrainAlt = groundBaseAmsl;
            if (terrainSeries.length >= 2) {
              let best = 0;
              let bestD = Infinity;
              for (let i = 0; i < terrainSeries.length; i++) {
                const dx = Math.abs(terrainSeries[i].x - hoverDist);
                if (dx < bestD) { bestD = dx; best = i; }
              }
              // For finer tracking, interpolate around the closest segment
              if (hoverDist <= terrainSeries[0].x) {
                terrainAlt = terrainSeries[0].y;
                snapDist = terrainSeries[0].x;
              } else if (hoverDist >= terrainSeries[terrainSeries.length - 1].x) {
                terrainAlt = terrainSeries[terrainSeries.length - 1].y;
                snapDist = terrainSeries[terrainSeries.length - 1].x;
              } else {
                for (let i = 0; i < terrainSeries.length - 1; i++) {
                  const a = terrainSeries[i], b = terrainSeries[i + 1];
                  if (hoverDist >= a.x && hoverDist <= b.x) {
                    const t = (hoverDist - a.x) / Math.max(1e-6, b.x - a.x);
                    terrainAlt = a.y + (b.y - a.y) * t;
                    snapDist = hoverDist;
                    break;
                  }
                }
              }
            }
            const hx = xScale(snapDist);
            const tY = yScale(terrainAlt);
            // Main-beam altitude at hoverDist (linear ray from antenna toward mainImpact, extrapolated)
            const denom = Math.max(1e-6, geom.mainDist);
            const tBeam = snapDist / denom;
            const beamAlt = antennaAmsl + (groundBaseAmsl - antennaAmsl) * tBeam;
            const beamY = yScale(beamAlt);
            const rsrp = estimateRsrpDbm(Math.max(1, snapDist), freqMhz, txPowerDbm);
            const cls = rsrpClass(rsrp);
            const obstructed = terrainAlt > beamAlt && snapDist < geom.farDist;
            // Coverage zone classification
            let zoneLabel = 'Out of Range';
            let zoneColor = '#94a3b8';
            if (snapDist <= geom.nearDist) { zoneLabel = 'Near Field'; zoneColor = '#22c55e'; }
            else if (snapDist <= geom.mainDist) { zoneLabel = 'Main Coverage'; zoneColor = '#eab308'; }
            else if (snapDist <= geom.farDist) { zoneLabel = 'Far Coverage'; zoneColor = '#f97316'; }
            // Show beam pointer whenever the ray is within chart vertical bounds
            const beamVisible = beamY >= M.top && beamY <= M.top + IH;
            return (
              <g pointerEvents="none">
                <line x1={hx} y1={M.top} x2={hx} y2={M.top + IH} stroke="rgba(56,189,248,0.55)" strokeWidth={1} strokeDasharray="3 3" />
                {/* Beam-terrain link line */}
                {beamVisible && (
                  <line x1={hx} y1={beamY} x2={hx} y2={tY} stroke={obstructed ? '#ef4444' : 'rgba(56,189,248,0.4)'} strokeWidth={1} strokeDasharray="2 3" />
                )}
                {beamVisible && (
                  <>
                    <circle cx={hx} cy={beamY} r={8} fill={cls.color} opacity={0.25} filter="url(#glow)" />
                    <circle cx={hx} cy={beamY} r={5} fill={cls.color} stroke="white" strokeWidth={1.5} />
                  </>
                )}
                <circle cx={hx} cy={tY} r={7} fill="rgb(56,189,248)" opacity={0.3} filter="url(#glow)" />
                <circle cx={hx} cy={tY} r={4} fill="rgb(56,189,248)" stroke="white" strokeWidth={1.5} />
              </g>
            );
          })()}
        </svg>
        {hoverDist !== null && (() => {
          // Recompute for tooltip (mirrors logic above)
          let snapDist = hoverDist;
          let terrainAlt = groundBaseAmsl;
          if (terrainSeries.length >= 2) {
            if (hoverDist <= terrainSeries[0].x) terrainAlt = terrainSeries[0].y;
            else if (hoverDist >= terrainSeries[terrainSeries.length - 1].x) terrainAlt = terrainSeries[terrainSeries.length - 1].y;
            else {
              for (let i = 0; i < terrainSeries.length - 1; i++) {
                const a = terrainSeries[i], b = terrainSeries[i + 1];
                if (hoverDist >= a.x && hoverDist <= b.x) {
                  const t = (hoverDist - a.x) / Math.max(1e-6, b.x - a.x);
                  terrainAlt = a.y + (b.y - a.y) * t;
                  break;
                }
              }
            }
          }
          const denom = Math.max(1e-6, geom.mainDist);
          const tBeam = snapDist / denom;
          const beamAlt = antennaAmsl + (groundBaseAmsl - antennaAmsl) * tBeam;
          const rsrp = estimateRsrpDbm(Math.max(1, snapDist), freqMhz, txPowerDbm);
          const cls = rsrpClass(rsrp);
          const obstructed = terrainAlt > beamAlt && snapDist < geom.farDist;
          let zoneLabel = 'Out of Range';
          let zoneColor = '#94a3b8';
          if (snapDist <= geom.nearDist) { zoneLabel = 'Near Field'; zoneColor = '#22c55e'; }
          else if (snapDist <= geom.mainDist) { zoneLabel = 'Main Coverage'; zoneColor = '#eab308'; }
          else if (snapDist <= geom.farDist) { zoneLabel = 'Far Coverage'; zoneColor = '#f97316'; }
          const clearance = beamAlt - terrainAlt;
          // Smart positioning: follow cursor, flip to keep inside container & away from tower/callouts.
          const TT_W = 200;
          const TT_H = 138;
          const PAD = 12;
          const cw = containerRef.current?.clientWidth ?? 800;
          const ch = containerRef.current?.clientHeight ?? 400;
          const cx = hoverPx?.x ?? 0;
          const cy = hoverPx?.y ?? 0;
          let left = cx + 16;
          if (left + TT_W + PAD > cw) left = cx - TT_W - 16;
          left = Math.max(PAD, Math.min(left, cw - TT_W - PAD));
          let top = cy + 16;
          if (top + TT_H + PAD > ch) top = cy - TT_H - 16;
          top = Math.max(PAD, Math.min(top, ch - TT_H - PAD));
          return (
            <div
              style={{ left, top, width: TT_W }}
              className="absolute z-30 px-3 py-2 rounded-lg bg-slate-900/95 backdrop-blur-md border border-cyan-500/30 text-[10px] font-mono text-slate-200 pointer-events-none shadow-2xl"
            >
              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1 border-b border-slate-700/50 pb-1">Hover Probe</div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">Distance</span><span className="text-cyan-400 font-bold">{(snapDist / 1000).toFixed(3)} km</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">Terrain</span><span className="text-slate-100 font-bold">{terrainAlt.toFixed(0)} m</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">Beam Alt</span><span className="text-emerald-300 font-bold">{beamAlt.toFixed(0)} m</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">Clearance</span><span className={`font-bold ${clearance < 0 ? 'text-red-400' : 'text-emerald-300'}`}>{clearance >= 0 ? '+' : ''}{clearance.toFixed(0)} m</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">RSRP</span><span className="font-bold" style={{ color: cls.color }}>{rsrp.toFixed(0)} dBm</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">Zone</span><span className="font-bold" style={{ color: zoneColor }}>{zoneLabel}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">LOS</span><span className={`font-bold ${obstructed ? 'text-red-400' : 'text-emerald-300'}`}>{obstructed ? 'Obstructed' : 'Clear'}</span></div>
            </div>
          );
        })()}
      </div>

      {/* Footer KPI bar — segmented stat cards with clean hierarchy */}
      <div className="shrink-0 grid grid-cols-12 gap-2 p-2 bg-gradient-to-r from-slate-950/80 to-slate-900/60 border-t border-white/10">
        {/* Site / TX details — spans 6 cols */}
        <div className="col-span-6 flex items-center gap-x-2 gap-y-1 px-3 py-2 rounded-xl bg-emerald-500/[0.06] border border-emerald-400/20 backdrop-blur-md flex-wrap">
          <div className="flex items-center gap-1.5 pr-2 border-r border-white/10">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">TX</span>
          </div>
          <span className="text-emerald-400 font-bold uppercase tracking-wider truncate max-w-[220px] text-[10px]" title={sectorName || siteName}>{sectorName || siteName}</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-300 text-[10px]">Band: <span className="text-emerald-300 font-bold">{bandFreqLabel(band).label}</span></span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-300 text-[10px]">HBA: <span className="text-emerald-300 font-bold">{rawHba == null ? '—' : `${Number(rawHba).toFixed(0)} m`}</span></span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-300 text-[10px]">Tilt: <span className="text-emerald-300 font-bold">{(geom.totalTilt ?? 0).toFixed(1)}°</span></span>
          {Number.isFinite(azimut as number) && (
            <>
              <span className="text-slate-500">|</span>
              <span className="text-slate-300 text-[10px]">Az: <span className="text-emerald-300 font-bold tabular-nums">{Math.round(azimut as number)}°</span></span>
            </>
          )}
          {Number.isFinite(targetBearing as number) && (
            <>
              <span className="text-slate-500">|</span>
              <span className="text-slate-300 text-[10px]">Bearing: <span className="text-cyan-300 font-bold tabular-nums">{Math.round(targetBearing as number)}°</span></span>
            </>
          )}
          {Number.isFinite(azimut as number) && Number.isFinite(targetBearing as number) && (() => {
            const da = Math.abs(((azimut as number) - (targetBearing as number) + 540) % 360 - 180);
            const cls = da <= 30 ? 'text-emerald-300' : da <= 60 ? 'text-amber-300' : 'text-red-300';
            return (
              <>
                <span className="text-slate-500">|</span>
                <span className="text-slate-300 text-[10px]">ΔAz: <span className={`font-bold tabular-nums ${cls}`}>{da.toFixed(1)}°</span></span>
              </>
            );
          })()}
        </div>
        {/* Coverage KPI cards */}
        {linkDistance > 0 && (
          <KpiCard accent="sky" label="Link Dist" value={(linkDistance / 1000).toFixed(2)} unit="km" />
        )}
        <KpiCard accent="cyan" label="Coverage" value={(geom.farDist / 1000).toFixed(2)} unit="km" />
        <KpiCard accent="emerald" label="Main Beam" value={(geom.mainDist / 1000).toFixed(2)} unit="km" />
        
      </div>
    </div>
  );
};

// ── Sub-components ──
const Toggle: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void }> = ({ label, value, onChange }) => (
  <button
    onClick={() => onChange(!value)}
    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
      value ? 'text-white bg-white/10' : 'text-white/45 hover:text-white/70'
    }`}
  >
    <span className={`w-3 h-3 rounded-[3px] flex items-center justify-center text-[9px] font-bold ${
      value ? 'bg-emerald-500 text-white' : 'bg-white/10'
    }`}>{value ? '✓' : ''}</span>
    {label}
  </button>
);

const FooterStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <span className="flex items-baseline gap-1">
    <span className="text-slate-400 text-[9px] uppercase tracking-wider">{label}</span>
    <span className="text-emerald-200 font-bold">{value}</span>
  </span>
);

const KPI_ACCENT: Record<string, { ring: string; text: string; glow: string; bg: string }> = {
  cyan:    { ring: 'border-cyan-400/30',    text: 'text-cyan-300',    glow: 'shadow-[0_0_12px_rgba(34,211,238,0.15)]',  bg: 'bg-cyan-500/[0.06]' },
  emerald: { ring: 'border-emerald-400/30', text: 'text-emerald-300', glow: 'shadow-[0_0_12px_rgba(16,185,129,0.15)]',  bg: 'bg-emerald-500/[0.06]' },
  amber:   { ring: 'border-amber-400/30',   text: 'text-amber-300',   glow: 'shadow-[0_0_12px_rgba(251,191,36,0.15)]',  bg: 'bg-amber-500/[0.06]' },
  sky:     { ring: 'border-sky-400/30',     text: 'text-sky-300',     glow: 'shadow-[0_0_12px_rgba(56,189,248,0.15)]',  bg: 'bg-sky-500/[0.06]' },
};
const KpiCard: React.FC<{ accent: 'cyan'|'emerald'|'amber'|'sky'; label: string; value: string; unit: string }> = ({ accent, label, value, unit }) => {
  const a = KPI_ACCENT[accent];
  return (
    <div className={`col-span-2 flex flex-col justify-center px-3 py-1.5 rounded-xl border backdrop-blur-md ${a.ring} ${a.bg} ${a.glow}`}>
      <span className={`text-[9px] uppercase tracking-[0.15em] font-bold ${a.text}`}>{label}</span>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-[15px] font-extrabold text-white font-mono leading-none">{value}</span>
        <span className="text-[10px] text-slate-400 font-medium">{unit}</span>
      </div>
    </div>
  );
};

const Row: React.FC<{ k: string; v: string; mono?: boolean; accent?: boolean; good?: boolean }> = ({ k, v, mono, accent, good }) => (
  <div className="flex items-baseline justify-between gap-2 truncate">
    <span className="text-white/45 truncate">{k}</span>
    <span className={`font-bold truncate ${mono ? 'font-mono' : ''} ${
      good ? 'text-emerald-300' : accent ? 'text-amber-300' : 'text-white/85'
    }`}>{v}</span>
  </div>
);

const SigRow: React.FC<{ label: string; rsrp: number }> = ({ label, rsrp }) => {
  const cls = rsrpClass(rsrp);
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/45">{label}</span>
      <span className="font-mono font-bold" style={{ color: cls.color }}>{rsrp.toFixed(0)} dBm</span>
    </div>
  );
};

const LegendItem: React.FC<{ dot: string; color: string; label: string; dashed?: boolean }> = ({ dot, color, label, dashed }) => (
  <li className="flex items-center gap-1.5">
    <span className="w-3 text-center font-bold" style={{ color, opacity: dashed ? 0.7 : 1 }}>{dot}</span>
    <span className="text-white/70">{label}</span>
  </li>
);

const SectorIndicator: React.FC<{ azimuth: number; hbw: number; color: string }> = ({ azimuth, hbw, color }) => {
  const r = 28;
  const half = hbw / 2;
  const a1 = ((azimuth - half - 90) * Math.PI) / 180;
  const a2 = ((azimuth + half - 90) * Math.PI) / 180;
  const x1 = 30 + r * Math.cos(a1);
  const y1 = 30 + r * Math.sin(a1);
  const x2 = 30 + r * Math.cos(a2);
  const y2 = 30 + r * Math.sin(a2);
  const large = hbw > 180 ? 1 : 0;
  return (
    <svg viewBox="0 0 60 60" width="60" height="60">
      <circle cx="30" cy="30" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      <line x1="30" y1="2" x2="30" y2="6" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      <text x="30" y="11" fontSize="6" fill="rgba(255,255,255,0.4)" textAnchor="middle">N</text>
      <path d={`M 30 30 L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`}
        fill={`${color}55`} stroke={color} strokeWidth="1" />
      <circle cx="30" cy="30" r="2" fill={color} />
    </svg>
  );
};

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const f = raw / Math.pow(10, exp);
  let nice: number;
  if (f < 1.5) nice = 1;
  else if (f < 3) nice = 2;
  else if (f < 7) nice = 5;
  else nice = 10;
  return nice * Math.pow(10, exp);
}

export default CoverageProfile;
