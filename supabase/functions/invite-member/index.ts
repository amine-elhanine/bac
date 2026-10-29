import { authenticatedUser, corsPreflight, hasRole, respond, serviceClient } from '../_shared/http.ts'

const memberManagers = ['president', 'vice_president', 'hr', 'vice_hr']
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (request) => {
  const preflight = corsPreflight(request)
  if (preflight) return preflight
  try {
    const actor = await authenticatedUser(request)
    if (!actor) return respond({ error: 'Sign in required' }, 401)
    const admin = serviceClient()
    if (!(await hasRole(admin, actor.id, memberManagers))) return respond({ error: 'Not authorized to invite members' }, 403)

    const body = await request.json().catch(() => null) as {
      email?: string; full_name?: string; member_code?: string; study_program?: string; cohort?: string; delivery_method?: 'email' | 'manual'
    } | null
    const email = body?.email?.trim().toLowerCase() ?? ''
    const fullName = body?.full_name?.trim() ?? ''
    const memberCode = body?.member_code?.trim().toUpperCase() ?? ''
    const studyProgram = body?.study_program?.trim() ?? ''
    const cohort = body?.cohort?.trim() ?? ''
    const deliveryMethod = body?.delivery_method ?? 'email'
    if (!emailPattern.test(email) || email.length > 254 || fullName.length < 2 || fullName.length > 120 || memberCode.length < 2 || memberCode.length > 32 || !/^[A-Z0-9_-]+$/.test(memberCode) || studyProgram.length > 150 || cohort.length > 80) {
      return respond({ error: 'Enter a valid email, full name, and member code.' }, 400)
    }
    if (!['email','manual'].includes(deliveryMethod)) return respond({ error: 'Choose email or manual in-person activation.' }, 400)
    const { data: term, error: termError } = await admin.from('club_terms').select('id').eq('is_current', true).maybeSingle()
    if (termError) throw termError
    if (!term) return respond({ error: 'Set the current club term before inviting members.' }, 409)

    let memberId: string
    let temporaryPassword: string | null = null
    if (deliveryMethod === 'manual') {
      const randomPasswordBytes = crypto.getRandomValues(new Uint8Array(32))
      temporaryPassword = Array.from(randomPasswordBytes,(byte)=>byte.toString(16).padStart(2,'0')).join('')
      const {data:created,error:createError}=await admin.auth.admin.createUser({
        email,password:temporaryPassword,email_confirm:true,user_metadata:{full_name:fullName},
      })
      if(createError||!created.user){
        console.warn('manual member activation failed',createError?.message)
        return respond({error:'The account could not be created. Check whether this email already has a BAC account.'},409)
      }
      memberId=created.user.id
    } else {
      const siteUrl = Deno.env.get('SITE_URL')
      const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        ...(siteUrl ? { redirectTo: siteUrl } : {}),
      })
      if (inviteError || !invitation.user) {
        console.warn('member invitation failed', inviteError?.message)
        return respond({ error: 'The invitation could not be sent. Check whether this account already exists and whether email delivery is configured.' }, 409)
      }
      memberId=invitation.user.id
    }
    const { error: profileError } = await admin.from('member_profiles').insert({
      id: memberId,
      member_code: memberCode,
      full_name: fullName,
      email,
      study_program: studyProgram || null,
      cohort: cohort || null,
      status: 'active',
      must_change_password: true,
      joined_on: new Date().toISOString().slice(0, 10),
    })
    if (profileError) {
      await admin.auth.admin.deleteUser(memberId)
      if (profileError.code === '23505') return respond({ error: 'That member code or email is already registered.' }, 409)
      throw profileError
    }

    const { error: roleError } = await admin.from('role_assignments').insert({
      member_id: memberId, term_id: term.id, role: 'member', assigned_by: actor.id,
    })
    if (roleError) {
      await admin.from('member_profiles').delete().eq('id', memberId)
      await admin.auth.admin.deleteUser(memberId)
      throw roleError
    }
    const { error: auditError } = await admin.from('audit_log').insert({
      actor_id: actor.id, action: 'invite', table_name: 'member_profiles', record_id: memberId,
      changed_fields: ['member_code','full_name','email','status','must_change_password'], reason: `${deliveryMethod === 'manual' ? 'Member activated for in-person onboarding' : 'Member invitation sent'}: ${memberCode}`,
    })
    if (auditError) {
      await admin.from('role_assignments').delete().eq('member_id', memberId).eq('term_id', term.id)
      await admin.from('member_profiles').delete().eq('id', memberId)
      await admin.auth.admin.deleteUser(memberId)
      throw auditError
    }
    return respond({ member_id: memberId, member_code: memberCode, ...(temporaryPassword ? {temporary_password:temporaryPassword} : {}) }, 201)
  } catch (error) {
    console.error('invite-member failed', error)
    return respond({ error: 'Member invitation could not be completed. Please try again or contact the platform administrator.' }, 500)
  }
})
