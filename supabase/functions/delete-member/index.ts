import { authenticatedUser, corsPreflight, hasPermission, respond, serviceClient } from '../_shared/http.ts'


// Permanently removes a member account. Only allowed for members without any
// club history — a member with attendance, finance, points, tasks, cases, or
// purchase records must instead be set to Former through the audited status
// action, because those records are retained for audit integrity.
Deno.serve(async (request) => {
  const preflight = corsPreflight(request)
  if (preflight) return preflight
  try {
    const actor = await authenticatedUser(request)
    if (!actor) return respond({ error: 'Sign in required' }, 401)
    const admin = serviceClient()
    if (!(await hasPermission(admin, actor, 'members.account.manage'))) return respond({ error: 'Not authorized to delete members' }, 403)

    const body = await request.json().catch(() => null) as { member_id?: string; reason?: string } | null
    const memberId = body?.member_id ?? ''
    const reason = body?.reason?.trim() ?? ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId)) {
      return respond({ error: 'A member is required' }, 400)
    }
    if (reason.length < 4 || reason.length > 500) {
      return respond({ error: 'Add a short reason for this deletion.' }, 400)
    }
    if (memberId === actor.id) {
      return respond({ error: 'You cannot delete your own account. Ask another officer to do it.' }, 409)
    }

    const { data: profile, error: profileError } = await admin
      .from('member_profiles').select('id,member_code,full_name,status').eq('id', memberId).maybeSingle()
    if (profileError) throw profileError
    if (!profile) return respond({ error: 'Member not found.' }, 404)

    const { data: activeRole, error: roleError } = await admin
      .from('role_assignments').select('role').eq('member_id', memberId).is('ends_at', null).limit(1)
    if (roleError) throw roleError
    if (activeRole?.length && activeRole[0].role !== 'member') {
      return respond({ error: 'Remove their officer role first (Change role → Member), then delete the account.' }, 409)
    }

    const blockers: Record<string, unknown> = {
      attendance_records: { member_id: memberId },
      financial_transactions: { member_id: memberId },
      point_transactions: { member_id: memberId },
      payment_expectations: { member_id: memberId },
      task_assignments: { member_id: memberId },
      member_cases: { submitted_by: memberId },
      inventory_movements: { member_id: memberId },
      purchase_requests: { requested_by: memberId },
      member_ideas: { submitted_by: memberId },
      member_communication_threads: { member_id: memberId },
      events: { created_by: memberId },
      tasks: { created_by: memberId },
      announcements: { created_by: memberId },
      inventory_items: { created_by: memberId },
      attendance_sessions: { created_by: memberId },
    }
    const found: string[] = []
    for (const [table, filter] of Object.entries(blockers)) {
      const { count, error: countError } = await admin
        .from(table).select('id', { count: 'exact', head: true }).match(filter as Record<string, string>)
      if (countError) throw countError
      if ((count ?? 0) > 0) found.push(table.replaceAll('_', ' '))
    }
    if (found.length) {
      return respond({
        error: `This member has club records (${found.join(', ')}), so they cannot be deleted. Set their status to Former instead — history must stay intact.`,
      }, 409)
    }

    // No history: clear the identity trail, then the profile and the login.
    const { error: historyError } = await admin
      .from('role_assignment_history').delete().eq('member_id', memberId)
    if (historyError) throw historyError
    const { error: statusHistoryError } = await admin
      .from('member_status_history').delete().eq('member_id', memberId)
    if (statusHistoryError) throw statusHistoryError
    const { error: profileHistoryError } = await admin
      .from('member_profile_history').delete().eq('member_id', memberId)
    if (profileHistoryError) throw profileHistoryError

    const { error: auditError } = await admin.from('audit_log').insert({
      actor_id: actor.id,
      action: 'delete_member',
      table_name: 'member_profiles',
      record_id: memberId,
      changed_fields: ['member_code', 'full_name', 'status'],
      reason: `${reason} (member code ${profile.member_code})`,
    })
    if (auditError) throw auditError

    const { error: deleteError } = await admin.from('member_profiles').delete().eq('id', memberId)
    if (deleteError) throw deleteError

    const { error: userError } = await admin.auth.admin.deleteUser(memberId)
    if (userError) {
      console.error('member profile deleted but auth user removal failed', userError.message)
      return respond({ error: 'The profile was deleted, but the login could not be removed. Ask the platform administrator to finish in the dashboard.' }, 500)
    }
    return respond({ deleted: true, member_code: profile.member_code })
  } catch (error) {
    console.error('delete-member failed', error)
    return respond({ error: 'Member deletion could not be completed. Please try again or contact the platform administrator.' }, 500)
  }
})
