import { useState, useEffect } from "react";
import { AgentResponse } from "@/lib/osmosis-ui-kit/components/AgentResponse";
import { parseToAgentResponse } from "@/lib/osmosis-ui-kit/adapter/parseToAgentResponse";
import { VPS_ENDPOINTS } from "@/lib/apiConfig";
import type { AgentResponse as AgentResponseType } from "@/lib/osmosis-ui-kit/lib/types";

/**
 * Preview / production-readiness page for the osmosis-ui-kit AgentResponse
 * renderer.
 *
 * Modes (URL params):
 *   /ai-assistant-v2                  → kit reference payload (greenfield)
 *   /ai-assistant-v2?live=1           → live agent stream parsed via adapter
 *   /ai-assistant-v2?live=1&q=...     → preset question
 */
export default function AgentResponseV2Preview() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const liveMode = params.get("live") === "1";
  const presetQ = params.get("q") || "donne moi la distribution des hardware Nokia rru par plaque";

  const [data, setData] = useState<AgentResponseType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState(presetQ);
  const [loading, setLoading] = useState(false);
  const [rawText, setRawText] = useState<string>("");

  useEffect(() => {
    if (!liveMode) {
      // Minimal greenfield demo payload — proves the kit composes end-to-end
      // without needing a live backend.
      setData({
        agent: "OPTIMUS",
        query_meta: { duration_ms: 142, source: "demo", confidence: 0.99 },
        tldr: { headline: "Demo payload — OPTIMUS audit Nokia HW", highlights: [{ label: "Coverage 87%", type: "success" }] },
        kpis: [
          { label: "Sites Nokia", value: 4412, status: "success" },
          { label: "Unités HW", value: "232 K", status: "success" },
          { label: "BBU types", value: 11, status: "info" },
          { label: "Coverage", value: "87%", status: "warning" },
        ],
        anomalies: undefined,
        insights: [{ text: "Distribution typique : RET 26%, SingleAntennaDevice 25%, FAN 20%." }],
      });
    }
  }, [liveMode]);

  const askLive = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    setRawText("");
    const t0 = performance.now();
    try {
      const url = `${VPS_ENDPOINTS.agent}/orchestrator/stream`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: question }],
          uiScope: { page: "global" },
        }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let agentName: string | undefined;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const j = JSON.parse(line.slice(6));
            for (const c of (j.choices || [])) {
              const ct = c.delta?.content;
              if (typeof ct === "string") buf += ct;
            }
          } catch { /* ignore non-json frames */ }
        }
        const m = buf.match(/<!-- AGENT:(\w+) -->/);
        if (m) agentName = m[1];
      }
      const cleaned = buf
        .replace(/<!-- (PROGRESS|AGENT)[^>]*-->/g, "")
        .trim();
      setRawText(cleaned);
      const parsed = parseToAgentResponse(cleaned, agentName, {
        duration_ms: Math.round(performance.now() - t0),
        source: "orchestrator/stream",
      });
      setData(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFA", padding: "24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0F1F2E", margin: 0 }}>
            AgentResponse — UI kit {liveMode ? "(live mode)" : "(reference payload)"}
          </h1>
          <p style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
            {liveMode
              ? "Stream live agent → adapter → osmosis-ui-kit components."
              : "Static demo. Add ?live=1 to call the live agent."}
          </p>
        </header>

        {liveMode && (
          <div style={{ marginBottom: 16, padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #E5E7EB" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Pose une question à OSMOSIS…"
                style={{ flex: 1, padding: "8px 10px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13 }}
                onKeyDown={(e) => { if (e.key === "Enter") askLive(); }}
              />
              <button
                onClick={askLive}
                disabled={loading}
                style={{
                  padding: "8px 16px", background: loading ? "#9CA3AF" : "#0F6E56",
                  color: "#fff", border: 0, borderRadius: 6, cursor: loading ? "wait" : "pointer", fontSize: 13, fontWeight: 600,
                }}
              >
                {loading ? "Streaming…" : "Ask"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ padding: 16, background: "#FEE", border: "1px solid #FBB", borderRadius: 8, color: "#900", marginBottom: 16 }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {data && (
          <AgentResponse
            data={data}
            onFollowUp={(prompt) => { setQuestion(prompt); askLive(); }}
            onExport={(fmt) => console.log("[v2] export:", fmt)}
          />
        )}

        {liveMode && rawText && (
          <details style={{ marginTop: 24, padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #E5E7EB" }}>
            <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#6B7280" }}>
              Raw stream output ({rawText.length} chars) — debug
            </summary>
            <pre style={{ marginTop: 12, padding: 12, background: "#F3F4F6", borderRadius: 6, fontSize: 11, overflow: "auto", maxHeight: 400 }}>
              {rawText}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
