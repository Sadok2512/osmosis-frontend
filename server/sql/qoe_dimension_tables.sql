-- ═══════════════════════════════════════════════════════════════════
-- Dimension tables for qoe_metric (pivot model Dimension_1/Dimension_2)
-- Persistent lookup tables for DISTINCT filter values per dimension type
-- Safe to read at any time (staging + swap pattern)
-- ═══════════════════════════════════════════════════════════════════

-- 1) CREATE DIMENSION TABLES
-- One table per known Dimension_1 type, storing DISTINCT Dimension_2 values

CREATE TABLE IF NOT EXISTS dim_qoe_rat       (value TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS dim_qoe_as        (value TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS dim_qoe_application (value TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS dim_qoe_os        (value TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS dim_qoe_device_brand (value TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS dim_qoe_tac       (value TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS dim_qoe_pop       (value TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS dim_qoe_orf       (value TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS dim_qoe_vendor    (value TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS dim_qoe_bande     (value TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS dim_qoe_arcep     (value TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS dim_qoe_dor       (value TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS dim_qoe_plaque    (value TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS dim_qoe_site      (value TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS dim_qoe_cellule   (value TEXT PRIMARY KEY);

-- Date dimension
CREATE TABLE IF NOT EXISTS dim_qoe_date      (value TEXT PRIMARY KEY);

-- 2) INDEXES ON qoe_metric TO SPEED UP DISTINCT EXTRACTION
CREATE INDEX IF NOT EXISTS idx_qm_dim1_dim2 ON qoe_metric("Dimension_1", "Dimension_2");
CREATE INDEX IF NOT EXISTS idx_qm_date_part ON qoe_metric(date_part);

-- 3) STORED PROCEDURE: refresh_qoe_dims()
-- Uses staging tables + atomic swap to avoid breaking reads

CREATE OR REPLACE PROCEDURE refresh_qoe_dims()
LANGUAGE plpgsql
AS $$
DECLARE
  _start   timestamptz := clock_timestamp();
  _dims    text[] := ARRAY[
    'RAT', 'AS', 'Application', 'OS', 'Device_brand',
    'TAC', 'POP', 'ORF', 'Vendor', 'Bande',
    'ARCEP', 'DOR', 'Plaque', 'Site', 'Cellule'
  ];
  _tables  text[] := ARRAY[
    'dim_qoe_rat', 'dim_qoe_as', 'dim_qoe_application', 'dim_qoe_os', 'dim_qoe_device_brand',
    'dim_qoe_tac', 'dim_qoe_pop', 'dim_qoe_orf', 'dim_qoe_vendor', 'dim_qoe_bande',
    'dim_qoe_arcep', 'dim_qoe_dor', 'dim_qoe_plaque', 'dim_qoe_site', 'dim_qoe_cellule'
  ];
  _i   int;
  _cnt bigint;
BEGIN
  RAISE NOTICE '[refresh_qoe_dims] Starting at %', _start;

  -- Refresh each dimension type
  FOR _i IN 1..array_length(_dims, 1) LOOP
    EXECUTE format('DROP TABLE IF EXISTS %s_staging', _tables[_i]);
    EXECUTE format('CREATE TABLE %s_staging (value TEXT PRIMARY KEY)', _tables[_i]);

    EXECUTE format(
      'INSERT INTO %s_staging (value)
       SELECT DISTINCT "Dimension_2" FROM qoe_metric
       WHERE "Dimension_1" = %L AND "Dimension_2" IS NOT NULL',
      _tables[_i], _dims[_i]
    );

    EXECUTE format('SELECT count(*) FROM %s_staging', _tables[_i]) INTO _cnt;
    RAISE NOTICE '  %: % values', _tables[_i], _cnt;

    EXECUTE format('ALTER TABLE IF EXISTS %s RENAME TO %s_old', _tables[_i], _tables[_i]);
    EXECUTE format('ALTER TABLE %s_staging RENAME TO %s', _tables[_i], _tables[_i]);
    EXECUTE format('DROP TABLE IF EXISTS %s_old', _tables[_i]);
  END LOOP;

  -- Refresh date dimension
  EXECUTE 'DROP TABLE IF EXISTS dim_qoe_date_staging';
  EXECUTE 'CREATE TABLE dim_qoe_date_staging (value TEXT PRIMARY KEY)';
  EXECUTE 'INSERT INTO dim_qoe_date_staging (value)
           SELECT DISTINCT date_part::text FROM qoe_metric WHERE date_part IS NOT NULL';
  EXECUTE 'SELECT count(*) FROM dim_qoe_date_staging' INTO _cnt;
  RAISE NOTICE '  dim_qoe_date: % values', _cnt;
  EXECUTE 'ALTER TABLE IF EXISTS dim_qoe_date RENAME TO dim_qoe_date_old';
  EXECUTE 'ALTER TABLE dim_qoe_date_staging RENAME TO dim_qoe_date';
  EXECUTE 'DROP TABLE IF EXISTS dim_qoe_date_old';

  RAISE NOTICE '[refresh_qoe_dims] Done in % ms',
    extract(milliseconds from clock_timestamp() - _start)::int;
END;
$$;

-- 4) INITIAL POPULATION (run once)
CALL refresh_qoe_dims();

-- 5) SCHEDULING WITH pg_cron (if available)
-- SELECT cron.schedule('refresh-qoe-dims-daily', '0 4 * * *', $$CALL refresh_qoe_dims()$$);
