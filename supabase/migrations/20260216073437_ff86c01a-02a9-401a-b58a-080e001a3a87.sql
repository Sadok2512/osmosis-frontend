
ALTER TABLE public.dashboards
  ADD COLUMN description TEXT NOT NULL DEFAULT '',
  ADD COLUMN is_shared BOOLEAN NOT NULL DEFAULT true;
