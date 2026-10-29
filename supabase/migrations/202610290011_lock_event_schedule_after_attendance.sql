-- Keep attendance session timing consistent with its event after the desk opens.
create or replace function public.prevent_event_schedule_change_after_attendance()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at)
     and exists (select 1 from public.attendance_sessions where event_id=old.id) then
    raise exception 'Event date and time cannot be changed after attendance has been opened.'
      using errcode='23514';
  end if;
  return new;
end; $$;
revoke all on function public.prevent_event_schedule_change_after_attendance() from public;

create trigger prevent_event_schedule_change_after_attendance
  before update of starts_at,ends_at on public.events
  for each row execute function public.prevent_event_schedule_change_after_attendance();
