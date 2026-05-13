import React, { useMemo } from "react";
import { motion } from "framer-motion";
import {
  WorstCell, MapSpec, SendPromptFn,
  computeBoundsFromCells, projectCoords,
} from "./types";

interface Props {
  map: MapSpec;
  cells: WorstCell[];
  /** Optional pseudo-random "healthy" sites for context (small dots in background). */
  healthySitesPseudo?: Array<{ lat: number; lon: number }>;
  onSendPrompt?: SendPromptFn;
}

const SVG_W = 720;
const SVG_H = 300;

// Couleurs sévérité — alignées avec le design system OSMOSIS.
const SEVERITY_COLOR: Record<string, { fill: string; halo: string }> = {
  critical: { fill: "#A32D2D", halo: "#E24B4A" },
  severe:   { fill: "#BA7517", halo: "#EF9F27" },
  warning:  { fill: "#BA7517", halo: "#EF9F27" },
  success:  { fill: "#0F6E56", halo: "#1D9E75" },
  info:     { fill: "#185FA5", halo: "#378ADD" },
};

export function WorstCellsMap({ map, cells, healthySitesPseudo, onSendPrompt }: Props) {
  const bounds = useMemo(
    () => map.bounds ?? computeBoundsFromCells(cells),
    [map.bounds, cells],
  );

  const projected = useMemo(
    () => cells.map(c => ({
      cell: c,
      pos: projectCoords(c.coords.lat, c.coords.lon, bounds, SVG_W, SVG_H),
    })),
    [cells, bounds],
  );

  // Pseudo-healthy sites scattered for context — only used if real data not provided.
  const healthyPositions = useMemo(() => {
    if (healthySitesPseudo && healthySitesPseudo.length) {
      return healthySitesPseudo.map(s => projectCoords(s.lat, s.lon, bounds, SVG_W, SVG_H));
    }
    // Generate ~min(healthy_sites_count, 80) deterministic dots in bounds for visual filler.
    const count = Math.min(map.healthy_sites_count, 80);
    const out: { x: number; y: number }[] = [];
    let seed = 1;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < count; i++) {
      out.push({ x: 20 + rand() * (SVG_W - 40), y: 20 + rand() * (SVG_H - 40) });
    }
    return out;
  }, [healthySitesPseudo, map.healthy_sites_count, bounds]);

  return (
    <div
      style={{
        position: "relative",
        background: "var(--bg-tertiary, #F1EFE8)",
        borderRadius: 8,
        border: "0.5px solid var(--border-tertiary, rgba(0,0,0,0.08))",
        overflow: "hidden",
        marginBottom: 12,
      }}
    >
      {/* Toolbar haut */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px",
          background: "var(--bg-primary, #fff)",
          borderBottom: "0.5px solid var(--border-tertiary, rgba(0,0,0,0.08))",
        }}
      >
        <div style={{ fontSize: 11, color: "var(--text-secondary, #5F5E5A)", fontWeight: 500 }}>
          Carte des cellules dégradées
        </div>
        <div style={{ fontSize: 10, color: "var(--text-tertiary, #888780)" }}>
          zoom {map.zoom} · centre {map.center.lat.toFixed(3)}, {map.center.lon.toFixed(3)}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", width: "100%", height: SVG_H }}
        aria-label="Carte des cellules"
      >
        {/* Sites sains (contexte, opacity faible) */}
        {healthyPositions.map((p, i) => (
          <circle
            key={`h-${i}`} cx={p.x} cy={p.y} r={3.2}
            fill="#1D9E75" opacity={0.4}
          />
        ))}

        {/* Worst cells avec halo pulsant + numéro */}
        {projected.map(({ cell, pos }) => {
          const c = SEVERITY_COLOR[cell.severity] ?? SEVERITY_COLOR.warning;
          const delay = (cell.rank - 1) * 0.15;
          return (
            <g
              key={cell.cell_id}
              onClick={onSendPrompt ? () => onSendPrompt(cell.drill_down_prompt) : undefined}
              style={{ cursor: onSendPrompt ? "pointer" : "default" }}
              aria-label={`${cell.rank}. ${cell.cell_display} — ${cell.metric_value}`}
            >
              {/* Halo pulsant */}
              <motion.circle
                cx={pos.x} cy={pos.y}
                r={16}
                fill={c.halo}
                initial={{ opacity: 0.2, r: 16 }}
                animate={{ opacity: [0.2, 0.05, 0.2], r: [16, 24, 16] }}
                transition={{
                  duration: 2, repeat: Infinity, delay,
                  ease: "easeInOut",
                }}
              />
              {/* Marker plein */}
              <circle cx={pos.x} cy={pos.y} r={11} fill={c.fill} stroke="#fff" strokeWidth={1.5} />
              <text
                x={pos.x} y={pos.y + 3.5}
                textAnchor="middle"
                fontSize={10.5}
                fontWeight={500}
                fill="#fff"
                style={{ pointerEvents: "none", fontVariantNumeric: "tabular-nums" }}
              >
                {cell.rank}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Légende en bas-gauche */}
      <div
        style={{
          position: "absolute", bottom: 10, left: 10,
          background: "var(--bg-primary, #fff)",
          padding: "8px 10px", borderRadius: 6,
          border: "0.5px solid var(--border-tertiary, rgba(0,0,0,0.08))",
          fontSize: 10,
          color: "var(--text-secondary, #5F5E5A)",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 3 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 50, background: "#A32D2D" }} />
          <span>Critique</span>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 50, background: "#BA7517", marginLeft: 4 }} />
          <span>Sévère</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 50, background: "#1D9E75", opacity: 0.5 }} />
          <span>{map.healthy_sites_count} sites sains</span>
        </div>
      </div>
    </div>
  );
}
