CREATE TABLE public.map_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  settings JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Allow public access (no auth required for this app)
ALTER TABLE public.map_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to map_views" ON public.map_views FOR ALL USING (true) WITH CHECK (true);