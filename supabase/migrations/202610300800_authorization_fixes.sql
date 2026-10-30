-- Authorization fixes: repair the fallout of the granular-permissions rework.
--
-- 1. Recreate RLS policies that 202610300600 dropped without replacement
--    (club_terms, notifications, audit_log, communication threads/messages).
-- 2. Re-gate has_club_role / has_club_permission on active workspace access
--    (suspended and pending-first-login accounts lose delegated powers again).
-- 3. Replace the six-shape JWT admin bypass with one documented claim
--    (app_metadata.platform_role = 'platform_admin'), honored consistently by
--    the database and the Edge Functions, and drop the fuzzy
--    display_name = 'admin' full-access match.
-- 4. Restore the last-President guard in set_member_role.

-- ─── 1. Single documented platform-admin claim ─────────────────────────────
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'platform_role', '') = 'platform_admin';
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- ─── 2. Role and permission checks ─────────────────────────────────────────
create or replace function public.has_club_role(allowed_roles text[])
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select public.is_platform_admin() or (
    public.can_access_club_workspace() and exists (
      select 1
      from public.role_assignments ra
      join public.club_terms ct on ct.id = ra.term_id and ct.is_current
      join public.club_roles cr on cr.role_key = ra.role
      where ra.member_id = auth.uid()
        and ra.starts_at <= now()
        and (ra.ends_at is null or ra.ends_at > now())
        and (
          ra.role = any (allowed_roles)
          or cr.role_key = 'admin'
          or cr.permission_roles && allowed_roles
        )
    )
  );
$$;
revoke all on function public.has_club_role(text[]) from public, anon;
grant execute on function public.has_club_role(text[]) to authenticated;

create or replace function public.has_club_permission(p_permission_key text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select public.is_platform_admin() or (
    public.can_access_club_workspace() and exists (
      select 1
      from public.role_assignments ra
      join public.club_terms ct on ct.id = ra.term_id and ct.is_current
      join public.club_roles cr on cr.role_key = ra.role
      where ra.member_id = auth.uid()
        and ra.starts_at <= now()
        and (ra.ends_at is null or ra.ends_at > now())
        and p_permission_key = any (cr.permissions)
    )
  );
$$;
revoke all on function public.has_club_permission(text) from public, anon;
grant execute on function public.has_club_permission(text) to authenticated;

-- ─── 3. Recreate the dropped policies ───────────────────────────────────────
-- club_terms: every member reads the current term; officers read the history.
drop policy if exists "read current term" on public.club_terms;
create policy "read current term" on public.club_terms for select to authenticated using (
  is_current or public.has_club_role(array['president','vice_president','hr','vice_hr','general_secretary'])
);

-- notifications: members read their own inbox and mark items read.
drop policy if exists "read own notifications" on public.notifications;
create policy "read own notifications" on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
drop policy if exists "update own notifications" on public.notifications;
create policy "update own notifications" on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- audit_log: leadership and platform admins review the trail.
drop policy if exists "leadership reads audit" on public.audit_log;
create policy "leadership reads audit" on public.audit_log for select to authenticated using (
  public.has_club_role(array['president','vice_president']) or public.has_club_permission('roles.manage')
);

-- Communication threads/messages: strictly private — the member and the
-- current holder of the targeted board role (per 202610300000).
drop policy if exists "thread member and target role holders read threads"
  on public.member_communication_threads;
create policy "thread member and target role holders read threads"
  on public.member_communication_threads for select to authenticated using (
    member_id = auth.uid()
    or (target_role is not null and public.has_club_role(array[target_role]))
  );
drop policy if exists "thread party messages follow thread visibility"
  on public.member_communication_messages;
create policy "thread party messages follow thread visibility"
  on public.member_communication_messages for select to authenticated using (
    exists (
      select 1 from public.member_communication_threads t
      where t.id = thread_id
        and (
          t.member_id = auth.uid()
          or (t.target_role is not null and public.has_club_role(array[t.target_role]))
        )
    )
  );

-- ─── 4. Last-President guard when reassigning roles ────────────────────────
create or replace function public.set_member_role(p_member_id uuid,p_new_role text,p_reason text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare current_term uuid; prior_officer_role text; existing_holder uuid; is_target_custom boolean;
begin
  if auth.uid() is null or not (public.has_club_permission('members.roles.manage') or public.has_club_permission('roles.assign_custom')) then raise exception 'Not authorized to assign club roles' using errcode='42501'; end if;
  if p_new_role is null or p_reason is null or length(trim(p_reason))<4 then raise exception 'A role and reason are required' using errcode='22023'; end if;
  select is_custom into is_target_custom from public.club_roles where role_key=p_new_role;
  if not found then raise exception 'Choose an available role' using errcode='22023'; end if;
  if (is_target_custom and not public.has_club_permission('roles.assign_custom')) or (not is_target_custom and p_new_role<>'member' and not public.has_club_permission('members.roles.manage')) then raise exception 'You are not authorized to assign this role' using errcode='42501'; end if;
  select id into current_term from public.club_terms where is_current;
  if current_term is null then raise exception 'No current club term' using errcode='23514'; end if;
  if not exists(select 1 from public.member_profiles where id=p_member_id and status='active') then raise exception 'Only active members can receive roles' using errcode='23514'; end if;
  select role into prior_officer_role from public.role_assignments where member_id=p_member_id and term_id=current_term and role<>'member' and starts_at<=now() and ends_at is null for update;
  if prior_officer_role=p_new_role then return p_new_role; end if;
  if not is_target_custom and p_new_role<>'member' then
    select member_id into existing_holder from public.role_assignments where term_id=current_term and role=p_new_role and starts_at<=now() and ends_at is null and member_id<>p_member_id for update;
    if existing_holder is not null and p_new_role<>'president' then raise exception 'That officer role is already assigned' using errcode='23505'; end if;
    if existing_holder is not null and p_new_role='president' then update public.role_assignments set ends_at=now() where member_id=existing_holder and term_id=current_term and role='president' and ends_at is null; insert into public.role_assignment_history(member_id,previous_role,new_role,reason,changed_by) values(existing_holder,'president',null,'President role transferred: '||trim(p_reason),auth.uid()); end if;
  end if;
  if prior_officer_role='president' and p_new_role<>'president' and not exists(
    select 1 from public.role_assignments ra join public.member_profiles mp on mp.id=ra.member_id
    where ra.term_id=current_term and ra.role='president' and ra.member_id<>p_member_id and ra.starts_at<=now() and ra.ends_at is null and mp.status='active'
  ) then raise exception 'Assign another active President before removing the current President' using errcode='23514'; end if;
  if prior_officer_role is not null then update public.role_assignments set ends_at=now() where member_id=p_member_id and term_id=current_term and role=prior_officer_role and ends_at is null; end if;
  if p_new_role<>'member' then insert into public.role_assignments(member_id,term_id,role,assigned_by,starts_at) values(p_member_id,current_term,p_new_role,auth.uid(),now()); end if;
  insert into public.role_assignment_history(member_id,previous_role,new_role,reason,changed_by) values(p_member_id,prior_officer_role,nullif(p_new_role,'member'),trim(p_reason),auth.uid());
  insert into public.audit_log(actor_id,action,table_name,record_id,changed_fields,reason) values(auth.uid(),'set_member_role','role_assignments',p_member_id,array['role'],trim(p_reason));
  return p_new_role;
end; $$;

revoke all on function public.set_member_role(uuid,text,text) from public,anon;
grant execute on function public.set_member_role(uuid,text,text) to authenticated;
