
CREATE OR REPLACE FUNCTION public.topo_inventory_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_cells', (SELECT count(*) FROM topo),
    'total_sites', (SELECT count(DISTINCT nom_site) FROM topo),
    'by_techno', (SELECT jsonb_object_agg(t, c) FROM (SELECT COALESCE(techno, 'Inconnu') as t, count(*) as c FROM topo GROUP BY COALESCE(techno, 'Inconnu') ORDER BY c DESC) sub),
    'by_bande', (SELECT jsonb_object_agg(b, c) FROM (SELECT COALESCE(bande, 'Inconnu') as b, count(*) as c FROM topo GROUP BY COALESCE(bande, 'Inconnu') ORDER BY c DESC) sub),
    'by_constructeur', (SELECT jsonb_object_agg(v, c) FROM (SELECT COALESCE(constructeur, 'Inconnu') as v, count(*) as c FROM topo GROUP BY COALESCE(constructeur, 'Inconnu') ORDER BY c DESC) sub),
    'by_dor', (SELECT jsonb_object_agg(d, c) FROM (SELECT COALESCE(dor, 'Inconnu') as d, count(*) as c FROM topo GROUP BY COALESCE(dor, 'Inconnu') ORDER BY c DESC) sub)
  );
$$;
