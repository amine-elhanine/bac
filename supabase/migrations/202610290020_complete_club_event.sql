-- Let the event team finalize an event after it has ended and close its
-- attendance session through one reasoned, audited server action.
create or replace function public.complete_club_event(p_event_id uuid,p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_status text;
  event_end timestamptz;
begin
  if auth.uid() is null or not public.has_club_role(array['president','vice_president','hr','vice_hr']) then
    raise exception 'Not authorized to complete club events' using errcode='42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 4 or length(p_reason) > 500 then
    raise exception 'Add a completion note of at least four characters' using errcode='22023';
  end if;

  select status,coalesce(ends_at,starts_at)
    into event_status,event_end
    from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  if event_status not in ('published','in_progress') then
    raise exception 'Only a published or in-progress event can be completed' using errcode='23514';
  end if;
  if event_end > now() then
    raise exception 'The event cannot be completed before its scheduled end time' using errcode='23514';
  end if;

  perform set_config('app.change_reason',trim(p_reason),true);
  update public.attendance_sessions
    set state='finalized'
    where event_id=p_event_id and state <> 'finalized';
  update public.events
    set status='completed',updated_by=auth.uid()
    where id=p_event_id;
  return p_event_id;
end;
$$;

revoke all on function public.complete_club_event(uuid,text) from public, anon;
grant execute on function public.complete_club_event(uuid,text) to authenticated;
