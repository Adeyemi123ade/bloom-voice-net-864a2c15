// TEMPORARY: reveals LOVABLE_API_KEY once so it can be pasted into the
// Supabase Send Email Hook secret. DELETE this function immediately after use.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  const key = Deno.env.get('LOVABLE_API_KEY') ?? ''
  return new Response(JSON.stringify({ key }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
