CREATE OR REPLACE FUNCTION public.topo_perimeter_count(p_filters jsonb DEFAULT '[]'::jsonb, p_logic text DEFAULT 'AND'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sql_text text;
  where_parts text[] := ARRAY[]::text[];
  joiner text;
  flt jsonb;
  col text;
  vals text[];
  result jsonb;
  allowed_cols text[] := ARRAY['plaque','dor','region','zone_arcep','techno','bande','constructeur','nom_site','nom_cellule','code_nidt','etat_cellule','hebergeur_leader','essentiel'];
BEGIN
  IF p_filters IS NULL OR jsonb_typeof(p_filters) <> 'array' THEN
    p_filters := '[]'::jsonb;
  END IF;

  FOR flt IN SELECT * FROM jsonb_array_elements(p_filters) LOOP
    col := lower(coalesce(flt->>'col',''));
    IF col = ANY(allowed_cols) AND jsonb_typeof(flt->'values') = 'array' AND jsonb_array_length(flt->'values') > 0 THEN
      SELECT array_agg(lower(v)) INTO vals
        FROM jsonb_array_elements_text(flt->'values') AS v;
      where_parts := array_append(
        where_parts,
        format('(lower(%I::text) = ANY(%L::text[]))', col, vals)
      );
    END IF;
  END LOOP;

  joiner := CASE WHEN upper(coalesce(p_logic,'AND')) = 'OR' THEN ' OR ' ELSE ' AND ' END;

  IF array_length(where_parts, 1) IS NULL THEN
    sql_text := 'SELECT jsonb_build_object(''sites'', count(DISTINCT nom_site), ''cells'', count(*)) FROM public.topo';
  ELSE
    sql_text := 'SELECT jsonb_build_object(''sites'', count(DISTINCT nom_site), ''cells'', count(*)) FROM public.topo WHERE '
                || array_to_string(where_parts, joiner);
  END IF;

  EXECUTE sql_text INTO result;
  RETURN result;
END;
$function$;