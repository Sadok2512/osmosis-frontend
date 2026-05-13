import React, { useState, useRef, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';

type AgentId = 'OSMOSIS' | 'RCAI' | 'OPTIMUS' | 'AEGIS' | 'EXA' | 'ECHO' | 'PULSE' | 'TRACE' | 'SENTINEL' | 'TOPO' | 'PARMY' | 'ANALYTIC';

const AGENT_META: Record<AgentId, { emoji: string; label: string; color: string }> = {
  OSMOSIS: { emoji: '🧠', label: 'OSMOSIS', color: 'hsl(142, 60%, 45%)' },
  RCAI: { emoji: '🔍', label: 'RCAI', color: 'hsl(265, 70%, 60%)' },
  OPTIMUS: { emoji: '⚙️', label: 'OPTIMUS', color: 'hsl(35, 90%, 50%)' },
  AEGIS: { emoji: '🛡️', label: 'AEGIS', color: 'hsl(0, 80%, 55%)' },
  EXA: { emoji: '📤', label: 'EXA', color: 'hsl(190, 70%, 50%)' },
  ECHO: { emoji: '📊', label: 'ECHO', color: 'hsl(150, 65%, 50%)' },
  PULSE: { emoji: '🔍', label: 'RCAI', color: 'hsl(265, 70%, 60%)' },
  TRACE: { emoji: '🔍', label: 'RCAI', color: 'hsl(265, 70%, 60%)' },
  SENTINEL: { emoji: '🔍', label: 'RCAI', color: 'hsl(265, 70%, 60%)' },
  TOPO: { emoji: '🔍', label: 'RCAI', color: 'hsl(265, 70%, 60%)' },
  PARMY: { emoji: '⚙️', label: 'OPTIMUS', color: 'hsl(35, 90%, 50%)' },
  ANALYTIC: { emoji: '📊', label: 'ECHO', color: 'hsl(150, 65%, 50%)' },
};

interface ChatInputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  forcedAgent: AgentId | null;
  onForcedAgentChange: (agent: AgentId | null) => void;
  activeAgent?: AgentId | null;
}

const ChatInput = React.memo(({ onSend, isLoading, forcedAgent, onForcedAgentChange }: ChatInputProps) => {
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

  return (
    <div className="border-t border-border bg-card/80 backdrop-blur-sm px-5 py-3.5">
      <div className="max-w-4xl mx-auto">
        {/* Agent force selector */}
        <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
          <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mr-1">Agent :</span>
          <button
            onClick={() => onForcedAgentChange(null)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all ${
              !forcedAgent
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted border border-border/50'
            }`}
          >
            Auto
          </button>
          {(['RCAI', 'OPTIMUS', 'AEGIS', 'EXA', 'ECHO'] as AgentId[]).map(agent => {
            const meta = AGENT_META[agent];
            const isActive = forcedAgent === agent;
            return (
              <button
                key={agent}
                onClick={() => onForcedAgentChange(isActive ? null : agent)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all flex items-center gap-1 ${
                  isActive
                    ? 'text-primary-foreground shadow-sm'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted border border-border/50'
                }`}
                style={isActive ? { backgroundColor: meta.color } : undefined}
                title={`Forcer l'agent ${agent}`}
              >
                <span>{meta.emoji}</span>
                {agent}
              </button>
            );
          })}
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
