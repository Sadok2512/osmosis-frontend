const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

// ─── In-memory cache for DISTINCT values (populated at startup) ───
const distinctCache = {}; // { column_name: [values] }
const filteredDistinctCache = {}; // { "col|filter1=v1|filter2=v2": [values] }
const inflightDistinct = {}; // dedup concurrent identical requests
let distinctCacheReady = false;
let distinctCachePromise = null; // resolves when cache is ready

function waitForCache() {
  if (distinctCacheReady) return Promise.resolve();
  if (!distinctCachePromise) return Promise.resolve();
  return distinctCachePromise;
}

// ─── Explicit CORS for local Vite dev server ───
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

// ─── Single shared pool for the server lifetime ───
function getLocalDbConfig(overrides = {}) {
  return {
    host: overrides.host || process.env.PG_HOST || 'localhost',
    port: parseInt(overrides.port || process.env.PG_PORT || '5432'),
    database: overrides.database || process.env.PG_DATABASE || 'RAN_OP',
    user: overrides.user || process.env.PG_USER || 'postgres',
    password: overrides.password ?? process.env.PG_PASSWORD ?? 'root',
  };
}

const dbConfig = getLocalDbConfig();
console.log(`📦 DB config: host=${dbConfig.host} port=${dbConfig.port} db=${dbConfig.database} user=${dbConfig.user}`);

