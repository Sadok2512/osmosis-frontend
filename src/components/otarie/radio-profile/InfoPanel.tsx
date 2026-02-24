import React from 'react';
import { LOSAnalysis, FresnelAnalysis, AzimuthSector } from '@/utils/geodesicUtils';
import {
  CheckCircle, XCircle, Radio, Compass, ArrowUpDown, Ruler,
  Mountain, Signal, Target, CircleDot, AlertTriangle
} from 'lucide-react';

interface SiteInfo {
  name: string;
  techno: string;
  bande: string;
  azimuth: number;
  hba: number;
  tilt: number;
}

interface Props {
  site: SiteInfo;
  analysis: LOSAnalysis;
  totalDistance: number;
  enableCurvature: boolean;
  fresnel?: FresnelAnalysis | null;
}

const azimuthSectorLabel: Record<AzimuthSector, { label: string; color: string }> = {
  'in-sector': { label: 'Dans le secteur (<30°)', color: 'text-primary' },
  'edge-sector': { label: 'Bord de secteur (30°–60°)', color: 'text-amber-500' },
  'outside-sector': { label: 'Hors secteur (>60°)', color: 'text-destructive' },
};

const InfoPanel: React.FC<Props> = ({ site, analysis, totalDistance, enableCurvature, fresnel }) => {
  const InfoRow = ({ icon, label, value, accent, warn }: { icon: React.ReactNode; label: string; value: string; accent?: boolean; warn?: boolean }) => (
    <div className="flex items-center gap-2 py-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xs text-muted-foreground flex-1">{label}</span>
      <span className={`text-xs font-semibold ${warn ? 'text-destructive' : accent ? 'text-primary' : 'text-foreground'}`}>{value}</span>
    </div>
  );

  const sectorInfo = azimuthSectorLabel[analysis.azimuthSector];

  return (
    <div className="space-y-4 text-sm">
      {/* LOS Status */}
      <div className={`flex items-center gap-3 p-3 rounded-xl border ${
        analysis.isLOS
          ? 'bg-primary/10 border-primary/30'
          : 'bg-destructive/10 border-destructive/30'
      }`}>
        {analysis.isLOS
          ? <CheckCircle className="w-5 h-5 text-primary" />
          : <XCircle className="w-5 h-5 text-destructive" />
        }
        <div>
          <div className={`text-sm font-bold ${analysis.isLOS ? 'text-primary' : 'text-destructive'}`}>
            {analysis.isLOS ? 'LOS — Ligne de Vue Dégagée' : 'NLOS — Obstruction Détectée'}
          </div>
          <div className="text-xs text-muted-foreground">
            {analysis.isLOS
              ? `Dégagement min: ${analysis.clearanceMin.toFixed(1)} m`
              : `Obstruction à ${(analysis.obstructionDistance! / 1000).toFixed(2)} km — alt. ${analysis.obstructionAltitude?.toFixed(0)} m`
            }
          </div>
        </div>
      </div>

      {/* Azimuth sector badge */}
      <div className={`flex items-center gap-2 p-2.5 rounded-xl border border-border bg-card`}>
        <Target className={`w-4 h-4 ${sectorInfo.color}`} />
        <span className={`text-xs font-bold ${sectorInfo.color}`}>{sectorInfo.label}</span>
        <span className="ml-auto text-xs text-muted-foreground">ΔAz: {analysis.deltaAzimuth}°</span>
      </div>

      {/* Fresnel status */}
      {fresnel && (
        <div className={`flex items-center gap-3 p-2.5 rounded-xl border ${
          fresnel.isClearFresnel
            ? 'bg-primary/5 border-primary/20'
            : 'bg-amber-500/10 border-amber-500/30'
        }`}>
          {fresnel.isClearFresnel
            ? <CircleDot className="w-4 h-4 text-primary" />
            : <AlertTriangle className="w-4 h-4 text-amber-500" />
          }
          <div>
            <div className={`text-xs font-bold ${fresnel.isClearFresnel ? 'text-primary' : 'text-amber-500'}`}>
              {fresnel.isClearFresnel ? 'Fresnel F1 dégagé' : `Intrusion Fresnel: ${fresnel.maxIntrusionPercent}%`}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {fresnel.isClearFresnel
                ? `Intrusion max: ${fresnel.maxIntrusionPercent}% (<40%)`
                : `Seuil 40% dépassé — dégradation signal probable`
              }
            </div>
          </div>
        </div>
      )}

      {/* Site Info */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-0.5">
        <h4 className="text-xs font-bold text-foreground mb-2 flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-primary" /> Infos Site
        </h4>
        <InfoRow icon={<Signal className="w-3 h-3" />} label="Site" value={site.name} accent />
        <InfoRow icon={<Signal className="w-3 h-3" />} label="Techno" value={`${site.techno} — ${site.bande}`} />
        <InfoRow icon={<Compass className="w-3 h-3" />} label="Azimuth antenne" value={`${site.azimuth}°`} />
        <InfoRow icon={<ArrowUpDown className="w-3 h-3" />} label="HBA" value={`${site.hba} m`} />
        <InfoRow icon={<ArrowUpDown className="w-3 h-3" />} label="Tilt" value={`${site.tilt}°`} />
      </div>

      {/* Metrics */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-0.5">
        <h4 className="text-xs font-bold text-foreground mb-2 flex items-center gap-2">
          <Ruler className="w-3.5 h-3.5 text-primary" /> Métriques RF
        </h4>
        <InfoRow icon={<Ruler className="w-3 h-3" />} label="Distance" value={`${(totalDistance / 1000).toFixed(2)} km`} accent />
        <InfoRow icon={<Mountain className="w-3 h-3" />} label="Alt. terrain max" value={`${analysis.maxTerrainAlt} m`} />
        <InfoRow icon={<Compass className="w-3 h-3" />} label="Azimuth segment" value={`${analysis.segmentAzimuth}°`} />
        <InfoRow icon={<Compass className="w-3 h-3" />} label="ΔAzimuth" value={`${analysis.deltaAzimuth}°`} />
        <InfoRow icon={<Mountain className="w-3 h-3" />} label="Dégagement min" value={`${analysis.clearanceMin.toFixed(1)} m`} warn={analysis.clearanceMin < 0} />
        <InfoRow icon={<Mountain className="w-3 h-3" />} label="Courbure terrestre" value={enableCurvature ? 'k=4/3' : 'Désactivée'} />
        {!analysis.isLOS && (
          <InfoRow icon={<XCircle className="w-3 h-3" />} label="Obstruction à" value={`${(analysis.obstructionDistance! / 1000).toFixed(2)} km`} warn />
        )}
        {fresnel && (
          <InfoRow icon={<CircleDot className="w-3 h-3" />} label="Intrusion Fresnel" value={`${fresnel.maxIntrusionPercent}%`} warn={!fresnel.isClearFresnel} />
        )}
      </div>
    </div>
  );
};

export default InfoPanel;
