/**
 * PciOverlayAdapter — React/react-leaflet bridge for the PCI Overlay
 * drop-in JS module (src/coverage/pci-overlay-layer.js).
 *
 * Mirror du VisualCoverageAdapter. Différences :
 *   - Module : initPciOverlay (PCI mod 3 / hash colors par bande)
 *   - Inputs : `band` requis ; quand absent → overlay vide (empty state)
 *   - Fetch : réutilise /api/v1/topo/cells-for-coverage (champs pci + band
 *             ajoutés 2026-05-18). Cache `_coverageCellsCache` partagé
 *             avec VisualCoverageAdapter via topoService.ts.
 *
 * Mutex KPI/PCI : géré côté parent (radio button), pas ici. Si les deux
 * sont actifs simultanément, les deux layers Leaflet superposent leurs
 * polygones — le parent doit empêcher ce cas.
 */
import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { fetchCellsForCoverage, CoverageCell } from '@/services/topoService';
import { initPciOverlay } from '@/coverage/pci-overlay-layer.js';

interface Bounds { minLng: number; minLat: number; maxLng: number; maxLat: number; }

interface Props {
  enabled: boolean;
  /** Bande LTE/NR sélectionnée. Quand undefined ou vide, l'overlay
   *  ne rend rien (empty state — l'utilisateur doit choisir une bande). */
  band: string | undefined;
  /** 'mod3' (défaut) ou 'hash' — voir pci-overlay.js. */
  colorMode?: 'mod3' | 'hash';
  /** Optionnel — DOM node où le module accroche son panel UI
   *  (toggle on/off, band pills, colorMode toggle, légende). */
  panelMount: HTMLElement | null;
  /** Viewport bbox. */
  bbox: Bounds | null;
  /** Scope (plaque/dor/cluster) — forwardé au backend pour réduire
   *  le payload AVANT le filtre band côté browser. */
  techno?: string;
  vendor?: string;
  /** Sync React state quand l'utilisateur interagit avec le panel JS. */
  onEnabledChange?: (enabled: boolean) => void;
  onBandChange?: (band: string) => void;
  onColorModeChange?: (mode: 'mod3' | 'hash') => void;
  onCellsLoaded?: (count: number) => void;
  onError?: (message: string) => void;
}

const PciOverlayAdapter: React.FC<Props> = ({
  enabled,
  band,
  colorMode = 'mod3',
  panelMount,
  bbox,
  techno,
  vendor,
  onEnabledChange,
  onBandChange,
  onColorModeChange,
  onCellsLoaded,
  onError,
}) => {
  const map = useMap();
  const ctlRef = useRef<any>(null);

  // Refs kept stable so the module callbacks (created once at init)
  // always see the latest parent callback even if the parent re-renders.
  const onEnabledRef = useRef(onEnabledChange);
  const onBandRef = useRef(onBandChange);
  const onModeRef = useRef(onColorModeChange);
  useEffect(() => { onEnabledRef.current = onEnabledChange; }, [onEnabledChange]);
  useEffect(() => { onBandRef.current = onBandChange; }, [onBandChange]);
  useEffect(() => { onModeRef.current = onColorModeChange; }, [onColorModeChange]);

  // ── init / teardown ──
  useEffect(() => {
    if (!map) return;
    const ctl = initPciOverlay({
      map,
      cells: [] as CoverageCell[],
      panelMount: panelMount ?? undefined,
      defaultEnabled: false, // setEnabled effect drives the real state
      // Le module gère son propre state interactif. On capte les events
      // pour les remonter au React parent (mutex KPI + persistance).
      onEnabledChange: (flag: boolean) => { onEnabledRef.current?.(flag); },
      onBandChange:    (b: string) => { onBandRef.current?.(b); },
      onColorModeChange: (m: 'mod3' | 'hash') => { onModeRef.current?.(m); },
    });
    ctlRef.current = ctl;
    return () => {
      try { ctl.destroy(); } catch { /* swallow */ }
      ctlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, panelMount]);

  // ── enabled flag drives module on/off ──
  // Le module accepte enabled=true sans bande : il affiche les pills
  // disponibles dérivées des cells. La géométrie ne rend qu'une fois
  // qu'une bande est choisie (pci-overlay.js throw si view.band est vide).
  useEffect(() => {
    ctlRef.current?.setEnabled?.(enabled);
  }, [enabled]);

  // ── view changes (band, colorMode) propagated to module ──
  useEffect(() => {
    if (!ctlRef.current) return;
    if (!band) {
      ctlRef.current.setView?.(null);
      return;
    }
    ctlRef.current.setView?.({ band, colorMode });
  }, [band, colorMode]);

  // ── fetch cells when needed ──
  // On fetch dès que le toggle est ON, même sans bande sélectionnée —
  // le module a besoin de la liste pour calculer les pills disponibles.
  // Quand une bande est choisie, le param `band` réduit le payload.
  useEffect(() => {
    if (!enabled || !bbox || !ctlRef.current) return;
    const ctrl = new AbortController();
    fetchCellsForCoverage(bbox, {
      techno,
      vendor,
      ...(band ? { band } : {}),
      signal: ctrl.signal,
    } as any)
      .then(({ cells }) => {
        ctlRef.current?.setCells?.(cells);
        onCellsLoaded?.(cells.length);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        const msg = err?.message || String(err);
        // eslint-disable-next-line no-console
        console.warn('[PciOverlayAdapter] fetch failed:', msg);
        onError?.(msg);
      });
    return () => ctrl.abort();
  }, [enabled, band, bbox?.minLng, bbox?.minLat, bbox?.maxLng, bbox?.maxLat, techno, vendor]);

  return null;
};

export default PciOverlayAdapter;
