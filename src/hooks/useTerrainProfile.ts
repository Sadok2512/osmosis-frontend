import { useState, useCallback } from 'react';
import {
  LatLng, ProfilePoint, LOSAnalysis, AntennaParams,
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
 * Fetch elevations from Open-Meteo Elevation API (free, no key needed).
 * Retries on 429/503 with exponential backoff and caches results so repeated
 * profiles for the same area don't hammer the API.
 */
const elevationCache = new Map<string, number>();
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchBatch(points: LatLng[], attempt = 0): Promise<number[]> {
  const lats = points.map(p => p.lat.toFixed(5)).join(',');
  const lngs = points.map(p => p.lng.toFixed(5)).join(',');
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;

  const resp = await fetch(url);
  if (resp.status === 429 || resp.status === 503) {
    if (attempt < 4) {
      await sleep(800 * Math.pow(2, attempt) + Math.random() * 400);
      return fetchBatch(points, attempt + 1);
    }
    console.warn('[Elevation] rate-limited, falling back to flat terrain');
    return points.map(() => 0);
  }
  if (!resp.ok) throw new Error(`Elevation API error: ${resp.status}`);
  const data = await resp.json();
  if (data.elevation && Array.isArray(data.elevation)) return data.elevation;
  return points.map(() => 0);
}

async function fetchElevations(points: LatLng[]): Promise<number[]> {
  const batchSize = 100;
  const elevations: number[] = new Array(points.length);
  const toFetch: { idx: number; pt: LatLng }[] = [];

  points.forEach((p, idx) => {
    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    if (elevationCache.has(key)) elevations[idx] = elevationCache.get(key)!;
    else toFetch.push({ idx, pt: p });
  });

  for (let i = 0; i < toFetch.length; i += batchSize) {
    const slice = toFetch.slice(i, i + batchSize);
    const elevs = await fetchBatch(slice.map(s => s.pt));
    slice.forEach((s, j) => {
      const v = elevs[j] ?? 0;
      elevations[s.idx] = v;
      const key = `${s.pt.lat.toFixed(4)},${s.pt.lng.toFixed(4)}`;
      elevationCache.set(key, v);
    });
    if (i + batchSize < toFetch.length) await sleep(250);
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
    antenna: AntennaParams,
    enableCurvature: boolean = true,
    kFactor: number = 4 / 3,
  ) => {
    setState({ loading: true, error: null, profilePoints: [], analysis: null });

    try {
      const totalDist = haversineDistance(start, end);
      const points = interpolatePoints(start, end, NUM_SAMPLES);
      const elevations = await fetchElevations(points);

      // Set site altitude from DEM (first point)
      const siteAltitude = elevations[0] ?? 0;
      const updatedAntenna: AntennaParams = {
        ...antenna,
        siteAltitude,
        antennaAMSL: siteAltitude + antenna.hba,
      };

      const profilePoints: ProfilePoint[] = points.map((p, i) => ({
        lat: p.lat,
        lng: p.lng,
        distance: (i / NUM_SAMPLES) * totalDist,
        elevation: elevations[i] ?? 0,
      }));

      const analysis = analyzeLOS(
        profilePoints,
        updatedAntenna,
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
