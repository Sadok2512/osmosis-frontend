import React from "react";
import { Download, FileText, Share2 } from "lucide-react";
import type { FollowUp } from "../lib/types";

interface Props {
  followUps: FollowUp[];
  exports: string[];
  onFollowUp?: (prompt: string) => void;
  onExport?: (format: string) => void;
}

export function FooterActions({ followUps, exports, onFollowUp, onExport }: Props) {
  if (followUps.length === 0 && exports.length === 0) return null;

  return (
    <div
      style={{
        borderTop: "0.5px solid var(--border-tertiary)",
        paddingTop: 12,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {followUps.map((followUp, i) => (
          <button
            key={i}
            onClick={() => onFollowUp?.(followUp.prompt)}
            style={{
              background: "var(--bg-primary)",
              border: "0.5px solid var(--border-secondary)",
              borderRadius: 14,
              padding: "5px 11px",
              fontSize: 11,
              cursor: "pointer",
              color: "var(--text-primary)",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-secondary)";
              e.currentTarget.style.borderColor = "var(--border-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-primary)";
              e.currentTarget.style.borderColor = "var(--border-secondary)";
            }}
          >
            {followUp.icon || "→"} {followUp.label}
          </button>
        ))}
      </div>

      {exports.length > 0 && (
        <div style={{ display: "flex", gap: 4 }}>
          {exports.includes("csv") && (
            <ExportButton icon={<Download size={11} />} label="CSV" onClick={() => onExport?.("csv")} />
          )}
          {exports.includes("pdf") && (
            <ExportButton icon={<FileText size={11} />} label="PDF" onClick={() => onExport?.("pdf")} />
          )}
          <ExportButton icon={<Share2 size={11} />} label="" onClick={() => onExport?.("share")} title="Partager" />
        </div>
      )}
    </div>
  );
}

function ExportButton({
  icon,
  label,
  onClick,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: "var(--bg-secondary)",
        border: "0.5px solid var(--border-tertiary)",
        padding: "5px 8px",
        borderRadius: 4,
        fontSize: 11,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {icon} {label}
    </button>
  );
}
