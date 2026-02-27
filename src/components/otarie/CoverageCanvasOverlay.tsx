/**
 * CoverageCanvasOverlay — High-resolution Leaflet canvas overlay for RSRP coverage.
 * Renders with bilinear interpolation for smooth, non-pixelated coverage display.
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

// Parse rgba string to [r, g, b, a]
function parseColor(rgba: string): [number, number, number, number] {
  const m = rgba.match(/[\d.]+/g);
  if (!m || m.length < 4) return [0, 0, 0, 0];
  return [+m[0], +m[1], +m[2], Math.round(+m[3] * 255)];
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

    if (canvasLayerRef.current) {
      map.removeLayer(canvasLayerRef.current);
    }

    const bounds = L.latLngBounds(
      [grid.bounds.minLat, grid.bounds.minLng],
      [grid.bounds.maxLat, grid.bounds.maxLng]
    );

    const gs = grid.params.gridSize + 1;

    // Build a 2D RSRP matrix for interpolation
    const rsrpMatrix: (number | null)[][] = Array.from({ length: gs }, () => Array(gs).fill(null));
    const latStep = (grid.bounds.maxLat - grid.bounds.minLat) / grid.params.gridSize;
    const lngStep = (grid.bounds.maxLng - grid.bounds.minLng) / grid.params.gridSize;

    for (const pt of grid.points) {
      const col = Math.round((pt.lng - grid.bounds.minLng) / lngStep);
      const row = gs - 1 - Math.round((pt.lat - grid.bounds.minLat) / latStep);
      if (col >= 0 && col < gs && row >= 0 && row < gs) {
        rsrpMatrix[row][col] = pt.rsrp;
      }
    }

    // Render at 2x resolution for smoothness
    const scale = 2;
    const canvasW = gs * scale;
    const canvasH = gs * scale;
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      const imgData = ctx.createImageData(canvasW, canvasH);
      const data = imgData.data;

      for (let py = 0; py < canvasH; py++) {
        for (let px = 0; px < canvasW; px++) {
          // Map pixel to grid coordinates
          const gx = (px / scale);
          const gy = (py / scale);
          const gi = Math.floor(gy);
          const gj = Math.floor(gx);
          const fi = gy - gi;
          const fj = gx - gj;

          // Bilinear interpolation of RSRP
          const v00 = rsrpMatrix[gi]?.[gj];
          const v01 = rsrpMatrix[gi]?.[gj + 1];
          const v10 = rsrpMatrix[gi + 1]?.[gj];
          const v11 = rsrpMatrix[gi + 1]?.[gj + 1];

          // Need at least 2 valid neighbors
          const vals = [v00, v01, v10, v11].filter(v => v !== null) as number[];
          if (vals.length < 1) continue;

          let rsrp: number;
          if (v00 !== null && v01 !== null && v10 !== null && v11 !== null) {
            rsrp = v00 * (1 - fi) * (1 - fj) + v01 * (1 - fi) * fj
              + v10 * fi * (1 - fj) + v11 * fi * fj;
          } else {
            rsrp = vals.reduce((a, b) => a + b, 0) / vals.length;
          }

          if (rsrp <= -135) continue;

          const color = rsrpToColor(rsrp, opacity);
          const [r, g, b, a] = parseColor(color);
          const idx = (py * canvasW + px) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = a;
        }
      }

      ctx.putImageData(imgData, 0, 0);
    }

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
