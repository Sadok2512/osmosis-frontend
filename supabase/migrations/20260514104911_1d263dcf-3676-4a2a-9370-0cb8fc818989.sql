
CREATE OR REPLACE FUNCTION public.topo_distinct_values(p_col text, p_search text DEFAULT NULL, p_limit integer DEFAULT 10000)
RETURNS TABLE(value text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_cols text[] := ARRAY['plaque','dor','region','zone_arcep','techno','bande','constructeur','nom_site','nom_cellule','code_nidt','etat_cellule','hebergeur_leader','essentiel','pci','tac','lac','azimut'];
  sql_text text;
BEGIN
  IF NOT (lower(p_col) = ANY(allowed_cols)) THEN
    RAISE EXCEPTION 'Column % not allowed', p_col;
  END IF;

  IF p_search IS NULL OR length(trim(p_search)) = 0 THEN
    sql_text := format(
      'SELECT DISTINCT %I::text AS value FROM public.topo WHERE %I IS NOT NULL AND %I::text <> '''' ORDER BY value LIMIT %s',
      p_col, p_col, p_col, COALESCE(p_limit, 10000)
    );
  ELSE
    sql_text := format(
      'SELECT DISTINCT %I::text AS value FROM public.topo WHERE %I IS NOT NULL AND %I::text ILIKE %L ORDER BY value LIMIT %s',
      p_col, p_col, p_col, '%' || p_search || '%', COALESCE(p_limit, 10000)
    );
  END IF;

  RETURN QUERY EXECUTE sql_text;
END;
$$;
