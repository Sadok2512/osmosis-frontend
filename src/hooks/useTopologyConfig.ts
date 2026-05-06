/**
 * Topology config hook — single source of business truth on the frontend.
 *
 * The backend exposes `osmosis-parser/config/topology.config.yaml` at
 * GET /api/v1/config/. We fetch it ONCE at app boot, cache it forever (via
 * TanStack Query — staleTime infinity is fine because the config only
 * reloads when the parser process restarts), and consume it everywhere
 * instead of any frontend-side constants file.
 *
 * The companion endpoint /api/v1/config/schema returns the FieldSpec[] read
 * from the active UNIFIED_TEMPLATE — used by TopologyTable to compute its
 * columns and by FilterBar when a filter targets a template field.
 *
 * Adding a new techno / vendor / 3GPP range / cross-field formula is a YAML
 * edit on the backend — the hook auto-picks it up after the parser restart;
 * no frontend redeploy required.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getApiUrl, getVpsProxyHeaders } from '@/lib/apiConfig';
import type {
  TopologyConfig,
  TopologySchemaResponse,
  SectionGroup,
} from '@/types/topologyConfig';

const CONFIG_QUERY_KEY = ['topology', 'config'] as const;
const SCHEMA_QUERY_KEY = ['topology', 'schema'] as const;

async function fetchTopologyConfig(): Promise<TopologyConfig> {
  const url = getApiUrl('config/');
  const resp = await fetch(url, { headers: getVpsProxyHeaders() });
  if (!resp.ok) {
    throw new Error(`Topology config fetch failed: HTTP ${resp.status}`);
  }
  return (await resp.json()) as TopologyConfig;
}

async function fetchTopologySchema(): Promise<TopologySchemaResponse> {
  const url = getApiUrl('config/schema');
  const resp = await fetch(url, { headers: getVpsProxyHeaders() });
  if (!resp.ok) {
    throw new Error(`Topology schema fetch failed: HTTP ${resp.status}`);
  }
  return (await resp.json()) as TopologySchemaResponse;
}

export function useTopologyConfig(): UseQueryResult<TopologyConfig> {
  return useQuery({
    queryKey: CONFIG_QUERY_KEY,
    queryFn: fetchTopologyConfig,
    staleTime: Infinity,             // config only changes on backend restart
    gcTime: Infinity,                // never garbage-collect
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

export function useTopologySchema(): UseQueryResult<TopologySchemaResponse> {
  return useQuery({
    queryKey: SCHEMA_QUERY_KEY,
    queryFn: fetchTopologySchema,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

// ── derived helpers ─────────────────────────────────────────────────────────

/** Map a template section text to a section_groups[].id from the YAML.
 *  Mirrors Config.section_id_for_text in app/config_loader.py. */
export function sectionIdForText(
  cfg: TopologyConfig | undefined,
  sectionText: string,
): string | null {
  if (!cfg || !sectionText) return null;
  const g = cfg.section_groups.find((sg) => sectionText.includes(sg.match));
  return g?.id ?? null;
}

/** Normalize a raw vendor techno label to the canonical bucket (2G/3G/4G/5G/…)
 *  using `techno_aliases` from the YAML. Mirrors Config.techno_normalize. */
export function technoNormalize(
  cfg: TopologyConfig | undefined,
  raw: string | null | undefined,
): string {
  if (!raw) return '';
  if (!cfg) return raw;
  const u = raw.toUpperCase().trim();
  for (const canonical of Object.keys(cfg.techno_aliases)) {
    const aliases = cfg.techno_aliases[canonical] ?? [];
    if (aliases.some((a: string) => a.toUpperCase() === u)) {
      return canonical;
    }
  }
  return raw;
}

/** Filter the section_groups[] keepable for a given techno selection.
 *  Empty selection = all sections (always_visible + every techno block). */
export function activeSectionGroups(
  cfg: TopologyConfig | undefined,
  selectedTechnos: string[],
): SectionGroup[] {
  if (!cfg) return [];
  if (selectedTechnos.length === 0) {
    return cfg.section_groups.filter(
      (g) => g.always_visible || g.techno_filter,
    );
  }
  return cfg.section_groups.filter(
    (g) =>
      g.always_visible ||
      (g.techno_filter && selectedTechnos.includes(g.techno_filter)),
  );
}
