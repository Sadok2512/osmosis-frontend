import { useEffect, useRef, useState, useCallback } from "react";
import { Bug, X, Check, Copy, Trash2, Play, Square, Download, ChevronDown, ChevronUp } from "lucide-react";

/**
 * CrashRepro
 * ------------------------------------------------------------------
 * A floating dev panel that walks the user through a fixed sequence
 * of actions to consistently trigger the "modal crash" we are hunting,
 * while passively recording every relevant DOM interaction with a
 * timestamp. The resulting trace can be copied / downloaded so it can
 * be pasted back to the AI for diagnosis.
 *
 * No business logic, purely a UI helper. Mounted globally in App.
 */

type Step = {
  id: string;
  title: string;
  hint: string;
};

// Default checklist — covers the modal flows that have crashed recently
// (CreateViewModal, Investigator slot dialogs, Precision Architect tabs).
const DEFAULT_STEPS: Step[] = [
  {
    id: "open-sites-monitor",
    title: "Ouvrir Sites Monitor",
    hint: "Page d'accueil — la carte doit s'afficher avant toute autre action.",
  },
  {
    id: "open-create-view",
    title: "Cliquer ' + Nouvelle vue ' (CreateViewModal)",
    hint: "Le modal de création de vue doit s'ouvrir sans erreur console.",
  },
  {
    id: "pick-view-type",
    title: "Sélectionner un type (KPI Overlay / Topology / etc.)",
    hint: "Note le type choisi dans l'export — utile pour reproduire.",
  },
  {
    id: "close-create-view",
    title: "Fermer le modal (X ou Escape)",
    hint: "Vérifier que le focus revient correctement et qu'aucun warning ref n'apparaît.",
  },
  {
    id: "open-investigator",
    title: "Ouvrir Investigator",
    hint: "Naviguer vers /investigator depuis la sidebar.",
  },
  {
    id: "add-timeseries",
    title: "Ajouter un slot Timeseries",
    hint: "Cliquer ' + Timeseries ' — le slot doit s'insérer sans crash.",
  },
  {
    id: "open-precision",
    title: "Ouvrir Power NetVision",
    hint: "Naviguer vers /precision-architect.",
  },
  {
    id: "switch-tab",
    title: "Changer d'onglet d'analyse",
    hint: "Cliquer sur Table Data → KPI Breakdown → Top Worst — c'est ici que le crash s'est produit.",
  },
  {
    id: "reproduce-crash",
    title: "Déclencher le crash",
    hint: "Reproduire l'action exacte qui fait planter — ne rien faire d'autre après.",
  },
];

type LogEntry = {
  t: number;            // epoch ms
  rel: number;          // relative ms since session start
  kind: "step" | "click" | "key" | "nav" | "error" | "note";
  label: string;
  detail?: string;
};

const LS_KEY = "crash-repro-state-v1";

