import React, { useState, useMemo } from 'react';
import { Zap, Database, Sparkles, Users, ChevronDown, ChevronRight, CheckCircle2, Clock, Activity } from 'lucide-react';
import type { ProgressEvent } from '@/stores/chatSessionStore';

type AgentId = 'PULSE' | 'TRACE' | 'SENTINEL' | 'TOPO' | 'PARMY' | 'QOEBIT';

const AGENT_META: Record<string, { emoji: string; label: string; color: string }> = {
  PULSE: { emoji: '\u{1F4E1}', label: 'PULSE', color: 'hsl(200, 80%, 50%)' },
  TRACE: { emoji: '\u{1F527}', label: 'TRACE', color: 'hsl(35, 90%, 50%)' },
  SENTINEL: { emoji: '\u{1F6A8}', label: 'SENTINEL', color: 'hsl(0, 80%, 55%)' },
  TOPO: { emoji: '\u{1F5FC}', label: 'TOPO', color: 'hsl(270, 70%, 55%)' },
  PARMY: { emoji: '\u{2699}\u{FE0F}', label: 'PARMY', color: 'hsl(160, 70%, 40%)' },
  QOEBIT: { emoji: '\u{1F9E0}', label: 'QOEBIT', color: 'hsl(142, 60%, 45%)' },
};

function getAgentColor(agent?: string): string {
  if (agent && AGENT_META[agent]) return AGENT_META[agent].color;
  return 'hsl(220, 15%, 55%)';
}

function getAgentEmoji(agent?: string): string {
  if (agent && AGENT_META[agent]) return AGENT_META[agent].emoji;
  return '\u{1F916}';
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
      return Activity;
  }
}

function getEventLabel(event: ProgressEvent): string {
  switch (event.type) {
    case 'orchestrator_plan':
      return `Plan: ${event.plan?.join(', ') || 'routing agents'}`;
    case 'agent_selected':
      return `Agent ${event.agent || '?'} selected`;
    case 'agent_start':
      return `${event.agent || 'Agent'} starting`;
    case 'tool_start':
      return `Query: ${event.query || event.tool || 'SQL'}`;
    case 'tool_done':
      return `Query complete${event.tool ? `: ${event.tool}` : ''}`;
    case 'generating':
      return 'Generating response';
    case 'agent_done':
      return `${event.agent || 'Agent'} done`;
    case 'synthesis_start':
      return 'Synthesizing final answer';
    default:
      return event.type;
  }
}

type StepStatus = 'done' | 'active' | 'pending';

function getStepStatus(event: ProgressEvent, index: number, total: number, isStreaming: boolean): StepStatus {
  if (!isStreaming) return 'done';
  if (index === total - 1) return 'active';
  return 'done';
}

interface AgentTimelineProps {
  events: ProgressEvent[];
  isStreaming: boolean;
}

const AgentTimeline: React.FC<AgentTimelineProps> = ({ events, isStreaming }) => {
  const [expanded, setExpanded] = useState(true);

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
      agentCount: agentList.length,
      agents: agentList,
    };
  }, [events]);

  // Don't render if no events
  if (events.length === 0) return null;

  // Auto-collapse once streaming is done
  const showCollapsed = !isStreaming && !expanded;

  if (showCollapsed && summary) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 px-3 py-1.5 mb-2.5 rounded-lg bg-muted/50 hover:bg-muted/80 border border-border/50 transition-all group text-left w-full"
      >
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
        <span className="text-xs">
          <span>{summary.emoji}</span>
          {' '}
          <span className="font-bold" style={{ color: summary.color }}>{summary.label}</span>
          {summary.agentCount > 1 && (
            <span className="text-muted-foreground"> +{summary.agentCount - 1}</span>
          )}
          <span className="text-muted-foreground">
            {' '}&mdash; {summary.toolCount} {summary.toolCount === 1 ? 'query' : 'queries'} &mdash; {summary.duration}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="mb-3">
      {/* Collapse toggle (only when done) */}
      {!isStreaming && (
        <button
          onClick={() => setExpanded(false)}
          className="flex items-center gap-1.5 mb-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className="w-3 h-3" />
          <span>Hide timeline</span>
        </button>
      )}

      {/* Timeline */}
      <div className="relative pl-5">
        {/* Vertical line */}
        <div className="absolute left-[9px] top-1 bottom-1 w-px bg-border/60" />

        {events.map((event, i) => {
          const status = getStepStatus(event, i, events.length, isStreaming);
          const Icon = getEventIcon(event.type);
          const agentColor = getAgentColor(event.agent);
          const label = getEventLabel(event);

          return (
            <div
              key={i}
              className="relative flex items-start gap-2.5 pb-2 last:pb-0"
              style={{
                animation: status === 'active' ? undefined : 'fadeIn 0.3s ease-out',
              }}
            >
              {/* Dot */}
              <div
                className={`absolute -left-5 mt-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 bg-card z-10 ${
                  status === 'done'
                    ? 'border-green-500/60'
                    : status === 'active'
                    ? 'border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                    : 'border-muted-foreground/30'
                }`}
                style={status === 'active' ? { animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' } : undefined}
              >
                {status === 'done' ? (
                  <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />
                ) : status === 'active' ? (
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                ) : (
                  <Clock className="w-2.5 h-2.5 text-muted-foreground/40" />
                )}
              </div>

              {/* Content */}
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon
                  className="w-3 h-3 shrink-0"
                  style={{ color: agentColor }}
                />
                <span
                  className={`text-[11px] leading-tight truncate ${
                    status === 'active'
                      ? 'text-foreground font-medium'
                      : status === 'done'
                      ? 'text-foreground/70'
                      : 'text-muted-foreground/50'
                  }`}
                >
                  {label}
                </span>
                {status === 'active' && (
                  <span className="inline-flex gap-0.5 ml-1">
                    <span className="w-1 h-1 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
};

export default AgentTimeline;
