import React, { useMemo, useState } from "react";
import { ArrowRight, ArrowUpDown, Download } from "lucide-react";
import { WorstCell, MetricSpec, ToolbarAction, SendPromptFn } from "./types";

interface Props {
  cells: WorstCell[];
  metric: MetricSpec;
  actions?: ToolbarAction[];
  onSendPrompt?: SendPromptFn;
}

type SortKey = "rank" | "metric_value" | "delta_vs_baseline";

// Couleurs sémantiques — alignées avec design system OSMOSIS.
const SEV_BG: Record<string, string> = {
  critical: "#FCEBEB", severe: "#FAEEDA", warning: "#FAEEDA",
  success: "#E1F5EE", info: "#E6F1FB",
};
const SEV_FG: Record<string, string> = {
  critical: "#A32D2D", severe: "#BA7517", warning: "#BA7517",
  success: "#0F6E56", info: "#185FA5",
};
const SEV_LABEL: Record<string, string> = {
  critical: "Critique", severe: "Sévère", warning: "Avertissement",
  success: "OK", info: "Info",
};

// Build a CSV from the rows for the export action.
function buildCsv(cells: WorstCell[], metric: MetricSpec): string {
  const header = ["rank", "cell_id", "cell_display", "site_id", "lat", "lon",
                  `${metric.name} (${metric.unit})`, "delta_vs_baseline", "vendor", "severity"];
  const lines = [header.join(",")];
  for (const c of cells) {
    lines.push([
      c.rank,
      `"${c.cell_id}"`,
      `"${c.cell_display.replace(/"/g, '""')}"`,
      c.site_id,
      c.coords.lat,
      c.coords.lon,
      c.metric_value,
      c.delta_vs_baseline,
      `"${c.vendor}"`,
      c.severity,
    ].join(","));
  }
  return lines.join("\n");
}

