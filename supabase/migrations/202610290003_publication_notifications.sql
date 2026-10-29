-- Create durable in-app alerts when club news or an event is first published.
create index if not exists notifications_recipient_created_idx
  on public.notifications(recipient_id,created_at desc);

create or replace function public.notify_members_of_published_event()
returns trigger language plpgsql security definer set search_path = public
as $$
declare should_notify boolean := false;
begin
  if new.status='published' then
    if tg_op='INSERT' then should_notify := true;
    elsif old.status is distinct from 'published' then should_notify := true;
    end if;
  end if;
  if should_notify then
    insert into public.notifications(recipient_id,title,body,category,target_path)
      select mp.id,'New BAC event',new.title,'event','/calendar'
      from public.member_profiles mp where mp.status='active';
  end if;
  return new;
end; $$;
revoke all on function public.notify_members_of_published_event() from public;
create trigger notify_published_event after insert or update of status on public.events
for each row execute function public.notify_members_of_published_event();

create or replace function public.notify_members_of_published_news()
returns trigger language plpgsql security definer set search_path = public
as $$
declare should_notify boolean := false;
begin
  if new.published_at is not null and new.audience='members' then
    if tg_op='INSERT' then should_notify := true;
    elsif old.published_at is null or old.audience is distinct from 'members' then should_notify := true;
    end if;
  end if;
  if should_notify then
    insert into public.notifications(recipient_id,title,body,category,target_path)
      select mp.id,'BAC club update',new.title,'news','/communications'
      from public.member_profiles mp where mp.status='active';
  end if;
  return new;
end; $$;
revoke all on function public.notify_members_of_published_news() from public;
create trigger notify_published_news after insert or update of published_at,audience on public.announcements
for each row execute function public.notify_members_of_published_news();
