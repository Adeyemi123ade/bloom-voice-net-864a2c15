import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkRateLimit, clientIp } from '../_shared/rateLimit.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const allowedTypes = new Set(['signup', 'recovery', 'magiclink', 'invite', 'email_change', 'email'])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Invalid request' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }

  const email = String(body.email ?? '').trim().toLowerCase()
  const code = String(body.code ?? '').replace(/\D/g, '')
  const type = String(body.type ?? '')

  if (!email || !code || !allowedTypes.has(type)) {
    return json({ error: 'Wrong or expired code' }, 400)
  }

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey) return json({ error: 'Please try again' }, 500)

  const admin = createClient(url, serviceKey)

  // A 6-digit code has only 1,000,000 combinations. Without a cap here, an
  // attacker who can get a code sent to a victim's email (trivially true for
  // "recovery" — anyone can trigger a password-reset email) could brute-force
  // it within its 5-minute validity window. Key by email so guesses against
  // one target are capped regardless of source IP.
  const withinEmailLimit = await checkRateLimit(admin, `verify-otp-code:${type}`, email, 10, 300)
  if (!withinEmailLimit) return json({ error: 'Too many attempts. Please request a new code.' }, 429)
  const withinIpLimit = await checkRateLimit(admin, 'verify-otp-code', clientIp(req), 30, 300)
  if (!withinIpLimit) return json({ error: 'Too many attempts. Please try again later.' }, 429)

  let token = code

  if (code.length === 6) {
    const { data: alias } = await admin
      .from('auth_otp_aliases')
      .select('full_token')
      .eq('email', email)
      .eq('email_type', type)
      .eq('short_code', code)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (alias?.full_token) token = String(alias.full_token)
  }

  const authClient = createClient(url, anonKey)
  const { data, error } = await authClient.auth.verifyOtp({
    email,
    token,
    type: type as 'signup' | 'recovery' | 'magiclink' | 'invite' | 'email_change' | 'email',
  })

  if (error) return json({ error: 'Wrong or expired code' }, 400)

  await admin
    .from('auth_otp_aliases')
    .delete()
    .eq('email', email)
    .eq('email_type', type)

  return json({ session: data.session, user: data.user })
})
