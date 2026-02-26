
ALTER TABLE public.topo
  ADD COLUMN IF NOT EXISTS dor text,
  ADD COLUMN IF NOT EXISTS eci bigint,
  ADD COLUMN IF NOT EXISTS nci bigint,
  ADD COLUMN IF NOT EXISTS cid integer,
  ADD COLUMN IF NOT EXISTS pci integer,
  ADD COLUMN IF NOT EXISTS remote_electrical_tilt integer,
  ADD COLUMN IF NOT EXISTS etat_cellule text,
  ADD COLUMN IF NOT EXISTS zone_arcep text,
  ADD COLUMN IF NOT EXISTS essentiel text;
