require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ─── Helper: create pg pool from config ───
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

CREATE TABLE IF NOT EXISTS dump_parameter (
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

const ENSURE_DUMP_PARAMETER_SQL = `
CREATE TABLE IF NOT EXISTS dump_parameter (
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
      await pool.query(ENSURE_DUMP_PARAMETER_SQL); // safety net for legacy instances

      // Count actual tables created
      const schema = config.schema || 'public';
      const countRes = await pool.query(
        `SELECT COUNT(*)::int as cnt FROM information_schema.tables
         WHERE table_schema = $1 AND table_type = 'BASE TABLE'
         AND table_name IN ('topo', 'dashboards', 'rag_documents', 'qoe_metrics', 'dump_parameter')`, [schema]
      );
      const tablesCreated = countRes.rows[0]?.cnt || 0;

      return res.json({ success: true, tables_created: tablesCreated, pgvector: hasVector });
    }

    if (action === 'query_tables') {
      const schema = config.schema || 'public';
      const tables = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1 AND table_type = 'BASE TABLE'
         AND table_name IN ('topo', 'dashboards', 'rag_documents', 'qoe_metrics', 'dump_parameter')
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

// ─── /api/topo (read all) ───
app.get('/api/topo', async (req, res) => {
  const pool = createPool({ host: 'localhost', port: '5432', database: 'postgres', user: 'postgres', password: 'root' });
  try {
    const result = await pool.query('SELECT * FROM topo ORDER BY id');
    res.json(result.rows);
  } catch (e) {
    res.json({ error: e.message });
  } finally {
    await pool.end();
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

// ─── Helper: detect distribution/aggregation questions ───
function isDistributionQuery(query) {
  const normalized = query.toLowerCase();
  return ['distribution', 'répartition', 'repartition', 'distrubition', 'distrubtion',
    'par plaque', 'par upr', 'par vendor', 'par site', 'par bande', 'par dor', 'par region', 'par zone'].some(h => normalized.includes(h));
}

function extractParamName(query) {
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

// ─── Helper: search dump_parameter locally ───
async function searchDumpParameterLocal(query) {
  const pool = createPool({ host: 'localhost', port: '5432', database: 'RAN_OP', user: 'postgres', password: 'root' });
  try {
    const paramName = extractParamName(query);
    const isDistrib = isDistributionQuery(query);

    if (isDistrib && paramName) {
      const groupCol = extractGroupByColumn(query);
      console.log(`[dump_parameter] Aggregation: param=${paramName}, groupBy=${groupCol}`);
      const result = await pool.query(
        `SELECT COALESCE(${groupCol}, 'N/A') AS dimension, value AS param_value, COUNT(*) AS nb_cells
         FROM dump_parameter WHERE parameter ILIKE $1
         GROUP BY COALESCE(${groupCol}, 'N/A'), value
         ORDER BY dimension, nb_cells DESC`,
        [`%${paramName}%`]
      );
      if (!result.rows.length) {
        const fallback = await pool.query(
          `SELECT DISTINCT parameter FROM dump_parameter WHERE parameter ILIKE $1 LIMIT 20`,
          [`%${paramName}%`]
        );
        if (fallback.rows.length) {
          return `Paramètres trouvés contenant "${paramName}": ${fallback.rows.map(r => r.parameter).join(', ')}`;
        }
        return '';
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
       FROM dump_parameter WHERE ${conditions} LIMIT 80`,
      params
    );
    if (!result.rows.length) return '';
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
  const pool = createPool({ host: 'localhost', port: '5432', database: 'RAN_OP', user: 'postgres', password: 'root' });
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

RÈGLE ABSOLUE — DONNÉES RÉELLES UNIQUEMENT :
- Tu reçois dans le contexte des données RÉELLES extraites de la base locale (dump_parameter, topo, rag_documents).
- Tu dois EXCLUSIVEMENT utiliser les noms de sites, cellules, plaques, vendors EXACTS qui apparaissent dans les données fournies.
- Il est STRICTEMENT INTERDIT d'inventer ou halluciner des noms de sites, plaques ou valeurs. Si une donnée n'est pas dans le contexte, dis-le explicitement.
- Ne JAMAIS inventer des plaques comme "LYON_TOP15" ou "MARSEILLE" si elles n'apparaissent pas dans les données.

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

// ─── Health check ───
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: 'local', timestamp: new Date().toISOString() });
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
  console.log(`   GET  /api/health\n`);
});
