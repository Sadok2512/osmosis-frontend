import { useMemo } from 'react';
import { ProfilePoint, LOSAnalysis, FresnelAnalysis, analyzeFresnelZone } from '@/utils/geodesicUtils';

/**
 * Hook to compute Fresnel zone analysis from existing profile data
 */
export function useFresnel(
  profilePoints: ProfilePoint[],
  analysis: LOSAnalysis | null,
  totalDistance: number,
  frequencyGHz: number,
  enabled: boolean = true,
): FresnelAnalysis | null {
  return useMemo(() => {
    if (!enabled || !analysis || profilePoints.length === 0 || totalDistance <= 0 || frequencyGHz <= 0) {
      return null;
    }

    return analyzeFresnelZone(
      profilePoints,
      analysis.beamAltitudes,
      analysis.effectiveTerrain,
      totalDistance,
      frequencyGHz,
    );
  }, [profilePoints, analysis, totalDistance, frequencyGHz, enabled]);
}
