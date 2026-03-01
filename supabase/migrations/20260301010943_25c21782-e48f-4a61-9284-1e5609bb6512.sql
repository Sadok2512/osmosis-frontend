CREATE TABLE public.parameter_changes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  change_date timestamptz NOT NULL,
  change_type text NOT NULL DEFAULT 'parameter_tuning',
  change_scope text NOT NULL DEFAULT 'radio',
  param_name text NOT NULL,
  old_value text,
  new_value text,
  site_name text,
  cell_name text,
  dr text,
  dor text,
  plaque text,
  zone_arcep text,
  vendor text,
  techno text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.parameter_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parameter_changes publicly readable" ON public.parameter_changes FOR SELECT USING (true);
CREATE POLICY "parameter_changes publicly insertable" ON public.parameter_changes FOR INSERT WITH CHECK (true);
CREATE POLICY "parameter_changes publicly updatable" ON public.parameter_changes FOR UPDATE USING (true);
CREATE POLICY "parameter_changes publicly deletable" ON public.parameter_changes FOR DELETE USING (true);

CREATE INDEX idx_param_changes_date ON public.parameter_changes (change_date);
CREATE INDEX idx_param_changes_scope ON public.parameter_changes (change_scope, change_type);