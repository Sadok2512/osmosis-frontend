import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

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
  return chunks.filter(c => c.trim().length > 20);
}

// Extract text from PPTX (ZIP of XMLs)
async function extractPPTXText(base64Data: string): Promise<string> {
  const binary = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  const zip = await JSZip.loadAsync(binary);
  const texts: string[] = [];

  // Get slide files sorted
  const slideFiles = Object.keys(zip.files)
    .filter(name => name.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)/)?.[1] || "0");
      const nb = parseInt(b.match(/slide(\d+)/)?.[1] || "0");
      return na - nb;
    });

  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async("text");
    // Extract text between <a:t> tags
    const matches = xml.matchAll(/<a:t[^>]*>([^<]+)<\/a:t>/g);
    const slideTexts: string[] = [];
    for (const m of matches) {
      const text = m[1].trim();
      if (text) slideTexts.push(text);
    }
    if (slideTexts.length > 0) {
      const slideNum = slidePath.match(/slide(\d+)/)?.[1];
      texts.push(`[Slide ${slideNum}] ${slideTexts.join(" ")}`);
    }
  }

  // Also extract from notesSlides if available
  const noteFiles = Object.keys(zip.files)
    .filter(name => name.match(/^ppt\/notesSlides\/notesSlide\d+\.xml$/));
  
  for (const notePath of noteFiles) {
    const xml = await zip.files[notePath].async("text");
    const matches = xml.matchAll(/<a:t[^>]*>([^<]+)<\/a:t>/g);
    const noteTexts: string[] = [];
    for (const m of matches) {
      const text = m[1].trim();
      if (text && text.length > 2) noteTexts.push(text);
    }
    if (noteTexts.length > 0) {
      texts.push(`[Notes] ${noteTexts.join(" ")}`);
    }
  }

  return texts.join("\n\n");
}

// Extract text from DOCX
async function extractDOCXText(base64Data: string): Promise<string> {
  const binary = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  const zip = await JSZip.loadAsync(binary);
  const docXml = await zip.files["word/document.xml"]?.async("text");
  if (!docXml) return "";
  
  const matches = docXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g);
  const texts: string[] = [];
  for (const m of matches) {
    if (m[1]) texts.push(m[1]);
  }
  return texts.join(" ");
}

// Extract text from XLSX
async function extractXLSXText(base64Data: string): Promise<string> {
  const binary = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  const zip = await JSZip.loadAsync(binary);
  
  // Get shared strings
  const ssXml = await zip.files["xl/sharedStrings.xml"]?.async("text");
  const sharedStrings: string[] = [];
  if (ssXml) {
    const matches = ssXml.matchAll(/<t[^>]*>([^<]*)<\/t>/g);
    for (const m of matches) {
      if (m[1]) sharedStrings.push(m[1]);
    }
  }
  return sharedStrings.join(" | ");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { filename, content, base64, action } = await req.json();

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
    if (!filename) {
      throw new Error("filename is required");
    }

    // Determine text content based on file type and input
    let textContent = content || "";
    
    if (base64) {
      const ext = filename.toLowerCase().split(".").pop();
      console.log(`Processing binary file: ${filename} (ext: ${ext})`);
      
      if (ext === "pptx") {
        textContent = await extractPPTXText(base64);
      } else if (ext === "docx") {
        textContent = await extractDOCXText(base64);
      } else if (ext === "xlsx") {
        textContent = await extractXLSXText(base64);
      } else {
        throw new Error(`Format binaire non supporté: .${ext}`);
      }
      
      console.log(`Extracted ${textContent.length} chars from ${filename}`);
    }

    if (!textContent.trim()) {
      throw new Error("Aucun texte n'a pu être extrait du fichier");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Delete existing chunks for this file
    await supabase.from("rag_documents").delete().eq("filename", filename);

    const chunks = chunkText(textContent);
    let embedded = 0;

    for (let i = 0; i < chunks.length; i++) {
      // Use Lovable AI to generate keywords for embedding
      const embResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: "Tu es un extracteur de mots-clés techniques. Retourne UNIQUEMENT une liste de 20 mots-clés techniques séparés par des virgules qui résument le texte suivant. Concentre-toi sur les termes techniques, acronymes, noms propres et concepts clés. Pas d'explication.",
            },
            { role: "user", content: chunks[i].slice(0, 2000) },
          ],
        }),
      });

      let keywords = "";
      if (embResponse.ok) {
        const embData = await embResponse.json();
        keywords = embData.choices?.[0]?.message?.content || "";
      } else {
        console.error("Keyword extraction failed for chunk", i);
      }

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
      JSON.stringify({ success: true, chunks: embedded, total: chunks.length, extractedChars: textContent.length }),
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
  const mag = Math.sqrt(vec.reduce((s: number, v: number) => s + v * v, 0)) || 1;
  return vec.map((v: number) => v / mag);
}
