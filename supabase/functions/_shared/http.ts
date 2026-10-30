import { createClient, type User } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Server configuration is incomplete')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function authenticatedUser(request: Request): Promise<User | null> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !key) throw new Error('Server configuration is incomplete')
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser(authHeader.slice(7))
  if (error) return null
  return data.user
}

export async function hasRole(
  admin: ReturnType<typeof serviceClient>,
  userId: string,
  roles: string[],
) {
  const { data: profile, error: profileError } = await admin
    .from('member_profiles')
    .select('status,must_change_password')
    .eq('id', userId)
    .maybeSingle()
  if (profileError) throw new Error('Unable to verify member status')
  if (!profile || profile.status !== 'active' || profile.must_change_password) return false

  const { data, error } = await admin
    .from('role_assignments')
    .select('id,role,club_roles!role_assignments_role_fkey(permission_roles), club_terms!inner(is_current)')
    .eq('member_id', userId)
    .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
    .lte('starts_at', new Date().toISOString())
    .eq('club_terms.is_current', true)
  if (error) throw new Error('Unable to verify club role')
  return Boolean(data?.some((assignment) => {
    const customRole = assignment.club_roles as unknown as { permission_roles?: string[] } | null
    return roles.includes(assignment.role) || (customRole?.permission_roles ?? []).some((permission) => roles.includes(permission))
  }))
}

export async function hasPermission(
  admin: ReturnType<typeof serviceClient>,
  userId: string,
  permissionKey: string,
) {
  const { data: profile, error: profileError } = await admin
    .from('member_profiles')
    .select('status,must_change_password')
    .eq('id', userId)
    .maybeSingle()
  if (profileError) throw new Error('Unable to verify member status')
  if (!profile || profile.status !== 'active' || profile.must_change_password) return false

  const { data, error } = await admin
    .from('role_assignments')
    .select('club_roles!role_assignments_role_fkey(permissions),club_terms!inner(is_current)')
    .eq('member_id', userId)
    .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
    .lte('starts_at', new Date().toISOString())
    .eq('club_terms.is_current', true)
  if (error) throw new Error('Unable to verify club permission')
  return Boolean(data?.some((assignment) => {
    const role = assignment.club_roles as unknown as { permissions?: string[] } | null
    return (role?.permissions ?? []).includes(permissionKey)
  }))
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function corsPreflight(request: Request) {
  if (request.method === 'OPTIONS') return respond({}, 200)
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405)
  return null
}
