import React from "react";
import { motion } from "framer-motion";
import { Lightbulb, ArrowUpRight } from "lucide-react";
import type { Insight, StatusType } from "../lib/types";
import { colors } from "../lib/theme";

interface Props {
  insights: Insight[];
  onFollowUp?: (prompt: string) => void;
}

// Convert SHOUTY_UNDERSCORE_NAMES to "Title Case With Spaces" for display.
function humanize(name: string): string {
  if (!name) return "";
  if (!/[_]/.test(name) && name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function severityStyles(sev?: StatusType) {
  const s = sev && colors.status[sev] ? colors.status[sev] : colors.status.info;
  return s;
}

export function InsightsCallout({ insights, onFollowUp }: Props) {
  // Split into structured (with items) and legacy (free-text) insights.
  const structured = insights.filter(i => Array.isArray(i.items) && i.items.length > 0);
  const legacy = insights.filter(i => !i.items?.length && (i.text || i.title));

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        background: colors.status.info.bg,
        borderRadius: 8,
        padding: "12px 14px",
        borderLeft: `3px solid ${colors.status.info.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Lightbulb size={12} color={colors.status.info.fg} />
        <div style={{ fontSize: 11, fontWeight: 500, color: colors.status.info.fg, textTransform: "uppercase", letterSpacing: "0.3px" }}>
          Insights clés
        </div>
      </div>

      {/* Structured insights (top-N rankings, findings with drill-down) */}
      {structured.map((ins, i) => (
        <StructuredInsightBlock key={`s-${i}`} insight={ins} onFollowUp={onFollowUp} />
      ))}

      {/* Legacy free-text insights (kept for adapter-derived content) */}
      {legacy.length > 0 && (
        <ul style={{ margin: structured.length ? "10px 0 0 0" : 0, paddingLeft: 16, color: colors.status.info.fg, fontSize: 12, lineHeight: 1.6 }}>
          {legacy.map((insight, i) => (
            <li key={`l-${i}`}>
              {insight.title && <strong>{insight.title}: </strong>}
              {insight.text}
              {insight.metric && typeof insight.metric === "string" && (
                <strong style={{ marginLeft: 4, fontWeight: 500 }}>({insight.metric})</strong>
              )}
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

function StructuredInsightBlock({ insight, onFollowUp }: { insight: Insight; onFollowUp?: (p: string) => void }) {
  const items = insight.items ?? [];
  return (
    <div style={{ marginBottom: 10 }}>
      {(insight.title || insight.subtitle) && (
        <div style={{ marginBottom: 8 }}>
          {insight.title && (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.status.info.fg, marginBottom: 2 }}>
              {insight.title}
            </div>
          )}
          {insight.subtitle && (
            <div style={{ fontSize: 11, color: colors.status.info.fg, opacity: 0.85 }}>
              {insight.subtitle}
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item, i) => (
          <InsightItemRow key={i} item={item} onFollowUp={onFollowUp} />
        ))}
      </div>
      {insight.summary && (
        <div
          style={{
            marginTop: 10, padding: "8px 10px", borderRadius: 6,
            background: "var(--bg-secondary, rgba(255,255,255,0.5))",
            borderLeft: `2px solid ${colors.brand.primary}`,
            fontSize: 11.5, color: "var(--text-primary)",
          }}
        >
          <span style={{ fontWeight: 600, marginRight: 6 }}>{insight.summary.label}:</span>
          <span>{insight.summary.value}</span>
          {insight.summary.drill_down_prompt && onFollowUp && (
            <DrillButton label="Investiguer" prompt={insight.summary.drill_down_prompt} onFollowUp={onFollowUp} />
          )}
        </div>
      )}
    </div>
  );
}

function InsightItemRow({ item, onFollowUp }: { item: NonNullable<Insight["items"]>[number]; onFollowUp?: (p: string) => void }) {
  const sev = severityStyles(item.severity);
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "6px 10px",
        background: "var(--bg-primary, #fff)", borderRadius: 6,
        border: `1px solid ${sev.border}`, borderLeft: `3px solid ${sev.border}`,
      }}
    >
      {item.rank !== undefined && (
        <span
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 22, height: 22, borderRadius: "50%",
            background: sev.bg, color: sev.fg,
            fontSize: 11, fontWeight: 700, flexShrink: 0,
          }}
        >
          {item.rank}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>
          {humanize(item.entity)}
        </div>
        {item.metric && (
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1 }}>
            <span style={{ fontWeight: 500 }}>{item.metric.name}:</span>{" "}
            <span className="osmosis-tnum" style={{ color: sev.fg, fontWeight: 600 }}>
              {item.metric.value}{item.metric.unit ?? ""}
            </span>
            {item.delta_vs_baseline !== undefined && (
              <span style={{ marginLeft: 6, color: "var(--text-tertiary)" }}>
                Δ {item.delta_vs_baseline}
              </span>
            )}
          </div>
        )}
      </div>
      {item.drill_down_prompt && onFollowUp && (
        <DrillButton label="Audit" prompt={item.drill_down_prompt} onFollowUp={onFollowUp} />
      )}
    </div>
  );
}

function DrillButton({ label, prompt, onFollowUp }: { label: string; prompt: string; onFollowUp: (p: string) => void }) {
  return (
    <button
      onClick={() => onFollowUp(prompt)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        padding: "3px 8px", borderRadius: 4,
        background: colors.brand.primaryBg, color: colors.brand.primaryText,
        border: `1px solid ${colors.brand.primaryLight}`,
        fontSize: 10, fontWeight: 600, cursor: "pointer",
        transition: "all .15s",
      }}
      title={prompt}
      onMouseEnter={e => { e.currentTarget.style.background = colors.brand.primary; e.currentTarget.style.color = "#fff"; }}
      onMouseLeave={e => { e.currentTarget.style.background = colors.brand.primaryBg; e.currentTarget.style.color = colors.brand.primaryText; }}
    >
      {label}
      <ArrowUpRight size={10} />
    </button>
  );
}
