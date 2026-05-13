import React from "react";
import { motion } from "framer-motion";
import { WorstCellsResponse, SendPromptFn } from "./types";
import { WorstCellsMap } from "./WorstCellsMap";
import { WorstCellsTable } from "./WorstCellsTable";
import { CommonPatternFooter } from "./CommonPatternFooter";

interface Props {
  data: WorstCellsResponse;
  onSendPrompt?: SendPromptFn;
}

/**
 * Composant racine — affiche un classement "Top N worst cells" avec :
 *  - en-tête (titre + scope + KPI mesuré)
 *  - carte SVG avec markers numérotés et halo pulsant
 *  - tableau professionnel avec tri/hover/drill-down
 *  - footer "pattern commun" optionnel et actionnable
 *
 * À utiliser dans le chat OSMOSIS quand l'agent retourne un bloc
 * ```worst_cells JSON conforme au schéma WorstCellsResponse.
 */
export function WorstCellsView({ data, onSendPrompt }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        background: "var(--bg-primary, #fff)",
        borderRadius: 12,
        border: "0.5px solid var(--border-tertiary, rgba(0,0,0,0.08))",
        padding: 16,
        marginBottom: 14,
        fontFamily: "-apple-system, 'Segoe UI', Roboto, Inter, sans-serif",
        color: "var(--text-primary, #1A1A1A)",
      }}
    >
      {/* En-tête */}
      <div style={{ marginBottom: 12 }}>
        <div style={{
          fontSize: 10, fontWeight: 500,
          color: "var(--text-tertiary, #888780)",
          textTransform: "uppercase", letterSpacing: "0.5px",
          marginBottom: 3,
        }}>
          {data.scope.type === "region" ? "Région" :
           data.scope.type === "cluster" ? "Cluster" : "Site"} · {data.scope.name}
        </div>
        <div style={{ fontSize: 16, fontWeight: 500, color: "var(--text-primary, #1A1A1A)" }}>
          {data.title}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary, #5F5E5A)", marginTop: 2 }}>
          Métrique : <span style={{ fontWeight: 500 }}>{data.metric.name}</span>
          <span> · </span>
          {data.metric.direction === "lower_is_better" ? "valeur basse = meilleur" : "valeur haute = meilleur"}
          <span> · </span>
          seuils {data.metric.thresholds.warning}{data.metric.unit} (warn) /
          {" "}{data.metric.thresholds.severe}{data.metric.unit} (sévère) /
          {" "}{data.metric.thresholds.critical}{data.metric.unit} (critique)
        </div>
      </div>

      {/* Carte */}
      <WorstCellsMap
        map={data.map}
        cells={data.cells}
        onSendPrompt={onSendPrompt}
      />

      {/* Tableau + footer pattern */}
      <div>
        <WorstCellsTable
          cells={data.cells}
          metric={data.metric}
          actions={data.actions}
          onSendPrompt={onSendPrompt}
        />
        {data.common_pattern && (
          <CommonPatternFooter
            pattern={data.common_pattern}
            onSendPrompt={onSendPrompt}
          />
        )}
      </div>
    </motion.div>
  );
}
