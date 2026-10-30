-- Platform administrators have the complete permission catalog, including future actions.
-- Admin remains a club role assignment, so unassigned accounts gain no privileges.
create or replace function public.has_club_permission(p_permission_key text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.role_assignments ra
    join public.club_terms ct on ct.id=ra.term_id and ct.is_current
    join public.club_roles cr on cr.role_key=ra.role
    where ra.member_id=auth.uid()
      and ra.starts_at<=now()
      and (ra.ends_at is null or ra.ends_at>now())
      and (
        lower(trim(cr.display_name))='admin'
        or cr.role_key='admin'
        or p_permission_key=any(cr.permissions)
      )
  );
$$;
revoke all on function public.has_club_permission(text) from public,anon;
grant execute on function public.has_club_permission(text) to authenticated;

-- Existing policies and routines that still use built-in role groups must also
-- recognize the assigned administrator role.
create or replace function public.has_club_role(allowed_roles text[])
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.role_assignments ra
    join public.club_terms ct on ct.id=ra.term_id and ct.is_current
    join public.club_roles cr on cr.role_key=ra.role
    where ra.member_id=auth.uid()
      and ra.starts_at<=now()
      and (ra.ends_at is null or ra.ends_at>now())
      and (
        lower(trim(cr.display_name))='admin'
        or cr.role_key='admin'
        or ra.role=any(allowed_roles)
        or cr.permission_roles && allowed_roles
      )
  );
$$;
revoke all on function public.has_club_role(text[]) from public,anon;
grant execute on function public.has_club_role(text[]) to authenticated;
