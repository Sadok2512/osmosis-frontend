import { useMemo } from 'react';
import { ProfilePoint, LOSAnalysis, analyzeLOS, LatLng } from '@/utils/geodesicUtils';

/**
 * Hook wrapping LOS analysis for reactive recomputation
 */
export function useLOSComputation(
  profilePoints: ProfilePoint[],
  antennaHBA: number,
  antennaTilt: number,
  antennaAzimuth: number,
  targetPoint: LatLng | null,
  startPoint: LatLng | null,
  enableCurvature: boolean = true,
  kFactor: number = 4 / 3,
): LOSAnalysis | null {
  return useMemo(() => {
    if (!startPoint || !targetPoint || profilePoints.length === 0) return null;

    return analyzeLOS(
      profilePoints,
      antennaHBA,
      antennaTilt,
      antennaAzimuth,
      targetPoint,
      startPoint,
      enableCurvature,
      kFactor,
    );
  }, [profilePoints, antennaHBA, antennaTilt, antennaAzimuth, targetPoint, startPoint, enableCurvature, kFactor]);
}
