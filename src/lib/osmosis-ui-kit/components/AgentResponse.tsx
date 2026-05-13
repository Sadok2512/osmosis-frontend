import React from "react";
import { motion } from "framer-motion";
import type { AgentResponse as AgentResponseType } from "../lib/types";
import { AgentHeader } from "./AgentHeader";
import { TLDR } from "./TLDR";
import { KPIGrid } from "./KPIGrid";
import { ChartRenderer } from "./ChartRenderer";
import { DataTable } from "./DataTable";
import { AnomalyCallout } from "./AnomalyCallout";
import { InsightsCallout } from "./InsightsCallout";
import { FooterActions } from "./FooterActions";

// Re-export for adapter / consumer code that imports `AgentResponseData`.
export type AgentResponseData = AgentResponseType;

interface Props {
  data: AgentResponseType | null;
  onFollowUp?: (prompt: string) => void;
  onExport?: (format: string) => void;
}

/**
 * Top-level renderer for OSMOSIS agent responses.
 * Takes a structured payload (cf. lib/types.ts) and composes the kit.
 */
export function AgentResponse({ data, onFollowUp, onExport }: Props) {
  if (!data) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="osmosis-response"
      style={{
        background: "var(--bg-primary, #ffffff)",
        borderRadius: 12,
        padding: 16,
        marginBottom: 14,
        fontFamily: "-apple-system, 'Segoe UI', Roboto, Inter, sans-serif",
        color: "var(--text-primary, #1A1A1A)",
        border: "0.5px solid var(--border-tertiary, rgba(0,0,0,0.08))",
      }}
    >
      <AgentHeader agent={data.agent} meta={data.query_meta} />

      <TLDR tldr={data.tldr} />

      {data.kpis && data.kpis.length > 0 && <KPIGrid kpis={data.kpis} />}

      {data.visualizations?.map((viz, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <ChartRenderer viz={viz} />
        </div>
      ))}

      {data.table && <DataTable table={data.table} onExport={onExport} />}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: data.anomalies?.length && data.insights?.length ? "1fr 1fr" : "1fr",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {data.anomalies && data.anomalies.length > 0 && (
          <AnomalyCallout anomalies={data.anomalies} onDrillDown={onFollowUp} />
        )}
        {data.insights && data.insights.length > 0 && (
          <InsightsCallout insights={data.insights} onFollowUp={onFollowUp} />
        )}
      </div>

      <FooterActions
        followUps={data.follow_ups || []}
        exports={data.exports || []}
        onFollowUp={onFollowUp}
        onExport={onExport}
      />
    </motion.div>
  );
}

export default AgentResponse;
