-- Existing JWTs remain valid until expiration. Enforce current membership state
-- at the database boundary so suspended/former users lose access immediately.
create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.member_profiles mp
    where mp.id=auth.uid() and mp.status='active'
  );
$$;
revoke all on function public.is_active_member() from public, anon;
grant execute on function public.is_active_member() to authenticated;

create or replace function public.can_access_club_workspace()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.member_profiles mp
    where mp.id=auth.uid() and mp.status='active' and not mp.must_change_password
  );
$$;
revoke all on function public.can_access_club_workspace() from public, anon;
grant execute on function public.can_access_club_workspace() to authenticated;

create or replace function public.has_club_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.can_access_club_workspace() and exists (
    select 1
    from public.role_assignments ra
    join public.club_terms ct on ct.id=ra.term_id and ct.is_current
    where ra.member_id=auth.uid() and ra.role=any(allowed_roles)
      and ra.starts_at<=now() and (ra.ends_at is null or ra.ends_at>now())
  );
$$;
revoke all on function public.has_club_role(text[]) from public, anon;
grant execute on function public.has_club_role(text[]) to authenticated;

-- Restrictive policies compose with each table's existing role/ownership rules.
-- Service-role Edge Functions and trusted SECURITY DEFINER workflows retain
-- their existing server-side access.
do $$
declare tab text;
begin
  foreach tab in array array[
    'club_terms','member_profiles','member_status_history','member_profile_history',
    'role_assignments','role_assignment_history','events','attendance_sessions',
    'attendance_records','attendance_correction_history','attendance_qr_tokens',
    'payment_expectations','financial_transactions','point_transactions','tasks',
    'task_assignments','announcements','member_ideas','inventory_items',
    'inventory_movements','notifications','audit_log','member_cases',
    'member_case_history','notification_preferences','financial_period_closures',
    'member_idea_review_history','purchase_requests','financial_reconciliations',
    'member_communication_threads','member_communication_messages'
  ] loop
    if tab in ('club_terms','member_profiles','role_assignments') then
      -- These self-scoped rows are the minimum AuthGate needs to detect a
      -- temporary-password account and render its mandatory change-password flow.
      execute format(
        'create policy "active members only" on public.%I as restrictive for all to authenticated using (public.is_active_member()) with check (public.is_active_member())',
        tab
      );
    else
      execute format(
        'create policy "active members only" on public.%I as restrictive for all to authenticated using (public.can_access_club_workspace()) with check (public.can_access_club_workspace())',
        tab
      );
    end if;
  end loop;
end;
$$;
