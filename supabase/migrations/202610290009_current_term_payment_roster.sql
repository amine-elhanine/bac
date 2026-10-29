-- Generate contribution expectations only for active members of the current term.
-- Historical or unassigned profiles must not be treated as owing a current event fee.
create or replace function public.generate_event_payment_expectations(p_event_id uuid)
returns integer language plpgsql security definer set search_path = public
as $$
declare target_amount bigint; target_status text; inserted_count integer;
begin
  if auth.uid() is null or not public.has_club_role(array['president','treasurer','vice_treasurer']) then
    raise exception 'Not authorized to generate payment expectations' using errcode='42501';
  end if;

  select expected_contribution_minor,status into target_amount,target_status
    from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  if target_status not in ('published','in_progress','completed') or target_amount<=0 then
    raise exception 'The event must be published and have a positive expected contribution' using errcode='22023';
  end if;

  insert into public.payment_expectations(event_id,member_id,expected_minor)
    select p_event_id,mp.id,target_amount
    from public.member_profiles mp
    where mp.status='active'
      and exists (
        select 1
        from public.role_assignments ra
        join public.club_terms ct on ct.id=ra.term_id and ct.is_current
        where ra.member_id=mp.id
          and ra.starts_at<=now()
          and (ra.ends_at is null or ra.ends_at>now())
      )
    on conflict(event_id,member_id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end; $$;
revoke all on function public.generate_event_payment_expectations(uuid) from public;
grant execute on function public.generate_event_payment_expectations(uuid) to authenticated;
