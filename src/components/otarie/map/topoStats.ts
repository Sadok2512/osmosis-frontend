/**
 * Network statistics computation from topo rows.
 */
import { is5GTech, is4GTech, is3GTech, is2GTech } from './mapRenderRules';

export interface TopoNetworkStats {
  sites2G: number;
  sites3G: number;
  sites4G: number;
  sites5G: number;
  cells2G: number;
  cells3G: number;
  cells4G: number;
  cells5G: number;
  bandMap2G: Record<string, number>;
  bandMap3G: Record<string, number>;
  bandMap4G: Record<string, number>;
  bandMap5G: Record<string, number>;
  vendorMap: Record<string, { '2G': number; '3G': number; '4G': number; '5G': number }>;
}

export const EMPTY_TOPO_NETWORK_STATS: TopoNetworkStats = {
  sites2G: 0,
  sites3G: 0,
  sites4G: 0,
  sites5G: 0,
  cells2G: 0,
  cells3G: 0,
  cells4G: 0,
  cells5G: 0,
  bandMap2G: {},
  bandMap3G: {},
  bandMap4G: {},
  bandMap5G: {},
  vendorMap: {},
};

export const buildTopoNetworkStatsFromRows = (rows: any[]): TopoNetworkStats => {
  const stats: TopoNetworkStats = {
    ...EMPTY_TOPO_NETWORK_STATS,
    bandMap2G: {},
    bandMap3G: {},
    bandMap4G: {},
    bandMap5G: {},
    vendorMap: {},
  };

  const siteTechMap = new Map<string, { has2G: boolean; has3G: boolean; has4G: boolean; has5G: boolean }>();

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const techno = row?.techno ?? row?.technology ?? row?.rat ?? null;
    const _is5G = is5GTech(techno);
    const _is4G = is4GTech(techno);
    const _is3G = is3GTech(techno);
    const _is2G = is2GTech(techno);
    if (!_is2G && !_is3G && !_is4G && !_is5G) continue;

    const siteKey = String(
      row?.code_nidt ?? row?.nom_site ?? row?.site_name ?? row?.site_id ?? row?.site ?? `site-${index}`,
    );
    const band = String(row?.bande ?? row?.band ?? 'Unknown');
    const vendor = String(row?.constructeur ?? row?.vendor ?? row?.vendor_name ?? 'Unknown');

    const siteEntry = siteTechMap.get(siteKey) ?? { has2G: false, has3G: false, has4G: false, has5G: false };

    if (_is5G) {
      stats.cells5G += 1;
      stats.bandMap5G[band] = (stats.bandMap5G[band] || 0) + 1;
      siteEntry.has5G = true;
    } else if (_is4G) {
      stats.cells4G += 1;
      stats.bandMap4G[band] = (stats.bandMap4G[band] || 0) + 1;
      siteEntry.has4G = true;
    } else if (_is3G) {
      stats.cells3G += 1;
      stats.bandMap3G[band] = (stats.bandMap3G[band] || 0) + 1;
      siteEntry.has3G = true;
    } else if (_is2G) {
      stats.cells2G += 1;
      stats.bandMap2G[band] = (stats.bandMap2G[band] || 0) + 1;
      siteEntry.has2G = true;
    }

    if (!stats.vendorMap[vendor]) {
      stats.vendorMap[vendor] = { '2G': 0, '3G': 0, '4G': 0, '5G': 0 };
    }
    if (_is5G) stats.vendorMap[vendor]['5G'] += 1;
    if (_is4G) stats.vendorMap[vendor]['4G'] += 1;
    if (_is3G) stats.vendorMap[vendor]['3G'] += 1;
    if (_is2G) stats.vendorMap[vendor]['2G'] += 1;

    siteTechMap.set(siteKey, siteEntry);
  }

  siteTechMap.forEach(({ has2G, has3G, has4G, has5G }) => {
    if (has2G) stats.sites2G += 1;
    if (has3G) stats.sites3G += 1;
    if (has4G) stats.sites4G += 1;
    if (has5G) stats.sites5G += 1;
  });

  return stats;
};

/** Infer whether a site has 2G/3G/4G/5G from cells, summary counts, or fallback */
export const inferSiteTechState = (site: {
  cells: { techno?: string | null }[];
  nr_cells?: number;
  lte_cells?: number;
  cells_2g?: number;
  cells_3g?: number;
  techno?: string;
}): { has2G: boolean; has3G: boolean; has4G: boolean; has5G: boolean } => {
  if (site.cells.length > 0) {
    const has5G = site.cells.some(cell => is5GTech(cell.techno));
    const has4G = site.cells.some(cell => is4GTech(cell.techno));
    const has3G = site.cells.some(cell => is3GTech(cell.techno));
    const has2G = site.cells.some(cell => is2GTech(cell.techno));
    return { has2G, has3G, has4G, has5G };
  }

  const nrCells = Number(site.nr_cells || 0);
  const lteCells = Number(site.lte_cells || 0);
  const cells3g = Number((site as any).cells_3g || 0);
  const cells2g = Number((site as any).cells_2g || 0);
  if (nrCells > 0 || lteCells > 0 || cells3g > 0 || cells2g > 0) {
    return { has2G: cells2g > 0, has3G: cells3g > 0, has4G: lteCells > 0, has5G: nrCells > 0 };
  }

  const fallbackTech = String(site.techno || '').toUpperCase();
  const has5G = is5GTech(fallbackTech);
  const has4G = is4GTech(fallbackTech);
  const has3G = is3GTech(fallbackTech);
  const has2G = is2GTech(fallbackTech);

  if (!has2G && !has3G && !has4G && !has5G) return { has2G: false, has3G: false, has4G: true, has5G: false };
  return { has2G, has3G, has4G, has5G };
};
