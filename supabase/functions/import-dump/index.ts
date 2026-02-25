import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { rows, clear_before } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const tableCandidates = ["dump_parametre", "dump_parameter"];
    let activeDumpTable: string | null = null;
    for (const tableName of tableCandidates) {
      const probe = await supabase.from(tableName).select("id").limit(1);
      if (!probe.error) {
        activeDumpTable = tableName;
        break;
      }
      const msg = probe.error?.message?.toLowerCase() || "";
      if (!msg.includes("does not exist") && !msg.includes("relation") && !msg.includes("could not find")) {
        activeDumpTable = tableName;
        break;
      }
    }

    if (!activeDumpTable) {
      return new Response(JSON.stringify({ success: false, error: "Aucune table dump_parameter/dump_parametre trouvée" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (clear_before) {
      const { error: delErr } = await supabase.from(activeDumpTable).delete().neq("id", 0);
      if (delErr) console.error("Clear error:", delErr);
    }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No rows provided" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH).map((r: any) => ({
        dn: r.dn || null,
        enodeb_id: r.enodeb_id ? parseInt(r.enodeb_id) : null,
        mrbts_id: r.mrbts_id ? parseInt(r.mrbts_id) : null,
        gnodeb_id: r.gnodeb_id ? parseInt(r.gnodeb_id) : null,
        cell_dn: r.cell_dn || null,
        cell_name: r.cell_name || null,
        vendor: r.vendor || null,
        dor: r.dor || null,
        omc: r.omc || null,
        plaque: r.plaque || null,
        longitude: r.longitude ? parseFloat(r.longitude) : null,
        latitude: r.latitude ? parseFloat(r.latitude) : null,
        site_name: r.site_name || null,
        freq_downlink: r.freq_downlink ? parseFloat(r.freq_downlink) : null,
        bande: r.bande || null,
        ur: r.ur || null,
        dr: r.dr || null,
        zone_arcep: r.zone_arcep || null,
        tgv: r.tgv ? parseInt(r.tgv) : null,
        city: r.city || null,
        parameter: r.parameter || "UNKNOWN",
        value: r.value || null,
        version: r.version || null,
      }));

      const { error } = await supabase.from(activeDumpTable).insert(batch);
      if (error) {
        console.error(`Batch insert error at ${i}:`, error);
        return new Response(
          JSON.stringify({ success: false, error: error.message, inserted }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      inserted += batch.length;
    }

    return new Response(
      JSON.stringify({ success: true, table: activeDumpTable, inserted, total: rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
