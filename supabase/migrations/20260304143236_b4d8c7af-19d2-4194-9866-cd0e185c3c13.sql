
-- Agent Feedback table: stores thumbs up/down ratings on assistant responses
CREATE TABLE public.agent_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  message_index INTEGER NOT NULL,
  user_question TEXT NOT NULL,
  assistant_response TEXT NOT NULL,
  agent TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating IN (-1, 1)),
  intent TEXT,
  scope_level TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent Memory table: stores user preferences and learned patterns
CREATE TABLE public.agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_type TEXT NOT NULL, -- 'preference', 'few_shot', 'correction'
  agent TEXT, -- NULL = global, else agent-specific
  key TEXT NOT NULL, -- e.g. 'favorite_kpis', 'response_style', 'custom_threshold'
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_session_id TEXT,
  relevance_score DOUBLE PRECISION DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

-- Public RLS policies (no auth in this app)
CREATE POLICY "agent_feedback publicly readable" ON public.agent_feedback FOR SELECT USING (true);
CREATE POLICY "agent_feedback publicly insertable" ON public.agent_feedback FOR INSERT WITH CHECK (true);
CREATE POLICY "agent_feedback publicly deletable" ON public.agent_feedback FOR DELETE USING (true);

CREATE POLICY "agent_memory publicly readable" ON public.agent_memory FOR SELECT USING (true);
CREATE POLICY "agent_memory publicly insertable" ON public.agent_memory FOR INSERT WITH CHECK (true);
CREATE POLICY "agent_memory publicly updatable" ON public.agent_memory FOR UPDATE USING (true);
CREATE POLICY "agent_memory publicly deletable" ON public.agent_memory FOR DELETE USING (true);

-- Index for fast few-shot retrieval (best-rated responses per agent)
CREATE INDEX idx_agent_feedback_positive ON public.agent_feedback (agent, rating) WHERE rating = 1;
CREATE INDEX idx_agent_memory_type ON public.agent_memory (memory_type, agent);
