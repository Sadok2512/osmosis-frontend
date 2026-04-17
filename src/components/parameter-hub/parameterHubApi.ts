import { supabase } from '@/integrations/supabase/client';

export interface ParameterRow {
  id?: number;
  parameter: string;
  value: string | null;
  site_name: string | null;
  cell_name: string | null;
  cell_dn: string | null;
  dn: string | null;
  vendor: string | null;
  bande: string | null;
  techno?: string | null;
  plaque: string | null;
  dor: string | null;
  zone_arcep: string | null;
  enodeb_id: number | null;
  gnodeb_id: number | null;
  mrbts_id: number | null;
  latitude: number | null;
  longitude: number | null;
  netact: string | null;
  version: string | null;
}

export type AggregationLevel = 'cell' | 'sector' | 'band' | 'site' | 'plaque' | 'dor';

export interface ParameterHubFilters {
  parameters: string[];
  plaque: string[];
  site: string[];
  cell: string[];
  dor: string[];
  zone_arcep: string[];
  vendor: string[];
  techno: string[];
  bande: string[];
}

export const EMPTY_FILTERS: ParameterHubFilters = {
  parameters: [],
  plaque: [],
  site: [],
  cell: [],
  dor: [],
  zone_arcep: [],
  vendor: [],
  techno: [],
  bande: [],
};

const SELECT_COLS =
  'parameter,value,site_name,cell_name,cell_dn,dn,vendor,bande,plaque,dor,zone_arcep,enodeb_id,gnodeb_id,mrbts_id,latitude,longitude,netact,version';

/** Distinct parameters list (for selector). */
export async function fetchAvailableParameters(): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from('parameter_dump')
    .select('parameter')
    .limit(20000);
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r: any) => r.parameter).filter(Boolean))).sort() as string[];
}

/** Distinct values for a single dimension column. */
export async function fetchDistinctValues(column: keyof ParameterRow): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from('parameter_dump')
    .select(column)
    .not(column as string, 'is', null)
    .limit(20000);
  if (error) throw error;
  const set = new Set<string>();
  for (const r of data ?? []) {
    const v = (r as any)[column];
    if (v != null && String(v).trim() !== '') set.add(String(v));
  }
  return Array.from(set).sort();
}

/** Apply filters to the query builder. */
function applyFilters(q: any, f: ParameterHubFilters) {
  if (f.parameters.length) q = q.in('parameter', f.parameters);
  if (f.plaque.length) q = q.in('plaque', f.plaque);
  if (f.site.length) q = q.in('site_name', f.site);
  if (f.cell.length) q = q.in('cell_name', f.cell);
  if (f.dor.length) q = q.in('dor', f.dor);
  if (f.zone_arcep.length) q = q.in('zone_arcep', f.zone_arcep);
  if (f.vendor.length) q = q.in('vendor', f.vendor);
  if (f.bande.length) q = q.in('bande', f.bande);
  return q;
}

/** Fetch raw parameter rows matching the filters. */
export async function fetchParameterRows(
  filters: ParameterHubFilters,
  limit = 5000,
): Promise<ParameterRow[]> {
  let q = (supabase as any).from('parameter_dump').select(SELECT_COLS).limit(limit);
  q = applyFilters(q, filters);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ParameterRow[];
}

/** Fetch rows that have lat/lng for map view. */
export async function fetchParameterMapRows(
  filters: ParameterHubFilters,
  limit = 10000,
): Promise<ParameterRow[]> {
  let q = (supabase as any)
    .from('parameter_dump')
    .select(SELECT_COLS)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .limit(limit);
  q = applyFilters(q, filters);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as ParameterRow[]).filter((r) => r.latitude != null && r.longitude != null);
}
