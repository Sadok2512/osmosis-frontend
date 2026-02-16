import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { assistantResponse, availableCellIds } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
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
              content: `Tu es un extracteur de données. Analyse la réponse d'un assistant réseau et identifie les noms de sites ou cellules mentionnés. Tu dois matcher ces noms avec la liste de cell IDs disponibles fournie. Retourne les cell IDs correspondants via l'outil show_cells_on_map. Si aucune cellule/site n'est mentionné, retourne un tableau vide.`,
            },
            {
              role: "user",
              content: `Réponse de l'assistant:\n${assistantResponse}\n\nCell IDs disponibles (échantillon):\n${availableCellIds.join('\n')}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "show_cells_on_map",
                description: "Affiche les cellules identifiées sur la carte. Retourne les cell_ids des cellules mentionnées dans la réponse.",
                parameters: {
                  type: "object",
                  properties: {
                    cell_ids: {
                      type: "array",
                      items: { type: "string" },
                      description: "Liste des cell_ids à afficher sur la carte",
                    },
                    description: {
                      type: "string",
                      description: "Description courte de ce qui est affiché (ex: 'Top 10 pires cellules en QoE')",
                    },
                  },
                  required: ["cell_ids", "description"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "show_cells_on_map" } },
        }),
      }
    );

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ cell_ids: [], description: "" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        return new Response(
          JSON.stringify({ cell_ids: args.cell_ids || [], description: args.description || "" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch {
        // fallthrough
      }
    }

    return new Response(
      JSON.stringify({ cell_ids: [], description: "" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("qoe-map-extract error:", e);
    return new Response(
      JSON.stringify({ cell_ids: [], description: "" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
