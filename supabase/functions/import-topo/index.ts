import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { rows, clear_before } = await req.json();

    console.log(`[import-topo] Received ${rows?.length || 0} rows, clear_before=${clear_before}`);
    if (rows?.length > 0) {
      console.log(`[import-topo] Sample row keys: ${Object.keys(rows[0]).join(', ')}`);
      console.log(`[import-topo] Sample row: ${JSON.stringify(rows[0])}`);
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "No rows provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Helper: parse date from various formats to YYYY-MM-DD
    const parseDate = (val: any): string | null => {
      if (!val) return null;
      const s = String(val).trim();
      if (!s) return null;
      // Already YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        // Reject invalid dates like 0000-00-00
        if (s.startsWith('0000')) return null;
        return s;
      }
      // DD/MM/YYYY
      const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
      // MM/DD/YYYY
      const mdy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
      return null; // skip invalid dates
    };

    // Optionally clear existing data
    if (clear_before) {
      const { error: delErr } = await supabase.from("topo").delete().neq("id", 0);
      console.log(`[import-topo] Clear result: ${delErr ? delErr.message : 'OK'}`);
    }

    // Insert in batches of 500
    const batchSize = 500;
    let inserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize).map((r: any) => ({
        code_nidt: r.code_nidt || "",
        nom_site: r.nom_site || "",
        region: r.region || null,
        longitude: r.longitude != null ? parseFloat(String(r.longitude)) : null,
        latitude: r.latitude != null ? parseFloat(String(r.latitude)) : null,
        nom_cellule: r.nom_cellule || "",
        techno: r.techno || null,
        bande: r.bande || null,
        constructeur: r.constructeur || null,
        azimut: r.azimut != null && r.azimut !== '' ? parseInt(String(r.azimut)) : null,
        date_mes: parseDate(r.date_mes),
        date_fn8: parseDate(r.date_fn8),
        plaque: r.plaque || null,
        hba: r.hba != null ? Math.round(parseFloat(String(r.hba))) : null,
        tac: r.tac != null ? parseInt(String(r.tac)) : null,
        lac: r.lac != null && r.lac !== '' ? parseInt(String(r.lac)) : null,
        pci: r.pci != null && r.pci !== '' ? parseInt(String(r.pci)) : null,
        cid: r.cid != null && r.cid !== '' ? parseInt(String(r.cid)) : null,
        eci: r.eci != null && r.eci !== '' ? parseInt(String(r.eci)) : null,
        nci: r.nci != null && r.nci !== '' ? parseInt(String(r.nci)) : null,
        tilt: r.tilt != null && r.tilt !== '' ? parseFloat(String(r.tilt)) : null,
        etat_cellule: r.etat_cellule || null,
        zone_arcep: r.zone_arcep || null,
        essentiel: r.essentiel || null,
        hebergeur_leader: r.hebergeur_leader || null,
        relative_id: r.relative_id != null && r.relative_id !== '' ? parseInt(String(r.relative_id)) : null,
      }));

      if (i === 0) {
        console.log(`[import-topo] First mapped row: ${JSON.stringify(batch[0])}`);
      }

      const { error } = await supabase.from("topo").insert(batch);
      if (error) {
        console.error(`[import-topo] Batch ${i / batchSize} error: ${error.message}`);
        errors.push(`Batch ${i / batchSize}: ${error.message}`);
      } else {
        inserted += batch.length;
      }
    }

    return new Response(
      JSON.stringify({ inserted, total: rows.length, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
