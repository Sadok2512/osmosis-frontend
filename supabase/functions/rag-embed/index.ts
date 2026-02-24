import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { filename, content, action } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Delete action
    if (action === "delete") {
      const { error } = await supabase
        .from("rag_documents")
        .delete()
        .eq("filename", filename);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List action
    if (action === "list") {
      const { data, error } = await supabase
        .from("rag_documents")
        .select("filename, chunk_index, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Group by filename
      const files = new Map<string, { filename: string; chunks: number; created_at: string }>();
      for (const row of data || []) {
        if (!files.has(row.filename)) {
          files.set(row.filename, { filename: row.filename, chunks: 0, created_at: row.created_at });
        }
        files.get(row.filename)!.chunks++;
      }
      return new Response(JSON.stringify({ files: Array.from(files.values()) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Embed action (default)
    if (!filename || !content) {
      throw new Error("filename and content are required");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Delete existing chunks for this file
    await supabase.from("rag_documents").delete().eq("filename", filename);

    const chunks = chunkText(content);
    let embedded = 0;

    for (let i = 0; i < chunks.length; i++) {
      // Use Gemini to generate a text representation for embedding
      const embResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content: "Tu es un extracteur de mots-clés. Retourne UNIQUEMENT une liste de 20 mots-clés séparés par des virgules qui résument le texte suivant. Pas d'explication.",
            },
            { role: "user", content: chunks[i].slice(0, 2000) },
          ],
        }),
      });

      if (!embResponse.ok) {
        console.error("Embedding generation failed for chunk", i);
        // Store without embedding
        await supabase.from("rag_documents").insert({
          filename,
          content: chunks[i],
          chunk_index: i,
          metadata: { keywords: "" },
        });
        embedded++;
        continue;
      }

      const embData = await embResponse.json();
      const keywords = embData.choices?.[0]?.message?.content || "";

      // Store chunk with keywords in metadata (embedding via keywords for now)
      // Generate a simple hash-based pseudo-embedding from keywords
      const embedding = generateSimpleEmbedding(keywords + " " + chunks[i].slice(0, 500));

      await supabase.from("rag_documents").insert({
        filename,
        content: chunks[i],
        chunk_index: i,
        embedding: embedding,
        metadata: { keywords },
      });
      embedded++;
    }

    return new Response(
      JSON.stringify({ success: true, chunks: embedded, total: chunks.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("rag-embed error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Generate a deterministic 768-dim embedding from text using character-level hashing
function generateSimpleEmbedding(text: string): number[] {
  const dim = 768;
  const vec = new Array(dim).fill(0);
  const normalized = text.toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    const idx = (code * (i + 1) * 31) % dim;
    vec[idx] += 1;
  }
  // Normalize
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / mag);
}
