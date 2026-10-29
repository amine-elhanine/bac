-- Private, traceable member-to-Communications Officer conversation threads.
create table public.member_communication_threads (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles(id),
  subject text not null check (length(trim(subject)) between 2 and 140),
  status text not null default 'open' check (status in ('open','awaiting_member','closed')),
  closure_note text,
  closed_by uuid references public.member_profiles(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='closed')=(closed_by is not null and closed_at is not null and nullif(trim(closure_note),'') is not null))
);
create index member_communication_threads_member_updated_idx
  on public.member_communication_threads(member_id,updated_at desc);
create index member_communication_threads_status_updated_idx
  on public.member_communication_threads(status,updated_at desc);

create table public.member_communication_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.member_communication_threads(id) on delete cascade,
  sender_id uuid not null references public.member_profiles(id),
  sender_side text not null check (sender_side in ('member','club_team')),
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index member_communication_messages_thread_created_idx
  on public.member_communication_messages(thread_id,created_at);

alter table public.member_communication_threads enable row level security;
alter table public.member_communication_messages enable row level security;
revoke all on public.member_communication_threads,public.member_communication_messages from public,anon,authenticated;
grant select on public.member_communication_threads,public.member_communication_messages to authenticated;
create policy "members and communications officers read communication threads"
  on public.member_communication_threads for select to authenticated using (
    member_id=auth.uid()
    or public.has_club_role(array['president','vice_president','communications_officer'])
  );
create policy "thread participants read communication messages"
  on public.member_communication_messages for select to authenticated using (
    exists (
      select 1 from public.member_communication_threads thread
      where thread.id=thread_id
        and (thread.member_id=auth.uid() or public.has_club_role(array['president','vice_president','communications_officer']))
    )
  );

create trigger audit_member_communication_threads
  after insert or update on public.member_communication_threads
  for each row execute function public.audit_sensitive_row();
create trigger audit_member_communication_messages
  after insert on public.member_communication_messages
  for each row execute function public.audit_sensitive_row();

create or replace function public.start_member_communication(p_subject text,p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare thread_id uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.member_profiles where id=auth.uid() and status='active') then
    raise exception 'An active member account is required.' using errcode='42501';
  end if;
  if p_subject is null or length(trim(p_subject))<2 or length(p_subject)>140
     or p_body is null or length(trim(p_body))<1 or length(p_body)>4000 then
    raise exception 'Enter a subject and a message of up to 4,000 characters.' using errcode='22023';
  end if;

  perform set_config('app.change_reason','Member opened a Communications conversation',true);
  insert into public.member_communication_threads(member_id,subject)
    values(auth.uid(),trim(p_subject)) returning id into thread_id;
  insert into public.member_communication_messages(thread_id,sender_id,sender_side,body)
    values(thread_id,auth.uid(),'member',trim(p_body));
  insert into public.notifications(recipient_id,title,body,category,target_path)
  select officers.member_id,'New member message',trim(p_subject),'general','/communications'
  from (
    select distinct ra.member_id from public.role_assignments ra
    join public.club_terms ct on ct.id=ra.term_id and ct.is_current
    join public.member_profiles mp on mp.id=ra.member_id and mp.status='active'
    where ra.role=any(array['president','vice_president','communications_officer']::text[])
      and ra.starts_at<=now() and (ra.ends_at is null or ra.ends_at>now())
      and ra.member_id<>auth.uid()
  ) officers;
  return thread_id;
end;
$$;

