import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Zap, Database, Sparkles, Users, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import type { ProgressEvent } from '@/stores/chatSessionStore';

const AGENT_META: Record<string, { emoji: string; label: string; color: string }> = {
  PULSE: { emoji: '\u{1F4E1}', label: 'PULSE', color: 'hsl(200, 80%, 50%)' },
  TRACE: { emoji: '\u{1F527}', label: 'TRACE', color: 'hsl(35, 90%, 50%)' },
  SENTINEL: { emoji: '\u{1F6A8}', label: 'SENTINEL', color: 'hsl(0, 80%, 55%)' },
  TOPO: { emoji: '\u{1F5FC}', label: 'TOPO', color: 'hsl(270, 70%, 55%)' },
  PARMY: { emoji: '\u{2699}\u{FE0F}', label: 'PARMY', color: 'hsl(30, 85%, 55%)' },
  QOEBIT: { emoji: '\u{1F9E0}', label: 'QOEBIT', color: 'hsl(142, 60%, 45%)' },
  SYNTHESIS: { emoji: '\u{2728}', label: 'SYNTHESIS', color: 'hsl(50, 85%, 50%)' },
  MULTI: { emoji: '\u{1F504}', label: 'MULTI', color: 'hsl(280, 60%, 55%)' },
};

function getAgentColor(agent?: string): string {
  if (agent && AGENT_META[agent]) return AGENT_META[agent].color;
  return 'hsl(220, 15%, 55%)';
}

function getEventIcon(type: string) {
  switch (type) {
    case 'agent_selected':
    case 'agent_start':
      return Zap;
    case 'tool_start':
    case 'tool_done':
      return Database;
    case 'generating':
    case 'synthesis_start':
      return Sparkles;
    case 'orchestrator_plan':
      return Users;
    default:
      return Zap;
  }
}

function getEventLabel(event: ProgressEvent): string {
  switch (event.type) {
    case 'orchestrator_plan':
      return `Plan: ${event.plan?.join(' \u2192 ') || 'multi-agent'}`;
    case 'agent_selected':
      return `${event.agent || 'Agent'} selected`;
    case 'agent_start':
      return `${event.agent || 'Agent'} starting...`;
    case 'tool_start':
      return `Querying ${event.tool || 'database'}...`;
    case 'tool_done':
      return `${event.tool || 'Query'} done`;
    case 'generating':
      return 'Generating response...';
    case 'agent_done':
      return `${event.agent || 'Agent'} complete`;
    case 'synthesis_start':
      return 'Synthesizing...';
    default:
      return event.type;
  }
}

interface AgentTimelineProps {
  events: ProgressEvent[];
  isStreaming: boolean;
}

const AgentTimeline: React.FC<AgentTimelineProps> = ({ events, isStreaming }) => {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new events arrive during streaming
  useEffect(() => {
    if (isStreaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length, isStreaming]);

  const summary = useMemo(() => {
    if (events.length === 0) return null;
    const agents = new Set<string>();
    let toolCount = 0;
    let firstTs = Infinity;
    let lastTs = 0;

    for (const e of events) {
      if (e.agent) agents.add(e.agent);
      if (e.type === 'tool_start') toolCount++;
      if (e.ts < firstTs) firstTs = e.ts;
      if (e.ts > lastTs) lastTs = e.ts;
    }

    const durationMs = lastTs - firstTs;
    const durationStr = durationMs >= 1000
      ? `${(durationMs / 1000).toFixed(1)}s`
      : `${durationMs}ms`;

    const agentList = Array.from(agents);
    const primaryAgent = agentList[0] || 'QOEBIT';
    const meta = AGENT_META[primaryAgent];

    return {
      emoji: meta?.emoji || '\u{1F916}',
      label: meta?.label || primaryAgent,
      color: meta?.color || 'hsl(220, 15%, 55%)',
      toolCount,
      duration: durationStr,
      agents: agentList,
    };
  }, [events]);

  if (events.length === 0) return null;

  // Current step = last event
  const currentEvent = events[events.length - 1];
  const currentIcon = getEventIcon(currentEvent.type);
  const CurrentIcon = currentIcon;
  const currentLabel = getEventLabel(currentEvent);
  const currentColor = getAgentColor(currentEvent.agent);

  // Compact single-line status bar (default view)
  if (!expanded) {
    return (
      <div className="mb-2.5">
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/60 border border-border/40 transition-all text-left group"
        >
          {isStreaming ? (
            <>
              <div
                className="w-2 h-2 rounded-full shrink-0 animate-pulse"
                style={{ backgroundColor: currentColor }}
              />
              <CurrentIcon className="w-3 h-3 shrink-0" style={{ color: currentColor }} />
              <span className="text-[11px] text-foreground/80 truncate flex-1">
                {currentLabel}
              </span>
              <span className="text-[10px] text-muted-foreground/60 shrink-0">
                {events.length} step{events.length > 1 ? 's' : ''}
              </span>
            </>
          ) : summary ? (
            <>
              <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
              <span className="text-[11px] text-foreground/70 truncate flex-1">
                <span style={{ color: summary.color }}>{summary.emoji} {summary.label}</span>
                <span className="text-muted-foreground">
                  {' '}&mdash; {summary.toolCount} {summary.toolCount === 1 ? 'query' : 'queries'} &mdash; {summary.duration}
                </span>
              </span>
              <ChevronRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-foreground/60 transition-colors shrink-0" />
            </>
          ) : null}
        </button>
      </div>
    );
  }

  // Expanded: scrollable list of all steps
  return (
    <div className="mb-2.5 rounded-lg border border-border/40 bg-muted/20 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(false)}
        className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-muted/40 transition-colors text-left border-b border-border/30"
      >
        <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Pipeline &mdash; {events.length} steps
        </span>
      </button>

      {/* Scrollable steps */}
      <div
        ref={scrollRef}
        className="max-h-[120px] overflow-y-auto px-3 py-1.5 space-y-0.5"
      >
        {events.map((event, i) => {
          const Icon = getEventIcon(event.type);
          const color = getAgentColor(event.agent);
          const label = getEventLabel(event);
          const isDone = !isStreaming || i < events.length - 1;
          const isActive = isStreaming && i === events.length - 1;

          return (
            <div key={i} className="flex items-center gap-2 py-0.5">
              {isDone ? (
                <CheckCircle2 className="w-3 h-3 text-green-500/70 shrink-0" />
              ) : (
                <div
                  className="w-3 h-3 rounded-full shrink-0 animate-pulse border-2"
                  style={{ borderColor: color, backgroundColor: `${color}33` }}
                />
              )}
              <Icon className="w-3 h-3 shrink-0" style={{ color }} />
              <span className={`text-[11px] truncate ${isActive ? 'text-foreground font-medium' : 'text-foreground/60'}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AgentTimeline;