function describeTarget(el: EventTarget | null): string {
  if (!(el instanceof HTMLElement)) return "(non-element)";
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls = (el.getAttribute("class") || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((c) => `.${c}`)
    .join("");
  const text = (el.innerText || el.getAttribute("aria-label") || "")
    .trim()
    .slice(0, 40);
  const role = el.getAttribute("role");
  const dataTest = el.getAttribute("data-testid");
  return [
    tag + id + cls,
    role ? `role=${role}` : "",
    dataTest ? `testid=${dataTest}` : "",
    text ? `« ${text} »` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export default function CrashRepro() {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [doneSteps, setDoneSteps] = useState<Record<string, boolean>>({});
  const [log, setLog] = useState<LogEntry[]>([]);
  const [note, setNote] = useState("");
  const startRef = useRef<number>(0);

  // Restore persisted state across reloads (the crash often forces a reload)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.doneSteps) setDoneSteps(s.doneSteps);
        if (s.log) setLog(s.log);
        if (typeof s.startedAt === "number") startRef.current = s.startedAt;
        if (s.recording) setRecording(true);
        if (s.open) setOpen(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({
          doneSteps,
          log,
          startedAt: startRef.current,
          recording,
          open,
        })
      );
    } catch {}
  }, [doneSteps, log, recording, open]);

  const append = useCallback((entry: Omit<LogEntry, "t" | "rel">) => {
    const now = Date.now();
    const rel = startRef.current ? now - startRef.current : 0;
    setLog((prev) => [...prev, { ...entry, t: now, rel }]);
  }, []);

  // Passive DOM listeners while recording
  useEffect(() => {
    if (!recording) return;

    const onClick = (e: MouseEvent) => {
      append({ kind: "click", label: "click", detail: describeTarget(e.target) });
    };
    const onKey = (e: KeyboardEvent) => {
      if (["Escape", "Enter", "Tab"].includes(e.key)) {
        append({ kind: "key", label: `key:${e.key}`, detail: describeTarget(e.target) });
      }
    };
    const onError = (e: ErrorEvent) => {
      append({
        kind: "error",
        label: "window.error",
        detail: `${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`,
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      append({
        kind: "error",
        label: "unhandledrejection",
        detail: String(e.reason?.message || e.reason),
      });
    };
    let lastPath = window.location.pathname + window.location.search;
    const navInterval = window.setInterval(() => {
      const cur = window.location.pathname + window.location.search;
      if (cur !== lastPath) {
        append({ kind: "nav", label: "navigation", detail: `${lastPath} → ${cur}` });
        lastPath = cur;
      }
    }, 400);

    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.clearInterval(navInterval);
    };
  }, [recording, append]);

  const start = () => {
    startRef.current = Date.now();
    setLog([{ t: Date.now(), rel: 0, kind: "note", label: "session-start" }]);
    setDoneSteps({});
    setRecording(true);
  };
  const stop = () => setRecording(false);
  const reset = () => {
    setLog([]);
    setDoneSteps({});
    startRef.current = 0;
    setRecording(false);
    try { localStorage.removeItem(LS_KEY); } catch {}
  };

  const toggleStep = (s: Step) => {
    setDoneSteps((prev) => {
      const next = { ...prev, [s.id]: !prev[s.id] };
      return next;
    });
    append({ kind: "step", label: s.title, detail: doneSteps[s.id] ? "uncheck" : "check" });
  };

  const addNote = () => {
    const v = note.trim();
    if (!v) return;
    append({ kind: "note", label: "note", detail: v });
    setNote("");
  };

  const buildExport = () => {
    const lines: string[] = [];
    lines.push(`# Crash repro trace`);
    lines.push(`Started: ${new Date(startRef.current || Date.now()).toISOString()}`);
    lines.push(`URL: ${window.location.href}`);
    lines.push(`UA: ${navigator.userAgent}`);
    lines.push("");
    lines.push("## Checklist");
    DEFAULT_STEPS.forEach((s, i) => {
      lines.push(`${doneSteps[s.id] ? "[x]" : "[ ]"} ${i + 1}. ${s.title}`);
    });
    lines.push("");
    lines.push("## Timeline");
    log.forEach((e) => {
      const sec = (e.rel / 1000).toFixed(2).padStart(7, " ");
      lines.push(`${sec}s  ${e.kind.padEnd(6)} ${e.label}${e.detail ? "  — " + e.detail : ""}`);
    });
    return lines.join("\n");
  };

  const copyTrace = async () => {
    try {
      await navigator.clipboard.writeText(buildExport());
      append({ kind: "note", label: "trace copied to clipboard" });
    } catch {
      append({ kind: "error", label: "clipboard failed" });
    }
  };

  const downloadTrace = () => {
    const blob = new Blob([buildExport()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crash-repro-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Floating launcher
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Crash reproduction helper"
        className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur hover:bg-accent"
      >
        <Bug className="h-4 w-4 text-destructive" />
        Crash repro
        {recording && (
          <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-destructive" />
        )}
      </button>
    );
  }

  const completed = DEFAULT_STEPS.filter((s) => doneSteps[s.id]).length;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-[380px] max-w-[95vw] rounded-lg border border-border bg-background text-foreground shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Bug className="h-4 w-4 text-destructive" />
          Crash repro
          <span className="text-xs text-muted-foreground">
            {completed}/{DEFAULT_STEPS.length}
          </span>
          {recording && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
              REC
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="rounded p-1 hover:bg-accent"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1 hover:bg-accent"
            title="Hide"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Controls */}
          <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
            {!recording ? (
              <button
                onClick={start}
                className="flex items-center gap-1 rounded bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground hover:opacity-90"
              >
                <Play className="h-3 w-3" /> Start
              </button>
            ) : (
              <button
                onClick={stop}
                className="flex items-center gap-1 rounded bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground hover:opacity-90"
              >
                <Square className="h-3 w-3" /> Stop
              </button>
            )}
            <button
              onClick={copyTrace}
              className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-accent"
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
            <button
              onClick={downloadTrace}
              className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-accent"
            >
              <Download className="h-3 w-3" /> .txt
            </button>
            <button
              onClick={reset}
              className="ml-auto flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            >
              <Trash2 className="h-3 w-3" /> Reset
            </button>
          </div>

          {/* Checklist */}
          <ol className="max-h-[260px] space-y-1 overflow-y-auto px-3 py-2 text-xs">
            {DEFAULT_STEPS.map((s, i) => {
              const done = !!doneSteps[s.id];
              return (
                <li key={s.id}>
                  <button
                    onClick={() => toggleStep(s)}
                    className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-accent ${
                      done ? "opacity-60" : ""
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        done
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border"
                      }`}
                    >
                      {done && <Check className="h-3 w-3" />}
                    </span>
                    <span>
                      <span className={`font-medium ${done ? "line-through" : ""}`}>
                        {i + 1}. {s.title}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {s.hint}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* Note input */}
          <div className="flex gap-1 border-t border-border px-3 py-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addNote();
              }}
              placeholder="Ajouter une note au timeline…"
              className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
            />
            <button
              onClick={addNote}
              className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90"
            >
              Add
            </button>
          </div>

          {/* Mini log preview */}
          <div className="max-h-[140px] overflow-y-auto border-t border-border bg-muted/30 px-3 py-2 font-mono text-[10px] leading-snug text-muted-foreground">
            {log.length === 0 ? (
              <div className="italic">Aucune action enregistrée. Clique Start pour commencer.</div>
            ) : (
              log.slice(-40).map((e, i) => (
                <div
                  key={i}
                  className={
                    e.kind === "error"
                      ? "text-destructive"
                      : e.kind === "step"
                      ? "text-primary"
                      : ""
                  }
                >
                  {(e.rel / 1000).toFixed(2)}s {e.kind} · {e.label}
                  {e.detail ? ` — ${e.detail.slice(0, 80)}` : ""}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
