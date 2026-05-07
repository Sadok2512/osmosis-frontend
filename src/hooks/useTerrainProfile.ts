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

// Returns null entries when no data could be obtained (so we don't poison cache).
async function fetchOpenMeteo(points: LatLng[], attempt = 0): Promise<(number | null)[]> {
  const lats = points.map(p => p.lat.toFixed(5)).join(',');
  const lngs = points.map(p => p.lng.toFixed(5)).join(',');
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;
  try {
    const resp = await fetch(url);
    if (resp.status === 429 || resp.status === 503) {
      if (attempt < 3) {
        await sleep(700 * Math.pow(2, attempt) + Math.random() * 300);
        return fetchOpenMeteo(points, attempt + 1);
      }
      return points.map(() => null);
    }
    if (!resp.ok) return points.map(() => null);
    const data = await resp.json();
    if (data.elevation && Array.isArray(data.elevation)) {
      return data.elevation.map((v: any) => (typeof v === 'number' ? v : null));
    }
    return points.map(() => null);
  } catch {
    return points.map(() => null);
  }
}

// Fallback: open-elevation.com (POST, supports up to ~100 locations).
async function fetchOpenElevation(points: LatLng[]): Promise<(number | null)[]> {
  try {
    const resp = await fetch('https://api.open-elevation.com/api/v1/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: points.map(p => ({ latitude: p.lat, longitude: p.lng })) }),
    });
    if (!resp.ok) return points.map(() => null);
    const data = await resp.json();
    if (Array.isArray(data?.results)) {
      return data.results.map((r: any) => (typeof r?.elevation === 'number' ? r.elevation : null));
    }
    return points.map(() => null);
  } catch {
    return points.map(() => null);
  }
}

async function fetchBatch(points: LatLng[]): Promise<(number | null)[]> {
  const primary = await fetchOpenMeteo(points);
  const missing = primary.some(v => v === null);
  if (!missing) return primary;
  // Only refetch the missing ones via fallback
  const missingIdx: number[] = [];
  primary.forEach((v, i) => { if (v === null) missingIdx.push(i); });
  const fallback = await fetchOpenElevation(missingIdx.map(i => points[i]));
  missingIdx.forEach((i, j) => { primary[i] = fallback[j]; });
  return primary;
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

  let anyFetched = false;
  for (let i = 0; i < toFetch.length; i += batchSize) {
    const slice = toFetch.slice(i, i + batchSize);
    const elevs = await fetchBatch(slice.map(s => s.pt));
    slice.forEach((s, j) => {
      const v = elevs[j];
      if (typeof v === 'number') {
        elevations[s.idx] = v;
        // ONLY cache real values, never fallback zeros
        const key = `${s.pt.lat.toFixed(4)},${s.pt.lng.toFixed(4)}`;
        elevationCache.set(key, v);
        anyFetched = true;
      } else {
        elevations[s.idx] = NaN;
      }
    });
    if (i + batchSize < toFetch.length) await sleep(250);
  }

  // If everything failed, surface the error
  if (toFetch.length > 0 && !anyFetched && elevations.every(v => Number.isNaN(v))) {
    throw new Error('Elevation services unavailable (Open-Meteo + Open-Elevation). Try again in a moment.');
  }

  // Replace any remaining NaN with linear interpolation between known neighbours
  for (let i = 0; i < elevations.length; i++) {
    if (!Number.isNaN(elevations[i])) continue;
    let prev = i - 1, next = i + 1;
    while (prev >= 0 && Number.isNaN(elevations[prev])) prev--;
    while (next < elevations.length && Number.isNaN(elevations[next])) next++;
    const pv = prev >= 0 ? elevations[prev] : null;
    const nv = next < elevations.length ? elevations[next] : null;
    if (pv != null && nv != null) elevations[i] = pv + (nv - pv) * ((i - prev) / (next - prev));
    else if (pv != null) elevations[i] = pv;
    else if (nv != null) elevations[i] = nv;
    else elevations[i] = 0;
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