create or replace function public.send_member_communication_message(p_thread_id uuid,p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  thread_row public.member_communication_threads%rowtype;
  is_member boolean;
  is_comms_officer boolean;
  new_message_id uuid;
begin
  if auth.uid() is null or p_body is null or length(trim(p_body))<1 or length(p_body)>4000 then
    raise exception 'Enter a message of up to 4,000 characters.' using errcode='22023';
  end if;
  select * into thread_row from public.member_communication_threads where id=p_thread_id for update;
  if not found then raise exception 'Conversation not found.' using errcode='P0002'; end if;
  is_member:=thread_row.member_id=auth.uid();
  is_comms_officer:=public.has_club_role(array['president','vice_president','communications_officer']);
  if not is_member and not is_comms_officer then
    raise exception 'Not authorized to reply to this conversation.' using errcode='42501';
  end if;
  if thread_row.status='closed' then raise exception 'This conversation is closed.' using errcode='23514'; end if;
  if is_member then
    perform set_config('app.change_reason','Member replied to Communications',true);
    insert into public.member_communication_messages(thread_id,sender_id,sender_side,body)
      values(p_thread_id,auth.uid(),'member',trim(p_body)) returning id into new_message_id;
    update public.member_communication_threads set status='open',updated_at=now() where id=p_thread_id;
    insert into public.notifications(recipient_id,title,body,category,target_path)
    select officers.member_id,'Member replied',thread_row.subject,'general','/communications'
    from (
      select distinct ra.member_id from public.role_assignments ra
      join public.club_terms ct on ct.id=ra.term_id and ct.is_current
      join public.member_profiles mp on mp.id=ra.member_id and mp.status='active'
      where ra.role=any(array['president','vice_president','communications_officer']::text[])
        and ra.starts_at<=now() and (ra.ends_at is null or ra.ends_at>now())
        and ra.member_id<>auth.uid()
    ) officers;
  else
    if thread_row.status<>'open' then
      raise exception 'Wait for the member to reply before sending another club response.' using errcode='23514';
    end if;
    perform set_config('app.change_reason','Communications Officer replied to member',true);
    insert into public.member_communication_messages(thread_id,sender_id,sender_side,body)
      values(p_thread_id,auth.uid(),'club_team',trim(p_body)) returning id into new_message_id;
    update public.member_communication_threads set status='awaiting_member',updated_at=now() where id=p_thread_id;
    insert into public.notifications(recipient_id,title,body,category,target_path)
      values(thread_row.member_id,'BAC replied to your message',thread_row.subject,'general','/communications');
  end if;
  return new_message_id;
end;
$$;

create or replace function public.close_member_communication(p_thread_id uuid,p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare thread_row public.member_communication_threads%rowtype;
begin
  if auth.uid() is null or not public.has_club_role(array['president','vice_president','communications_officer']) then
    raise exception 'Only the Communications team or club leadership can close conversations.' using errcode='42501';
  end if;
  if p_reason is null or length(trim(p_reason))<4 or length(p_reason)>500 then
    raise exception 'Add a closure note of at least four characters.' using errcode='22023';
  end if;
  select * into thread_row from public.member_communication_threads where id=p_thread_id for update;
  if not found then raise exception 'Conversation not found.' using errcode='P0002'; end if;
  if thread_row.status='closed' then raise exception 'This conversation is already closed.' using errcode='23514'; end if;
  perform set_config('app.change_reason',trim(p_reason),true);
  update public.member_communication_threads
    set status='closed',closure_note=trim(p_reason),closed_by=auth.uid(),closed_at=now(),updated_at=now()
    where id=p_thread_id;
  insert into public.notifications(recipient_id,title,body,category,target_path)
    values(thread_row.member_id,'Your BAC conversation was closed',thread_row.subject || ' · ' || trim(p_reason),'general','/communications');
  return p_thread_id;
end;
$$;

revoke all on function public.start_member_communication(text,text) from public,anon;
revoke all on function public.send_member_communication_message(uuid,text) from public,anon;
revoke all on function public.close_member_communication(uuid,text) from public,anon;
grant execute on function public.start_member_communication(text,text) to authenticated;
grant execute on function public.send_member_communication_message(uuid,text) to authenticated;
grant execute on function public.close_member_communication(uuid,text) to authenticated;
