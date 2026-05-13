import React from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { KPI } from "../lib/types";
import { colors } from "../lib/theme";

export function KPIGrid({ kpis }: { kpis: KPI[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(kpis.length, 4)}, 1fr)`,
        gap: 10,
        marginBottom: 16,
      }}
    >
      {kpis.map((kpi, i) => (
        <KPICard key={i} kpi={kpi} index={i} />
      ))}
    </div>
  );
}

function KPICard({ kpi, index }: { kpi: KPI; index: number }) {
  const statusColors = colors.status[kpi.status];
  const bg = kpi.status === "warning" || kpi.status === "danger" ? statusColors.bg : "var(--bg-secondary)";
  const valueColor = kpi.status === "warning" ? statusColors.fg : kpi.status === "danger" ? statusColors.fg : "var(--text-primary)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
      style={{
        background: bg,
        padding: 12,
        borderRadius: 8,
        border: kpi.status === "warning" ? `0.5px solid ${statusColors.border}` : "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: kpi.status === "warning" ? statusColors.fg : "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          fontWeight: 500,
        }}
      >
        {kpi.label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 500, color: valueColor, margin: "4px 0" }}>
        {kpi.value}
      </div>

      {/* Optional bottom row: progress, sparkline, trend, or context */}
      {kpi.ratio != null && (
        <div style={{ height: 3, background: "var(--bg-tertiary)", borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
          <div
            style={{
              width: `${kpi.ratio * 100}%`,
              height: "100%",
              background: colors.brand.primaryLight,
              borderRadius: 2,
            }}
          />
        </div>
      )}

      {kpi.sparkline && kpi.sparkline.length > 1 && <Sparkline data={kpi.sparkline} />}

      {kpi.trend && !kpi.sparkline && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
          <TrendIcon direction={kpi.trend} />
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>{kpi.trend_value || kpi.trend}</span>
        </div>
      )}

      {kpi.context && !kpi.sparkline && !kpi.ratio && !kpi.trend && (
        <div
          style={{
            fontSize: 10,
            color: kpi.status === "warning" ? statusColors.fg : "var(--text-secondary)",
            marginTop: 6,
          }}
        >
          {kpi.context}
        </div>
      )}
    </motion.div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 100},${14 - ((v - min) / range) * 12}`)
    .join(" ");

  return (
    <svg width="100%" height={14} viewBox="0 0 100 14" style={{ marginTop: 6 }} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={colors.brand.primaryLight} strokeWidth="1.2" />
    </svg>
  );
}

function TrendIcon({ direction }: { direction: "up" | "down" | "stable" }) {
  const size = 11;
  if (direction === "up") return <TrendingUp size={size} color={colors.status.success.fg} />;
  if (direction === "down") return <TrendingDown size={size} color={colors.status.danger.fg} />;
  return <Minus size={size} color="var(--text-secondary)" />;
}
