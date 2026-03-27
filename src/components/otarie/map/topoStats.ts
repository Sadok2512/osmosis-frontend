/**
 * Network statistics computation from topo rows.
 */
import { is5GTech, is4GTech } from './mapRenderRules';

export interface TopoNetworkStats {
  sites4G: number;
  sites5G: number;
  cells4G: number;
  cells5G: number;
  bandMap4G: Record<string, number>;
  bandMap5G: Record<string, number>;
  vendorMap: Record<string, { '4G': number; '5G': number }>;
}

export const EMPTY_TOPO_NETWORK_STATS: TopoNetworkStats = {
  sites4G: 0,
  sites5G: 0,
  cells4G: 0,
  cells5G: 0,
  bandMap4G: {},
  bandMap5G: {},
  vendorMap: {},
};

export const buildTopoNetworkStatsFromRows = (rows: any[]): TopoNetworkStats => {
  const stats: TopoNetworkStats = {
    ...EMPTY_TOPO_NETWORK_STATS,
    bandMap4G: {},
    bandMap5G: {},
    vendorMap: {},
  };

  const siteTechMap = new Map<string, { has4G: boolean; has5G: boolean }>();

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const techno = row?.techno ?? row?.technology ?? row?.rat ?? null;
    const is5G = is5GTech(techno);
    const is4G = is4GTech(techno);
    if (!is4G && !is5G) continue;

    const siteKey = String(
      row?.code_nidt ?? row?.nom_site ?? row?.site_name ?? row?.site_id ?? row?.site ?? `site-${index}`,
    );
    const band = String(row?.bande ?? row?.band ?? 'Unknown');
    const vendor = String(row?.constructeur ?? row?.vendor ?? row?.vendor_name ?? 'Unknown');

    const siteEntry = siteTechMap.get(siteKey) ?? { has4G: false, has5G: false };

    if (is5G) {
      stats.cells5G += 1;
      stats.bandMap5G[band] = (stats.bandMap5G[band] || 0) + 1;
      siteEntry.has5G = true;
    } else {
      stats.cells4G += 1;
      stats.bandMap4G[band] = (stats.bandMap4G[band] || 0) + 1;
      siteEntry.has4G = true;
    }

    if (!stats.vendorMap[vendor]) {
      stats.vendorMap[vendor] = { '4G': 0, '5G': 0 };
    }
    if (is5G) stats.vendorMap[vendor]['5G'] += 1;
    if (is4G) stats.vendorMap[vendor]['4G'] += 1;

    siteTechMap.set(siteKey, siteEntry);
  }

  siteTechMap.forEach(({ has4G, has5G }) => {
    if (has4G) stats.sites4G += 1;
    if (has5G) stats.sites5G += 1;
  });

  return stats;
};

/** Infer whether a site has 4G/5G from cells, summary counts, or fallback */
export const inferSiteTechState = (site: {
  cells: { techno?: string | null }[];
  nr_cells?: number;
  lte_cells?: number;
  techno?: string;
}): { has4G: boolean; has5G: boolean } => {
  if (site.cells.length > 0) {
    const has5G = site.cells.some(cell => is5GTech(cell.techno));
    const has4G = site.cells.some(cell => is4GTech(cell.techno));
    return { has4G, has5G };
  }

  const nrCells = Number(site.nr_cells || 0);
  const lteCells = Number(site.lte_cells || 0);
  if (nrCells > 0 || lteCells > 0) {
    return { has4G: lteCells > 0, has5G: nrCells > 0 };
  }

  const fallbackTech = String(site.techno || '').toUpperCase();
  const has5G = is5GTech(fallbackTech);
  const has4G = is4GTech(fallbackTech);

  if (!has4G && !has5G) return { has4G: true, has5G: false };
  return { has4G, has5G };
};