const sharedPool = new Pool({
  ...dbConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test connection at startup
sharedPool.connect(async (err, client, release) => {
  if (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    console.error('   Vérifiez que PostgreSQL tourne et que le fichier server/.env est correct.');
    return;
  }
  console.log('✅ PostgreSQL pool connected to', dbConfig.database);
  try {
    console.log('═══════════════════════════════════════════');
    console.log('🔍 DEBUG: Vérification des tables...');
    console.log('═══════════════════════════════════════════');

    // List ALL public tables
    const allTables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
    const tableNames = allTables.rows.map(r => r.table_name);
    console.log(`📋 Tables dans "${dbConfig.database}" (${tableNames.length}):`, tableNames.join(', '));

    // Check parameter_dump specifically
    const hasParameterDump = tableNames.includes('parameter_dump');
    const hasDumpParameter = tableNames.includes('dump_parameter');
    console.log(`   parameter_dump: ${hasParameterDump ? '✅ EXISTE' : '❌ N\'EXISTE PAS'}`);
    console.log(`   dump_parameter (legacy): ${hasDumpParameter ? '⚠️ EXISTE ENCORE' : '— supprimée'}`);

    const dumpTable = hasParameterDump ? 'parameter_dump' : (hasDumpParameter ? 'dump_parameter' : null);

    if (dumpTable) {
      console.log(`\n📊 Analyse de "${dumpTable}":`);

      // Fast estimate instead of COUNT(*) on 80M+ rows
      const estRes = await client.query(`SELECT reltuples::bigint AS cnt FROM pg_class WHERE relname = $1`, [dumpTable]);
      const totalRows = parseInt(estRes.rows[0]?.cnt || '0');
      console.log(`   Total lignes (estimé): ~${totalRows.toLocaleString()}`);

      if (totalRows > 0) {
        // Skip expensive DISTINCT counts on huge tables — use pg_stats
        console.log(`   (Détails DISTINCT ignorés au démarrage pour éviter les requêtes lentes)`);
      } else {
        console.log(`   ⚠️ TABLE VIDE — aucune donnée importée`);
      }
    } else {
      console.warn('⚠️  AUCUNE table parameter_dump trouvée !');
      console.warn('   Créez-la via Backend Admin ou lancez un import CSV.');
    }

    // Check topo table
    if (tableNames.includes('topo')) {
      const topoEst = await client.query(`SELECT reltuples::bigint AS cnt FROM pg_class WHERE relname = 'topo'`);
      console.log(`\n📊 Table "topo": ~${parseInt(topoEst.rows[0]?.cnt || '0').toLocaleString()} lignes (estimé)`);
    }

    console.log('═══════════════════════════════════════════');

    // ─── Pre-populate DISTINCT cache from dim_* tables (fast) or fallback to DISTINCT ───
    if (dumpTable) {
      let cacheResolve;
      distinctCachePromise = new Promise(r => { cacheResolve = r; });
      console.log('🔄 Pré-chargement du cache DISTINCT...');

      // Map: cache key → dim table name → source column in parameter_dump
      const dimMap = {
        parameter:  { dim: 'dim_parameter', col: 'parameter' },
        site_name:  { dim: 'dim_site',      col: 'site_name' },
        cell_name:  { dim: 'dim_cell',      col: 'cell_name' },
        vendor:     { dim: 'dim_vendor',     col: 'vendor' },
        plaque:     { dim: 'dim_plaque',     col: 'plaque' },
        dor:        { dim: 'dim_dor',        col: 'dor' },
        omc:        { dim: 'dim_omc',        col: 'omc' },
      };

      const cacheStart = Date.now();
      for (const [key, { dim, col }] of Object.entries(dimMap)) {
        try {
          // Try dim table first (instant)
          const r = await client.query(`SELECT value FROM ${dim} ORDER BY value`);
          distinctCache[key] = r.rows.map(row => row.value);
          console.log(`   ⚡ Cache ${key} from ${dim}: ${distinctCache[key].length} valeurs (${Date.now() - cacheStart}ms)`);
        } catch {
          // Fallback: DISTINCT on parameter_dump
          try {
            const r = await client.query(`SELECT DISTINCT ${col} FROM ${dumpTable} WHERE ${col} IS NOT NULL ORDER BY ${col} LIMIT 10000`);
            distinctCache[key] = r.rows.map(row => row[col]);
            console.log(`   ✅ Cache ${key} via DISTINCT: ${distinctCache[key].length} valeurs (${Date.now() - cacheStart}ms)`);
          } catch (e2) {
            console.warn(`   ⚠️ Cache ${key} failed:`, e2.message);
          }
        }
      }
      distinctCacheReady = true;
      cacheResolve();
      console.log(`✅ Cache DISTINCT prêt (${Date.now() - cacheStart}ms total)`);
    }
  } catch (statErr) {
    console.warn('⚠️  Stats check error:', statErr.message);
  } finally {
    release();
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔒 Closing pool...');
  await sharedPool.end();
  process.exit(0);
});

// Helper: create a one-off pool for admin routes (custom config)
function createPool(config) {
  return new Pool({
    host: config.host || 'localhost',
    port: parseInt(config.port || '5432'),
    database: config.database || 'postgres',
    user: config.user || 'postgres',
    password: config.password || '',
    max: 3,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
  });
}

// Build TABLE_SQL dynamically based on pgvector availability
function buildTableSQL(hasVector) {
  const embeddingType = hasVector ? 'VECTOR(768)' : 'TEXT';
  const vectorExt = hasVector ? "CREATE EXTENSION IF NOT EXISTS vector;" : "-- pgvector not available, using TEXT for embeddings";
  return `
${vectorExt}

CREATE TABLE IF NOT EXISTS topo (
  id BIGSERIAL PRIMARY KEY,
  code_nidt TEXT NOT NULL,
  nom_site TEXT NOT NULL,
  nom_cellule TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  azimut INTEGER,
  hba INTEGER,
  techno TEXT,
  bande TEXT,
  constructeur TEXT,
  plaque TEXT,
  region TEXT,
  tac INTEGER,
  dor TEXT,
  pci INTEGER,
  cid INTEGER,
  eci BIGINT,
  nci BIGINT,
  etat_cellule TEXT,
  zone_arcep TEXT,
  essentiel TEXT,
  tilt DOUBLE PRECISION,
  date_mes DATE,
  date_fn8 DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  widgets JSONB DEFAULT '[]',
  is_shared BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rag_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  chunk_index INTEGER DEFAULT 0,
  embedding ${embeddingType},
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qoe_metrics (
  id BIGSERIAL PRIMARY KEY,
  cell_id TEXT NOT NULL,
  site_id TEXT,
  dt DATE NOT NULL,
  service TEXT NOT NULL DEFAULT 'ALL',
  techno TEXT,
  bande TEXT,
  qoe_score_avg DOUBLE PRECISION,
  p50_thr_dn_mbps DOUBLE PRECISION,
  p50_thr_up_mbps DOUBLE PRECISION,
  p95_rtt_ms DOUBLE PRECISION,
  dms_dl_3 DOUBLE PRECISION,
  dms_dl_8 DOUBLE PRECISION,
  dms_dl_30 DOUBLE PRECISION,
  dms_ul_3 DOUBLE PRECISION,
  loss_dn_sum DOUBLE PRECISION,
  traffic_dn_bytes DOUBLE PRECISION,
  traffic_up_bytes DOUBLE PRECISION,
  sessions INTEGER,
  window_full_ratio DOUBLE PRECISION,
  retransmission_rate DOUBLE PRECISION,
  tcp_loss_rate DOUBLE PRECISION,
  out_of_order_rate DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cell_id, dt, service)
);

CREATE TABLE IF NOT EXISTS parameter_dump (
  id BIGSERIAL PRIMARY KEY,
  dn TEXT,
  cell_dn TEXT,
  cell_name TEXT,
  site_name TEXT,
  parameter TEXT NOT NULL,
  value TEXT,
  version TEXT,
  vendor TEXT,
  mrbts_id INTEGER,
  enodeb_id INTEGER,
  gnodeb_id INTEGER,
  bande TEXT,
  freq_downlink DOUBLE PRECISION,
  tgv INTEGER,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  city TEXT,
  dr TEXT,
  ur TEXT,
  dor TEXT,
  plaque TEXT,
  omc TEXT,
  zone_arcep TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parameter_changes (
  id BIGSERIAL PRIMARY KEY,
  change_date TIMESTAMPTZ NOT NULL,
  param_name TEXT NOT NULL,
  change_type TEXT NOT NULL DEFAULT 'parameter_tuning',
  change_scope TEXT NOT NULL DEFAULT 'radio',
  old_value TEXT,
  new_value TEXT,
  site_name TEXT,
  cell_name TEXT,
  description TEXT,
  techno TEXT,
  vendor TEXT,
  dor TEXT,
  dr TEXT,
  plaque TEXT,
  zone_arcep TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_param_changes_date ON parameter_changes(change_date);
CREATE INDEX IF NOT EXISTS idx_param_changes_param ON parameter_changes(param_name);

CREATE INDEX IF NOT EXISTS idx_qoe_cell_dt ON qoe_metrics(cell_id, dt);
CREATE INDEX IF NOT EXISTS idx_qoe_dt ON qoe_metrics(dt);
CREATE INDEX IF NOT EXISTS idx_qoe_service ON qoe_metrics(service);

CREATE TABLE IF NOT EXISTS kpi_qoe_aggregated (
  id BIGSERIAL PRIMARY KEY,
  date_part TEXT NOT NULL,
  dimension_1 TEXT NOT NULL,
  dimension_2 TEXT NOT NULL,
  volume_totale_dl DOUBLE PRECISION, volume_totale_ul DOUBLE PRECISION, volume_totale_totale DOUBLE PRECISION,
  debit_dl DOUBLE PRECISION, debit_dl_max DOUBLE PRECISION, debit_ul DOUBLE PRECISION, debit_ul_max DOUBLE PRECISION,
  rtt_setup_avg DOUBLE PRECISION, rtt_data_avg DOUBLE PRECISION,
  dms_debit_dl_3 DOUBLE PRECISION, dms_debit_dl_8 DOUBLE PRECISION, dms_debit_dl_30 DOUBLE PRECISION,
  dms_debit_ul_1 DOUBLE PRECISION, dms_debit_ul_3 DOUBLE PRECISION, dms_debit_ul_5 DOUBLE PRECISION,
  debit_dl_vol5 DOUBLE PRECISION, debit_ul_vol5 DOUBLE PRECISION,
  dms_3_dl_vol5 DOUBLE PRECISION, dms_8_dl_vol5 DOUBLE PRECISION, dms_30_dl_vol5 BIGINT,
  debit_dl_vol10 DOUBLE PRECISION, debit_ul_vol10 DOUBLE PRECISION,
  dms_3_dl_vol10 BIGINT, dms_8_dl_vol10 DOUBLE PRECISION, dms_30_dl_vol10 BIGINT,
  rtt_setup_0_40000 DOUBLE PRECISION, rtt_setup_40000_80000 DOUBLE PRECISION,
  rtt_setup_80000_150000 DOUBLE PRECISION, rtt_setup_150000_300000 DOUBLE PRECISION, rtt_setup_300000_inf BIGINT,
  rtt_data_0_40000 DOUBLE PRECISION, rtt_data_40000_80000 DOUBLE PRECISION,
  rtt_data_80000_150000 DOUBLE PRECISION, rtt_data_150000_300000 BIGINT, rtt_data_300000_inf BIGINT,
  loss_dl_rate DOUBLE PRECISION, loss_ul_rate DOUBLE PRECISION,
  tcp_retr_rate_dl DOUBLE PRECISION, tcp_retr_rate_ul DOUBLE PRECISION,
  "loss_dl_0_0.01" DOUBLE PRECISION, "loss_dl_0.01_0.03" DOUBLE PRECISION, "loss_dl_0.03_0.05" DOUBLE PRECISION, "loss_dl_0.05_inf" DOUBLE PRECISION,
  "loss_ul_0_0.01" DOUBLE PRECISION, "loss_ul_0.01_0.03" DOUBLE PRECISION, "loss_ul_0.03_0.05" DOUBLE PRECISION, "loss_ul_0.05_inf" DOUBLE PRECISION,
  "retr_dl_0_0.01" DOUBLE PRECISION, "retr_dl_0.01_0.03" DOUBLE PRECISION, "retr_dl_0.03_0.05" DOUBLE PRECISION, "retr_dl_0.05_inf" DOUBLE PRECISION,
  "retr_ul_0_0.01" DOUBLE PRECISION, "retr_ul_0.01_0.03" DOUBLE PRECISION, "retr_ul_0.03_0.05" DOUBLE PRECISION, "retr_ul_0.05_inf" DOUBLE PRECISION,
  session_nbr BIGINT, session_wifi_nbr BIGINT, session_3g2g_nbr BIGINT, session_4g_nbr BIGINT, session_5g_nbr BIGINT,
  session_dur_moy DOUBLE PRECISION, session_dcr DOUBLE PRECISION,
  out_of_order_nbr BIGINT, out_of_order_rate DOUBLE PRECISION,
  wind_full_nbr BIGINT, wind_full_rate DOUBLE PRECISION,
  "fallback_5G_to_4G_rate" DOUBLE PRECISION, "fallback_4G_to_3G2G_rate" DOUBLE PRECISION,
  instability_rate DOUBLE PRECISION,
  time_rat_5g_pct DOUBLE PRECISION, time_rat_4g_pct DOUBLE PRECISION, time_rat_3g2g_pct BIGINT, time_rat_wifi_pct BIGINT,
  "Mauvaise_Session_nbr" BIGINT, "Mauvaise_Session_Rate" DOUBLE PRECISION,
  qoe_index DOUBLE PRECISION, "5G_capable_rate" DOUBLE PRECISION, "5gue_attached_4G_rate" DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date_part, dimension_1, dimension_2)
);
CREATE INDEX IF NOT EXISTS idx_kqi_agg_date ON kpi_qoe_aggregated(date_part);
CREATE INDEX IF NOT EXISTS idx_kqi_agg_dim1 ON kpi_qoe_aggregated(dimension_1);

CREATE TABLE IF NOT EXISTS ml_features (
  id BIGSERIAL PRIMARY KEY,
  date_part TEXT NOT NULL,
  dimension_1 TEXT NOT NULL,
  dimension_2 TEXT NOT NULL,
  volume_totale_dl DOUBLE PRECISION, volume_totale_ul DOUBLE PRECISION, volume_totale_totale DOUBLE PRECISION,
  debit_dl DOUBLE PRECISION, debit_dl_max DOUBLE PRECISION, debit_ul DOUBLE PRECISION, debit_ul_max DOUBLE PRECISION,
  rtt_setup_avg DOUBLE PRECISION, rtt_data_avg DOUBLE PRECISION,
  dms_debit_dl_3 DOUBLE PRECISION, dms_debit_dl_8 DOUBLE PRECISION, dms_debit_dl_30 DOUBLE PRECISION,
  dms_debit_ul_1 DOUBLE PRECISION, dms_debit_ul_3 DOUBLE PRECISION, dms_debit_ul_5 DOUBLE PRECISION,
  debit_dl_vol5 DOUBLE PRECISION, debit_ul_vol5 DOUBLE PRECISION,
  dms_3_dl_vol5 DOUBLE PRECISION, dms_8_dl_vol5 DOUBLE PRECISION, dms_30_dl_vol5 BIGINT,
  debit_dl_vol10 DOUBLE PRECISION, debit_ul_vol10 DOUBLE PRECISION,
  dms_3_dl_vol10 BIGINT, dms_8_dl_vol10 DOUBLE PRECISION, dms_30_dl_vol10 BIGINT,
  rtt_setup_0_40000 DOUBLE PRECISION, rtt_setup_40000_80000 DOUBLE PRECISION,
  rtt_setup_80000_150000 DOUBLE PRECISION, rtt_setup_150000_300000 DOUBLE PRECISION, rtt_setup_300000_inf BIGINT,
  rtt_data_0_40000 DOUBLE PRECISION, rtt_data_40000_80000 DOUBLE PRECISION,
  rtt_data_80000_150000 DOUBLE PRECISION, rtt_data_150000_300000 BIGINT, rtt_data_300000_inf BIGINT,
  loss_dl_rate DOUBLE PRECISION, loss_ul_rate DOUBLE PRECISION,
  tcp_retr_rate_dl DOUBLE PRECISION, tcp_retr_rate_ul DOUBLE PRECISION,
  "loss_dl_0_0.01" DOUBLE PRECISION, "loss_dl_0.01_0.03" DOUBLE PRECISION, "loss_dl_0.03_0.05" DOUBLE PRECISION, "loss_dl_0.05_inf" DOUBLE PRECISION,
  "loss_ul_0_0.01" DOUBLE PRECISION, "loss_ul_0.01_0.03" DOUBLE PRECISION, "loss_ul_0.03_0.05" DOUBLE PRECISION, "loss_ul_0.05_inf" DOUBLE PRECISION,
  "retr_dl_0_0.01" DOUBLE PRECISION, "retr_dl_0.01_0.03" DOUBLE PRECISION, "retr_dl_0.03_0.05" DOUBLE PRECISION, "retr_dl_0.05_inf" DOUBLE PRECISION,
  "retr_ul_0_0.01" DOUBLE PRECISION, "retr_ul_0.01_0.03" DOUBLE PRECISION, "retr_ul_0.03_0.05" DOUBLE PRECISION, "retr_ul_0.05_inf" DOUBLE PRECISION,
  session_nbr BIGINT, session_wifi_nbr BIGINT, session_3g2g_nbr BIGINT, session_4g_nbr BIGINT, session_5g_nbr BIGINT,
  session_dur_moy DOUBLE PRECISION, session_dcr DOUBLE PRECISION,
  out_of_order_nbr BIGINT, out_of_order_rate DOUBLE PRECISION,
  wind_full_nbr BIGINT, wind_full_rate DOUBLE PRECISION,
  "fallback_5G_to_4G_rate" DOUBLE PRECISION, "fallback_4G_to_3G2G_rate" DOUBLE PRECISION,
  instability_rate DOUBLE PRECISION,
  time_rat_5g_pct DOUBLE PRECISION, time_rat_4g_pct DOUBLE PRECISION, time_rat_3g2g_pct BIGINT, time_rat_wifi_pct BIGINT,
  "Mauvaise_Session_nbr" BIGINT, "Mauvaise_Session_Rate" DOUBLE PRECISION,
  qoe_index DOUBLE PRECISION, "5G_capable_rate" DOUBLE PRECISION, "5gue_attached_4G_rate" DOUBLE PRECISION,
  -- deltas, scores, z-scores, percentiles (abbreviated — all DOUBLE PRECISION or TEXT)
  debit_dl_delta7j_pct DOUBLE PRECISION, "debit_dl_J-7" DOUBLE PRECISION,
  debit_ul_delta7j_pct DOUBLE PRECISION, "debit_ul_J-7" DOUBLE PRECISION,
  rtt_setup_avg_delta7j_pct DOUBLE PRECISION, "rtt_setup_avg_J-7" DOUBLE PRECISION,
  rtt_data_avg_delta7j_pct DOUBLE PRECISION, "rtt_data_avg_J-7" DOUBLE PRECISION,
  loss_dl_rate_delta7j_pct DOUBLE PRECISION, "loss_dl_rate_J-7" DOUBLE PRECISION,
  loss_ul_rate_delta7j_pct DOUBLE PRECISION, "loss_ul_rate_J-7" DOUBLE PRECISION,
  tcp_retr_rate_dl_delta7j_pct DOUBLE PRECISION, "tcp_retr_rate_dl_J-7" DOUBLE PRECISION,
  tcp_retr_rate_ul_delta7j_pct DOUBLE PRECISION, "tcp_retr_rate_ul_J-7" DOUBLE PRECISION,
  session_nbr_delta7j_pct DOUBLE PRECISION, "session_nbr_J-7" BIGINT,
  session_dcr_delta7j_pct DOUBLE PRECISION, "session_dcr_J-7" DOUBLE PRECISION,
  qoe_index_delta7j_pct DOUBLE PRECISION, "qoe_index_J-7" DOUBLE PRECISION,
  "Mauvaise_Session_Rate_delta7j_pct" DOUBLE PRECISION, "Mauvaise_Session_Rate_J-7" DOUBLE PRECISION,
  dms_debit_dl_3_delta7j_pct DOUBLE PRECISION, "dms_debit_dl_3_J-7" DOUBLE PRECISION,
  dms_debit_dl_8_delta7j_pct DOUBLE PRECISION, "dms_debit_dl_8_J-7" DOUBLE PRECISION,
  dms_debit_dl_30_delta7j_pct DOUBLE PRECISION, "dms_debit_dl_30_J-7" DOUBLE PRECISION,
  dms_debit_ul_1_delta7j_pct DOUBLE PRECISION, "dms_debit_ul_1_J-7" DOUBLE PRECISION,
  dms_debit_ul_3_delta7j_pct DOUBLE PRECISION, "dms_debit_ul_3_J-7" DOUBLE PRECISION,
  dms_debit_ul_5_delta7j_pct DOUBLE PRECISION, "dms_debit_ul_5_J-7" DOUBLE PRECISION,
  out_of_order_rate_delta7j_pct DOUBLE PRECISION, "out_of_order_rate_J-7" DOUBLE PRECISION,
  wind_full_rate_delta7j_pct DOUBLE PRECISION, "wind_full_rate_J-7" DOUBLE PRECISION,
  "fallback_5G_to_4G_rate_delta7j_pct" DOUBLE PRECISION, "fallback_5G_to_4G_rate_J-7" DOUBLE PRECISION,
  instability_rate_delta7j_pct DOUBLE PRECISION, "instability_rate_J-7" DOUBLE PRECISION,
  time_rat_5g_pct_delta7j_pct DOUBLE PRECISION, "time_rat_5g_pct_J-7" DOUBLE PRECISION,
  time_rat_4g_pct_delta7j_pct DOUBLE PRECISION, "time_rat_4g_pct_J-7" DOUBLE PRECISION,
  volume_totale_dl_delta7j_pct DOUBLE PRECISION, "volume_totale_dl_J-7" DOUBLE PRECISION,
  volume_totale_ul_delta7j_pct DOUBLE PRECISION, "volume_totale_ul_J-7" DOUBLE PRECISION,
  session_dur_moy_delta7j_pct DOUBLE PRECISION, "session_dur_moy_J-7" DOUBLE PRECISION,
  debit_dl_delta14j_pct DOUBLE PRECISION, "debit_dl_J-14" DOUBLE PRECISION,
  debit_ul_delta14j_pct DOUBLE PRECISION, "debit_ul_J-14" DOUBLE PRECISION,
  rtt_setup_avg_delta14j_pct DOUBLE PRECISION, "rtt_setup_avg_J-14" DOUBLE PRECISION,
  rtt_data_avg_delta14j_pct DOUBLE PRECISION, "rtt_data_avg_J-14" DOUBLE PRECISION,
  loss_dl_rate_delta14j_pct DOUBLE PRECISION, "loss_dl_rate_J-14" DOUBLE PRECISION,
  loss_ul_rate_delta14j_pct DOUBLE PRECISION, "loss_ul_rate_J-14" DOUBLE PRECISION,
  tcp_retr_rate_dl_delta14j_pct DOUBLE PRECISION, "tcp_retr_rate_dl_J-14" DOUBLE PRECISION,
  tcp_retr_rate_ul_delta14j_pct DOUBLE PRECISION, "tcp_retr_rate_ul_J-14" DOUBLE PRECISION,
  session_nbr_delta14j_pct DOUBLE PRECISION, "session_nbr_J-14" BIGINT,
  session_dcr_delta14j_pct DOUBLE PRECISION, "session_dcr_J-14" DOUBLE PRECISION,
  qoe_index_delta14j_pct DOUBLE PRECISION, "qoe_index_J-14" DOUBLE PRECISION,
  "Mauvaise_Session_Rate_delta14j_pct" DOUBLE PRECISION, "Mauvaise_Session_Rate_J-14" DOUBLE PRECISION,
  dms_debit_dl_3_delta14j_pct DOUBLE PRECISION, "dms_debit_dl_3_J-14" DOUBLE PRECISION,
  dms_debit_dl_8_delta14j_pct DOUBLE PRECISION, "dms_debit_dl_8_J-14" DOUBLE PRECISION,
  dms_debit_dl_30_delta14j_pct DOUBLE PRECISION, "dms_debit_dl_30_J-14" DOUBLE PRECISION,
  dms_debit_ul_1_delta14j_pct DOUBLE PRECISION, "dms_debit_ul_1_J-14" DOUBLE PRECISION,
  dms_debit_ul_3_delta14j_pct DOUBLE PRECISION, "dms_debit_ul_3_J-14" DOUBLE PRECISION,
  dms_debit_ul_5_delta14j_pct DOUBLE PRECISION, "dms_debit_ul_5_J-14" DOUBLE PRECISION,
  out_of_order_rate_delta14j_pct DOUBLE PRECISION, "out_of_order_rate_J-14" DOUBLE PRECISION,
  wind_full_rate_delta14j_pct DOUBLE PRECISION, "wind_full_rate_J-14" DOUBLE PRECISION,
  "fallback_5G_to_4G_rate_delta14j_pct" DOUBLE PRECISION, "fallback_5G_to_4G_rate_J-14" DOUBLE PRECISION,
  instability_rate_delta14j_pct DOUBLE PRECISION, "instability_rate_J-14" DOUBLE PRECISION,
  time_rat_5g_pct_delta14j_pct DOUBLE PRECISION, "time_rat_5g_pct_J-14" DOUBLE PRECISION,
  time_rat_4g_pct_delta14j_pct DOUBLE PRECISION, "time_rat_4g_pct_J-14" DOUBLE PRECISION,
  volume_totale_dl_delta14j_pct DOUBLE PRECISION, "volume_totale_dl_J-14" DOUBLE PRECISION,
  volume_totale_ul_delta14j_pct DOUBLE PRECISION, "volume_totale_ul_J-14" DOUBLE PRECISION,
  session_dur_moy_delta14j_pct DOUBLE PRECISION, "session_dur_moy_J-14" DOUBLE PRECISION,
  score_debit DOUBLE PRECISION, score_latence DOUBLE PRECISION, score_loss DOUBLE PRECISION,
  score_retr DOUBLE PRECISION, score_stabilite DOUBLE PRECISION, score_drop DOUBLE PRECISION, score_dms DOUBLE PRECISION,
  qoe_composite DOUBLE PRECISION,
  trend_debit_dl TEXT, trend_rtt TEXT, trend_qoe TEXT,
  z_debit_dl DOUBLE PRECISION, pct_debit_dl DOUBLE PRECISION,
  z_debit_ul DOUBLE PRECISION, pct_debit_ul DOUBLE PRECISION,
  z_rtt_setup_avg DOUBLE PRECISION, pct_rtt_setup_avg DOUBLE PRECISION,
  z_rtt_data_avg DOUBLE PRECISION, pct_rtt_data_avg DOUBLE PRECISION,
  z_loss_dl_rate DOUBLE PRECISION, pct_loss_dl_rate DOUBLE PRECISION,
  z_loss_ul_rate DOUBLE PRECISION, pct_loss_ul_rate DOUBLE PRECISION,
  z_tcp_retr_rate_dl DOUBLE PRECISION, pct_tcp_retr_rate_dl DOUBLE PRECISION,
  z_tcp_retr_rate_ul DOUBLE PRECISION, pct_tcp_retr_rate_ul DOUBLE PRECISION,
  z_session_nbr DOUBLE PRECISION, pct_session_nbr DOUBLE PRECISION,
  z_session_dcr DOUBLE PRECISION, pct_session_dcr DOUBLE PRECISION,
  z_qoe_index DOUBLE PRECISION, pct_qoe_index DOUBLE PRECISION,
  "z_Mauvaise_Session_Rate" DOUBLE PRECISION, "pct_Mauvaise_Session_Rate" DOUBLE PRECISION,
  z_dms_debit_dl_3 DOUBLE PRECISION, pct_dms_debit_dl_3 DOUBLE PRECISION,
  z_dms_debit_dl_8 DOUBLE PRECISION, pct_dms_debit_dl_8 DOUBLE PRECISION,
  z_dms_debit_dl_30 DOUBLE PRECISION, pct_dms_debit_dl_30 DOUBLE PRECISION,
  z_dms_debit_ul_1 DOUBLE PRECISION, pct_dms_debit_ul_1 DOUBLE PRECISION,
  z_dms_debit_ul_3 DOUBLE PRECISION, pct_dms_debit_ul_3 DOUBLE PRECISION,
  z_dms_debit_ul_5 DOUBLE PRECISION, pct_dms_debit_ul_5 DOUBLE PRECISION,
  z_out_of_order_rate DOUBLE PRECISION, pct_out_of_order_rate DOUBLE PRECISION,
  z_wind_full_rate DOUBLE PRECISION, pct_wind_full_rate DOUBLE PRECISION,
  z_instability_rate DOUBLE PRECISION, pct_instability_rate DOUBLE PRECISION,
  z_time_rat_5g_pct DOUBLE PRECISION, pct_time_rat_5g_pct DOUBLE PRECISION,
  z_time_rat_4g_pct DOUBLE PRECISION, pct_time_rat_4g_pct DOUBLE PRECISION,
  z_volume_totale_dl DOUBLE PRECISION, pct_volume_totale_dl DOUBLE PRECISION,
  z_volume_totale_ul DOUBLE PRECISION, pct_volume_totale_ul DOUBLE PRECISION,
  z_session_dur_moy DOUBLE PRECISION, pct_session_dur_moy DOUBLE PRECISION,
  "z_fallback_5G_to_4G_rate" DOUBLE PRECISION, "pct_fallback_5G_to_4G_rate" DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date_part, dimension_1, dimension_2)
);
CREATE INDEX IF NOT EXISTS idx_ml_feat_date ON ml_features(date_part);
CREATE INDEX IF NOT EXISTS idx_ml_feat_dim1 ON ml_features(dimension_1);
`;
}

const ENSURE_PARAMETER_DUMP_SQL = `
CREATE TABLE IF NOT EXISTS parameter_dump (
  dn TEXT,
  cell_dn TEXT,
  cell_name TEXT,
  site_name TEXT,
  parameter TEXT NOT NULL,
  value TEXT,
  version TEXT,
  vendor TEXT,
  netact TEXT,
  mrbts_id INTEGER,
  enodeb_id INTEGER,
  gnodeb_id INTEGER,
  bande TEXT,
  dor TEXT,
  plaque TEXT,
  zone_arcep TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION
);
`;

// ─── /api/backend-admin ───
app.post('/api/backend-admin', async (req, res) => {
  const { action, config } = req.body;
  const pool = createPool(config);

  try {
    if (action === 'test_connection') {
      const result = await pool.query('SELECT version()');
      const version = result.rows[0]?.version?.split(' ').slice(0, 2).join(' ');
      return res.json({ success: true, version });
    }

    if (action === 'create_tables') {
      // Check if pgvector is available
      let hasVector = false;
      try {
        await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
        hasVector = true;
      } catch {
        // pgvector not installed, will use TEXT for embeddings
      }

      await pool.query(buildTableSQL(hasVector));
      await pool.query(ENSURE_PARAMETER_DUMP_SQL); // safety net for legacy instances

      // Count actual tables created
      const schema = config.schema || 'public';
      const countRes = await pool.query(
        `SELECT COUNT(*)::int as cnt FROM information_schema.tables
         WHERE table_schema = $1 AND table_type = 'BASE TABLE'
         AND table_name IN ('topo', 'dashboards', 'rag_documents', 'qoe_metrics', 'parameter_dump', 'kpi_qoe_aggregated', 'ml_features')`, [schema]
      );
      const tablesCreated = countRes.rows[0]?.cnt || 0;

      return res.json({ success: true, tables_created: tablesCreated, pgvector: hasVector });
    }

    if (action === 'query_tables') {
      const schema = config.schema || 'public';
      const tables = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1 AND table_type = 'BASE TABLE'
         AND table_name IN ('topo', 'dashboards', 'rag_documents', 'qoe_metrics', 'parameter_dump', 'kpi_qoe_aggregated', 'ml_features')
         ORDER BY table_name`, [schema]
      );

      const result = [];
      for (const t of tables.rows) {
        const name = t.table_name;
        const countRes = await pool.query(`SELECT COUNT(*)::int as cnt FROM ${schema}.${name}`);
        const cols = await pool.query(
          `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2
           ORDER BY ordinal_position`, [schema, name]
        );
        result.push({
          name,
          rowCount: countRes.rows[0]?.cnt || 0,
          columns: cols.rows.map(c => ({
            name: c.column_name,
            type: c.data_type,
            nullable: c.is_nullable === 'YES',
          })),
        });
      }
      return res.json({ success: true, tables: result });
    }

    res.json({ success: false, error: 'Action inconnue' });
  } catch (e) {
    res.json({ success: false, error: e.message });
  } finally {
    await pool.end();
  }
});

// ─── /api/import-topo ───
app.post('/api/import-topo', async (req, res) => {
  const { rows, clear_before, config } = req.body;
  const pool = createPool(config || { host: 'localhost', port: '5432', database: 'postgres', user: 'postgres', password: 'root' });

  try {
    if (clear_before) {
      await pool.query('DELETE FROM topo');
    }

    let inserted = 0;
    for (const row of rows) {
      await pool.query(
        `INSERT INTO topo (code_nidt, nom_site, nom_cellule, latitude, longitude, azimut, hba, techno, bande, constructeur, plaque, region, tac, date_mes, date_fn8, pci, cid, eci, nci, etat_cellule, zone_arcep, essentiel, tilt, lac, hebergeur_leader, relative_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
         ON CONFLICT DO NOTHING`,
        [row.code_nidt, row.nom_site, row.nom_cellule, row.latitude, row.longitude,
         row.azimut, row.hba, row.techno, row.bande, row.constructeur,
         row.plaque, row.region, row.tac, row.date_mes, row.date_fn8,
         row.pci || null, row.cid || null, row.eci || null, row.nci || null,
         row.etat_cellule || null, row.zone_arcep || null, row.essentiel || null,
         row.tilt != null && row.tilt !== '' ? parseFloat(row.tilt) : null,
         row.lac || null, row.hebergeur_leader || null, row.relative_id || null]
      );
      inserted++;
    }

    res.json({ success: true, inserted, total: rows.length });
  } catch (e) {
    res.json({ success: false, error: e.message });
  } finally {
    await pool.end();
  }
});

// ─── /api/topo (read — paginated, default limit 100k) ───
app.get('/api/topo', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100000, 1), 500000);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const full = req.query.full === '1';

    const countRes = await sharedPool.query('SELECT COUNT(*) AS total FROM topo');
    const total = parseInt(countRes.rows[0]?.total || '0');

    const cols = full
      ? `id, code_nidt, nom_site, region, longitude, latitude, nom_cellule,
              techno, bande, constructeur, azimut, plaque, hba, tac,
              date_mes, date_fn8, dor, pci, cid, eci, nci,
              etat_cellule, zone_arcep, essentiel, tilt`
      : `code_nidt, nom_site, region, longitude, latitude, nom_cellule,
              techno, bande, constructeur, azimut, plaque, hba, tac,
              date_mes, date_fn8, tilt`;

    const result = await sharedPool.query(
      `SELECT ${cols} FROM topo ORDER BY id LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    console.log(`[/api/topo] ${result.rows.length}/${total} rows (offset=${offset}${full ? ', full' : ''})`);
    res.json({ rows: result.rows, total });
  } catch (e) {
    console.error('[/api/topo]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Detect available topo columns once at startup ───
let topoColumnsSet = null; // Set of column names available in the topo table

async function getTopoColumns() {
  if (topoColumnsSet) return topoColumnsSet;
  try {
    const res = await sharedPool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'topo' AND table_schema = 'public'
    `);
    topoColumnsSet = new Set(res.rows.map(r => r.column_name));
    console.log(`[topo] detected columns: ${[...topoColumnsSet].join(', ')}`);
  } catch {
    topoColumnsSet = new Set(); // fallback: empty → all optional cols skipped
  }
  return topoColumnsSet;
}

// ─── /api/topo/sites (aggregated by code_nidt, bbox + filters) ───
app.get('/api/topo/sites', async (req, res) => {
  try {
    const cols = await getTopoColumns();
    const hasCol = (c) => cols.has(c);

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 8000, 1), 30000);
    const params = [];
    const wheres = ['latitude IS NOT NULL', 'longitude IS NOT NULL'];
    let paramIdx = 1;

    // bbox: minLng,minLat,maxLng,maxLat
    if (req.query.bbox) {
      const parts = req.query.bbox.split(',').map(Number);
      if (parts.length === 4 && parts.every(v => !isNaN(v))) {
        const [minLng, minLat, maxLng, maxLat] = parts;
        wheres.push(`longitude >= $${paramIdx++}`); params.push(minLng);
        wheres.push(`latitude >= $${paramIdx++}`); params.push(minLat);
        wheres.push(`longitude <= $${paramIdx++}`); params.push(maxLng);
        wheres.push(`latitude <= $${paramIdx++}`); params.push(maxLat);
      }
    }

    // Optional filters — only apply if column exists in the table
    const filterCols = { dor: 'dor', vendor: 'constructeur', plaque: 'plaque', techno: 'techno', bande: 'bande', zone_arcep: 'zone_arcep' };
    for (const [qp, col] of Object.entries(filterCols)) {
      if (req.query[qp] && req.query[qp] !== 'ALL' && hasCol(col)) {
        wheres.push(`${col} = $${paramIdx++}`);
        params.push(req.query[qp]);
      }
    }

    // Free-text search on nom_site or code_nidt
    if (req.query.q && req.query.q.trim()) {
      const pattern = `%${req.query.q.trim()}%`;
      wheres.push(`(nom_site ILIKE $${paramIdx} OR code_nidt ILIKE $${paramIdx})`);
      params.push(pattern);
      paramIdx++;
    }

    const whereClause = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';

    // include_cells=1 → return cell-level data for sector rendering
    const includeCells = req.query.include_cells === '1';

    if (includeCells) {
      // Build SELECT list dynamically based on available columns
      const baseCellCols = ['code_nidt', 'nom_site', 'nom_cellule', 'latitude', 'longitude'];
      const optionalCellCols = ['azimut', 'hba', 'techno', 'bande', 'constructeur', 'plaque', 'dor', 'region',
        'tac', 'pci', 'cid', 'eci', 'nci', 'etat_cellule', 'zone_arcep', 'essentiel',
        'tilt', 'date_mes', 'date_fn8'];
      const selectCols = [...baseCellCols, ...optionalCellCols.filter(c => hasCol(c))];

      const sql = `
        SELECT ${selectCols.join(', ')}
        FROM topo ${whereClause}
        ORDER BY code_nidt, nom_cellule
        LIMIT $${paramIdx}`;
      params.push(limit * 10);

      const result = await sharedPool.query(sql, params);
      console.log(`[/api/topo/sites?include_cells] ${result.rows.length} cells`);
      return res.json({ cells: result.rows, total: result.rows.length });
    }

    // Aggregated site-level query — build SELECT dynamically
    const aggParts = [
      'code_nidt',
      'MIN(nom_site) AS nom_site',
      'AVG(latitude) AS lat',
      'AVG(longitude) AS lng',
      'COUNT(*) AS nb_cells',
    ];
    if (hasCol('constructeur')) aggParts.push('MIN(constructeur) AS vendor');
    if (hasCol('plaque')) aggParts.push('MIN(plaque) AS plaque');
    if (hasCol('dor')) aggParts.push('MIN(dor) AS dor');
    if (hasCol('region')) aggParts.push('MIN(region) AS region');

    const sql = `
      SELECT ${aggParts.join(', ')}
      FROM topo
      ${whereClause}
      GROUP BY code_nidt
      ORDER BY code_nidt
      LIMIT $${paramIdx}`;
    params.push(limit);

    const countSql = `SELECT COUNT(DISTINCT code_nidt) AS total FROM topo ${whereClause}`;

    const [result, countRes] = await Promise.all([
      sharedPool.query(sql, params),
      sharedPool.query(countSql, params.slice(0, -1)),
    ]);

    const total = parseInt(countRes.rows[0]?.total || '0');
    console.log(`[/api/topo/sites] ${result.rows.length}/${total} sites (bbox=${!!req.query.bbox})`);
    res.json({ sites: result.rows, total });
  } catch (e) {
    console.error('[/api/topo/sites]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/dashboards CRUD ───
app.get('/api/dashboards', async (req, res) => {
  const pool = createPool({ host: 'localhost', port: '5432', database: 'postgres', user: 'postgres', password: 'root' });
  try {
    const result = await pool.query('SELECT * FROM dashboards ORDER BY updated_at DESC');
    res.json(result.rows);
  } catch (e) {
    res.json({ error: e.message });
  } finally {
    await pool.end();
  }
});

app.post('/api/dashboards', async (req, res) => {
  const { id, name, description, widgets, is_shared } = req.body;
  const pool = createPool({ host: 'localhost', port: '5432', database: 'postgres', user: 'postgres', password: 'root' });
  try {
    await pool.query(
      `INSERT INTO dashboards (id, name, description, widgets, is_shared, updated_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (id) DO UPDATE SET name=$2, description=$3, widgets=$4, is_shared=$5, updated_at=now()`,
      [id, name, description || '', JSON.stringify(widgets || []), is_shared !== false]
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ error: e.message });
  } finally {
    await pool.end();
  }
});

app.delete('/api/dashboards/:id', async (req, res) => {
  const pool = createPool({ host: 'localhost', port: '5432', database: 'postgres', user: 'postgres', password: 'root' });
  try {
    await pool.query('DELETE FROM dashboards WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.json({ error: e.message });
  } finally {
    await pool.end();
  }
});

// ─── /api/rag-embed ───
app.post('/api/rag-embed', async (req, res) => {
  const { action, filename, text, chunks } = req.body;
  const pool = createPool({ host: 'localhost', port: '5432', database: 'postgres', user: 'postgres', password: 'root' });

  try {
    if (action === 'list') {
      const result = await pool.query(
        `SELECT filename, COUNT(*) as chunks, MIN(created_at) as created_at
         FROM rag_documents GROUP BY filename ORDER BY MIN(created_at) DESC`
      );
      return res.json({ files: result.rows });
    }

    if (action === 'delete') {
      await pool.query('DELETE FROM rag_documents WHERE filename = $1', [filename]);
      return res.json({ success: true });
    }

    if (action === 'index' || !action) {
      // Simple chunking without embeddings (embeddings need a separate service)
      const content = text || '';
      const chunkSize = 1000;
      const chunkTexts = [];
      for (let i = 0; i < content.length; i += chunkSize) {
        chunkTexts.push(content.substring(i, i + chunkSize));
      }

      for (let i = 0; i < chunkTexts.length; i++) {
        await pool.query(
          `INSERT INTO rag_documents (filename, content, chunk_index) VALUES ($1, $2, $3)`,
          [filename, chunkTexts[i], i]
        );
      }
      return res.json({ success: true, chunks: chunkTexts.length });
    }

    res.json({ error: 'Action inconnue' });
  } catch (e) {
    res.json({ error: e.message });
  } finally {
    await pool.end();
  }
});

// ─── /api/import-dump (import parameter_dump CSV rows) ───
app.post('/api/import-dump', async (req, res) => {
  const { rows, clear_before, config } = req.body;
  const pool = createPool(config || getLocalDbConfig());

  try {
    const dumpTable = 'parameter_dump';
    await pool.query(ENSURE_PARAMETER_DUMP_SQL);

    if (clear_before) {
      await pool.query(`DELETE FROM ${dumpTable}`);
    }

    let inserted = 0;
    const BATCH = 100;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const values = [];
      const placeholders = [];
      let idx = 1;
      for (const r of batch) {
        placeholders.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6},$${idx+7},$${idx+8},$${idx+9},$${idx+10},$${idx+11},$${idx+12},$${idx+13},$${idx+14},$${idx+15},$${idx+16},$${idx+17},$${idx+18},$${idx+19},$${idx+20},$${idx+21},$${idx+22})`);
        values.push(
          r.dn || null, r.enodeb_id || null, r.mrbts_id || null, r.gnodeb_id || null,
          r.cell_dn || null, r.cell_name || null, r.vendor || null, r.dor || null,
          r.omc || null, r.plaque || null, r.longitude || null, r.latitude || null,
          r.site_name || null, r.freq_downlink || null, r.bande || null, r.ur || null,
          r.dr || null, r.zone_arcep || null, r.tgv || null, r.city || null,
          r.parameter || 'UNKNOWN', r.value || null, r.version || null
        );
        idx += 23;
      }
      await pool.query(
        `INSERT INTO ${dumpTable} (dn, enodeb_id, mrbts_id, gnodeb_id, cell_dn, cell_name, vendor, dor, omc, plaque, longitude, latitude, site_name, freq_downlink, bande, ur, dr, zone_arcep, tgv, city, parameter, value, version)
         VALUES ${placeholders.join(',')}`,
        values
      );
      inserted += batch.length;
    }

    res.json({ success: true, table: dumpTable, inserted, total: rows.length });
  } catch (e) {
    res.json({ success: false, error: e.message });
  } finally {
    await pool.end();
  }
});
// (dump-parameter handler is defined below — single instance using sharedPool)

// ─── Helper: detect distribution/aggregation questions ───
function isDimensionQueryLocal(query) {
  const n = query.toLowerCase();
  const dimKw = "(dors?|vendor|fournisseurs?|bandes?|rats?|techno|technologie|plaques?|regions?|applications?|sites?|cellules?|arcep|tac|os|devices?|pop|as|orf)";
  const dimPatterns = [
    new RegExp(`\\bpar\\s+${dimKw}`, 'i'),
    new RegExp(`\\bliste?r?\\s+(des?\\s+|les?\\s+)?${dimKw}`, 'i'),
    new RegExp(`\\btous?t?e?s?\\s+(les?\\s+)?${dimKw}`, 'i'),
  ];
  const isList = new RegExp(`\\b(liste?r?|tous?t?e?s?|toutes?|affiche|montre|donne)\\s+(les?\\s+|des?\\s+)?${dimKw}`, 'i').test(n);
  const isDim = dimPatterns.some(p => p.test(n));
  return { isDim: isDim || isList, isList };
}

function isDistributionQuery(query) {
  const normalized = query.toLowerCase();
  const { isDim } = isDimensionQueryLocal(query);
  return isDim || ['distribution', 'répartition', 'repartition', 'distrubition', 'distrubtion',
    'par plaque', 'par upr', 'par vendor', 'par site', 'par bande', 'par dor', 'par region', 'par zone'].some(h => normalized.includes(h));
}

function detectDimension1TypeLocal(message) {
  const n = message.toLowerCase();
  const map = [
    [/\b(dors?|direction)\b/, 'DOR'],
    [/\b(vendors?|fournisseurs?|constructeurs?)\b/, 'Vendor'],
    [/\b(bandes?|bands?|frequen)\b/, 'Bande'],
    [/\b(rats?|techno|technologie|4g\s*(vs|et)\s*5g|5g\s*(vs|et)\s*4g)\b/, 'RAT'],
    [/\b(plaques?|regions?)\b/, 'Plaque'],
    [/\b(applications?|apps?|services?)\b/, 'Application'],
    [/\b(sites?)\b/, 'Site'],
    [/\b(cellules?|cells?)\b/, 'Cellule'],
    [/\b(arcep|zone_arcep)\b/, 'ARCEP'],
    [/\b(tac)\b/, 'TAC'],
    [/\b(os)\b/, 'OS'],
    [/\b(devices?|terminaux?)\b/, 'Device_brand'],
    [/\b(pop)\b/, 'POP'],
  ];
  for (const [regex, dim] of map) {
    if (regex.test(n)) return dim;
  }
  return 'Site';
}

function detectMetricLocal(message) {
  const n = message.toLowerCase();
  const map = [
    [/\b(tilt|e[\s-]?tilt|inclinaison)\b/, 'tilt'],
    [/\b(azimut|azimuth|orientation)\b/, 'azimut'],
    [/\b(hba|hauteur\s*antenne|hauteur\s*bas)\b/, 'hba'],
    [/\b(qos)\b/, 'qos'],
    [/\b(qoe|qualit[eé])\b/, 'qoe_index'],
    [/\b(debit\s*dl|throughput\s*dl|débit\s*dl)\b/, 'debit_dl'],
    [/\b(debit\s*ul|throughput\s*ul|débit\s*ul)\b/, 'debit_ul'],
    [/\b(rtt|latence|latency)\b/, 'rtt_data_avg'],
    [/\b(traffic|volume|trafic)\b/, 'volume_totale_dl'],
    [/\b(loss|perte)\b/, 'loss_dl_rate'],
    [/\b(retrans|retr)\b/, 'tcp_retr_rate_dl'],
    [/\b(dms\s*3|dms_3|dms3)\b/, 'dms_debit_dl_3'],
    [/\b(dms\s*8|dms_8|dms8)\b/, 'dms_debit_dl_8'],
    [/\b(dms\s*30|dms_30|dms30)\b/, 'dms_debit_dl_30'],
    [/\b(session|sessions)\b/, 'session_nbr'],
    [/\b(drop|dcr|coupure)\b/, 'session_dcr'],
    [/\b(window\s*full|wind_full)\b/, 'wind_full_rate'],
  ];
  for (const [regex, metric] of map) {
    if (regex.test(n)) return metric;
  }
  return 'qoe_index';
}
const TOPO_METRICS = new Set(['tilt', 'azimut', 'hba']);
// Detect topo grouping column from "par DOR", "par plaque", etc. for top_degradations
function detectTopoGroup(query) {
  const n = query.toLowerCase();
  const map = [
    [/\bpar\s+(dors?|direction)\b/, { topoCol: 'dor', label: 'DOR' }],
    [/\bpar\s+(plaques?)\b/, { topoCol: 'plaque', label: 'Plaque' }],
    [/\bpar\s+(vendors?|constructeurs?|fournisseurs?|équipementiers?)\b/, { topoCol: 'constructeur', label: 'Constructeur' }],
    [/\bpar\s+(regions?|région)\b/, { topoCol: 'region', label: 'Région' }],
    [/\bpar\s+(technos?|technologie)\b/, { topoCol: 'techno', label: 'Techno' }],
    [/\bpar\s+(bandes?|fréquence)\b/, { topoCol: 'bande', label: 'Bande' }],
    [/\bpar\s+(zone_?arcep|arcep)\b/, { topoCol: 'zone_arcep', label: 'Zone ARCEP' }],
  ];
  for (const [regex, result] of map) {
    if (regex.test(n)) return result;
  }
  return null;
}

function extractParameterName(query) {
  // Match "SIB.t300", "NRCELL.t300", "LNCEL.T300", "CATMPR.t300ModeACatM" etc.
  const matchFull = query.match(/\b((?:LNCEL|LNBTS|LNCELL|MRBTS|GNBTS|SIB|NRCELL|CATMPR|NOKLTE|NRBTS|GNBCUCP|GNBCUUP|GNBDU|LNHOIF|LNRELIF|IRFIM)[.\s_]?\w+)\b/i);
  if (matchFull) return matchFull[1].replace(/\s/g, '.');
  const match = query.match(/\b(t\d{3,4})\b/i);
  return match ? match[1] : null;
}

function extractGroupByColumn(query) {
  const normalized = query.toLowerCase();
  const mappings = {
    'plaque': 'plaque', 'vendor': 'vendor', 'site': 'site_name',
    'bande': 'bande', 'dor': 'dor', 'region': 'dor', 'zone': 'zone_arcep',
    'netact': 'netact',
  };
  for (const [hint, col] of Object.entries(mappings)) {
    if (normalized.includes(hint)) return col;
  }
  return 'plaque';
}

function extractSiteName(query) {
  const paramPrefixes = /^(LNCEL|LNBTS|LNCELL|MRBTS|GNBTS|SIB|NRCELL|CATMPR|NOKLTE|NRBTS|GNBCUCP|GNBCUUP|GNBDU|LNHOIF|LNRELIF|IRFIM|DUMP|TABLE)$/i;
  const matches = query.match(/\b([A-Z][A-Z0-9_]{3,}(?:_[A-Z0-9]+)+)\b/g);
  if (!matches) return null;
  for (const m of matches) {
    if (!paramPrefixes.test(m)) return m;
  }
  return null;
}
// Fuzzy match a user-typed param against the real parameter list from cache
function resolveParamFromCache(rawParam) {
  if (!rawParam) return null;
  const paramList = distinctCache.parameter || [];
  if (!paramList.length) {
    console.log('   ⚠️ [PARMY] Parameter cache empty, using raw param:', rawParam);
    return rawParam;
  }
  const lower = rawParam.toLowerCase();
  // For dotted params like "LNCEL.pMax", also try resolving the sub-part "pMax"
  const dotParts = rawParam.split('.');
  const subPart = dotParts.length > 1 ? dotParts.slice(1).join('.') : null;
  const subLower = subPart ? subPart.toLowerCase() : null;

  // 1) Exact match (case-insensitive) — try full name first, then sub-part
  const exact = paramList.find(p => p.toLowerCase() === lower);
  if (exact) { console.log(`   🎯 [PARMY] Exact match: "${rawParam}" → "${exact}"`); return exact; }
  if (subLower) {
    const subExact = paramList.find(p => p.toLowerCase() === subLower);
    if (subExact) { console.log(`   🎯 [PARMY] Exact sub-match: "${rawParam}" → "${subExact}" (via sub-part "${subPart}")`); return subExact; }
  }

  // 2) Dotted format match — look for params containing the full dotted name (e.g., "LNCEL.pMax" in DB)
  const dottedContains = paramList.filter(p => p.toLowerCase().includes(lower));
  if (dottedContains.length === 1) { console.log(`   🎯 [PARMY] Dotted contains match: "${rawParam}" → "${dottedContains[0]}"`); return dottedContains[0]; }
  if (dottedContains.length > 1) {
    dottedContains.sort((a, b) => a.length - b.length);
    console.log(`   🎯 [PARMY] Best dotted contains: "${rawParam}" → "${dottedContains[0]}" (${dottedContains.length} candidates)`);
    return dottedContains[0];
  }

  // 3) Sub-part contains — for "LNCEL.pMax", search for params containing "pmax"
  if (subLower && subLower.length >= 3) {
    const subContains = paramList.filter(p => p.toLowerCase().includes(subLower) || subLower.includes(p.toLowerCase()));
    // Prefer params that are closest in length to the sub-part (not the shortest, which could be a random 3-char match)
    if (subContains.length >= 1) {
      subContains.sort((a, b) => Math.abs(a.length - subPart.length) - Math.abs(b.length - subPart.length));
      console.log(`   🎯 [PARMY] Sub-part match: "${rawParam}" → "${subContains[0]}" (via "${subPart}", ${subContains.length} candidates: ${subContains.slice(0,5).join(', ')})`);
      return subContains[0];
    }
  }

  // 4) Reverse contains — input contains param name (careful: only accept params >= 4 chars to avoid false positives)
  const reverseContains = paramList.filter(p => p.length >= 4 && lower.includes(p.toLowerCase()));
  if (reverseContains.length >= 1) {
    // Prefer longest match (most specific)
    reverseContains.sort((a, b) => b.length - a.length);
    console.log(`   🎯 [PARMY] Reverse contains: "${rawParam}" → "${reverseContains[0]}" (${reverseContains.length} candidates)`);
    return reverseContains[0];
  }

  // 5) Levenshtein-like: find closest by character overlap
  let bestScore = 0, bestMatch = null;
  const targetLower = subLower || lower;
  for (const p of paramList) {
    const pl = p.toLowerCase();
    let score = 0;
    for (let i = 0; i < targetLower.length; i++) {
      if (pl.includes(targetLower[i])) score++;
    }
    score = score / Math.max(targetLower.length, pl.length);
    if (score > bestScore && score > 0.5) { bestScore = score; bestMatch = p; }
  }
  if (bestMatch) {
    console.log(`   🔍 [PARMY] Fuzzy match: "${rawParam}" → "${bestMatch}" (score: ${bestScore.toFixed(2)})`);
    return bestMatch;
  }
  console.log(`   ❌ [PARMY] No match found for "${rawParam}" in ${paramList.length} parameters`);
  return rawParam; // fallback to raw
}

function extractParamName(query) {
  const n = query.toLowerCase();
  let raw = null;
  // Priority 1: Try to extract PARAM.subparam pattern (e.g., LNCEL.pMax) — most specific
  const dotMatch = query.match(/\b([A-Za-z]\w+\.\w+)\b/);
  if (dotMatch) { raw = dotMatch[1]; }
  // Priority 2: Known parameter name patterns
  if (!raw) {
    const knownParams = [
      't300','t301','t304','t310','t311','t320','t321',
      'lncel','lnbts','nrcell','nrbts','gnbdu','gnbcucp','gnbcuup',
      'mrbts','blockingstate','pmax','prach','sib','catmpr',
      'irfim','lnhoif','lnrelif','noklte','gnbts',
      'rrcconnreconfigcompltimer','rrcsetuptimer','s1setuptimer',
      'x2setuptimer','inactivitytimer','drxinactivitytimer',
    ];
    for (const p of knownParams) {
      if (n.includes(p)) { raw = p; break; }
    }
  }
  // Priority 3: Try to extract uppercase parameter names
  if (!raw) {
    const upperMatch = query.match(/\b([A-Z][A-Z0-9_]{2,})\b/);
    if (upperMatch) {
      const paramPrefixes = /^(PER|PAR|FOR|THE|AND|NOT|ALL|TOP|DOR|LES|DES|SUR|QUE|AVEC|POUR|DANS|VENDOR|NOKIA|ERICSSON|HUAWEI|SAMSUNG)$/i;
      if (!paramPrefixes.test(upperMatch[1])) raw = upperMatch[1];
    }
  }
  if (!raw) return null;
  // Resolve against real parameter cache
  return resolveParamFromCache(raw);
}

// ─── Helper: search parameter_dump locally ───
async function searchDumpParameterLocal(query) {
  try {
    const dumpTable = 'parameter_dump';
    const groupCol = extractGroupByColumn(query);
    const isDistrib = isDistributionQuery(query);
    const siteName = extractSiteName(query);

    // ── STEP 1: Extract raw parameter keywords from the query ──
    // Extract dotted param like "LNCEL.pMax"
    const dotMatch = query.match(/\b([A-Za-z]\w+\.\w+)\b/);
    // Extract known prefixed param like "LNCEL_pMax" or just "pMax"
    const prefixedMatch = query.match(/\b((?:LNCEL|LNBTS|MRBTS|GNBTS|SIB|NRCELL|CATMPR|NOKLTE|NRBTS|GNBCUCP|GNBCUUP|GNBDU|LNHOIF|LNRELIF|IRFIM)[.\s_]?\w+)\b/i);
    
    let rawParam = dotMatch?.[1] || prefixedMatch?.[1] || null;
    if (!rawParam) {
      // Try single known param names
      const singleMatch = query.match(/\b(t\d{3,4}|pMax|pmax|blockingState|blockingstate|prach\w*|catmpr\w*|irfim\w*)\b/i);
      rawParam = singleMatch?.[1] || null;
    }

    console.log(`\n🔍 [PARMY-SIMPLE] rawParam="${rawParam}", isDistrib=${isDistrib}, groupCol=${groupCol}, siteName=${siteName}, query="${query}"`);

    if (!rawParam) {
      return '⚠️ Aucun paramètre détecté dans la requête. Essayez par exemple: "pMax par dor" ou "T300 par plaque".';
    }

    // ── STEP 2: Find the REAL parameter name in DB via direct SQL ──
    // Build search terms: full name, sub-part after dot, each word
    const parts = rawParam.split('.');
    const searchTerms = [rawParam, ...parts].filter(Boolean);
    const uniqueTerms = [...new Set(searchTerms.map(t => t.toLowerCase()))];

    console.log(`   🔎 [PARMY-SIMPLE] Search terms: ${uniqueTerms.join(', ')}`);

    // Try to find matching parameters in DB directly
    let realParamName = null;
    
    // Try 1: Exact match (case-insensitive)
    for (const term of uniqueTerms) {
      const res = await sharedPool.query(
        `SELECT DISTINCT parameter FROM ${dumpTable} WHERE lower(parameter) = lower($1) LIMIT 1`,
        [term]
      );
      if (res.rows.length) {
        realParamName = res.rows[0].parameter;
        console.log(`   ✅ [PARMY-SIMPLE] Exact DB match: "${term}" → "${realParamName}"`);
        break;
      }
    }

    // Try 2: Contains match (most specific term first = longest)
    if (!realParamName) {
      const sortedTerms = [...uniqueTerms].sort((a, b) => b.length - a.length);
      for (const term of sortedTerms) {
        const res = await sharedPool.query(
          `SELECT DISTINCT parameter FROM ${dumpTable} WHERE parameter ILIKE $1 LIMIT 5`,
          [`%${term}%`]
        );
        if (res.rows.length) {
          // Pick best match: shortest name containing the term (most specific)
          res.rows.sort((a, b) => a.parameter.length - b.parameter.length);
          realParamName = res.rows[0].parameter;
          console.log(`   ✅ [PARMY-SIMPLE] Contains DB match: "%${term}%" → "${realParamName}" (${res.rows.length} candidates: ${res.rows.map(r=>r.parameter).join(', ')})`);
          break;
        }
      }
    }

    if (!realParamName) {
      // Show what exists
      const sample = await sharedPool.query(
        `SELECT DISTINCT parameter FROM ${dumpTable} ORDER BY parameter LIMIT 20`
      );
      return `⚠️ Paramètre "${rawParam}" introuvable dans la base.\n\nExemples de paramètres existants:\n${sample.rows.map(r => r.parameter).join('\n')}`;
    }

    // ── STEP 3: Execute the actual query ──
    
    // Site-specific query
    if (siteName && !isDistrib) {
      const sqlText = `SELECT dn, cell_dn, cell_name, site_name, parameter, value, version, vendor, bande, dor, plaque
         FROM ${dumpTable} WHERE parameter = '${realParamName}' AND site_name ILIKE '%${siteName}%'
         ORDER BY cell_name LIMIT 200`;
      console.log(`   📊 [PARMY-SIMPLE] Site query SQL: ${sqlText}`);
      const result = await sharedPool.query(
        `SELECT dn, cell_dn, cell_name, site_name, parameter, value, version, vendor, bande, dor, plaque
         FROM ${dumpTable} WHERE parameter = $1 AND site_name ILIKE $2
         ORDER BY cell_name LIMIT 200`,
        [realParamName, `%${siteName}%`]
      );
      if (!result.rows.length) {
        return `🔍 DEBUG SQL: ${sqlText}\n\n⚠️ Paramètre "${realParamName}" trouvé dans la base mais aucun résultat pour le site "${siteName}".`;
      }
      const header = 'dn | cell_name | site_name | parameter | value | version | vendor | bande | dor | plaque';
      const lines = result.rows.map(r =>
        `${r.dn||''} | ${r.cell_name||''} | ${r.site_name||''} | ${r.parameter||''} | ${r.value||''} | ${r.version||''} | ${r.vendor||''} | ${r.bande||''} | ${r.dor||''} | ${r.plaque||''}`
      );
      return `🔍 DEBUG SQL: ${sqlText}\n\nDONNÉES RÉELLES pour ${realParamName} sur ${siteName} (${result.rows.length} résultats) :\n${header}\n${lines.join('\n')}`;
    }

    // Distribution query
    if (isDistrib) {
      const sqlText = `SELECT COALESCE(${groupCol}, 'N/A') AS dimension, value AS param_value, COUNT(*) AS nb_cells
         FROM ${dumpTable} WHERE parameter = '${realParamName}'
         GROUP BY COALESCE(${groupCol}, 'N/A'), value
         ORDER BY dimension, nb_cells DESC`;
      console.log(`   📊 [PARMY-SIMPLE] Distribution SQL: ${sqlText}`);
      const result = await sharedPool.query(
        `SELECT COALESCE(${groupCol}, 'N/A') AS dimension, value AS param_value, COUNT(*) AS nb_cells
         FROM ${dumpTable} WHERE parameter = $1
         GROUP BY COALESCE(${groupCol}, 'N/A'), value
         ORDER BY dimension, nb_cells DESC`,
        [realParamName]
      );
      if (!result.rows.length) {
        return `🔍 DEBUG SQL: ${sqlText}\n\n⚠️ Paramètre "${realParamName}" existe dans la base mais la requête de distribution par ${groupCol} n'a retourné aucun résultat.`;
      }
      const header = `dimension | valeur_${realParamName} | nb_cellules`;
      const lines = result.rows.map(r => `${r.dimension} | ${r.param_value} | ${r.nb_cells}`);
      const total = result.rows.reduce((s, r) => s + parseInt(r.nb_cells), 0);
      console.log(`   ✅ [PARMY-SIMPLE] Distribution: ${result.rows.length} groupes, ${total} cellules`);
      return `🔍 DEBUG SQL: ${sqlText}\n\nDISTRIBUTION AGRÉGÉE du paramètre ${realParamName} par ${groupCol} (${total} cellules au total):\n${header}\n${lines.join('\n')}`;
    }

    // Standard search
    const terms = (query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).slice(0, 6);
    if (terms.length === 0) return '⚠️ Aucun terme de recherche détecté dans la requête.';
    const conditions = terms.map((_, i) =>
      `parameter ILIKE $${i+1} OR site_name ILIKE $${i+1} OR value ILIKE $${i+1} OR dn ILIKE $${i+1}`
    ).join(' OR ');
    const params = terms.map(t => `%${t}%`);
    const sqlStd = `SELECT dn, enodeb_id, mrbts_id, gnodeb_id, cell_name, vendor, site_name, bande, plaque, parameter, version, value
       FROM ${dumpTable} WHERE ${conditions} LIMIT 80`;
    console.log(`\n🔍 [PARMY SQL] Standard search:\n   terms=${terms.join(', ')}\n   SQL: ${sqlStd}\n`);
    const result = await sharedPool.query(sqlStd, params);
    if (!result.rows.length) return `🔍 DEBUG SQL: ${sqlStd}\n\nAUCUNE DONNÉE trouvée dans ${dumpTable} pour: ${terms.join(', ')}`;
    const header = 'dn | enodeb_id | mrbts_id | cell_name | vendor | site_name | bande | plaque | parameter | version | value';
    const lines = result.rows.map(r =>
      `${r.dn||''} | ${r.enodeb_id||''} | ${r.mrbts_id||''} | ${r.cell_name||''} | ${r.vendor||''} | ${r.site_name||''} | ${r.bande||''} | ${r.plaque||''} | ${r.parameter||''} | ${r.version||''} | ${r.value||''}`
    );
    return `🔍 DEBUG SQL: ${sqlStd}\n\nTotal résultats paramètres: ${result.rows.length}\n${header}\n${lines.join('\n')}`;
  } catch (e) {
    console.error('❌ [PARMY SQL ERROR]', e.message, '\n   Stack:', e.stack?.split('\n')[1]);
    return `⚠️ Erreur SQL PARMY: ${e.message}\n\nStack: ${e.stack?.split('\n').slice(0,3).join('\n')}`;
  }
}

// ─── Helper: search RAG documents locally ───
async function searchRAGLocal(query) {
  const pool = createPool(getLocalDbConfig());
  try {
    const terms = (query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).slice(0, 4);
    if (terms.length === 0) return '';
    const conditions = terms.map((_, i) => `content ILIKE $${i+1} OR filename ILIKE $${i+1}`).join(' OR ');
    const params = terms.map(t => `%${t}%`);
    const result = await pool.query(
      `SELECT filename, content, chunk_index FROM rag_documents WHERE ${conditions} ORDER BY created_at DESC LIMIT 10`,
      params
    );
    if (!result.rows.length) return '';
    return result.rows.map(r => `[${r.filename} | chunk: ${r.chunk_index}]\n${r.content.slice(0, 900)}`).join('\n\n---\n\n');
  } catch (e) {
    console.error('[RAG search error]', e.message);
    return '';
  } finally {
    await pool.end();
  }
}

// ═══════════════════════════════════════════════════════════════
//  /api/qoe-assistant — Context-on-Demand (planner + builder + local PostgreSQL)
// ═══════════════════════════════════════════════════════════════

// --- Intent/scope classification helpers ---
function isChangeHistoryQuery(query) {
  const n = query.toLowerCase();
  return ['changement','change','historique','history','modification','tuning',
    'rollback','upgrade','swap','avant','après','cm history','parameter_changes'
  ].some(h => n.includes(h));
}
function isSiteDesignQuery(query) {
  const n = query.toLowerCase();
  return ['design','tilt','azimut','azimuth','hba','topologie','topology',
    'secteur','sector','couverture','coverage','analyse site','site design',
    'antenne','antenna','delta tilt','profil site','profile',
    'nombre de sites','nombre des sites','combien de sites','nb sites','sites par',
    'répartition des sites','count sites','répartition site',
    'toutes les plaque','toutes les dor','toutes les region',
    'liste des plaque','liste des dor','liste des region',
    'tous les plaque','tous les dor'
  ].some(h => n.includes(h));
}
function isSentinelQuery(query) {
  const n = query.toLowerCase();
  return ['alarm','alarme','anomali','rca','root cause','cause racine',
    'dégradation','degradation','incident','problème','problem',
    'chute','drop','baisse soudaine','sudden','alerte','alert',
    'détect','detect','seuil','threshold','critique','critical'
  ].some(h => n.includes(h));
}
function isParameterFocusedQuery(query) {
  const n = query.toLowerCase();
  // Vendor names alone should NOT route to PARMY — they are dimensions for PULSE
  // Only route to PARMY if vendor is combined with parameter-specific keywords
  const vendorOnly = /\b(nokia|ericsson|huawei|samsung)\b/i.test(query);
  const hasParamKeyword = ['paramètre','parametre','parameter','param','config','configuration','dump',
    'mrbts','lnbts','enodeb','gnodeb','template','dn','version',
    'cell_dn','blockingstate',
    'lncel','nrcell','nrbts','lnhoif','lnrelci','nrcel','gnbdu','gnbcucp',
    'pmax','pzero','qrxlevmin','qqualmin','dlchbw','ulchbw',
    'dlmimomode','ulmimomode','dlrsboost','cellbarred',
    't300','t301','t304','t310','t311','t320','t321',
    'timer','rrc','handover','reselection',
  ].some(h => n.includes(h));
  // If only vendor mentioned without param keywords → not a parameter query
  if (vendorOnly && !hasParamKeyword) return false;
  // Distribution/valeur alone are too generic — need param context
  const hasDistribKeyword = ['distribution','valeur','valeurs'].some(h => n.includes(h));
  if (hasDistribKeyword && !hasParamKeyword) return false;
  return hasParamKeyword || hasDistribKeyword;
}
function isParmyQuery(query) {
  const n = query.toLowerCase();
  return ['audit','auditer','vérifier','verifier','check','contrôle','controle',
    'cohérence','coherence','consistency','recommandation','recommendation',
    'best practice','bonne pratique','conformité','conformite','compliance',
    'benchmark param','template','valeur standard','standard value',
    'écart','ecart','deviation','outlier','anomalie param',
    'dispersion','homogénéité','homogeneite','uniformité','uniformite',
    'param check','parameter audit','param audit','vérif param','verif param',
    'analyse param','optimis','tuning recomm','config audit',
    'non conforme','non-conforme','hors norme','hors-norme',
    'valeur aberrante','valeur atypique','outlier param'
  ].some(h => n.includes(h));
}

function isTopoInventoryQuery(query) {
  const n = query.toLowerCase();
  const countHints = ['nombre','combien','count','inventaire','inventory','nb site','nb cellule','nb cell','total site','total cell','statistique topo','stats topo','nombes','nbre'];
  const topoTargets = ['cellule','cell','site','antenne','antenna','secteur','sector','bande','techno'];
  return countHints.some(h => n.includes(h)) && topoTargets.some(t => n.includes(t));
}

function classifyAgent(query) {
  const n = query.toLowerCase();
  // Topo inventory queries → TOPO always first
  if (isTopoInventoryQuery(query)) return 'TOPO';
  // Pure topo metric queries (tilt, azimut, hba) → TOPO
  const met = detectMetricLocal(query);
  if (TOPO_METRICS.has(met)) return 'TOPO';
  // Site design queries → TOPO
  if (isSiteDesignQuery(query)) return 'TOPO';
  // PARMY: parameter audit, check, consistency — BEFORE dimension queries
  if (isParmyQuery(query)) return 'PARMY';
  if (isParameterFocusedQuery(query)) return 'PARMY';
  // Comparison queries should go to PULSE
  const isCompare = ['compare','comparer','comparaison','vs','versus','benchmark'].some(h => n.includes(h));
  if (isCompare) return 'PULSE';
  // Dimension queries go to PULSE
  const { isDim } = isDimensionQueryLocal(query);
  if (isDim) return 'PULSE';
  if (isChangeHistoryQuery(query)) return 'TRACE';
  if (isSentinelQuery(query)) return 'SENTINEL';
  return 'PULSE';
}
function classifyIntent(query, scopeLevel) {
  const n = query.toLowerCase();
  // Top/worst/best queries take HIGHEST priority (even if "par DOR" is present)
  const isTopQuery = ['top','pire','worst','meilleur','best','classement','ranking','dégradé','degradé','degraded'].some(h => n.includes(h));
  if (isTopQuery) return 'top_degradations';
  // Trend / time-series queries — "plot", "tracer", "courbe", "évolution", "tendance", "trend"
  const isTrendQuery = ['plot','tracer','courbe','évolution','evolution','tendance','trend','time series','timeseries','historique'].some(h => n.includes(h));
  if (isTrendQuery) return 'kpi_trend';
  // Topology / site count queries — BEFORE dimension detection so "nombre de sites par dor" routes here
  if (['nombre de sites','nombre des sites','combien de sites','nb sites','répartition des sites','count sites','nombre de cellules','nombre des cellules','nb cellules'].some(h => n.includes(h))) return 'topo_stats';
  // Dimension-based queries
  const { isDim, isList } = isDimensionQueryLocal(query);
  if (isList) return 'list_dimension_values';
  if (isDim) return 'dimension_distribution';
  if (isChangeHistoryQuery(query)) return 'trace_change';
  if (scopeLevel === 'cell') return 'cell_analysis';
  if (scopeLevel === 'site') return 'site_analysis';
  if (['compare','comparer','comparaison','vs','versus'].some(h => n.includes(h))) return 'compare';
  if (['définition','definition',"c'est quoi","qu'est-ce que",'explique','explain'].some(h => n.includes(h))) return 'definition';
  if (['résumé','resume','summary','état','etat','overview','global','bilan'].some(h => n.includes(h))) return 'global_summary';
  return 'other';
}
function resolveScope(query, uiScope, filters) {
  if (uiScope?.selectedCellId) return { level: 'cell', cellId: uiScope.selectedCellId, siteName: uiScope.selectedSiteName || undefined };
  if (uiScope?.selectedSiteName) return { level: 'site', siteName: uiScope.selectedSiteName };
  const siteFromText = extractSiteName(query);
  if (siteFromText) return { level: 'site', siteName: siteFromText };
  if (filters?.vendor) return { level: 'vendor', vendor: filters.vendor };
  if (filters?.techno) return { level: 'techno', techno: filters.techno };
  if (filters?.plaque) return { level: 'plaque', plaque: filters.plaque };
  if (filters?.dor) return { level: 'dor', dor: filters.dor };
  // Detect techno comparison (4G vs 5G) BEFORE vendor detection
  const technoMatch = query.match(/\b(4G|5G|3G|2G|LTE|NR)\b/gi);
  if (technoMatch && technoMatch.length >= 1) {
    const isCompare = ['compare','comparer','comparaison','vs','versus','benchmark','qualité par technologie','par technologie','par techno'].some(h => query.toLowerCase().includes(h));
    if (isCompare || technoMatch.length >= 2) return { level: 'techno', techno: technoMatch.join(',') };
  }
  const vendorMatch = query.match(/\b(ericsson|nokia|huawei|samsung)\b/i);
  if (vendorMatch) {
    // If multiple vendors mentioned → compare intent, return first but scope is vendor
    return { level: 'vendor', vendor: vendorMatch[1] };
  }
  // Simple plaque extraction from known patterns (e.g. "plaque IDF", "plaque Nord")
  const plaqueMatch = query.match(/\bplaque\s+(\w+)/i);
  if (plaqueMatch) return { level: 'plaque', plaque: plaqueMatch[1] };
  return { level: 'global' };
}

function buildContextPlan(query, uiScope, filters) {
  const scope = resolveScope(query, uiScope, filters);
  const agent = classifyAgent(query);
  const intent = classifyIntent(query, scope.level);
  const needs = [];
  const limits = { maxSites: 20, maxCells: 0, maxKpis: 10, maxDays: 7, maxRagChunks: 3 };
  let groupBy = null;
  let metric = null;

  // Handle dimension-based intents FIRST (priority over agent routing)
  // EXCEPT for PARMY: parameter distribution goes through parmy_sql fast path
  if (intent === 'dimension_distribution' && agent !== 'PARMY') {
    const dim1 = detectDimension1TypeLocal(query);
    const met = detectMetricLocal(query);
    groupBy = { dimension1: dim1 };
    metric = met;
    // Route topo metrics (tilt, azimut, hba) to topo_metric_agg instead of dimension_agg
    if (TOPO_METRICS.has(met)) {
      needs.push('topo_metric_agg', 'documents_rag');
    } else {
      needs.push('dimension_agg', 'documents_rag');
    }
  } else if (intent === 'list_dimension_values') {
    const dim1 = detectDimension1TypeLocal(query);
    groupBy = { dimension1: dim1 };
    needs.push('dimension_values', 'documents_rag');
  } else {
    switch (agent) {
      case 'PULSE':
        needs.push('documents_rag');
        if (intent === 'kpi_trend') {
          metric = detectMetricLocal(query) || 'qoe_index';
          needs.push('kpi_time_series');
        }
        else if (['global_summary','compare','other'].includes(intent)) { needs.push('agg_stats','worst_sites'); }
        else if (intent === 'top_degradations') {
          const topNMatch = query.match(/\btop\s*(\d+)/i);
          const topN = topNMatch ? parseInt(topNMatch[1]) : 20;
          needs.push('worst_sites'); limits.maxSites = topN;
          const topoGroup = detectTopoGroup(query);
          if (topoGroup) { groupBy = { topoGroup }; needs.push('worst_sites_by_group'); }
        }
        else if (intent === 'site_analysis') { needs.push('kpi_snapshot','worst_cells'); limits.maxCells = 30; }
        else if (intent === 'cell_analysis') { needs.push('kpi_snapshot'); limits.maxCells = 1; }
        break;
      case 'SENTINEL':
        needs.push('documents_rag');
        if (scope.level === 'site' || scope.level === 'cell') { needs.push('kpi_snapshot','worst_cells'); limits.maxCells = 20; }
        else { needs.push('agg_stats','worst_sites'); limits.maxSites = 15; }
        break;
      case 'TRACE':
        needs.push('documents_rag','change_history');
        if (isParameterFocusedQuery(query)) needs.push('param_dump');
        if (scope.level === 'site') needs.push('topology');
        break;
      case 'PARMY':
        needs.push('documents_rag','parmy_sql');
        if (isParameterFocusedQuery(query)) needs.push('param_dump');
        if (scope.level === 'site') needs.push('topology','kpi_snapshot');
        if (isChangeHistoryQuery(query)) needs.push('change_history');
        break;
      case 'TOPO':
        needs.push('documents_rag');
        if (isTopoInventoryQuery(query)) {
          needs.push('topo_inventory');
        } else {
          // For topo metric queries (tilt, azimut, hba) without specific site, fetch global distribution
          const topoMet = detectMetricLocal(query);
          if (TOPO_METRICS.has(topoMet)) {
            const dim1 = detectDimension1TypeLocal(query);
            groupBy = { dimension1: dim1 };
            metric = topoMet;
            needs.push('topo_metric_agg');
          }
          needs.push('topology');
          if (scope.level === 'site') { needs.push('kpi_snapshot'); limits.maxCells = 30; }
        }
        if (intent === 'topo_stats') { needs.push('topo_stats'); }
        break;
    }
  }

  const n = query.toLowerCase();
  // Detect time range: j-15, j-14, 2 semaines → 15 days; j-30, mois → 30 days; default 7
  const jMatch = n.match(/j[- ]?(\d+)/);
  if (jMatch) { limits.maxDays = parseInt(jMatch[1]); }
  else if (n.includes('2 semaines') || n.includes('two weeks') || n.includes('15 jours') || n.includes('15j')) { limits.maxDays = 15; }
  else if (n.includes('hier') || n.includes('24h') || n.includes("aujourd")) limits.maxDays = 1;
  else if (n.includes('mois') || n.includes('30j')) limits.maxDays = 30;

  return { agent, intent, scope, needs, limits, groupBy, metric };
}

// --- Local PostgreSQL data providers ---
async function detectKpiTable() {
  // Only use qoe_metric locally — no fallback to kpi_qoe_aggregated
  try {
    const res = await sharedPool.query(`SELECT 1 FROM qoe_metric LIMIT 1`);
    if (res.rows.length > 0) {
      console.log(`[detectKpiTable] ✅ Using qoe_metric`);
      return { table: 'qoe_metric', isQoeMetric: true };
    }
    console.log(`[detectKpiTable] qoe_metric empty`);
  } catch (e) { console.log(`[detectKpiTable] qoe_metric not available: ${e.message}`); }
  console.log('[detectKpiTable] ❌ No KPI table with data found');
  return null;
}

// qoe_metric uses "Dimension_1"/"Dimension_2" (quoted uppercase), kpi_qoe_aggregated uses dimension_1/dimension_2 (lowercase)
function dimCols(isQoeMetric) {
  return isQoeMetric
    ? { dim1: '"Dimension_1"', dim2: '"Dimension_2"' }
    : { dim1: 'dimension_1', dim2: 'dimension_2' };
}

async function fetchAggStatsLocal(filters, maxDays, query) {
  try {
    const src = await detectKpiTable();
    if (!src) return '';
    const { dim1, dim2 } = dimCols(src.isQoeMetric);

    const colRes = await sharedPool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
      [src.table]
    );
    const availCols = new Set(colRes.rows.map(r => r.column_name));
    const wantedKpis = ['qoe_index', 'debit_dl', 'debit_ul', 'rtt_data_avg', 'rtt_setup_avg', 'dms_debit_dl_3', 'dms_debit_dl_8', 'dms_debit_dl_30', 'tcp_retr_rate_dl', 'loss_dl_rate', 'session_dcr', 'session_nbr', 'wind_full_rate', 'volume_totale_dl', 'volume_totale_ul'];
    const selectKpis = wantedKpis.filter(c => availCols.has(c)).join(', ');
    if (!selectKpis) return '';

    // Detect dimension from query text
    const queryLower = (query || '').toLowerCase();
    let queriedDim = null;
    if (/\bpar\s+(dor|direction)\b/i.test(queryLower) || filters?.dor) queriedDim = 'DOR';
    else if (/\bpar\s+(plaque)\b/i.test(queryLower) || filters?.plaque) queriedDim = 'Plaque';
    else if (/\bpar\s+(vendor|constructeur|équipementier|fournisseur)\b/i.test(queryLower) || filters?.vendor) queriedDim = 'Vendor';
    else if (/\b(par\s+techno|technologie|4g\s*(vs|et)\s*5g|5g\s*(vs|et)\s*4g)\b/i.test(queryLower) || filters?.techno) queriedDim = 'Techno';
    else if (/\bpar\s+(region|région)\b/i.test(queryLower)) queriedDim = 'Region';
    else if (/\bpar\s+(bande|fréquence|freq)\b/i.test(queryLower)) queriedDim = 'Bande';
    else if (/\bpar\s+(site)\b/i.test(queryLower)) queriedDim = 'Site';
    else if (/\bpar\s+(application|app)\b/i.test(queryLower)) queriedDim = 'Application';
    else if (/\bpar\s+(cell|cellule)\b/i.test(queryLower)) queriedDim = 'Cell';

    // Build WHERE
    const conditions = [];
    if (queriedDim) {
      conditions.push(`${dim1} = '${queriedDim}'`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await sharedPool.query(
      `SELECT ${dim1} AS dimension_1, ${dim2} AS dimension_2, date_part, ${selectKpis}
       FROM ${src.table} ${whereClause} ORDER BY date_part DESC LIMIT 2000`
    );
    console.log(`[fetchAggStatsLocal] ${src.table}: ${rows.length} rows (dim=${queriedDim || 'auto'}, where=${whereClause || 'none'})`);
    if (!rows.length) return '';

    const groups = new Map();
    for (const r of rows) {
      const key = r.dimension_2 || r.dimension_1 || 'Global';
      if (!groups.has(key)) groups.set(key, { vals: {}, count: 0 });
      const g = groups.get(key);
      for (const k of wantedKpis.filter(c => availCols.has(c))) {
        if (r[k] != null) { if (!g.vals[k]) g.vals[k] = []; g.vals[k].push(+r[k]); }
      }
      g.count++;
    }
    const avg = arr => arr && arr.length ? arr.reduce((a,b) => a+b, 0) / arr.length : 0;
    const presentKpis = wantedKpis.filter(c => availCols.has(c));
    const header = '| Dimension | Pts | ' + presentKpis.join(' | ') + ' |';
    const sep = '|' + ['---','---', ...presentKpis.map(() => '---')].join('|') + '|';
    // Detect if rate columns already in percent
    const rateKeysAgg = presentKpis.filter(k => k.includes('rate') || k.includes('loss') || k.includes('retr') || k.includes('dcr'));
    const needsMultiplyAgg = rateKeysAgg.length > 0 && Array.from(groups.values()).some(g => { const v = avg(g.vals[rateKeysAgg[0]]); return v > 0 && v <= 1; });
    const lines = Array.from(groups.entries()).map(([k,g]) => {
      const vals = presentKpis.map(kpi => {
        const v = avg(g.vals[kpi]);
        if (kpi.includes('rate') || kpi.includes('loss') || kpi.includes('retr') || kpi.includes('dcr')) {
          const pct = needsMultiplyAgg ? (v * 100) : v;
          return pct.toFixed(2) + '%';
        }
        return v.toFixed(1);
      });
      return `| ${k} | ${g.count} | ${vals.join(' | ')} |`;
    });
    const dimLabel = queriedDim ? ` par ${queriedDim}` : '';
    return `STATS AGRÉGÉES${dimLabel} (${rows.length} pts, ${groups.size} dims, source: ${src.table}):\n\n${header}\n${sep}\n${lines.join('\n')}`;
  } catch (e) { console.error('[fetchAggStatsLocal] ❌', e.message); return ''; }
}

async function fetchWorstSitesLocal(filters, maxSites) {
  try {
    const src = await detectKpiTable();
    if (!src) { console.log('[fetchWorstSitesLocal] No KPI table available'); return ''; }
    const { dim1, dim2 } = dimCols(src.isQoeMetric);

    // Discover available columns in the table
    const colRes = await sharedPool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
      [src.table]
    );
    const availCols = new Set(colRes.rows.map(r => r.column_name));
    console.log(`[fetchWorstSitesLocal] ${src.table} columns (${availCols.size}): ${[...availCols].slice(0, 20).join(', ')}...`);

    // Build select list with only available columns
    const wantedKpis = ['qoe_index', 'debit_dl', 'debit_ul', 'rtt_data_avg', 'dms_debit_dl_3', 'dms_debit_dl_8', 'dms_debit_dl_30', 'session_nbr', 'loss_dl_rate', 'tcp_retr_rate_dl'];
    const selectKpis = wantedKpis.filter(c => availCols.has(c)).join(', ');
    if (!selectKpis) {
      console.log(`[fetchWorstSitesLocal] ❌ None of the expected KPI columns found in ${src.table}`);
      return '';
    }

    // For qoe_metric, filter to Dimension_1='Site' to get site-level data
    const siteFilter = src.isQoeMetric ? `AND ${dim1} = 'Site'` : '';

    // Try sorting strategies with available columns
    const strategies = [
      { col: 'qoe_index', dir: 'ASC', label: 'QoE' },
      { col: 'debit_dl', dir: 'ASC', label: 'Débit DL' },
      { col: 'rtt_data_avg', dir: 'DESC', label: 'RTT' },
    ].filter(s => availCols.has(s.col));

    let rows = [];
    let usedLabel = 'date';

    for (const strat of strategies) {
      const res = await sharedPool.query(
        `SELECT ${dim1} AS dimension_1, ${dim2} AS dimension_2, date_part, ${selectKpis}
         FROM ${src.table} WHERE ${strat.col} IS NOT NULL ${siteFilter}
         ORDER BY ${strat.col} ${strat.dir} LIMIT $1`, [maxSites * 3]
      );
      console.log(`[fetchWorstSitesLocal] Strategy ${strat.col} ${strat.dir} → ${res.rows.length} rows`);
      if (res.rows.length > 0) {
        rows = res.rows;
        usedLabel = strat.label;
        break;
      }
    }

    if (!rows.length) {
      // Last resort: any rows by date
      const fallback = await sharedPool.query(
        `SELECT ${dim1} AS dimension_1, ${dim2} AS dimension_2, date_part, ${selectKpis}
         FROM ${src.table} WHERE 1=1 ${siteFilter} ORDER BY date_part DESC LIMIT $1`, [maxSites * 3]
      );
      rows = fallback.rows;
      usedLabel = 'date récente';
      console.log(`[fetchWorstSitesLocal] Date fallback → ${rows.length} rows`);
    }

    if (!rows.length) { console.log('[fetchWorstSitesLocal] No rows after all strategies'); return ''; }

    const seen = new Set();
    const unique = rows.filter(r => { const k = r.dimension_2; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, maxSites);
    const activeCols = wantedKpis.filter(c => availCols.has(c));
    const header = '| # | Site | Date | ' + activeCols.join(' | ') + ' |';
    const sep = '|' + activeCols.map(() => '---').concat(['---','---','---']).join('|') + '|';
    const fmtDate = (d) => { if (!d) return '-'; const s = String(d); const m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; try { return new Date(s).toISOString().slice(0,10); } catch(e) { return s.slice(0,10); } };
    // Detect if rate columns are already in percent (>1 means already %)
    const rateKeys = activeCols.filter(k => k.includes('rate') || k.includes('loss') || k.includes('retr'));
    const needsMultiply = rateKeys.length > 0 && unique.some(r => { const v = r[rateKeys[0]]; return v != null && +v > 0 && +v <= 1; });
    const lines = unique.map((r,i) => {
      const vals = activeCols.map(k => {
        const v = r[k];
        if (v == null) return '-';
        if (k.includes('rate') || k.includes('loss') || k.includes('retr')) {
          const pct = needsMultiply ? (+v * 100) : +v;
          return pct.toFixed(2) + '%';
        }
        return (+v).toFixed(1);
      });
      return `| ${i+1} | ${r.dimension_2} | ${fmtDate(r.date_part)} | ${vals.join(' | ')} |`;
    });
    return `TOP ${unique.length} WORST SITES (tri par ${usedLabel}, source: ${src.table}):\n\n${header}\n${sep}\n${lines.join('\n')}`;
  } catch (e) { console.error('[fetchWorstSitesLocal] ❌ ERROR:', e.message); return ''; }
}

// ─── Worst sites enriched with topo grouping (JOIN kpi + topo) ───
async function fetchWorstSitesByGroupLocal(topoGroupInfo, metric, maxSites) {
  try {
    const src = await detectKpiTable();
    if (!src) return '';
    const { dim1, dim2 } = dimCols(src.isQoeMetric);
    const { topoCol, label } = topoGroupInfo;

    // Check available KPI columns
    const colRes = await sharedPool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`, [src.table]
    );
    const availCols = new Set(colRes.rows.map(r => r.column_name));
    const metricCol = availCols.has(metric) ? metric : 'qoe_index';

    // Check topo has the group column
    const topoColRes = await sharedPool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'topo' AND table_schema = 'public'`
    );
    const topoCols = new Set(topoColRes.rows.map(r => r.column_name));
    if (!topoCols.has(topoCol)) {
      console.log(`[fetchWorstSitesByGroupLocal] topo doesn't have column '${topoCol}'`);
      return '';
    }

    const wantedKpis = ['qoe_index', 'debit_dl', 'debit_ul', 'rtt_data_avg', 'session_nbr', 'loss_dl_rate', 'tcp_retr_rate_dl', 'session_dcr'];
    const selectKpis = wantedKpis.filter(c => availCols.has(c));
    if (!selectKpis.length) return '';

    // Determine sort direction (lower = worse for qoe/debit, higher = worse for rtt/loss/retr)
    const higherIsWorse = ['rtt_data_avg', 'rtt_setup_avg', 'loss_dl_rate', 'loss_ul_rate', 'tcp_retr_rate_dl', 'tcp_retr_rate_ul', 'session_dcr'];
    const sortDir = higherIsWorse.includes(metricCol) ? 'DESC' : 'ASC';

    // JOIN: kpi (dimension_1='Site') with topo (on dimension_2 = code_nidt) grouped by topo group column
    // First get per-site aggregated KPIs with topo group
    const sql = `
      SELECT t.${topoCol} AS group_label, k.${dim2} AS site_name,
             ${selectKpis.map(c => `AVG(k.${c}) AS ${c}`).join(', ')}
      FROM ${src.table} k
      JOIN (SELECT DISTINCT code_nidt, ${topoCol} FROM topo WHERE ${topoCol} IS NOT NULL) t
        ON k.${dim2} = t.code_nidt
      WHERE k.${dim1} = 'Site'
      GROUP BY t.${topoCol}, k.${dim2}
      ORDER BY AVG(k.${metricCol}) ${sortDir} NULLS LAST
      LIMIT $1
    `;
    console.log(`[fetchWorstSitesByGroupLocal] SQL: ${sql.replace(/\s+/g,' ')}`);
    const { rows } = await sharedPool.query(sql, [maxSites * 3]);

    if (!rows.length) {
      // Fallback: try joining on nom_site instead of code_nidt
      const sql2 = `
        SELECT t.${topoCol} AS group_label, k.${dim2} AS site_name,
               ${selectKpis.map(c => `AVG(k.${c}) AS ${c}`).join(', ')}
        FROM ${src.table} k
        JOIN (SELECT DISTINCT nom_site, ${topoCol} FROM topo WHERE ${topoCol} IS NOT NULL) t
          ON k.${dim2} = t.nom_site
        WHERE k.${dim1} = 'Site'
        GROUP BY t.${topoCol}, k.${dim2}
        ORDER BY AVG(k.${metricCol}) ${sortDir} NULLS LAST
        LIMIT $1
      `;
      console.log(`[fetchWorstSitesByGroupLocal] Fallback on nom_site`);
      const res2 = await sharedPool.query(sql2, [maxSites * 3]);
      if (!res2.rows.length) return `Aucun site trouvé avec jointure topo (${topoCol}).`;
      rows.push(...res2.rows);
    }

    // Deduplicate by site
    const seen = new Set();
    const unique = rows.filter(r => { if (seen.has(r.site_name)) return false; seen.add(r.site_name); return true; }).slice(0, maxSites);

    // Group by topo group for display
    const groups = new Map();
    for (const r of unique) {
      const g = r.group_label || 'Inconnu';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(r);
    }

    const header = `| # | ${label} | Site | ${selectKpis.join(' | ')} |`;
    const sep = '|' + ['---','---','---', ...selectKpis.map(() => '---')].join('|') + '|';
    // Detect if rate columns already in percent
    const rateKeys2 = selectKpis.filter(k => k.includes('rate') || k.includes('loss') || k.includes('retr') || k.includes('dcr'));
    const needsMultiply2 = rateKeys2.length > 0 && unique.some(r => { const v = r[rateKeys2[0]]; return v != null && +v > 0 && +v <= 1; });
    const lines = [];
    let idx = 1;
    for (const [g, sites] of groups) {
      for (const r of sites) {
        const vals = selectKpis.map(k => {
          const v = r[k];
          if (v == null) return '-';
          if (k.includes('rate') || k.includes('loss') || k.includes('retr') || k.includes('dcr')) {
            const pct = needsMultiply2 ? (+v * 100) : +v;
            return pct.toFixed(2) + '%';
          }
          return (+v).toFixed(1);
        });
        lines.push(`| ${idx++} | ${g} | ${r.site_name} | ${vals.join(' | ')} |`);
      }
    }

    // Build chart data grouped by topo dimension
    const chartData = Array.from(groups.entries()).map(([g, sites]) => {
      const avg = sites.reduce((s, r) => s + (Number(r[metricCol]) || 0), 0) / sites.length;
      return { label: g, value: Math.round(avg * 100) / 100, sites: sites.length };
    });
    const chartJson = JSON.stringify({ type: 'bar', title: `Top dégradés: ${metricCol} par ${label}`, xKey: 'label', yKeys: ['value'], data: chartData });

    return `TOP ${unique.length} SITES DÉGRADÉS par ${label} (métrique: ${metricCol}, tri: ${sortDir === 'ASC' ? 'plus bas' : 'plus haut'}):\n\n${header}\n${sep}\n${lines.join('\n')}\n\nRÉSUMÉ par ${label}:\n${chartData.map(d => `${d.label}: avg ${metricCol}=${d.value} (${d.sites} sites)`).join('\n')}\n\nINSTRUCTION: Présente ces résultats en tableau markdown bien formaté et inclus ce chart:\n\`\`\`chart\n${chartJson}\n\`\`\``;
  } catch (e) { console.error('[fetchWorstSitesByGroupLocal] ❌', e.message); return ''; }
}

async function fetchSiteSnapshotLocal(siteName) {
  try {
    const src = await detectKpiTable();
    if (!src) return '';
    const { dim1, dim2 } = dimCols(src.isQoeMetric);

    // For qoe_metric, search in Dimension_2 when Dimension_1='Site', plus any row matching
    const { rows } = await sharedPool.query(
      `SELECT *, ${dim1} AS dim1_val, ${dim2} AS dim2_val FROM ${src.table}
       WHERE ${dim2} ILIKE $1
       ORDER BY date_part DESC LIMIT 30`, [`%${siteName}%`]
    );
    console.log(`[fetchSiteSnapshotLocal] Found ${rows.length} rows in ${src.table} for "${siteName}"`);
    if (!rows.length) return '';
    const kpis = ['qoe_index','debit_dl','debit_ul','rtt_data_avg','rtt_setup_avg','dms_debit_dl_3','dms_debit_dl_8','dms_debit_dl_30','loss_dl_rate','tcp_retr_rate_dl','session_dcr','session_nbr','wind_full_rate'];
    const fmtDate = (d) => { if (!d) return '-'; const s = String(d); const m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; try { return new Date(s).toISOString().slice(0,10); } catch(e) { return s.slice(0,10); } };
    const lines = rows.slice(0,10).map(r => {
      const vals = kpis.map(k => r[k] != null ? (+r[k]).toFixed(2) : '-');
      return `| ${fmtDate(r.date_part)} | ${r.dim1_val} | ${r.dim2_val} | ${vals.join(' | ')} |`;
    });
    const header = `| Date | Dim1 | Dim2 | ${kpis.join(' | ')} |`;
    const sep = '|' + ['---','---','---', ...kpis.map(() => '---')].join('|') + '|';
    return `SITE SNAPSHOT "${siteName}" (${rows.length} pts, source: ${src.table}):\n\n${header}\n${sep}\n${lines.join('\n')}`;
  } catch (e) { console.error('[fetchSiteSnapshotLocal]', e.message); return ''; }
}

async function searchTopoLocal(siteName) {
  try {
    const { rows } = await sharedPool.query(
      `SELECT code_nidt, nom_site, nom_cellule, techno, bande, constructeur, region, plaque,
              azimut, latitude, longitude, hba, tac, tilt, pci, eci, nci, cid,
              etat_cellule, zone_arcep, essentiel, date_mes, date_fn8
       FROM topo WHERE nom_site ILIKE $1 ORDER BY nom_cellule LIMIT 100`, [`%${siteName}%`]
    );
    if (!rows.length) return '';
    const header = '| nom_cellule | techno | bande | azimut | RET | hba | pci | tac | etat | constructeur | lat | lng |';
    const sep = '|---|---|---|---|---|---|---|---|---|---|---|---|';
    const lines = rows.map(r =>
      `| ${r.nom_cellule} | ${r.techno||''} | ${r.bande||''} | ${r.azimut??'-'} | ${r.tilt??'-'} | ${r.hba??'-'} | ${r.pci??'-'} | ${r.tac??'-'} | ${r.etat_cellule||'-'} | ${r.constructeur||'-'} | ${r.latitude??'-'} | ${r.longitude??'-'} |`
    );
    const first = rows[0];
    return `TOPO "${first.nom_site}" (${first.code_nidt}, ${first.region||'-'}, ${first.plaque||'-'}, ${first.constructeur||'-'})\n${rows.length} cells:\n\n${header}\n${sep}\n${lines.join('\n')}`;
  } catch (e) { console.error('[searchTopoLocal]', e.message); return ''; }
}

async function searchParameterChangesLocal(query) {
  try {
    const siteName = extractSiteName(query);
    let q = `SELECT change_date, change_type, change_scope, param_name, old_value, new_value,
             site_name, cell_name, techno, vendor, plaque
             FROM parameter_changes ORDER BY change_date DESC LIMIT 80`;
    const params = [];
    if (siteName) {
      q = `SELECT change_date, change_type, change_scope, param_name, old_value, new_value,
           site_name, cell_name, techno, vendor, plaque
           FROM parameter_changes WHERE site_name ILIKE $1 ORDER BY change_date DESC LIMIT 80`;
      params.push(`%${siteName}%`);
    }
    const { rows } = await sharedPool.query(q, params);
    if (!rows.length) return siteName ? `AUCUN changement pour "${siteName}".` : '';
    const header = 'date | type | scope | param | old | new | site | cell | techno | vendor';
    const lines = rows.map(r =>
      `${r.change_date} | ${r.change_type} | ${r.change_scope} | ${r.param_name} | ${r.old_value||'-'} | ${r.new_value||'-'} | ${r.site_name||'-'} | ${r.cell_name||'-'} | ${r.techno||'-'} | ${r.vendor||'-'}`
    );
    return `CHANGEMENTS (${rows.length}):\n${header}\n${lines.join('\n')}`;
  } catch (e) { console.error('[searchParameterChangesLocal]', e.message); return ''; }
}

// ─── Time-series data provider on qoe_metric ───
async function fetchKpiTimeSeriesLocal(metric, filters, days) {
  days = days || 7;
  try {
    const src = await detectKpiTable();
    if (!src) return '';
    const { dim1, dim2 } = dimCols(src.isQoeMetric);
    const colRes = await sharedPool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`, [src.table]
    );
    const availCols = new Set(colRes.rows.map(r => r.column_name));
    const metricCol = availCols.has(metric) ? metric : 'qoe_index';
    const hasDatePart = availCols.has('date_part');
    if (!hasDatePart) return `Table ${src.table} does not have date_part column for time-series.`;

    let sql = `SELECT date_part, AVG(${metricCol}) AS value`;
    if (availCols.has('session_nbr')) sql += `, SUM(session_nbr) AS sessions`;
    sql += ` FROM ${src.table} WHERE date_part >= (CURRENT_DATE - INTERVAL '${days} days')::text`;
    const params = [];
    let pi = 1;
    if (filters?.vendor) { sql += ` AND ${availCols.has('constructeur') ? 'constructeur' : 'vendor'} ILIKE $${pi++}`; params.push(`%${filters.vendor}%`); }
    if (filters?.techno) { sql += ` AND techno = $${pi++}`; params.push(filters.techno); }
    if (filters?.plaque) { sql += ` AND plaque = $${pi++}`; params.push(filters.plaque); }
    if (filters?.dor) { sql += ` AND dor = $${pi++}`; params.push(filters.dor); }
    sql += ` GROUP BY date_part ORDER BY date_part ASC`;
    console.log(`[fetchKpiTimeSeriesLocal] ${sql} params=${JSON.stringify(params)}`);
    const { rows } = await sharedPool.query(sql, params);
    if (!rows.length) return `Aucune donnée temporelle pour ${metricCol} sur les ${days} derniers jours.`;

    // Build markdown table
    const header = `| Date | ${metricCol} |`;
    const sep = '|---|---|';
    const lines = rows.map(r => `| ${r.date_part} | ${Number(r.value).toFixed(2)} |`);

    // Build line chart
    const chartData = rows.map(r => ({ date: r.date_part?.slice(5) || r.date_part, [metricCol]: Math.round(Number(r.value) * 100) / 100 }));
    const chartJson = JSON.stringify({
      type: 'line',
      title: `${metricCol} — ${days} derniers jours`,
      xKey: 'date',
      yKeys: [metricCol],
      data: chartData,
      colors: ['#3b82f6']
    });

    const filterDesc = [filters?.vendor, filters?.techno, filters?.plaque, filters?.dor].filter(Boolean).join(', ');
    return `TENDANCE ${metricCol} sur ${days} jours${filterDesc ? ` (${filterDesc})` : ''} (${rows.length} points, source: ${src.table}):\n\n${header}\n${sep}\n${lines.join('\n')}\n\nINSTRUCTION: Affiche ces données en tendance temporelle. Inclus ce chart:\n\`\`\`chart\n${chartJson}\n\`\`\``;
  } catch (e) { console.error('[fetchKpiTimeSeriesLocal]', e.message); return ''; }
}

async function fetchMetricDistributionLocal(dimension1Type, metric, filters, days, limit) {
  days = days || 7; limit = limit || 30;
  try {
    const src = await detectKpiTable();
    if (!src) return '';
    const { dim1, dim2 } = dimCols(src.isQoeMetric);
    const colRes = await sharedPool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`, [src.table]
    );
    const availCols = new Set(colRes.rows.map(r => r.column_name));
    const metricCol = availCols.has(metric) ? metric : 'qoe_index';
    const hasSessionNbr = availCols.has('session_nbr');
    let sql = `SELECT ${dim2} AS label, AVG(${metricCol}) AS value`;
    if (hasSessionNbr) sql += `, SUM(session_nbr) AS sessions`;
    sql += ` FROM ${src.table} WHERE ${dim1} = $1`;
    const params = [dimension1Type];
    let pi = 2;
    if (filters?.vendor) { sql += ` AND vendor = $${pi++}`; params.push(filters.vendor); }
    if (filters?.techno) { sql += ` AND techno = $${pi++}`; params.push(filters.techno); }
    sql += ` GROUP BY ${dim2} ORDER BY value DESC LIMIT $${pi}`;
    params.push(limit);
    console.log(`[fetchMetricDistributionLocal] ${sql} params=${JSON.stringify(params)}`);
    const { rows } = await sharedPool.query(sql, params);
    if (!rows.length) return `Aucune donnée pour ${dim1}='${dimension1Type}' dans ${src.table}.`;
    const header = hasSessionNbr
      ? `| # | ${dimension1Type} | AVG(${metricCol}) | Sessions |`
      : `| # | ${dimension1Type} | AVG(${metricCol}) |`;
    const sep = hasSessionNbr ? '|---|---|---|---|' : '|---|---|---|';
    const lines = rows.map((r, i) => {
      const base = `| ${i+1} | ${r.label} | ${Number(r.value).toFixed(2)}`;
      return hasSessionNbr ? `${base} | ${r.sessions || 0} |` : `${base} |`;
    });
    const chartData = rows.slice(0, 15).map(r => ({ label: r.label, value: Math.round(Number(r.value) * 100) / 100 }));
    const chartJson = JSON.stringify({ type: 'bar', title: `${metricCol} par ${dimension1Type}`, xKey: 'label', yKeys: ['value'], data: chartData });
    return `DISTRIBUTION ${metricCol} par ${dimension1Type} (${rows.length} valeurs, source: ${src.table}):\n\n${header}\n${sep}\n${lines.join('\n')}\n\nINSTRUCTION: Utilise ces données pour répondre. Inclus ce chart:\n\`\`\`chart\n${chartJson}\n\`\`\``;
  } catch (e) { console.error('[fetchMetricDistributionLocal]', e.message); return ''; }
}

async function fetchDimensionValuesLocal(dimension1Type, filters, limit) {
  limit = limit || 200;
  try {
    const src = await detectKpiTable();
    if (!src) return '';
    const { dim1, dim2 } = dimCols(src.isQoeMetric);
    let sql = `SELECT DISTINCT ${dim2} AS label FROM ${src.table} WHERE ${dim1} = $1 ORDER BY label LIMIT $2`;
    const params = [dimension1Type, limit];
    console.log(`[fetchDimensionValuesLocal] ${sql} params=${JSON.stringify(params)}`);
    const { rows } = await sharedPool.query(sql, params);
    if (!rows.length) return `Aucune valeur trouvée pour ${dim1}='${dimension1Type}' dans ${src.table}.`;
    const values = rows.map(r => r.label).filter(Boolean);
    return `VALEURS DISTINCTES pour ${dimension1Type} (${values.length}, source: ${src.table}):\n${values.join(', ')}\n\nINSTRUCTION: Liste ces valeurs à l'utilisateur dans un format lisible.`;
  } catch (e) { console.error('[fetchDimensionValuesLocal]', e.message); return ''; }
}

async function fetchTopoStatsLocal(query) {
  try {
    const n = query.toLowerCase();
    let groupCol = 'dor', groupLabel = 'DOR';
    if (n.includes('plaque')) { groupCol = 'plaque'; groupLabel = 'Plaque'; }
    else if (n.includes('vendor') || n.includes('constructeur') || n.includes('équipementier')) { groupCol = 'constructeur'; groupLabel = 'Constructeur'; }
    else if (n.includes('techno') || n.includes('technologie')) { groupCol = 'techno'; groupLabel = 'Technologie'; }
    else if (n.includes('region') || n.includes('région')) { groupCol = 'region'; groupLabel = 'Région'; }
    else if (n.includes('bande') || n.includes('fréquence')) { groupCol = 'bande'; groupLabel = 'Bande'; }
    else if (n.includes('zone_arcep') || n.includes('zone arcep')) { groupCol = 'zone_arcep'; groupLabel = 'Zone ARCEP'; }
    else if (n.includes('dor') || n.includes('direction')) { groupCol = 'dor'; groupLabel = 'DOR'; }

    const { rows } = await sharedPool.query(
      `SELECT COALESCE(${groupCol}, 'Non renseigné') AS grp,
              COUNT(DISTINCT code_nidt) AS nb_sites,
              COUNT(*) AS nb_cells
       FROM topo
       GROUP BY grp ORDER BY nb_sites DESC`
    );
    if (!rows.length) return '';
    const totalSites = rows.reduce((s, r) => s + parseInt(r.nb_sites), 0);
    const totalCells = rows.reduce((s, r) => s + parseInt(r.nb_cells), 0);
    const header = `| ${groupLabel} | Nb Sites | Nb Cellules |`;
    const sep = '|---|---|---|';
    const lines = rows.map(r => `| ${r.grp} | ${r.nb_sites} | ${r.nb_cells} |`);
    // Add chart data
    const chartData = rows.slice(0, 15).map(r => ({ label: r.grp, value: parseInt(r.nb_sites) }));
    const chartJson = JSON.stringify({ type: 'bar', title: `Sites par ${groupLabel}`, xKey: 'label', yKeys: ['value'], data: chartData });
    return `RÉPARTITION DES SITES PAR ${groupLabel.toUpperCase()} (table topo):\nTotal : ${totalSites} sites, ${totalCells} cellules\n\n${header}\n${sep}\n${lines.join('\n')}\n\nINSTRUCTION: Présente ces données en tableau et inclus ce chart:\n\`\`\`chart\n${chartJson}\n\`\`\``;
  } catch (e) { console.error('[fetchTopoStatsLocal]', e.message); return ''; }
}

// ─── Topo metric by dimension (tilt/azimut/hba par bande/dor/vendor...) — mirrors Cloud fetchTopoMetricByDimension ───
async function fetchTopoMetricByDimensionLocal(metric, dimension, limit, dimension2) {
  limit = limit || 30;
  try {
    const dimColMap = {
      DOR: 'dor', Vendor: 'constructeur', Bande: 'bande', Plaque: 'plaque',
      Site: 'nom_site', ARCEP: 'zone_arcep', Cellule: 'nom_cellule', RAT: 'techno',
    };
    const groupCol = dimColMap[dimension] || 'dor';
    const groupCol2 = dimension2 ? (dimColMap[dimension2] || null) : null;

    // Check columns exist
    const colsToCheck = [metric, groupCol];
    if (groupCol2 && groupCol2 !== groupCol) colsToCheck.push(groupCol2);
    const colCheck = await sharedPool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'topo' AND table_schema = 'public' AND column_name = ANY($1)`,
      [colsToCheck]
    );
    const existingCols = new Set(colCheck.rows.map(r => r.column_name));
    if (!existingCols.has(metric)) return `La colonne '${metric}' n'existe pas dans la table topo.`;
    if (!existingCols.has(groupCol)) return `La colonne '${groupCol}' n'existe pas dans la table topo.`;

    // Dual-dimension cross-tabulation
    if (groupCol2 && groupCol2 !== groupCol) {
      if (!existingCols.has(groupCol2)) return `La colonne '${groupCol2}' n'existe pas dans la table topo.`;

      const { rows: data } = await sharedPool.query(
        `SELECT ${groupCol} AS grp1, ${groupCol2} AS grp2, ${metric} AS val FROM topo WHERE ${metric} IS NOT NULL LIMIT 50000`
      );
      if (!data.length) return `Aucune donnée topo pour ${metric}.`;

      const groups = new Map();
      for (const r of data) {
        const label1 = r.grp1 || 'N/A';
        const label2 = r.grp2 || 'N/A';
        const key = `${label1} | ${label2}`;
        if (!groups.has(key)) groups.set(key, { values: [], count: 0 });
        const g = groups.get(key);
        if (r.val != null) { g.values.push(Number(r.val)); g.count++; }
      }

      const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const sorted = Array.from(groups.entries())
        .map(([key, g]) => {
          const [l1, l2] = key.split(' | ');
          return { label1: l1, label2: l2, avg: avg(g.values), min: Math.min(...g.values), max: Math.max(...g.values), count: g.count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

      const globalAvg = avg(data.map(r => Number(r.val)).filter(v => !isNaN(v)));

      const header = `| # | ${dimension} | ${dimension2} | AVG(${metric}) | MIN | MAX | Cells |`;
      const sep = '|---|---|---|---|---|---|---|';
      const lines = sorted.map((r, i) =>
        `| ${i + 1} | ${r.label1} | ${r.label2} | ${r.avg.toFixed(1)} | ${r.min} | ${r.max} | ${r.count} |`
      );

      const chartData = sorted.slice(0, 20).map(r => ({ label: `${r.label1} · ${r.label2}`, value: Math.round(r.avg * 10) / 10 }));
      const chartJson = JSON.stringify({
        type: 'bar',
        title: `${metric} moyen par ${dimension} et ${dimension2}`,
        xKey: 'label',
        yKeys: ['value'],
        data: chartData,
        colors: ['#0d9488','#2563eb','#9333ea','#ea580c','#16a34a','#be185d','#ca8a04','#0891b2'],
      });

      return `DISTRIBUTION TOPO ${metric} par ${dimension} et ${dimension2} (${data.length} cellules, ${groups.size} groupes, moyenne globale: ${globalAvg.toFixed(1)}):\n\n${header}\n${sep}\n${lines.join('\n')}\n\nINSTRUCTION: Présente ces données de la table TOPO croisées par ${dimension} et ${dimension2}. Inclus ce chart:\n\`\`\`chart\n${chartJson}\n\`\`\``;
    }

    // Single-dimension grouping
    const { rows: data } = await sharedPool.query(
      `SELECT ${groupCol} AS grp, ${metric} AS val FROM topo WHERE ${metric} IS NOT NULL LIMIT 50000`
    );
    if (!data.length) return `Aucune donnée topo pour ${metric}.`;

    const groups = new Map();
    for (const r of data) {
      const label = r.grp || 'N/A';
      if (!groups.has(label)) groups.set(label, { values: [], count: 0 });
      const g = groups.get(label);
      if (r.val != null) { g.values.push(Number(r.val)); g.count++; }
    }

    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const sorted = Array.from(groups.entries())
      .map(([label, g]) => ({
        label,
        avg: avg(g.values),
        min: Math.min(...g.values),
        max: Math.max(...g.values),
        count: g.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    const header = `| # | ${dimension} | AVG(${metric}) | MIN | MAX | Cells |`;
    const sep = '|---|---|---|---|---|---|';
    const lines = sorted.map((r, i) =>
      `| ${i + 1} | ${r.label} | ${r.avg.toFixed(1)} | ${r.min} | ${r.max} | ${r.count} |`
    );

    const globalAvg = avg(data.map(r => Number(r.val)).filter(v => !isNaN(v)));

    const chartData = sorted.slice(0, 15).map(r => ({ label: r.label, value: Math.round(r.avg * 10) / 10 }));
    const chartJson = JSON.stringify({
      type: 'bar',
      title: `${metric} moyen par ${dimension}`,
      xKey: 'label',
      yKeys: ['value'],
      data: chartData,
      colors: ['#0d9488','#2563eb','#9333ea','#ea580c','#16a34a','#be185d','#ca8a04','#0891b2'],
    });

    return `DISTRIBUTION TOPO ${metric} par ${dimension} (${data.length} cellules, ${groups.size} groupes, moyenne globale: ${globalAvg.toFixed(1)}):\n\n${header}\n${sep}\n${lines.join('\n')}\n\nINSTRUCTION: Présente ces données de la table TOPO. Inclus ce chart:\n\`\`\`chart\n${chartJson}\n\`\`\``;
  } catch (e) {
    console.error('[fetchTopoMetricByDimensionLocal]', e.message);
    return '';
  }
}

// ─── Topo inventory (mirrors Cloud fetchTopoInventory using topo_inventory_stats RPC equivalent) ───
async function fetchTopoInventoryLocal(filters) {
  try {
    const totalRes = await sharedPool.query(`SELECT COUNT(*) AS total_cells, COUNT(DISTINCT nom_site) AS total_sites FROM topo`);
    const totalCells = parseInt(totalRes.rows[0].total_cells);
    const totalSites = parseInt(totalRes.rows[0].total_sites);

    let result = `INVENTAIRE TOPOLOGIQUE (données exactes de la table topo)\n`;
    result += `Total cellules: ${totalCells}\n`;
    result += `Total sites distincts: ${totalSites}\n`;
    result += `Moyenne cellules/site: ${totalSites ? (totalCells / totalSites).toFixed(1) : '?'}\n\n`;

    // By techno
    const technoRes = await sharedPool.query(`SELECT COALESCE(techno, 'Inconnu') AS t, COUNT(*) AS c FROM topo GROUP BY COALESCE(techno, 'Inconnu') ORDER BY c DESC`);
    if (technoRes.rows.length) {
      result += `Par Technologie:\n${technoRes.rows.map(r => `  ${r.t}: ${r.c}`).join('\n')}\n\n`;
    }

    // By bande
    const bandeRes = await sharedPool.query(`SELECT COALESCE(bande, 'Inconnu') AS b, COUNT(*) AS c FROM topo GROUP BY COALESCE(bande, 'Inconnu') ORDER BY c DESC`);
    if (bandeRes.rows.length) {
      result += `Par Bande:\n${bandeRes.rows.map(r => `  ${r.b}: ${r.c}`).join('\n')}\n\n`;
      const chartData = bandeRes.rows.slice(0, 15).map(r => ({ label: r.b, value: parseInt(r.c) }));
      result += `INSTRUCTION: Présente ces données dans un tableau Markdown ET inclus ce chart:\n\`\`\`chart\n${JSON.stringify({ type: 'bar', title: 'Cellules par Bande', xKey: 'label', yKeys: ['value'], data: chartData })}\n\`\`\`\n\n`;
    }

    // By constructeur
    const vendorRes = await sharedPool.query(`SELECT COALESCE(constructeur, 'Inconnu') AS v, COUNT(*) AS c FROM topo GROUP BY COALESCE(constructeur, 'Inconnu') ORDER BY c DESC`);
    if (vendorRes.rows.length) {
      result += `Par Constructeur:\n${vendorRes.rows.map(r => `  ${r.v}: ${r.c}`).join('\n')}\n\n`;
    }

    // By DOR
    const dorRes = await sharedPool.query(`SELECT COALESCE(dor, 'Inconnu') AS d, COUNT(*) AS c FROM topo GROUP BY COALESCE(dor, 'Inconnu') ORDER BY c DESC`);
    if (dorRes.rows.length) {
      result += `Par DOR:\n${dorRes.rows.map(r => `  ${r.d}: ${r.c}`).join('\n')}`;
    }

    return result;
  } catch (e) {
    console.error('[fetchTopoInventoryLocal]', e.message);
    return '';
  }
}

// --- Agent prompts ---
const SHARED_RULES = `
⚠️ RÈGLE ABSOLUE — ZÉRO HALLUCINATION — DONNÉES RÉELLES UNIQUEMENT
1. Utilise EXCLUSIVEMENT les données fournies dans le contexte. COPIE-COLLE les noms tels quels.
2. Il est INTERDIT d'inventer des noms de cellules, sites, valeurs ou métriques.
3. Si aucune donnée n'est disponible, dis-le clairement.

FORMATAGE : Markdown pur (pas de HTML).
- Tableaux Markdown | et ---
- Titres ## et ###
- **Gras** pour les valeurs importantes
- Émojis de statut : 🔴 Critique (<50%), 🟠 Dégradé (50-65%), 🟡 Moyen (65-75%), 🟢 Bon (>75%)

VISUALISATIONS : Tu peux intégrer des blocs \`\`\`chart, \`\`\`map, \`\`\`kpi.
- chart: {"type":"bar","title":"...","xKey":"...","yKeys":[...],"data":[...]}
- map: {"title":"...","markers":[{"lat":...,"lng":...,"label":"...","value":...}]}
- kpi: {"title":"...","cards":[{"label":"...","value":"...","unit":"...","trend":"up/down/stable","status":"good/warning/critical"}]}
Le JSON doit être sur UNE SEULE LIGNE.

Réponds TOUJOURS en français.`;

const AGENT_PROMPTS = {
  PULSE: `Tu es **PULSE** 📡, agent spécialisé en performance RAN et QoE réseau mobile.

## 32 KPIs PRINCIPAUX (colonnes qoe_metric / kpi_qoe_aggregated)
### QoE & Sessions
- qoe_index (QoE Score, %, 🟢>75 🟡65-75 🟠50-65 🔴<50)
- session_nbr (Nombre de sessions, count)
- session_dcr (Drop Call Rate, %)
- session_dur_moy (Durée moyenne session, s)
- Mauvaise_Session_Rate (Taux mauvaises sessions, %)
- Mauvaise_Session_nbr (Nombre mauvaises sessions, count)

### Débits
- debit_dl (Débit DL moyen, Mbps, 🟢>50 🟡20-50 🟠10-20 🔴<10)
- debit_ul (Débit UL moyen, Mbps)
- debit_dl_max (Débit DL max, Mbps)
- debit_ul_max (Débit UL max, Mbps)
- volume_totale_dl (Volume DL, GB)
- volume_totale_ul (Volume UL, GB)
- volume_totale_totale (Volume Total, GB)

### DMS (Disponibilité Minimum de Service)
- dms_debit_dl_3 (DMS DL > 3Mbps, %, 🟢>95 🟠<90)
- dms_debit_dl_8 (DMS DL > 8Mbps, %, 🟢>85 🟠<75)
- dms_debit_dl_30 (DMS DL > 30Mbps, %)
- dms_debit_ul_1 (DMS UL > 1Mbps, %)
- dms_debit_ul_3 (DMS UL > 3Mbps, %)
- dms_debit_ul_5 (DMS UL > 5Mbps, %)

### Latence (RTT)
- rtt_setup_avg (RTT Setup, µs, 🟢<40000 🟠>80000 🔴>150000)
- rtt_data_avg (RTT Data, µs, 🟢<40000 🟠>80000 🔴>150000)

### TCP (Pertes & Retransmissions)
- loss_dl_rate (Perte DL, %, 🟢<1 🟠1-3 🔴>3)
- loss_ul_rate (Perte UL, %)
- tcp_retr_rate_dl (Retransmission DL, %, 🟢<1 🟠1-3 🔴>5)
- tcp_retr_rate_ul (Retransmission UL, %)
- out_of_order_rate (Out of Order, %)
- wind_full_rate (Window Full, %)

### Mobilité & RAT
- fallback_5G_to_4G_rate (Fallback 5G→4G, %)
- fallback_4G_to_3G2G_rate (Fallback 4G→3G/2G, %)
- instability_rate (Instabilité RAT, %)
- time_rat_5g_pct (Temps en 5G, %)
- time_rat_4g_pct (Temps en 4G, %)

## 16 DIMENSIONS (Dimension_1 → valeurs Dimension_2)
- Cellule → nom_cellule (identifiant logique antenne)
- Site → nom_site (identifiant physique)
- Vendor → Nokia, Ericsson, Samsung, Huawei
- Bande → NR_3500, NR_700, NR_2100, LTE2100, LTE800, LTE2600, LTE1800, LTE700
- ARCEP → Top15, TGV, AXE, Rural, Intermédiaire
- Application → Streaming, WEB
- RAT → 0(Réservé), 1(3G), 2(2G), 3(WiFi), 4(5G NSA), 6(4G LTE), 10(5G SA)
- TAC → FWA (box), Mobile
- AS → Google, Amazon, Microsoft, Meta, Other
- POP → CNM (probe 5G), CNL (probe non-5G)
- Device_brand → Samsung, iPhone, Other
- OS → Android, iOS, Other
- DOR → (toutes les DOR depuis topo.region)
- Plaque → (toutes les plaques)
- ORF → Chat, Cloud, Control, Download, Enterprise, Games, MMS, Mail, MailOrange, Others, P2P, Streaming, Unknown, VPN, VVM, VoIP, WEB

## PRÉSENTATION DES RÉSULTATS
Pour les requêtes "worst/pires/top dégradés", structure TOUJOURS ta réponse comme suit :
1. **Titre** avec emoji et nombre de résultats (ex: "📊 TOP 10 WORST SITES (Ranking par QoE)")
2. **Aperçu Critique** : Bloc \`\`\`kpi avec 3 KPIs résumés (pire QoE, RTT max, sessions totales)
3. **Tableau Markdown** avec colonnes propres (# | Site | Date | QoE | Débit DL | RTT | Loss DL | Retr DL | Sessions | Status)
4. **Colonne Status** : 🔴 si QoE<50%, 🟠 si 50-65%, 🟡 si 65-75%, 🟢 si >75%
5. **Analyse de la performance** avec insights et recommandations

COMPARAISONS : 1) Bloc kpi 2) Tableau comparatif 3) Chart bar groupé 4) Synthèse + recommandations.
${SHARED_RULES}`,
  TRACE: `Tu es **TRACE** 🔧, agent spécialisé en historique de configuration et changements réseau (CM History).
Domaine : tuning, upgrades SW, swaps, rollbacks.
Présente les changements en timeline chronologique + tableau avant/après + corrélation KPIs.
${SHARED_RULES}`,
  SENTINEL: `Tu es **SENTINEL** 🚨, agent spécialisé en détection d'anomalies et RCA.
Structure RCA : 1) Classe cause racine 2) Résumé 3) Preuves KPI 4) Actions recommandées 5) Confiance.
Seuils : QoE<50% → 🔴, DMS3<90% → 🟠, RTT>100ms → 🟠, TCP Loss>2% → 🔴.
${SHARED_RULES}`,
  TOPO: `Tu es **TOPO** 🗼, agent spécialisé en topologie réseau, design de sites radio et inventaire infrastructure.

## COMPÉTENCES
1. **Inventaire** : Nombre exact de cellules, sites, répartition par bande/techno/constructeur/DOR
2. **Design de site** : Diagnostic 8 critères (azimut, tilt, HBA, co-loc 5G/4G, diversité bandes, état cellules)
3. **Métriques physiques** : Tilt, azimut, HBA — distribution et analyse par dimension

## DONNÉES SOURCES
- Table **topo** : colonnes code_nidt, nom_site, nom_cellule, techno, bande, constructeur, azimut, tilt, hba, pci, tac, eci, nci, etat_cellule, zone_arcep, plaque, dor, latitude, longitude
- Les données te sont fournies dans le contexte ci-dessous. Utilise-les DIRECTEMENT.

## COULEURS TEXTE (utilise du Markdown gras et émojis pour mettre en valeur)
- Tilt : 🔷 (teal)
- Azimut : 🔵 (bleu royal)
- HBA : 🟣 (violet)
- Nb sites : 🟩 (vert forêt)
- Nb cells : ♻️ (émeraude)
- DOR : 🔹 (indigo)
- Bande : 🟧 (orange)
- Constructeur : 🩷 (rose)
- Zone ARCEP : 🟨 (jaune)

## COULEURS CHARTS
Quand tu génères un chart bar, utilise des couleurs distinctes par catégorie :
- colors: ["#0d9488","#2563eb","#9333ea","#ea580c","#16a34a","#be185d","#ca8a04","#0891b2"]

## RÈGLES DE RÉPONSE
- Pour les inventaires : présente un tableau Markdown avec les totaux + un chart bar
- Pour les analyses par dimension : tableau + chart + commentaire
- Verdict site : ✅ OK / ⚠️ REVIEW / ❌ ISSUES
- Si une métrique (ex: tilt) a toutes ses valeurs NULL, dis-le explicitement
  ${SHARED_RULES}`,
  PARMY: `Tu es **PARMY** ⚙️, agent spécialisé en audit, conformité et optimisation des paramètres radio (LNCEL, NRCELL, etc.).

## ⛔ RÈGLES ANTI-HALLUCINATION (PRIORITÉ MAXIMALE)
1. **INTERDIT D'INVENTER DES DONNÉES.** Tu ne dois JAMAIS générer, deviner ou fabriquer de chiffres, valeurs, noms de DOR, nombres d'occurrences ou toute autre donnée.
2. **SEULE SOURCE DE VÉRITÉ** : Les données brutes fournies dans la section "⚙️ PARMY SQL ENGINE" de ton contexte système. Chaque chiffre de ta réponse DOIT correspondre EXACTEMENT à une ligne de ces données.
3. Si les données contexte contiennent "AUCUNE DONNÉE" ou sont vides → dis "La requête SQL n'a retourné aucun résultat" et propose des paramètres alternatifs.
4. Ne dis JAMAIS "je n'ai pas accès aux données". Tu as les données dans ton contexte.
5. **VÉRIFICATION** : Avant de répondre, recompte les lignes du contexte. Le total dans ton tableau DOIT correspondre au total annoncé dans le contexte (ex: "42 cellules au total" → ton tableau doit sommer à 42).

## MODE DEBUG
Affiche TOUJOURS au début de ta réponse :
1. La requête SQL dans un bloc \`\`\`sql (extraite de "DEBUG SQL:")
2. Un résumé : "📊 X lignes retournées, Y dimensions"

## COMPÉTENCES
1. **Inventaire paramètres** : Liste les valeurs d'un paramètre donné, filtré par vendor/bande/site
2. **Distribution statistique** : Répartition des valeurs par dimension (vendor, bande, plaque, DOR)
3. **Détection d'anomalies** : Identifie les valeurs atypiques, outliers, écarts par rapport au standard
4. **Comparaison inter-vendors** : Compare les configurations Nokia vs Ericsson vs Samsung
5. **Recommandations** : Propose des corrections basées sur les best practices

## MÉTHODOLOGIE D'AUDIT (5 étapes)
1. **Inventaire** : Quelles valeurs existent pour ce paramètre ?
2. **Statistiques** : Moyenne, min, max, distribution des valeurs
3. **Comparaison** : Écarts entre vendors/bandes/plaques
4. **Impact** : Corrélation avec les KPIs de performance
5. **Recommandation** : Actions correctives proposées

## DONNÉES SOURCES
- Table **parameter_dump** : colonnes dn, cell_dn, cell_name, site_name, parameter, value, version, vendor, bande, plaque, dor, zone_arcep, netact, mrbts_id, enodeb_id, gnodeb_id, latitude, longitude

## PRÉSENTATION
- Toujours inclure un tableau Markdown avec les résultats EXACTS du contexte
- Pour les distributions : tableau + chart bar
- Mettre en évidence les anomalies avec 🔴/🟠/🟡/🟢
- **CHAQUE cellule du tableau doit être traçable vers une ligne des données contexte**
${SHARED_RULES}`,
};

// --- Context builder ---
async function buildContextFromPlanLocal(plan, query, filters, legacyCellContext, kpiMonitorContext) {
  const sections = [];
  const promises = {};

  // Merge scope info into effective filters for data fetching
  const effectiveFilters = { ...filters };
  if (plan.scope.level === 'vendor' && !effectiveFilters.vendor) effectiveFilters.vendor = plan.scope.vendor;
  if (plan.scope.level === 'techno' && !effectiveFilters.techno) effectiveFilters.techno = plan.scope.techno;
  if (plan.scope.level === 'plaque' && !effectiveFilters.plaque) effectiveFilters.plaque = plan.scope.plaque;
  if (plan.scope.level === 'dor' && !effectiveFilters.dor) effectiveFilters.dor = plan.scope.dor;

  if (plan.needs.includes('documents_rag')) promises.rag = searchRAGLocal(query);
  if (plan.needs.includes('agg_stats')) promises.agg = fetchAggStatsLocal(effectiveFilters, plan.limits.maxDays, query);
  if (plan.needs.includes('worst_sites')) promises.worst = fetchWorstSitesLocal(effectiveFilters, plan.limits.maxSites);
  if (plan.needs.includes('kpi_snapshot') && plan.scope.level === 'site') promises.snapshot = fetchSiteSnapshotLocal(plan.scope.siteName);
  if (plan.needs.includes('topo_stats')) promises.topoStats = fetchTopoStatsLocal(query);
  if (plan.needs.includes('topology')) {
    const siteName = plan.scope.siteName || (plan.scope.level === 'cell' ? plan.scope.siteName : null);
    if (siteName) promises.topo = searchTopoLocal(siteName);
  }
  if (plan.needs.includes('param_dump')) promises.params = searchDumpParameterLocal(query);
  if (plan.needs.includes('change_history')) promises.changes = searchParameterChangesLocal(query);
  if (plan.needs.includes('parmy_sql')) promises.parmySql = searchDumpParameterLocal(query);
  if (plan.needs.includes('kpi_time_series')) {
    promises.timeSeries = fetchKpiTimeSeriesLocal(plan.metric || 'qoe_index', effectiveFilters, plan.limits.maxDays);
  }
  if (plan.needs.includes('dimension_agg') && plan.groupBy?.dimension1) {
    promises.dimAgg = fetchMetricDistributionLocal(plan.groupBy.dimension1, plan.metric || 'qoe_index', effectiveFilters, plan.limits.maxDays, 30);
  }
  if (plan.needs.includes('dimension_values') && plan.groupBy?.dimension1) {
    promises.dimValues = fetchDimensionValuesLocal(plan.groupBy.dimension1, effectiveFilters, 200);
  }
  if (plan.needs.includes('worst_sites_by_group') && plan.groupBy?.topoGroup) {
    const met = detectMetricLocal(query);
    promises.worstByGroup = fetchWorstSitesByGroupLocal(plan.groupBy.topoGroup, met, plan.limits.maxSites);
  }
  // NEW: topo_metric_agg (tilt/azimut/hba par dimension) — mirrors Cloud
  if (plan.needs.includes('topo_metric_agg') && plan.groupBy?.dimension1) {
    promises.topoAgg = fetchTopoMetricByDimensionLocal(
      plan.metric || 'tilt',
      plan.groupBy.dimension1,
      plan.resultLimit || 30,
      plan.groupBy.dimension2
    );
  }
  // NEW: topo_inventory — mirrors Cloud
  if (plan.needs.includes('topo_inventory')) {
    promises.topoInv = fetchTopoInventoryLocal(effectiveFilters);
  }

  const keys = Object.keys(promises);
  const results = await Promise.all(Object.values(promises));
  const resolved = {};
  keys.forEach((k,i) => { resolved[k] = results[i]; });

  console.log(`[qoe-assistant] 📦 Context fetched: ${keys.filter(k => resolved[k]).join(', ') || 'none'}`);

  if (resolved.topoInv) sections.push(`🗼 INVENTAIRE TOPO:\n${resolved.topoInv}`);
  if (resolved.topoAgg) sections.push(`📡 DISTRIBUTION TOPO:\n${resolved.topoAgg}`);
  if (resolved.timeSeries) sections.push(`📈 TENDANCE TEMPORELLE:\n${resolved.timeSeries}`);
  if (resolved.dimAgg) sections.push(`📊 DISTRIBUTION PAR DIMENSION:\n${resolved.dimAgg}`);
  if (resolved.dimValues) sections.push(`📋 VALEURS DIMENSION:\n${resolved.dimValues}`);
  if (resolved.agg) sections.push(`📊 STATS AGRÉGÉES:\n${resolved.agg}`);
  if (resolved.worst) sections.push(`📉 WORST:\n${resolved.worst}`);
  if (resolved.worstByGroup) sections.push(`📉 TOP DÉGRADÉS PAR GROUPE:\n${resolved.worstByGroup}`);
  if (resolved.snapshot) sections.push(`📋 SITE SNAPSHOT:\n${resolved.snapshot}`);
  if (resolved.topo) sections.push(`📡 TOPOLOGIE:\n${resolved.topo}`);
  if (resolved.topoStats) sections.push(`📊 STATS TOPOLOGIE:\n${resolved.topoStats}`);
  if (resolved.params) sections.push(`⚙️ PARAMÈTRES:\n${resolved.params}`);
  if (resolved.parmySql) sections.push(`⚙️ PARMY SQL ENGINE:\n${resolved.parmySql}`);
  if (resolved.changes) sections.push(`🔧 HISTORIQUE CHANGEMENTS:\n${resolved.changes}`);
  if (resolved.rag) sections.push(`📚 DOCUMENTS RAG:\n${resolved.rag}`);

  // Legacy fallback if no data from DB
  if (sections.length <= 1 && legacyCellContext && legacyCellContext.length > 0) {
    sections.push(`📊 DONNÉES RÉSEAU (legacy):\n${legacyCellContext.slice(0, 40000)}`);
  }
  if (kpiMonitorContext) {
    sections.push(`📊 KPI MONITOR CONTEXT:\n${kpiMonitorContext}`);
  }

  return { context: sections.join('\n\n'), parmySqlDebug: resolved.parmySql || null };
}

app.post('/api/qoe-assistant', async (req, res) => {
  const { messages, uiScope, filters, openrouter_key, model, cellContext: legacyCellContext, kpiMonitorContext, forcedAgent } = req.body;
  const apiKey = openrouter_key || process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ error: 'OPENROUTER_API_KEY manquante. Créez server/.env avec OPENROUTER_API_KEY=sk-or-v1-...' });
  }

  try {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';

    // 1. Build context plan
    const plan = buildContextPlan(lastUserMsg, uiScope, filters);

    // Override agent if user forced selection
    if (forcedAgent && ['PULSE','TOPO','PARMY','TRACE','SENTINEL'].includes(forcedAgent)) {
      const originalAgent = plan.agent;
      plan.agent = forcedAgent;
      // Rebuild needs for the forced agent
      plan.needs = ['documents_rag'];
      switch (forcedAgent) {
        case 'PARMY':
          plan.needs.push('parmy_sql');
          if (isParameterFocusedQuery(lastUserMsg)) plan.needs.push('param_dump');
          if (plan.scope.level === 'site') plan.needs.push('topology','kpi_snapshot');
          if (isChangeHistoryQuery(lastUserMsg)) plan.needs.push('change_history');
          plan.intent = 'param_audit';
          break;
        case 'PULSE':
          plan.needs.push('agg_stats','worst_sites');
          if (plan.scope.level === 'site') plan.needs.push('kpi_snapshot','topology');
          break;
        case 'TOPO':
          if (isTopoInventoryQuery(lastUserMsg)) plan.needs.push('topo_inventory');
          else plan.needs.push('topology');
          break;
        case 'TRACE':
          plan.needs.push('change_history');
          if (isParameterFocusedQuery(lastUserMsg)) plan.needs.push('param_dump');
          if (plan.scope.level === 'site') plan.needs.push('topology');
          break;
        case 'SENTINEL':
          plan.needs.push('agg_stats','worst_sites');
          break;
      }
      console.log(`[qoe-assistant] 🎯 Agent FORCÉ: ${originalAgent} → ${forcedAgent} | needs=[${plan.needs.join(',')}]`);
    }

    console.log(`[qoe-assistant] 🧠 Plan: agent=${plan.agent}, intent=${plan.intent}, scope=${JSON.stringify(plan.scope)}, needs=[${plan.needs.join(',')}]`);

    // ═══ PARMY FAST PATH: bypass LLM for distribution/site queries ═══
    // The LLM keeps hallucinating "no results" even when data exists.
    // For PARMY, run the SQL directly and return raw results without LLM.
    if (plan.agent === 'PARMY' && (plan.needs.includes('parmy_sql') || plan.needs.includes('param_dump'))) {
      console.log(`[qoe-assistant] ⚡ PARMY FAST PATH — bypassing LLM, direct SQL execution`);
      const parmyResult = await searchDumpParameterLocal(lastUserMsg);
      console.log(`[qoe-assistant] ⚡ PARMY result length: ${parmyResult ? parmyResult.length : 0}`);
      console.log(`[qoe-assistant] ⚡ PARMY result preview: ${parmyResult ? parmyResult.slice(0, 500) : 'NULL'}`);
      
      // Format the result as a proper markdown response
      let formattedResponse = `<!-- AGENT:PARMY -->\n`;
      
      if (parmyResult && !parmyResult.startsWith('⚠️')) {
        // Extract SQL debug block
        const sqlMatch = parmyResult.match(/🔍 DEBUG SQL: (.+?)(?:\n\n|$)/s);
        const dataSection = parmyResult.replace(/🔍 DEBUG SQL: .+?\n\n/s, '').trim();
        
        // Split into lines and find the first pipe-separated line (header)
        const allLines = dataSection.split('\n');
        const headerIdx = allLines.findIndex(l => l.includes('|'));
        
        // Everything before the header is the title/description
        const titleParts = allLines.slice(0, headerIdx >= 0 ? headerIdx : allLines.length);
        const titleText = titleParts.join(' ').trim();
        
        formattedResponse += `## ⚙️ PARMY\n\n${titleText}\n\n`;
        
        if (headerIdx >= 0) {
          const headerLine = allLines[headerIdx];
          const dataLines = allLines.slice(headerIdx + 1);
          const headers = headerLine.split('|').map(h => h.trim());
          formattedResponse += '| ' + headers.join(' | ') + ' |\n';
          formattedResponse += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
          
          // Parse rows for table + chart data
          const chartData = [];
          for (const line of dataLines) {
            if (line.trim()) {
              const cells = line.split('|').map(c => c.trim());
              formattedResponse += '| ' + cells.join(' | ') + ' |\n';
              // Build chart data: first col = dimension, last col = count
              if (cells.length >= 2) {
                const label = cells[0] || 'N/A';
                const numericCol = cells[cells.length - 1];
                const value = parseFloat(numericCol);
                if (!isNaN(value)) {
                  chartData.push({ dimension: label, count: value });
                }
              }
            }
          }
          
          // Add inline bar chart if we have data
          if (chartData.length > 0) {
            // Aggregate by dimension (merge rows with same dimension)
            const aggMap = {};
            for (const d of chartData) {
              aggMap[d.dimension] = (aggMap[d.dimension] || 0) + d.count;
            }
            const aggData = Object.entries(aggMap)
              .map(([dim, cnt]) => ({ dimension: dim, count: cnt }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 20); // Top 20 for readability
            
            const PARMY_COLORS = [
              '#6366f1', '#8b5cf6', '#a855f7', '#c084fc',
              '#818cf8', '#7c3aed', '#6d28d9', '#5b21b6',
              '#4f46e5', '#4338ca', '#3730a3', '#312e81'
            ];
            
            const chartBlock = {
              type: 'bar',
              title: titleText.replace(/^DISTRIBUTION[^:]*:/i, '').trim().slice(0, 80) || 'Distribution',
              xKey: 'dimension',
              yKeys: ['count'],
              data: aggData,
              colors: PARMY_COLORS
            };
            formattedResponse += '\n```chart\n' + JSON.stringify(chartBlock) + '\n```\n';
          }
        } else {
          formattedResponse += '```\n' + dataSection + '\n```\n';
        }
        
        if (sqlMatch) {
          formattedResponse += `\n---\n🔍 **SQL:** \`${sqlMatch[1].trim()}\`\n`;
        }
      } else {
        formattedResponse += (parmyResult || '⚠️ Aucun résultat trouvé.');
      }
      
      // Stream the formatted response directly (no LLM)
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Send as SSE chunks
      const chunkSize = 100;
      for (let i = 0; i < formattedResponse.length; i += chunkSize) {
        const chunk = formattedResponse.slice(i, i + chunkSize);
        const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`;
        res.write(sse);
      }
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // 2. Build context from local DB
    const { context, parmySqlDebug } = await buildContextFromPlanLocal(plan, lastUserMsg, filters, legacyCellContext, kpiMonitorContext);

    // 3. Build system prompt
    let systemContent = `[AGENT:${plan.agent}]\n\n` + (AGENT_PROMPTS[plan.agent] || AGENT_PROMPTS.PULSE);
    if (context) systemContent += `\n\n${context}`;

    // 3b. Agent Learning Context (few-shot examples + user memory from Supabase Cloud)
    try {
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const headers = { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' };
        
        // Few-shot examples from positively-rated responses
        const fewShotResp = await fetch(
          `${supabaseUrl}/rest/v1/agent_feedback?agent=eq.${plan.agent}&rating=eq.1&order=created_at.desc&limit=3&select=user_question,assistant_response`,
          { headers }
        );
        if (fewShotResp.ok) {
          const fewShots = await fewShotResp.json();
          if (fewShots && fewShots.length > 0) {
            const examples = fewShots.map((d, i) =>
              `--- Exemple ${i + 1} ---\nQ: ${d.user_question}\nR: ${(d.assistant_response || '').slice(0, 800)}`
            ).join('\n\n');
            systemContent += `\n\n🎓 EXEMPLES DE BONNES RÉPONSES (few-shot learning - réponses validées par l'utilisateur):\n${examples}`;
          }
        }

        // User preferences/memory
        const memResp = await fetch(
          `${supabaseUrl}/rest/v1/agent_memory?memory_type=eq.preference&order=updated_at.desc&limit=10&select=key,value`,
          { headers }
        );
        if (memResp.ok) {
          const memories = await memResp.json();
          if (memories && memories.length > 0) {
            const prefs = memories.map(d => `- ${d.key}: ${JSON.stringify(d.value?.data || d.value)}`).join('\n');
            systemContent += `\n\n🧠 MÉMOIRE UTILISATEUR (préférences apprises):\n${prefs}\nAdapte ton style et tes réponses selon ces préférences.`;
          }
        }
      }
    } catch (learningErr) {
      console.warn('[qoe-assistant] Learning context fetch failed:', learningErr.message);
    }

    // 4. Budget enforcement
    const MAX_CONTEXT = 100000;
    if (systemContent.length > MAX_CONTEXT) {
      systemContent = systemContent.slice(0, MAX_CONTEXT) + '\n[... contexte tronqué pour budget tokens ...]';
    }

    // Truncate messages
    const MAX_RECENT = 6;
    const trimmedMessages = messages.map((m, i) => {
      const isRecent = i >= messages.length - MAX_RECENT;
      if (isRecent || m.role === 'user') return m;
      if (m.content.length > 500) return { ...m, content: m.content.slice(0, 500) + '\n[... tronqué ...]' };
      return m;
    });

    const totalChars = systemContent.length + trimmedMessages.reduce((s, m) => s + m.content.length, 0);
    console.log(`[qoe-assistant] 📏 Total: ${(totalChars/1024).toFixed(1)} KB (system=${(systemContent.length/1024).toFixed(1)} KB)`);

    // 5. Prepend agent tag + stream
    const enrichedMessages = [
      { role: 'system', content: systemContent },
      ...trimmedMessages.filter(m => m.role !== 'system'),
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': `OSMOSIS ${plan.agent}`,
      },
      body: JSON.stringify({
        model: model || 'google/gemini-2.5-flash',
        messages: enrichedMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error('[qoe-assistant] AI error:', response.status, t.slice(0, 300));
      return res.status(response.status).json({ error: `AI gateway error ${response.status}`, details: t.slice(0, 500) });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Inject agent tag as first SSE event
    const agentTag = `data: ${JSON.stringify({ choices: [{ delta: { content: `<!-- AGENT:${plan.agent} -->\n` } }] })}\n\n`;
    res.write(agentTag);

    // Inject PARMY debug SQL block directly into stream so user ALWAYS sees it
    if (plan.agent === 'PARMY' && parmySqlDebug) {
      const debugMatch = parmySqlDebug.match(/🔍 DEBUG SQL: (.+?)(?:\n\n|$)/s);
      const dataPreview = parmySqlDebug.replace(/🔍 DEBUG SQL: .+?\n\n/s, '').slice(0, 2000);
      let debugBlock = '\n\n<details><summary>🔍 **DEBUG MODE — SQL & Données**</summary>\n\n';
      if (debugMatch) {
        debugBlock += '```sql\n' + debugMatch[1].trim() + '\n```\n\n';
      }
      debugBlock += '**Résultat brut (extrait) :**\n```\n' + dataPreview + '\n```\n\n</details>\n\n';
      const debugSSE = `data: ${JSON.stringify({ choices: [{ delta: { content: debugBlock } }] })}\n\n`;
      res.write(debugSSE);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (e) {
    console.error('[qoe-assistant]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/test-parmy — Direct test endpoint for PARMY parameter resolution ───
app.get('/api/test-parmy', async (req, res) => {
  try {
    const query = req.query.q || 'LNCEL.pMax par dor';
    console.log(`\n🧪 [TEST-PARMY] Testing query: "${query}"`);
    const result = await searchDumpParameterLocal(query);
    res.json({
      query,
      cacheSize: (distinctCache.parameter || []).length,
      cacheSample: (distinctCache.parameter || []).slice(0, 20),
      result: result ? result.slice(0, 3000) : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/dump-parameter (query parameter_dump with filters) ───
app.get('/api/dump-parameter', async (req, res) => {
  const reqStart = Date.now();
  console.log(`\n📥 [/api/dump-parameter] ← ${req.method} query:`, JSON.stringify(req.query));
  try {
    const dumpTable = 'parameter_dump';
    console.log(`   📋 Table: ${dumpTable}`);

    const { select, parameter, site_name, cell_name, dor, plaque, vendor, order, limit: lim, distinct_col } = req.query;

    // Special mode: get distinct values for a column
    if (distinct_col) {
      const allowedCols = ['site_name', 'cell_name', 'parameter', 'dor', 'plaque', 'vendor', 'ur', 'dr', 'bande', 'omc', 'zone_arcep', 'netact', 'value'];
      if (!allowedCols.includes(distinct_col)) {
        console.log(`   ⚠️ Colonne non autorisée: ${distinct_col}`);
        return res.json([]);
      }

      // 1) Wait for cache if still loading, then check in-memory cache
      await waitForCache();
      const hasFilter = !!(site_name || cell_name || dor || plaque || vendor || parameter);
      
      // Build composite cache key for filtered queries
      const filterParts = [];
      if (site_name) filterParts.push(`site=${site_name}`);
      if (cell_name) filterParts.push(`cell=${cell_name}`);
      if (dor) filterParts.push(`dor=${dor}`);
      if (plaque) filterParts.push(`plaque=${plaque}`);
      if (vendor) filterParts.push(`vendor=${vendor}`);
      if (parameter) filterParts.push(`param=${parameter}`);
      const filteredCacheKey = `${distinct_col}|${filterParts.join('|')}`;
      
      // Check filtered cache first (covers both filtered and unfiltered)
      if (hasFilter && filteredDistinctCache[filteredCacheKey]) {
        console.log(`   ⚡ Cache filtré: ${filteredDistinctCache[filteredCacheKey].length} valeurs pour ${filteredCacheKey} (${Date.now() - reqStart}ms)`);
        return res.json(filteredDistinctCache[filteredCacheKey].map(v => ({ [distinct_col]: v })));
      }
      
      if (!hasFilter && distinctCache[distinct_col] && distinctCache[distinct_col].length > 0) {
        console.log(`   ⚡ Cache mémoire: ${distinctCache[distinct_col].length} valeurs pour ${distinct_col} (${Date.now() - reqStart}ms)`);
        return res.json(distinctCache[distinct_col].map(v => ({ [distinct_col]: v })));
      }

      // 2) Try dim_* table (instant, always up-to-date after refresh_all_dims)
      const dimTableMap = {
        parameter: 'dim_parameter', cell_name: 'dim_cell', site_name: 'dim_site',
        plaque: 'dim_plaque', dor: 'dim_dor', omc: 'dim_omc', vendor: 'dim_vendor'
      };
      if (!hasFilter && dimTableMap[distinct_col]) {
        try {
          const dimRes = await sharedPool.query(`SELECT value AS "${distinct_col}" FROM ${dimTableMap[distinct_col]} ORDER BY value`);
          if (dimRes.rows.length > 0) {
            console.log(`   ⚡ dim table ${dimTableMap[distinct_col]}: ${dimRes.rows.length} valeurs (${Date.now() - reqStart}ms)`);
            // Back-fill in-memory cache so next request is instant
            distinctCache[distinct_col] = dimRes.rows.map(r => r[distinct_col]);
            return res.json(dimRes.rows);
          }
        } catch {
          // dim table doesn't exist yet, fall through
        }
      }

      // 3) For unfiltered DISTINCT on huge tables, try pg_stats (instant)
      const lowCardinalityCols = ['vendor', 'ur', 'plaque', 'dor', 'dr', 'bande', 'omc'];
      if (!hasFilter && lowCardinalityCols.includes(distinct_col)) {
        try {
          const statsRes = await sharedPool.query(
            `SELECT most_common_vals::text AS mcv FROM pg_stats WHERE tablename = $1 AND attname = $2`,
            [dumpTable, distinct_col]
          );
          const mcvRaw = statsRes.rows[0]?.mcv;
          if (mcvRaw) {
            const vals = mcvRaw.replace(/^\{/, '').replace(/\}$/, '')
              .split(',')
              .map(v => v.replace(/^"|"$/g, '').trim())
              .filter(Boolean)
              .sort();
            if (vals.length > 0) {
              console.log(`   ⚡ pg_stats shortcut: ${vals.length} valeurs pour ${distinct_col} (${Date.now() - reqStart}ms)`);
              return res.json(vals.map(v => ({ [distinct_col]: v })));
            }
          }
        } catch (e) {
          console.warn(`   ⚠️ pg_stats fallback failed, using DISTINCT`, e.message);
        }
      }

      // 4) Final fallback: DISTINCT on parameter_dump
      let q = `SELECT DISTINCT ${distinct_col} FROM ${dumpTable} WHERE ${distinct_col} IS NOT NULL`;
      const params = [];
      if (site_name) { params.push(site_name); q += ` AND site_name = $${params.length}`; }
      if (cell_name) { params.push(cell_name); q += ` AND cell_name = $${params.length}`; }
      if (parameter) {
        const paramList = parameter.split(',').map(p => p.trim()).filter(Boolean);
        if (paramList.length === 1) {
          params.push(paramList[0]); q += ` AND parameter = $${params.length}`;
        } else if (paramList.length > 1) {
          const ph = paramList.map(p => { params.push(p); return `$${params.length}`; });
          q += ` AND parameter IN (${ph.join(',')})`;
        }
      }
      q += ` ORDER BY ${distinct_col} LIMIT 5000`;
      console.log(`   🔍 DISTINCT query: col=${distinct_col}${parameter ? `, parameter=${parameter}` : ''}${site_name ? `, site=${site_name}` : ''}`);
      
      // Dedup concurrent identical requests
      if (inflightDistinct[filteredCacheKey]) {
        console.log(`   ⏳ Dedup: attente requête en cours pour ${filteredCacheKey}`);
        const cached = await inflightDistinct[filteredCacheKey];
        return res.json(cached.map(v => ({ [distinct_col]: v })));
      }
      
      inflightDistinct[filteredCacheKey] = (async () => {
        const result = await sharedPool.query(q, params);
        const vals = result.rows.map(r => r[distinct_col]);
        const elapsed = Date.now() - reqStart;
        console.log(`   ✅ ${vals.length} valeurs distinctes (${elapsed}ms)`);
        // Cache for future requests
        if (hasFilter) {
          filteredDistinctCache[filteredCacheKey] = vals;
        } else {
          distinctCache[distinct_col] = vals;
        }
        delete inflightDistinct[filteredCacheKey];
        return vals;
      })();
      
      const vals = await inflightDistinct[filteredCacheKey];
      return res.json(vals.map(v => ({ [distinct_col]: v })));
    }

    // Normal query mode — validate select columns against known schema
    // Dynamically validate requested columns against actual table schema
    // Force re-discover on first call or if cache seems stale
    if (!app.locals._dumpCols || app.locals._dumpColsTable !== dumpTable) {
      const schemaRes = await sharedPool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [dumpTable]
      );
      app.locals._dumpCols = new Set(schemaRes.rows.map(r => r.column_name));
      app.locals._dumpColsTable = dumpTable;
      console.log(`   📦 Schema cache: ${app.locals._dumpCols.size} colonnes détectées: [${[...app.locals._dumpCols].join(', ')}]`);
    }
    const realCols = app.locals._dumpCols;

    const defaultCols = 'site_name, cell_name, parameter, value, plaque, dor, vendor, bande, dr, ur';
    let cols;
    if (select) {
      const requestedCols = select.split(',').map(c => c.trim()).filter(c => c.length > 0);
      const validCols = requestedCols.filter(c => realCols.has(c));
      const invalidCols = requestedCols.filter(c => !realCols.has(c));
      if (invalidCols.length > 0) {
        console.log(`   ⚠️ Colonnes ignorées (inexistantes): ${invalidCols.join(', ')}`);
      }
      cols = validCols.length > 0 ? validCols.join(', ') : defaultCols;
    } else {
      cols = defaultCols;
    }

    let q = `SELECT ${cols} FROM ${dumpTable} WHERE 1=1`;
    const params = [];
    if (parameter) { params.push(parameter); q += ` AND parameter = $${params.length}`; }
    if (site_name) { params.push(site_name); q += ` AND site_name = $${params.length}`; }
    if (cell_name) { params.push(cell_name); q += ` AND cell_name = $${params.length}`; }
    if (dor) { params.push(dor); q += ` AND dor = $${params.length}`; }
    if (plaque) { params.push(plaque); q += ` AND plaque = $${params.length}`; }
    if (vendor) { params.push(vendor); q += ` AND vendor = $${params.length}`; }
    const limitVal = Math.min(Math.max(parseInt(lim) || 100000, 1), 200000);
    q += ` ORDER BY ${order || 'site_name'} LIMIT ${limitVal}`;

    const activeFilters = Object.entries({ parameter, site_name, cell_name, dor, plaque, vendor })
      .filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ');
    console.log(`   🔍 Query: filters=[${activeFilters || 'aucun'}] limit=${limitVal}`);

    const result = await sharedPool.query(q, params);
    console.log(`   ✅ ${result.rows.length} lignes retournées (${Date.now() - reqStart}ms)`);
    res.json(result.rows);
  } catch (e) {
    console.error(`   ❌ [/api/dump-parameter] ERREUR (${Date.now() - reqStart}ms):`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/dump-parameter/aggregate ───
// Server-side GROUP BY to avoid fetching millions of raw rows
app.get('/api/dump-parameter/aggregate', async (req, res) => {
  const reqStart = Date.now();
  console.log(`📊 [/api/dump-parameter/aggregate] ${new Date().toISOString()}`);
  try {
    const { parameter, vendor, dor, plaque, netact, bande, zone_arcep, group_by, color_by } = req.query;
    const VALID_COLS = ['vendor', 'dor', 'plaque', 'netact', 'bande', 'zone_arcep', 'value', 'site_name'];
    const groupCol = VALID_COLS.includes(group_by) ? group_by : 'vendor';

    const params = [];
    let where = 'WHERE 1=1';

    // Support multiple parameters (comma-separated)
    if (parameter) {
      const paramList = parameter.split(',').map(p => p.trim()).filter(Boolean);
      if (paramList.length === 1) {
        params.push(paramList[0]);
        where += ` AND parameter = $${params.length}`;
      } else if (paramList.length > 1) {
        const placeholders = paramList.map((p) => { params.push(p); return `$${params.length}`; });
        where += ` AND parameter IN (${placeholders.join(',')})`;
      }
    }
    const addInFilter = (col, val) => {
      if (!val) return;
      const vs = val.split(',');
      const ph = vs.map(v => { params.push(v); return `$${params.length}`; });
      where += ` AND ${col} IN (${ph.join(',')})`;
    };
    addInFilter('vendor', vendor);
    addInFilter('dor', dor);
    addInFilter('plaque', plaque);
    addInFilter('netact', netact);
    addInFilter('bande', bande);
    addInFilter('zone_arcep', zone_arcep);
    addInFilter('value', req.query.value);

    // Multi-param: include parameter in GROUP BY
    const paramList = parameter ? parameter.split(',').filter(Boolean) : [];
    const multiParam = paramList.length > 1;
    const groupCols = multiParam ? `parameter, ${groupCol}, value` : `${groupCol}, value`;
    const selectCols = multiParam
      ? `parameter, ${groupCol}, value, COUNT(*) AS cnt`
      : `${groupCol}, value, COUNT(*) AS cnt`;

    const sql = `SELECT ${selectCols} FROM parameter_dump ${where} GROUP BY ${groupCols} ORDER BY ${groupCol}, cnt DESC`;
    console.log(`   🔍 Aggregate SQL: group_by=${groupCol}, color_by=${color_by}, multi=${multiParam}, params=[${params.join(', ')}]`);
    console.log(`   📝 SQL: ${sql}`);
    const result = await sharedPool.query(sql, params);
    console.log(`   ✅ ${result.rows.length} grouped rows (${Date.now() - reqStart}ms)`);
    res.json(result.rows);
  } catch (e) {
    console.error(`   ❌ [/api/dump-parameter/aggregate] ERREUR (${Date.now() - reqStart}ms):`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/parameter-changes (CRUD for parameter_changes) ───
app.get('/api/parameter-changes', async (req, res) => {
  try {
    const { site_name, param_name, change_type, limit = '500' } = req.query;
    const where = [];
    const params = [];
    if (site_name) { params.push(site_name); where.push(`site_name = $${params.length}`); }
    if (param_name) { params.push(param_name); where.push(`param_name = $${params.length}`); }
    if (change_type) { params.push(change_type); where.push(`change_type = $${params.length}`); }
    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const sql = `SELECT * FROM parameter_changes ${whereSQL} ORDER BY change_date DESC LIMIT ${Math.min(parseInt(limit), 5000)}`;
    const result = await sharedPool.query(sql, params);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/parameter-changes', async (req, res) => {
  try {
    const { change_date, param_name, change_type, change_scope, old_value, new_value, site_name, cell_name, description, techno, vendor, dor, dr, plaque, zone_arcep } = req.body;
    const result = await sharedPool.query(
      `INSERT INTO parameter_changes (change_date, param_name, change_type, change_scope, old_value, new_value, site_name, cell_name, description, techno, vendor, dor, dr, plaque, zone_arcep)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [change_date, param_name, change_type || 'parameter_tuning', change_scope || 'radio', old_value, new_value, site_name, cell_name, description, techno, vendor, dor, dr, plaque, zone_arcep]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/refresh-dims (manual trigger for dimension table refresh) ───
app.post('/api/refresh-dims', async (req, res) => {
  const start = Date.now();
  console.log('\n🔄 [/api/refresh-dims] Manual refresh triggered');
  try {
    await sharedPool.query('CALL refresh_all_dims()');
    
    // Reload in-memory cache from fresh dim tables
    const dimMap = {
      parameter: 'dim_parameter', site_name: 'dim_site', cell_name: 'dim_cell',
      vendor: 'dim_vendor', plaque: 'dim_plaque', dor: 'dim_dor', omc: 'dim_omc'
    };
    for (const [key, table] of Object.entries(dimMap)) {
      try {
        const r = await sharedPool.query(`SELECT value FROM ${table} ORDER BY value`);
        distinctCache[key] = r.rows.map(row => row.value);
      } catch {}
    }

    const elapsed = Date.now() - start;
    console.log(`✅ [/api/refresh-dims] Done in ${elapsed}ms`);
    res.json({ success: true, elapsed_ms: elapsed });
  } catch (e) {
    console.error(`❌ [/api/refresh-dims]`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/map-views CRUD ───
app.get('/api/map-views', async (req, res) => {
  try {
    // Ensure table exists
    await sharedPool.query(`
      CREATE TABLE IF NOT EXISTS map_views (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        settings JSONB DEFAULT '{}',
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    const result = await sharedPool.query('SELECT * FROM map_views ORDER BY is_default DESC, updated_at DESC');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/map-views', async (req, res) => {
  const { name, settings, description } = req.body;
  try {
    await sharedPool.query(`
      CREATE TABLE IF NOT EXISTS map_views (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL, description TEXT DEFAULT '', settings JSONB DEFAULT '{}',
        is_default BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    const result = await sharedPool.query(
      `INSERT INTO map_views (name, description, settings) VALUES ($1, $2, $3) RETURNING *`,
      [name, description || '', JSON.stringify(settings || {})]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/map-views/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const [key, val] of Object.entries(updates)) {
      if (['name', 'description', 'is_default'].includes(key)) {
        setClauses.push(`${key} = $${idx}`);
        values.push(val);
        idx++;
      }
      if (key === 'settings') {
        setClauses.push(`settings = $${idx}`);
        values.push(JSON.stringify(val));
        idx++;
      }
    }
    setClauses.push(`updated_at = now()`);
    values.push(id);
    await sharedPool.query(`UPDATE map_views SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);
    // If setting default, clear others
    if (updates.is_default === true) {
      await sharedPool.query(`UPDATE map_views SET is_default = false WHERE id != $1`, [id]);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/map-views/:id', async (req, res) => {
  try {
    await sharedPool.query('DELETE FROM map_views WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/qoe-metrics (read) ───
app.get('/api/qoe-metrics', async (req, res) => {
  try {
    const { site_id, cell_ids, limit: lim } = req.query;
    const maxLimit = Math.min(parseInt(lim) || 500, 5000);
    const conditions = [];
    const params = [];
    let idx = 1;
    if (site_id) { conditions.push(`site_id = $${idx}`); params.push(site_id); idx++; }
    if (cell_ids) {
      const ids = cell_ids.split(',');
      conditions.push(`cell_id = ANY($${idx})`);
      params.push(ids);
      idx++;
    }
    const where = conditions.length ? `WHERE ${conditions.join(' OR ')}` : '';
    const result = await sharedPool.query(
      `SELECT * FROM qoe_metrics ${where} ORDER BY dt ASC LIMIT ${maxLimit}`,
      params
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/dashboards/:id (PUT for partial updates) ───
app.put('/api/dashboards/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const [key, val] of Object.entries(updates)) {
      if (['name', 'description', 'is_shared', 'is_archived'].includes(key)) {
        setClauses.push(`${key} = $${idx}`);
        values.push(val);
        idx++;
      }
      if (key === 'widgets') {
        setClauses.push(`widgets = $${idx}`);
        values.push(JSON.stringify(val));
        idx++;
      }
    }
    setClauses.push(`updated_at = now()`);
    values.push(id);
    await sharedPool.query(`UPDATE dashboards SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/topo/clear ───
app.post('/api/topo/clear', async (req, res) => {
  try {
    await sharedPool.query('DELETE FROM topo');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Health check ───
app.get('/api/health', async (req, res) => {
  try {
    await sharedPool.query('SELECT 1');
    res.json({ status: 'ok', db: getLocalDbConfig().database, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// ─── /api/table-info/:table (live table metadata) ───
app.get('/api/table-info/:table', async (req, res) => {
  const tableName = req.params.table.replace(/[^a-zA-Z0-9_]/g, '');
  try {
    const colResult = await sharedPool.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [tableName]
    );
    if (colResult.rows.length === 0) {
      return res.status(404).json({ error: `Table '${tableName}' not found` });
    }
    const countResult = await sharedPool.query(
      `SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = $1`,
      [tableName]
    );
    const estimate = parseInt(countResult.rows[0]?.estimate ?? '0');
    let rowCount = estimate;
    if (estimate < 10000) {
      try {
        const exact = await sharedPool.query(`SELECT COUNT(*)::int AS cnt FROM "${tableName}"`);
        rowCount = exact.rows[0].cnt;
      } catch {}
    }
    res.json({
      table: tableName,
      rowCount,
      columnCount: colResult.rows.length,
      columns: colResult.rows.map(c => ({ name: c.column_name, type: c.data_type, nullable: c.is_nullable === 'YES' })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/simulate — RF Coverage Simulation with SRTM terrain ───
const simulationCache = new Map();
const MAX_CACHE = 50;

function hashParams(p) {
  return JSON.stringify([p.lat?.toFixed(4), p.lng?.toFixed(4), p.frequency, p.txPower,
    p.antennaHeight, p.antennaGain, p.azimuth, p.beamwidth, p.tilt, p.mechanicalTilt,
    p.rxHeight, p.radius, p.gridSize, p.environment, p.cableLoss, p.bodyLoss]);
}

// Fetch SRTM elevation for a grid of points using Open Elevation API
async function fetchTerrainGrid(minLat, maxLat, minLng, maxLng, gridSize) {
  try {
    const latStep = (maxLat - minLat) / gridSize;
    const lngStep = (maxLng - minLng) / gridSize;

    // Sample every N points to limit API requests (max ~100 points per batch)
    const sampleRate = Math.max(1, Math.ceil(gridSize / 10));
    const locations = [];
    for (let i = 0; i <= gridSize; i += sampleRate) {
      for (let j = 0; j <= gridSize; j += sampleRate) {
        locations.push({
          latitude: minLat + i * latStep,
          longitude: minLng + j * lngStep,
        });
      }
    }

    // Batch to Open Elevation API (free, no key)
    const batchSize = 100;
    const elevations = [];
    for (let b = 0; b < locations.length; b += batchSize) {
      const batch = locations.slice(b, b + batchSize);
      try {
        const resp = await fetch('https://api.open-elevation.com/api/v1/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locations: batch }),
        });
        if (resp.ok) {
          const data = await resp.json();
          elevations.push(...(data.results || []));
        } else {
          // Fill with 0 if API fails
          elevations.push(...batch.map(() => ({ elevation: 0 })));
        }
      } catch {
        elevations.push(...batch.map(() => ({ elevation: 0 })));
      }
    }

    // Interpolate to full grid
    const sampledRows = Math.floor(gridSize / sampleRate) + 1;
    const sampledCols = sampledRows;
    const grid = [];
    for (let i = 0; i <= gridSize; i++) {
      const row = [];
      for (let j = 0; j <= gridSize; j++) {
        // Find nearest sampled point
        const si = Math.min(Math.floor(i / sampleRate), sampledRows - 1);
        const sj = Math.min(Math.floor(j / sampleRate), sampledCols - 1);
        const idx = si * sampledCols + sj;
        row.push(elevations[idx]?.elevation || 0);
      }
      grid.push(row);
    }
    return grid;
  } catch (e) {
    console.error('[terrain] Failed to fetch:', e.message);
    return null;
  }
}

app.post('/api/simulate', async (req, res) => {
  try {
    const p = req.body;
    const key = hashParams(p);

    // Check cache
    if (simulationCache.has(key)) {
      console.log('[simulate] Cache hit');
      return res.json(simulationCache.get(key));
    }

    console.log(`[simulate] Running simulation: ${p.frequency}MHz, ${p.azimuth}°, ${p.radius}km, grid=${p.gridSize}`);

    // Fetch terrain data
    const latDelta = (p.radius || 5) / 111.32;
    const lngDelta = (p.radius || 5) / (111.32 * Math.cos((p.lat || 0) * Math.PI / 180));
    const bounds = {
      minLat: p.lat - latDelta, maxLat: p.lat + latDelta,
      minLng: p.lng - lngDelta, maxLng: p.lng + lngDelta,
    };

    let terrainGrid = null;
    if (p.useTerrain !== false) {
      terrainGrid = await fetchTerrainGrid(
        bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng,
        p.gridSize || 80
      );
    }

    // Return params with terrain data — let client compute
    // (or compute server-side if needed for performance)
    const result = {
      terrainGrid,
      bounds,
      params: p,
      hasTerrain: !!terrainGrid,
    };

    // Cache
    if (simulationCache.size >= MAX_CACHE) {
      const firstKey = simulationCache.keys().next().value;
      simulationCache.delete(firstKey);
    }
    simulationCache.set(key, result);

    res.json(result);
  } catch (e) {
    console.error('[simulate]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/kpi-qoe-aggregated (READ — paginated, filterable) ───
app.get('/api/kpi-qoe-aggregated', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 1000, 1), 100000);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const where = [];
    const params = [];
    let pi = 1;
    if (req.query.date_part) { where.push(`date_part = $${pi++}`); params.push(req.query.date_part); }
    if (req.query.dimension_1) { where.push(`dimension_1 = $${pi++}`); params.push(req.query.dimension_1); }
    if (req.query.dimension_2) { where.push(`dimension_2 = $${pi++}`); params.push(req.query.dimension_2); }
    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const countRes = await sharedPool.query(`SELECT COUNT(*) AS total FROM kpi_qoe_aggregated ${whereSQL}`, params);
    const total = parseInt(countRes.rows[0]?.total || '0');
    const dataRes = await sharedPool.query(
      `SELECT * FROM kpi_qoe_aggregated ${whereSQL} ORDER BY date_part DESC, dimension_1, dimension_2 LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset]
    );
    console.log(`[/api/kpi-qoe-aggregated] ${dataRes.rows.length}/${total} rows`);
    res.json({ rows: dataRes.rows, total });
  } catch (e) {
    console.error('[/api/kpi-qoe-aggregated]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/kpi-qoe-aggregated (BULK INSERT) ───
app.post('/api/kpi-qoe-aggregated', async (req, res) => {
  const { rows, clear_before } = req.body;
  try {
    if (clear_before) await sharedPool.query('DELETE FROM kpi_qoe_aggregated');
    if (!rows || !rows.length) return res.json({ success: true, inserted: 0 });
    const cols = Object.keys(rows[0]);
    const quotedCols = cols.map(c => `"${c}"`);
    let inserted = 0;
    for (const row of rows) {
      const vals = cols.map(c => row[c] ?? null);
      const placeholders = vals.map((_, i) => `$${i + 1}`);
      await sharedPool.query(
        `INSERT INTO kpi_qoe_aggregated (${quotedCols.join(',')}) VALUES (${placeholders.join(',')}) ON CONFLICT (date_part, dimension_1, dimension_2) DO UPDATE SET ${quotedCols.map((c, i) => `${c}=$${i + 1}`).join(',')}`,
        vals
      );
      inserted++;
    }
    res.json({ success: true, inserted });
  } catch (e) {
    console.error('[POST /api/kpi-qoe-aggregated]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/ml-features (READ — paginated, filterable) ───
app.get('/api/ml-features', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 1000, 1), 100000);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const where = [];
    const params = [];
    let pi = 1;
    if (req.query.date_part) { where.push(`date_part = $${pi++}`); params.push(req.query.date_part); }
    if (req.query.dimension_1) { where.push(`dimension_1 = $${pi++}`); params.push(req.query.dimension_1); }
    if (req.query.dimension_2) { where.push(`dimension_2 = $${pi++}`); params.push(req.query.dimension_2); }
    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const countRes = await sharedPool.query(`SELECT COUNT(*) AS total FROM ml_features ${whereSQL}`, params);
    const total = parseInt(countRes.rows[0]?.total || '0');
    const dataRes = await sharedPool.query(
      `SELECT * FROM ml_features ${whereSQL} ORDER BY date_part DESC, dimension_1, dimension_2 LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset]
    );
    console.log(`[/api/ml-features] ${dataRes.rows.length}/${total} rows`);
    res.json({ rows: dataRes.rows, total });
  } catch (e) {
    console.error('[/api/ml-features]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/ml-features (BULK INSERT) ───
app.post('/api/ml-features', async (req, res) => {
  const { rows, clear_before } = req.body;
  try {
    if (clear_before) await sharedPool.query('DELETE FROM ml_features');
    if (!rows || !rows.length) return res.json({ success: true, inserted: 0 });
    const cols = Object.keys(rows[0]);
    const quotedCols = cols.map(c => `"${c}"`);
    let inserted = 0;
    for (const row of rows) {
      const vals = cols.map(c => row[c] ?? null);
      const placeholders = vals.map((_, i) => `$${i + 1}`);
      await sharedPool.query(
        `INSERT INTO ml_features (${quotedCols.join(',')}) VALUES (${placeholders.join(',')}) ON CONFLICT (date_part, dimension_1, dimension_2) DO UPDATE SET ${quotedCols.map((c, i) => `${c}=$${i + 1}`).join(',')}`,
        vals
      );
      inserted++;
    }
    res.json({ success: true, inserted });
  } catch (e) {
    console.error('[POST /api/ml-features]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/bi-query (BI Studio — query qoe_metric) ───
app.post('/api/bi-query', async (req, res) => {
  try {
    const { kpis, aggregation, dateStart, dateEnd, granularity, groupBy, filters, topN, xAxisType, xAxisDimension } = req.body;
    if (!kpis || !kpis.length) return res.status(400).json({ error: 'kpis required' });

    const agg = (aggregation || 'AVG').toUpperCase();
    const validAggs = ['AVG', 'SUM', 'MAX', 'MIN'];
    const aggFn = validAggs.includes(agg) ? agg : 'AVG';

    const selectKpis = kpis.map(k => `${aggFn}("${k}") AS "${k}"`).join(', ');

    const where = [];
    const params = [];
    let pi = 1;

    // ── Dimension-based X axis (bar chart by Site, Vendor, etc.) ──
    if (xAxisType === 'dimension' && xAxisDimension) {
      // X axis = Dimension_2 values where Dimension_1 = xAxisDimension
      where.push(`"Dimension_1" = $${pi++}`);
      params.push(xAxisDimension);

      if (dateStart) { where.push(`date_part >= $${pi++}::date`); params.push(dateStart); }
      if (dateEnd) { where.push(`date_part <= $${pi++}::date`); params.push(dateEnd); }

      // Apply extra filters
      if (filters && filters.length > 0) {
        for (const f of filters) {
          if (!f.values || f.values.length === 0) continue;
          const placeholders = f.values.map((_, j) => `$${pi + j}`);
          where.push(`(
            ("Dimension_1" = $${pi + f.values.length} AND "Dimension_2" IN (${placeholders.join(',')}))
            OR
            ("Dimension_2" = $${pi + f.values.length} AND "Dimension_1" IN (${placeholders.join(',')}))
          )`);
          params.push(...f.values, f.dimension);
          pi += f.values.length + 1;
        }
      }

      const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
      let orderClause = `ORDER BY "${kpis[0]}" DESC`;
      const limitClause = topN ? `LIMIT ${Math.min(parseInt(topN), 500)}` : 'LIMIT 50';

      const sql = `SELECT "Dimension_2" AS x, ${selectKpis}
                   FROM qoe_metric ${whereSQL}
                   GROUP BY "Dimension_2" ${orderClause} ${limitClause}`;

      console.log(`[bi-query/dim] SQL: ${sql.substring(0, 300)}... params=${JSON.stringify(params).substring(0, 100)}`);
      const result = await sharedPool.query(sql, params);
      console.log(`[bi-query/dim] ${result.rows.length} rows`);
      return res.json({ rows: result.rows, total: result.rows.length });
    }

    // ── Date-based X axis (time series) ──
    let dateExpr = `date_part::text`;
    if (granularity === 'week') dateExpr = `date_trunc('week', date_part)::date::text`;
    else if (granularity === 'month') dateExpr = `date_trunc('month', date_part)::date::text`;

    let groupSelect = '';
    let groupByClause = `GROUP BY ${dateExpr}`;
    let orderBy = `ORDER BY ${dateExpr}`;
    if (groupBy && groupBy.length > 0) {
      groupSelect = `, "Dimension_2" AS "group"`;
      groupByClause = `GROUP BY ${dateExpr}, "Dimension_2"`;
      orderBy = `ORDER BY ${dateExpr}, "Dimension_2"`;
    }

    if (dateStart) { where.push(`date_part >= $${pi++}::date`); params.push(dateStart); }
    if (dateEnd) { where.push(`date_part <= $${pi++}::date`); params.push(dateEnd); }

    if (filters && filters.length > 0) {
      for (const f of filters) {
        if (!f.values || f.values.length === 0) continue;
        const placeholders = f.values.map((_, j) => `$${pi + j}`);
        where.push(`(
          ("Dimension_1" = $${pi + f.values.length} AND "Dimension_2" IN (${placeholders.join(',')}))
          OR
          ("Dimension_2" = $${pi + f.values.length} AND "Dimension_1" IN (${placeholders.join(',')}))
        )`);
        params.push(...f.values, f.dimension);
        pi += f.values.length + 1;
      }
    }

    if (groupBy && groupBy.length > 0) {
      where.push(`"Dimension_1" = $${pi++}`);
      params.push(groupBy[0]);
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const sql = `SELECT ${dateExpr} AS x${groupSelect}, ${selectKpis}
                 FROM qoe_metric ${whereSQL} ${groupByClause} ${orderBy}`;

    console.log(`[bi-query] SQL: ${sql.substring(0, 200)}... params=${JSON.stringify(params).substring(0, 100)}`);
    const result = await sharedPool.query(sql, params);
    console.log(`[bi-query] ${result.rows.length} rows`);

    res.json({ rows: result.rows, total: result.rows.length });
  } catch (e) {
    console.error('[bi-query]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── QoE dimension table mapping ───
const qoeDimTableMap = {
  'RAT': 'dim_qoe_rat', 'AS': 'dim_qoe_as', 'Application': 'dim_qoe_application',
  'OS': 'dim_qoe_os', 'Device_brand': 'dim_qoe_device_brand', 'TAC': 'dim_qoe_tac',
  'POP': 'dim_qoe_pop', 'ORF': 'dim_qoe_orf', 'Vendor': 'dim_qoe_vendor',
  'Bande': 'dim_qoe_bande', 'ARCEP': 'dim_qoe_arcep', 'DOR': 'dim_qoe_dor',
  'Plaque': 'dim_qoe_plaque', 'Site': 'dim_qoe_site', 'Cellule': 'dim_qoe_cellule',
};

// ─── /api/refresh-qoe-dims (manual trigger for QoE dimension table refresh) ───
app.post('/api/refresh-qoe-dims', async (req, res) => {
  const start = Date.now();
  console.log('\n🔄 [/api/refresh-qoe-dims] Manual refresh triggered');
  try {
    await sharedPool.query('CALL refresh_qoe_dims()');

    const elapsed = Date.now() - start;
    console.log(`✅ [/api/refresh-qoe-dims] Done in ${elapsed}ms`);

    // Return counts per dimension
    const counts = {};
    for (const [dim, table] of Object.entries(qoeDimTableMap)) {
      try {
        const r = await sharedPool.query(`SELECT count(*)::int AS cnt FROM ${table}`);
        counts[dim] = r.rows[0]?.cnt || 0;
      } catch { counts[dim] = -1; }
    }
    try {
      const r = await sharedPool.query(`SELECT count(*)::int AS cnt FROM dim_qoe_date`);
      counts['date'] = r.rows[0]?.cnt || 0;
    } catch { counts['date'] = -1; }

    res.json({ success: true, elapsed_ms: elapsed, counts });
  } catch (e) {
    console.error(`❌ [/api/refresh-qoe-dims]`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/bi-distinct (BI Studio — get distinct dimension values) ───
app.get('/api/bi-distinct', async (req, res) => {
  try {
    const dim = req.query.dimension;
    if (!dim) return res.status(400).json({ error: 'dimension required' });

    // Try dim table first for fast lookup
    const dimTable = qoeDimTableMap[dim];
    if (dimTable) {
      try {
        const r = await sharedPool.query(`SELECT value FROM ${dimTable} ORDER BY value`);
        if (r.rows.length > 0) {
          console.log(`[bi-distinct] ${dim} → ${r.rows.length} values from ${dimTable}`);
          return res.json(r.rows.map(row => row.value));
        }
      } catch (e) {
        console.log(`[bi-distinct] dim table ${dimTable} not available, falling back to DISTINCT`);
      }
    }

    // Fallback: direct DISTINCT query
    const sql = `
      SELECT DISTINCT val FROM (
        SELECT "Dimension_2" AS val FROM qoe_metric WHERE "Dimension_1" = $1
        UNION
        SELECT "Dimension_1" AS val FROM qoe_metric WHERE "Dimension_2" = $1
      ) sub WHERE val IS NOT NULL AND val != $1 ORDER BY val LIMIT 500
    `;
    const result = await sharedPool.query(sql, [dim]);
    res.json(result.rows.map(r => r.val));
  } catch (e) {
    console.error('[bi-distinct]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/bi-catalog (BI Studio — KPI catalog from qoe_metric columns) ───
// Metadata for known BI KPIs (category + display name + unit). Columns not
// listed here are still returned with sensible defaults so the catalog stays
// in sync with the database schema.
const BI_KPI_META = {
  // Volume
  volume_totale_dl: { display_name: 'Volume DL', category: 'Volume', unit: 'GB' },
  volume_totale_ul: { display_name: 'Volume UL', category: 'Volume', unit: 'GB' },
  volume_totale_totale: { display_name: 'Volume Total', category: 'Volume', unit: 'GB' },
  // Débit
  debit_ul: { display_name: 'Débit UL', category: 'Débit', unit: 'Mbps' },
  debit_dl: { display_name: 'Débit DL', category: 'Débit', unit: 'Mbps' },
  debit_ul_vol5: { display_name: 'Débit UL Vol5', category: 'Débit', unit: 'Mbps' },
  debit_dl_vol5: { display_name: 'Débit DL Vol5', category: 'Débit', unit: 'Mbps' },
  debit_ul_vol10: { display_name: 'Débit UL Vol10', category: 'Débit', unit: 'Mbps' },
  debit_dl_vol10: { display_name: 'Débit DL Vol10', category: 'Débit', unit: 'Mbps' },
  dms_debit_dl_30: { display_name: 'DMS DL 30', category: 'Débit', unit: '%' },
  dms_debit_dl_8: { display_name: 'DMS DL 8', category: 'Débit', unit: '%' },
  dms_debit_dl_3: { display_name: 'DMS DL 3', category: 'Débit', unit: '%' },
  dms_30_dl_vol5: { display_name: 'DMS 30 DL Vol5', category: 'Débit', unit: 'Mbps' },
  dms_8_dl_vol5: { display_name: 'DMS 8 DL Vol5', category: 'Débit', unit: 'Mbps' },
  dms_3_dl_vol5: { display_name: 'DMS 3 DL Vol5', category: 'Débit', unit: 'Mbps' },
  dms_30_dl_vol10: { display_name: 'DMS 30 DL Vol10', category: 'Débit', unit: 'Mbps' },
  dms_8_dl_vol10: { display_name: 'DMS 8 DL Vol10', category: 'Débit', unit: 'Mbps' },
  dms_3_dl_vol10: { display_name: 'DMS 3 DL Vol10', category: 'Débit', unit: 'Mbps' },
  dms_debit_ul_5: { display_name: 'DMS UL 5', category: 'Débit', unit: '%' },
  dms_debit_ul_3: { display_name: 'DMS UL 3', category: 'Débit', unit: '%' },
  dms_debit_ul_1: { display_name: 'DMS UL 1', category: 'Débit', unit: '%' },
  debit_ul_max: { display_name: 'Débit UL Max', category: 'Débit', unit: 'Mbps' },
  debit_dl_max: { display_name: 'Débit DL Max', category: 'Débit', unit: 'Mbps' },
  // Latence
  rtt_setup_avg: { display_name: 'RTT Setup Avg', category: 'Latence', unit: 'ms' },
  rtt_data_avg: { display_name: 'RTT Data Avg', category: 'Latence', unit: 'ms' },
  rtt_setup_0_40000: { display_name: 'RTT Setup < 40', category: 'Latence', unit: '%' },
  rtt_setup_40000_80000: { display_name: 'RTT Setup 40-80', category: 'Latence', unit: '%' },
  rtt_setup_80000_150000: { display_name: 'RTT Setup 80-150', category: 'Latence', unit: '%' },
  rtt_setup_150000_300000: { display_name: 'RTT Setup 150-300', category: 'Latence', unit: '%' },
  rtt_setup_300000_inf: { display_name: 'RTT Setup > 300', category: 'Latence', unit: '%' },
  rtt_data_0_40000: { display_name: 'RTT Data < 40', category: 'Latence', unit: '%' },
  rtt_data_40000_80000: { display_name: 'RTT Data 40-80', category: 'Latence', unit: '%' },
  rtt_data_80000_150000: { display_name: 'RTT Data 80-150', category: 'Latence', unit: '%' },
  rtt_data_150000_300000: { display_name: 'RTT Data 150-300', category: 'Latence', unit: '%' },
  rtt_data_300000_inf: { display_name: 'RTT Data > 300', category: 'Latence', unit: '%' },
  // TCP Session KPI
  loss_dl_rate: { display_name: 'Loss DL Rate', category: 'TCP Session KPI', unit: '%' },
  loss_ul_rate: { display_name: 'Loss UL Rate', category: 'TCP Session KPI', unit: '%' },
  'loss_ul_0_0.01': { display_name: 'Loss UL 0-1%', category: 'TCP Session KPI', unit: '%' },
  'loss_ul_0.01_0.03': { display_name: 'Loss UL 1-3%', category: 'TCP Session KPI', unit: '%' },
  'loss_ul_0.03_0.05': { display_name: 'Loss UL 3-5%', category: 'TCP Session KPI', unit: '%' },
  'loss_ul_0.05_inf': { display_name: 'Loss UL > 5%', category: 'TCP Session KPI', unit: '%' },
  'loss_dl_0_0.01': { display_name: 'Loss DL 0-1%', category: 'TCP Session KPI', unit: '%' },
  'loss_dl_0.01_0.03': { display_name: 'Loss DL 1-3%', category: 'TCP Session KPI', unit: '%' },
  'loss_dl_0.03_0.05': { display_name: 'Loss DL 3-5%', category: 'TCP Session KPI', unit: '%' },
  'loss_dl_0.05_inf': { display_name: 'Loss DL > 5%', category: 'TCP Session KPI', unit: '%' },
  tcp_retr_rate_ul: { display_name: 'TCP Retr Rate UL', category: 'TCP Session KPI', unit: '%' },
  tcp_retr_rate_dl: { display_name: 'TCP Retr Rate DL', category: 'TCP Session KPI', unit: '%' },
  'retr_dl_0_0.01': { display_name: 'Retr DL 0-1%', category: 'TCP Session KPI', unit: '%' },
  'retr_dl_0.01_0.03': { display_name: 'Retr DL 1-3%', category: 'TCP Session KPI', unit: '%' },
  'retr_dl_0.03_0.05': { display_name: 'Retr DL 3-5%', category: 'TCP Session KPI', unit: '%' },
  'retr_dl_0.05_inf': { display_name: 'Retr DL > 5%', category: 'TCP Session KPI', unit: '%' },
  'retr_ul_0_0.01': { display_name: 'Retr UL 0-1%', category: 'TCP Session KPI', unit: '%' },
  'retr_ul_0.01_0.03': { display_name: 'Retr UL 1-3%', category: 'TCP Session KPI', unit: '%' },
  'retr_ul_0.03_0.05': { display_name: 'Retr UL 3-5%', category: 'TCP Session KPI', unit: '%' },
  'retr_ul_0.05_inf': { display_name: 'Retr UL > 5%', category: 'TCP Session KPI', unit: '%' },
  session_wifi_nbr: { display_name: 'Sessions WiFi', category: 'TCP Session KPI', unit: '' },
  session_3g2g_nbr: { display_name: 'Sessions 3G/2G', category: 'TCP Session KPI', unit: '' },
  session_4g_nbr: { display_name: 'Sessions 4G', category: 'TCP Session KPI', unit: '' },
  session_5g_nbr: { display_name: 'Sessions 5G', category: 'TCP Session KPI', unit: '' },
  session_nbr: { display_name: 'Sessions Total', category: 'TCP Session KPI', unit: '' },
  session_dur_moy: { display_name: 'Durée Moy Session', category: 'TCP Session KPI', unit: 's' },
  session_dcr: { display_name: 'Session DCR', category: 'TCP Session KPI', unit: '%' },
  out_of_order_nbr: { display_name: 'Out of Order Nbr', category: 'TCP Session KPI', unit: '' },
  out_of_order_rate: { display_name: 'Out of Order Rate', category: 'TCP Session KPI', unit: '%' },
  wind_full_nbr: { display_name: 'Window Full Nbr', category: 'TCP Session KPI', unit: '' },
  wind_full_rate: { display_name: 'Window Full Rate', category: 'TCP Session KPI', unit: '%' },
  // Radio Access Tech
  fallback_5G_to_4G_rate: { display_name: 'Fallback 5G→4G Rate', category: 'Radio Access Tech', unit: '%' },
  fallback_4G_to_3G2G_rate: { display_name: 'Fallback 4G→3G/2G Rate', category: 'Radio Access Tech', unit: '%' },
  instability_rate: { display_name: 'Instability Rate', category: 'Radio Access Tech', unit: '%' },
  time_rat_5g_pct: { display_name: 'Time RAT 5G %', category: 'Radio Access Tech', unit: '%' },
  time_rat_4g_pct: { display_name: 'Time RAT 4G %', category: 'Radio Access Tech', unit: '%' },
  time_rat_3g2g_pct: { display_name: 'Time RAT 3G/2G %', category: 'Radio Access Tech', unit: '%' },
  time_rat_wifi_pct: { display_name: 'Time RAT WiFi %', category: 'Radio Access Tech', unit: '%' },
  // QOE Index
  Mauvaise_Session_Rate: { display_name: 'Mauvaise Session Rate', category: 'QOE Index', unit: '%' },
  Mauvaise_Session_nbr: { display_name: 'Mauvaise Session Nbr', category: 'QOE Index', unit: '' },
  qoe_index: { display_name: 'QoE Index', category: 'QOE Index', unit: '' },
  // User Capabilité
  '5G_capable_rate': { display_name: '5G Capable Rate', category: 'User Capabilité', unit: '%' },
  '5gue_attached_4G_rate': { display_name: '5G UE Attached 4G Rate', category: 'User Capabilité', unit: '%' },
};

const BI_NON_KPI_COLUMNS = new Set([
  'id', 'date_part', 'created_at', 'Dimension_1', 'Dimension_2', 'dimension_1', 'dimension_2',
]);

function humanizeKpiKey(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

app.get('/api/bi-catalog', async (_req, res) => {
  try {
    // Introspect numeric columns from qoe_metric (fallback to kpi_qoe_aggregated)
    let columns = [];
    for (const tbl of ['qoe_metric', 'kpi_qoe_aggregated']) {
      try {
        const r = await sharedPool.query(
          `SELECT column_name, data_type FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = $1`, [tbl]
        );
        if (r.rows.length > 0) {
          columns = r.rows;
          console.log(`[bi-catalog] using columns from ${tbl} (${columns.length})`);
          break;
        }
      } catch { /* ignore */ }
    }

    if (columns.length === 0) {
      // No DB column info — return the static metadata so the UI still works
      const items = Object.entries(BI_KPI_META).map(([key, m]) => ({ key, ...m }));
      return res.json({ source: 'static', items });
    }

    const numericTypes = new Set(['numeric', 'double precision', 'real', 'integer', 'bigint', 'smallint']);
    const items = [];
    for (const { column_name, data_type } of columns) {
      if (BI_NON_KPI_COLUMNS.has(column_name)) continue;
      if (!numericTypes.has(data_type)) continue;
      const meta = BI_KPI_META[column_name];
      items.push({
        key: column_name,
        display_name: meta?.display_name || humanizeKpiKey(column_name),
        category: meta?.category || 'Other',
        unit: meta?.unit ?? '',
      });
    }
    res.json({ source: 'db', items });
  } catch (e) {
    console.error('[bi-catalog]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/bi-date-range (BI Studio — get available date range) ───
app.get('/api/bi-date-range', async (_req, res) => {
  try {
    const result = await sharedPool.query(`SELECT MIN(date_part)::text AS min_date, MAX(date_part)::text AS max_date FROM qoe_metric`);
    res.json(result.rows[0] || { min_date: null, max_date: null });
  } catch (e) {
    console.error('[bi-date-range]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/qoe-map (QoE scores per site for map coloring) ───
app.get('/api/qoe-map', async (req, res) => {
  try {
    const { dimension, date } = req.query;
    // dimension defaults to 'Site' — the Dimension_1 value that groups by site code
    const dim1 = dimension || 'Site';

    // If no date given, use the latest available date for this dimension
    let targetDate = date;
    if (!targetDate) {
      const latest = await sharedPool.query(
        `SELECT MAX(date_part)::text AS max_date FROM qoe_metric WHERE "Dimension_1" = $1`,
        [dim1]
      );
      targetDate = latest.rows[0]?.max_date;
      if (!targetDate) return res.json({ sites: {}, date: null, dimension: dim1 });
    }

    // Fetch all KPIs for all sites on that date
    const result = await sharedPool.query(
      `SELECT "Dimension_2" AS site_code,
              AVG(qoe_index) AS qoe_index,
              AVG(debit_dl) AS debit_dl,
              AVG(debit_ul) AS debit_ul,
              AVG(rtt_data_avg) AS rtt_data_avg,
              AVG(rtt_setup_avg) AS rtt_setup_avg,
              AVG(dms_debit_dl_3) AS dms_dl_3,
              AVG(dms_debit_dl_8) AS dms_dl_8,
              AVG(dms_debit_dl_30) AS dms_dl_30,
              AVG(dms_debit_ul_3) AS dms_ul_3,
              AVG(session_nbr) AS sessions,
              AVG(tcp_retr_rate_dl) AS tcp_retr_rate_dl,
              AVG(loss_dl_rate) AS loss_dl_rate,
              AVG(session_dcr) AS session_dcr,
              AVG(wind_full_rate) AS wind_full_rate,
              AVG(volume_totale_dl) AS volume_dl,
              AVG(volume_totale_ul) AS volume_ul
       FROM qoe_metric
       WHERE "Dimension_1" = $1 AND date_part = $2::date
       GROUP BY "Dimension_2"`,
      [dim1, targetDate]
    );

    // Build a map: site_code -> KPIs
    const sites = {};
    for (const row of result.rows) {
      sites[row.site_code] = {
        qoe_index: row.qoe_index != null ? Number(row.qoe_index) : null,
        debit_dl: row.debit_dl != null ? Number(row.debit_dl) : null,
        debit_ul: row.debit_ul != null ? Number(row.debit_ul) : null,
        rtt_data_avg: row.rtt_data_avg != null ? Number(row.rtt_data_avg) : null,
        rtt_setup_avg: row.rtt_setup_avg != null ? Number(row.rtt_setup_avg) : null,
        dms_dl_3: row.dms_dl_3 != null ? Number(row.dms_dl_3) : null,
        dms_dl_8: row.dms_dl_8 != null ? Number(row.dms_dl_8) : null,
        dms_dl_30: row.dms_dl_30 != null ? Number(row.dms_dl_30) : null,
        dms_ul_3: row.dms_ul_3 != null ? Number(row.dms_ul_3) : null,
        sessions: row.sessions != null ? Number(row.sessions) : null,
        tcp_retr_rate_dl: row.tcp_retr_rate_dl != null ? Number(row.tcp_retr_rate_dl) : null,
        loss_dl_rate: row.loss_dl_rate != null ? Number(row.loss_dl_rate) : null,
        session_dcr: row.session_dcr != null ? Number(row.session_dcr) : null,
        wind_full_rate: row.wind_full_rate != null ? Number(row.wind_full_rate) : null,
        volume_dl: row.volume_dl != null ? Number(row.volume_dl) : null,
        volume_ul: row.volume_ul != null ? Number(row.volume_ul) : null,
      };
    }

    console.log(`[qoe-map] dim=${dim1} date=${targetDate} => ${Object.keys(sites).length} sites`);
    res.json({ sites, date: targetDate, dimension: dim1 });
  } catch (e) {
    console.error('[qoe-map]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ─── KPI MONITOR API ENDPOINTS ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

// ── KPI Catalog (static + DB) ──
const KPI_MONITOR_CATALOG = [
  { kpi_key: 'debit_dl', display_name: 'Débit DL', description: 'Débit moyen descendant', category: 'Throughput', unit: 'Mbps', value_type: 'gauge', formula_type: 'direct', default_chart_type: 'line', default_axis: 'left', threshold_warning: 10, threshold_critical: 5, supported_levels: ['REGION','PLAQUE','SITE','CELL'], supports_split: true, supports_table: true, source_column: 'debit_dl', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'debit_ul', display_name: 'Débit UL', description: 'Débit moyen montant', category: 'Throughput', unit: 'Mbps', value_type: 'gauge', formula_type: 'direct', default_chart_type: 'line', default_axis: 'left', threshold_warning: 5, threshold_critical: 2, supported_levels: ['REGION','PLAQUE','SITE','CELL'], supports_split: true, supports_table: true, source_column: 'debit_ul', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'debit_dl_max', display_name: 'Débit DL Max', description: 'Débit max descendant', category: 'Throughput', unit: 'Mbps', value_type: 'gauge', formula_type: 'direct', default_chart_type: 'line', default_axis: 'left', threshold_warning: null, threshold_critical: null, supported_levels: ['REGION','PLAQUE','SITE','CELL'], supports_split: true, supports_table: true, source_column: 'debit_dl_max', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'rtt_setup_avg', display_name: 'RTT Setup Avg', description: 'Latence moyenne de setup TCP', category: 'Latency', unit: 'ms', value_type: 'gauge', formula_type: 'direct', default_chart_type: 'line', default_axis: 'right', threshold_warning: 80, threshold_critical: 150, supported_levels: ['REGION','PLAQUE','SITE','CELL'], supports_split: true, supports_table: true, source_column: 'rtt_setup_avg', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'rtt_data_avg', display_name: 'RTT Data Avg', description: 'Latence moyenne data TCP', category: 'Latency', unit: 'ms', value_type: 'gauge', formula_type: 'direct', default_chart_type: 'line', default_axis: 'right', threshold_warning: 80, threshold_critical: 150, supported_levels: ['REGION','PLAQUE','SITE','CELL'], supports_split: true, supports_table: true, source_column: 'rtt_data_avg', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'volume_totale_dl', display_name: 'Volume DL', description: 'Volume total descendant', category: 'Traffic', unit: 'GB', value_type: 'counter', formula_type: 'direct', default_chart_type: 'bar', default_axis: 'left', threshold_warning: null, threshold_critical: null, supported_levels: ['REGION','PLAQUE','SITE'], supports_split: true, supports_table: true, source_column: 'volume_totale_dl', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'volume_totale_ul', display_name: 'Volume UL', description: 'Volume total montant', category: 'Traffic', unit: 'GB', value_type: 'counter', formula_type: 'direct', default_chart_type: 'bar', default_axis: 'left', threshold_warning: null, threshold_critical: null, supported_levels: ['REGION','PLAQUE','SITE'], supports_split: true, supports_table: true, source_column: 'volume_totale_ul', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'volume_totale_totale', display_name: 'Volume Total', description: 'Volume total DL+UL', category: 'Traffic', unit: 'GB', value_type: 'counter', formula_type: 'direct', default_chart_type: 'bar', default_axis: 'left', threshold_warning: null, threshold_critical: null, supported_levels: ['REGION','PLAQUE','SITE'], supports_split: true, supports_table: true, source_column: 'volume_totale_totale', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'session_nbr', display_name: 'Sessions', description: 'Nombre total de sessions', category: 'Traffic', unit: '', value_type: 'counter', formula_type: 'direct', default_chart_type: 'bar', default_axis: 'left', threshold_warning: null, threshold_critical: null, supported_levels: ['REGION','PLAQUE','SITE'], supports_split: true, supports_table: true, source_column: 'session_nbr', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'session_dcr', display_name: 'Session DCR', description: 'Taux de coupure de session', category: 'Retainability', unit: '%', value_type: 'ratio', formula_type: 'direct', default_chart_type: 'line', default_axis: 'right', threshold_warning: 2, threshold_critical: 5, supported_levels: ['REGION','PLAQUE','SITE','CELL'], supports_split: true, supports_table: true, source_column: 'session_dcr', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'loss_dl_rate', display_name: 'Loss DL Rate', description: 'Taux de perte paquets DL', category: 'TCP', unit: '%', value_type: 'ratio', formula_type: 'direct', default_chart_type: 'line', default_axis: 'right', threshold_warning: 1, threshold_critical: 3, supported_levels: ['REGION','PLAQUE','SITE','CELL'], supports_split: true, supports_table: true, source_column: 'loss_dl_rate', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'loss_ul_rate', display_name: 'Loss UL Rate', description: 'Taux de perte paquets UL', category: 'TCP', unit: '%', value_type: 'ratio', formula_type: 'direct', default_chart_type: 'line', default_axis: 'right', threshold_warning: 1, threshold_critical: 3, supported_levels: ['REGION','PLAQUE','SITE','CELL'], supports_split: true, supports_table: true, source_column: 'loss_ul_rate', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'tcp_retr_rate_dl', display_name: 'TCP Retrans DL', description: 'Taux de retransmission TCP DL', category: 'TCP', unit: '%', value_type: 'ratio', formula_type: 'direct', default_chart_type: 'line', default_axis: 'right', threshold_warning: 3, threshold_critical: 5, supported_levels: ['REGION','PLAQUE','SITE','CELL'], supports_split: true, supports_table: true, source_column: 'tcp_retr_rate_dl', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'tcp_retr_rate_ul', display_name: 'TCP Retrans UL', description: 'Taux de retransmission TCP UL', category: 'TCP', unit: '%', value_type: 'ratio', formula_type: 'direct', default_chart_type: 'line', default_axis: 'right', threshold_warning: 3, threshold_critical: 5, supported_levels: ['REGION','PLAQUE','SITE','CELL'], supports_split: true, supports_table: true, source_column: 'tcp_retr_rate_ul', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'dms_debit_dl_3', display_name: 'DMS DL <3Mbps', description: '% sessions débit DL < 3 Mbps', category: 'Throughput', unit: '%', value_type: 'ratio', formula_type: 'direct', default_chart_type: 'area', default_axis: 'left', threshold_warning: 20, threshold_critical: 40, supported_levels: ['REGION','PLAQUE','SITE'], supports_split: true, supports_table: true, source_column: 'dms_debit_dl_3', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'dms_debit_dl_8', display_name: 'DMS DL <8Mbps', description: '% sessions débit DL < 8 Mbps', category: 'Throughput', unit: '%', value_type: 'ratio', formula_type: 'direct', default_chart_type: 'area', default_axis: 'left', threshold_warning: 30, threshold_critical: 50, supported_levels: ['REGION','PLAQUE','SITE'], supports_split: true, supports_table: true, source_column: 'dms_debit_dl_8', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'dms_debit_dl_30', display_name: 'DMS DL <30Mbps', description: '% sessions débit DL < 30 Mbps', category: 'Throughput', unit: '%', value_type: 'ratio', formula_type: 'direct', default_chart_type: 'area', default_axis: 'left', threshold_warning: null, threshold_critical: null, supported_levels: ['REGION','PLAQUE','SITE'], supports_split: true, supports_table: true, source_column: 'dms_debit_dl_30', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'session_dur_moy', display_name: 'Durée Session Moy', description: 'Durée moyenne de session', category: 'Traffic', unit: 's', value_type: 'gauge', formula_type: 'direct', default_chart_type: 'line', default_axis: 'left', threshold_warning: null, threshold_critical: null, supported_levels: ['REGION','PLAQUE','SITE'], supports_split: true, supports_table: true, source_column: 'session_dur_moy', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'out_of_order_rate', display_name: 'Out of Order Rate', description: 'Taux de paquets hors séquence', category: 'TCP', unit: '%', value_type: 'ratio', formula_type: 'direct', default_chart_type: 'line', default_axis: 'right', threshold_warning: 1, threshold_critical: 3, supported_levels: ['REGION','PLAQUE','SITE'], supports_split: true, supports_table: true, source_column: 'out_of_order_rate', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'wind_full_rate', display_name: 'Window Full Rate', description: 'Taux window full TCP', category: 'TCP', unit: '%', value_type: 'ratio', formula_type: 'direct', default_chart_type: 'line', default_axis: 'right', threshold_warning: null, threshold_critical: null, supported_levels: ['REGION','PLAQUE','SITE'], supports_split: true, supports_table: true, source_column: 'wind_full_rate', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'instability_rate', display_name: 'Instability Rate', description: 'Taux d\'instabilité réseau', category: 'Retainability', unit: '%', value_type: 'ratio', formula_type: 'direct', default_chart_type: 'line', default_axis: 'right', threshold_warning: 5, threshold_critical: 10, supported_levels: ['REGION','PLAQUE','SITE'], supports_split: true, supports_table: true, source_column: 'instability_rate', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'Mauvaise_Session_Rate', display_name: 'Bad Session Rate', description: 'Taux de mauvaises sessions', category: 'Retainability', unit: '%', value_type: 'ratio', formula_type: 'direct', default_chart_type: 'line', default_axis: 'right', threshold_warning: 5, threshold_critical: 10, supported_levels: ['REGION','PLAQUE','SITE'], supports_split: true, supports_table: true, source_column: '"Mauvaise_Session_Rate"', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'time_rat_5g_pct', display_name: '5G Time %', description: '% du temps en 5G', category: 'Other', unit: '%', value_type: 'ratio', formula_type: 'direct', default_chart_type: 'area', default_axis: 'left', threshold_warning: null, threshold_critical: null, supported_levels: ['REGION','PLAQUE','SITE'], supports_split: true, supports_table: true, source_column: 'time_rat_5g_pct', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'time_rat_4g_pct', display_name: '4G Time %', description: '% du temps en 4G', category: 'Other', unit: '%', value_type: 'ratio', formula_type: 'direct', default_chart_type: 'area', default_axis: 'left', threshold_warning: null, threshold_critical: null, supported_levels: ['REGION','PLAQUE','SITE'], supports_split: true, supports_table: true, source_column: 'time_rat_4g_pct', source_table: 'qoe_metric', is_active: true },
  { kpi_key: 'fallback_5G_to_4G_rate', display_name: 'Fallback 5G→4G', description: 'Taux de fallback 5G vers 4G', category: 'Retainability', unit: '%', value_type: 'ratio', formula_type: 'direct', default_chart_type: 'line', default_axis: 'right', threshold_warning: 10, threshold_critical: 20, supported_levels: ['REGION','PLAQUE','SITE'], supports_split: true, supports_table: true, source_column: '"fallback_5G_to_4G_rate"', source_table: 'qoe_metric', is_active: true },
  { kpi_key: '5G_capable_rate', display_name: '5G Capable Rate', description: 'Taux de terminaux 5G', category: 'Other', unit: '%', value_type: 'ratio', formula_type: 'direct', default_chart_type: 'line', default_axis: 'left', threshold_warning: null, threshold_critical: null, supported_levels: ['REGION','PLAQUE','SITE'], supports_split: true, supports_table: true, source_column: '"5G_capable_rate"', source_table: 'qoe_metric', is_active: true },
];

// Build catalog map for quick lookup
const KPI_CATALOG_MAP = Object.fromEntries(KPI_MONITOR_CATALOG.map(k => [k.kpi_key, k]));

// ── Helper: resolve granularity ──
function resolveGranularity(gran, dateFrom, dateTo) {
  if (gran && gran !== 'auto') return gran;
  const diffMs = new Date(dateTo) - new Date(dateFrom);
  const diffDays = diffMs / 86400000;
  if (diffDays <= 1) return '15m';
  if (diffDays <= 7) return '1h';
  return '1d';
}

// ── Helper: build WHERE clause from filters ──
function buildMonitorWhere(filters, params, pi) {
  const clauses = [];
  if (!filters || !filters.length) return { clauses, params, pi };
  for (const f of filters) {
    if (!f.values || f.values.length === 0) continue;
    const dim = f.dimension;
    const op = f.op === 'NOT_IN' ? 'NOT IN' : 'IN';
    const placeholders = f.values.map((_, j) => `$${pi + j}`);
    // Dimension-based filter: check both Dimension_1 and Dimension_2
    clauses.push(`(
      ("Dimension_1" = $${pi + f.values.length} AND "Dimension_2" ${op} (${placeholders.join(',')}))
    )`);
    params.push(...f.values, dim);
    pi += f.values.length + 1;
  }
  return { clauses, params, pi };
}

// ── Helper: safe column reference ──
function safeCol(kpiKey) {
  const entry = KPI_CATALOG_MAP[kpiKey];
  if (entry && entry.source_column) return entry.source_column;
  // If column name needs quoting (starts with number or has special chars)
  if (/^[0-9"]/.test(kpiKey) || kpiKey.includes(' ')) return `"${kpiKey}"`;
  return `"${kpiKey}"`;
}

// ── KPI Engine forwarder ──
// In local dev the kpi-engine FastAPI service (:8001) is the canonical
// implementation for /monitor/* and supports the full multi-dim contract
// (split_by_list, topo enrichment, real CH/PG queries). Forward there
// instead of using the legacy qoe_metric stubs below. Set
// SKIP_KPI_FORWARD=1 to fall back to the stubs.
const KPI_ENGINE_URL = process.env.KPI_ENGINE_URL || 'http://localhost:8001';
const SKIP_KPI_FORWARD = process.env.SKIP_KPI_FORWARD === '1';
if (!SKIP_KPI_FORWARD) {
  app.all(/^\/api\/monitor\/.*/, async (req, res) => {
    const target = `${KPI_ENGINE_URL}${req.originalUrl.replace(/^\/api/, '')}`;
    try {
      const init = {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        init.body = JSON.stringify(req.body ?? {});
      }
      const upstream = await fetch(target, init);
      const text = await upstream.text();
      res.status(upstream.status);
      const ct = upstream.headers.get('content-type');
      if (ct) res.set('content-type', ct);
      res.send(text);
    } catch (err) {
      console.error(`[kpi-engine forward] ${req.method} ${target}: ${err.message}`);
      res.status(502).json({ error: `kpi-engine unreachable at ${target}: ${err.message}` });
    }
  });
}

// ── 1. KPI Catalog ──
app.get('/api/monitor/catalog/kpis', (_req, res) => {
  res.json(KPI_MONITOR_CATALOG);
});

// ── 2. Filter Catalog ──
app.get('/api/monitor/catalog/filters', (_req, res) => {
  const filters = [
    { dimension_key: 'DOR', display_name: 'Région', multi_select: true, searchable: true, depends_on: [], is_active: true },
    { dimension_key: 'Plaque', display_name: 'Plaque', multi_select: true, searchable: true, depends_on: ['DOR'], is_active: true },
    { dimension_key: 'Vendor', display_name: 'Constructeur', multi_select: true, searchable: false, depends_on: [], is_active: true },
    { dimension_key: 'Bande', display_name: 'Bande', multi_select: true, searchable: false, depends_on: ['RAT'], is_active: true },
    { dimension_key: 'RAT', display_name: 'Techno', multi_select: true, searchable: false, depends_on: [], is_active: true },
    { dimension_key: 'ARCEP', display_name: 'Zone ARCEP', multi_select: true, searchable: false, depends_on: [], is_active: true },
    { dimension_key: 'Site', display_name: 'Site', multi_select: true, searchable: true, depends_on: ['DOR','Plaque'], is_active: true },
    { dimension_key: 'Cellule', display_name: 'Cellule', multi_select: true, searchable: true, depends_on: ['Site'], is_active: true },
  ];
  res.json(filters);
});

// ── 3. Filter Values ──
app.post('/api/monitor/filters/values', async (req, res) => {
  try {
    const { dimensions, filters } = req.body;
    if (!dimensions || !dimensions.length) return res.status(400).json({ error: 'dimensions required' });

    const result = {};
    for (const dim of dimensions) {
      // Try dim table first
      const dimTable = qoeDimTableMap[dim];
      if (dimTable) {
        try {
          const r = await sharedPool.query(`SELECT value FROM ${dimTable} ORDER BY value`);
          if (r.rows.length > 0) {
            result[dim] = r.rows.map(row => row.value);
            continue;
          }
        } catch { /* fallback */ }
      }
      // Fallback: DISTINCT from qoe_metric
      const sql = `
        SELECT DISTINCT val FROM (
          SELECT "Dimension_2" AS val FROM qoe_metric WHERE "Dimension_1" = $1
          UNION
          SELECT "Dimension_1" AS val FROM qoe_metric WHERE "Dimension_2" = $1
        ) sub WHERE val IS NOT NULL AND val != $1 ORDER BY val LIMIT 500
      `;
      const r = await sharedPool.query(sql, [dim]);
      result[dim] = r.rows.map(row => row.val);
    }
    res.json(result);
  } catch (e) {
    console.error('[monitor/filters/values]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── 4. KPI Timeseries Query ──
app.post('/api/monitor/query/timeseries', async (req, res) => {
  try {
    const { date_from, date_to, granularity, filters, selections, split_by, top_n } = req.body;
    if (!selections || !selections.length) return res.status(400).json({ error: 'selections required' });

    const gran = resolveGranularity(granularity, date_from, date_to);

    // Date expression based on granularity
    let dateExpr;
    if (gran === '15m') dateExpr = `date_trunc('hour', date_part::timestamp) + INTERVAL '15 min' * FLOOR(EXTRACT(minute FROM date_part::timestamp) / 15)`;
    else if (gran === '1h') dateExpr = `date_trunc('hour', date_part::timestamp)`;
    else dateExpr = `date_part::date`;

    // KPI columns
    const kpiKeys = selections.map(s => s.kpi_key);
    const kpiSelect = kpiKeys.map(k => `AVG(${safeCol(k)}) AS "${k}"`).join(', ');

    const where = [];
    const params = [];
    let pi = 1;

    // Date filters
    if (date_from) { where.push(`date_part >= $${pi++}`); params.push(date_from); }
    if (date_to) { where.push(`date_part <= $${pi++}`); params.push(date_to); }

    // Dimension filters
    const fResult = buildMonitorWhere(filters, params, pi);
    where.push(...fResult.clauses);
    params.push(...fResult.params.slice(params.length));
    pi = fResult.pi;

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    // Split handling
    let splitSelect = '';
    let groupBy = `GROUP BY ts`;
    let orderBy = `ORDER BY ts`;

    if (split_by) {
      // When splitting, group by Dimension_2 where Dimension_1 = split_by
      splitSelect = `, "Dimension_2" AS split_value`;
      groupBy = `GROUP BY ts, "Dimension_2"`;
      orderBy = `ORDER BY ts, "Dimension_2"`;
      where.push(`"Dimension_1" = $${pi++}`);
      params.push(split_by);
    }

    // Rebuild whereSQL with split filter
    const finalWhere = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const sql = `
      SELECT (${dateExpr})::text AS ts ${splitSelect}, ${kpiSelect}
      FROM qoe_metric
      ${finalWhere}
      ${groupBy}
      ${orderBy}
    `;

    console.log(`[monitor/timeseries] SQL: ${sql.substring(0, 300)}... params=${JSON.stringify(params).substring(0, 100)}`);
    const result = await sharedPool.query(sql, params);

    // Transform to flat series format
    const series = [];
    for (const row of result.rows) {
      for (const kpiKey of kpiKeys) {
        if (row[kpiKey] != null) {
          series.push({
            ts: row.ts,
            kpi_key: kpiKey,
            split_value: row.split_value || 'ALL',
            value: parseFloat(row[kpiKey]),
          });
        }
      }
    }

    // Apply top_n if splitting
    if (split_by && top_n) {
      const splitTotals = {};
      for (const p of series) {
        if (p.split_value === 'ALL') continue;
        splitTotals[p.split_value] = (splitTotals[p.split_value] || 0) + Math.abs(p.value);
      }
      const topSplits = Object.entries(splitTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, top_n)
        .map(e => e[0]);
      const topSet = new Set(topSplits);
      const filtered = series.filter(p => p.split_value === 'ALL' || topSet.has(p.split_value));
      return res.json({
        series: filtered,
        meta: { granularity_applied: gran, total_series: topSplits.length },
      });
    }

    res.json({
      series,
      meta: { granularity_applied: gran, total_series: new Set(series.map(s => s.split_value)).size },
    });
  } catch (e) {
    console.error('[monitor/timeseries]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── 5. KPI Table Query ──
app.post('/api/monitor/query/table', async (req, res) => {
  try {
    const { date_from, date_to, filters, kpi_keys, split_by, top_n, page, page_size } = req.body;
    if (!kpi_keys || !kpi_keys.length) return res.status(400).json({ error: 'kpi_keys required' });

    const limit = Math.min(page_size || 50, 500);
    const offset = ((page || 1) - 1) * limit;

    const kpiSelect = kpi_keys.map(k =>
      `AVG(${safeCol(k)}) AS "${k}_avg", MIN(${safeCol(k)}) AS "${k}_min", MAX(${safeCol(k)}) AS "${k}_max"`
    ).join(', ');

    const where = [];
    const params = [];
    let pi = 1;

    if (date_from) { where.push(`date_part >= $${pi++}`); params.push(date_from); }
    if (date_to) { where.push(`date_part <= $${pi++}`); params.push(date_to); }

    const fResult = buildMonitorWhere(filters, params, pi);
    where.push(...fResult.clauses);
    params.push(...fResult.params.slice(params.length));
    pi = fResult.pi;

    let groupCol = `'ALL'`;
    let groupByClause = '';
    if (split_by) {
      where.push(`"Dimension_1" = $${pi++}`);
      params.push(split_by);
      groupCol = `"Dimension_2"`;
      groupByClause = `GROUP BY "Dimension_2"`;
    } else {
      groupByClause = '';
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const orderKpi = kpi_keys[0];

    const sql = split_by
      ? `SELECT ${groupCol} AS split_value, ${kpiSelect} FROM qoe_metric ${whereSQL} ${groupByClause} ORDER BY "${orderKpi}_avg" DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`
      : `SELECT 'ALL' AS split_value, ${kpiSelect} FROM qoe_metric ${whereSQL}`;

    console.log(`[monitor/table] SQL: ${sql.substring(0, 300)}...`);
    const result = await sharedPool.query(sql, params);

    // Transform rows
    const rows = result.rows.map(row => {
      const entry = { split_value: row.split_value };
      for (const k of kpi_keys) {
        entry[k] = {
          avg: row[`${k}_avg`] != null ? parseFloat(row[`${k}_avg`]) : null,
          min: row[`${k}_min`] != null ? parseFloat(row[`${k}_min`]) : null,
          max: row[`${k}_max`] != null ? parseFloat(row[`${k}_max`]) : null,
        };
      }
      return entry;
    });

    res.json({ rows, total: rows.length, page: page || 1, page_size: limit });
  } catch (e) {
    console.error('[monitor/table]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── 6. KPI Summary Query ──
app.post('/api/monitor/query/summary', async (req, res) => {
  try {
    const { date_from, date_to, filters, kpi_keys } = req.body;
    if (!kpi_keys || !kpi_keys.length) return res.status(400).json({ error: 'kpi_keys required' });

    const where = [];
    const params = [];
    let pi = 1;

    if (date_from) { where.push(`date_part >= $${pi++}`); params.push(date_from); }
    if (date_to) { where.push(`date_part <= $${pi++}`); params.push(date_to); }

    const fResult = buildMonitorWhere(filters, params, pi);
    where.push(...fResult.clauses);
    params.push(...fResult.params.slice(params.length));
    pi = fResult.pi;

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    // Current period
    const kpiAggs = kpi_keys.map(k =>
      `AVG(${safeCol(k)}) AS "${k}_avg", MIN(${safeCol(k)}) AS "${k}_min", MAX(${safeCol(k)}) AS "${k}_max"`
    ).join(', ');
    const currentSql = `SELECT ${kpiAggs} FROM qoe_metric ${whereSQL}`;
    const current = await sharedPool.query(currentSql, params);

    // Previous period (same duration, shifted back)
    let prevRow = null;
    if (date_from && date_to) {
      const diffMs = new Date(date_to) - new Date(date_from);
      const prevFrom = new Date(new Date(date_from).getTime() - diffMs).toISOString().slice(0, 10);
      const prevTo = new Date(new Date(date_from).getTime() - 1).toISOString().slice(0, 10);
      const prevParams = [prevFrom, prevTo, ...params.slice(2)];
      const prevWhere = whereSQL.replace(`$1`, `$1`).replace(`$2`, `$2`);
      try {
        const prevSql = `SELECT ${kpiAggs} FROM qoe_metric WHERE date_part >= $1 AND date_part <= $2 ${where.slice(2).length ? ' AND ' + where.slice(2).join(' AND ') : ''}`;
        const prev = await sharedPool.query(prevSql, prevParams);
        prevRow = prev.rows[0];
      } catch { /* no prev data */ }
    }

    const summaries = kpi_keys.map(k => {
      const cur = current.rows[0];
      const catalogEntry = KPI_CATALOG_MAP[k];
      const val = cur ? parseFloat(cur[`${k}_avg`]) : null;
      const prevVal = prevRow ? parseFloat(prevRow[`${k}_avg`]) : null;
      const trend = (val != null && prevVal != null && prevVal !== 0)
        ? ((val - prevVal) / Math.abs(prevVal)) * 100
        : null;

      let threshold_state = 'normal';
      if (catalogEntry && val != null) {
        if (catalogEntry.threshold_critical != null) {
          // For rates like DCR, loss — higher is worse
          if (catalogEntry.value_type === 'ratio' && catalogEntry.category !== 'Other') {
            if (val >= catalogEntry.threshold_critical) threshold_state = 'critical';
            else if (val >= catalogEntry.threshold_warning) threshold_state = 'warning';
          } else {
            // For throughput — lower is worse
            if (val <= catalogEntry.threshold_critical) threshold_state = 'critical';
            else if (val <= catalogEntry.threshold_warning) threshold_state = 'warning';
          }
        }
      }

      return {
        kpi_key: k,
        display_name: catalogEntry?.display_name || k,
        unit: catalogEntry?.unit || '',
        value: val,
        min: cur ? parseFloat(cur[`${k}_min`]) : null,
        max: cur ? parseFloat(cur[`${k}_max`]) : null,
        trend_pct: trend,
        threshold_state,
      };
    });

    res.json(summaries);
  } catch (e) {
    console.error('[monitor/summary]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── 7. KPI Explainability ──
app.get('/api/monitor/explain/kpi/:kpi_key', (req, res) => {
  const { kpi_key } = req.params;
  const entry = KPI_CATALOG_MAP[kpi_key];
  if (!entry) return res.status(404).json({ error: `KPI "${kpi_key}" not found` });

  res.json({
    kpi_key: entry.kpi_key,
    display_name: entry.display_name,
    description: entry.description,
    category: entry.category,
    unit: entry.unit,
    value_type: entry.value_type,
    formula_type: entry.formula_type,
    source_table: entry.source_table,
    source_column: entry.source_column,
    supported_levels: entry.supported_levels,
    supports_split: entry.supports_split,
    supports_table: entry.supports_table,
    threshold_warning: entry.threshold_warning,
    threshold_critical: entry.threshold_critical,
    default_chart_type: entry.default_chart_type,
    default_axis: entry.default_axis,
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 OSMOSIS Local Server running on http://localhost:${PORT}`);
  console.log(`   API endpoints:`);
  console.log(`   POST /api/backend-admin`);
  console.log(`   POST /api/import-topo`);
  console.log(`   GET  /api/topo`);
  console.log(`   GET  /api/dashboards`);
  console.log(`   POST /api/dashboards`);
  console.log(`   POST /api/rag-embed`);
  console.log(`   POST /api/qoe-assistant`);
  console.log(`   GET  /api/dump-parameter`);
  console.log(`   GET  /api/kpi-qoe-aggregated`);
  console.log(`   POST /api/kpi-qoe-aggregated`);
  console.log(`   GET  /api/ml-features`);
  console.log(`   POST /api/ml-features`);
  console.log(`   POST /api/bi-query`);
  console.log(`   GET  /api/bi-distinct`);
  console.log(`   GET  /api/bi-date-range`);
  console.log(`   GET  /api/qoe-map`);
  console.log(`   GET  /api/health\n`);
});
