-- Notify the club when a published event is created or its visible details change.
create or replace function public.notify_members_of_published_event()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare should_notify boolean := false; notice_title text;
begin
  if tg_op='INSERT' and new.status='published' then
    should_notify := true;
    notice_title := 'New BAC event';
  elsif tg_op='UPDATE' then
    if new.status='published' and old.status is distinct from 'published' then
      should_notify := true;
      notice_title := 'New BAC event';
    elsif new.status='cancelled' and old.status in ('published','in_progress') then
      should_notify := true;
      notice_title := 'BAC event cancelled';
    elsif new.status in ('published','in_progress') and old.status in ('published','in_progress')
       and (new.title,new.description,new.event_type,new.starts_at,new.ends_at,new.location,new.expected_contribution_minor)
       is distinct from (old.title,old.description,old.event_type,old.starts_at,old.ends_at,old.location,old.expected_contribution_minor) then
      should_notify := true;
      notice_title := 'BAC event updated';
    end if;
  end if;
  if should_notify then
    insert into public.notifications(recipient_id,title,body,category,target_path)
      select mp.id,notice_title,new.title,case when notice_title='BAC event cancelled' then 'event_alert' else 'event' end,'/calendar'
      from public.member_profiles mp where mp.status='active';
  end if;
  return new;
end; $$;
revoke all on function public.notify_members_of_published_event() from public;
drop trigger if exists notify_published_event on public.events;
create trigger notify_published_event
  after insert or update of status,title,description,event_type,starts_at,ends_at,location,expected_contribution_minor on public.events
  for each row execute function public.notify_members_of_published_event();
