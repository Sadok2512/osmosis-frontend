
-- Admin users table (separate from auth.users for standalone admin auth)
CREATE TABLE public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login timestamptz
);

-- LLM model configs
CREATE TABLE public.llm_model_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'openai',
  model_name text NOT NULL DEFAULT 'gpt-4',
  temperature double precision NOT NULL DEFAULT 0.7,
  top_p double precision NOT NULL DEFAULT 1.0,
  max_tokens integer NOT NULL DEFAULT 4096,
  system_prompt_prefix text DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Admin agents table
CREATE TABLE public.admin_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  base_prompt text DEFAULT '',
  model_config_id uuid REFERENCES public.llm_model_configs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Modules table
CREATE TABLE public.admin_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Agent-Module many-to-many
CREATE TABLE public.agent_modules (
  agent_id uuid REFERENCES public.admin_agents(id) ON DELETE CASCADE NOT NULL,
  module_id uuid REFERENCES public.admin_modules(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (agent_id, module_id)
);

-- Memory items per user
CREATE TABLE public.memory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.admin_users(id) ON DELETE CASCADE NOT NULL,
  agent_id uuid REFERENCES public.admin_agents(id) ON DELETE SET NULL,
  content text NOT NULL,
  tags jsonb DEFAULT '[]'::jsonb,
  importance integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Documents per agent
CREATE TABLE public.admin_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.admin_agents(id) ON DELETE CASCADE NOT NULL,
  uploaded_by_user_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  filename text NOT NULL,
  storage_path text NOT NULL,
  mime_type text DEFAULT 'application/octet-stream',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Agent runs for performance tracking
CREATE TABLE public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.admin_agents(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  tokens_in integer DEFAULT 0,
  tokens_out integer DEFAULT 0,
  cost_estimate double precision DEFAULT 0,
  latency_ms integer DEFAULT 0,
  score double precision,
  notes text
);

-- Ping stats
CREATE TABLE public.ping_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  ping_count integer NOT NULL DEFAULT 0,
  last_ping_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_model_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ping_stats ENABLE ROW LEVEL SECURITY;

-- Public RLS policies (app uses its own auth layer, not supabase auth)
CREATE POLICY "admin_users_all" ON public.admin_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "llm_model_configs_all" ON public.llm_model_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "admin_agents_all" ON public.admin_agents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "admin_modules_all" ON public.admin_modules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "agent_modules_all" ON public.agent_modules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "memory_items_all" ON public.memory_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "admin_documents_all" ON public.admin_documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "agent_runs_all" ON public.agent_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ping_stats_all" ON public.ping_stats FOR ALL USING (true) WITH CHECK (true);

-- Seed admin user (password: admin123 - bcrypt hash)
INSERT INTO public.admin_users (username, password_hash, role, status)
VALUES ('admin', '$2a$10$rQEY1f8k0yRHVMBAqLDuK.cY.eFhmzL7z1HqV0tH8sE3kP5aIqY3G', 'admin', 'active');

-- Seed default LLM config
INSERT INTO public.llm_model_configs (provider, model_name, temperature, top_p, max_tokens, system_prompt_prefix, is_default)
VALUES ('lovable-ai', 'google/gemini-3-flash-preview', 0.7, 1.0, 4096, 'You are a helpful AI assistant.', true);
