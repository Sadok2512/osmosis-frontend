import { useState, useCallback } from 'react';
import {
  LatLng, ProfilePoint, LOSAnalysis,
  interpolatePoints, haversineDistance, analyzeLOS
} from '@/utils/geodesicUtils';

const NUM_SAMPLES = 200;

interface TerrainProfileState {
  loading: boolean;
  error: string | null;
  profilePoints: ProfilePoint[];
  analysis: LOSAnalysis | null;
}

/**
 * Fetch elevations from Open-Meteo Elevation API (free, no key needed)
 * API: https://open-meteo.com/en/docs/elevation-api
 * Accepts up to 100 locations per request
 */
async function fetchElevations(points: LatLng[]): Promise<number[]> {
  const batchSize = 100;
  const elevations: number[] = [];

  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    const lats = batch.map(p => p.lat.toFixed(6)).join(',');
    const lngs = batch.map(p => p.lng.toFixed(6)).join(',');
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Elevation API error: ${resp.status}`);
    const data = await resp.json();

    if (data.elevation && Array.isArray(data.elevation)) {
      elevations.push(...data.elevation);
    } else {
      // fallback: fill with 0
      elevations.push(...batch.map(() => 0));
    }
  }

  return elevations;
}

export function useTerrainProfile() {
  const [state, setState] = useState<TerrainProfileState>({
    loading: false,
    error: null,
    profilePoints: [],
    analysis: null,
  });

  const computeProfile = useCallback(async (
    start: LatLng,
    end: LatLng,
    antennaHBA: number,
    antennaTilt: number,
    antennaAzimuth: number,
    enableCurvature: boolean = true,
    kFactor: number = 4 / 3,
  ) => {
    setState({ loading: true, error: null, profilePoints: [], analysis: null });

    try {
      const totalDist = haversineDistance(start, end);
      const points = interpolatePoints(start, end, NUM_SAMPLES);
      const elevations = await fetchElevations(points);

      const profilePoints: ProfilePoint[] = points.map((p, i) => ({
        lat: p.lat,
        lng: p.lng,
        distance: (i / NUM_SAMPLES) * totalDist,
        elevation: elevations[i] ?? 0,
      }));

      const analysis = analyzeLOS(
        profilePoints,
        antennaHBA,
        antennaTilt,
        antennaAzimuth,
        end,
        start,
        enableCurvature,
        kFactor
      );

      setState({ loading: false, error: null, profilePoints, analysis });
    } catch (err: any) {
      setState({
        loading: false,
        error: err.message || 'Erreur lors du calcul du profil terrain',
        profilePoints: [],
        analysis: null,
      });
    }
  }, []);

  return { ...state, computeProfile };
}
