
CREATE TABLE public.kpi_catalog (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kpi_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  famille TEXT,
  priorite TEXT DEFAULT 'Secondaire',
  techno TEXT,
  unit TEXT DEFAULT '',
  orientation TEXT DEFAULT '0',
  definition TEXT DEFAULT '',
  numerator TEXT DEFAULT '',
  denominator TEXT DEFAULT '',
  formula_sql TEXT DEFAULT '',
  nom_bdd TEXT DEFAULT '',
  value_type TEXT DEFAULT 'gauge',
  default_agg TEXT DEFAULT 'avg',
  is_map_supported BOOLEAN DEFAULT false,
  threshold_warning DOUBLE PRECISION,
  threshold_critical DOUBLE PRECISION,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.kpi_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_catalog publicly readable" ON public.kpi_catalog FOR SELECT USING (true);
CREATE POLICY "kpi_catalog publicly insertable" ON public.kpi_catalog FOR INSERT WITH CHECK (true);
CREATE POLICY "kpi_catalog publicly updatable" ON public.kpi_catalog FOR UPDATE USING (true);
CREATE POLICY "kpi_catalog publicly deletable" ON public.kpi_catalog FOR DELETE USING (true);

CREATE INDEX idx_kpi_catalog_famille ON public.kpi_catalog (famille);
CREATE INDEX idx_kpi_catalog_techno ON public.kpi_catalog (techno);
CREATE INDEX idx_kpi_catalog_priorite ON public.kpi_catalog (priorite);
