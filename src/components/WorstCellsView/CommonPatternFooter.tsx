import React from "react";
import { ArrowUpRight } from "lucide-react";
import { CommonPattern, SendPromptFn } from "./types";

interface Props {
  pattern: CommonPattern;
  onSendPrompt?: SendPromptFn;
}

const STYLES: Record<string, { bg: string; fg: string; border: string }> = {
  warning: { bg: "#FAEEDA", fg: "#BA7517", border: "#EF9F27" },
  danger:  { bg: "#FCEBEB", fg: "#A32D2D", border: "#E24B4A" },
  info:    { bg: "#E6F1FB", fg: "#185FA5", border: "#378ADD" },
};

export function CommonPatternFooter({ pattern, onSendPrompt }: Props) {
  const s = STYLES[pattern.severity] ?? STYLES.info;
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "9px 14px",
        background: s.bg,
        borderLeft: `3px solid ${s.border}`,
        borderRadius: "0 0 8px 8px",
        marginTop: -1,
      }}
    >
      <div style={{ flex: 1, fontSize: 11.5, color: s.fg }}>
        <span style={{ fontWeight: 500 }}>{pattern.label} :</span>{" "}
        <span>{pattern.description}</span>
      </div>
      {pattern.drill_down_prompt && onSendPrompt && (
        <button
          onClick={() => onSendPrompt(pattern.drill_down_prompt)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 5,
            background: s.fg, color: "#fff",
            border: "none",
            fontSize: 10.5, fontWeight: 500, cursor: "pointer",
          }}
        >
          Investiguer <ArrowUpRight size={11} />
        </button>
      )}
    </div>
  );
}
