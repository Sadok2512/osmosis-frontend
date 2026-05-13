import React from "react";
import type { TLDR as TLDRType } from "../lib/types";
import { colors } from "../lib/theme";

export function TLDR({ tldr }: { tldr: TLDRType }) {
  return (
    <div
      style={{
        background: `linear-gradient(90deg, ${colors.brand.primaryBg} 0%, transparent 100%)`,
        borderLeft: `3px solid ${colors.brand.primary}`,
        padding: "10px 14px",
        borderRadius: "0 6px 6px 0",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: colors.brand.primaryText,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          marginBottom: 4,
        }}
      >
        Réponse en bref
      </div>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--text-primary)" }}>
        <strong style={{ fontWeight: 500 }}>{tldr.headline}</strong>
        {tldr.highlights.length > 0 && " · "}
        {tldr.highlights.map((h, i) => (
          <React.Fragment key={i}>
            <HighlightTag highlight={h} />
            {i < tldr.highlights.length - 1 && " · "}
          </React.Fragment>
        ))}
      </p>
    </div>
  );
}

function HighlightTag({ highlight }: { highlight: TLDRType["highlights"][0] }) {
  const color = highlight.type === "warning"
    ? colors.status.warning.fg
    : highlight.type === "danger"
    ? colors.status.danger.fg
    : highlight.type === "success"
    ? colors.status.success.fg
    : highlight.type === "info"
    ? colors.status.info.fg
    : "var(--text-secondary)";

  return <span style={{ color, fontWeight: 500 }}>{highlight.label}</span>;
}
