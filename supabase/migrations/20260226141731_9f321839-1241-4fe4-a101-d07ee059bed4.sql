CREATE OR REPLACE FUNCTION public.dump_parameter_distinct_filters()
RETURNS JSON
LANGUAGE sql STABLE
AS $$
  SELECT json_build_object(
    'sites', (SELECT COALESCE(json_agg(DISTINCT site_name ORDER BY site_name), '[]'::json) FROM dump_parameter WHERE site_name IS NOT NULL),
    'parameters', (SELECT COALESCE(json_agg(DISTINCT parameter ORDER BY parameter), '[]'::json) FROM dump_parameter WHERE parameter IS NOT NULL),
    'urs', (SELECT COALESCE(json_agg(DISTINCT ur ORDER BY ur), '[]'::json) FROM dump_parameter WHERE ur IS NOT NULL),
    'plaques', (SELECT COALESCE(json_agg(DISTINCT plaque ORDER BY plaque), '[]'::json) FROM dump_parameter WHERE plaque IS NOT NULL),
    'vendors', (SELECT COALESCE(json_agg(DISTINCT vendor ORDER BY vendor), '[]'::json) FROM dump_parameter WHERE vendor IS NOT NULL)
  );
$$;