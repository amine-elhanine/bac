-- Prevent duplicate or excess fixed-event contributions while retaining
-- partial payments and correction-by-reversal.
create or replace function public.require_attendee_for_event_contribution()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_contribution bigint;
  remaining_due bigint;
  attendance_is_eligible boolean;
begin
  if new.transaction_type <> 'contribution' or new.event_id is null then
    return new;
  end if;

  select expected_contribution_minor
    into event_contribution
    from public.events
    where id=new.event_id
    for share;
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

  select pe.attendance_eligible into attendance_is_eligible
    from public.payment_expectations pe
    where pe.event_id=new.event_id and pe.member_id=new.member_id
    for update;
  if not found or not attendance_is_eligible then
    raise exception 'Sync attendance and select a recorded attendee before posting a fixed event contribution.'
      using errcode='23514';
  end if;
  perform 1 from public.attendance_sessions s
    join public.attendance_records ar on ar.session_id=s.id
    where s.event_id=new.event_id and ar.member_id=new.member_id and ar.status='present'
    for update of ar;
  if not found then
    raise exception 'This member is no longer recorded as present for the event.' using errcode='23514';
  end if;

  select due_minor into remaining_due
    from public.event_payment_reconciliation
    where event_id=new.event_id and member_id=new.member_id;
  if not found or remaining_due<=0 then
    raise exception 'This attendee has no outstanding contribution balance.' using errcode='23514';
  end if;
  if new.amount_minor>remaining_due then
    raise exception 'The payment exceeds this attendee’s remaining contribution balance.' using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function public.require_attendee_for_event_contribution() from public,anon,authenticated;
