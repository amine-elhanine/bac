-- Contribution expectations belong only to members recorded as present.
alter table public.payment_expectations
  add column attendance_eligible boolean not null default false,
  add column updated_by uuid references public.member_profiles(id);

-- Preserve existing paid and attended contributions when upgrading a project.
select set_config('app.change_reason','Backfilled contribution eligibility from recorded attendance',true);
update public.payment_expectations pe
  set attendance_eligible=true
  from public.attendance_sessions s
  join public.attendance_records ar on ar.session_id=s.id and ar.status='present'
  where pe.event_id=s.event_id
    and pe.member_id=ar.member_id
    and pe.attendance_eligible=false;

create or replace view public.event_payment_reconciliation with (security_invoker = true) as
select pe.event_id,pe.member_id,pe.expected_minor,pe.waiver_minor,pe.waiver_reason,
  coalesce(sum(case when ft.direction='in' then ft.amount_minor else -ft.amount_minor end) filter(where ft.id is not null),0)::bigint as received_minor,
  greatest(pe.expected_minor-pe.waiver_minor-coalesce(sum(case when ft.direction='in' then ft.amount_minor else -ft.amount_minor end) filter(where ft.id is not null),0),0)::bigint as due_minor,
  case when coalesce(sum(case when ft.direction='in' then ft.amount_minor else -ft.amount_minor end) filter(where ft.id is not null),0) >= pe.expected_minor-pe.waiver_minor then 'paid'
       when coalesce(sum(case when ft.direction='in' then ft.amount_minor else -ft.amount_minor end) filter(where ft.id is not null),0) > 0 then 'partial'
       when pe.waiver_minor >= pe.expected_minor then 'waived' else 'due' end as payment_status
from public.payment_expectations pe
left join public.financial_transactions ft on ft.event_id=pe.event_id and ft.member_id=pe.member_id and ft.status='posted' and ft.transaction_type in ('contribution','reversal')
where pe.attendance_eligible=true
group by pe.event_id,pe.member_id,pe.expected_minor,pe.waiver_minor,pe.waiver_reason;

create or replace function public.generate_event_payment_expectations(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_amount bigint;
  target_status text;
  attendee_count integer := 0;
begin
  if auth.uid() is null or not public.has_club_role(array['president','treasurer','vice_treasurer']) then
    raise exception 'Not authorized to generate payment expectations' using errcode='42501';
  end if;

  select expected_contribution_minor,status
    into target_amount,target_status
    from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  if target_status not in ('published','in_progress','completed') or target_amount<=0 then
    raise exception 'The event must be published and have a positive expected contribution' using errcode='22023';
  end if;
  if not exists(select 1 from public.attendance_sessions where event_id=p_event_id) then
    raise exception 'An attendance session must exist before syncing contribution expectations' using errcode='23514';
  end if;

  perform set_config('app.change_reason','Treasury refreshed contribution eligibility from present attendance',true);

  update public.payment_expectations pe
    set attendance_eligible=false,updated_by=auth.uid()
    where pe.event_id=p_event_id and pe.attendance_eligible=true
      and not exists (
        select 1 from public.attendance_sessions s
        join public.attendance_records ar on ar.session_id=s.id
        where s.event_id=p_event_id and ar.member_id=pe.member_id and ar.status='present'
      );
  insert into public.payment_expectations(event_id,member_id,expected_minor,attendance_eligible,updated_by)
    select p_event_id,ar.member_id,target_amount,true,auth.uid()
    from public.attendance_sessions s
    join public.attendance_records ar on ar.session_id=s.id and ar.status='present'
    where s.event_id=p_event_id
    on conflict(event_id,member_id) do update
      set expected_minor=excluded.expected_minor,
          attendance_eligible=true,
          updated_by=auth.uid()
      where payment_expectations.expected_minor is distinct from excluded.expected_minor
         or payment_expectations.attendance_eligible is distinct from true;
  select count(distinct ar.member_id)::integer into attendee_count
    from public.attendance_sessions s
    join public.attendance_records ar on ar.session_id=s.id and ar.status='present'
    where s.event_id=p_event_id;
  return attendee_count;
end;
$$;

revoke all on function public.generate_event_payment_expectations(uuid) from public,anon;
grant execute on function public.generate_event_payment_expectations(uuid) to authenticated;
