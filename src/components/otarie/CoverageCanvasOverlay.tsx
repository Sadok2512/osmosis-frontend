/**
 * CoverageCanvasOverlay — Leaflet canvas overlay rendering RSRP coverage heatmap.
 * Uses L.Canvas for pixel-level rendering directly on the map.
 */
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { CoverageGrid, rsrpToColor } from '@/services/propagationEngine';

interface CoverageCanvasOverlayProps {
  grid: CoverageGrid | null;
  opacity?: number;
  visible?: boolean;
}

const CoverageCanvasOverlay: React.FC<CoverageCanvasOverlayProps> = ({ grid, opacity = 0.55, visible = true }) => {
  const map = useMap();
  const canvasLayerRef = useRef<any>(null);

  useEffect(() => {
    if (!grid || !visible) {
      if (canvasLayerRef.current) {
        map.removeLayer(canvasLayerRef.current);
        canvasLayerRef.current = null;
      }
      return;
    }

    // Remove old layer
    if (canvasLayerRef.current) {
      map.removeLayer(canvasLayerRef.current);
    }

    // Create a custom canvas overlay using L.CanvasOverlay pattern
    const bounds = L.latLngBounds(
      [grid.bounds.minLat, grid.bounds.minLng],
      [grid.bounds.maxLat, grid.bounds.maxLng]
    );

    // Create a canvas element
    const canvas = document.createElement('canvas');
    const gridSize = grid.params.gridSize + 1;
    canvas.width = gridSize;
    canvas.height = gridSize;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // Draw each point as a pixel
      const latStep = (grid.bounds.maxLat - grid.bounds.minLat) / grid.params.gridSize;
      const lngStep = (grid.bounds.maxLng - grid.bounds.minLng) / grid.params.gridSize;

      for (const pt of grid.points) {
        const col = Math.round((pt.lng - grid.bounds.minLng) / lngStep);
        const row = gridSize - 1 - Math.round((pt.lat - grid.bounds.minLat) / latStep);

        if (col >= 0 && col < gridSize && row >= 0 && row < gridSize) {
          // Filter out very weak signals for cleaner look
          if (pt.rsrp > -130) {
            ctx.fillStyle = rsrpToColor(pt.rsrp, opacity);
            // Draw a slightly larger pixel for better visual coverage
            ctx.fillRect(col, row, 1, 1);
          }
        }
      }
    }

    // Use L.ImageOverlay with the canvas as data URL
    const dataUrl = canvas.toDataURL();
    const imageOverlay = L.imageOverlay(dataUrl, bounds, {
      opacity: 1,
      interactive: false,
      zIndex: 400,
    });

    imageOverlay.addTo(map);
    canvasLayerRef.current = imageOverlay;

    return () => {
      if (canvasLayerRef.current) {
        map.removeLayer(canvasLayerRef.current);
        canvasLayerRef.current = null;
      }
    };
  }, [grid, map, opacity, visible]);

  return null;
};

export default CoverageCanvasOverlay;
