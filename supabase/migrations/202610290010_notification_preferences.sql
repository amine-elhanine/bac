-- Let members mute optional updates while keeping task and HR case notices mandatory.
create table public.notification_preferences (
  member_id uuid primary key references public.member_profiles(id) on delete cascade,
  event_updates boolean not null default true,
  news_updates boolean not null default true,
  point_updates boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
grant select,insert,update on public.notification_preferences to authenticated;
create policy "members read own notification preferences" on public.notification_preferences
  for select to authenticated using (member_id=auth.uid());
create policy "members create own notification preferences" on public.notification_preferences
  for insert to authenticated with check (member_id=auth.uid());
create policy "members update own notification preferences" on public.notification_preferences
  for update to authenticated using (member_id=auth.uid()) with check (member_id=auth.uid());

create or replace function public.apply_notification_preferences()
returns trigger language plpgsql security definer set search_path = public
as $$
declare muted boolean;
begin
  select case new.category
    when 'event' then not event_updates
    when 'news' then not news_updates
    when 'points' then not point_updates
    else false
  end into muted
  from public.notification_preferences where member_id=new.recipient_id;
  if coalesce(muted,false) then return null; end if;
  return new;
end; $$;
revoke all on function public.apply_notification_preferences() from public;
create trigger apply_notification_preferences_before_insert
  before insert on public.notifications
  for each row execute function public.apply_notification_preferences();
