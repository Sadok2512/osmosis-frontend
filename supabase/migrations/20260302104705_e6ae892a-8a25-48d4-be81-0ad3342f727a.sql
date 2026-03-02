
CREATE TABLE IF NOT EXISTS public.topo (
  id BIGSERIAL PRIMARY KEY,
  code_nidt TEXT NOT NULL,
  nom_site TEXT NOT NULL,
  nom_cellule TEXT NOT NULL,
  region TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  techno TEXT,
  bande TEXT,
  constructeur TEXT,
  azimut INTEGER,
  hba INTEGER,
  tac INTEGER,
  lac INTEGER,
  plaque TEXT,
  pci INTEGER,
  eci BIGINT,
  nci BIGINT,
  cid INTEGER,
  lcid INTEGER,
  etat_cellule TEXT,
  zone_arcep TEXT,
  hebergeur_leader TEXT,
  essentiel TEXT,
  relative_id TEXT,
  date_mes DATE,
  date_fn8 DATE,
  tilt INTEGER,
  dor TEXT,
  remote_electrical_tilt INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.topo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Topo is publicly readable" ON public.topo FOR SELECT USING (true);
CREATE POLICY "Topo is publicly insertable" ON public.topo FOR INSERT WITH CHECK (true);
CREATE POLICY "Topo is publicly updatable" ON public.topo FOR UPDATE USING (true);
CREATE POLICY "Topo is publicly deletable" ON public.topo FOR DELETE USING (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_topo_code_nidt ON public.topo(code_nidt);
CREATE INDEX IF NOT EXISTS idx_topo_nom_site ON public.topo(nom_site);
