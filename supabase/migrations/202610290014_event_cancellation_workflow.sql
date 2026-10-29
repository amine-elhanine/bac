-- Make cancellation an audited, reasoned action rather than a direct status edit.
alter table public.events
  add column cancellation_reason text,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.member_profiles(id),
  add constraint events_cancellation_fields_match_status check (
    (status='cancelled'
      and nullif(trim(cancellation_reason),'') is not null
      and cancelled_at is not null and cancelled_by is not null)
    or (status<>'cancelled'
      and cancellation_reason is null and cancelled_at is null and cancelled_by is null)
  );

-- Client event editors may change calendar details only. Creation, cancellation,
-- and event-fee changes go through role-checked server functions.
revoke update on public.events from authenticated;
grant update(title,description,event_type,starts_at,ends_at,location)
  on public.events to authenticated;
revoke insert on public.events from authenticated;

create or replace function public.touch_event_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp
as $$ begin new.updated_at:=now(); return new; end; $$;
revoke all on function public.touch_event_updated_at() from public;
create trigger touch_event_updated_at_before_update
  before update on public.events
  for each row execute function public.touch_event_updated_at();

create or replace function public.create_club_event(
  p_title text,p_description text,p_event_type text,p_starts_at timestamptz,
  p_location text,p_expected_contribution_minor bigint
)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare event_id uuid;
begin
  if auth.uid() is null or not public.has_club_role(array['president','vice_president','hr','vice_hr']) then
    raise exception 'Not authorized to create club events' using errcode='42501';
  end if;
  if p_title is null or length(trim(p_title))<2 or length(p_title)>120
     or length(coalesce(p_description,''))>1500
     or p_event_type is null or p_event_type not in ('meeting','event','workshop','caravan','other')
     or p_starts_at is null or length(coalesce(p_location,''))>160
     or p_expected_contribution_minor is null or p_expected_contribution_minor<0 then
    raise exception 'Event details or contribution are invalid' using errcode='22023';
  end if;
  if p_expected_contribution_minor>0 and not public.has_club_role(array['president','treasurer','vice_treasurer']) then
    raise exception 'Only the President or Treasury team can set an event contribution' using errcode='42501';
  end if;
  perform set_config('app.change_reason','Event created by an authorized officer',true);
  insert into public.events(title,description,event_type,starts_at,location,status,expected_contribution_minor,created_by,updated_by)
    values(trim(p_title),coalesce(trim(p_description),''),p_event_type,p_starts_at,nullif(trim(coalesce(p_location,'')),''),'published',p_expected_contribution_minor,auth.uid(),auth.uid())
    returning id into event_id;
  return event_id;
end; $$;
revoke all on function public.create_club_event(text,text,text,timestamptz,text,bigint) from public;
grant execute on function public.create_club_event(text,text,text,timestamptz,text,bigint) to authenticated;

create or replace function public.set_event_contribution(p_event_id uuid,p_expected_minor bigint,p_reason text)
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare current_status text; updated_expectations integer;
begin
  if auth.uid() is null or not public.has_club_role(array['president','treasurer','vice_treasurer']) then
    raise exception 'Not authorized to manage event contributions' using errcode='42501';
  end if;
  if p_expected_minor is null or p_expected_minor<0 or p_reason is null or length(trim(p_reason))<4 or length(p_reason)>500 then
    raise exception 'Enter a non-negative contribution and a reason of at least four characters' using errcode='22023';
  end if;
  select status into current_status from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  if current_status not in ('published','in_progress') then
    raise exception 'Only published or in-progress events can have contribution changes' using errcode='23514';
  end if;
  perform set_config('app.change_reason',trim(p_reason),true);
  update public.events set expected_contribution_minor=p_expected_minor,updated_by=auth.uid() where id=p_event_id;
  update public.payment_expectations
    set expected_minor=p_expected_minor,waiver_minor=least(waiver_minor,p_expected_minor)
    where event_id=p_event_id;
  get diagnostics updated_expectations = row_count;
  return updated_expectations;
end; $$;
revoke all on function public.set_event_contribution(uuid,bigint,text) from public;
grant execute on function public.set_event_contribution(uuid,bigint,text) to authenticated;

create or replace function public.cancel_club_event(p_event_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare event_status text;
begin
  if auth.uid() is null or not public.has_club_role(array['president','vice_president','hr','vice_hr']) then
    raise exception 'Not authorized to cancel club events' using errcode='42501';
  end if;
  if p_reason is null or length(trim(p_reason))<4 or length(p_reason)>500 then
    raise exception 'Add a cancellation reason of at least four characters.' using errcode='22023';
  end if;
  select status into event_status from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  if event_status not in ('published','in_progress') then
    raise exception 'Only a published or in-progress event can be cancelled.' using errcode='23514';
  end if;
  perform set_config('app.change_reason',trim(p_reason),true);
  update public.events set status='cancelled',cancellation_reason=trim(p_reason),
    cancelled_at=now(),cancelled_by=auth.uid(),updated_by=auth.uid()
    where id=p_event_id;
  update public.attendance_sessions set state='closed' where event_id=p_event_id and state='open';
  return p_event_id;
end; $$;
revoke all on function public.cancel_club_event(uuid,text) from public;
grant execute on function public.cancel_club_event(uuid,text) to authenticated;
