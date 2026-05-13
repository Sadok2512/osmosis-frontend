import React from "react";
import type { AgentName, QueryMeta } from "../lib/types";
import { agentTheme } from "../lib/theme";

export function AgentHeader({ agent, meta }: { agent: AgentName; meta: QueryMeta }) {
  const theme = agentTheme[agent];
  const confidencePct = Math.round(meta.confidence * 100);
  const confidenceStatus = confidencePct >= 95 ? "success" : confidencePct >= 80 ? "warning" : "danger";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 14,
        paddingBottom: 12,
        borderBottom: "0.5px solid var(--border-tertiary)",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            background: theme.color,
            color: "white",
            padding: "4px 11px",
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span>{theme.icon}</span> {agent}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {theme.label} · {meta.duration_ms}ms
          {meta.version && ` · ${meta.version}`}
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span
          style={{
            fontSize: 11,
            color: `var(--status-${confidenceStatus}-fg)`,
            background: `var(--status-${confidenceStatus}-bg)`,
            padding: "3px 8px",
            borderRadius: 10,
            fontWeight: 500,
          }}
        >
          {confidencePct}% confiance
        </span>
        {meta.source && (
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>📂 {meta.source}</span>
        )}
      </div>
    </div>
  );
}
