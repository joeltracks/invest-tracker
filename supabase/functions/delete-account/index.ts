import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

// Service credentials stay in the Edge Function. Never return them to a client.
Deno.serve(async (request: Request) => {
  const allowed = Deno.env.get('ALLOWED_ORIGIN')
  const origin = request.headers.get('Origin')
  const headers = { 'Access-Control-Allow-Origin': allowed ?? '', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Content-Type': 'application/json' }
  const respond = (status: number, error?: string) => new Response(JSON.stringify(error ? {error} : {deleted:true}), {status,headers})
  if (!allowed || origin !== allowed) return respond(403,'Origin is not configured for account deletion.')
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers})
  if (request.method !== 'POST') return respond(405,'Use POST.')
  try {
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')
    if (!token) return respond(401,'Sign in first.')
    const client = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
    const {data:{user},error} = await client.auth.getUser(token)
    if (error || !user) return respond(401,'Sign in again before deleting your account.')
    const body = await request.json()
    if (body.confirmation !== 'DELETE') return respond(400,'Type DELETE to confirm.')
    // Only inspect claims after the token has been validated by Supabase Auth.
    const payload = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length/4)*4,'=')))
    const recent = Math.max(0,...(claims.amr??[]).map((a:{timestamp:number})=>Number(a.timestamp)||0))
    if (Date.now()/1000-recent>300) return respond(403,'Sign in again or verify MFA, then delete within five minutes.')
    const factors = await client.auth.admin.mfa.listFactors({userId:user.id})
    if (factors.error) return respond(500,'Could not check account security. Retry later.')
    if (factors.data.factors.some(f=>f.status==='verified') && claims.aal !== 'aal2') return respond(403,'Verify your authenticator before deleting your account.')
    const deletion = await client.auth.admin.deleteUser(user.id, false)
    if (deletion.error) return respond(500,'Account deletion failed. Retry or contact your administrator. Storage objects owned by this user must be removed first if your project uses Storage.')
    return respond(200)
  } catch { return respond(400,'Unable to process account deletion.') }
})
