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
  } else {
    console.log('✅ PostgreSQL pool connected to', dbConfig.database);
    try {
      console.log('🔍 Vérification des tables...');
      // Check parameter_dump table
      const tableCheck = await client.query(`
        SELECT CASE
          WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='parameter_dump') THEN 'parameter_dump'
          ELSE NULL
        END AS table_name
      `);
      const dumpTable = tableCheck.rows[0]?.table_name;
      console.log(`   Table détectée: ${dumpTable || '❌ AUCUNE'}`);
      if (dumpTable) {
        // Fast estimate from pg_class (instant, no table scan)
        const estRes = await client.query(`SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = $1`, [dumpTable]);
        const estimate = parseInt(estRes.rows[0]?.estimate || '0');
        console.log(`   Estimation rapide: ~${estimate.toLocaleString()} lignes`);
        // Skip exact counts for very large tables (>1M rows) — too slow
        if (estimate > 1000000) {
          const paramEst = await client.query(`SELECT n_distinct FROM pg_stats WHERE tablename = $1 AND attname = 'parameter'`, [dumpTable]);
          const siteEst = await client.query(`SELECT n_distinct FROM pg_stats WHERE tablename = $1 AND attname = 'site_name'`, [dumpTable]);
          const pVal = parseFloat(paramEst.rows[0]?.n_distinct || '0');
          const sVal = parseFloat(siteEst.rows[0]?.n_distinct || '0');
          const pCount = pVal < 0 ? Math.abs(Math.round(pVal * estimate)) : Math.round(pVal);
          const sCount = sVal < 0 ? Math.abs(Math.round(sVal * estimate)) : Math.round(sVal);
          console.log(`📊 Table "${dumpTable}": ~${estimate.toLocaleString()} lignes, ~${pCount} paramètres, ~${sCount} sites (estimations pg_stats)`);
          console.log(`   ⚡ Comptages exacts ignorés (table > 1M lignes)`);
        } else {
          const countRes = await client.query(`SELECT COUNT(*) AS cnt FROM ${dumpTable}`);
          const paramRes = await client.query(`SELECT COUNT(DISTINCT parameter) AS cnt FROM ${dumpTable}`);
          const siteRes = await client.query(`SELECT COUNT(DISTINCT site_name) AS cnt FROM ${dumpTable}`);
          console.log(`📊 Table "${dumpTable}": ${countRes.rows[0].cnt} lignes, ${paramRes.rows[0].cnt} paramètres distincts, ${siteRes.rows[0].cnt} sites`);
        }
      } else {
        console.warn('⚠️  Aucune table parameter_dump trouvée dans la base RAN_OP');
      }
      // Check topo table
      const topoCheck = await client.query(`SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema='public' AND table_name='topo'`);
      if (parseInt(topoCheck.rows[0].cnt) > 0) {
        const topoCount = await client.query('SELECT COUNT(*) AS cnt FROM topo');
        console.log(`📊 Table "topo": ${topoCount.rows[0].cnt} lignes`);
      }
      // List all public tables for debugging
      const allTables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
      console.log(`📋 Tables dans "${dbConfig.database}":`, allTables.rows.map(r => r.table_name).join(', '));

      // ─── Pre-populate DISTINCT cache for heavy columns ───
      if (dumpTable) {
        let cacheResolve;
        distinctCachePromise = new Promise(r => { cacheResolve = r; });
        console.log('🔄 Pré-chargement du cache DISTINCT...');
        const cacheCols = ['parameter', 'site_name', 'cell_name'];
        const cacheStart = Date.now();
        for (const col of cacheCols) {
          try {
            const r = await client.query(`SELECT DISTINCT ${col} FROM ${dumpTable} WHERE ${col} IS NOT NULL ORDER BY ${col} LIMIT 10000`);
            distinctCache[col] = r.rows.map(row => row[col]);
            console.log(`   ✅ Cache ${col}: ${distinctCache[col].length} valeurs (${Date.now() - cacheStart}ms)`);
          } catch (e) {
            console.warn(`   ⚠️ Cache ${col} failed:`, e.message);
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
         AND table_name IN ('topo', 'dashboards', 'rag_documents', 'qoe_metrics', 'parameter_dump')`, [schema]
      );
      const tablesCreated = countRes.rows[0]?.cnt || 0;

      return res.json({ success: true, tables_created: tablesCreated, pgvector: hasVector });
    }

    if (action === 'query_tables') {
      const schema = config.schema || 'public';
      const tables = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1 AND table_type = 'BASE TABLE'
         AND table_name IN ('topo', 'dashboards', 'rag_documents', 'qoe_metrics', 'parameter_dump')
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
      const allowedCols = ['site_name', 'cell_name', 'parameter', 'dor', 'plaque', 'vendor', 'ur', 'dr', 'bande'];
      if (!allowedCols.includes(distinct_col)) {
        console.log(`   ⚠️ Colonne non autorisée: ${distinct_col}`);
        return res.json([]);
      }

      // 1) Wait for cache if still loading, then check in-memory cache
      await waitForCache();
      const hasFilter = !!(site_name || cell_name || dor || plaque || vendor);
      if (!hasFilter && distinctCache[distinct_col]) {
        console.log(`   ⚡ Cache mémoire: ${distinctCache[distinct_col].length} valeurs pour ${distinct_col} (${Date.now() - reqStart}ms)`);
        return res.json(distinctCache[distinct_col].map(v => ({ [distinct_col]: v })));
      }

      // 2) For unfiltered DISTINCT on huge tables, try pg_stats (instant)
      // Only use pg_stats shortcut for low-cardinality columns (few distinct values)
      const lowCardinalityCols = ['vendor', 'ur', 'plaque', 'dor', 'dr', 'bande'];
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

    // Normal query mode
    const cols = select || 'id, site_name, cell_name, parameter, value, plaque, dor, vendor, bande, dr, ur';
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
  console.log(`   GET  /api/health\n`);
});
