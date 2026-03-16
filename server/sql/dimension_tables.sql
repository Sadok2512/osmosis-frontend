-- ═══════════════════════════════════════════════════════════════════
-- Dimension tables for parameter_dump (~80M rows)
-- Persistent lookup tables for DISTINCT filter values
-- Safe to read at any time (staging + swap pattern)
-- ═══════════════════════════════════════════════════════════════════

-- 1) CREATE DIMENSION TABLES
-- Each table stores DISTINCT non-null values with value as PK

CREATE TABLE IF NOT EXISTS dim_parameter (
  value TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS dim_cell (
  value TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS dim_site (
  value TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS dim_plaque (
  value TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS dim_dor (
  value TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS dim_omc (
  value TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS dim_vendor (
  value TEXT PRIMARY KEY
);

-- 2) INDEXES ON parameter_dump TO SPEED UP DISTINCT EXTRACTION
-- btree indexes allow index-only scans for DISTINCT queries

CREATE INDEX IF NOT EXISTS idx_pd_parameter ON parameter_dump(parameter);
CREATE INDEX IF NOT EXISTS idx_pd_cell_name ON parameter_dump(cell_name);
CREATE INDEX IF NOT EXISTS idx_pd_site_name ON parameter_dump(site_name);
CREATE INDEX IF NOT EXISTS idx_pd_plaque    ON parameter_dump(plaque);
CREATE INDEX IF NOT EXISTS idx_pd_dor       ON parameter_dump(dor);
CREATE INDEX IF NOT EXISTS idx_pd_omc       ON parameter_dump(omc);
CREATE INDEX IF NOT EXISTS idx_pd_vendor    ON parameter_dump(vendor);

-- 3) STORED PROCEDURE: refresh_all_dims()
-- Uses staging tables + atomic swap to avoid breaking reads

CREATE OR REPLACE PROCEDURE refresh_all_dims()
LANGUAGE plpgsql
AS $$
DECLARE
  _start timestamptz := clock_timestamp();
  _dims  text[] := ARRAY['parameter', 'cell', 'site', 'plaque', 'dor', 'omc', 'vendor'];
  _cols  text[] := ARRAY['parameter', 'cell_name', 'site_name', 'plaque', 'dor', 'omc', 'vendor'];
  _i     int;
  _cnt   bigint;
BEGIN
  RAISE NOTICE '[refresh_all_dims] Starting at %', _start;

  FOR _i IN 1..array_length(_dims, 1) LOOP
    -- Create staging table
    EXECUTE format('DROP TABLE IF EXISTS dim_%s_staging', _dims[_i]);
    EXECUTE format(
      'CREATE TABLE dim_%s_staging (value TEXT PRIMARY KEY)',
      _dims[_i]
    );

    -- Populate from parameter_dump
    EXECUTE format(
      'INSERT INTO dim_%s_staging (value)
       SELECT DISTINCT %I FROM parameter_dump WHERE %I IS NOT NULL',
      _dims[_i], _cols[_i], _cols[_i]
    );

    -- Get count for logging
    EXECUTE format('SELECT count(*) FROM dim_%s_staging', _dims[_i]) INTO _cnt;
    RAISE NOTICE '  dim_%: % values', _dims[_i], _cnt;

    -- Atomic swap: rename current → old, staging → current, drop old
    EXECUTE format('ALTER TABLE IF EXISTS dim_%s RENAME TO dim_%s_old', _dims[_i], _dims[_i]);
    EXECUTE format('ALTER TABLE dim_%s_staging RENAME TO dim_%s', _dims[_i], _dims[_i]);
    EXECUTE format('DROP TABLE IF EXISTS dim_%s_old', _dims[_i]);
  END LOOP;

  RAISE NOTICE '[refresh_all_dims] Done in % ms',
    extract(milliseconds from clock_timestamp() - _start)::int;
END;
$$;

-- 4) INITIAL POPULATION (run once)
CALL refresh_all_dims();

-- 5) SCHEDULING WITH pg_cron (if available)
-- Run daily at 03:00 AM
-- Uncomment after installing pg_cron extension:
--
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule(
--   'refresh-dims-daily',
--   '0 3 * * *',
--   $$CALL refresh_all_dims()$$
-- );

-- ═══════════════════════════════════════════════════════════════════
-- ALTERNATIVE: Windows Task Scheduler (if pg_cron not available)
--
-- 1. Create a .bat file (e.g. C:\scripts\refresh_dims.bat):
--    @echo off
--    "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d RAN_OP -c "CALL refresh_all_dims();"
--
-- 2. Schedule with schtasks:
--    schtasks /create /tn "RefreshDimTables" /tr "C:\scripts\refresh_dims.bat" /sc daily /st 03:00
--
-- Or use Windows Task Scheduler GUI:
--   Action: Start a program
--   Program: psql.exe
--   Arguments: -U postgres -d RAN_OP -c "CALL refresh_all_dims();"
-- ═══════════════════════════════════════════════════════════════════
