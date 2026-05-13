// OSMOSIS Design Tokens

export const colors = {
  brand: {
    primary: "#0F6E56",
    primaryLight: "#1D9E75",
    primaryBg: "#E1F5EE",
    primaryText: "#085041",
  },
  status: {
    success: { bg: "#E1F5EE", fg: "#0F6E56", border: "#1D9E75" },
    warning: { bg: "#FAEEDA", fg: "#BA7517", border: "#EF9F27" },
    danger: { bg: "#FCEBEB", fg: "#A32D2D", border: "#E24B4A" },
    info: { bg: "#E6F1FB", fg: "#185FA5", border: "#378ADD" },
    neutral: { bg: "#F1EFE8", fg: "#5F5E5A", border: "#B4B2A9" },
  },
  // Categorical palette for charts (fixed order for color consistency)
  categorical: [
    "#1D9E75", // teal deep
    "#5DCAA5", // teal light
    "#534AB7", // purple
    "#D85A30", // coral
    "#378ADD", // blue
    "#D4537E", // pink
    "#EF9F27", // amber
    "#888780", // gray
  ],
};

// Path A canonical agents (2026-05-11). Colors mirror ChatInput.tsx so
// chat selector + AgentResponse header use the same palette.
export const agentTheme = {
  // Canonical
  OSMOSIS:  { color: "hsl(142, 60%, 45%)", icon: "🧠", label: "Orchestrator + knowledge" },
  RCAI:     { color: "hsl(0, 60%, 55%)",   icon: "🔬", label: "KPIs PM, RCA, anomalies" },
  OPTIMUS:  { color: "hsl(38, 80%, 50%)",  icon: "⚡", label: "Params CM, HW Nokia, tilt" },
  AEGIS:    { color: "hsl(220, 60%, 50%)", icon: "🛡", label: "Validation tier, risque" },
  EXA:      { color: "hsl(160, 60%, 45%)", icon: "📡", label: "Export proposals SON" },
  ECHO:     { color: "hsl(210, 18%, 50%)", icon: "📊", label: "Rapports, synthèses, learning" },
  // Legacy aliases (kept so streamed responses with old names still render
  // a coloured header — they all fold to a canonical at the agent layer)
  PULSE:    { color: "hsl(0, 60%, 55%)",   icon: "💓", label: "PULSE → RCAI" },
  TRACE:    { color: "hsl(0, 60%, 55%)",   icon: "🔍", label: "TRACE → RCAI" },
  SENTINEL: { color: "hsl(0, 60%, 55%)",   icon: "🚨", label: "SENTINEL → RCAI" },
  TOPO:     { color: "hsl(0, 60%, 55%)",   icon: "🗺", label: "TOPO → RCAI" },
  PARMY:    { color: "hsl(38, 80%, 50%)",  icon: "⚙",  label: "PARMY → OPTIMUS" },
  ANALYTIC: { color: "hsl(210, 18%, 50%)", icon: "📈", label: "ANALYTIC → ECHO" },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
};

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
};

export const typography = {
  family: {
    sans: '-apple-system, "Segoe UI", Roboto, Inter, sans-serif',
    mono: '"JetBrains Mono", "SF Mono", monospace',
  },
  size: {
    display: 22,
    h2: 18,
    h3: 15,
    body: 13.5,
    sm: 12,
    caption: 11,
    tiny: 10,
  },
  weight: {
    regular: 400,
    medium: 500,
  },
};
