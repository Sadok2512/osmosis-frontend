
-- 1. RPC: Get dashboard-scoped site summaries (4G/5G only, aggregated per site)
CREATE OR REPLACE FUNCTION public.get_dashboard_sites(
  p_dor text[] DEFAULT NULL,
  p_plaque text[] DEFAULT NULL,
  p_zone_arcep text[] DEFAULT NULL,
  p_constructeur text[] DEFAULT NULL,
  p_techno text[] DEFAULT NULL,
  p_bande text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 5000
)
RETURNS TABLE(
  code_nidt text,
  nom_site text,
  vendor text,
  latitude double precision,
  longitude double precision,
  dor text,
  plaque text,
  zone_arcep text,
  region text,
  total_cells bigint,
  lte_cells bigint,
  nr_cells bigint
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    t.code_nidt,
    t.nom_site,
    COALESCE(t.constructeur, 'Unknown') AS vendor,
    AVG(t.latitude) AS latitude,
    AVG(t.longitude) AS longitude,
    MAX(t.dor) AS dor,
    MAX(t.plaque) AS plaque,
    MAX(t.zone_arcep) AS zone_arcep,
    MAX(t.region) AS region,
    COUNT(*)::bigint AS total_cells,
    COUNT(*) FILTER (WHERE UPPER(COALESCE(t.techno,'')) SIMILAR TO '%(4G|LTE)%')::bigint AS lte_cells,
    COUNT(*) FILTER (WHERE UPPER(COALESCE(t.techno,'')) SIMILAR TO '%(5G|NR)%')::bigint AS nr_cells
  FROM public.topo t
  WHERE
    -- Only 4G and 5G
    UPPER(COALESCE(t.techno,'')) SIMILAR TO '%(4G|LTE|5G|NR)%'
    -- Valid coordinates
    AND t.latitude IS NOT NULL AND t.longitude IS NOT NULL
    -- Dashboard filters
    AND (p_dor IS NULL OR t.dor = ANY(p_dor))
    AND (p_plaque IS NULL OR t.plaque = ANY(p_plaque))
    AND (p_zone_arcep IS NULL OR t.zone_arcep = ANY(p_zone_arcep))
    AND (p_constructeur IS NULL OR t.constructeur = ANY(p_constructeur))
    AND (p_techno IS NULL OR t.techno = ANY(p_techno))
    AND (p_bande IS NULL OR t.bande = ANY(p_bande))
    AND (p_search IS NULL OR t.nom_site ILIKE '%' || p_search || '%' OR t.code_nidt ILIKE '%' || p_search || '%')
  GROUP BY t.code_nidt, t.nom_site, COALESCE(t.constructeur, 'Unknown')
  ORDER BY t.nom_site
  LIMIT p_limit;
$$;

-- 2. RPC: Get cells for a single site (on-demand loading)
CREATE OR REPLACE FUNCTION public.get_site_cells(
  p_code_nidt text
)
RETURNS TABLE(
  nom_cellule text,
  techno text,
  bande text,
  constructeur text,
  azimut integer,
  hba integer,
  tilt double precision,
  pci integer,
  eci bigint,
  nci bigint,
  cid integer,
  tac integer,
  lac integer,
  etat_cellule text,
  zone_arcep text,
  essentiel text,
  date_mes date,
  date_fn8 date,
  latitude double precision,
  longitude double precision,
  hebergeur_leader text,
  relative_id text
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    t.nom_cellule,
    t.techno,
    t.bande,
    t.constructeur,
    t.azimut,
    t.hba,
    t.tilt,
    t.pci,
    t.eci,
    t.nci,
    t.cid,
    t.tac,
    t.lac,
    t.etat_cellule,
    t.zone_arcep,
    t.essentiel,
    t.date_mes,
    t.date_fn8,
    t.latitude,
    t.longitude,
    t.hebergeur_leader,
    t.relative_id
  FROM public.topo t
  WHERE t.code_nidt = p_code_nidt
    AND UPPER(COALESCE(t.techno,'')) SIMILAR TO '%(4G|LTE|5G|NR)%'
  ORDER BY t.nom_cellule;
$$;
