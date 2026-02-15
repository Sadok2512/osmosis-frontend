
-- Table topologie réseau Orange France
CREATE TABLE public.topo (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code_nidt TEXT NOT NULL,
  nom_site TEXT NOT NULL,
  region TEXT,
  longitude DOUBLE PRECISION,
  latitude DOUBLE PRECISION,
  nom_cellule TEXT NOT NULL,
  techno TEXT,
  bande TEXT,
  constructeur TEXT,
  azimut INTEGER,
  date_mes DATE,
  date_fn8 DATE,
  plaque TEXT,
  hba INTEGER,
  tac INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour recherches fréquentes
CREATE INDEX idx_topo_code_nidt ON public.topo(code_nidt);
CREATE INDEX idx_topo_nom_site ON public.topo(nom_site);
CREATE INDEX idx_topo_techno ON public.topo(techno);
CREATE INDEX idx_topo_plaque ON public.topo(plaque);
CREATE INDEX idx_topo_region ON public.topo(region);
CREATE INDEX idx_topo_constructeur ON public.topo(constructeur);

-- RLS : lecture publique (données topo non sensibles)
ALTER TABLE public.topo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Topo is publicly readable"
  ON public.topo FOR SELECT
  USING (true);

CREATE POLICY "Only authenticated users can insert topo"
  ON public.topo FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Only authenticated users can update topo"
  ON public.topo FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Only authenticated users can delete topo"
  ON public.topo FOR DELETE
  USING (auth.uid() IS NOT NULL);
