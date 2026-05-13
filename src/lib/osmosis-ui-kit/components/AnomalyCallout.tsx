import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { Anomaly } from "../lib/types";
import { colors } from "../lib/theme";

interface Props {
  anomalies: Anomaly[];
  onDrillDown?: (prompt: string) => void;
}

export function AnomalyCallout({ anomalies, onDrillDown }: Props) {
  // Pick worst severity for the callout style
  const worstSeverity = anomalies.some((a) => a.severity === "critical")
    ? "critical"
    : anomalies.some((a) => a.severity === "danger")
    ? "danger"
    : "warning";

  const styleColors = worstSeverity === "warning" ? colors.status.warning : colors.status.danger;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        background: styleColors.bg,
        borderRadius: 8,
        padding: "12px 14px",
        borderLeft: `3px solid ${styleColors.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <AlertTriangle size={12} color={styleColors.fg} />
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: styleColors.fg,
            textTransform: "uppercase",
            letterSpacing: "0.3px",
          }}
        >
          Anomalies ({anomalies.length})
        </div>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {anomalies.map((anomaly, i) => (
          <li
            key={i}
            style={{
              fontSize: 12,
              color: styleColors.fg,
              lineHeight: 1.6,
              padding: "4px 0",
              borderTop: i > 0 ? `0.5px solid ${styleColors.border}40` : "none",
            }}
          >
            <div>
              <strong style={{ fontWeight: 500 }}>{anomaly.entity}</strong> : {anomaly.description}
              {anomaly.metric && <span style={{ marginLeft: 4 }}>({anomaly.metric})</span>}
            </div>
            {anomaly.suggested_action && (
              <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>→ {anomaly.suggested_action}</div>
            )}
            {anomaly.drill_down_prompt && onDrillDown && (
              <button
                onClick={() => onDrillDown(anomaly.drill_down_prompt!)}
                style={{
                  background: "transparent",
                  border: `0.5px solid ${styleColors.border}`,
                  color: styleColors.fg,
                  padding: "2px 8px",
                  borderRadius: 10,
                  fontSize: 10,
                  cursor: "pointer",
                  marginTop: 4,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                Investiguer <ArrowRight size={9} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
