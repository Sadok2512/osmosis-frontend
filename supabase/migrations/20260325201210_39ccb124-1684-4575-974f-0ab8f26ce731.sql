
-- User profiles table
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles publicly readable" ON public.user_profiles FOR SELECT USING (true);
CREATE POLICY "user_profiles publicly insertable" ON public.user_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "user_profiles publicly updatable" ON public.user_profiles FOR UPDATE USING (true);
CREATE POLICY "user_profiles publicly deletable" ON public.user_profiles FOR DELETE USING (true);

-- User KPI favorites table
CREATE TABLE public.user_kpi_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  kpi_key TEXT NOT NULL,
  module TEXT NOT NULL DEFAULT 'investigator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, kpi_key, module)
);

ALTER TABLE public.user_kpi_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_kpi_favorites publicly readable" ON public.user_kpi_favorites FOR SELECT USING (true);
CREATE POLICY "user_kpi_favorites publicly insertable" ON public.user_kpi_favorites FOR INSERT WITH CHECK (true);
CREATE POLICY "user_kpi_favorites publicly deletable" ON public.user_kpi_favorites FOR DELETE USING (true);
