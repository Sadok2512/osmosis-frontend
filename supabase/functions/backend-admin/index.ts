import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface DbConfig {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  schema: string;
}

const TABLE_SQL = `
-- Enable pgvector if available
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

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
  embedding VECTOR(768),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
`;

async function connectPg(config: DbConfig) {
  // Dynamic import of postgres driver for Deno
  const { default: postgres } = await import(
    "https://deno.land/x/postgresjs@v3.4.4/mod.js"
  );
  const sql = postgres({
    hostname: config.host,
    port: parseInt(config.port),
    database: config.database,
    username: config.user,
    password: config.password,
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });
  return sql;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, config } = await req.json();

    if (action === "test_connection") {
      const sql = await connectPg(config);
      try {
        const result = await sql`SELECT version()`;
        const version = result[0]?.version?.split(" ").slice(0, 2).join(" ");
        await sql.end();
        return new Response(
          JSON.stringify({ success: true, version }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e: any) {
        try { await sql.end(); } catch {}
        return new Response(
          JSON.stringify({ success: false, error: e.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "create_tables") {
      const sql = await connectPg(config);
      try {
        // Split and execute statements
        await sql.unsafe(TABLE_SQL);
        await sql.end();
        return new Response(
          JSON.stringify({ success: true, tables_created: 3 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e: any) {
        try { await sql.end(); } catch {}
        return new Response(
          JSON.stringify({ success: false, error: e.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "query_tables") {
      const sql = await connectPg(config);
      try {
        const schema = config.schema || "public";
        // Get tables
        const tables = await sql`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = ${schema}
            AND table_type = 'BASE TABLE'
            AND table_name IN ('topo', 'dashboards', 'rag_documents')
          ORDER BY table_name
        `;

        const result = [];
        for (const t of tables) {
          const name = t.table_name;
          // Row count
          const countRes = await sql.unsafe(
            `SELECT COUNT(*)::int as cnt FROM ${schema}.${name}`
          );
          // Columns
          const cols = await sql`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = ${schema} AND table_name = ${name}
            ORDER BY ordinal_position
          `;
          result.push({
            name,
            rowCount: countRes[0]?.cnt || 0,
            columns: cols.map((c: any) => ({
              name: c.column_name,
              type: c.data_type,
              nullable: c.is_nullable === "YES",
            })),
          });
        }

        await sql.end();
        return new Response(
          JSON.stringify({ success: true, tables: result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e: any) {
        try { await sql.end(); } catch {}
        return new Response(
          JSON.stringify({ success: false, error: e.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: "Action inconnue" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
