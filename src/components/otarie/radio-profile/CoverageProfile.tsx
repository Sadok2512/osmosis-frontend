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

function bandFreqLabel(band: string): { label: string; freqMhz: number } {
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
    } = props;
    const aProps = {
      siteName, sectorName, azimut, antennaHeight, mechanicalTilt, electricalTilt,
      band, techno, hbw, vbw, bandwidthMhz, txPowerDbm, siteAltitudeAmsl,
      showBeam, showFootprint, showTiltLines, showClutter, clutterHeight,
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
}) => {
  // Local UI state — toggles inside the panel header strip
  const [showBeam, setShowBeam] = useState(showBeamProp);
  const [showFootprint, setShowFootprint] = useState(showFootprintProp);
  const [showTiltLines, setShowTiltLines] = useState(showTiltLinesProp);
  const [showClutter, setShowClutter] = useState(showClutterProp);
  const [autoScale, setAutoScale] = useState(true);
  const [hoverDist, setHoverDist] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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
  const VIEW_W = 1100;
  const VIEW_H = 430;
  const M = { top: 26, right: 30, bottom: 60, left: 70 };
  const IW = VIEW_W - M.left - M.right;
  const IH = VIEW_H - M.top - M.bottom;

  const xMaxDomain = autoScale
    ? Math.max(1, geom.farDist) * 1.15
    : geom.cap;
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

  const yMin = Math.min(groundBaseAmsl, ...terrainSeries.map(p => p.y)) - 10;
  const yMaxRaw = Math.max(antennaAmsl + 30, ...terrainSeries.map(p => p.y));
  const yMax = yMaxRaw + 10;
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
    <div className="relative w-full h-full overflow-hidden rounded-xl bg-slate-900/50 backdrop-blur-md border border-slate-700/50 shadow-2xl flex flex-col text-white">
      {/* ── Sub-header strip: toggles ── */}
      <div className="flex items-center justify-between px-3 py-2 mb-1 mt-1 mx-1 rounded-xl bg-white/[0.03] border border-white/5 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest font-bold text-white/40 mr-2">Coverage Profile</span>
          <Toggle label="Show Beam" value={showBeam} onChange={setShowBeam} />
          <Toggle label="Show Tilt Lines" value={showTiltLines} onChange={setShowTiltLines} />
          <Toggle label="Show Clutter" value={showClutter} onChange={setShowClutter} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/50 font-medium">Auto Scale</span>
          <button
            onClick={() => setAutoScale(v => !v)}
            className={`w-9 h-4 rounded-full transition-colors relative ${autoScale ? 'bg-emerald-500/70' : 'bg-white/15'}`}
          >
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${autoScale ? 'left-[20px]' : 'left-0.5'}`} />
          </button>
          <button
            onClick={() => setAutoScale(true)}
            className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-white/70 hover:text-white border border-white/10 hover:bg-white/5"
          >
            Reset View
          </button>
        </div>
      </div>

      {/* Site name pill (top-left, like Link Profile) */}
      <div className="absolute top-12 left-3 z-20 px-3 py-1.5 rounded-lg bg-slate-900/60 backdrop-blur-md border border-slate-700/50">
        <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">{siteName}{sectorName ? ` · ${sectorName}` : ''}</span>
      </div>

      {/* (info moved to footer) */}

      {/* ── Chart ── */}
      <div className="flex-1 min-h-0 relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full"
          style={{ background: 'transparent' }}
          onMouseMove={(e) => {
            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * VIEW_W;
            const d = ((px - M.left) / IW) * xMaxDomain;
            if (d < 0 || d > xMaxDomain) { setHoverDist(null); onHoverPoint?.(null); return; }
            setHoverDist(d);
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
          onMouseLeave={() => { setHoverDist(null); onHoverPoint?.(null); }}
        >
          <defs>
            <linearGradient id="cp-terrain" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#1e293b" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="cp-beam" x1="0" x2="1" y1="0" y2="0.2">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.55" />
              <stop offset="35%" stopColor="#eab308" stopOpacity="0.45" />
              <stop offset="70%" stopColor="#f97316" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.35" />
            </linearGradient>
            <filter id="cp-beam-glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
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

          {/* Main beam axis */}
          {showBeam && (
            <line x1={towerX} y1={antennaY} x2={mainImpact.x} y2={mainImpact.y}
              stroke={color} strokeWidth={2.5} />
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

          {/* Main beam impact callout — locked on terrain */}
          <line x1={beamHits.mainHitX} y1={antennaY + 8} x2={beamHits.mainHitX} y2={beamHits.mainHitY}
            stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1} />
          <circle cx={beamHits.mainHitX} cy={beamHits.mainHitY} r={6} fill="#22c55e" stroke="#fff" strokeWidth={1.5} filter="url(#glow)" />
          <g transform={`translate(${Math.min(beamHits.mainHitX - 60, M.left + IW - 130)}, ${Math.max(antennaY - 50, M.top + 4)})`}>
            <rect width="130" height="38" rx="6" fill="#0b1728" stroke="#14532d" />
            <text x="10" y="16" fontSize="11" fontWeight="700" fill="#22c55e">Main Beam Impact</text>
            <text x="10" y="30" fontSize="11" fill="#dbeafe">{(geom.mainDist / 1000).toFixed(2)} km</text>
          </g>

          {/* Coverage end callout — locked on terrain */}
          <line x1={beamHits.farHitX} y1={antennaY + 8} x2={beamHits.farHitX} y2={beamHits.farHitY}
            stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1} />
          <circle cx={beamHits.farHitX} cy={beamHits.farHitY} r={6} fill="#ef4444" stroke="#fff" strokeWidth={1.5} filter="url(#glow)" />
          <g transform={`translate(${Math.min(beamHits.farHitX - 50, M.left + IW - 110)}, ${Math.max(beamHits.farHitY - 48, M.top + 50)})`}>
            <rect width="110" height="38" rx="6" fill="#0b1728" stroke="#7f1d1d" />
            <text x="10" y="16" fontSize="11" fontWeight="700" fill="#ef4444">Coverage End</text>
            <text x="10" y="30" fontSize="11" fill="#dbeafe">{(geom.farDist / 1000).toFixed(2)} km</text>
          </g>

          {/* RSRP legend top-right */}
          <g transform={`translate(${M.left + IW - 150}, ${M.top + 6})`}>
            <rect width="146" height="78" rx="8" fill="rgba(11,23,40,0.85)" stroke="rgba(255,255,255,0.08)" />
            <text x="10" y="16" fontSize="10" fontWeight="700" fill="#cbd5e1">Signal Level (RSRP)</text>
            {[
              { c: '#22c55e', l: '> -85 dBm' },
              { c: '#eab308', l: '-85 to -100 dBm' },
              { c: '#f97316', l: '-100 to -115 dBm' },
              { c: '#ef4444', l: '< -115 dBm' },
            ].map((r, i) => (
              <g key={r.l} transform={`translate(10, ${28 + i * 12})`}>
                <rect width="10" height="8" fill={r.c} rx="2" />
                <text x="16" y="7" fontSize="9" fill="#94a3b8">{r.l}</text>
              </g>
            ))}
          </g>

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
          return (
            <div className="absolute bottom-3 right-3 z-10 px-3 py-2 rounded-lg bg-slate-900/90 backdrop-blur-md border border-slate-700/60 text-[10px] font-mono text-slate-200 pointer-events-none shadow-2xl min-w-[180px]">
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

      {/* Axis labels (Link Profile style) */}
      <div className="absolute top-12 left-4 text-slate-400 text-[10px] font-semibold uppercase tracking-wider rotate-[-90deg] origin-top-left pointer-events-none">
        Altitude (AMSL m)
      </div>

      {/* Footer info bar: Site (TX) · Coverage summary */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-slate-900/60 border-t border-slate-700/50 text-[11px] font-mono">
        <div className="flex items-center gap-3 px-3 py-1 rounded-lg bg-slate-900/70 border border-emerald-500/30">
          <span className="text-emerald-400 font-bold uppercase tracking-wider">{siteName}{sectorName ? ` · ${sectorName}` : ''} (TX)</span>
          <span className="text-slate-300">Ant: <span className="text-emerald-300 font-bold">{antennaHeight.toFixed(0)} m</span></span>
          <span className="text-slate-300">AMSL: <span className="text-emerald-300 font-bold">{Math.round(antennaAmsl)} m</span></span>
          <span className="text-slate-300">Ground: <span className="text-slate-200">{Math.round(groundBaseAmsl)} m</span></span>
          <span className="text-slate-300">Tilt: <span className="text-emerald-300 font-bold">{geom.totalTilt.toFixed(1)}°</span></span>
          <span className="text-slate-300">Band: <span className="text-emerald-300 font-bold">{bandLabel}</span></span>
        </div>
        <div className="flex items-center gap-3 px-3 py-1 rounded-lg bg-slate-900/70 border border-slate-600/40">
          <span><span className="text-cyan-400 font-bold">Coverage:</span> <span className="text-slate-100">{(geom.farDist / 1000).toFixed(2)} km</span></span>
          <span><span className="text-emerald-400 font-bold">Main:</span> <span className="text-slate-100">{(geom.mainDist / 1000).toFixed(2)} km</span></span>
          <span><span className="text-amber-400 font-bold">Area:</span> <span className="text-slate-100">{coverageAreaKm2.toFixed(2)} km²</span></span>
        </div>
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
