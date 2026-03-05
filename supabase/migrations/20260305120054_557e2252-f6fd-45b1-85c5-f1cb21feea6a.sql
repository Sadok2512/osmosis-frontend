CREATE OR REPLACE FUNCTION public.execute_parmy_sql(query_sql text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  normalized_sql text;
BEGIN
  normalized_sql := lower(trim(query_sql));
  
  IF NOT (normalized_sql LIKE 'select%') THEN
    RAISE EXCEPTION 'Only SELECT statements are allowed';
  END IF;
  
  IF NOT (normalized_sql LIKE '%parameter_dump%') THEN
    RAISE EXCEPTION 'Query must target parameter_dump table';
  END IF;
  
  IF normalized_sql ~ '(insert|update|delete|drop|alter|create|truncate|grant|revoke|execute|copy|pg_|information_schema|auth\.|storage\.)' THEN
    RAISE EXCEPTION 'Forbidden SQL operation detected';
  END IF;
  
  IF NOT (normalized_sql LIKE '%limit%') THEN
    query_sql := query_sql || ' LIMIT 500';
  END IF;
  
  EXECUTE 'SELECT COALESCE(json_agg(row_to_json(t)), ''[]''::json) FROM (' || query_sql || ') t'
  INTO result;
  
  RETURN result;
END;
$$;