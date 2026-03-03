const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

// ─── In-memory cache for DISTINCT values (populated at startup) ───
const distinctCache = {}; // { column_name: [values] }
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

      // Exact count
      const countRes = await client.query(`SELECT COUNT(*) AS cnt FROM ${dumpTable}`);
      const totalRows = parseInt(countRes.rows[0].cnt);
      console.log(`   Total lignes: ${totalRows.toLocaleString()}`);

      if (totalRows > 0) {
        // Distinct counts
        const paramRes = await client.query(`SELECT COUNT(DISTINCT parameter) AS cnt FROM ${dumpTable}`);
        const siteRes = await client.query(`SELECT COUNT(DISTINCT site_name) AS cnt FROM ${dumpTable}`);
        const vendorRes = await client.query(`SELECT COUNT(DISTINCT vendor) AS cnt FROM ${dumpTable}`);
        console.log(`   Paramètres distincts: ${paramRes.rows[0].cnt}`);
        console.log(`   Sites distincts: ${siteRes.rows[0].cnt}`);
        console.log(`   Vendors distincts: ${vendorRes.rows[0].cnt}`);

        // Show first 10 parameters as sanity check
        const sampleParams = await client.query(`SELECT DISTINCT parameter FROM ${dumpTable} WHERE parameter IS NOT NULL ORDER BY parameter LIMIT 10`);
        console.log(`   🔎 Échantillon paramètres: [${sampleParams.rows.map(r => r.parameter).join(', ')}]`);

        // Show first 5 sites
        const sampleSites = await client.query(`SELECT DISTINCT site_name FROM ${dumpTable} WHERE site_name IS NOT NULL ORDER BY site_name LIMIT 5`);
        console.log(`   🔎 Échantillon sites: [${sampleSites.rows.map(r => r.site_name).join(', ')}]`);
      } else {
        console.log(`   ⚠️ TABLE VIDE — aucune donnée importée`);
      }
    } else {
      console.warn('⚠️  AUCUNE table parameter_dump trouvée !');
      console.warn('   Créez-la via Backend Admin ou lancez un import CSV.');
    }

    // Check topo table
    if (tableNames.includes('topo')) {
      const topoCount = await client.query('SELECT COUNT(*) AS cnt FROM topo');
      console.log(`\n📊 Table "topo": ${topoCount.rows[0].cnt} lignes`);
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
  remote_electrical_tilt INTEGER,
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
  id BIGSERIAL PRIMARY KEY,
  dn TEXT,
  enodeb_id INTEGER,
  mrbts_id INTEGER,
  gnodeb_id INTEGER,
  cell_dn TEXT,
  cell_name TEXT,
  vendor TEXT,
  dor TEXT,
  omc TEXT,
  plaque TEXT,
  longitude DOUBLE PRECISION,
  latitude DOUBLE PRECISION,
  site_name TEXT,
  freq_downlink DOUBLE PRECISION,
  bande TEXT,
  ur TEXT,
  dr TEXT,
  zone_arcep TEXT,
  tgv INTEGER,
  city TEXT,
  parameter TEXT NOT NULL,
  version TEXT,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
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
        `INSERT INTO topo (code_nidt, nom_site, nom_cellule, latitude, longitude, azimut, hba, techno, bande, constructeur, plaque, region, tac, date_mes, date_fn8)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT DO NOTHING`,
        [row.code_nidt, row.nom_site, row.nom_cellule, row.latitude, row.longitude,
         row.azimut, row.hba, row.techno, row.bande, row.constructeur,
         row.plaque, row.region, row.tac, row.date_mes, row.date_fn8]
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
              etat_cellule, zone_arcep, essentiel, remote_electrical_tilt`
      : `code_nidt, nom_site, region, longitude, latitude, nom_cellule,
              techno, bande, constructeur, azimut, plaque, hba, tac,
              date_mes, date_fn8`;

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
        'remote_electrical_tilt', 'date_mes', 'date_fn8'];
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
function isDistributionQuery(query) {
  const normalized = query.toLowerCase();
  return ['distribution', 'répartition', 'repartition', 'distrubition', 'distrubtion',
    'par plaque', 'par upr', 'par vendor', 'par site', 'par bande', 'par dor', 'par region', 'par zone'].some(h => normalized.includes(h));
}

function extractParamName(query) {
  // Match "SIB.t300", "NRCELL.t300", "LNCEL.T300", "CATMPR.t300ModeACatM" etc.
  const matchFull = query.match(/\b((?:LNCEL|LNBTS|LNCELL|MRBTS|GNBTS|SIB|NRCELL|CATMPR|NOKLTE|NRBTS|GNBCUCP|GNBCUUP|GNBDU|LNHOIF|LNRELIF|IRFIM)[.\s_]?\w+)\b/i);
  if (matchFull) return matchFull[1].replace(/\s/g, '.');
  const match = query.match(/\b(t\d{3,4})\b/i);
  return match ? match[1] : null;
}

function extractGroupByColumn(query) {
  const normalized = query.toLowerCase();
  const mappings = {
    'plaque': 'plaque', 'upr': 'ur', 'vendor': 'vendor', 'site': 'site_name',
    'bande': 'bande', 'dor': 'dor', 'region': 'dr', 'zone': 'zone_arcep',
    'omc': 'omc', 'city': 'city', 'ville': 'city',
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

// ─── Helper: search parameter_dump locally ───
async function searchDumpParameterLocal(query) {
  const pool = createPool(getLocalDbConfig());
  try {
    const dumpTable = 'parameter_dump';
    await pool.query(ENSURE_PARAMETER_DUMP_SQL);

    const paramName = extractParamName(query);
    const isDistrib = isDistributionQuery(query);
    const siteName = extractSiteName(query);

    // Site-specific parameter query (e.g. "T300 pour FIRMINY_TDF")
    if (paramName && siteName && !isDistrib) {
      console.log(`[${dumpTable}] Site+param search: param=${paramName}, site=${siteName}`);
      const result = await pool.query(
        `SELECT dn, cell_dn, cell_name, site_name, parameter, value, version, vendor, bande, ur, plaque
         FROM ${dumpTable}
         WHERE parameter ILIKE $1 AND site_name ILIKE $2
         ORDER BY cell_name, parameter LIMIT 200`,
        [`%${paramName}%`, `%${siteName}%`]
      );
      if (!result.rows.length) {
        const siteCheck = await pool.query(`SELECT DISTINCT site_name FROM ${dumpTable} WHERE site_name ILIKE $1 LIMIT 5`, [`%${siteName}%`]);
        const paramCheck = await pool.query(`SELECT DISTINCT parameter FROM ${dumpTable} WHERE parameter ILIKE $1 LIMIT 10`, [`%${paramName}%`]);
        let msg = `RÉSULTAT DE RECHERCHE : AUCUNE DONNÉE trouvée pour le paramètre "${paramName}" sur le site "${siteName}".\n`;
        if (!siteCheck.rows.length) msg += `⚠️ Le site "${siteName}" n'existe pas dans la base ${dumpTable}.\n`;
        else msg += `Sites similaires : ${siteCheck.rows.map(r => r.site_name).join(', ')}\n`;
        if (!paramCheck.rows.length) msg += `⚠️ Le paramètre "${paramName}" n'existe pas dans la base.\n`;
        else msg += `Paramètres contenant "${paramName}" : ${paramCheck.rows.map(r => r.parameter).join(', ')}\n`;
        return msg;
      }
      const header = 'dn | cell_name | site_name | parameter | value | version | vendor | bande | ur | plaque';
      const lines = result.rows.map(r =>
        `${r.dn||''} | ${r.cell_name||''} | ${r.site_name||''} | ${r.parameter||''} | ${r.value||''} | ${r.version||''} | ${r.vendor||''} | ${r.bande||''} | ${r.ur||''} | ${r.plaque||''}`
      );
      return `DONNÉES RÉELLES pour ${paramName} sur ${siteName} (${result.rows.length} résultats) :\n${header}\n${lines.join('\n')}`;
    }

    if (isDistrib && paramName) {
      const groupCol = extractGroupByColumn(query);
      console.log(`[${dumpTable}] Aggregation: param=${paramName}, groupBy=${groupCol}`);
      const result = await pool.query(
        `SELECT COALESCE(${groupCol}, 'N/A') AS dimension, value AS param_value, COUNT(*) AS nb_cells
         FROM ${dumpTable} WHERE parameter ILIKE $1
         GROUP BY COALESCE(${groupCol}, 'N/A'), value
         ORDER BY dimension, nb_cells DESC`,
        [`%${paramName}%`]
      );
      if (!result.rows.length) {
        return `AUCUNE DONNÉE trouvée pour le paramètre "${paramName}" dans la base ${dumpTable}.`;
      }
      const header = `dimension | valeur_${paramName} | nb_cellules`;
      const lines = result.rows.map(r => `${r.dimension} | ${r.param_value} | ${r.nb_cells}`);
      const total = result.rows.reduce((s, r) => s + parseInt(r.nb_cells), 0);
      return `DISTRIBUTION AGRÉGÉE du paramètre ${paramName} par ${groupCol} (${total} cellules au total):\n${header}\n${lines.join('\n')}`;
    }

    // Standard search
    const terms = (query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).slice(0, 6);
    if (terms.length === 0) return '';
    const conditions = terms.map((_, i) =>
      `parameter ILIKE $${i+1} OR site_name ILIKE $${i+1} OR value ILIKE $${i+1} OR dn ILIKE $${i+1}`
    ).join(' OR ');
    const params = terms.map(t => `%${t}%`);
    const result = await pool.query(
      `SELECT dn, enodeb_id, mrbts_id, gnodeb_id, cell_name, vendor, site_name, bande, plaque, parameter, version, value
       FROM ${dumpTable} WHERE ${conditions} LIMIT 80`,
      params
    );
    if (!result.rows.length) return `AUCUNE DONNÉE trouvée dans ${dumpTable} pour: ${terms.join(', ')}`;
    const header = 'dn | enodeb_id | mrbts_id | cell_name | vendor | site_name | bande | plaque | parameter | version | value';
    const lines = result.rows.map(r =>
      `${r.dn||''} | ${r.enodeb_id||''} | ${r.mrbts_id||''} | ${r.cell_name||''} | ${r.vendor||''} | ${r.site_name||''} | ${r.bande||''} | ${r.plaque||''} | ${r.parameter||''} | ${r.version||''} | ${r.value||''}`
    );
    return `Total résultats paramètres: ${result.rows.length}\n${header}\n${lines.join('\n')}`;
  } catch (e) {
    console.error('[dump_parameter search error]', e.message);
    return '';
  } finally {
    await pool.end();
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

// ─── /api/qoe-assistant (proxy to OpenRouter with local context) ───
app.post('/api/qoe-assistant', async (req, res) => {
  const { messages, cellContext, openrouter_key, model } = req.body;
  const apiKey = openrouter_key || process.env.OPENROUTER_API_KEY;

  console.log('[qoe-assistant] API key present:', !!apiKey, '| env key present:', !!process.env.OPENROUTER_API_KEY);

  if (!apiKey) {
    return res.status(400).json({ error: 'OPENROUTER_API_KEY manquante. Créez server/.env avec OPENROUTER_API_KEY=sk-or-v1-...' });
  }

  try {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    
    const [paramContext, ragContext] = await Promise.all([
      searchDumpParameterLocal(lastUserMsg),
      searchRAGLocal(lastUserMsg),
    ]);

    console.log(`[qoe-assistant] Context: params=${paramContext ? paramContext.split('\\n').length + ' lines' : 'none'}, rag=${ragContext ? 'found' : 'none'}`);

    let systemContent = `Tu es un assistant expert en analyse de Qualité d'Expérience (QoE) réseau mobile pour l'opérateur Orange France.

KPIs disponibles : QoE Score, DMS DL 3/8/30 Mbps, Throughput DL/UL (p50), RTT (p95), Taux de perte TCP, Retransmission Rate, Window Full Ratio, Sessions, Volume DL.
Dimensions : Vendor (Ericsson, Nokia), DOR, Plaque, RAT (2G/3G/4G/5G), Site, Cellule, Bande, Device, OS, Client, Application.

SCHÉMA DES TABLES DE LA BASE DE DONNÉES :
Si l'utilisateur demande la liste des champs, colonnes, structure ou schéma d'une table, réponds directement avec les informations ci-dessous sans chercher dans les données.

Table **parameter_dump** : id (bigint PK), dn (text), cell_dn (text), cell_name (text), site_name (text), parameter (text NOT NULL), value (text), version (text), vendor (text), bande (text), plaque (text), omc (text), dor (text), dr (text), ur (text), city (text), zone_arcep (text), enodeb_id (integer), mrbts_id (integer), gnodeb_id (integer), freq_downlink (double), tgv (integer), latitude (double), longitude (double), created_at (timestamp).

Table **topo** : id (bigint PK), code_nidt (text NOT NULL), nom_cellule (text NOT NULL), nom_site (text NOT NULL), techno (text), bande (text), constructeur (text), region (text), plaque (text), azimut (integer), latitude (double), longitude (double), tac (integer), hba (integer), date_mes (date), date_fn8 (date), created_at (timestamp).

Table **qoe_metrics** : id (bigint PK), dt (date NOT NULL), cell_id (text NOT NULL), site_id (text), service (text), techno (text), bande (text), qoe_score_avg (double), p50_thr_dn_mbps (double), p50_thr_up_mbps (double), p95_rtt_ms (double), dms_dl_3 (double), dms_dl_8 (double), dms_dl_30 (double), dms_ul_3 (double), loss_dn_sum (double), traffic_dn_bytes (double), traffic_up_bytes (double), sessions (integer), window_full_ratio (double), retransmission_rate (double), tcp_loss_rate (double), out_of_order_rate (double), created_at (timestamp).

Table **rag_documents** : id (uuid PK), filename (text NOT NULL), content (text NOT NULL), chunk_index (integer), embedding (vector), metadata (jsonb), created_at (timestamp).

Table **dashboards** : id (text PK), name (text NOT NULL), description (text), widgets (jsonb), is_shared (boolean), created_at (timestamp), updated_at (timestamp).

RÈGLE ABSOLUE — DONNÉES RÉELLES UNIQUEMENT :
- Tu reçois dans le contexte des données RÉELLES extraites de la base locale (dump_parameter, topo, rag_documents).
- Tu dois EXCLUSIVEMENT utiliser les noms de sites, cellules, plaques, vendors EXACTS qui apparaissent dans les données fournies.
- Il est STRICTEMENT INTERDIT d'inventer ou halluciner des noms de sites, plaques, valeurs de paramètres ou données. Si une donnée n'est pas dans le contexte, dis-le EXPLICITEMENT : "Ce paramètre/site n'a pas été trouvé dans la base."
- Ne JAMAIS inventer des plaques comme "LYON_TOP15" ou "MARSEILLE" si elles n'apparaissent pas dans les données.
- Si le contexte contient "AUCUNE DONNÉE trouvée", tu DOIS le rapporter tel quel à l'utilisateur. NE JAMAIS inventer de valeurs pour compenser l'absence de données.

RÈGLES DE FORMATAGE ABSOLUES :
- JAMAIS de HTML. Utilise UNIQUEMENT du Markdown pur avec | et --- pour les tableaux.
- Structure avec ## et ### pour les titres.
- Mets en **gras** les valeurs importantes.

PARAMÈTRES RÉSEAU (DUMP CM) :
Si des données de paramètres réseau (dump_parameter) sont fournies dans le contexte, utilise-les EXACTEMENT telles quelles.
Présente les paramètres sous forme de tableau Markdown avec les colonnes pertinentes (Plaque, Parameter, Value, Nb Cellules).
Pour les distributions, agrège par plaque et par valeur en utilisant UNIQUEMENT les données fournies.

VISUALISATIONS INTERACTIVES :
Tu peux intégrer des graphiques dans ta réponse avec des blocs \\\`\\\`\\\`chart :
\\\`\\\`\\\`chart
{"type":"bar","title":"Distribution T300","xKey":"plaque","yKeys":["count"],"data":[{"plaque":"NANTES","count":1698}]}
\\\`\\\`\\\`
Types supportés : "line", "bar", "area", "scatter".

Réponds TOUJOURS en français.`;
    if (paramContext) {
      systemContent += `\n\n⚙️ PARAMÈTRES RÉSEAU (DUMP CM LOCAL) :\n${paramContext}`;
    }
    if (ragContext) {
      systemContent += `\n\n📚 DOCUMENTS RAG PERTINENTS :\n${ragContext}`;
    }
    if (cellContext) {
      systemContent += `\n\nDONNÉES RÉSEAU RÉELLES DISPONIBLES :\n${cellContext}`;
    }

    const enrichedMessages = [
      { role: 'system', content: systemContent },
      ...messages.filter(m => m.role !== 'system'),
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'QOEBIT Local',
      },
      body: JSON.stringify({
        model: model || 'google/gemini-2.5-flash-preview-05-20',
        messages: enrichedMessages,
        stream: true,
      }),
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
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
      const allowedCols = ['site_name', 'cell_name', 'parameter', 'dor', 'plaque', 'vendor', 'ur', 'dr', 'bande', 'omc'];
      if (!allowedCols.includes(distinct_col)) {
        console.log(`   ⚠️ Colonne non autorisée: ${distinct_col}`);
        return res.json([]);
      }

      // 1) Wait for cache if still loading, then check in-memory cache
      await waitForCache();
      const hasFilter = !!(site_name || cell_name || dor || plaque || vendor);
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
      q += ` ORDER BY ${distinct_col} LIMIT 5000`;
      console.log(`   🔍 DISTINCT query: col=${distinct_col}${site_name ? `, site=${site_name}` : ''}`);
      const result = await sharedPool.query(q, params);
      console.log(`   ✅ ${result.rows.length} valeurs distinctes (${Date.now() - reqStart}ms)`);
      return res.json(result.rows);
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
    const limitVal = Math.min(Math.max(parseInt(lim) || 5000, 1), 50000);
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 QOEBIT Local Server running on http://localhost:${PORT}`);
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
  console.log(`   GET  /api/health\n`);
});
