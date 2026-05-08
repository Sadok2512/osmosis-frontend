ALTER TABLE public.dashboards ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_dashboard_view(p_id text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.dashboards
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = p_id
  RETURNING view_count;
$$;