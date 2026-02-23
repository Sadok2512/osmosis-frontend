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

    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "No rows provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optionally clear existing data
    if (clear_before) {
      await supabase.from("topo").delete().neq("id", 0);
    }

    // Insert in batches of 500
    const batchSize = 500;
    let inserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize).map((r: any) => ({
        code_nidt: r.site_code || r.code_nidt || "",
        nom_site: r.site_name || r.nom_site || "",
        region: r.nom_dr || r.region || null,
        longitude: (r.longitude ? parseFloat(r.longitude) : null),
        latitude: (r.latitude ? parseFloat(r.latitude) : null),
        nom_cellule: r.cell_name || r.nom_cellule || "",
        techno: r.bande ? (String(r.bande).toUpperCase().includes('NR') ? '5G' : String(r.bande).toUpperCase().includes('LTE') ? '4G' : r.bande) : (r.techno || null),
        bande: r.bande || null,
        constructeur: r.vendor || r.constructeur || null,
        azimut: r.azimut !== undefined && r.azimut !== '' ? parseInt(r.azimut) : (r.de_azimut !== undefined ? parseInt(r.de_azimut) : null),
        date_mes: r.date_mest || r.date_mes || null,
        date_fn8: r.date_fn8 || null,
        plaque: r.cluster || r.plaque || null,
        hba: r.hba ? parseFloat(r.hba) : null,
        tac: r.NrTAC ? parseInt(r.NrTAC) : (r.tac ? parseInt(r.tac) : null),
      }));

      const { error } = await supabase.from("topo").insert(batch);
      if (error) {
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
