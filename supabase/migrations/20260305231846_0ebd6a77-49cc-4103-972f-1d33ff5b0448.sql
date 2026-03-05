ALTER TABLE public.dashboards 
  ADD COLUMN IF NOT EXISTS dashboard_type text NOT NULL DEFAULT 'analytic_qoe',
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS owner_username text DEFAULT 'PSN TEAM',
  ADD COLUMN IF NOT EXISTS shared_with text[] DEFAULT '{}';