function downloadBlob(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function WorstCellsTable({ cells, metric, actions, onSendPrompt }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const arr = [...cells];
    arr.sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [cells, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "rank" ? "asc" : "desc"); }
  };

  const handleAction = (a: ToolbarAction) => {
    if (a.type === "export_csv") {
      downloadBlob(`worst-cells-${Date.now()}.csv`, buildCsv(sorted, metric));
    } else if (a.type === "prompt" && a.prompt && onSendPrompt) {
      onSendPrompt(a.prompt);
    }
  };

  return (
    <div
      style={{
        background: "var(--bg-primary, #fff)",
        borderRadius: 8,
        border: "0.5px solid var(--border-tertiary, rgba(0,0,0,0.08))",
        overflow: "hidden",
      }}
    >
      {/* Toolbar haut */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px",
          background: "var(--bg-secondary, #F7F7F5)",
          borderBottom: "0.5px solid var(--border-tertiary, rgba(0,0,0,0.08))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-primary, #1A1A1A)" }}>
            {sorted.length} cellule{sorted.length > 1 ? "s" : ""} dégradée{sorted.length > 1 ? "s" : ""}
          </div>
          <span
            style={{
              padding: "2px 8px", borderRadius: 10, fontSize: 10,
              background: "var(--bg-tertiary, #F1EFE8)",
              color: "var(--text-secondary, #5F5E5A)", fontWeight: 500,
            }}
          >
            {metric.name} · {metric.unit} · {metric.direction === "lower_is_better" ? "↓ mieux" : "↑ mieux"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {actions?.map((a, i) => (
            <button
              key={i}
              onClick={() => handleAction(a)}
              aria-label={a.label}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "4px 10px", borderRadius: 5,
                background: "var(--bg-primary, #fff)",
                color: "var(--text-secondary, #5F5E5A)",
                border: "0.5px solid var(--border-secondary, rgba(0,0,0,0.15))",
                fontSize: 10.5, fontWeight: 500, cursor: "pointer",
              }}
            >
              {a.type === "export_csv" && <Download size={11} />}
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%", borderCollapse: "collapse",
            fontFamily: "inherit",
            color: "var(--text-primary, #1A1A1A)",
          }}
        >
          <colgroup>
            <col style={{ width: 36 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 36 }} />
          </colgroup>
          <thead>
            <tr style={{ background: "var(--bg-secondary, #F7F7F5)" }}>
              <Th onClick={() => toggleSort("rank")} sorted={sortKey === "rank"} dir={sortDir} align="center">#</Th>
              <Th>Cellule</Th>
              <Th onClick={() => toggleSort("metric_value")} sorted={sortKey === "metric_value"} dir={sortDir} align="right">{metric.name}</Th>
              <Th onClick={() => toggleSort("delta_vs_baseline")} sorted={sortKey === "delta_vs_baseline"} dir={sortDir} align="right">Δ Baseline</Th>
              <Th>Vendor</Th>
              <Th>Statut</Th>
              <Th align="center" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(c => {
              const isHovered = hoveredRow === c.cell_id;
              const sevFg = SEV_FG[c.severity] ?? SEV_FG.warning;
              const sevBg = SEV_BG[c.severity] ?? SEV_BG.warning;
              const deltaPrefix = c.delta_vs_baseline > 0 ? "+" : (c.delta_vs_baseline < 0 ? "−" : "");
              const deltaAbs = Math.abs(c.delta_vs_baseline);
              return (
                <tr
                  key={c.cell_id}
                  onMouseEnter={() => setHoveredRow(c.cell_id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    background: isHovered ? "var(--bg-secondary, #F7F7F5)" : "transparent",
                    transition: "background 0.12s",
                    borderBottom: "0.5px solid var(--border-tertiary, rgba(0,0,0,0.08))",
                  }}
                >
                  <Td align="center">
                    <span
                      style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 22, height: 22, borderRadius: "50%",
                        background: sevBg, color: sevFg,
                        fontSize: 11, fontWeight: 500, fontVariantNumeric: "tabular-nums",
                      }}
                    >{c.rank}</span>
                  </Td>
                  <Td>
                    <div style={{ fontWeight: 500, fontSize: 12.5 }}>{c.cell_display}</div>
                    <div
                      style={{
                        fontFamily: "'SF Mono', Menlo, monospace",
                        fontSize: 10.5, color: "var(--text-secondary, #5F5E5A)",
                        marginTop: 1,
                      }}
                    >{c.cell_tech_label}</div>
                  </Td>
                  <Td align="right">
                    <span style={{ fontWeight: 500, color: sevFg, fontVariantNumeric: "tabular-nums" }}>
                      {c.metric_value.toFixed(2)}{metric.unit}
                    </span>
                  </Td>
                  <Td align="right">
                    <span style={{ color: sevFg, fontVariantNumeric: "tabular-nums", fontSize: 11.5 }}>
                      {deltaPrefix}{deltaAbs.toFixed(2)}{metric.unit}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ fontSize: 11.5, color: "var(--text-secondary, #5F5E5A)" }}>{c.vendor}</span>
                  </Td>
                  <Td>
                    <span
                      style={{
                        display: "inline-block", padding: "2px 8px", borderRadius: 10,
                        background: sevBg, color: sevFg,
                        fontSize: 10.5, fontWeight: 500,
                      }}
                    >{SEV_LABEL[c.severity] ?? c.severity}</span>
                  </Td>
                  <Td align="center">
                    <button
                      onClick={() => onSendPrompt?.(c.drill_down_prompt)}
                      aria-label={`Audit cellule ${c.cell_display}`}
                      style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 24, height: 24, borderRadius: 5,
                        background: "transparent",
                        border: "0.5px solid var(--border-secondary, rgba(0,0,0,0.15))",
                        color: "var(--text-secondary, #5F5E5A)",
                        cursor: onSendPrompt ? "pointer" : "default",
                      }}
                    ><ArrowRight size={12} /></button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, onClick, sorted, dir, align }: {
  children?: React.ReactNode;
  onClick?: () => void;
  sorted?: boolean;
  dir?: "asc" | "desc";
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      onClick={onClick}
      style={{
        textAlign: align ?? "left",
        padding: "9px 12px",
        fontSize: 10, fontWeight: 500,
        textTransform: "uppercase", letterSpacing: "0.4px",
        color: "var(--text-tertiary, #888780)",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        borderBottom: "0.5px solid var(--border-secondary, rgba(0,0,0,0.15))",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        {children}
        {onClick && <ArrowUpDown size={10} style={{ opacity: sorted ? 0.8 : 0.3 }} />}
        {sorted && <span style={{ fontSize: 9 }}>{dir === "asc" ? "↑" : "↓"}</span>}
      </span>
    </th>
  );
}

function Td({ children, align }: { children?: React.ReactNode; align?: "left" | "right" | "center" }) {
  return (
    <td style={{ padding: "11px 12px", textAlign: align ?? "left", fontSize: 12 }}>
      {children}
    </td>
  );
}
