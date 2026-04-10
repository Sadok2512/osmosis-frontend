
CREATE TABLE public.investigators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Untitled Investigator',
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.investigators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Investigators are publicly accessible"
ON public.investigators FOR SELECT USING (true);

CREATE POLICY "Anyone can create investigators"
ON public.investigators FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update investigators"
ON public.investigators FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete investigators"
ON public.investigators FOR DELETE USING (true);
