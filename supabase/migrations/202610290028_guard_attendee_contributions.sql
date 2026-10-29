-- Fixed event contributions can only be posted against the Treasurer's
-- attendance-eligible reconciliation rows.
create or replace function public.require_attendee_for_event_contribution()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare event_contribution bigint;
begin
  if new.transaction_type <> 'contribution' or new.event_id is null then
    return new;
  end if;

  select expected_contribution_minor
    into event_contribution
    from public.events
    where id=new.event_id;
  if not found or coalesce(event_contribution,0)<=0 then
    return new;
  end if;

  if new.member_id is null or not exists (
    select 1 from public.payment_expectations pe
    where pe.event_id=new.event_id
      and pe.member_id=new.member_id
      and pe.attendance_eligible=true
      and exists (
        select 1 from public.attendance_sessions s
        join public.attendance_records ar on ar.session_id=s.id
        where s.event_id=new.event_id
          and ar.member_id=new.member_id
          and ar.status='present'
      )
  ) then
    raise exception 'Sync attendance and select a recorded attendee before posting a fixed event contribution.'
      using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function public.require_attendee_for_event_contribution() from public,anon,authenticated;
create trigger require_attendee_for_event_contribution_before_insert
  before insert on public.financial_transactions
  for each row execute function public.require_attendee_for_event_contribution();
