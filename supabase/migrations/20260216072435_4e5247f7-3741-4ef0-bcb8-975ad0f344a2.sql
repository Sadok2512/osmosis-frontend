
-- Create dashboards table for persistent storage
CREATE TABLE public.dashboards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  widgets JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dashboards ENABLE ROW LEVEL SECURITY;

-- Public read/write for now (no auth in the app)
CREATE POLICY "Dashboards are publicly readable"
  ON public.dashboards FOR SELECT USING (true);

CREATE POLICY "Dashboards are publicly insertable"
  ON public.dashboards FOR INSERT WITH CHECK (true);

CREATE POLICY "Dashboards are publicly updatable"
  ON public.dashboards FOR UPDATE USING (true);

CREATE POLICY "Dashboards are publicly deletable"
  ON public.dashboards FOR DELETE USING (true);
