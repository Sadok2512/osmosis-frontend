import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Loader2, Download, Check, AlertCircle } from 'lucide-react';
import { VPS_ENDPOINTS } from '@/lib/apiConfig';

// Path A canonical agents + legacy aliases (kept for type compat with streamed
// names from older sessions — only the canonical six render as buttons).
type AgentId =
  | 'OSMOSIS' | 'RCAI' | 'OPTIMUS' | 'AEGIS' | 'EXA' | 'ECHO'
  | 'PULSE' | 'TRACE' | 'SENTINEL' | 'TOPO' | 'PARMY' | 'ANALYTIC';

const AGENT_META: Record<AgentId, { emoji: string; label: string; color: string; role: string }> = {
  OSMOSIS: { emoji: '🧠', label: 'OSMOSIS', color: 'hsl(142, 60%, 45%)', role: 'Orchestrator + knowledge' },
  RCAI:    { emoji: '🔬', label: 'RCAI',    color: 'hsl(0, 60%, 55%)',   role: 'KPIs PM, RCA, anomalies' },
  OPTIMUS: { emoji: '⚡', label: 'OPTIMUS', color: 'hsl(38, 80%, 50%)',  role: 'Params CM, HW Nokia, tilt' },
  AEGIS:   { emoji: '🛡️', label: 'AEGIS',  color: 'hsl(220, 60%, 50%)', role: 'Validation tier, risque' },
  EXA:     { emoji: '📡', label: 'EXA',     color: 'hsl(160, 60%, 45%)', role: 'Export proposals SON' },
  ECHO:    { emoji: '📊', label: 'ECHO',    color: 'hsl(210, 18%, 50%)', role: 'Rapports, synthèses, learning' },
  PULSE:    { emoji: '💓', label: 'PULSE',    color: 'hsl(200, 80%, 50%)', role: 'legacy → RCAI' },
  TRACE:    { emoji: '🔍', label: 'TRACE',    color: 'hsl(35, 90%, 50%)',  role: 'legacy → RCAI' },
  SENTINEL: { emoji: '🚨', label: 'SENTINEL', color: 'hsl(0, 80%, 55%)',   role: 'legacy → RCAI' },
  TOPO:     { emoji: '🗺️', label: 'TOPO',    color: 'hsl(270, 70%, 55%)', role: 'legacy → RCAI' },
  PARMY:    { emoji: '⚙️', label: 'PARMY',   color: 'hsl(30, 85%, 55%)',  role: 'legacy → OPTIMUS' },
  ANALYTIC: { emoji: '📈', label: 'ANALYTIC', color: 'hsl(190, 70%, 50%)', role: 'legacy → ECHO' },
};

// Only canonical agents are exposed as selectable buttons.
const CANONICAL_AGENTS: AgentId[] = ['RCAI', 'OPTIMUS', 'AEGIS', 'EXA', 'ECHO'];

interface ChatInputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  forcedAgent: AgentId | null;
  onForcedAgentChange: (agent: AgentId | null) => void;
  /** Agent currently handling the response (auto mode) — shown live in the Auto pill. */
  activeAgent?: AgentId | null;
}

const ChatInput = React.memo(({ onSend, isLoading, forcedAgent, onForcedAgentChange, activeAgent }: ChatInputProps) => {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        onSend(input.trim());
        setInput('');
      }
    }
  }, [input, isLoading, onSend]);

  const handleSend = useCallback(() => {
    if (input.trim() && !isLoading) {
      onSend(input.trim());
      setInput('');
    }
  }, [input, isLoading, onSend]);

  // ── Skills download — fetches the catalog and triggers a JSON download.
  type SkillsState = 'idle' | 'busy' | 'ok' | 'err';
  const [skillsState, setSkillsState] = useState<SkillsState>('idle');
  const [skillsCount, setSkillsCount] = useState<number | null>(null);
  const [skillsErr, setSkillsErr] = useState<string | null>(null);

  useEffect(() => {
    if (skillsState === 'ok' || skillsState === 'err') {
      const t = setTimeout(() => { setSkillsState('idle'); setSkillsErr(null); }, 2200);
      return () => clearTimeout(t);
    }
  }, [skillsState]);

  const handleDownloadSkills = useCallback(async () => {
    if (skillsState === 'busy') return;
    setSkillsState('busy');
    setSkillsErr(null);
    try {
      const url = `${VPS_ENDPOINTS.parser}/api/v1/skills`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' }, credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const skills = await res.json();
      const count = Array.isArray(skills) ? skills.length : 0;
      const stamp = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify({
        exported_at: new Date().toISOString(),
        count,
        skills,
      }, null, 2)], { type: 'application/json;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `osmosis-skills-${stamp}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setSkillsCount(count);
      setSkillsState('ok');
    } catch (e) {
      console.warn('[ChatInput] download skills failed', e);
      setSkillsErr(e instanceof Error ? e.message : String(e));
      setSkillsState('err');
    }
  }, [skillsState]);

  return (
    <div className="border-t border-border bg-card/80 backdrop-blur-sm px-5 py-3.5">
      <div className="max-w-4xl mx-auto">
        {/* Agent force selector — canonical only */}
        <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
          <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mr-1">Agent :</span>

          {/* Auto pill — shows live agent name during streaming */}
          {(() => {
            const isAutoSelected = !forcedAgent;
            const liveAgent = isAutoSelected && activeAgent && AGENT_META[activeAgent] ? activeAgent : null;
            const liveMeta = liveAgent ? AGENT_META[liveAgent] : null;
            return (
              <button
                onClick={() => onForcedAgentChange(null)}
                className={`relative overflow-hidden px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all duration-300 flex items-center gap-1.5 ${
                  isAutoSelected
                    ? 'text-primary-foreground shadow-md ring-2 ring-offset-1 ring-offset-card'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:scale-105 border border-border/50'
                }`}
                style={isAutoSelected
                  ? { backgroundColor: liveMeta?.color ?? 'hsl(var(--primary))', '--tw-ring-color': liveMeta?.color ?? 'hsl(var(--primary))' } as React.CSSProperties
                  : undefined}
                title={liveAgent ? `Auto → ${liveAgent} traite la requête` : 'Routage automatique (orchestrateur)'}
              >
                {isAutoSelected && isLoading && (
                  <span className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                )}
                <span className="relative">Auto</span>
                {liveMeta && (
                  <>
                    <span className="relative" style={{ opacity: 0.7 }}>→</span>
                    <span className={`relative ${isLoading ? 'animate-pulse' : ''}`}>
                      {liveMeta.emoji} {liveAgent}
                    </span>
                  </>
                )}
              </button>
            );
          })()}

          {CANONICAL_AGENTS.map(agent => {
            const meta = AGENT_META[agent];
            const isActive = forcedAgent === agent;
            const isLiveInAuto = !forcedAgent && activeAgent === agent;
            return (
              <button
                key={agent}
                onClick={() => onForcedAgentChange(isActive ? null : agent)}
                className={`relative overflow-hidden px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all duration-200 flex items-center gap-1.5 ${
                  isActive
                    ? 'text-primary-foreground shadow-md scale-105 ring-2 ring-offset-1 ring-offset-card'
                    : isLiveInAuto
                      ? 'bg-card border-2 ring-2 ring-offset-1 ring-offset-card animate-pulse'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:scale-105 hover:shadow-sm border border-border/50'
                }`}
                style={isActive
                  ? { backgroundColor: meta.color, '--tw-ring-color': meta.color } as React.CSSProperties
                  : isLiveInAuto
                    ? { borderColor: meta.color, color: meta.color, boxShadow: `0 0 0 1px ${meta.color}, 0 0 12px ${meta.color}66`, '--tw-ring-color': meta.color } as React.CSSProperties
                    : undefined}
                title={isLiveInAuto ? `${agent} traite la requête (auto)` : `Forcer l'agent ${agent} — ${meta.role}`}
              >
                {isActive && isLoading && (
                  <span className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                )}
                <span className="relative">{meta.emoji}</span>
                <span className="relative">{agent}</span>
              </button>
            );
          })}

          <div className="flex-1" />
          <button
            onClick={handleDownloadSkills}
            disabled={skillsState === 'busy'}
            className={`relative px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all duration-200 flex items-center gap-1.5 border ${
              skillsState === 'ok'
                ? 'bg-green-500/10 text-green-600 border-green-500/30'
                : skillsState === 'err'
                  ? 'bg-red-500/10 text-red-600 border-red-500/30'
                  : skillsState === 'busy'
                    ? 'bg-muted text-muted-foreground border-border/50 cursor-wait'
                    : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground hover:scale-105 hover:shadow-sm border-border/50'
            }`}
            title={
              skillsState === 'ok' ? `${skillsCount} skill(s) exporté(s)` :
              skillsState === 'err' ? (skillsErr || 'Échec download') :
              'Télécharger tous les skills (JSON)'
            }
          >
            {skillsState === 'busy' && <Loader2 className="w-3 h-3 animate-spin" />}
            {skillsState === 'idle' && <Download className="w-3 h-3" />}
            {skillsState === 'ok' && <Check className="w-3 h-3" />}
            {skillsState === 'err' && <AlertCircle className="w-3 h-3" />}
            <span>
              {skillsState === 'busy' ? 'Export…' :
               skillsState === 'ok' ? `${skillsCount} skill${(skillsCount ?? 0) > 1 ? 's' : ''}` :
               skillsState === 'err' ? 'Erreur' :
               'Skills'}
            </span>
          </button>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={forcedAgent ? `Ask ${forcedAgent}...` : "Ask a question about network QoE..."}
              rows={1}
              className="w-full resize-none bg-background border border-border rounded-xl px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all max-h-32 overflow-y-auto shadow-sm"
              style={{ minHeight: 48 }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 128) + 'px';
              }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0 shadow-sm"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground/50 text-center mt-2">
        OSMOSIS • AI-powered network analytics
      </p>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';

export default ChatInput;
